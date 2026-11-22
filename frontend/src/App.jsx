import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import Navbar from './components/Navbar';
import Toast from './components/Toast';
import Companion from './components/Companion';
import StatePanel from './components/StatePanel';
import UpdateModal from './components/UpdateModal';
import UploadLibraryView from './views/UploadLibraryView';
import { useAuth } from './components/AuthGate';
import { CloudOff, Layers, ArrowRight, BookOpen, WifiOff, X } from 'lucide-react';
import { getDocuments, checkHealth } from './services/api';
import { usePetEmoji } from './components/pets';
import { isNativePlatform, isOnline, onNetworkChange, registerBackHandler } from './platform/index';
import { checkForAndroidUpdate } from './platform/updater';

const DocumentView = lazy(() => import('./views/DocumentView'));
const FlashcardStudyMode = lazy(() => import('./views/FlashcardStudyMode'));
const QuizMode = lazy(() => import('./views/QuizMode'));
const ProgressView = lazy(() => import('./views/ProgressView'));
const ChatView = lazy(() => import('./views/ChatView'));
const AdminView = lazy(() => import('./views/AdminView'));
const ExamPrepView = lazy(() => import('./views/ExamPrepView'));

const VALID_VIEWS = new Set(['library', 'dashboard', 'exam', 'admin', 'document', 'flashcards', 'quiz', 'chat']);

function parseHashRoute() {
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  const [view, docIdStr] = raw.split('/');
  return {
    view: VALID_VIEWS.has(view) ? view : 'library',
    docId: docIdStr ? Number(docIdStr) : null,
  };
}

export default function App() {
  const petEmoji = usePetEmoji();
  const { user } = useAuth();

  // The browser tab icon shows the chosen study buddy
  useEffect(() => {
    const icon = document.querySelector('link[rel="icon"]');
    if (icon) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${petEmoji}</text></svg>`;
      icon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }
  }, [petEmoji]);

  const initial = parseHashRoute();
  const [activeView, setActiveView] = useState(initial.view);
  const [documents, setDocuments] = useState([]);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [activeTopicId, setActiveTopicId] = useState(null);
  const [isDueCardsMode, setIsDueCardsMode] = useState(false);
  const [isWeakSpotQuizMode, setIsWeakSpotQuizMode] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(null);
  const [offlineNoticeDismissed, setOfflineNoticeDismissed] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(() => isOnline());
  const [updateInfo, setUpdateInfo] = useState(null);
  const [toast, setToast] = useState(null);
  const [pickerDocId, setPickerDocId] = useState(null);

  useEffect(() => onNetworkChange((connected) => setNetworkOnline(connected)), []);

  // Automatic Android APK update check on launch (native platform only)
  useEffect(() => {
    if (!isNativePlatform()) return undefined;
    let live = true;
    checkForAndroidUpdate().then((res) => {
      if (live && (res.status === 'optional_update' || res.status === 'mandatory_update')) {
        setUpdateInfo(res);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  // Android hardware Back button navigation: walk back to parent view before allowing app exit on library root
  useEffect(() => {
    return registerBackHandler(() => {
      if (['flashcards', 'quiz', 'chat'].includes(activeView)) {
        setActiveView('document');
        return true;
      }
      if (['document', 'dashboard', 'exam', 'admin'].includes(activeView)) {
        setActiveView('library');
        return true;
      }
      return false;
    });
  }, [activeView]);

  const fetchHealthAndDocs = useCallback(async () => {
    try {
      const health = await checkHealth();
      setAiConfigured(Boolean(health.ai_configured));
    } catch {
      setAiConfigured(null);
    }

    try {
      const docs = await getDocuments();
      setDocuments(docs);
      const { docId: hashDocId } = parseHashRoute();
      setCurrentDoc((prev) => {
        if (prev && docs.some((d) => d.id === prev.id)) return docs.find((d) => d.id === prev.id);
        if (hashDocId && docs.some((d) => d.id === hashDocId)) return docs.find((d) => d.id === hashDocId);
        return null;
      });
    } catch (err) {
      console.error('Could not fetch documents:', err);
    }
  }, []);

  useEffect(() => {
    fetchHealthAndDocs();
  }, [fetchHealthAndDocs]);

  // Keep URL hash in sync so browser Back/Forward works naturally
  useEffect(() => {
    const docScoped = ['document', 'flashcards', 'quiz', 'chat'].includes(activeView);
    const nextHash = docScoped && currentDoc ? `#/${activeView}/${currentDoc.id}` : `#/${activeView}`;
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', nextHash);
    }
  }, [activeView, currentDoc]);

  useEffect(() => {
    const onHashChange = () => {
      const { view, docId } = parseHashRoute();
      if (docId) {
        const found = documents.find((d) => d.id === docId);
        if (found) setCurrentDoc(found);
      }
      if (view === 'admin' && user?.role !== 'admin') {
        setActiveView('library');
        return;
      }
      setActiveView(view);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [documents, user?.role]);

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
  }, []);

  const handleSelectDoc = (doc) => {
    setCurrentDoc(doc);
    setActiveTopicId(null);
    setIsDueCardsMode(false);
    setIsWeakSpotQuizMode(false);
    setActiveView('document');
  };

  const handleStartFlashcards = (docId = null, topicId = null, dueOnly = false) => {
    if (docId) {
      const doc = documents.find((d) => d.id === docId) || currentDoc;
      if (doc) setCurrentDoc(doc);
    }
    setActiveTopicId(topicId);
    setIsDueCardsMode(dueOnly);
    setActiveView('flashcards');
  };

  const handleStartQuiz = (docId = null, topicId = null, weakSpotOnly = false) => {
    if (docId) {
      const doc = documents.find((d) => d.id === docId) || currentDoc;
      if (doc) setCurrentDoc(doc);
    }
    setActiveTopicId(topicId);
    setIsWeakSpotQuizMode(weakSpotOnly);
    setActiveView('quiz');
  };

  const handleStartChat = (docId = null) => {
    if (docId) {
      const doc = documents.find((d) => d.id === docId) || currentDoc;
      if (doc) setCurrentDoc(doc);
    }
    setActiveView('chat');
  };

  const hideCompanionOnMobile = ['chat', 'quiz', 'flashcards'].includes(activeView);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-amber-100 selection:text-amber-900">
      {/* Sticky Top Header + Compact Mobile Bottom Navigation */}
      <Navbar
        activeTab={activeView}
        onSelectTab={(tab) => {
          if (tab === 'library') {
            setCurrentDoc(null);
            setActiveView('library');
          } else if (tab === 'dashboard') {
            setActiveView('dashboard');
          } else if (tab === 'exam') {
            setActiveView('exam');
          } else if (tab === 'admin' && user?.role === 'admin') {
            setActiveView('admin');
          } else if (tab === 'document') {
            if (!currentDoc && documents.length > 0 && !pickerDocId) {
              setPickerDocId(documents[0].id);
            }
            setActiveView('document');
          }
        }}
        currentDoc={currentDoc}
      />

      {!networkOnline && (
        <div role="status" className="animate-in fade-in slide-in-from-top-2 border-b border-rose-200 bg-rose-50 text-rose-950">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-3 text-xs font-medium">
            <WifiOff className="w-4 h-4 shrink-0 text-rose-700" />
            <p className="flex-1 leading-snug">
              You&apos;re offline right now. Check your internet connection — unsent work on this screen stays here until you reconnect.
            </p>
          </div>
        </div>
      )}

      {aiConfigured === false && !offlineNoticeDismissed && (
        <div className="animate-in fade-in slide-in-from-top-2 border-b border-amber-200 bg-amber-50 text-amber-950">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-3 text-xs">
            <CloudOff className="w-4 h-4 shrink-0 text-amber-700" />
            <p className="flex-1 leading-snug">
              Offline study engine active — summaries, flashcards, quizzes, and chat are built directly from your uploaded modules without sending data to external AI.
            </p>
            <button
              type="button"
              onClick={() => setOfflineNoticeDismissed(true)}
              aria-label="Dismiss offline engine notice"
              className="min-h-[28px] min-w-[28px] inline-flex items-center justify-center rounded-lg hover:bg-amber-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area (extra bottom padding on mobile for bottom nav bar) */}
      <main className={`flex-1 ${activeView === 'chat' ? 'pb-16 md:pb-4' : 'pb-24 md:pb-16'}`}>
        <Suspense
          fallback={
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
              <StatePanel variant="loading" title="Loading view..." />
            </div>
          }
        >
        <div key={activeView} className="view-enter">
          {activeView === 'library' && (
            <UploadLibraryView
              documents={documents}
              onSelectDoc={handleSelectDoc}
              onRefreshDocs={fetchHealthAndDocs}
              showToast={showToast}
            />
          )}

          {activeView === 'dashboard' && (
            <ProgressView
              documents={documents}
              initialDocumentId={currentDoc?.id || null}
              onStartDueCards={(docId) => handleStartFlashcards(docId || currentDoc?.id, null, true)}
              onStartWeakSpotQuiz={(docId) => handleStartQuiz(docId || currentDoc?.id, null, true)}
              onSelectTopicQuiz={(docId, topicId) => handleStartQuiz(docId, topicId, false)}
              onGoToLibrary={() => {
                setCurrentDoc(null);
                setActiveView('library');
              }}
              showToast={showToast}
            />
          )}

          {activeView === 'exam' && <ExamPrepView documents={documents} showToast={showToast} />}

          {activeView === 'admin' && user?.role === 'admin' && <AdminView showToast={showToast} />}

          {activeView === 'document' && (
            currentDoc ? (
              <DocumentView
                documentId={currentDoc.id}
                onBack={() => {
                  setCurrentDoc(null);
                  setActiveView('library');
                }}
                onChangeModule={() => {
                  setPickerDocId(currentDoc.id);
                  setCurrentDoc(null);
                }}
                onStartFlashcards={(docId, topicId) => handleStartFlashcards(docId, topicId, false)}
                onStartQuiz={(docId, topicId) => handleStartQuiz(docId, topicId, false)}
                onStartChat={(docId) => handleStartChat(docId)}
                onStartWeakSpotQuiz={(docId) => handleStartQuiz(docId, null, true)}
                showToast={showToast}
              />
            ) : (
              <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-900 shrink-0">
                    <Layers className="w-5 h-5" />
                  </span>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">Study a Module</h1>
                    <p className="text-xs sm:text-sm text-slate-600">
                      Choose which handout or module from your library you want to go through.
                    </p>
                  </div>
                </div>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4" aria-label="Choose a handout or module">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">Select a handout or module</h2>
                  {documents.length === 0 ? (
                    <StatePanel
                      variant="empty"
                      icon={<BookOpen className="w-5 h-5" />}
                      title="No modules in your library yet"
                      description="Upload a PDF/Word file or paste your lecture notes in the Library first."
                      actionLabel="Go to Library"
                      onAction={() => setActiveView('library')}
                    />
                  ) : (
                    <>
                      <div className="space-y-2">
                        {documents.map((d) => {
                          const selectedId = pickerDocId ?? documents[0]?.id;
                          const checked = selectedId === d.id;
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
                                  name="module-picker"
                                  checked={checked}
                                  onChange={() => setPickerDocId(d.id)}
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
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            const targetId = pickerDocId ?? documents[0]?.id;
                            const doc = documents.find((d) => d.id === targetId);
                            if (doc) handleSelectDoc(doc);
                          }}
                          className="min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 px-5 py-2 text-xs sm:text-sm font-bold text-white shadow-xs"
                        >
                          <span>Proceed to Module</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </section>
              </div>
            )
          )}

          {activeView === 'flashcards' && currentDoc && (
            <FlashcardStudyMode
              documentId={currentDoc.id}
              initialTopicId={activeTopicId}
              isDueMode={isDueCardsMode}
              onBack={() => setActiveView('document')}
              showToast={showToast}
            />
          )}

          {activeView === 'quiz' && currentDoc && (
            <QuizMode
              documentId={currentDoc.id}
              initialTopicId={activeTopicId}
              isWeakSpotMode={isWeakSpotQuizMode}
              aiConfigured={aiConfigured}
              onBack={() => setActiveView('document')}
              onGoToFlashcards={(docId) => handleStartFlashcards(docId, null, false)}
              showToast={showToast}
            />
          )}

          {activeView === 'chat' && currentDoc && (
            <ChatView
              documentId={currentDoc.id}
              documentTitle={currentDoc.title}
              onBack={() => setActiveView('document')}
              showToast={showToast}
            />
          )}
        </div>
        </Suspense>
      </main>

      {/* Footer (hidden on mobile during chat to maximize viewport) */}
      {activeView !== 'chat' && (
        <footer className="hidden md:block border-t border-slate-200 bg-white py-5 text-xs text-slate-600">
          <div className="max-w-6xl mx-auto px-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span translate="no" className="notranslate font-bold text-slate-900">Examnesia {petEmoji}</span>
            </div>
            <span className="text-slate-500">Privacy-first study companion</span>
          </div>
        </footer>
      )}

      {/* Study-buddy pet that docks safely above mobile nav */}
      <Companion hideOnMobile={hideCompanionOnMobile} />

      {/* Toast Notifications */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Android APK Update Dialog */}
      {updateInfo && <UpdateModal updateInfo={updateInfo} onClose={() => setUpdateInfo(null)} />}
    </div>
  );
}
