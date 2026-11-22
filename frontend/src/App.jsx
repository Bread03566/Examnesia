import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import Navbar from './components/Navbar';
import Toast from './components/Toast';
import Companion from './components/Companion';
import StatePanel from './components/StatePanel';
import UploadLibraryView from './views/UploadLibraryView';
import { useAuth } from './components/AuthGate';
import { CloudOff, X } from 'lucide-react';
import { getDocuments, checkHealth } from './services/api';
import { usePetEmoji } from './components/pets';

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
  const [toast, setToast] = useState(null);

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
        return docs[0] || null;
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
            setActiveView('library');
          } else if (tab === 'dashboard') {
            setActiveView('dashboard');
          } else if (tab === 'exam') {
            setActiveView('exam');
          } else if (tab === 'admin' && user?.role === 'admin') {
            setActiveView('admin');
          } else if (tab === 'document' && currentDoc) {
            setActiveView('document');
          }
        }}
        currentDoc={currentDoc}
      />

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
              onStartDueCards={() => handleStartFlashcards(currentDoc?.id, null, true)}
              onStartWeakSpotQuiz={(docId) => handleStartQuiz(docId || currentDoc?.id, null, true)}
              onSelectTopicQuiz={(docId, topicId) => handleStartQuiz(docId, topicId, false)}
              onGoToLibrary={() => setActiveView('library')}
              showToast={showToast}
            />
          )}

          {activeView === 'exam' && <ExamPrepView documents={documents} showToast={showToast} />}

          {activeView === 'admin' && user?.role === 'admin' && <AdminView showToast={showToast} />}

          {activeView === 'document' && currentDoc && (
            <DocumentView
              documentId={currentDoc.id}
              onBack={() => setActiveView('library')}
              onStartFlashcards={(docId, topicId) => handleStartFlashcards(docId, topicId, false)}
              onStartQuiz={(docId, topicId) => handleStartQuiz(docId, topicId, false)}
              onStartChat={(docId) => handleStartChat(docId)}
              onStartWeakSpotQuiz={(docId) => handleStartQuiz(docId, null, true)}
              showToast={showToast}
            />
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
              <span translate="no" className="notranslate font-bold text-slate-900">Kabisado {petEmoji}</span>
              <span>·</span>
              <span>From huh? to gotcha!</span>
            </div>
            <span className="text-slate-500">Privacy-first study companion</span>
          </div>
        </footer>
      )}

      {/* Study-buddy pet that docks safely above mobile nav */}
      <Companion hideOnMobile={hideCompanionOnMobile} />

      {/* Toast Notifications */}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
