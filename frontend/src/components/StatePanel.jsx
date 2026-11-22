import React from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

/**
 * Unified loading, empty, and error state container with consistent editorial styling.
 */
export default function StatePanel({
  variant = 'empty', // 'loading' | 'empty' | 'error'
  icon = null,
  title,
  description = null,
  actionLabel = null,
  onAction = null,
}) {
  return (
    <div
      role={variant === 'error' ? 'alert' : variant === 'loading' ? 'status' : undefined}
      className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center flex flex-col items-center justify-center space-y-3 shadow-xs"
    >
      {variant === 'loading' ? (
        <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : variant === 'error' ? (
        <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
          <AlertCircle className="w-5 h-5" />
        </div>
      ) : icon ? (
        <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
          {icon}
        </div>
      ) : null}

      {title && <h3 className="text-base font-bold text-slate-900">{title}</h3>}
      {description && <p className="text-xs sm:text-sm text-slate-600 max-w-md leading-relaxed">{description}</p>}

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-1 min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold shadow-xs transition"
        >
          {variant === 'error' && <RefreshCw className="w-4 h-4" />}
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
}
