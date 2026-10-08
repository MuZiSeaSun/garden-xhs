// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { saveToAlbum, shareAsNote } from '../../src/platform/share';

beforeEach(() => { delete (window as unknown as { xhs?: unknown }).xhs; });

describe('share', () => {
  it('returns false without miniTool', async () => {
    expect(await saveToAlbum('data:image/png;base64,AAAA')).toBe(false);
    expect(await shareAsNote('data:image/png;base64,AAAA', { title: 't', content: 'c' })).toBe(false);
  });
  it('strips the data URL prefix before writeTempFile', async () => {
    let received = '';
    (window as unknown as { xhs: unknown }).xhs = {
      miniTool: {
        writeTempFile: async ({ data }: { data: string }) => { received = data; return { filePath: '/tmp/a.png' }; },
        saveImageToPhotosAlbum: async () => {},
      },
    };
    expect(await saveToAlbum('data:image/png;base64,AAAA')).toBe(true);
    expect(received).toBe('AAAA');
  });
  it('returns false when the platform call throws', async () => {
    (window as unknown as { xhs: unknown }).xhs = {
      miniTool: {
        writeTempFile: async () => { throw new Error('boom'); },
        saveImageToPhotosAlbum: async () => {},
      },
    };
    expect(await saveToAlbum('data:image/png;base64,AAAA')).toBe(false);
  });
  it('posts a photo note with the temporary file path', async () => {
    let posted: { pageType?: string; url?: string } = {};
    (window as unknown as { xhs: unknown }).xhs = {
      miniTool: {
        writeTempFile: async () => ({ filePath: '/tmp/a.png' }),
        postNote: async (o: { pageType?: string; mediaInfo: { image_resources?: Array<{ url: string }> } }) => {
          posted = { pageType: o.pageType, url: o.mediaInfo.image_resources?.[0]?.url };
        },
      },
    };
    expect(await shareAsNote('data:image/png;base64,AAAA', { title: 't', content: 'c' })).toBe(true);
    expect(posted).toEqual({ pageType: 'photo_publish', url: '/tmp/a.png' });
  });
});
