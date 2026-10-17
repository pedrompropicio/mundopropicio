/** #333 pure contracts; no provider, database or delivery capabilities. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
/** Multipart overhead allowance; the body stream is cut before buffering beyond this. */
export const MAX_UPLOAD_BODY_BYTES = MAX_DOCUMENT_BYTES + 64 * 1024;
export const OPERATIONS = ["standalone_invoice_v1"] as const;
/** Roles accepted by #333 (narrower than legacy standalone INSERT, which also allows editor). */
export const DATA_ENTRY_ROLES = ["platform_admin", "admin", "manager"] as const;
export type DocumentType = "application/pdf" | "image/jpeg" | "image/png";

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

let CRC: Uint32Array | null = null;
function crc32(b: Uint8Array): number {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG: signature, IHDR first (13 bytes), every chunk inside bounds with valid CRC, IDAT present, IEND last. */
function validPng(b: Uint8Array): boolean {
  if (b.length < 57 || ![137,80,78,71,13,10,26,10].every((n,i) => b[i] === n)) return false;
  let o = 8, first = true, idat = false;
  while (o + 12 <= b.length) {
    const len = u32(b, o), type = ascii(b, o + 4, o + 8), end = o + 12 + len;
    if (end > b.length || !/^[A-Za-z]{4}$/.test(type)) return false;
    if (first && (type !== "IHDR" || len !== 13)) return false;
    if (crc32(b.subarray(o + 4, o + 8 + len)) !== u32(b, o + 8 + len)) return false;
    if (type === "IDAT") idat = true;
    if (type === "IEND") return len === 0 && end === b.length && idat;
    first = false; o = end;
  }
  return false;
}

/** JPEG: SOI, well-formed marker segments, a SOF and SOS, file ends with EOI. */
function validJpeg(b: Uint8Array): boolean {
  if (b.length < 128 || b[0] !== 0xff || b[1] !== 0xd8 || b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) return false;
  let o = 2, sof = false;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return false;
    const m = b[o + 1];
    if (m === 0xff) { o++; continue; }
    if (m === 0xd8 || m === 0xd9 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) return false;
    const len = (b[o + 2] << 8) + b[o + 3];
    if (len < 2 || o + 2 + len > b.length) return false;
    if ((m >= 0xc0 && m <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(m)) sof = true;
    if (m === 0xda) return sof && o + 2 + len < b.length - 2;
    o += 2 + len;
  }
  return false;
}

/** PDF: header at offset 0, startxref + %%EOF in the trailer, at least one object, no HTML prefix. */
function validPdf(b: Uint8Array): boolean {
  if (b.length < 64 || !/^%PDF-(1\.[0-7]|2\.0)/.test(ascii(b, 0, 8))) return false;
  const tail = ascii(b, Math.max(0, b.length - 1024), b.length);
  const eof = tail.lastIndexOf("%%EOF"), sx = tail.lastIndexOf("startxref");
  if (eof < 0 || sx < 0 || sx > eof || !/startxref\s+\d+\s+%%EOF\s*$/.test(tail.slice(sx))) return false;
  const head = ascii(b, 0, Math.min(b.length, 4096));
  return /\d+\s+\d+\s+obj/.test(head + ascii(b, Math.max(0, b.length - 4096), b.length)) && !/<html|<script/i.test(head);
}

export function documentType(bytes: Uint8Array): DocumentType | null {
  if (bytes[0] === 0x25 && validPdf(bytes)) return "application/pdf";
  if (bytes[0] === 0xff && validJpeg(bytes)) return "image/jpeg";
  if (bytes[0] === 0x89 && validPng(bytes)) return "image/png";
  return null;
}
export function validateDocument(bytes: Uint8Array, declared: string): DocumentType {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new Error("Ficheiro vazio ou superior a 20 MB.");
  const type = documentType(bytes);
  if (!type || type !== declared) throw new Error("Ficheiro incompleto, danificado ou com tipo diferente do declarado. Aceites PDF, JPEG e PNG.");
  return type;
}
export function validCivilDate(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === day;
}
/** Money in cents precision, finite, within numeric(12,2)-style bounds. */
export function validMoney(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 99_999_999.99 && Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
}
/** Role must come from the canonical server resolver (my_effective_permissions), never from client data. */
export function allowedRole(role: string | null | undefined): boolean {
  return DATA_ENTRY_ROLES.includes(String(role) as never);
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes).buffer))).map(n => n.toString(16).padStart(2,"0")).join("");
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const extension = (t: DocumentType) => t === "application/pdf" ? "pdf" : t === "image/jpeg" ? "jpg" : "png";
/** Staging path is deterministic by bytes: a retry with the same file lands on the same object. */
export function stagingPath(company: string, session: string, hash: string): string {
  if (![company, session].every(v => UUID.test(v)) || !/^[0-9a-f]{64}$/.test(hash)) throw new Error("Identidade documental inválida.");
  return `${company}/${session}/${hash}`;
}
export function finalDocumentPath(company:string, document:string, hash:string, type:DocumentType): string {
  if (![company,document].every(v => UUID.test(v)) || !/^[0-9a-f]{64}$/.test(hash)) throw new Error("Identidade documental inválida.");
  return `${company}/assistant333/${document}/${hash}.${extension(type)}`;
}
/** Reads a stream with a hard cap; stops before buffering beyond `max`. Content-Length is not required. */
export async function readCapped(stream: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array> {
  if (!stream) throw new Error("Pedido sem conteúdo.");
  const reader = stream.getReader(); const parts: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel(); throw new RangeError("Ficheiro superior a 20 MB."); }
    parts.push(value);
  }
  const out = new Uint8Array(total); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
