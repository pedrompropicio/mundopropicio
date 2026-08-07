// Helper partilhado para normalizar ficheiros de imagem antes de upload/IA.
// Objetivo principal: fotos de iPhone em HEIC/HEIF, que o browser não renderiza
// e que a IA (Gemini via gateway) não aceita, são convertidas para JPEG no
// cliente. Outros formatos passam intactos (sem recompressão).

export function isHeicFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime === "image/heic" || mime === "image/heif" || mime === "image/heic-sequence" || mime === "image/heif-sequence") {
    return true;
  }
  // O browser dá muitas vezes MIME vazio para HEIC — cair na extensão.
  return /\.(heic|heif)$/i.test(file.name);
}

/** Aceita HEIC/HEIF nos inputs de foto/anexo, além do que já aceitam. */
export const HEIC_ACCEPT = "image/heic,image/heif,.heic,.heif";

/**
 * Fallback: alguns HEIC do iPhone (variantes que o heic2any não lê) são
 * decodificáveis pelo próprio browser (Safari/iOS decodifica HEIC nativamente).
 * Nesse caso desenhamos num canvas e exportamos JPEG.
 */
async function heicViaBrowserDecode(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    );
  } catch {
    return null;
  }
}

/**
 * Devolve sempre um File utilizável: HEIC/HEIF → JPEG (qualidade ~0.85),
 * restantes formatos devolvidos sem alteração.
 * Lança erro descritivo (com a mensagem real da falha) se a conversão falhar,
 * para o caller poder mostrar no toast e diagnosticarmos.
 */
export async function normalizeImageFile(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;

  let blob: Blob | null = null;
  let firstError: unknown = null;

  // heic-to usa libheif mais recente e suporta variantes HEVC dos iPhone que
  // o heic2any antigo rejeita com ERR_LIBHEIF "format not supported".
  try {
    const { heicTo } = await import("heic-to/csp");
    const converted = await heicTo({ blob: file, type: "image/jpeg", quality: 0.85 });
    blob = converted instanceof Blob ? converted : null;
  } catch (err) {
    firstError = err;
    console.error("[image-upload] HEIC conversion failed (heic-to)", err);
  }

  // Compatibilidade com ficheiros que eram aceites pelo pipeline anterior.
  if (!blob || blob.size === 0) try {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
    blob = Array.isArray(converted) ? converted[0] : converted;
  } catch (err) {
    firstError ??= err;
    console.error("[image-upload] HEIC conversion failed (heic2any)", err);
  }

  if (!blob || blob.size === 0) {
    blob = await heicViaBrowserDecode(file);
  }

  if (!blob || blob.size === 0) {
    const detail =
      (firstError as any)?.message ??
      (typeof firstError === "string" ? firstError : null) ??
      "o browser também não conseguiu descodificar o ficheiro";
    throw new Error(`Não foi possível converter a foto (HEIC): ${detail}. Tenta exportar como JPEG.`);
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "foto";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
}

