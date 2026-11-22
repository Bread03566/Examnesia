import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import Modal from './Modal';
import {
  deferUpdateVersion,
  downloadAndInstallUpdate,
  installVerifiedUpdateOnly,
  openAndroidInstallPermissionSettings,
} from '../platform/updater';

function formatSize(bytes) {
  const n = Number(bytes);
  if (!n || n <= 0) return null;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Android APK Update Dialog (Phase 6).
 *
 * - Optional update: student can install now or defer ("Later").
 * - Mandatory update: explains why the update is required, always provides "Open the website instead",
 *   and (fail-safe rule) lifts the blocking requirement if the APK download or verification fails.
 */
export default function UpdateModal({ updateInfo, onClose }) {
  const [phase, setPhase] = useState('prompt'); // 'prompt' | 'downloading' | 'needs_permission' | 'error' | 'handed_off'
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [failSafeUnlocked, setFailSafeUnlocked] = useState(false);

  if (!updateInfo || !updateInfo.release) return null;

  const { release, installed, mandatory } = updateInfo;
  const canDismiss = !mandatory || failSafeUnlocked;
  const webAppUrl = (import.meta.env?.VITE_API_BASE || '').replace(/\/+$/, '');
  const sizeLabel = formatSize(release.file_size_bytes);

  const handleDefer = () => {
    if (!mandatory) {
      deferUpdateVersion(release.version_code);
    }
    onClose?.();
  };

  const handleUpdateNow = async () => {
    setPhase('downloading');
    setProgress(0);
    setErrorMsg('');
    try {
      const { installRes } = await downloadAndInstallUpdate(release, {
        onProgress: (p) => {
          if (typeof p?.percent === 'number') setProgress(p.percent);
        },
      });
      if (installRes?.needsInstallPermission) {
        setPhase('needs_permission');
      } else {
        setPhase('handed_off');
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Could not download or verify the APK update.');
      // Fail-safe rule (Phase 2 §8): if the referenced APK cannot be downloaded or verified, lift the mandatory block.
      setFailSafeUnlocked(true);
      setPhase('error');
    }
  };

  const handleOpenPermissionSettings = async () => {
    await openAndroidInstallPermissionSettings();
  };

  const handleResumeInstallAfterPermission = async () => {
    setErrorMsg('');
    try {
      const installRes = await installVerifiedUpdateOnly();
      if (installRes?.needsInstallPermission) {
        setPhase('needs_permission');
      } else {
        setPhase('handed_off');
      }
    } catch (err) {
      if (String(err?.code || err?.message || '').includes('NO_APK')) {
        await handleUpdateNow();
        return;
      }
      setErrorMsg(err?.message || 'Could not launch Android package installer.');
      setFailSafeUnlocked(true);
      setPhase('error');
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={canDismiss ? handleDefer : undefined}
      title={mandatory ? 'Required App Update' : 'App Update Available'}
      subtitle={`Current: v${installed?.versionName || '1.0.0'} → Latest: v${release.version_name}`}
      maxWidth="max-w-md"
    >
      <div className="space-y-4 text-xs sm:text-sm text-slate-700">
        {mandatory ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 leading-relaxed">
            <strong>This update is required</strong> to stay compatible with the latest Examnesia server features and security checks.
          </div>
        ) : (
          <p className="text-xs text-slate-600">
            A newer signed version of the Examnesia Android app is ready to install.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <div>
            <span className="font-bold text-slate-500 block">New Version</span>
            <span className="font-extrabold text-slate-900">v{release.version_name} ({release.version_code})</span>
          </div>
          <div>
            <span className="font-bold text-slate-500 block">Size &amp; Date</span>
            <span className="font-extrabold text-slate-900">
              {sizeLabel || 'APK'}{release.release_date ? ` · ${release.release_date}` : ''}
            </span>
          </div>
        </div>

        {Array.isArray(release.release_notes) && release.release_notes.length > 0 && (
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">What&apos;s New</h3>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
              {release.release_notes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
          <ShieldCheck className="w-4 h-4 shrink-0 text-amber-700" />
          <span>Verified with Ed25519 manifest signature, SHA-256 checksum, and Android signing certificate check.</span>
        </div>

        {phase === 'downloading' && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" role="status">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                Downloading &amp; verifying APK…
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-amber-500 transition-all duration-200"
                style={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
              />
            </div>
          </div>
        )}

        {phase === 'needs_permission' && (
          <div className="space-y-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
            <p className="font-bold">Allow &ldquo;Install unknown apps&rdquo; for Examnesia</p>
            <p>
              Android requires your permission before Examnesia can hand the verified update to the system package installer. Tap below to open the setting, enable it, then return and tap <strong>Install Verified Update</strong>.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleOpenPermissionSettings}
                className="min-h-[38px] rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-600"
              >
                Open Android Permission Setting
              </button>
              <button
                type="button"
                onClick={handleResumeInstallAfterPermission}
                className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100"
              >
                Install Verified Update
              </button>
            </div>
          </div>
        )}

        {phase === 'handed_off' && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
            <div>
              <strong>Ready to install.</strong> Confirm the prompt in Android&apos;s system installer to complete the update.
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div role="alert" className="space-y-1.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-700" />
              <span>Update could not be completed</span>
            </div>
            <p>{errorMsg}</p>
            {mandatory && (
              <p className="text-[11px] text-rose-800">
                So you are not locked out of studying, you can retry the download, continue in the app for now, or open the website instead.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
          {webAppUrl && (
            <a
              href={webAppUrl}
              target="_blank"
              rel="noreferrer"
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open website instead
            </a>
          )}

          {canDismiss && (
            <button
              type="button"
              onClick={handleDefer}
              disabled={phase === 'downloading'}
              className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {mandatory ? 'Continue for now' : 'Later'}
            </button>
          )}

          <button
            type="button"
            onClick={handleUpdateNow}
            disabled={phase === 'downloading'}
            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-600 disabled:opacity-50"
          >
            {phase === 'downloading' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{phase === 'error' ? 'Retry Update' : 'Update Now'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
