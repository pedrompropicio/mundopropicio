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
 * Devolve sempre um File utilizável: HEIC/HEIF → JPEG (qualidade ~0.85),
 * restantes formatos devolvidos sem alteração.
 * Lança erro descritivo se a conversão falhar (caller mostra toast).
 */
export async function normalizeImageFile(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;

  const { default: heic2any } = await import("heic2any");
  let converted: Blob | Blob[];
  try {
    converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  } catch (err) {
    console.error("[image-upload] HEIC conversion failed", err);
    throw new Error("Não foi possível converter a foto (HEIC). Tenta exportar como JPEG.");
  }
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!blob || blob.size === 0) {
    throw new Error("Não foi possível converter a foto (HEIC). Tenta exportar como JPEG.");
  }
  const baseName = file.name.replace(/\.[^.]+$/, "") || "foto";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
}
