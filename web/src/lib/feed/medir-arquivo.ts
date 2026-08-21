/** Lê dimensões e duração no navegador — o servidor não tem como saber. */
export async function medirArquivo(
  arquivo: File
): Promise<{ width?: number; height?: number; duration_seconds?: number }> {
  if (arquivo.type.startsWith("image/")) {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({});
      img.src = URL.createObjectURL(arquivo);
    });
  }
  if (arquivo.type.startsWith("video/")) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () =>
        resolve({ width: v.videoWidth, height: v.videoHeight, duration_seconds: v.duration });
      v.onerror = () => resolve({});
      v.src = URL.createObjectURL(arquivo);
    });
  }
  return {};
}
