import React, { useState } from 'react';
import { Calendar, Sparkles } from 'lucide-react';
import Modal from './Modal';
import Mascot from './Mascot';

// "YYYY-MM-DD" in the student's local calendar (toISOString would use UTC and can be a day off)
const toDateInputValue = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function StudyPlanModal({ isOpen, onClose, documentTitle, topics = [] }) {
  const [examDate, setExamDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return toDateInputValue(d);
  });
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [plan, setPlan] = useState(null);

  const handleGeneratePlan = (e) => {
    e.preventDefault();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [year, month, day] = examDate.split('-').map(Number);
    const target = new Date(year, month - 1, day);
    const daysLeft = Math.max(1, Math.round((target - today) / (1000 * 60 * 60 * 24)));

    const daysPlan = [];
    for (let dayNum = 1; dayNum <= daysLeft; dayNum++) {
      if (dayNum === 1) {
        daysPlan.push({
          day: 1,
          title: 'Introduction & Core Foundation',
          tasks: [
            'Read the Detailed summary of the module.',
            'Review the first set of Key Terms.',
            `Spend ${hoursPerDay} ${hoursPerDay === 1 ? 'hour' : 'hours'} understanding the main concepts.`,
          ],
        });
      } else if (dayNum === daysLeft) {
        daysPlan.push({
          day: daysLeft,
          title: 'Final Review & Rest (Exam Eve)',
          tasks: [
            'Do a quick scan of the Brief summary.',
            'Review difficult flashcards in your due queue.',
            'Get a full night of sleep so recall stays sharp.',
          ],
        });
      } else if (dayNum === daysLeft - 1) {
        daysPlan.push({
          day: dayNum,
          title: 'Mock Exam & Weak-Spot Drill',
          tasks: [
            'Take a Weak-Spot Quiz on your lowest-scoring topics.',
            'Practice in Timed Exam Mode to build pacing.',
            'Read the source explanation for every missed question.',
          ],
        });
      } else {
        daysPlan.push({
          day: dayNum,
          title: `Deep Study — Day ${dayNum}`,
          tasks: [
            'Clear due flashcards in your spaced repetition queue.',
            'Take a 10-question quiz at Medium or Hard difficulty.',
            'Use Ask Kabisado to clarify confusing sections.',
          ],
        });
      }
    }

    const lastStudyDay = Math.max(1, daysLeft - 2);
    const studyDays = daysPlan.filter((d) => d.day <= lastStudyDay);
    const topicTitles = topics.map((t) => t.title);
    studyDays.forEach((d, i) => {
      const start = Math.floor((i * topicTitles.length) / studyDays.length);
      const end = Math.floor(((i + 1) * topicTitles.length) / studyDays.length);
      const focus = topicTitles.slice(start, end);
      if (focus.length) d.tasks.unshift(`Focus topics: ${focus.join('; ')}`);
    });

    setPlan({
      daysLeft,
      hoursPerDay,
      totalHours: daysLeft * hoursPerDay,
      itinerary: daysPlan,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Study Plan by Exam Date"
      subtitle={`Day-by-day roadmap for ${documentTitle || 'this module'}`}
      icon={
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-900">
          <Calendar className="w-4 h-4" />
        </span>
      }
      maxWidth="max-w-2xl"
    >
      {!plan ? (
        <form onSubmit={handleGeneratePlan} className="space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center gap-3">
            <Mascot mood="studying" size="sm" />
            <p className="text-xs text-slate-700 leading-relaxed">
              Choose your target exam date and daily study budget to pace every topic without last-minute cramming.
            </p>
          </div>

          <div>
            <label htmlFor="study-plan-date" className="block text-xs font-bold text-slate-700 mb-1.5">
              Target exam date
            </label>
            <input
              id="study-plan-date"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              required
              className="w-full min-h-[42px] text-sm px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-900"
            />
          </div>

          <div>
            <span className="block text-xs font-bold text-slate-700 mb-1.5">
              Daily study time
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((hr) => (
                <button
                  key={hr}
                  type="button"
                  onClick={() => setHoursPerDay(hr)}
                  className={`min-h-[42px] py-2 px-3 text-xs font-bold rounded-xl border transition ${
                    hoursPerDay === hr
                      ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {hr} {hr === 1 ? 'hr' : 'hrs'} / day
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[42px] px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition inline-flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Create Study Plan</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="bg-amber-500 text-white rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-100">
                Target Countdown
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold mt-0.5">
                {plan.daysLeft} {plan.daysLeft === 1 ? 'Day' : 'Days'} Left
              </h3>
              <p className="text-xs text-amber-100 mt-0.5">
                {plan.totalHours} total study hours ({plan.hoursPerDay} hrs/day)
              </p>
            </div>
            <Mascot mood="happy" size="md" />
          </div>

          <div className="space-y-2.5 max-h-[45dvh] overflow-y-auto pr-1">
            {plan.itinerary.map((item) => (
              <div
                key={item.day}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-900">
                  <span className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center text-xs shrink-0">
                      {item.day}
                    </span>
                    <span>{item.title}</span>
                  </span>
                  <span className="text-xs text-slate-600 shrink-0">
                    Day {item.day}/{plan.daysLeft}
                  </span>
                </div>

                <ul className="space-y-1 pl-8 text-xs text-slate-700 list-disc">
                  {item.tasks.map((task, tIdx) => (
                    <li key={tIdx} className="leading-relaxed">
                      {task}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-between items-center gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setPlan(null)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Adjust date or hours
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
