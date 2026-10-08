export interface MiniToolApi {
  getLaunchOptions(): Promise<{
    miniToolEnv?: { buildVersion?: number; userDataPath?: string };
  }>;
  setStorage(opts: { key: string; data: string; encrypt?: boolean }): Promise<void>;
  getStorage(opts: { key: string; encrypt?: boolean }): Promise<{ data: string | null }>;
  removeStorage(opts: { key: string }): Promise<void>;
  clearStorage(): Promise<void>;
  writeTempFile(opts: { data: string }): Promise<{ filePath: string }>;
  saveImageToPhotosAlbum(opts: { filePath: string }): Promise<void>;
  postNote(opts: {
    title?: string;
    content?: string;
    pageType?: 'video_publish' | 'photo_publish' | 'slides_edit';
    mediaInfo: {
      image_resources?: Array<{ url: string }>;
      video_resources?: { video_url: string; cover_url?: string };
    };
  }): Promise<void>;
}

declare global {
  interface Window {
    xhs?: {
      launchOptions?: {
        miniToolEnv?: { buildVersion?: number; userDataPath?: string };
      };
      miniTool?: MiniToolApi;
    };
  }
}
