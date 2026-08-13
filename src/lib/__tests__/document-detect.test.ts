import { describe, expect, it } from "vitest";
import { detectDocumentQuad, type Pt } from "../document-detect";

/** Gera imagem sintética: retângulo branco rodado sobre fundo tipo mármore escuro + sombra suave. */
function synth(opts: {
  w: number;
  h: number;
  cx: number;
  cy: number;
  rw: number;
  rh: number;
  angleDeg: number;
}) {
  const { w, h, cx, cy, rw, rh, angleDeg } = opts;
  const data = new Uint8ClampedArray(w * h * 4);
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const corner = (sx: number, sy: number): Pt => ({
    x: cx + sx * (rw / 2) * cos - sy * (rh / 2) * sin,
    y: cy + sx * (rw / 2) * sin + sy * (rh / 2) * cos,
  });
  const truth = {
    topLeftCorner: corner(-1, -1),
    topRightCorner: corner(1, -1),
    bottomRightCorner: corner(1, 1),
    bottomLeftCorner: corner(-1, 1),
  };
  const inRect = (x: number, y: number, ox = 0, oy = 0) => {
    const dx = x - ox - cx;
    const dy = y - oy - cy;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    return Math.abs(u) <= rw / 2 && Math.abs(v) <= rh / 2;
  };
  // ruído determinístico
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r: number, g: number, b: number;
      if (inRect(x, y)) {
        const shade = 236 + Math.sin(x * 0.02) * 6 + rnd() * 6;
        r = g = b = shade;
      } else {
        // mármore castanho escuro com veios
        const veio = Math.sin((x + y) * 0.05) * 10 + Math.sin(x * 0.11) * 8;
        const shadow = inRect(x, y, 10, 12) ? -22 : 0;
        r = 96 + veio + shadow + rnd() * 10;
        g = 64 + veio * 0.8 + shadow + rnd() * 8;
        b = 44 + veio * 0.6 + shadow + rnd() * 8;
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { img: { width: w, height: h, data }, truth };
}

const KEYS = ["topLeftCorner", "topRightCorner", "bottomRightCorner", "bottomLeftCorner"] as const;

const cases = [
  { name: "A4 rodado 12°, centrado", cx: 640, cy: 480, rw: 720, rh: 520, angleDeg: 12 },
  { name: "A4 rodado -18°, à esquerda", cx: 520, cy: 500, rw: 640, rh: 500, angleDeg: -18 },
  { name: "A4 rodado 20°, canto sup. dir.", cx: 780, cy: 400, rw: 600, rh: 460, angleDeg: 20 },
  { name: "A4 rodado 6°, grande", cx: 660, cy: 500, rw: 900, rh: 640, angleDeg: 6 },
];

describe("detectDocumentQuad", () => {
  for (const c of cases) {
    it(`deteta ${c.name} com erro < 3%`, () => {
      const W = 1280;
      const H = 960;
      const { img, truth } = synth({ w: W, h: H, ...c });
      const res = detectDocumentQuad(img);
      expect(res, "deteção devolveu null").not.toBeNull();
      const tol = 0.03 * Math.max(W, H);
      for (const k of KEYS) {
        const d = Math.hypot(res!.quad[k].x - truth[k].x, res!.quad[k].y - truth[k].y);
        expect(d, `${k} erro ${d.toFixed(1)}px (tol ${tol.toFixed(1)}px) [${res!.strategy}]`).toBeLessThan(tol);
      }
    });
  }

  it("não devolve o frame inteiro em imagem sem documento", () => {
    const { img } = synth({ w: 800, h: 600, cx: 400, cy: 300, rw: 1, rh: 1, angleDeg: 0 });
    const res = detectDocumentQuad(img);
    expect(res === null || res.areaRatio <= 0.95).toBe(true);
  });
});
