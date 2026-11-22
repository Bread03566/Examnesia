import React, { useState } from 'react';
import { CalendarDays, GraduationCap, Loader2, ClipboardCheck, CheckCircle2, XCircle } from 'lucide-react';
import StatePanel from '../components/StatePanel';
import { getExamPlan, getExamPractice, submitExam } from '../services/api';

const STATUS_STYLE = {
  weak: 'bg-rose-50 text-rose-800 border border-rose-200',
  reviewing: 'bg-amber-50 text-amber-900 border border-amber-200',
  mastered: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  untested: 'bg-slate-100 text-slate-700 border border-slate-200',
};

function PlanDays({ plan }) {
  return (
    <ol className="space-y-3">
      {plan.days.map((d) => (
        <li key={d.day} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              Day {d.day}{d.final_review ? ' · Final review & practice exam' : ''}
            </h3>
            {d.minutes > 0 && <span className="text-xs font-medium text-slate-600">~{d.minutes} min</span>}
          </div>
          {d.topics.length === 0 ? (
            <p className="mt-2 text-xs text-slate-600">
              Flexible review day. Redo missed flashcards, retake a practice exam, or rest.
            </p>
          ) : (
            <ul className="mt-2.5 space-y-2">
              {d.topics.map((t) => (
                <li key={`${d.day}-${t.topic_id}`} className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold capitalize ${STATUS_STYLE[t.status]}`}>
                    {t.status}
                  </span>
                  <span className="font-semibold text-slate-900">{t.title}</span>
                  <span className="text-xs text-slate-600">{t.document_title} · {t.minutes} min</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

function ExamQuestionCard({ q, index, total, value, onChange }) {
  const idName = `q-${q.id}`;
  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
        <span className="font-bold text-amber-800">Question {index + 1} of {total}</span>
        <span className="truncate">{q.topic_title}</span>
      </div>
      <legend className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
        {q.question_text}
      </legend>
      {q.question_type === 'identification' ? (
        <input
          type="text"
          maxLength={300}
          value={value?.text_answer || ''}
          onChange={(e) => onChange({ text_answer: e.target.value })}
          placeholder="Type your answer..."
          aria-label={`Answer for question ${index + 1}`}
          className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
        />
      ) : (
        <div className="space-y-2">
          {q.choices.map((c, i) => {
            const selected = value?.selected_index === i;
            return (
              <label
                key={i}
                className={`flex items-start gap-3 p-3 rounded-xl border text-xs sm:text-sm cursor-pointer transition ${
                  selected
                    ? 'bg-amber-50 border-amber-500 font-semibold text-slate-900'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                }`}
              >
                <input
                  type="radio"
                  name={idName}
                  checked={selected}
                  onChange={() => onChange({ selected_index: i })}
                  className="mt-0.5 h-4 w-4 accent-amber-600 shrink-0"
                />
                <span className="leading-relaxed">{c}</span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

export default function ExamPrepView({ documents, showToast }) {
  const [selected, setSelected] = useState([]);
  const [days, setDays] = useState(7);
  const [plan, setPlan] = useState(null);
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState('');

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const run = async (label, fn) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      showToast?.('error', e.message || 'Exam Prep request failed.');
    } finally {
      setBusy('');
    }
  };

  const buildPlan = () =>
    run('plan', async () => {
      setReport(null);
      setExam(null);
      setPlan(await getExamPlan(selected, Number(days)));
    });

  const startExam = () =>
    run('exam', async () => {
      setReport(null);
      setAnswers({});
      const res = await getExamPractice(selected, 15);
      if (!res.questions.length) {
        showToast?.('error', res.note || 'No questions available yet for the selected modules.');
        setExam(null);
        return;
      }
      setExam(res.questions);
    });

  const finish = () =>
    run('submit', async () => {
      const payload = exam
        .map((q) => ({ question_id: q.id, ...(answers[q.id] || {}) }))
        .filter((a) => a.selected_index !== undefined || a.text_answer);
      if (!payload.length) {
        showToast?.('error', 'Answer at least one question before submitting.');
        return;
      }
      setReport(await submitExam(payload));
      setExam(null);
      setPlan(await getExamPlan(selected, Number(days)));
    });

  const answeredCount = exam
    ? exam.filter((q) => answers[q.id]?.selected_index !== undefined || Boolean(answers[q.id]?.text_answer?.trim())).length
    : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-900 shrink-0">
          <GraduationCap className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">Exam Prep</h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Combine multiple modules into a prioritized countdown plan and practice exam.
          </p>
        </div>
      </div>

      {/* Step 1: Module Selection */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4" aria-label="Choose modules">
        <h2 className="text-sm sm:text-base font-bold text-slate-900">1. Select modules for your exam</h2>
        {documents.length === 0 ? (
          <StatePanel
            variant="empty"
            title="No modules available yet"
            description="Upload or paste at least one module in your Library to build an exam plan."
          />
        ) : (
          <>
            <div className="space-y-2">
              {documents.map((d) => {
                const checked = selected.includes(d.id);
                return (
                  <label
                    key={d.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-sm cursor-pointer transition ${
                      checked
                        ? 'bg-amber-50 border-amber-400 font-semibold text-slate-900'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(d.id)}
                      className="h-4 w-4 accent-amber-600 shrink-0"
                    />
                    <span className="truncate" translate="no">{d.title}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700">
                <CalendarDays className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Days until exam:</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-20 min-h-[38px] rounded-xl border border-slate-300 px-2.5 py-1 text-sm text-slate-900"
                />
              </label>

              <button
                type="button"
                onClick={buildPlan}
                disabled={!selected.length || busy === 'plan' || days < 1 || days > 60}
                className="min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-xs sm:text-sm font-bold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === 'plan' && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Build Study Plan</span>
              </button>
            </div>
          </>
        )}
      </section>

      {/* Step 2: Study Plan */}
      {plan && (
        <section className="space-y-4" aria-label="Study plan">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">2. Your Study Plan</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                {plan.summary.topics} topics: {plan.summary.weak} weak, {plan.summary.reviewing} reviewing,{' '}
                {plan.summary.untested} untested, {plan.summary.mastered} mastered.
              </p>
            </div>
            <button
              type="button"
              onClick={startExam}
              disabled={busy === 'exam'}
              className="min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs sm:text-sm font-bold text-slate-900 hover:bg-slate-50 shadow-xs"
            >
              {busy === 'exam' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4 text-amber-700" />}
              <span>Start Practice Exam</span>
            </button>
          </div>
          <PlanDays plan={plan} />
        </section>
      )}

      {/* Step 3: Practice Exam */}
      {exam && (
        <section className="space-y-4" aria-label="Practice exam">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>3. Practice Exam ({exam.length} questions)</span>
              <span>{answeredCount} / {exam.length} answered</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all"
                style={{ width: `${Math.round((answeredCount / exam.length) * 100)}%` }}
              />
            </div>
          </div>

          {exam.map((q, idx) => (
            <ExamQuestionCard
              key={q.id}
              q={q}
              index={idx}
              total={exam.length}
              value={answers[q.id]}
              onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            />
          ))}

          <button
            type="button"
            onClick={finish}
            disabled={busy === 'submit'}
            className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50 shadow-xs"
          >
            {busy === 'submit' && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Submit Practice Exam</span>
          </button>
        </section>
      )}

      {/* Step 4: Exam Report */}
      {report && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4" aria-label="Exam report" role="status">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">Readiness Report</h2>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
              {report.percentage}% <span className="text-base font-bold text-amber-800">· {report.readiness}</span>
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              {report.score} of {report.total} correct. Weakest topics listed first:
            </p>
          </div>

          <ul className="divide-y divide-slate-100 text-sm">
            {report.topics.map((t) => (
              <li key={`${t.document_title}-${t.topic_title}`} className="py-2 flex items-center justify-between gap-3">
                <span className="text-slate-800">
                  <strong className="font-semibold">{t.topic_title}</strong>{' '}
                  <span className="text-xs text-slate-600">({t.document_title})</span>
                </span>
                <span className="font-bold text-slate-900 shrink-0">{t.correct}/{t.total}</span>
              </li>
            ))}
          </ul>

          <details className="text-sm pt-2 border-t border-slate-100">
            <summary className="cursor-pointer font-bold text-amber-800 hover:underline">
              Review all answers ({report.results.length})
            </summary>
            <ul className="mt-3 space-y-2.5">
              {report.results.map((r) => (
                <li
                  key={r.question_id}
                  className={`rounded-xl border p-3.5 space-y-1 ${
                    r.is_correct ? 'border-emerald-200 bg-emerald-50/70' : 'border-rose-200 bg-rose-50/70'
                  }`}
                >
                  <p className="font-semibold text-slate-900 flex items-start gap-2">
                    {r.is_correct ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span>{r.question_text}</span>
                  </p>
                  <p className="text-xs text-slate-700 pl-6">
                    Your answer: <strong>{r.your_answer || '(blank)'}</strong> · Correct: <strong>{r.correct_answer}</strong>
                  </p>
                  {!r.is_correct && r.explanation && (
                    <p className="text-xs text-slate-700 pl-6 leading-relaxed">{r.explanation}</p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}
