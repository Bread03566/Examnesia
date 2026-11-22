import datetime
import random
from collections import defaultdict
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.identity import get_current_user, get_owned_document
from app.models.models import Document, Question, QuestionAttempt, QuizAttempt, User
from app.routers.quizzes import mastered_question_ids, normalize_question_text, to_response
from app.schemas.schemas import QuestionAttemptInput
from app.services import exam_prep, grading

router = APIRouter(prefix="/api/exam", tags=["exam-prep"])


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_ids: List[int] = Field(min_length=1, max_length=10)
    days: int = Field(ge=1, le=60)


class PracticeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_ids: List[int] = Field(min_length=1, max_length=10)
    count: int = Field(default=15, ge=1, le=50)


class SubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: List[QuestionAttemptInput] = Field(min_length=1, max_length=100)


def _owned(db: Session, user: User, ids: List[int]) -> List[Document]:
    return [get_owned_document(db, user, i) for i in dict.fromkeys(ids)]


@router.post("/plan")
def make_plan(payload: PlanRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    docs = _owned(db, user, payload.document_ids)
    topics = [(t, d.title) for d in docs for t in d.topics]
    importance = exam_prep.topic_importance([{"id": t.id, "content": t.content} for t, _ in topics])
    known = exam_prep.understanding(db, user.id, [t.id for t, _ in topics])
    items = []
    for t, doc_title in topics:
        k = known.get(t.id, {"answered": 0, "percentage": 0.0, "status": "untested"})
        items.append({
            "topic_id": t.id, "document_id": t.document_id, "document_title": doc_title, "title": t.title,
            "importance": importance[t.id], "answered": k["answered"], "understanding": k["percentage"],
            "status": k["status"], "priority": exam_prep.priority(importance[t.id], k["answered"], k["percentage"]),
            "minutes": exam_prep.minutes_for(t.content),
        })
    counts = defaultdict(int)
    for i in items:
        counts[i["status"]] += 1
    return {
        "topics": sorted(items, key=lambda i: i["priority"], reverse=True),
        "days": exam_prep.schedule(items, payload.days),
        "summary": {"topics": len(items), "weak": counts["weak"], "reviewing": counts["reviewing"],
                    "untested": counts["untested"], "mastered": counts["mastered"]},
    }


@router.post("/practice")
def practice_exam(payload: PracticeRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    docs = _owned(db, user, payload.document_ids)
    doc_ids = [d.id for d in docs]
    raw_bank = (
        db.query(Question)
        .filter(Question.document_id.in_(doc_ids), Question.question_type != "matching")
        .order_by(Question.created_at.desc())
        .all()
    )
    if not raw_bank:
        return {"questions": [], "note": "No quiz questions yet for these modules. Generate a quiz first, then come back."}

    mastered_ids = mastered_question_ids(db, user.id, doc_ids)

    # Deduplicate by (document_id, topic_id, normalized question_text), keeping unmastered over mastered
    deduped_map = {}
    for q in raw_bank:
        key = (q.document_id, q.topic_id, normalize_question_text(q.question_text))
        if key not in deduped_map or (deduped_map[key].id in mastered_ids and q.id not in mastered_ids):
            deduped_map[key] = q
    bank = list(deduped_map.values())

    known = exam_prep.understanding(db, user.id, [q.topic_id for q in bank if q.topic_id])

    def weight_for(q: Question) -> float:
        return max(0.1, 1.5 - known[q.topic_id]["percentage"] / 100) if q.topic_id in known else 1.0

    def draw_stratified(questions_pool: List[Question], limit: int) -> List[Question]:
        by_doc: dict[int, List[tuple]] = defaultdict(list)
        for q in questions_pool:
            by_doc[q.document_id].append((q, weight_for(q)))
        picked: List[Question] = []
        active_docs = [d.id for d in docs if by_doc[d.id]]
        while len(picked) < limit and active_docs:
            next_active = []
            for d_id in active_docs:
                if len(picked) >= limit:
                    break
                bucket = by_doc[d_id]
                idx = random.choices(range(len(bucket)), weights=[w for _, w in bucket])[0]
                picked.append(bucket.pop(idx)[0])
                if bucket:
                    next_active.append(d_id)
            active_docs = next_active
        return picked

    unmastered = [q for q in bank if q.id not in mastered_ids]
    mastered = [q for q in bank if q.id in mastered_ids]

    chosen = draw_stratified(unmastered, payload.count)
    if len(chosen) < payload.count and mastered:
        chosen.extend(draw_stratified(mastered, payload.count - len(chosen)))

    return {"questions": [to_response(q, is_mastered=(q.id in mastered_ids)) for q in chosen], "note": ""}


@router.post("/submit")
def submit_exam(payload: SubmitRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ids = [a.question_id for a in payload.answers]
    questions = {q.id: q for q in db.query(Question).join(Document, Document.id == Question.document_id)
                 .filter(Question.id.in_(ids), Document.user_id == user.id).all()}
    answers = [a for a in payload.answers if a.question_id in questions]
    if not answers:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "None of these questions are yours.")

    now = datetime.datetime.now(datetime.timezone.utc)
    attempts = {}
    results, by_topic = [], defaultdict(lambda: {"correct": 0, "total": 0})
    for item in answers:
        q = questions[item.question_id]
        ok = grading.grade(q, item.selected_index, item.text_answer, item.matching)
        attempt = attempts.get(q.document_id)
        if attempt is None:
            attempt = attempts[q.document_id] = QuizAttempt(
                user_id=user.id, document_id=q.document_id, score=0, total_questions=0,
                difficulty="mixed", completed_at=now)
            db.add(attempt)
        attempt.total_questions += 1
        attempt.score += int(ok)
        attempt.question_attempts.append(QuestionAttempt(
            question_id=q.id, selected_index=item.selected_index if item.selected_index is not None else -1,
            response={"text_answer": item.text_answer, "matching": item.matching} if item.selected_index is None else None,
            is_correct=ok, answered_at=now))
        key = (q.topic.title if q.topic else "General", q.document.title)
        by_topic[key]["total"] += 1
        by_topic[key]["correct"] += int(ok)
        results.append({
            "question_id": q.id, "question_text": q.question_text, "is_correct": ok,
            "topic_title": key[0], "explanation": q.explanation,
            "your_answer": grading.describe_response(q, item.selected_index, item.text_answer, item.matching),
            "correct_answer": grading.describe_correct(q),
        })
    db.commit()

    total = len(answers)
    score = sum(r["is_correct"] for r in results)
    pct = round(score / total * 100, 1)
    topics = sorted(
        ({"topic_title": t, "document_title": d, "correct": v["correct"], "total": v["total"],
          "percentage": round(v["correct"] / v["total"] * 100, 1)} for (t, d), v in by_topic.items()),
        key=lambda x: x["percentage"])
    return {"score": score, "total": total, "percentage": pct, "readiness": exam_prep.readiness(pct),
            "topics": topics, "results": results}
