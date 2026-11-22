import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => {
      onClose();
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const isError = toast.type === 'error';
  const typeConfig = {
    success: {
      bg: 'bg-emerald-50 border-emerald-300 text-emerald-950',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
    },
    error: {
      bg: 'bg-rose-50 border-rose-300 text-rose-950',
      icon: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />,
    },
    info: {
      bg: 'bg-white border-slate-300 text-slate-900',
      icon: <Info className="w-5 h-5 text-amber-700 shrink-0" />,
    },
  };

  const config = typeConfig[toast.type] || typeConfig.info;

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className="fixed bottom-20 md:bottom-5 left-4 right-4 sm:left-auto sm:right-5 z-50 sm:max-w-sm animate-bounce-short"
    >
      <div className={`flex items-start gap-3 p-3.5 rounded-xl border shadow-lg ${config.bg}`}>
        {config.icon}
        <div className="flex-1 text-xs sm:text-sm font-medium leading-snug pr-1">
          {toast.message}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notification"
          className="min-h-[28px] min-w-[28px] inline-flex items-center justify-center text-slate-500 hover:text-slate-900 transition rounded-lg"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
