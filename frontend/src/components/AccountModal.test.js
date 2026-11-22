import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The navbar has a backdrop filter, which traps `position: fixed` descendants inside the
// 64px header bar. AccountModal delegates to Modal, which portals into document.body.
describe('AccountModal placement', () => {
  it('is rendered into document.body via Modal portal, not inside the navbar', () => {
    const accountSource = readFileSync(new URL('./AccountModal.jsx', import.meta.url), 'utf8');
    const modalSource = readFileSync(new URL('./Modal.jsx', import.meta.url), 'utf8');
    expect(accountSource).toMatch(/<Modal\b/);
    expect(modalSource).toMatch(/createPortal\(/);
    expect(modalSource).toMatch(/document\.body/);
  });
});
