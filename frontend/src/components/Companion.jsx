import React, { useEffect, useRef, useState } from 'react';
import { EyeOff, PawPrint } from 'lucide-react';
import { ANIMALS, ANIMAL_KEYS, PetFigure, setPetPrefs, subscribePointer, usePetPrefs } from './pets';

/*
 * The desk-buddy pet in the corner of the screen. It watches the cursor, naps when you go
 * idle, and purrs when petted. Its menu also picks the animal used as the app's mascot.
 *
 * On mobile (< 768px), it docks cleanly above the compact bottom navigation bar and hides
 * automatically during focused input views (like Chat) so it never covers controls.
 */

const IDLE_MS = 25000;

export default function Companion({ hideOnMobile = false }) {
  const prefs = usePetPrefs();
  const [mood, setMood] = useState('open'); // open | happy | sleep
  const [menuOpen, setMenuOpen] = useState(false);
  const [bubble, setBubble] = useState(null);
  const [hearts, setHearts] = useState([]);
  const idleTimer = useRef(0);

  const animal = ANIMALS[prefs.animal];

  // Going idle puts the pet to sleep; any pointer movement wakes it
  useEffect(() => {
    if (prefs.hidden) return undefined;
    const resetIdle = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setMood('sleep'), IDLE_MS);
    };
    const unsubscribe = subscribePointer(() => {
      setMood((m) => (m === 'sleep' ? 'open' : m));
      resetIdle();
    });
    resetIdle();
    return () => {
      unsubscribe();
      clearTimeout(idleTimer.current);
    };
  }, [prefs.hidden]);

  const handlePet = () => {
    setMood('happy');
    setBubble(animal.sounds[Math.floor(Math.random() * animal.sounds.length)]);
    const id = Date.now();
    setHearts((h) => [...h, ...[0, 1, 2].map((i) => ({ id: `${id}-${i}`, offset: (i - 1) * 16, delay: i * 90 }))]);
    setTimeout(() => setHearts((h) => h.filter((heart) => !heart.id.startsWith(String(id)))), 1300);
    setTimeout(() => setBubble(null), 2400);
    setTimeout(() => setMood((m) => (m === 'happy' ? 'open' : m)), 1200);
  };

  const visibilityClass = hideOnMobile ? 'hidden md:block' : '';

  if (prefs.hidden) {
    return (
      <button
        type="button"
        onClick={() => setPetPrefs({ hidden: false })}
        className={`${visibilityClass} animate-in fade-in zoom-in-95 fixed bottom-[72px] right-3 md:bottom-4 md:left-4 md:right-auto z-30 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500`}
        aria-label={`Show ${animal.name}`}
        title={`Show ${animal.name}`}
      >
        <PawPrint className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div
      className={`${visibilityClass} group/pet fixed bottom-[72px] right-3 md:bottom-4 md:left-4 md:right-auto z-30 select-none`}
    >
      {/* Speech bubble */}
      {bubble && (
        <div
          key={bubble}
          role="status"
          aria-live="polite"
          className="animate-in fade-in slide-in-from-bottom-2 absolute bottom-full right-0 md:right-auto md:left-2 mb-1 w-max max-w-[200px] rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-md"
        >
          {bubble}
        </div>
      )}

      {/* Floating hearts */}
      {hearts.map((h) => (
        <span
          key={h.id}
          className="pet-heart pointer-events-none absolute bottom-14 md:bottom-16 left-1/2 text-base text-rose-500"
          style={{ '--x': `${h.offset}px`, animationDelay: `${h.delay}ms` }}
          aria-hidden="true"
        >
          ♥
        </span>
      ))}

      <button
        type="button"
        onClick={handlePet}
        aria-label={`Pet ${animal.name}`}
        title={mood === 'sleep' ? `${animal.name} is napping. Move to wake it.` : `Pet ${animal.name}`}
        className="block h-14 w-14 md:h-20 md:w-20 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <PetFigure animal={prefs.animal} mood={mood} track className="h-full w-full drop-shadow-md" />
      </button>

      {/* Switch animal / hide */}
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Choose a study buddy"
        aria-expanded={menuOpen}
        className={`absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:opacity-100 ${
          menuOpen ? 'opacity-100' : 'opacity-0 group-hover/pet:opacity-100 [@media(hover:none)]:opacity-100'
        }`}
      >
        <PawPrint className="h-3.5 w-3.5" />
      </button>

      {menuOpen && (
        <div className="animate-in fade-in zoom-in-95 absolute bottom-full right-0 md:right-auto md:left-0 mb-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-slate-600">
            Your study buddy
          </p>
          <div className="grid grid-cols-2 gap-0.5">
            {ANIMAL_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setPetPrefs({ animal: key });
                  setMenuOpen(false);
                  setMood('open');
                }}
                className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition ${
                  prefs.animal === key
                    ? 'bg-amber-100 text-amber-900'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span aria-hidden="true">{ANIMALS[key].emoji}</span>
                <span className="truncate">{ANIMALS[key].name}</span>
              </button>
            ))}
          </div>
          <div className="mt-1 border-t border-slate-100 pt-1">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setPetPrefs({ hidden: true });
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <EyeOff className="h-3.5 w-3.5" />
              <span>Hide study buddy</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
