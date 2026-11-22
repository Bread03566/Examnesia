import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import authClient from '../services/authClient';
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

  useEffect(() => {
    const off = authClient.onAuthChange((u) => {
      setUser(u);
      if (!u) {
        setScreen('auth');
      }
    });
    authClient.restoreSession().finally(() => setStatus('ready'));
    return off;
  }, []);

  const logout = useCallback(() => authClient.logout(), []);

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
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      {screen === 'privacy' ? (
        <PrivacyView onBack={() => setScreen('auth')} />
      ) : screen === 'recover' ? (
        <RecoverView onBack={() => setScreen('auth')} />
      ) : (
        <AuthView onRecover={() => setScreen('recover')} onPrivacy={() => setScreen('privacy')} />
      )}
    </div>
  );
}
