// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { saveToAlbum, shareAsNote } from '../../src/platform/share';

beforeEach(() => { delete (window as unknown as { xhs?: unknown }).xhs; });

describe('share', () => {
  it('returns false without miniTool', async () => {
    expect(await saveToAlbum('data:image/png;base64,AAAA')).toBe(false);
    expect(await shareAsNote('data:image/png;base64,AAAA', { title: 't', content: 'c' })).toBe(false);
  });
  it('passes the data URL straight to saveImageToPhotosAlbum', async () => {
    let received = '';
    (window as unknown as { xhs: unknown }).xhs = {
      miniTool: {
        saveImageToPhotosAlbum: async ({ filePath }: { filePath: string }) => { received = filePath; },
      },
    };
    expect(await saveToAlbum('data:image/png;base64,AAAA')).toBe(true);
    expect(received).toBe('data:image/png;base64,AAAA');
  });
  it('returns false when the platform call throws', async () => {
    (window as unknown as { xhs: unknown }).xhs = {
      miniTool: {
        saveImageToPhotosAlbum: async () => { throw new Error('boom'); },
      },
    };
    expect(await saveToAlbum('data:image/png;base64,AAAA')).toBe(false);
  });
  it('posts a photo note with the data URL', async () => {
    let posted: { pageType?: string; url?: string } = {};
    (window as unknown as { xhs: unknown }).xhs = {
      miniTool: {
        postNote: async (o: { pageType?: string; mediaInfo: { image_resources?: Array<{ url: string }> } }) => {
          posted = { pageType: o.pageType, url: o.mediaInfo.image_resources?.[0]?.url };
        },
      },
    };
    expect(await shareAsNote('data:image/png;base64,AAAA', { title: 't', content: 'c' })).toBe(true);
    expect(posted).toEqual({ pageType: 'photo_publish', url: 'data:image/png;base64,AAAA' });
  });
});
