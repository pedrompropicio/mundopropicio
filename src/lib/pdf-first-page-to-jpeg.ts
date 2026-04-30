// Renders the first page of a PDF File to a JPEG File suitable for OCR.
// Uses pdfjs-dist with the bundled worker. Returns null if rendering fails.
import * as pdfjsLib from "pdfjs-dist";
// @ts-expect-error — Vite resolves the worker via ?url
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Configure worker once (idempotent).
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Render the first page of `pdf` to a JPEG File at the requested longest edge (px).
 * Returns null on failure so callers can fall back gracefully (attach raw PDF, skip OCR).
 */
export async function pdfFirstPageToJpeg(
  pdf: File,
  maxEdge = 1600,
  quality = 0.85
): Promise<File | null> {
  try {
    const buf = await pdf.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    if (doc.numPages < 1) return null;
    const page = await doc.getPage(1);

    // Compute scale so the longest edge ≈ maxEdge px.
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(maxEdge / Math.max(v1.width, v1.height), 3); // cap at 3x
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // White background — PDFs are transparent by default and JPEG has no alpha.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    );
    if (!blob) return null;

    const baseName = pdf.name.replace(/\.pdf$/i, "") || "document";
    return new File([blob], `${baseName}.page1.jpg`, { type: "image/jpeg" });
  } catch (err) {
    console.error("[pdfFirstPageToJpeg] failed", err);
    return null;
  }
}
