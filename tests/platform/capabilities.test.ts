// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { detectCapabilities } from '../../src/platform/capabilities';

afterEach(() => { delete (window as unknown as { xhs?: unknown }).xhs; });

describe('detectCapabilities', () => {
  it('reports miniTool=false when window.xhs is absent', () => {
    const caps = detectCapabilities();
    expect(caps.miniTool).toBe(false);
    expect(typeof caps.webgl).toBe('boolean');
  });
  it('reports miniTool=true when window.xhs.miniTool exists', () => {
    (window as unknown as { xhs: unknown }).xhs = { miniTool: {} };
    expect(detectCapabilities().miniTool).toBe(true);
  });
});
