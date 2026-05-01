/**
 * Pipeline de pré-processamento de ficheiros para OCR de faturas:
 *  - DNG/RAW → extrai JPEG embutido (preview)
 *  - PDF → 1ª página renderizada como JPEG
 *  - Imagens → comprimidas a ≤1280px / JPEG ~70% (~150-300 KB)
 *
 * Usa-se em TransactionFormModal e SplitByIvaModal para garantir que a edge
 * function `extract-invoice-total` recebe sempre um JPEG/PNG legível pelo
 * Gemini e dentro do limite de memória.
 */
import { extractJpegFromDng, isDngFile } from "@/lib/dng-extract-preview";
import { pdfFirstPageToJpeg } from "@/lib/pdf-first-page-to-jpeg";

export type OcrPrepareError =
  | { kind: "raw_no_preview" }
  | { kind: "raw_failed" }
  | { kind: "pdf_failed" }
  | { kind: "unsupported_format" };

export type OcrPrepareResult =
  | { ok: true; file: File }
  | { ok: false; error: OcrPrepareError };

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function compressImageForOcr(file: File): Promise<File> {
  if (file.size < 200 * 1024 && /^image\/jpe?g$/i.test(file.type)) return file;

  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Não foi possível preparar a imagem para OCR"));
      image.src = objectUrl!;
    });

    const maxSide = 1280;
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível para OCR");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.7);
    });
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "invoice";
    console.log(`[invoice-ocr] compressed ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB`);
    return new File([blob], `${baseName}-ocr.jpg`, { type: "image/jpeg" });
  } catch (err) {
    console.warn("OCR image preparation failed, using original file", err);
    return file;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareFileForInvoiceOcr(original: File): Promise<OcrPrepareResult> {
  let file = original;

  // 1) DNG/RAW → JPEG embutido
  if (isDngFile(original)) {
    try {
      const jpeg = await extractJpegFromDng(original);
      if (!jpeg) return { ok: false, error: { kind: "raw_no_preview" } };
      file = jpeg;
    } catch (err) {
      console.error("DNG extract failed", err);
      return { ok: false, error: { kind: "raw_failed" } };
    }
  }

  // 2) PDF → 1ª página JPEG
  let ocrSource: File | null = null;
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const jpg = await pdfFirstPageToJpeg(file);
    if (!jpg) return { ok: false, error: { kind: "pdf_failed" } };
    ocrSource = jpg;
  } else {
    const isImageMime = /^image\/(jpeg|jpg|png|webp|heic|heif|tiff|x-adobe-dng|dng)$/i.test(file.type);
    const isImageExt = /\.(jpe?g|png|webp|heic|heif|dng|tiff?)$/i.test(file.name);
    if (!(isImageMime || isImageExt)) {
      return { ok: false, error: { kind: "unsupported_format" } };
    }
    ocrSource = file;
  }

  // 3) compressão
  const prepared = await compressImageForOcr(ocrSource);
  return { ok: true, file: prepared };
}
