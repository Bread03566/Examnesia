import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import exam_prep
from tests.helpers import register_user
from tests.test_api import HISTORY_TEXT


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def new_doc(client, headers, title="History"):
    res = client.post("/api/documents/text", headers=headers, json={"title": title, "text": HISTORY_TEXT})
    assert res.status_code == 201
    return res.json()


def generate(client, headers, doc, topic_id, count=3):
    res = client.post(f"/api/documents/{doc['id']}/quiz/generate", headers=headers,
                      json={"topic_id": topic_id, "count": count, "question_type": "multiple_choice"})
    assert res.status_code == 200, res.text
    return res.json()


def answer(client, headers, doc, questions, correct: bool):
    answers = []
    for q in questions:
        idx = q["correct_index"] if correct else (q["correct_index"] + 1) % len(q["choices"])
        answers.append({"question_id": q["id"], "selected_index": idx})
    res = client.post("/api/quizzes/submit", headers=headers, json={"document_id": doc["id"], "answers": answers})
    assert res.status_code == 200, res.text


# ---------------- pure scoring ----------------
def test_importance_favours_longer_topics_with_more_definitions():
    topics = [
        {"id": 1, "content": "Short note about a thing."},
        {"id": 2, "content": ("Mitosis is the division of a cell into two identical cells. "
                              "A chromosome is a structure that carries genes. "
                              "Interphase refers to the growth stage before division. " * 3)},
    ]
    scores = exam_prep.topic_importance(topics)
    assert 0 <= scores[1] <= 1 and 0 <= scores[2] <= 1
    assert scores[2] > scores[1] and scores[2] == pytest.approx(1.0)


def test_schedule_covers_every_topic_once_and_ends_with_a_review_day():
    items = [{"topic_id": i, "priority": p} for i, p in enumerate([0.9, 0.2, 0.7, 0.5, 0.1, 0.8], start=1)]
    days = exam_prep.schedule(items, days=4)
    assert len(days) == 4 and days[-1]["final_review"] is True
    work = [t["topic_id"] for d in days[:-1] for t in d["topics"]]
    assert sorted(work) == [1, 2, 3, 4, 5, 6]
    assert work[0] == 1 and work.index(6) < work.index(5)  # highest priority first


def test_one_day_plan_puts_everything_on_that_day():
    days = exam_prep.schedule([{"topic_id": 1, "priority": 0.3}, {"topic_id": 2, "priority": 0.6}], days=1)
    assert len(days) == 1 and [t["topic_id"] for t in days[0]["topics"]] == [2, 1]


# ---------------- plan endpoint ----------------
def test_plan_needs_login_and_valid_input(client):
    assert client.post("/api/exam/plan", json={"document_ids": [1], "days": 3}).status_code == 401
    headers, _, _ = register_user(client)
    assert client.post("/api/exam/plan", headers=headers, json={"document_ids": [], "days": 3}).status_code == 422
    doc = new_doc(client, headers)
    assert client.post("/api/exam/plan", headers=headers, json={"document_ids": [doc["id"]], "days": 0}).status_code == 422
    assert client.post("/api/exam/plan", headers=headers, json={"document_ids": [doc["id"]], "days": 61}).status_code == 422


def test_plan_refuses_someone_elses_module(client):
    a, _, _ = register_user(client)
    b, _, _ = register_user(client)
    doc = new_doc(client, a)
    assert client.post("/api/exam/plan", headers=b, json={"document_ids": [doc["id"]], "days": 3}).status_code == 404


def test_plan_puts_the_topic_the_student_is_failing_before_the_one_they_know(client):
    headers, _, _ = register_user(client)
    doc = new_doc(client, headers)
    weak_topic, strong_topic = doc["topics"][0], doc["topics"][1]
    answer(client, headers, doc, generate(client, headers, doc, weak_topic["id"]), correct=False)
    answer(client, headers, doc, generate(client, headers, doc, strong_topic["id"]), correct=True)

    plan = client.post("/api/exam/plan", headers=headers, json={"document_ids": [doc["id"]], "days": 3}).json()
    by_id = {t["topic_id"]: t for t in plan["topics"]}
    assert by_id[weak_topic["id"]]["status"] == "weak" and by_id[strong_topic["id"]]["status"] == "mastered"
    assert by_id[weak_topic["id"]]["priority"] > by_id[strong_topic["id"]]["priority"]
    order = [t["topic_id"] for d in plan["days"] for t in d["topics"]]
    assert order.index(weak_topic["id"]) < order.index(strong_topic["id"])
    assert len(plan["days"]) == 3 and plan["days"][-1]["final_review"] is True
    assert plan["summary"]["weak"] == 1


# ---------------- practice + submit ----------------
def test_practice_draws_only_from_my_questions_and_leans_on_weak_topics(client):
    a, _, _ = register_user(client)
    b, _, _ = register_user(client)
    doc = new_doc(client, a)
    other = new_doc(client, b, "Other")
    generate(client, b, other, other["topics"][0]["id"])
    weak = doc["topics"][0]
    answer(client, a, doc, generate(client, a, doc, weak["id"], 3), correct=False)
    generate(client, a, doc, doc["topics"][1]["id"], 3)

    res = client.post("/api/exam/practice", headers=a, json={"document_ids": [doc["id"]], "count": 5})
    assert res.status_code == 200
    questions = res.json()["questions"]
    assert 1 <= len(questions) <= 5
    assert {q["document_id"] for q in questions} == {doc["id"]}
    assert not any(q["question_type"] == "matching" for q in questions)
    assert any(q["topic_id"] == weak["id"] for q in questions)


def test_practice_with_no_questions_yet_says_so(client):
    headers, _, _ = register_user(client)
    doc = new_doc(client, headers)
    body = client.post("/api/exam/practice", headers=headers, json={"document_ids": [doc["id"]], "count": 5}).json()
    assert body["questions"] == [] and "quiz" in body["note"].lower()


def test_submit_grades_across_modules_and_reports_weakest_topics_first(client):
    headers, _, _ = register_user(client)
    d1, d2 = new_doc(client, headers, "One"), new_doc(client, headers, "Two")
    q1 = generate(client, headers, d1, d1["topics"][0]["id"], 2)
    q2 = generate(client, headers, d2, d2["topics"][0]["id"], 2)
    assert q1 and q2
    total = len(q1) + len(q2)
    before = client.get("/api/progress/dashboard", headers=headers).json()["total_quizzes_taken"]
    answers = [{"question_id": q["id"], "selected_index": q["correct_index"]} for q in q1] + \
              [{"question_id": q["id"], "selected_index": (q["correct_index"] + 1) % len(q["choices"])} for q in q2]
    res = client.post("/api/exam/submit", headers=headers, json={"answers": answers})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == total and body["score"] == len(q1)
    assert body["percentage"] == round(len(q1) / total * 100, 1)
    assert body["readiness"] == exam_prep.readiness(body["percentage"])
    assert body["topics"][0]["percentage"] <= body["topics"][-1]["percentage"]
    assert len(body["results"]) == total
    assert client.get("/api/progress/dashboard", headers=headers).json()["total_quizzes_taken"] == before + 2


def test_submit_ignores_questions_that_are_not_mine_and_rejects_an_empty_exam(client):
    a, _, _ = register_user(client)
    b, _, _ = register_user(client)
    doc_b = new_doc(client, b)
    qb = generate(client, b, doc_b, doc_b["topics"][0]["id"], 1)
    res = client.post("/api/exam/submit", headers=a, json={"answers": [{"question_id": qb[0]["id"], "selected_index": 0}]})
    assert res.status_code == 400
    assert client.post("/api/exam/submit", headers=a, json={"answers": []}).status_code in (400, 422)


RICH_BIOLOGY_TEXT = "\n\n".join(
    f"Chapter {i}: Biological System {i}\n"
    f"OrganelleA{i}: The primary energy converter inside eukaryotic cells for unit {i}.\n"
    f"OrganelleB{i}: The membrane network that folds and transports proteins in unit {i}.\n"
    f"OrganelleC{i}: The digestive compartment that breaks down cellular waste in unit {i}.\n"
    f"OrganelleD{i}: The storage sac that regulates water balance and turgor in unit {i}."
    for i in range(1, 7)
)


def test_quiz_generation_avoids_repeating_mastered_questions_and_covers_all_topics(client):
    headers, _, _ = register_user(client)
    res = client.post("/api/documents/text", headers=headers, json={"title": "Biology Full", "text": RICH_BIOLOGY_TEXT})
    assert res.status_code == 201
    doc = res.json()
    all_topic_ids = {t["id"] for t in doc["topics"]}
    assert len(all_topic_ids) == 6

    # Quiz 1: ask for 3 questions out of 6 topics
    q1 = client.post(
        f"/api/documents/{doc['id']}/quiz/generate",
        headers=headers,
        json={"count": 3, "question_type": "multiple_choice"},
    ).json()
    assert len(q1) == 3
    q1_texts = {q["question_text"] for q in q1}
    q1_topics = {q["topic_id"] for q in q1}

    # Student masters all 3 questions from Quiz 1
    answer(client, headers, doc, q1, correct=True)

    # Quiz 2: ask for 3 more questions — should cover the remaining 3 uncovered topics and NOT repeat Quiz 1
    q2 = client.post(
        f"/api/documents/{doc['id']}/quiz/generate",
        headers=headers,
        json={"count": 3, "question_type": "multiple_choice"},
    ).json()
    assert len(q2) == 3
    q2_texts = {q["question_text"] for q in q2}
    q2_topics = {q["topic_id"] for q in q2}

    assert q1_texts.isdisjoint(q2_texts), f"Repeated mastered questions: {q1_texts & q2_texts}"
    assert q1_topics | q2_topics == all_topic_ids, "Combined quizzes should cover every topic in the module"

    # Saved questions endpoint marks mastered ones and returns unmastered first without duplicates
    saved = client.get(f"/api/documents/{doc['id']}/questions", headers=headers).json()
    saved_texts = [q["question_text"] for q in saved]
    assert len(saved_texts) == len(set(saved_texts))
    mastered_flags = [q["is_mastered"] for q in saved]
    assert mastered_flags.count(True) == len(q1)
    assert mastered_flags[: len(q2)] == [False] * len(q2)


def test_practice_exam_excludes_mastered_questions_and_covers_all_selected_modules(client):
    headers, _, _ = register_user(client)
    d1 = client.post("/api/documents/text", headers=headers, json={"title": "Module Alpha", "text": RICH_BIOLOGY_TEXT}).json()
    d2 = client.post("/api/documents/text", headers=headers, json={"title": "Module Beta", "text": RICH_BIOLOGY_TEXT}).json()
    d3 = client.post("/api/documents/text", headers=headers, json={"title": "Module Gamma", "text": RICH_BIOLOGY_TEXT}).json()

    q1 = generate(client, headers, d1, d1["topics"][0]["id"], 2)
    q2 = generate(client, headers, d2, d2["topics"][0]["id"], 2)
    q3 = generate(client, headers, d3, d3["topics"][0]["id"], 2)
    assert len(q1) == 2 and len(q2) == 2 and len(q3) == 2

    # Master the first question of each module
    answer(client, headers, d1, [q1[0]], correct=True)
    answer(client, headers, d2, [q2[0]], correct=True)
    answer(client, headers, d3, [q3[0]], correct=True)
    mastered_ids = {q1[0]["id"], q2[0]["id"], q3[0]["id"]}

    # Request 3 practice questions across all 3 modules: should pick 1 unmastered from EACH module
    res = client.post(
        "/api/exam/practice",
        headers=headers,
        json={"document_ids": [d1["id"], d2["id"], d3["id"]], "count": 3},
    )
    assert res.status_code == 200
    picked = res.json()["questions"]
    assert len(picked) == 3
    assert {q["document_id"] for q in picked} == {d1["id"], d2["id"], d3["id"]}
    assert {q["id"] for q in picked}.isdisjoint(mastered_ids)
