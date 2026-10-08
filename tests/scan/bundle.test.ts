import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BUNDLE = 'dist/app.js';

// Constructs that indicate the app actually *uses* a container-forbidden
// capability. Bare feature-detection identifiers are intentionally allowed:
// `detectCapabilities` probes `typeof WebAssembly`/`typeof OffscreenCanvas`,
// and Three.js core contains `typeof OffscreenCanvas !== "undefined"` guards
// (`new OffscreenCanvas(...)` is inside that guard and never runs where the
// feature is absent) — neither is usage.
const FORBIDDEN: Array<[string, RegExp]> = [
  ['eval(', /\beval\s*\(/],
  ['new Function(', /new\s+Function\s*\(/],
  ['dynamic import(', /\bimport\s*\(/],
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['new Worker(', /new\s+Worker\s*\(/],
  ['WebAssembly.instantiate', /WebAssembly\s*\.\s*(instantiate|instantiateStreaming|compile|Module|Instance)/],
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
