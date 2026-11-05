import { sha256Hex } from "./backup-crypto.ts";

const utf8 = new TextEncoder();
const encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g,
  (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encodePath = (s: string) => s.split("/").map(encode).join("/");
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes),
  (b) => b.toString(16).padStart(2, "0")).join("");

async function hmac(key: Uint8Array, text: string): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey("raw", new Uint8Array(key),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, utf8.encode(text)));
}

export async function signV4(
  request: { method: string; url: string | URL; headers: HeadersInit; payloadHash: string },
  credentials: { accessKeyId: string; secretAccessKey: string; region: string; service: string },
  amzDate: string,
): Promise<Record<string, string>> {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  new Headers(request.headers).forEach((v, k) => { if (k !== "authorization") headers[k.toLowerCase()] = v.trim().replace(/\s+/g, " "); });
  headers.host = url.host;
  headers["x-amz-date"] = amzDate;
  headers["x-amz-content-sha256"] = request.payloadHash;
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(";");
  const query = Array.from(url.searchParams, ([k, v]) => [encode(k), encode(v)])
    .sort(([ak, av], [bk, bv]) => ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0)
    .map(([k, v]) => `${k}=${v}`).join("&");
  const path = url.pathname.split("/").map((s) => encode(decodeURIComponent(s))).join("/");
  const canonical = [request.method.toUpperCase(), path, query,
    names.map((k) => `${k}:${headers[k]}\n`).join(""), signedHeaders, request.payloadHash].join("\n");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${credentials.region}/${credentials.service}/aws4_request`;
  const toSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256Hex(utf8.encode(canonical))}`;
  let signingKey = await hmac(utf8.encode(`AWS4${credentials.secretAccessKey}`), day);
  signingKey = await hmac(signingKey, credentials.region);
  signingKey = await hmac(signingKey, credentials.service);
  signingKey = await hmac(signingKey, "aws4_request");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hex((await hmac(signingKey, toSign)).buffer as ArrayBuffer)}`;
  return Object.fromEntries(Object.entries(headers).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export type R2Head = { size: number; meta: Record<string, string> };
export type R2Probe = { status: number; code: string | null };

// Only expose the S3 error identifier, never messages, keys or the XML body.
const s3Code = (body: string): string | null =>
  body.match(/<(?:\w+:)?Code>\s*([A-Za-z][A-Za-z0-9]{0,127})\s*<\/(?:\w+:)?Code>/)?.[1] ?? null;

export function createR2Client(options: {
  accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string;
  endpointKind?: "eu" | "default";
  fetchImpl?: typeof fetch; now?: () => Date;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const endpoint = `https://${options.accountId}.${options.endpointKind === "default" ? "" : "eu."}r2.cloudflarestorage.com`;
  const credentials = { ...options, region: "auto", service: "s3" };
  const objectPath = (key: string) => `/${encode(options.bucket)}/${encodePath(key)}`;
  async function signedRequest(method: string, url: string, bytes?: Uint8Array, extra: Record<string, string> = {}) {
    const headers = await signV4({ method, url, headers: extra,
      payloadHash: await sha256Hex(bytes ?? new Uint8Array()) }, credentials,
    now().toISOString().replace(/[:-]|\.\d{3}/g, ""));
    return fetchImpl(url, {
      method, headers, ...(bytes ? { body: new Uint8Array(bytes) } : {}), redirect: "error",
    });
  }
  async function request(op: string, method: string, key: string, bytes?: Uint8Array, extra: Record<string, string> = {}) {
    const url = `${endpoint}${objectPath(key)}`;
    const response = await signedRequest(method, url, bytes, extra);
    if (op === "HEAD" && response.status === 404) return null;
    if (op === "HEAD" && !response.ok) {
      let code: string | null = null;
      try {
        const detail = await signedRequest("GET", url, undefined, { range: "bytes=0-0" });
        if (detail.ok) await detail.body?.cancel();
        else code = s3Code(await detail.text());
      } catch { /* Keep the original HEAD status even if its diagnostic GET fails. */ }
      throw new Error(`R2 HEAD ${response.status} (${code ?? "sem código"})`);
    }
    if (!response.ok) throw new Error(`R2 ${op} ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return response;
  }
  return {
    async probe(): Promise<R2Probe> {
      const response = await signedRequest("GET", `${endpoint}/${encode(options.bucket)}?list-type=2&max-keys=1`);
      let code: string | null = null;
      if (response.ok) await response.body?.cancel();
      else code = s3Code(await response.text());
      return { status: response.status, code };
    },
    async putObject(key: string, bytes: Uint8Array, meta: Record<string, string>) {
      const headers: Record<string, string> = { "content-type": "application/octet-stream", "if-none-match": "*" };
      for (const [k, v] of Object.entries(meta)) headers[`x-amz-meta-${k.toLowerCase()}`] = v;
      await request("PUT", "PUT", key, bytes, headers);
    },
    async headObject(key: string): Promise<R2Head | null> {
      const response = await request("HEAD", "HEAD", key);
      if (!response) return null;
      const size = Number(response.headers.get("content-length"));
      if (!response.headers.has("content-length") || !Number.isSafeInteger(size) || size < 0) throw new Error("R2 HEAD: tamanho inválido");
      const meta: Record<string, string> = {};
      response.headers.forEach((v, k) => { if (k.startsWith("x-amz-meta-")) meta[k.slice(11)] = v; });
      return { size, meta };
    },
    async getObject(key: string): Promise<Uint8Array> {
      return new Uint8Array(await (await request("GET", "GET", key))!.arrayBuffer());
    },
    async copyObject(src: string, dst: string) {
      const response = await request("COPY", "PUT", dst, undefined, {
        "x-amz-copy-source": objectPath(src), "if-none-match": "*",
      });
      // S3 can report a copy failure inside a 200 response.
      const body = await response!.text();
      if (/<(?:\w+:)?Error[\s>]/.test(body)) throw new Error(`R2 COPY 200: ${body.slice(0, 200)}`);
    },
  };
}
