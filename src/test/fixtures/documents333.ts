/** #333 fictitious, structurally complete PDF/PNG/JPEG fixtures (no real documents). */
const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };

export function pdfFixture(tag = "fixture"): Uint8Array {
  const body = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n% ${tag}\n`;
  const xref = body.length;
  return enc(`${body}xref\n0 3\n0000000000 65535 f \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return (c ^ 0xffffffff) >>> 0;
}
const be32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
function chunk(type: string, data: Uint8Array) { const td = cat(enc(type), data); return cat(be32(data.length), td, be32(crc32(td))); }
export function pngFixture(): Uint8Array {
  const ihdr = new Uint8Array([0,0,0,1, 0,0,0,1, 8, 2, 0, 0, 0]);
  const idat = new Uint8Array([0x78,0x9c,0x63,0xf8,0xcf,0xc0,0x00,0x00,0x03,0x01,0x01,0x00]);
  return cat(new Uint8Array([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array()));
}

const seg = (marker: number, data: number[]) => new Uint8Array([0xff, marker, ((data.length + 2) >> 8) & 255, (data.length + 2) & 255, ...data]);
export function jpegFixture(): Uint8Array {
  return cat(
    new Uint8Array([0xff, 0xd8]),
    seg(0xe0, [0x4a,0x46,0x49,0x46,0x00,1,1,0,0,1,0,1,0,0]),
    seg(0xdb, [0, ...Array(64).fill(1)]),
    seg(0xc0, [8, 0,1, 0,1, 1, 1, 0x11, 0]),
    seg(0xc4, [0, ...Array(16).fill(0).map((_, i) => (i === 0 ? 1 : 0)), 0]),
    seg(0xda, [1, 1, 0, 0, 63, 0]),
    new Uint8Array([0x12, 0x34, 0x56]),
    new Uint8Array([0xff, 0xd9]),
  );
}
