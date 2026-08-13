/**
 * Helpers para o passo de "scan" de documentos (enquadramento + correção de
 * perspetiva). Desde 2026-08 é 100% código próprio (ver document-detect.ts):
 * não carrega opencv.js/jscanify do CDN, o que remove ~8MB de download e o
 * modo de falha "scanner indisponível".
 */

import { detectDocumentQuad, type Pt, type Quad } from "./document-detect";

export type Corner = Pt;
export type CornerPoints = Quad;

/** Mantido por compatibilidade: já não há libs externas para carregar. */
export async function loadScanner(): Promise<any> {
  return {};
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

/** Desenha a imagem num canvas, limitando o lado maior. */
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

/** Deteção automática dos contornos. Devolve null se não encontrar/validar. */
export function detectCorners(_scanner: any, canvas: HTMLCanvasElement): CornerPoints | null {
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const res = detectDocumentQuad({ width: data.width, height: data.height, data: data.data });
    if (!res) return null;
    console.info("[document-scan] deteção", res.strategy, "área", res.areaRatio.toFixed(2));
    return res.quad;
  } catch (err) {
    console.warn("[document-scan] deteção falhou", err);
    return null;
  }
}

function distance(a: Corner, b: Corner) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Resolve a homografia destino -> origem (8 incógnitas, h33 = 1). */
function solveHomography(dst: Pt[], src: Pt[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x: dx, y: dy } = dst[i];
    const { x: sx, y: sy } = src[i];
    A.push([dx, dy, 1, 0, 0, 0, -dx * sx, -dy * sx, sx]);
    A.push([0, 0, 0, dx, dy, 1, -dx * sy, -dy * sy, sy]);
  }
  // eliminação de Gauss com pivot parcial
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c] || 1e-12;
    for (let k = c; k <= 8; k++) A[c][k] /= d;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (!f) continue;
      for (let k = c; k <= 8; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row) => row[8]);
}

/** Warp de perspetiva com amostragem bilinear. */
function warpPerspective(
  src: HTMLCanvasElement,
  corners: CornerPoints,
  outW: number,
  outH: number,
): HTMLCanvasElement {
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  const sImg = sctx.getImageData(0, 0, src.width, src.height);
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d")!;
  const oImg = octx.createImageData(outW, outH);

  const h = solveHomography(
    [
      { x: 0, y: 0 },
      { x: outW - 1, y: 0 },
      { x: outW - 1, y: outH - 1 },
      { x: 0, y: outH - 1 },
    ],
    [corners.topLeftCorner, corners.topRightCorner, corners.bottomRightCorner, corners.bottomLeftCorner],
  );

  const sw = src.width;
  const sh = src.height;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const den = h[6] * x + h[7] * y + 1;
      const sx = (h[0] * x + h[1] * y + h[2]) / den;
      const sy = (h[3] * x + h[4] * y + h[5]) / den;
      const o = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) {
        oImg.data[o] = oImg.data[o + 1] = oImg.data[o + 2] = 255;
        oImg.data[o + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      for (let ch = 0; ch < 3; ch++) {
        const p00 = sImg.data[(y0 * sw + x0) * 4 + ch];
        const p10 = sImg.data[(y0 * sw + x1) * 4 + ch];
        const p01 = sImg.data[(y1 * sw + x0) * 4 + ch];
        const p11 = sImg.data[(y1 * sw + x1) * 4 + ch];
        oImg.data[o + ch] =
          p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
      }
      oImg.data[o + 3] = 255;
    }
  }
  octx.putImageData(oImg, 0, 0);
  return out;
}

/** Aplica correção de perspetiva + melhoria de contraste e devolve um File JPEG. */
export async function extractDocument(
  _scanner: any,
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

  const extracted = warpPerspective(canvas, corners, Math.max(200, width), Math.max(200, height));

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
