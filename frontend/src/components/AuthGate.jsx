import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import authClient from '../services/authClient';
import { isOnline, onNetworkChange, onUpgradeRequired } from '../platform/index';
import AuthView from '../views/AuthView';
import RecoverView from '../views/RecoverView';
import PrivacyView from '../views/PrivacyView';
import Mascot from './Mascot';

const AuthContext = createContext({ user: null, logout: () => {} });
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

/**
 * Shows the app only when signed in. On first load it tries the refresh cookie; Render's free tier can take
 * up to a minute to wake, so that wait gets its own friendly state.
 */
export default function AuthGate({ children }) {
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready'
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState('auth'); // 'auth' | 'recover' | 'privacy'
  const [online, setOnline] = useState(() => isOnline());
  const [upgradeNotice, setUpgradeNotice] = useState(null);

  useEffect(() => {
    const offAuth = authClient.onAuthChange((u) => {
      setUser(u);
      if (!u) {
        setScreen('auth');
      }
    });
    const offNet = onNetworkChange((connected) => setOnline(connected));
    const offUpgrade = onUpgradeRequired((payload) => setUpgradeNotice(payload));
    authClient.restoreSession().finally(() => setStatus('ready'));
    return () => {
      offAuth();
      offNet();
      offUpgrade();
    };
  }, []);

  const logout = useCallback(() => authClient.logout(), []);

  const webAppUrl = (import.meta.env?.VITE_API_BASE || '').replace(/\/+$/, '') || '/';

  if (upgradeNotice) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center" role="alert">
        <Mascot mood="surprised" size="lg" />
        <h1 className="text-xl font-extrabold text-slate-900">Update required</h1>
        <p className="max-w-md text-sm text-slate-600">
          {upgradeNotice.detail || 'A newer version of the Kabisado Android app is required to continue.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href={webAppUrl}
            className="min-h-[42px] inline-flex items-center justify-center rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-amber-600"
          >
            Open the website instead
          </a>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center" role="status">
        <Mascot mood="sleepy" size="lg" />
        <p className="text-base font-bold text-slate-800">Kabi is waking up…</p>
        <p className="text-sm text-slate-500">This can take up to a minute.</p>
      </div>
    );
  }

  if (user) {
    return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {!online && (
        <div role="status" className="border-b border-rose-200 bg-rose-50 text-rose-950">
          <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2.5 text-xs font-medium">
            <WifiOff className="w-4 h-4 shrink-0 text-rose-700" />
            <span>You&apos;re offline right now. Reconnect to the internet to sign in or create an account.</span>
          </div>
        </div>
      )}
      <div className="px-4 py-8 sm:py-12 flex-1">
        {screen === 'privacy' ? (
          <PrivacyView onBack={() => setScreen('auth')} />
        ) : screen === 'recover' ? (
          <RecoverView onBack={() => setScreen('auth')} />
        ) : (
          <AuthView onRecover={() => setScreen('recover')} onPrivacy={() => setScreen('privacy')} />
        )}
      </div>
    </div>
  );
}
