import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Sparkles,
  BrainCircuit,
  HelpCircle,
  Layers,
  RefreshCw,
  BookMarked,
  Calendar,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Target,
} from 'lucide-react';
import SummaryView from '../components/SummaryView';
import StudyPlanModal from '../components/StudyPlanModal';
import StatePanel from '../components/StatePanel';
import { summarizeDocument, getDocument } from '../services/api';

const SUMMARY_LENGTHS = [
  { id: 'brief', label: 'Brief', hint: 'Quick scan' },
  { id: 'standard', label: 'Standard', hint: 'Balanced' },
  { id: 'detailed', label: 'Detailed', hint: 'Deep dive' },
];

export default function DocumentView({
  documentId,
  onBack,
  onStartFlashcards,
  onStartQuiz,
  onStartChat,
  onStartWeakSpotQuiz,
  showToast,
}) {
  const [doc, setDoc] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'topics'
  const [showStudyPlanModal, setShowStudyPlanModal] = useState(false);

  // Summarizer states
  const [summaryLength, setSummaryLength] = useState('standard');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [currentSummary, setCurrentSummary] = useState('');
  const [keyTerms, setKeyTerms] = useState([]);
  const [expandedTopic, setExpandedTopic] = useState(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const loadDocumentDetails = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await getDocument(documentId);
      setDoc(data);
      if (data.summary_standard) {
        setCurrentSummary(data.summary_standard);
        setSummaryLength('standard');
      } else if (data.summary_brief) {
        setCurrentSummary(data.summary_brief);
        setSummaryLength('brief');
      } else if (data.summary_detailed) {
        setCurrentSummary(data.summary_detailed);
        setSummaryLength('detailed');
      } else {
        setCurrentSummary('');
      }
      setKeyTerms(data.key_terms || []);
    } catch (err) {
      const msg = err?.message || 'Could not load this module.';
      setLoadError(msg);
      showToast?.('error', msg);
    } finally {
      setIsLoading(false);
    }
  }, [documentId, showToast]);

  useEffect(() => {
    loadDocumentDetails();
  }, [loadDocumentDetails]);

  const handleGenerateSummary = async (length = summaryLength, force = false) => {
    setIsSummarizing(true);
    try {
      showToast?.('info', 'Generating summary and key terms...');
      const res = await summarizeDocument(documentId, length, null, force);
      setCurrentSummary(res.summary);
      setKeyTerms(res.key_terms || []);
      setSummaryLength(length);
      showToast?.('success', 'Summary and key terms are ready.');
    } catch (err) {
      showToast?.('error', err.message || 'Could not generate summary.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCopySummary = async () => {
    if (!currentSummary) return;
    try {
      await navigator.clipboard.writeText(currentSummary);
      setCopiedSummary(true);
      showToast?.('success', 'Summary copied to clipboard.');
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      showToast?.('error', 'Could not copy to clipboard.');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <StatePanel
          variant="loading"
          title="Opening your module..."
          description="Loading topics, summaries, and key terms."
        />
      </div>
    );
  }

  if (loadError || !doc) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
        <StatePanel
          variant="error"
          title="Module unavailable"
          description={loadError || 'This module could not be found.'}
          actionLabel="Back to Library"
          onAction={onBack}
        />
      </div>
    );
  }

  const wordCount = doc.raw_text?.split(/\s+/).filter(Boolean).length || 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Top Navigation & Action Bar */}
      <header className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to Library"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide ${
                  doc.file_type === 'pdf'
                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                    : doc.file_type === 'docx'
                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}
              >
                {doc.file_type === 'text' ? 'Notes' : doc.file_type}
              </span>
              <span className="text-xs text-slate-600">
                {doc.topics?.length || 0} {doc.topics?.length === 1 ? 'Topic' : 'Topics'} · {wordCount.toLocaleString()} words
              </span>
            </div>
            <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900 mt-1 leading-snug break-words">
              {doc.title}
            </h1>
          </div>
        </div>

        {/* Study Mode Triggers */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => onStartFlashcards(doc.id)}
            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs transition"
          >
            <BrainCircuit className="w-4 h-4" />
            <span>Flashcards</span>
          </button>

          <button
            type="button"
            onClick={() => onStartQuiz(doc.id)}
            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Quiz</span>
          </button>

          <button
            type="button"
            onClick={() => onStartWeakSpotQuiz(doc.id)}
            title="Take a quiz focused on your lowest-scoring topics"
            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold text-xs rounded-xl transition"
          >
            <Target className="w-4 h-4" />
            <span>Weak Spots</span>
          </button>

          <button
            type="button"
            onClick={() => onStartChat(doc.id)}
            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-xs rounded-xl transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>Ask Kabisado</span>
          </button>

          <button
            type="button"
            onClick={() => setShowStudyPlanModal(true)}
            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs rounded-xl transition"
          >
            <Calendar className="w-4 h-4" />
            <span>Study Plan</span>
          </button>
        </div>
      </header>

      {/* Tabs Switcher */}
      <div role="tablist" className="flex border-b border-slate-200 gap-1 overflow-x-auto">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'summary'}
          onClick={() => setActiveTab('summary')}
          className={`min-h-[44px] pb-2.5 pt-2 px-4 text-xs sm:text-sm font-bold border-b-2 transition inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
            activeTab === 'summary'
              ? 'border-amber-500 text-amber-900'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <BookMarked className="w-4 h-4" />
          <span>Summary & Key Terms</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'topics'}
          onClick={() => setActiveTab('topics')}
          className={`min-h-[44px] pb-2.5 pt-2 px-4 text-xs sm:text-sm font-bold border-b-2 transition inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
            activeTab === 'topics'
              ? 'border-amber-500 text-amber-900'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Topics ({doc.topics?.length || 0})</span>
        </button>
      </div>

      {/* TAB 1: SUMMARY & KEY TERMS */}
      {activeTab === 'summary' && (
        <div key="summary" className="view-enter space-y-6">
          {/* Summary Control Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Length:</span>
              <div className="inline-flex bg-slate-100 p-1 rounded-xl">
                {SUMMARY_LENGTHS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isSummarizing}
                    onClick={() => {
                      setSummaryLength(item.id);
                      handleGenerateSummary(item.id);
                    }}
                    title={item.hint}
                    className={`min-h-[34px] px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                      summaryLength === item.id
                        ? 'bg-white text-amber-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {currentSummary && (
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition"
                >
                  {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSummary ? 'Copied' : 'Copy'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleGenerateSummary(summaryLength, true)}
                disabled={isSummarizing}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSummarizing ? 'animate-spin' : ''}`} />
                <span>{isSummarizing ? 'Generating...' : 'Regenerate'}</span>
              </button>
            </div>
          </div>

          {isSummarizing ? (
            <StatePanel
              variant="loading"
              title="Generating summary..."
              description="Extracting key concepts and definitions grounded in your uploaded module."
            />
          ) : !currentSummary ? (
            <StatePanel
              variant="empty"
              icon={<BookMarked className="w-5 h-5" />}
              title="No summary generated yet"
              description="Generate a structured summary and key terms glossary directly from this module."
              actionLabel="Generate Summary & Key Terms"
              onAction={() => handleGenerateSummary('standard')}
            />
          ) : (
            <div className="space-y-6">
              <SummaryView
                key={`${summaryLength}-${currentSummary.length}`}
                summary={currentSummary}
                keyTerms={keyTerms}
                length={summaryLength}
                storageKey={`kabisado:reviewed:${documentId}:${summaryLength}`}
                onStartQuiz={() => onStartQuiz(doc.id)}
              />

              {keyTerms.length > 0 && (
                <section aria-label="Key terms" className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-slate-900 font-bold text-base sm:text-lg">
                      <Sparkles className="w-5 h-5 text-amber-700" />
                      <span>Key Terms ({keyTerms.length})</span>
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Core concepts and definitions extracted from this module.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {keyTerms.map((item, idx) => (
                      <div
                        key={`${item.term}-${idx}`}
                        className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 space-y-1.5"
                      >
                        <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-600 shrink-0" />
                          <span>{item.term}</span>
                        </h3>
                        <p className="text-xs text-slate-700 leading-relaxed pl-4">
                          {item.definition}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TOPICS / SECTIONS */}
      {activeTab === 'topics' && (
        <div key="topics" className="view-enter space-y-4">
          <p className="text-xs text-slate-600">
            Your module was segmented into {doc.topics?.length || 0} study sections. Expand any topic to review its source text or launch a focused drill.
          </p>

          <div className="space-y-3">
            {doc.topics?.map((topic, index) => {
              const isExpanded = expandedTopic === topic.id;
              const topicWords = topic.content.split(/\s+/).filter(Boolean).length;

              return (
                <div
                  key={topic.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs"
                >
                  <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedTopic(isExpanded ? null : topic.id)}
                      className="flex items-center gap-3 text-left flex-1 min-w-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    >
                      <span className="w-7 h-7 rounded-xl bg-amber-100 text-amber-900 font-bold text-xs flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                          {topic.title}
                        </h3>
                        <p className="text-xs text-slate-600">
                          {topicWords.toLocaleString()} words
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onStartFlashcards(doc.id, topic.id)}
                        className="hidden sm:inline-flex min-h-[34px] items-center gap-1 px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold rounded-lg transition"
                      >
                        <BrainCircuit className="w-3.5 h-3.5" />
                        <span>Flashcards</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onStartQuiz(doc.id, topic.id)}
                        className="hidden sm:inline-flex min-h-[34px] items-center gap-1 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold rounded-lg transition"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>Quiz</span>
                      </button>

                      <button
                        type="button"
                        aria-label={isExpanded ? `Collapse ${topic.title}` : `Expand ${topic.title}`}
                        onClick={() => setExpandedTopic(isExpanded ? null : topic.id)}
                        className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-3 border-t border-slate-100 space-y-3">
                      <div className="bg-slate-50 p-4 rounded-xl text-xs sm:text-sm text-slate-800 leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap border border-slate-200/70">
                        {topic.content}
                      </div>

                      <div className="flex items-center justify-end gap-2 sm:hidden">
                        <button
                          type="button"
                          onClick={() => onStartFlashcards(doc.id, topic.id)}
                          className="min-h-[38px] px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg"
                        >
                          Flashcards
                        </button>
                        <button
                          type="button"
                          onClick={() => onStartQuiz(doc.id, topic.id)}
                          className="min-h-[38px] px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg"
                        >
                          Quiz
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showStudyPlanModal && (
        <StudyPlanModal
          isOpen={showStudyPlanModal}
          onClose={() => setShowStudyPlanModal(false)}
          documentTitle={doc.title}
          topics={doc.topics || []}
        />
      )}
    </div>
  );
}
