/**
 * Lazy loader + helpers para o passo de "scan" de documentos (enquadramento
 * com correção de perspetiva). opencv.js é pesado (~8MB), por isso só é
 * carregado quando o utilizador entra no passo de scan, e sempre via CDN
 * (nunca no bundle). Se falhar, o caller deve seguir com a foto original.
 */

const OPENCV_URL = "https://docs.opencv.org/4.7.0/opencv.js";
const JSCANIFY_URL = "https://cdn.jsdelivr.net/npm/jscanify@1.4.0/src/jscanify.min.js";

export interface Corner { x: number; y: number }
export interface CornerPoints {
  topLeftCorner: Corner;
  topRightCorner: Corner;
  bottomRightCorner: Corner;
  bottomLeftCorner: Corner;
}

let loadPromise: Promise<any> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-scan-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`Falha ao carregar ${src}`)));
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.dataset.scanSrc = src;
    el.onload = () => {
      el.dataset.loaded = "1";
      resolve();
    };
    el.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(el);
  });
}

async function waitForCvReady(timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const cv = (window as any).cv;
    if (cv && typeof cv.imread === "function") return;
    if (cv && typeof cv.then === "function") {
      await cv;
      continue;
    }
    if (Date.now() - start > timeoutMs) throw new Error("opencv.js demorou demasiado a carregar");
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** Carrega opencv.js + jscanify e devolve uma instância do scanner. */
export async function loadScanner(): Promise<any> {
  if (!loadPromise) {
    loadPromise = (async () => {
      await loadScript(OPENCV_URL);
      await waitForCvReady();
      await loadScript(JSCANIFY_URL);
      const JScanify = (window as any).jscanify;
      if (!JScanify) throw new Error("jscanify indisponível");
      return new JScanify();
    })().catch((err) => {
      loadPromise = null;
      throw err;
    });
  }
  return loadPromise;
}

export function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível abrir a imagem"));
    };
    img.src = url;
  });
}

/** Desenha a imagem num canvas, limitando o lado maior (poupa memória do opencv). */
export function imageToCanvas(img: HTMLImageElement, maxSide = 1600): HTMLCanvasElement {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(srcW * scale));
  canvas.height = Math.max(1, Math.round(srcH * scale));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function defaultCorners(w: number, h: number): CornerPoints {
  const mx = w * 0.06;
  const my = h * 0.06;
  return {
    topLeftCorner: { x: mx, y: my },
    topRightCorner: { x: w - mx, y: my },
    bottomRightCorner: { x: w - mx, y: h - my },
    bottomLeftCorner: { x: mx, y: h - my },
  };
}

/** Deteção automática dos contornos. Devolve null se não encontrar. */
export function detectCorners(scanner: any, canvas: HTMLCanvasElement): CornerPoints | null {
  const cv = (window as any).cv;
  let img: any = null;
  try {
    img = cv.imread(canvas);
    const contour = scanner.findPaperContour(img);
    if (!contour) return null;
    const pts = scanner.getCornerPoints(contour, img);
    const ok = pts && ["topLeftCorner", "topRightCorner", "bottomRightCorner", "bottomLeftCorner"].every(
      (k) => pts[k] && Number.isFinite(pts[k].x) && Number.isFinite(pts[k].y),
    );
    return ok ? (pts as CornerPoints) : null;
  } catch (err) {
    console.warn("[document-scan] deteção falhou", err);
    return null;
  } finally {
    img?.delete?.();
  }
}

function distance(a: Corner, b: Corner) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Aplica correção de perspetiva + melhoria de contraste e devolve um File JPEG. */
export async function extractDocument(
  scanner: any,
  canvas: HTMLCanvasElement,
  corners: CornerPoints,
  fileName: string,
): Promise<File> {
  const width = Math.round(
    Math.max(
      distance(corners.topLeftCorner, corners.topRightCorner),
      distance(corners.bottomLeftCorner, corners.bottomRightCorner),
    ),
  );
  const height = Math.round(
    Math.max(
      distance(corners.topLeftCorner, corners.bottomLeftCorner),
      distance(corners.topRightCorner, corners.bottomRightCorner),
    ),
  );

  const extracted: HTMLCanvasElement = scanner.extractPaper(
    canvas,
    Math.max(200, width),
    Math.max(200, height),
    corners,
  );

  // Toque de legibilidade: contraste + brilho leves.
  const out = document.createElement("canvas");
  out.width = extracted.width;
  out.height = extracted.height;
  const ctx = out.getContext("2d")!;
  ctx.filter = "contrast(1.25) brightness(1.06) saturate(0.9)";
  ctx.drawImage(extracted, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob((b) => resolve(b), "image/jpeg", 0.85),
  );
  if (!blob) throw new Error("Não foi possível gerar a imagem processada");
  const base = fileName.replace(/\.[^.]+$/, "") || "fatura";
  return new File([blob], `${base}-scan.jpg`, { type: "image/jpeg" });
}
