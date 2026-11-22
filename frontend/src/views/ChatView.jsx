import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  BookMarked,
  AlertCircle,
  Lightbulb,
  Loader2,
} from 'lucide-react';
import Mascot from '../components/Mascot';
import Markdown from '../components/Markdown';
import { askDocumentChat } from '../services/api';
import { speech } from '../platform/index';

// Keep per-document conversation history in memory during the session so switching tabs doesn't wipe it.
const sessionChats = new Map();

function makeWelcomeMessage(documentTitle) {
  return {
    role: 'assistant',
    content: `Ask anything about **"${documentTitle}"**. Every answer is grounded in your uploaded material with section citations. If something isn't covered in your notes, I'll let you know instead of guessing.`,
    citation: null,
    found_in_document: true,
    is_welcome: true,
    explain_like_new: false,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

const SAMPLE_PROMPTS = [
  'What is the main idea of this module?',
  'Explain the key concepts simply',
  'What terms are most important for an exam?',
  'Summarize the cause-and-effect relationships here',
];

export default function ChatView({
  documentId,
  documentTitle,
  onBack,
  showToast,
}) {
  const [messages, setMessages] = useState(
    () => sessionChats.get(documentId) || [makeWelcomeMessage(documentTitle)]
  );
  const [inputText, setInputText] = useState('');
  const [explainLikeNew, setExplainLikeNew] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Voice Mode States
  const [isListening, setIsListening] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState(null);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    setMessages(sessionChats.get(documentId) || [makeWelcomeMessage(documentTitle)]);
  }, [documentId, documentTitle]);

  useEffect(() => {
    sessionChats.set(documentId, messages);
  }, [documentId, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Clean up speech recognition & synthesis on unmount
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      speech.cancelSpeech();
    };
  }, []);

  const handleSendMessage = async (customPrompt = null) => {
    const textToSend = (customPrompt || inputText).trim();
    if (!textToSend || isSending) return;

    const userMessage = {
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = messages
      .filter((m) => !m.is_welcome)
      .slice(-4)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsSending(true);

    try {
      const res = await askDocumentChat(
        documentId,
        textToSend,
        explainLikeNew,
        nextHistory
      );

      const assistantMessage = {
        role: 'assistant',
        content: res.answer,
        citation: res.citation,
        found_in_document: res.found_in_document,
        explain_like_new: explainLikeNew,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      showToast?.('error', err.message || 'Could not get an answer right now.');
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast?.('error', 'Speech recognition is not supported in this browser.');
      return;
    }

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        setIsListening(true);
        showToast?.('info', 'Listening... Speak your question.');
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const speakText = (text, idx) => {
    if (!speech.isTtsSupported()) {
      showToast?.('error', 'Text-to-speech is not supported on this device.');
      return;
    }

    if (speakingIdx === idx) {
      speech.cancelSpeech();
      setSpeakingIdx(null);
      return;
    }

    const cleanText = text.replace(/[#*`>_]/g, '').trim();
    setSpeakingIdx(idx);
    speech.speakText(cleanText, {
      rate: 1.0,
      pitch: 1.0,
      onEnd: () => setSpeakingIdx(null),
      onError: () => setSpeakingIdx(null),
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 pt-4 pb-2 flex flex-col h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-4.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to module"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-700 shrink-0" />
              <span className="truncate">Ask Kabisado</span>
            </h1>
            <p className="text-xs text-slate-600 truncate">
              {documentTitle}
            </p>
          </div>
        </div>

        {/* Explain like I'm new toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={explainLikeNew}
          onClick={() => setExplainLikeNew((prev) => !prev)}
          className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition shrink-0 ${
            explainLikeNew
              ? 'bg-amber-500 text-white border-amber-600'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
          title="Use simpler analogies when explaining concepts"
        >
          <Lightbulb className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Simple Analogy</span>
          <span className="sm:hidden">ELI5</span>
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {messages.map((m, idx) => {
          const isUser = m.role === 'user';
          const isNotFound = !isUser && !m.is_welcome && m.found_in_document === false;
          const isSpeakingThis = speakingIdx === idx;

          return (
            <div
              key={idx}
              className={`animate-in fade-in slide-in-from-bottom-2 flex gap-2.5 ${
                isUser ? 'justify-end' : 'justify-start'
              }`}
            >
              {!isUser && (
                <div className="hidden sm:block shrink-0 mt-1">
                  <Mascot mood={isNotFound ? 'shocked' : 'studying'} size="sm" />
                </div>
              )}

              <div
                className={`max-w-[90%] sm:max-w-xl p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-xs space-y-2.5 ${
                  isUser
                    ? 'bg-amber-500 text-white rounded-tr-xs'
                    : isNotFound
                    ? 'bg-amber-50/80 border border-amber-300 text-slate-900 rounded-tl-xs'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                }`}
              >
                {/* Grounding status label for assistant replies */}
                {!isUser && !m.is_welcome && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isNotFound ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md">
                        <AlertCircle className="w-3 h-3" />
                        <span>Not found in uploaded material</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                        <BookMarked className="w-3 h-3" />
                        <span>{m.citation || 'Grounded in module'}</span>
                      </span>
                    )}
                    {m.explain_like_new && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                        <Lightbulb className="w-3 h-3" />
                        <span>Analogy mode</span>
                      </span>
                    )}
                  </div>
                )}

                {isUser ? (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                ) : (
                  <Markdown>{m.content}</Markdown>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  {!isUser ? (
                    <button
                      type="button"
                      onClick={() => speakText(m.content, idx)}
                      aria-label={isSpeakingThis ? 'Stop reading aloud' : 'Read answer aloud'}
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition ${
                        isSpeakingThis
                          ? 'bg-amber-100 text-amber-900'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {isSpeakingThis ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      <span>{isSpeakingThis ? 'Stop' : 'Listen'}</span>
                    </button>
                  ) : (
                    <span />
                  )}

                  <span className={`text-[11px] font-medium ${isUser ? 'text-amber-100' : 'text-slate-500'}`}>
                    {m.timestamp}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex gap-2.5 items-center">
            <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl text-xs text-slate-600 flex items-center gap-2 shadow-xs">
              <Loader2 className="w-4 h-4 text-amber-700 animate-spin" />
              <span>Searching your module for grounded answers...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sample Prompt Suggestions */}
      {messages.length <= 2 && (
        <div className="py-2 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
          <span className="font-semibold text-slate-600 shrink-0">Try:</span>
          {SAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handleSendMessage(p)}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-amber-500 text-slate-700 rounded-xl whitespace-nowrap transition shrink-0"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input Form */}
      <div className="pt-2 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-300 shadow-xs focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-500"
        >
          {speech.isRecognitionSupported() && (
            <button
              type="button"
              onClick={handleToggleVoiceInput}
              aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
              title={isListening ? 'Stop listening' : 'Speak your question'}
              className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl transition ${
                isListening
                  ? 'bg-rose-600 text-white animate-pulse'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}

          <input
            type="text"
            aria-label="Ask a question about this module"
            placeholder={isListening ? 'Listening... speak now' : 'Ask a question about this module...'}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isSending}
            className="flex-1 text-sm bg-transparent outline-none px-1.5 text-slate-900 placeholder-slate-500 min-w-0"
          />

          <button
            type="submit"
            aria-label="Send question"
            disabled={!inputText.trim() || isSending}
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-xl transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
