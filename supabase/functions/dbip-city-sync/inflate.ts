// Inflate (DEFLATE, RFC 1951) retomável em fronteiras de bloco — D-ERP263.
// Permite partir um .gz grande em partes: cada parte lê um intervalo (HTTP Range) do ficheiro
// comprimido e continua a partir de {bit absoluto, janela de 32 KB} guardados pela parte anterior.

const LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
const CLORD = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
export const WINDOW = 32768;

type Table = { t: Int32Array; bits: number };
function build(lens: ArrayLike<number>, n: number): Table {
  let max = 0; for (let i = 0; i < n; i++) if (lens[i] > max) max = lens[i];
  if (max === 0) max = 1;
  const cnt = new Uint16Array(16); for (let i = 0; i < n; i++) cnt[lens[i]]++;
  cnt[0] = 0;
  const next = new Uint16Array(16); let code = 0;
  for (let b = 1; b <= 15; b++) { code = (code + cnt[b - 1]) << 1; next[b] = code; }
  const size = 1 << max; const t = new Int32Array(size).fill(-1);
  for (let s = 0; s < n; s++) {
    const l = lens[s]; if (!l) continue;
    let c = next[l]++; let r = 0; for (let i = 0; i < l; i++) { r = (r << 1) | (c & 1); c >>= 1; }
    for (let k = r; k < size; k += 1 << l) t[k] = (s << 4) | l;
  }
  return { t, bits: max };
}
let FIXED: [Table, Table] | null = null;
function fixed(): [Table, Table] {
  if (FIXED) return FIXED;
  const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
  const d = new Uint8Array(30).fill(5);
  return (FIXED = [build(l, 288), build(d, 30)]);
}

export class NeedMoreInput extends Error {}

export interface InflateResult {
  out: Uint8Array;        // bytes novos (sem a janela)
  bit: number;            // bit absoluto (relativo a inputBase) da fronteira de bloco seguinte
  done: boolean;          // bloco final concluído
  window: Uint8Array;     // últimos 32 KB (para a parte seguinte)
}

/**
 * Descomprime blocos a partir de `startBit` (relativo ao início de `inp`) até produzir pelo menos
 * `target` bytes, parando sempre numa fronteira de bloco. `safeEnd`: não começa um bloco novo se
 * faltarem menos do que isto em bytes de entrada (o intervalo pode estar cortado a meio de um bloco).
 */
export function inflatePart(inp: Uint8Array, startBit: number, win: Uint8Array, target: number, safeEnd: number, inputIsEof: boolean): InflateResult {
  let pos = startBit >>> 3; let bb = 0; let bc = 0;
  const skip = startBit & 7;
  const need = (n: number) => {
    while (bc < n) {
      if (pos >= inp.length) { if (inputIsEof) { bb |= 0; bc += 8; continue; } throw new NeedMoreInput(); }
      bb |= inp[pos++] << bc; bc += 8;
    }
  };
  const bits = (n: number) => { need(n); const v = bb & ((1 << n) - 1); bb >>>= n; bc -= n; return v; };
  if (skip) bits(skip);
  let out = new Uint8Array(win.length + target + (2 << 20));
  out.set(win); let op = win.length;
  const ensure = (n: number) => {
    if (op + n <= out.length) return;
    const o2 = new Uint8Array(Math.max(out.length + (4 << 20), op + n)); o2.set(out.subarray(0, op)); out = o2;
  };
  const sym = (tb: Table) => {
    need(tb.bits);
    const e = tb.t[bb & ((1 << tb.bits) - 1)];
    if (e < 0) throw new Error("inflate: código inválido");
    const l = e & 15; if (l > bc) need(l);
    bb >>>= l; bc -= l; return e >> 4;
  };
  const absBit = () => pos * 8 - bc;
  let done = false; let boundary = absBit();
  while (true) {
    if (op - win.length >= target) break;
    if (!inputIsEof && inp.length - (boundary >>> 3) < safeEnd) break;
    const fin = bits(1); const type = bits(2);
    if (type === 0) {
      bits(bc & 7); pos -= bc >>> 3; bb = 0; bc = 0; // alinhar ao byte
      if (pos + 4 > inp.length) throw new NeedMoreInput();
      const len = inp[pos] | (inp[pos + 1] << 8); pos += 4;
      if (pos + len > inp.length) throw new NeedMoreInput();
      ensure(len); out.set(inp.subarray(pos, pos + len), op); op += len; pos += len;
    } else {
      let lt: Table, dt: Table;
      if (type === 1) [lt, dt] = fixed();
      else if (type === 2) {
        const hl = bits(5) + 257, hd = bits(5) + 1, hc = bits(4) + 4;
        const cl = new Uint8Array(19); for (let i = 0; i < hc; i++) cl[CLORD[i]] = bits(3);
        const ct = build(cl, 19); const ls = new Uint8Array(hl + hd); let i = 0;
        while (i < hl + hd) {
          const s = sym(ct);
          if (s < 16) ls[i++] = s;
          else if (s === 16) { const p = ls[i - 1]; let r = 3 + bits(2); while (r--) ls[i++] = p; }
          else if (s === 17) { let r = 3 + bits(3); while (r--) ls[i++] = 0; }
          else { let r = 11 + bits(7); while (r--) ls[i++] = 0; }
        }
        lt = build(ls.subarray(0, hl), hl); dt = build(ls.subarray(hl), hd);
      } else throw new Error("inflate: bloco tipo 3");
      while (true) {
        const s = sym(lt);
        if (s < 256) { ensure(1); out[op++] = s; continue; }
        if (s === 256) break;
        const li = s - 257; const len = LBASE[li] + (LEXT[li] ? bits(LEXT[li]) : 0);
        const di = sym(dt); const dist = DBASE[di] + (DEXT[di] ? bits(DEXT[di]) : 0);
        ensure(len); let from = op - dist;
        if (from < 0) throw new Error("inflate: distância fora da janela");
        for (let k = 0; k < len; k++) out[op++] = out[from++];
      }
    }
    boundary = absBit();
    if (fin) { done = true; break; }
  }
  const all = out.subarray(0, op);
  return { out: all.subarray(win.length), bit: boundary, done, window: all.slice(Math.max(0, op - WINDOW)) };
}

/** Tamanho do cabeçalho gzip (RFC 1952). */
export function gzipHeaderLen(b: Uint8Array): number {
  if (b[0] !== 0x1f || b[1] !== 0x8b || b[2] !== 8) throw new Error("não é gzip");
  const fl = b[3]; let p = 10;
  if (fl & 4) p += 2 + (b[p] | (b[p + 1] << 8));
  if (fl & 8) { while (b[p++]); }
  if (fl & 16) { while (b[p++]); }
  if (fl & 2) p += 2;
  return p;
}
