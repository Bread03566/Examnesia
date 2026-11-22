import React, { useState } from 'react';
import { Flag, Send, AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import { submitFlag } from '../services/api';

const DEFAULT_REASONS = [
  'Incorrect information or factual error',
  'Unclear or confusing wording',
  'Wrong choices or wrong answer',
  'Typo or formatting issue',
  'Other reason (specify below)',
];

export default function FlagModal({ isOpen, onClose, targetType, targetId, onSuccess }) {
  const [reason, setReason] = useState(DEFAULT_REASONS[0]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await submitFlag(targetType, targetId, reason, notes);
      setNotes('');
      onSuccess?.("Thanks for flagging! We've logged it so it can be improved.");
      onClose();
    } catch (err) {
      setError(err.message || 'There was a problem saving the flag.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Flag ${targetType === 'flashcard' ? 'Flashcard' : 'Question'}`}
      subtitle="Help improve the accuracy of your study materials."
      icon={<Flag className="w-5 h-5 text-amber-700" />}
      maxWidth="max-w-md"
    >
      {error && (
        <div role="alert" className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset>
          <legend className="block text-xs font-semibold text-slate-700 mb-2">
            What is the issue?
          </legend>
          <div className="space-y-1.5">
            {DEFAULT_REASONS.map((r) => (
              <label
                key={r}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                  reason === r
                    ? 'bg-amber-50 border-amber-300 font-semibold text-amber-950'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-4 w-4 accent-amber-600"
                />
                <span>{r}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="flag-notes" className="block text-xs font-semibold text-slate-700 mb-1">
            Additional details (optional)
          </label>
          <textarea
            id="flag-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Example: According to section 2 of the module, the year was 1887."
            className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none h-20 resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-[40px] px-4 py-2 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl shadow-xs transition inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Submitting...' : 'Submit Flag'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
