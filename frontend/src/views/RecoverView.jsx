import React, { useState } from 'react';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import authClient from '../services/authClient';
import PasswordField from '../components/PasswordField';
import { fieldForError } from '../services/fieldErrors';

export default function RecoverView({ onBack }) {
  const [step, setStep] = useState('request'); // 'request' | 'reset'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notice, setNotice] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const sendCode = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.endsWith('@gmail.com')) {
      return setErrors({ email: 'Please enter a valid @gmail.com address.' });
    }
    setBusy(true);
    setErrors({});
    try {
      const res = await authClient.forgotPassword({ email: trimmed });
      setEmail(trimmed);
      setNotice(res.detail || 'If that Gmail address is registered, we sent a 6-digit reset code. Check your inbox and spam folder.');
      setStep('reset');
    } catch (err) {
      const wait = err.status === 429 && err.retryAfter ? ` Try again in ${err.retryAfter} seconds.` : '';
      setErrors({ [fieldForError(err)]: err.message + wait });
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    if (busy) return;
    const local = {};
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) local.code = 'Enter the 6-digit code sent to your Gmail.';
    if (password !== confirm) local.confirm = 'The two passwords do not match.';
    if (Object.keys(local).length) return setErrors(local);

    setBusy(true);
    setErrors({});
    try {
      await authClient.resetPassword({
        email: email.trim().toLowerCase(),
        code: digits,
        newPassword: password,
        confirmPassword: confirm,
      });
    } catch (err) {
      const wait = err.status === 429 && err.retryAfter ? ` Try again in ${err.retryAfter} seconds.` : '';
      const key = err.status === 401 ? 'form' : fieldForError(err);
      setErrors({ [key]: err.message + wait });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="w-4 h-4" /> Back to log in
      </button>

      <h1 className="mt-3 text-xl font-extrabold text-slate-900">Reset your password</h1>

      {step === 'request' ? (
        <>
          <p className="mt-1 text-sm text-slate-600">
            Enter your Gmail address and we&apos;ll email you a 6-digit code to reset your password.
          </p>

          <form onSubmit={sendCode} className="mt-5 space-y-4" noValidate>
            <div>
              <label htmlFor="rec-email" className="block text-xs font-bold text-slate-700 mb-1">Gmail address</label>
              <input
                id="rec-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                maxLength={100}
                placeholder="you@gmail.com"
                spellCheck={false}
                required
                enterKeyHint="send"
                aria-invalid={Boolean(errors.email)}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                  errors.email ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'
                }`}
              />
              {errors.email && <p role="alert" className="mt-1 text-xs text-red-600">{errors.email}</p>}
            </div>

            {errors.form && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{errors.form}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-amber-600 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Send reset code
            </button>
          </form>
        </>
      ) : (
        <>
          <p role="status" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
            {notice}
          </p>

          <form onSubmit={submitReset} className="mt-4 space-y-4" noValidate>
            <div>
              <label htmlFor="rec-code" className="block text-xs font-bold text-slate-700 mb-1">6-digit code from Gmail</label>
              <input
                id="rec-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d\s-]/g, ''))}
                maxLength={10}
                placeholder="123456"
                spellCheck={false}
                required
                enterKeyHint="next"
                aria-invalid={Boolean(errors.code)}
                className={`w-full rounded-xl border px-3 py-2.5 font-mono text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                  errors.code ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'
                }`}
              />
              {errors.code && <p role="alert" className="mt-1 text-xs text-red-600">{errors.code}</p>}
            </div>

            <PasswordField
              label="New password"
              value={password}
              onChange={setPassword}
              error={errors.password}
              autoComplete="new-password"
              hint="At least 10 characters. Longer is safer."
            />
            <PasswordField
              label="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              error={errors.confirm}
              autoComplete="new-password"
            />

            {errors.form && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{errors.form}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-amber-600 disabled:opacity-60"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Reset password
            </button>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <button
                type="button"
                onClick={() => { setStep('request'); setCode(''); setErrors({}); }}
                className="underline hover:text-slate-800"
              >
                Use a different Gmail
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => sendCode()}
                className="font-semibold text-amber-700 underline disabled:opacity-50"
              >
                Resend code
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
