function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

export async function saveToAlbum(dataUrl: string): Promise<boolean> {
  const mt = window.xhs?.miniTool;
  if (!mt?.writeTempFile || !mt?.saveImageToPhotosAlbum) return false;

  try {
    const { filePath } = await mt.writeTempFile({ data: dataUrlToBase64(dataUrl) });
    await mt.saveImageToPhotosAlbum({ filePath });
    return true;
  } catch {
    return false;
  }
}

export async function shareAsNote(
  dataUrl: string,
  meta: { title: string; content: string },
): Promise<boolean> {
  const mt = window.xhs?.miniTool;
  if (!mt?.writeTempFile || !mt?.postNote) return false;

  try {
    const { filePath } = await mt.writeTempFile({ data: dataUrlToBase64(dataUrl) });
    await mt.postNote({
      title: meta.title,
      content: meta.content,
      pageType: 'photo_publish',
      mediaInfo: { image_resources: [{ url: filePath }] },
    });
    return true;
  } catch {
    return false;
  }
}
