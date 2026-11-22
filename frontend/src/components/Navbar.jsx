import React, { useState } from 'react';
import { BookOpen, Layers, BarChart3, LogOut, UserRound, ShieldCheck, GraduationCap } from 'lucide-react';
import { useAuth } from './AuthGate';
import AccountModal from './AccountModal';
import Mascot from './Mascot';

export default function Navbar({ activeTab, onSelectTab, currentDoc }) {
  const { user, logout } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);

  const isDocActive = ['document', 'flashcards', 'quiz', 'chat'].includes(activeTab);

  const navItems = [
    { id: 'library', label: 'Library', mobileLabel: 'Library', icon: BookOpen, active: activeTab === 'library' },
    { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Progress', icon: BarChart3, active: activeTab === 'dashboard' },
    { id: 'exam', label: 'Exam Prep', mobileLabel: 'Exam', icon: GraduationCap, active: activeTab === 'exam' },
  ];

  if (currentDoc) {
    navItems.push({
      id: 'document',
      label: currentDoc.title,
      mobileLabel: 'Module',
      icon: Layers,
      active: isDocActive,
      title: currentDoc.title,
      truncate: true,
    });
  }

  if (user?.role === 'admin') {
    navItems.push({
      id: 'admin',
      label: 'Admin',
      mobileLabel: 'Admin',
      icon: ShieldCheck,
      active: activeTab === 'admin',
    });
  }

  return (
    <>
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-3">
          {/* Brand & Mascot */}
          <button
            type="button"
            onClick={() => onSelectTab('library')}
            className="flex items-center gap-2.5 text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 group shrink-0"
          >
            <Mascot mood="sleepy" size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span translate="no" className="notranslate font-extrabold text-lg md:text-xl tracking-tight text-slate-900 group-hover:text-amber-700 transition">
                  Kabisado
                </span>
                <span className="hidden lg:inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                  Study Companion
                </span>
              </div>
              <p className="hidden lg:block text-[11px] font-medium text-slate-500 leading-tight">
                From huh? to gotcha!
              </p>
            </div>
          </button>

          {/* Desktop & Tablet Navigation */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-1 lg:gap-1.5 min-w-0 flex-1 justify-center overflow-x-auto px-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  aria-current={item.active ? 'page' : undefined}
                  title={item.title || item.label}
                  className={`min-h-[38px] px-2.5 lg:px-3.5 py-2 text-xs lg:text-sm font-semibold rounded-xl transition inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    item.truncate ? 'max-w-[120px] xl:max-w-[165px]' : ''
                  } ${
                    item.active
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className={item.truncate ? 'truncate' : ''}>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Account & Logout Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              className="min-h-[40px] px-2.5 py-1.5 text-xs sm:text-sm font-semibold rounded-xl text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5 max-w-[120px] xl:max-w-[140px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              title="Account settings"
              aria-label="Account settings"
            >
              <UserRound className="w-4 h-4 shrink-0" />
              <span className="truncate hidden sm:inline" translate="no">{user?.display_name}</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="min-h-[40px] min-w-[40px] px-2.5 py-1.5 text-xs sm:text-sm font-semibold rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 inline-flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span className="hidden lg:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Compact Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-2px_10px_rgba(42,31,23,0.06)] pb-[env(safe-area-inset-bottom)]"
      >
        <div
          className="grid h-14 max-w-lg mx-auto px-1"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={item.active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 px-1 py-1 text-[11px] font-semibold transition rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 ${
                  item.active ? 'text-amber-800' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-9 h-6 rounded-full transition ${
                    item.active ? 'bg-amber-100 text-amber-900' : ''
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span className="truncate max-w-full leading-none">{item.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {accountOpen && user && <AccountModal user={user} onClose={() => setAccountOpen(false)} />}
    </>
  );
}
