/**
 * Deteção de documentos (quadrilátero de papel) em TypeScript puro.
 *
 * Pipeline clássico de document scanner, sem dependências externas (para ser
 * testável em Node e não depender do opencv.js de 8MB):
 *   1. downscale para ~700px no lado maior
 *   2. grayscale + gaussian blur
 *   3. estratégias em cascata: Otsu, adaptive threshold e Sobel+dilate
 *   4. maior componente conexa -> convex hull -> approxPolyDP -> melhor quad
 *   5. validação (área 15%-95% do frame, não ≈ frame inteiro, convexo)
 *   6. cantos reescalados para a resolução original
 */

export interface Pt { x: number; y: number }
export interface RGBAImage { width: number; height: number; data: Uint8ClampedArray | Uint8Array }
export interface GrayImage { width: number; height: number; data: Uint8ClampedArray }

export interface Quad {
  topLeftCorner: Pt;
  topRightCorner: Pt;
  bottomRightCorner: Pt;
  bottomLeftCorner: Pt;
}

export interface DetectResult {
  quad: Quad;
  strategy: string;
  score: number;
  /** área do quad / área do frame (0-1) */
  areaRatio: number;
}

/* ------------------------------------------------------------------ básicos */

export function toGray(img: RGBAImage): GrayImage {
  const { width, height, data } = img;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
  }
  return { width, height, data: out };
}

/** Downscale por média de blocos (box filter) — robusto a ruído. */
export function downscaleGray(src: GrayImage, maxSide = 700): { img: GrayImage; scale: number } {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  if (scale >= 1) return { img: src, scale: 1 };
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const out = new Uint8ClampedArray(w * h);
  const fx = src.width / w;
  const fy = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.min(src.height, Math.max(y0 + 1, Math.floor((y + 1) * fy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.min(src.width, Math.max(x0 + 1, Math.floor((x + 1) * fx)));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          sum += src.data[yy * src.width + xx];
          n++;
        }
      }
      out[y * w + x] = sum / n;
    }
  }
  return { img: { width: w, height: h, data: out }, scale };
}

/** Gaussian blur separável 5x5. */
export function blurGray(src: GrayImage, passes = 1): GrayImage {
  const k = [1, 4, 6, 4, 1];
  const kSum = 16;
  let cur = src.data;
  const { width: w, height: h } = src;
  for (let p = 0; p < passes; p++) {
    const tmp = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = -2; i <= 2; i++) {
          const xx = Math.min(w - 1, Math.max(0, x + i));
          s += cur[y * w + xx] * k[i + 2];
        }
        tmp[y * w + x] = s / kSum;
      }
    }
    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = -2; i <= 2; i++) {
          const yy = Math.min(h - 1, Math.max(0, y + i));
          s += tmp[yy * w + x] * k[i + 2];
        }
        out[y * w + x] = s / kSum;
      }
    }
    cur = out;
  }
  return { width: w, height: h, data: cur };
}

function otsuLevel(g: GrayImage): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.data.length; i++) hist[g.data[i]]++;
  const total = g.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let level = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      level = t;
    }
  }
  return level;
}

function integral(g: GrayImage): Float64Array {
  const { width: w, height: h, data } = g;
  const ii = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += data[y * w + x];
      ii[(y + 1) * (w + 1) + (x + 1)] = ii[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  return ii;
}

/** Threshold de brilho: pixels claros (papel) = 1. */
export function thresholdOtsu(g: GrayImage): Uint8Array {
  const level = otsuLevel(g);
  const out = new Uint8Array(g.width * g.height);
  for (let i = 0; i < out.length; i++) out[i] = g.data[i] > level ? 1 : 0;
  return out;
}

export function thresholdAdaptive(g: GrayImage, win = 41, c = 8): Uint8Array {
  const { width: w, height: h } = g;
  const ii = integral(g);
  const r = Math.max(1, Math.floor(win / 2));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const sum =
        ii[(y1 + 1) * (w + 1) + (x1 + 1)] -
        ii[y0 * (w + 1) + (x1 + 1)] -
        ii[(y1 + 1) * (w + 1) + x0] +
        ii[y0 * (w + 1) + x0];
      out[y * w + x] = g.data[y * w + x] > sum / area + c ? 1 : 0;
    }
  }
  return out;
}

/** Sobel magnitude -> threshold -> dilate (aproximação de Canny+dilate). */
export function edgeMask(g: GrayImage): Uint8Array {
  const { width: w, height: h, data } = g;
  const mag = new Float32Array(w * h);
  let sum = 0;
  let sum2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -data[i - w - 1] - 2 * data[i - 1] - data[i + w - 1] +
        data[i - w + 1] + 2 * data[i + 1] + data[i + w + 1];
      const gy =
        -data[i - w - 1] - 2 * data[i - w] - data[i - w + 1] +
        data[i + w - 1] + 2 * data[i + w] + data[i + w + 1];
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      sum += m;
      sum2 += m * m;
    }
  }
  const n = w * h;
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  const t = Math.max(18, mean + 1.5 * std);
  const bin = new Uint8Array(n);
  for (let i = 0; i < n; i++) bin[i] = mag[i] >= t ? 1 : 0;
  return dilate(bin, w, h, 2);
}

export function dilate(mask: Uint8Array, w: number, h: number, iterations = 1): Uint8Array {
  let cur = mask;
  for (let it = 0; it < iterations; it++) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let on = 0;
        for (let dy = -1; dy <= 1 && !on; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            if (cur[yy * w + xx]) { on = 1; break; }
          }
        }
        out[y * w + x] = on;
      }
    }
    cur = out;
  }
  return cur;
}

/* ------------------------------------------------- componentes e geometria */

/** Maior componente conexa (4-conectividade) dos pixels a 1. */
export function largestComponent(mask: Uint8Array, w: number, h: number): Pt[] | null {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  let best: Pt[] | null = null;
  let bestSize = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    const pts: Pt[] = [];
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      pts.push({ x, y });
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
    }
    if (pts.length > bestSize) { bestSize = pts.length; best = pts; }
  }
  return best;
}

export function convexHull(pts: Pt[]): Pt[] {
  if (pts.length < 4) return pts.slice();
  const s = pts.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function perimeter(pts: Pt[]): number {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    p += Math.hypot(a.x - b.x, a.y - b.y);
  }
  return p;
}

/** Douglas-Peucker num polígono fechado. */
export function approxPolyDP(pts: Pt[], epsilon: number): Pt[] {
  if (pts.length <= 4) return pts.slice();
  const simplifyOpen = (list: Pt[]): Pt[] => {
    if (list.length < 3) return list;
    const a = list[0];
    const b = list[list.length - 1];
    let maxD = -1;
    let idx = 0;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = 1; i < list.length - 1; i++) {
      const d = Math.abs((list[i].x - a.x) * dy - (list[i].y - a.y) * dx) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= epsilon) return [a, b];
    const left = simplifyOpen(list.slice(0, idx + 1));
    const right = simplifyOpen(list.slice(idx));
    return left.slice(0, -1).concat(right);
  };
  // parte o anel nos dois pontos mais distantes para não perder cantos
  let i0 = 0;
  let i1 = 0;
  let maxDist = -1;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d > maxDist) { maxDist = d; i0 = i; i1 = j; }
    }
  }
  const arcA: Pt[] = [];
  for (let i = i0; i !== i1; i = (i + 1) % pts.length) arcA.push(pts[i]);
  arcA.push(pts[i1]);
  const arcB: Pt[] = [];
  for (let i = i1; i !== i0; i = (i + 1) % pts.length) arcB.push(pts[i]);
  arcB.push(pts[i0]);
  const a = simplifyOpen(arcA);
  const b = simplifyOpen(arcB);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

/** Reduz o hull e escolhe os 4 vértices que maximizam área. */
export function bestQuadFromHull(hull: Pt[]): Pt[] | null {
  if (hull.length < 4) return null;
  let cand = hull;
  const per = perimeter(hull);
  for (const f of [0.02, 0.03, 0.05, 0.08]) {
    if (cand.length <= 10) break;
    cand = approxPolyDP(hull, per * f);
  }
  if (cand.length < 4) cand = hull;
  if (cand.length > 14) {
    // amostra uniforme para manter a busca barata
    const step = cand.length / 14;
    const sampled: Pt[] = [];
    for (let i = 0; i < 14; i++) sampled.push(cand[Math.floor(i * step)]);
    cand = sampled;
  }
  if (cand.length === 4) return cand;
  let best: Pt[] | null = null;
  let bestArea = 0;
  const n = cand.length;
  for (let a = 0; a < n - 3; a++)
    for (let b = a + 1; b < n - 2; b++)
      for (let c = b + 1; c < n - 1; c++)
        for (let d = c + 1; d < n; d++) {
          const q = [cand[a], cand[b], cand[c], cand[d]];
          const area = polygonArea(q);
          if (area > bestArea) { bestArea = area; best = q; }
        }
  return best;
}

/** Ordena 4 pontos em TL, TR, BR, BL. */
export function orderCorners(pts: Pt[]): Quad {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const sorted = pts.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let startIdx = 0;
  let bestSum = Infinity;
  sorted.forEach((p, i) => {
    const s = p.x + p.y;
    if (s < bestSum) { bestSum = s; startIdx = i; }
  });
  const r = [0, 1, 2, 3].map((i) => sorted[(startIdx + i) % 4]);
  return {
    topLeftCorner: r[0],
    topRightCorner: r[1],
    bottomRightCorner: r[2],
    bottomLeftCorner: r[3],
  };
}

function isConvex(pts: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = pts[(i + 2) % pts.length];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-6) continue;
    const s = cr > 0 ? 1 : -1;
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Considera falha quando o quad é praticamente o frame todo. */
function looksLikeFullFrame(q: Quad, w: number, h: number): boolean {
  const tol = 0.025 * Math.max(w, h);
  const near = (p: Pt, x: number, y: number) => Math.abs(p.x - x) <= tol && Math.abs(p.y - y) <= tol;
  const atFrame =
    near(q.topLeftCorner, 0, 0) &&
    near(q.topRightCorner, w - 1, 0) &&
    near(q.bottomRightCorner, w - 1, h - 1) &&
    near(q.bottomLeftCorner, 0, h - 1);
  if (atFrame) return true;
  return polygonArea([q.topLeftCorner, q.topRightCorner, q.bottomRightCorner, q.bottomLeftCorner]) / (w * h) > 0.95;
}

interface Candidate { quad: Quad; score: number; areaRatio: number; strategy: string }

function evaluate(mask: Uint8Array, w: number, h: number, strategy: string): Candidate | null {
  const comp = largestComponent(mask, w, h);
  if (!comp || comp.length < 0.02 * w * h) return null;
  const hull = convexHull(comp);
  const quadPts = bestQuadFromHull(hull);
  if (!quadPts || quadPts.length !== 4) return null;
  const quad = orderCorners(quadPts);
  const ordered = [quad.topLeftCorner, quad.topRightCorner, quad.bottomRightCorner, quad.bottomLeftCorner];
  if (!isConvex(ordered)) return null;
  const area = polygonArea(ordered);
  const areaRatio = area / (w * h);
  if (areaRatio < 0.15 || areaRatio > 0.95) return null;
  if (looksLikeFullFrame(quad, w, h)) return null;
  const sides = ordered.map((p, i) => {
    const q = ordered[(i + 1) % 4];
    return Math.hypot(p.x - q.x, p.y - q.y);
  });
  const minSide = Math.min(...sides);
  const maxSide = Math.max(...sides);
  if (minSide < 0.1 * Math.max(w, h) || minSide / maxSide < 0.12) return null;
  const hullArea = polygonArea(hull) || 1;
  const rectangularity = Math.min(1, hullArea / area);
  const score = areaRatio * Math.pow(rectangularity, 2);
  return { quad, score, areaRatio, strategy };
}

/**
 * Deteta o quadrilátero do documento. Devolve cantos na resolução ORIGINAL
 * da imagem recebida, ou null se nenhuma estratégia produzir candidato válido.
 */
export function detectDocumentQuad(img: RGBAImage, maxSide = 700): DetectResult | null {
  const gray0 = toGray(img);
  const { img: small, scale } = downscaleGray(gray0, maxSide);
  const blurred = blurGray(small, 1);
  const { width: w, height: h } = blurred;

  const candidates: Candidate[] = [];
  const push = (c: Candidate | null) => { if (c) candidates.push(c); };

  push(evaluate(edgeMask(blurred), w, h, "canny+dilate"));
  push(evaluate(thresholdOtsu(blurred), w, h, "otsu"));
  push(evaluate(thresholdAdaptive(blurred, Math.max(15, Math.round(Math.max(w, h) * 0.06) | 1), 8), w, h, "adaptive"));

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const inv = 1 / (scale || 1);
  const up = (p: Pt): Pt => ({
    x: Math.min(img.width, Math.max(0, p.x * inv)),
    y: Math.min(img.height, Math.max(0, p.y * inv)),
  });
  return {
    quad: {
      topLeftCorner: up(best.quad.topLeftCorner),
      topRightCorner: up(best.quad.topRightCorner),
      bottomRightCorner: up(best.quad.bottomRightCorner),
      bottomLeftCorner: up(best.quad.bottomLeftCorner),
    },
    strategy: best.strategy,
    score: best.score,
    areaRatio: best.areaRatio,
  };
}
