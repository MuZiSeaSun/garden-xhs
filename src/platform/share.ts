// 端能力分享：直接把 data: base64 传给平台 API，避免中间 await 丢失用户激活上下文。
// 官方文档明确 saveImageToPhotosAlbum / postNote 的媒体字段接受 data: base64（含前缀）。
export async function saveToAlbum(dataUrl: string): Promise<boolean> {
  const mt = window.xhs?.miniTool;
  if (!mt?.saveImageToPhotosAlbum) return false;

  try {
    await mt.saveImageToPhotosAlbum({ filePath: dataUrl });
    return true;
  } catch (err) {
    console.error('[share] saveImageToPhotosAlbum failed', err);
    return false;
  }
}

export async function shareAsNote(
  dataUrl: string,
  meta: { title: string; content: string },
): Promise<boolean> {
  const mt = window.xhs?.miniTool;
  if (!mt?.postNote) return false;

  try {
    await mt.postNote({
      title: meta.title,
      content: meta.content,
      pageType: 'photo_publish',
      mediaInfo: { image_resources: [{ url: dataUrl }] },
    });
    return true;
  } catch (err) {
    console.error('[share] postNote failed', err);
    return false;
  }
}
