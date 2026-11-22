import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import Modal from './Modal';
import PasswordField from './PasswordField';
import ConsentPanel from './ConsentPanel';
import authClient from '../services/authClient';
import { changePassword, deactivateAccount, deleteAccount, exportMyData } from '../services/api';

/** Change password, deactivate, or delete the account. Each action re-asks for the current password. */
export default function AccountModal({ user, onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [action, setAction] = useState('password'); // 'password' | 'deactivate' | 'delete'
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setDone('');
    if (action === 'password' && next !== confirm) return setError('The two new passwords do not match.');
    setBusy(true);
    try {
      if (action === 'password') {
        await changePassword(current, next, confirm);
        setCurrent(''); setNext(''); setConfirm('');
        setDone('Password changed. Your other devices have been signed out.');
      } else if (action === 'deactivate') {
        await deactivateAccount(current);
        await authClient.logout();
      } else {
        await deleteAccount(current);
        await authClient.logout();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const [exporting, setExporting] = useState(false);
  const downloadData = async () => {
    setExporting(true);
    setError('');
    try {
      await exportMyData();
    } catch (err) {
      setError(err.message || 'Could not download your data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const tabs = [['password', 'Change password'], ['deactivate', 'Deactivate'], ['delete', 'Delete account']];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={user.display_name}
      subtitle={user.username.includes('@') ? user.username : `@${user.username}`}
      maxWidth="max-w-md"
    >
      <button
        type="button"
        onClick={downloadData}
        disabled={exporting}
        className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        Download my data
      </button>

      <ConsentPanel />

      <div role="tablist" className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={action === key}
            onClick={() => { setAction(key); setError(''); setDone(''); }}
            className={`rounded-lg px-2 py-2 text-xs font-bold transition ${
              action === key ? 'bg-white text-amber-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      <form onSubmit={run} className="mt-4 space-y-3" noValidate>
        {action === 'deactivate' && (
          <p className="text-xs text-slate-600 leading-relaxed">
            You will not be able to log in until an admin reactivates your account. Your data is not deleted.
          </p>
        )}
        {action === 'delete' && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 leading-relaxed">
            This permanently deletes your account and <strong>all your modules, flashcards, quizzes, and progress</strong>. This cannot be undone.
          </p>
        )}
        <PasswordField label={action === 'password' ? 'Current password' : 'Your password'} value={current} onChange={setCurrent} autoComplete="current-password" />
        {action === 'password' && (
          <>
            <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" hint="At least 8 characters, with 1 uppercase letter and 1 special character." />
            <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </>
        )}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}
        {done && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{done}</p>}
        <button
          type="submit"
          disabled={busy || !current}
          className={`w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
            action === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-500 hover:bg-amber-600'
          }`}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {tabs.find(([k]) => k === action)[1]}
        </button>
      </form>
    </Modal>
  );
}
