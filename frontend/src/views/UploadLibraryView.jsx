import React, { useMemo, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  FileUp,
  Trash2,
  BrainCircuit,
  HelpCircle,
  Sparkles,
  Layers,
  ArrowRight,
  CheckCircle2,
  Search,
  BookOpen,
  SlidersHorizontal,
  Loader2,
} from 'lucide-react';
import Mascot from '../components/Mascot';
import ConfirmDialog from '../components/ConfirmDialog';
import StatePanel from '../components/StatePanel';
import { uploadDocumentFile, createDocumentFromText, deleteDocument } from '../services/api';

const MAX_UPLOAD_MB = 10;

const SAMPLE_MODULE = {
  title: 'Lesson 1: The History of the Propaganda Movement and Jose Rizal',
  text: `Chapter 1: The Philippines in the 19th Century
In the 19th century, the Philippines was under the rule of the Spanish Empire. Discrimination was widespread between Spaniards (peninsulares and insulares) and native Filipinos (indios). The friars controlled large haciendas and held strong influence over the government and education. Even so, the opening of the Suez Canal in 1869 brought faster trade and the arrival of liberal ideas from Europe.

Chapter 2: The Rise of the Propaganda Movement
The Propaganda Movement was a peaceful movement formed by the ilustrados, Filipinos who had studied in Europe. Their main goal was not immediate revolution but assimilation, making the Philippines an official province of Spain. They called for equal rights under the law, freedom of the press, secularization of the parishes, and representation in the Spanish Cortes. The movement's official newspaper was La Solidaridad, founded by Graciano Lopez Jaena in Barcelona.

Chapter 3: The Life and Works of Dr. Jose Rizal
Dr. Jose Protacio Rizal Mercado y Alonso Realonda was born on June 19, 1861 in Calamba, Laguna. He is regarded as the National Hero of the Philippines because his brilliant writings awakened the nationalist spirit of the people. His first novel, Noli Me Tangere, was published in Berlin in 1887. It is a social novel that exposed the ills of society and the abuses of corrupt leaders. His second novel, El Filibusterismo, was published in Ghent in 1891 with a bolder and more revolutionary spirit.

Chapter 4: The End of the Movement and the Rise of the Katipunan
Although the Propaganda Movement did not win all the reforms it asked of the Spanish government, its writings became the spark that led Andres Bonifacio to found the KKK (Kataas-taasang, Kagalang-galangang Katipunan ng mga Anak ng Bayan) on July 7, 1892. This marked the beginning of the armed revolution for the complete independence of the motherland.`,
};

export default function UploadLibraryView({
  documents,
  onSelectDoc,
  onRefreshDocs,
  showToast,
}) {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'paste'
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef(null);

  // Library search, filter, sort & delete confirmation
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'pdf' | 'docx' | 'text'
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'alpha' | 'topics'
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const filteredDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return documents
      .filter((doc) => {
        if (typeFilter !== 'all' && doc.file_type !== typeFilter) return false;
        if (q && !doc.title.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'alpha') return a.title.localeCompare(b.title);
        if (sortBy === 'topics') return (b.topics_count || 0) - (a.topics_count || 0);
        if (sortBy === 'oldest') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
  }, [documents, searchQuery, typeFilter, sortBy]);

  const handleFileUpload = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf' && ext !== 'docx') {
      showToast('error', 'Unsupported file type. Please upload a PDF or DOCX file.');
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      showToast('error', `File exceeds the ${MAX_UPLOAD_MB} MB limit. Please upload a smaller file.`);
      return;
    }

    setIsUploading(true);
    try {
      showToast('info', 'Reading your file and organizing topics...');
      const newDoc = await uploadDocumentFile(file, customTitle);
      showToast('success', `"${newDoc.title}" is ready to study.`);
      setCustomTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await onRefreshDocs();
      onSelectDoc(newDoc);
    } catch (err) {
      showToast('error', err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handlePasteSubmit = async (e) => {
    e.preventDefault();
    if (!pasteTitle.trim() || !pasteText.trim()) {
      showToast('error', 'Please enter both a module title and content.');
      return;
    }

    setIsUploading(true);
    try {
      showToast('info', 'Processing notes and splitting into topics...');
      const newDoc = await createDocumentFromText(pasteTitle, pasteText);
      showToast('success', `"${newDoc.title}" saved.`);
      setPasteTitle('');
      setPasteText('');
      await onRefreshDocs();
      onSelectDoc(newDoc);
    } catch (err) {
      showToast('error', err.message || 'Could not save your notes.');
    } finally {
      setIsUploading(false);
    }
  };

  const loadSampleHandout = () => {
    setPasteTitle(SAMPLE_MODULE.title);
    setPasteText(SAMPLE_MODULE.text);
    setActiveTab('paste');
    showToast('info', 'Sample handout loaded. Click "Save & Process" to try it.');
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteDocument(pendingDelete.id);
      showToast('success', `"${pendingDelete.title}" deleted.`);
      setPendingDelete(null);
      await onRefreshDocs();
    } catch {
      showToast('error', 'Could not delete the module. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const wordCount = pasteText.split(/\s+/).filter(Boolean).length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      {/* Warm Editorial Workspace Header */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Study Workspace</span>
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
              Turn your lecture notes into active recall.
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Upload a PDF, Word document, or pasted notes to generate grounded summaries, spaced-repetition flashcards, and practice quizzes.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={loadSampleHandout}
                className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 text-xs font-bold rounded-xl transition"
              >
                <Sparkles className="w-4 h-4 text-amber-700" />
                <span>Load sample handout</span>
              </button>
            </div>
          </div>

          <div className="hidden sm:flex shrink-0">
            <Mascot
              mood={documents.length === 0 ? 'sleepy' : 'studying'}
              size="lg"
              message={
                documents.length === 0
                  ? 'Add your first module below to start reviewing.'
                  : `${documents.length} ${documents.length === 1 ? 'module' : 'modules'} ready on your desk.`
              }
            />
          </div>
        </div>
      </section>

      {/* Upload & Paste Panel */}
      <section aria-label="Add study material" className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div role="tablist" className="grid grid-cols-2 border-b border-slate-200 bg-slate-100/60">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'upload'}
            onClick={() => setActiveTab('upload')}
            className={`min-h-[46px] py-3 px-4 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition border-b-2 ${
              activeTab === 'upload'
                ? 'border-amber-500 text-amber-900 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>Upload File</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'paste'}
            onClick={() => setActiveTab('paste')}
            className={`min-h-[46px] py-3 px-4 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition border-b-2 ${
              activeTab === 'paste'
                ? 'border-amber-500 text-amber-900 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Paste Notes</span>
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {activeTab === 'upload' ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="custom-module-title" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Module title (optional)
                </label>
                <input
                  id="custom-module-title"
                  type="text"
                  placeholder="e.g., Bio 101 — Cell Biology Chapter 1"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  disabled={isUploading}
                  className="w-full min-h-[42px] text-sm px-3.5 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => handleFileUpload(e.target.files?.[0])}
                accept=".pdf,.docx"
                className="sr-only"
                aria-label="Choose a PDF or DOCX file"
              />

              <button
                type="button"
                disabled={isUploading}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full border-2 border-dashed rounded-2xl p-6 sm:p-10 text-center transition flex flex-col items-center justify-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-60 ${
                  isDragging
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-slate-300 hover:border-amber-400 hover:bg-amber-50/40'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-800">
                  {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileUp className="w-6 h-6" />}
                </div>

                <div className="space-y-1">
                  <p className="font-bold text-slate-900 text-sm sm:text-base">
                    {isUploading ? 'Processing your module...' : 'Drop a PDF or Word file here, or tap to browse'}
                  </p>
                  <p className="text-xs text-slate-600">
                    Supports <span className="font-semibold">PDF (.pdf)</span> and <span className="font-semibold">Word (.docx)</span> up to {MAX_UPLOAD_MB} MB
                  </p>
                </div>
              </button>
            </div>
          ) : (
            <form onSubmit={handlePasteSubmit} className="space-y-4">
              <div>
                <label htmlFor="paste-title" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Module title
                </label>
                <input
                  id="paste-title"
                  type="text"
                  placeholder="e.g., Rizal — Chapters 1 and 2"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  className="w-full min-h-[42px] text-sm px-3.5 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="paste-content" className="block text-xs font-semibold text-slate-700">
                    Lecture notes or handout text
                  </label>
                  <span className="text-xs text-slate-500">
                    {wordCount.toLocaleString()} words · {pasteText.length.toLocaleString()} chars
                  </span>
                </div>
                <textarea
                  id="paste-content"
                  rows={7}
                  placeholder="Paste your handouts, lecture notes, or study guide here..."
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  className="w-full text-sm p-3.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 leading-relaxed"
                  required
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={loadSampleHandout}
                  className="min-h-[42px] px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-xl transition"
                >
                  Fill with sample handout
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="min-h-[42px] px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Save & Process</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Library Section with Search, Filter & Sort */}
      <section aria-label="Your modules" className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Your Library ({documents.length})
            </h2>
            <p className="text-xs text-slate-600">
              Select a module to read summaries, study flashcards, or take a quiz.
            </p>
          </div>

          {documents.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <label className="relative flex-1 sm:w-56">
                <span className="sr-only">Search modules</span>
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search modules..."
                  className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </label>

              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-2.5 min-h-[38px]">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <select
                    aria-label="Filter by file type"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none py-1"
                  >
                    <option value="all">All types</option>
                    <option value="pdf">PDF</option>
                    <option value="docx">DOCX</option>
                    <option value="text">Notes</option>
                  </select>
                </div>

                <select
                  aria-label="Sort modules"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="alpha">A – Z</option>
                  <option value="topics">Most topics</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {documents.length === 0 ? (
          <StatePanel
            variant="empty"
            icon={<BookOpen className="w-5 h-5" />}
            title="Your study library is empty"
            description="Upload a PDF or Word handout above, paste your lecture notes, or try the sample handout to see how Kabisado works."
            actionLabel="Load sample handout"
            onAction={loadSampleHandout}
          />
        ) : filteredDocuments.length === 0 ? (
          <StatePanel
            variant="empty"
            icon={<Search className="w-5 h-5" />}
            title="No matching modules"
            description="Try a different search term or reset your file-type filter."
            actionLabel="Clear filters"
            onAction={() => {
              setSearchQuery('');
              setTypeFilter('all');
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocuments.map((doc, idx) => (
              <article
                key={doc.id}
                style={{ '--i': idx }}
                className="stagger-item group bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-amber-400 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide ${
                        doc.file_type === 'pdf'
                          ? 'bg-rose-50 text-rose-800 border border-rose-200'
                          : doc.file_type === 'docx'
                          ? 'bg-blue-50 text-blue-800 border border-blue-200'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {doc.file_type === 'text' ? 'Notes' : doc.file_type}
                    </span>

                    <button
                      type="button"
                      onClick={() => setPendingDelete(doc)}
                      aria-label={`Delete ${doc.title}`}
                      title="Delete module"
                      className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectDoc(doc)}
                    className="text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-lg"
                  >
                    <h3 className="font-bold text-slate-900 group-hover:text-amber-700 transition line-clamp-2 text-sm sm:text-base leading-snug">
                      {doc.title}
                    </h3>
                  </button>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 mt-3 pt-3 border-t border-slate-100">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-amber-700" />
                      {doc.topics_count || 1} Topics
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <BrainCircuit className="w-3.5 h-3.5 text-indigo-600" />
                      {doc.flashcards_count || 0} Cards
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5 text-emerald-600" />
                      {doc.questions_count || 0} Questions
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectDoc(doc)}
                  className="mt-4 pt-3 border-t border-slate-100 w-full flex items-center justify-between text-xs font-bold text-amber-800 hover:text-amber-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-lg"
                >
                  <span>Open module</span>
                  <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition" />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        busy={deleting}
        variant="danger"
        title="Delete module?"
        message={
          pendingDelete
            ? `Are you sure you want to permanently delete "${pendingDelete.title}" along with its topics, flashcards, and quiz history?`
            : ''
        }
        confirmLabel="Delete module"
      />
    </div>
  );
}
