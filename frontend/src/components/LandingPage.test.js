import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(new URL('../../../wake/index.html', import.meta.url), 'utf8');
const privacyHtml = readFileSync(new URL('../../../wake/privacy.html', import.meta.url), 'utf8');
const landingJs = readFileSync(new URL('../../../wake/landing.js', import.meta.url), 'utf8');
const latestJsonRaw = readFileSync(new URL('../../../wake/release/latest.json', import.meta.url), 'utf8');

describe('Public Landing Page (wake/)', () => {
  it('uses the Kabisado warm brown palette tokens and contains no tagline', () => {
    for (const hex of ['#E4E0E1', '#D6C0B3', '#AB886D', '#493628']) {
      expect(indexHtml).toContain(hex);
      expect(privacyHtml).toContain(hex);
    }
    expect(indexHtml.toLowerCase()).not.toContain('huh? to gotcha');
    expect(privacyHtml.toLowerCase()).not.toContain('huh? to gotcha');
    expect(landingJs.toLowerCase()).not.toContain('huh? to gotcha');
  });

  it('includes all required Phase 5 sections and links to privacy.html', () => {
    expect(indexHtml).toContain('id="features"');
    expect(indexHtml).toContain('id="how-it-works"');
    expect(indexHtml).toContain('id="preview"');
    expect(indexHtml).toContain('id="android-download"');
    expect(indexHtml).toContain('id="install-guide"');
    expect(indexHtml).toContain('id="faq"');
    expect(indexHtml).toContain('./privacy.html');
    expect(indexHtml).toContain('com.kabisado.app');
  });

  it('enforces a strict Content-Security-Policy without inline scripts and preserves the /api/health wake flow', () => {
    expect(indexHtml).toContain('http-equiv="Content-Security-Policy"');
    expect(indexHtml).toContain("script-src 'self'");
    expect(landingJs).toContain('/api/health');
    expect(landingJs).toContain('./release/latest.json');
  });

  it('ships a valid release/latest.json manifest that does not invent a fake APK download link', () => {
    const meta = JSON.parse(latestJsonRaw);
    expect(meta.version_name).toBe('1.0.0');
    expect(meta.version_code).toBe(10000);
    expect(meta.min_sdk).toBe(24);
    expect(meta.published).toBe(false);
    expect(meta.apk_url).toBeNull();
  });
});
