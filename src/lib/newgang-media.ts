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

export const EDITION_BUCKET = "portal-marketing-images";

/**
 * Caminho no bucket: o 1.º segmento TEM de ser o company_id da empresa ativa
 * (policy portal_marketing_images_insert: foldername[1]::uuid = current_company_id()).
 */
export function editionPhotoPath(companyId: string, brandKey: string, year: number, id: string): string {
  if (!companyId) throw new Error("Sem empresa ativa — não é possível carregar fotos.");
  return `${companyId}/festival-editions/${brandKey}/${year}/${id}.webp`;
}

export type EditionUploadDeps = {
  companyId: () => Promise<string | null>;
  convert: (f: File) => Promise<Blob>;
  upload: (path: string, blob: Blob) => Promise<{ error: { message?: string } | null }>;
  publicUrl: (path: string) => string;
  save: (patch: { gallery_urls: string[]; cover_url?: string }) => Promise<{ error: { message?: string } | null }>;
  newId: () => string;
  toast: { error: (m: string) => void; warning: (m: string) => void; success: (m: string) => void };
};

/**
 * Carrega fotos em sequência pela ordem recebida, até ao máximo por edição.
 * Grava em festival_editions só as que subiram; qualquer falha mostra a mensagem real.
 * Devolve as fotos gravadas (vazio se nada foi gravado).
 */
export async function uploadEditionPhotos(
  files: File[],
  edition: { brandKey: string; year: number; gallery: string[]; coverUrl: string | null },
  d: EditionUploadDeps,
): Promise<string[]> {
  if (!files.length) return [];
  const room = MAX_EDITION_PHOTOS - edition.gallery.length;
  if (room <= 0) { d.toast.error(`Máximo de ${MAX_EDITION_PHOTOS} fotos por edição.`); return []; }
  if (files.length > room) d.toast.warning(`Máximo de ${MAX_EDITION_PHOTOS} fotos: só ${room} cabem; as restantes foram ignoradas.`);
  const list = files.slice(0, room);
  const urls: string[] = [];
  let failure: string | null = null;
  try {
    const companyId = await d.companyId();
    if (!companyId) throw new Error("Sem empresa ativa — não é possível carregar fotos.");
    for (const f of list) {
      try {
        const blob = await d.convert(f);
        const path = editionPhotoPath(companyId, edition.brandKey, edition.year, d.newId());
        const { error } = await d.upload(path, blob);
        if (error) throw new Error(error.message ?? "upload recusado");
        urls.push(d.publicUrl(path));
      } catch (e) {
        failure = `Falha no upload de "${f.name}": ${(e as Error)?.message ?? e}`;
        break;
      }
    }
  } catch (e) {
    failure = `Falha no upload: ${(e as Error)?.message ?? e}`;
  }
  if (urls.length) {
    const patch: { gallery_urls: string[]; cover_url?: string } = { gallery_urls: [...edition.gallery, ...urls] };
    if (!edition.coverUrl && edition.gallery.length === 0) patch.cover_url = urls[0];
    const { error } = await d.save(patch);
    if (error) {
      d.toast.error(`Falha ao gravar as fotos na edição: ${error.message ?? "erro desconhecido"}`);
      if (failure) d.toast.error(failure);
      return [];
    }
  }
  if (failure) d.toast.error(failure);
  if (urls.length) d.toast.success(`${urls.length} foto(s) carregada(s).`);
  return urls;
}
