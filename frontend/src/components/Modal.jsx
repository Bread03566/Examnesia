import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Accessible base dialog portaled to document.body.
 * Handles Escape-to-close, backdrop click, body scroll lock, and initial focus.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle = null,
  icon = null,
  maxWidth = 'max-w-md',
  children,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const prevActive = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog if not already inside
    const timer = requestAnimationFrame(() => {
      const container = dialogRef.current;
      if (!container) return;
      const focusable = container.querySelector(
        'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (focusable || container).focus();
    });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(timer);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
      if (prevActive && typeof prevActive.focus === 'function') {
        prevActive.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-xs p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`animate-in fade-in zoom-in-95 w-full ${maxWidth} max-h-[90dvh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xl focus:outline-none`}
      >
        {(title || onClose) && (
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {icon && <span className="shrink-0">{icon}</span>}
              <div className="min-w-0">
                {title && (
                  <h2 id={titleId} className="text-base sm:text-lg font-bold text-slate-900 truncate">
                    {title}
                  </h2>
                )}
                {subtitle && <p className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</p>}
              </div>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>
      </div>
    </div>,
    document.body
  );
}
