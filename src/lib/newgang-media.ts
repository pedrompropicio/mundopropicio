// Media das edições do festival: vídeos só por link; fotos convertidas para WebP no browser.

export type VideoProvider = "youtube" | "instagram" | "vimeo";
export type EditionVideo = { url: string; provider: VideoProvider; title?: string | null };

export const MAX_EDITION_PHOTOS = 20;
export const MAX_PHOTO_SIDE = 1600;

/** Devolve o fornecedor do vídeo ou null se o URL não for YouTube, Instagram ou Vimeo. */
export function detectVideoProvider(raw: string): VideoProvider | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.replace(/^www\.|^m\./, "");
  if (h === "youtu.be" && u.pathname.length > 1) return "youtube";
  if (h === "youtube.com" && (u.searchParams.get("v") || /^\/(shorts|embed|live)\/[\w-]+/.test(u.pathname))) return "youtube";
  if (h === "instagram.com" && /^\/(reel|reels|p|tv)\/[\w-]+/.test(u.pathname)) return "instagram";
  if ((h === "vimeo.com" && /^\/\d+/.test(u.pathname)) || (h === "player.vimeo.com" && /^\/video\/\d+/.test(u.pathname))) return "vimeo";
  return null;
}

export function scaledSize(w: number, h: number, max = MAX_PHOTO_SIDE): { w: number; h: number } {
  const side = Math.max(w, h);
  if (side <= max) return { w, h };
  const k = max / side;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/** Converte uma imagem para WebP com o lado maior ≤ 1600 px. */
export async function toWebp(file: File, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const { w, h } = scaledSize(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", quality));
  if (!blob) throw new Error("Conversão para WebP falhou");
  return blob;
}
