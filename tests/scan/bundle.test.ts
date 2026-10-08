import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BUNDLE = 'dist/app.js';

// Constructs that indicate the app actually *uses* a container-forbidden
// capability. Bare `WebAssembly` is banned (we no longer probe it). Bare
// `OffscreenCanvas` is intentionally NOT banned: Three.js core carries a
// `typeof OffscreenCanvas !== "undefined"` guard whose `new OffscreenCanvas`
// branch never runs where the feature is absent — it is detection, not usage.
const FORBIDDEN: Array<[string, RegExp]> = [
  ['eval(', /\beval\s*\(/],
  ['new Function(', /new\s+Function\s*\(/],
  ['dynamic import(', /\bimport\s*\(/],
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['new Worker(', /new\s+Worker\s*\(/],
  ['WebAssembly', /\bWebAssembly\b/],
];

describe('bundle scan', () => {
  beforeAll(() => {
    if (!existsSync(BUNDLE)) execSync('node build.mjs', { stdio: 'ignore' });
  });

  it('contains no construct that uses a forbidden capability', () => {
    const src = readFileSync(BUNDLE, 'utf8');
    for (const [label, re] of FORBIDDEN) {
      expect(re.test(src), `found forbidden construct: ${label}`).toBe(false);
    }
  });

  it('is a single bundle under 5MB', () => {
    const src = readFileSync(BUNDLE, 'utf8');
    expect(src.includes('(function')).toBe(true);
    expect(src.length).toBeLessThan(5 * 1024 * 1024);
  });
});
