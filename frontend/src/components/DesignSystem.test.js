import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSummary, linkKeyTerms } from './SummaryView';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function listSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(jsx?|css)$/.test(entry.name) && !entry.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

describe('Kabisado UI/UX & Safety Invariants', () => {
  const files = listSourceFiles(SRC_ROOT);

  it('never uses native window.confirm() in application code', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      expect(src, `${file} should use ConfirmDialog instead of window.confirm`).not.toMatch(/\bwindow\.confirm\s*\(/);
    }
  });

  it('never uses dangerouslySetInnerHTML, innerHTML, or eval()', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      expect(src, `${file} contains dangerouslySetInnerHTML`).not.toMatch(/dangerouslySetInnerHTML/);
      expect(src, `${file} contains innerHTML`).not.toMatch(/\.innerHTML\b/);
      expect(src, `${file} contains eval()`).not.toMatch(/\beval\s*\(/);
    }
  });

  it('provides compact mobile bottom navigation and sticky header with top & bottom safe-area support', () => {
    const navbar = readFileSync(join(SRC_ROOT, 'components', 'Navbar.jsx'), 'utf8');
    expect(navbar).toMatch(/aria-label="Mobile navigation"/);
    expect(navbar).toMatch(/safe-area-inset-top/);
    expect(navbar).toMatch(/safe-area-inset-bottom/);
    expect(navbar).toMatch(/aria-current=/);
  });

  it('preserves the Kabisado warm brown palette tokens (#E4E0E1, #D6C0B3, #AB886D, #493628) and responsive narrow-viewport grids', () => {
    const css = readFileSync(join(SRC_ROOT, 'index.css'), 'utf8');
    for (const hex of ['#E4E0E1', '#D6C0B3', '#AB886D', '#493628']) {
      expect(css).toContain(hex);
    }
    const quiz = readFileSync(join(SRC_ROOT, 'views', 'QuizMode.jsx'), 'utf8');
    expect(quiz).toContain('grid-cols-2 sm:grid-cols-4');
    expect(quiz).toContain('grid-cols-1 sm:grid-cols-3');
  });

  it('docks Companion safely above mobile nav and supports hiding on mobile study views', () => {
    const companion = readFileSync(join(SRC_ROOT, 'components', 'Companion.jsx'), 'utf8');
    expect(companion).toMatch(/hideOnMobile/);
    expect(companion).toMatch(/bottom-\[72px\]/);
  });

  it('announces Toast notifications accessibly with ARIA live regions', () => {
    const toast = readFileSync(join(SRC_ROOT, 'components', 'Toast.jsx'), 'utf8');
    expect(toast).toMatch(/aria-live=/);
    expect(toast).toMatch(/aria-label="Dismiss notification"/);
  });

  it('renders Modal with dialog semantics and Escape-key dismissal', () => {
    const modal = readFileSync(join(SRC_ROOT, 'components', 'Modal.jsx'), 'utf8');
    expect(modal).toMatch(/role="dialog"/);
    expect(modal).toMatch(/aria-modal="true"/);
    expect(modal).toMatch(/e\.key === 'Escape'/);
    expect(modal).toMatch(/max-h-\[90dvh\]/);
  });
});

describe('SummaryView helpers', () => {
  it('parses markdown overview, sections, and exam tips', () => {
    const md = [
      'Big idea overview.',
      '## Chapter 1',
      '- Fact one',
      '> Exam tip: Remember the year 1887.',
    ].join('\n');
    const parsed = parseSummary(md);
    expect(parsed.overview).toBe('Big idea overview.');
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].title).toBe('Chapter 1');
    expect(parsed.sections[0].tip).toBe('Remember the year 1887.');
  });

  it('links the first mention of each key term without nesting shorter terms', () => {
    const text = 'The Propaganda Movement published La Solidaridad.';
    const linked = linkKeyTerms(text, [
      { term: 'Propaganda', definition: 'Short' },
      { term: 'Propaganda Movement', definition: 'Full movement' },
    ]);
    expect(linked).toContain('[Propaganda Movement](#key-term-1)');
    expect(linked).not.toContain('[[Propaganda]');
  });
});
