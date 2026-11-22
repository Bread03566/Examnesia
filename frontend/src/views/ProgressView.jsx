import React, { useCallback, useEffect, useState } from 'react';
import {
  Flame,
  Clock,
  Target,
  Layers,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Compass,
} from 'lucide-react';
import Mascot from '../components/Mascot';
import StatePanel from '../components/StatePanel';
import { getDashboardStats } from '../services/api';

// [[documentTitle, topics], ...] in the order documents first appear
function groupByDocument(topics) {
  const groups = new Map();
  for (const topic of topics) {
    const title = topic.document_title || 'Module';
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(topic);
  }
  return [...groups.entries()];
}

export default function ProgressView({
  documents = [],
  initialDocumentId = null,
  onStartDueCards,
  onStartWeakSpotQuiz,
  onSelectTopicQuiz,
  onGoToLibrary,
  showToast,
}) {
  const [selectedDocId, setSelectedDocId] = useState(initialDocumentId); // null = needs selection, 'all' = all modules, number = doc id
  const [pickerValue, setPickerValue] = useState(initialDocumentId || documents[0]?.id || 'all');
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(initialDocumentId));
  const [loadError, setLoadError] = useState('');

  const activeFilterDocId = selectedDocId === 'all' ? null : selectedDocId;
  const activeDoc = documents.find((d) => d.id === activeFilterDocId) || null;

  const loadDashboard = useCallback(async () => {
    if (!selectedDocId) return;
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await getDashboardStats(selectedDocId === 'all' ? null : selectedDocId);
      setStats(data);
    } catch (err) {
      const msg = err?.message || 'Could not load dashboard stats.';
      setLoadError(msg);
      showToast?.('error', msg);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDocId, showToast]);

  useEffect(() => {
    if (selectedDocId) {
      loadDashboard();
    }
  }, [selectedDocId, loadDashboard]);

  if (!selectedDocId) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-900 shrink-0">
            <BarChart3 className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">Study Progress</h1>
            <p className="text-xs sm:text-sm text-slate-600">
              Choose which handout or module you want to inspect for due flashcards, quiz accuracy, and topic mastery.
            </p>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4" aria-label="Choose handout or module for progress">
          <h2 className="text-sm sm:text-base font-bold text-slate-900">Select a handout or module</h2>
          {documents.length === 0 ? (
            <StatePanel
              variant="empty"
              title="No modules available yet"
              description="Upload or paste at least one module in your Library to track your study progress."
              actionLabel="Go to Library"
              onAction={onGoToLibrary}
            />
          ) : (
            <>
              <div className="space-y-2">
                {documents.map((d) => {
                  const currentChoice = pickerValue ?? documents[0]?.id;
                  const checked = currentChoice === d.id;
                  return (
                    <label
                      key={d.id}
                      className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border text-sm cursor-pointer transition ${
                        checked
                          ? 'bg-amber-50 border-amber-400 font-semibold text-slate-900'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="radio"
                          name="progress-module-picker"
                          checked={checked}
                          onChange={() => setPickerValue(d.id)}
                          className="h-4 w-4 accent-amber-600 shrink-0"
                        />
                        <span className="truncate" translate="no">{d.title}</span>
                      </div>
                      <span className="text-xs text-slate-500 shrink-0">
                        {d.topics_count || 1} {d.topics_count === 1 ? 'topic' : 'topics'}
                      </span>
                    </label>
                  );
                })}

                <label
                  className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border text-sm cursor-pointer transition ${
                    pickerValue === 'all'
                      ? 'bg-amber-50 border-amber-400 font-semibold text-slate-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="radio"
                      name="progress-module-picker"
                      checked={pickerValue === 'all'}
                      onChange={() => setPickerValue('all')}
                      className="h-4 w-4 accent-amber-600 shrink-0"
                    />
                    <span>All handouts &amp; modules (combined overview)</span>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">{documents.length} total</span>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedDocId(pickerValue ?? documents[0]?.id ?? 'all')}
                  className="min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 px-5 py-2 text-xs sm:text-sm font-bold text-white shadow-xs"
                >
                  <span>View Progress</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <StatePanel
          variant="loading"
          title="Loading your progress..."
          description="Calculating your study streak, due flashcards, and topic mastery."
        />
      </div>
    );
  }

  if (loadError || !stats) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <StatePanel
          variant="error"
          title="Could not load your dashboard"
          description={loadError || 'Please check your connection and try again.'}
          actionLabel="Try again"
          onAction={loadDashboard}
        />
      </div>
    );
  }

  // Actionable "What should I study today?" recommendation
  const topWeak = stats.weak_topics?.[0] || null;
  let recommendation = {
    title: 'Upload a module to begin tracking progress',
    description: 'Once you add notes and complete a quiz or flashcard session, your personalized study recommendation will appear here.',
    actionLabel: 'Go to Library',
    onAction: onGoToLibrary,
  };
  if (stats.cards_due_today > 0) {
    recommendation = {
      title: `Review ${stats.cards_due_today} due ${stats.cards_due_today === 1 ? 'flashcard' : 'flashcards'}`,
      description: 'Clearing your spaced-repetition queue today strengthens long-term memory before items fade.',
      actionLabel: 'Start due review',
      onAction: () => onStartDueCards(activeFilterDocId || stats.weak_topics?.[0]?.document_id || documents[0]?.id),
    };
  } else if (topWeak) {
    recommendation = {
      title: `Focus on "${topWeak.topic_title}"`,
      description:
        topWeak.status === 'untested'
          ? `This topic in "${topWeak.document_title}" hasn't been tested yet. Take a quick quiz to benchmark your recall.`
          : `Currently at ${topWeak.mastery_percent}% mastery in "${topWeak.document_title}". Drill this weak spot next.`,
      actionLabel: 'Practice weak topic',
      onAction: () => onSelectTopicQuiz(topWeak.document_id, topWeak.topic_id),
    };
  } else if ((stats.topic_mastery?.length || 0) > 0) {
    recommendation = {
      title: 'All caught up for today',
      description: 'No due cards and no weak topics right now. Consider a quick mixed quiz to keep your streak alive.',
      actionLabel: 'Browse Library',
      onAction: onGoToLibrary,
    };
  }

  const masteredCount = stats.topic_mastery?.filter((t) => t.status === 'mastered').length || 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Editorial Header */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Progress Overview</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setPickerValue(selectedDocId);
                setSelectedDocId(null);
              }}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
            >
              Change handout / module
            </button>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
            {activeDoc ? activeDoc.title : 'All Handouts & Modules'}
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            {activeDoc
              ? 'Tracking your due flashcards, quiz accuracy, and topic mastery for this module.'
              : 'Track your daily consistency, spaced-repetition queue, and per-topic mastery across all modules.'}
          </p>
        </div>

        <div className="hidden sm:flex shrink-0">
          <Mascot
            mood={stats.mascot_mood || 'studying'}
            size="md"
            message={stats.mascot_message}
          />
        </div>
      </section>

      {/* Recommended Next Step ("What should I study today?") */}
      <section
        aria-label="What to study today"
        className="bg-amber-500 text-white rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="space-y-1 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-100">
            <Compass className="w-3.5 h-3.5" />
            <span>What to study today</span>
          </span>
          <h2 className="text-base sm:text-lg font-extrabold">{recommendation.title}</h2>
          <p className="text-xs sm:text-sm text-amber-100 leading-relaxed">{recommendation.description}</p>
        </div>
        {recommendation.onAction && (
          <button
            type="button"
            onClick={recommendation.onAction}
            className="min-h-[42px] shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-amber-900 hover:bg-amber-50 text-xs sm:text-sm font-bold shadow-xs transition"
          >
            <span>{recommendation.actionLabel}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </section>

      {/* KPI Stats Cards */}
      <section aria-label="Key metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Streak */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex items-start justify-between gap-2">
          <div>
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Study Streak
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {stats.streak_days}
              </span>
              <span className="text-xs font-semibold text-slate-600">
                {stats.streak_days === 1 ? 'day' : 'days'}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {stats.streak_days > 0 ? 'Keep the streak going' : 'Start today'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5" />
          </div>
        </div>

        {/* Cards Due Today */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex items-start justify-between gap-2">
          <div>
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Due Cards
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {stats.cards_due_today}
              </span>
              <span className="text-xs font-semibold text-slate-500">/ {stats.total_cards}</span>
            </div>
            {stats.cards_due_today > 0 ? (
              <button
                type="button"
                onClick={() => onStartDueCards(activeFilterDocId || stats.weak_topics?.[0]?.document_id || documents[0]?.id)}
                className="text-xs text-amber-800 font-bold hover:underline inline-flex items-center gap-1 mt-1"
              >
                <span>Study now</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <p className="text-xs text-emerald-700 font-semibold inline-flex items-center gap-1 mt-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>All caught up</span>
              </p>
            )}
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Overall Accuracy */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex items-start justify-between gap-2">
          <div>
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Quiz Accuracy
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-700">
                {stats.overall_accuracy}%
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {stats.total_quizzes_taken} {stats.total_quizzes_taken === 1 ? 'quiz' : 'quizzes'} taken
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <Target className="w-5 h-5" />
          </div>
        </div>

        {/* Topics Mastered */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex items-start justify-between gap-2">
          <div>
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Topics Tracked
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {stats.topic_mastery?.length || 0}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {masteredCount} mastered
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </section>

      {/* Weak Spots Section */}
      {stats.weak_topics && stats.weak_topics.length > 0 && (
        <section aria-label="Weak topics" className="bg-rose-50/70 border border-rose-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-100 text-rose-700 rounded-xl shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-base sm:text-lg">
                  Priority Weak Topics
                </h2>
                <p className="text-xs text-rose-900">
                  Lowest mastery or untested sections across your modules.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onStartWeakSpotQuiz(stats.weak_topics[0]?.document_id)}
              className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition"
            >
              <Sparkles className="w-4 h-4" />
              <span>Start Weak-Spot Quiz</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {stats.weak_topics.slice(0, 3).map((w) => (
              <div
                key={w.topic_id}
                className="bg-white rounded-xl border border-rose-200 p-4 shadow-xs space-y-2.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                    <span className="font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full">
                      {w.status === 'untested' ? 'Untested' : `${w.mastery_percent}%`}
                    </span>
                    <span className="text-slate-600">
                      {w.correct_count}/{w.total_answered} correct
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm line-clamp-2">
                    {w.topic_title}
                  </h3>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{w.document_title}</p>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="grow-bar bg-rose-500 h-full rounded-full"
                      style={{ width: `${w.mastery_percent}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Per-Topic Mastery Breakdown */}
      <section aria-label="Mastery by topic" className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-700" />
            <span>Mastery by Topic</span>
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Computed from your quiz answers across each module.
          </p>
        </div>

        {(!stats.topic_mastery || stats.topic_mastery.length === 0) ? (
          <p className="py-6 text-center text-xs sm:text-sm text-slate-600">
            No topic data yet. Take a quiz on any module to see your mastery breakdown.
          </p>
        ) : (
          <div className="space-y-6">
            {groupByDocument(stats.topic_mastery).map(([documentTitle, docTopics]) => (
              <div key={documentTitle} className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  {documentTitle}
                </h3>
                {docTopics.map((topic) => {
                  const isMastered = topic.status === 'mastered';
                  const isReviewing = topic.status === 'reviewing';
                  const isUntested = topic.status === 'untested';

                  let badgeColor = 'bg-rose-50 text-rose-800 border-rose-200';
                  let barColor = 'bg-rose-500';
                  let label = 'Needs Review';

                  if (isMastered) {
                    badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                    barColor = 'bg-emerald-500';
                    label = 'Mastered';
                  } else if (isReviewing) {
                    badgeColor = 'bg-amber-50 text-amber-900 border-amber-200';
                    barColor = 'bg-amber-500';
                    label = 'In Progress';
                  } else if (isUntested) {
                    badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
                    barColor = 'bg-slate-300';
                    label = 'Untested';
                  }

                  return (
                    <div
                      key={topic.topic_id}
                      className="p-3.5 sm:p-4 rounded-xl bg-slate-50/70 border border-slate-200 space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm">
                            {topic.topic_title}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeColor}`}>
                            {label}
                          </span>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-600">
                          <span>{topic.correct_count}/{topic.total_answered} correct</span>
                          <span className="font-bold text-slate-900">{topic.mastery_percent}%</span>
                          <button
                            type="button"
                            onClick={() => onSelectTopicQuiz(topic.document_id, topic.topic_id)}
                            className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 hover:bg-slate-100 transition"
                          >
                            Quiz
                          </button>
                        </div>
                      </div>

                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className={`grow-bar h-full rounded-full ${barColor}`}
                          style={{ width: `${topic.mastery_percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Quiz Attempts */}
      <section aria-label="Recent quiz attempts" className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-indigo-600" />
          <span>Recent Quiz Attempts</span>
        </h2>

        {(!stats.quiz_history || stats.quiz_history.length === 0) ? (
          <p className="py-6 text-center text-xs sm:text-sm text-slate-600">
            No quizzes submitted yet. Take your first quiz on any module to start tracking history.
          </p>
        ) : (
          <div className="space-y-2.5">
            {stats.quiz_history.map((att) => (
              <div
                key={att.id}
                className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3 hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-xl font-extrabold text-xs flex items-center justify-center shrink-0 ${
                      att.percentage >= 80
                        ? 'bg-emerald-100 text-emerald-900'
                        : att.percentage >= 50
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-rose-100 text-rose-900'
                    }`}
                  >
                    {att.percentage}%
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                      {att.document_title}
                    </h3>
                    <p className="text-xs text-slate-600">
                      {att.completed_at ? new Date(att.completed_at).toLocaleDateString() : 'Recently'} · {att.difficulty}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="font-bold text-xs sm:text-sm text-slate-900 block">
                    {att.score} / {att.total_questions}
                  </span>
                  <span className="text-xs text-slate-500">Score</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
