// Cliente HTTP/1.1 tolerante para páginas públicas de bilheteiras.
//
// Motivo: a Ticketline devolve headers inválidos (CSP/Report-To com dobras e
// caracteres ilegais) e o hyper do runtime Deno rejeita a resposta inteira com
// "client error (SendRequest): invalid HTTP header parsed". O `fetch` nativo não
// tem forma de relaxar o parser, por isso falamos HTTP/1.1 diretamente sobre TLS
// e ignoramos os headers que não conseguimos interpretar.
//
// Usado apenas para GETs de páginas públicas (sem auth, sem cookies).

export interface TolerantResponse {
  ok: boolean;
  status: number;
  html: string;
  url: string;
  /** true quando foi necessário o fallback em socket cru */
  raw: boolean;
}

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const baseHeaders = (host: string): Record<string, string> => ({
  Host: host,
  "User-Agent": DEFAULT_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
  // identity evita ter de descomprimir gzip/br manualmente no socket cru
  "Accept-Encoding": "identity",
  Connection: "close",
});

const decoder = new TextDecoder("utf-8", { fatal: false });

/** Lê o socket até EOF. */
async function readAll(conn: Deno.Conn, timeoutMs: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const buf = new Uint8Array(64 * 1024);
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (Date.now() > deadline) break;
    const n = await conn.read(buf);
    if (n === null) break;
    chunks.push(buf.slice(0, n));
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function indexOfCRLF(b: Uint8Array, from: number): number {
  for (let i = from; i + 1 < b.length; i++) if (b[i] === 13 && b[i + 1] === 10) return i;
  return -1;
}

/** Descodifica transfer-encoding chunked ao nível dos BYTES (os tamanhos são em bytes). */
function decodeChunkedBytes(body: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let i = 0;
  while (i < body.length) {
    const nl = indexOfCRLF(body, i);
    if (nl < 0) break;
    const sizeLine = decoder.decode(body.slice(i, nl)).split(";")[0].trim();
    const size = parseInt(sizeLine, 16);
    if (!Number.isFinite(size) || size <= 0) break;
    const start = nl + 2;
    parts.push(body.slice(start, Math.min(start + size, body.length)));
    i = start + size + 2;
  }
  if (parts.length === 0) return body;
  const total = parts.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of parts) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** GET cru sobre TLS, com parsing tolerante de headers. */
async function rawGet(url: string, timeoutMs: number): Promise<TolerantResponse & { location?: string }> {
  const u = new URL(url);
  const port = u.port ? Number(u.port) : u.protocol === "http:" ? 80 : 443;
  const conn = u.protocol === "http:"
    ? await Deno.connect({ hostname: u.hostname, port })
    : await Deno.connectTls({ hostname: u.hostname, port });

  try {
    const path = `${u.pathname}${u.search}` || "/";
    const headers = baseHeaders(u.host);
    const req = `GET ${path} HTTP/1.1\r\n` +
      Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") +
      "\r\n\r\n";
    await conn.write(new TextEncoder().encode(req));

    const bytes = await readAll(conn, timeoutMs);
    // separador de headers em bytes: \r\n\r\n
    let sep = -1;
    for (let i = 0; i + 3 < bytes.length; i++) {
      if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) {
        sep = i;
        break;
      }
    }
    const head = decoder.decode(sep < 0 ? bytes : bytes.slice(0, sep));
    let bodyBytes = sep < 0 ? new Uint8Array() : bytes.slice(sep + 4);

    const lines = head.split("\r\n");
    const status = Number(lines[0]?.match(/HTTP\/[\d.]+\s+(\d{3})/)?.[1] ?? 0);

    // Headers relevantes apenas — ignoramos tudo o que não conseguimos ler.
    let location: string | undefined;
    let chunked = false;
    for (const line of lines.slice(1)) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const k = line.slice(0, idx).trim().toLowerCase();
      const v = line.slice(idx + 1).trim();
      if (k === "location") location = v;
      if (k === "transfer-encoding" && /chunked/i.test(v)) chunked = true;
    }
    if (chunked) bodyBytes = decodeChunkedBytes(bodyBytes);
    const body = decoder.decode(bodyBytes);

    return { ok: status >= 200 && status < 400, status, html: body, url, raw: true, location };
  } finally {
    try {
      conn.close();
    } catch {
      /* já fechado */
    }
  }
}

/**
 * GET de uma página pública: tenta o `fetch` nativo e, se o runtime rejeitar a
 * resposta (headers inválidos), cai para o socket cru. Segue redirects (máx. 5).
 */
export async function tolerantFetch(url: string, timeoutMs = 20000): Promise<TolerantResponse> {
  try {
    const r = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": DEFAULT_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
        "Accept-Encoding": "identity",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const html = await r.text();
    return { ok: r.ok, status: r.status, html, url: r.url || url, raw: false };
  } catch (_e) {
    // fallback tolerante com redirects manuais
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
      const res = await rawGet(current, timeoutMs);
      if (res.status >= 300 && res.status < 400 && res.location) {
        current = new URL(res.location, current).toString();
        continue;
      }
      return { ...res, url: current };
    }
    throw new Error(`Demasiados redirects a partir de ${url}`);
  }
}
