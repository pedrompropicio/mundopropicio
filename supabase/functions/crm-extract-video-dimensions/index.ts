// crm-extract-video-dimensions
// Lê ficheiros MP4 do Supabase Storage e extrai width/height/duration_seconds
// fazendo parse mínimo das boxes MP4 (moov/mvhd/tkhd).
//
// Input: { company_id, creative_ids?: string[] }
// Auth: header Authorization obrigatório (verify_jwt=true no gateway).

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const BUILD_VERSION = "extract-video-dims-v1 2026-06-24";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const bizErr = (payload: { error: string; detail?: unknown }) => {
  console.log("[extract-video-dims] FAIL", JSON.stringify(payload));
  return json({ ok: false, ...payload }, 200);
};

// ---------- MP4 parser ----------

type Box = { type: string; size: number; start: number; bodyStart: number; bodyEnd: number };

function readUint32BE(buf: Uint8Array, off: number): number {
  return (buf[off] * 0x1000000) + ((buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]);
}
function readUint16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}
function readType(buf: Uint8Array, off: number): string {
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
}

// Itera boxes top-level dentro de [start, end). Devolve null se uma box for truncada.
function* iterBoxes(buf: Uint8Array, start: number, end: number): Generator<Box> {
  let off = start;
  while (off + 8 <= end) {
    let size = readUint32BE(buf, off);
    const type = readType(buf, off + 4);
    let headerSize = 8;
    if (size === 1) {
      // largesize 64-bit — só lemos os 32 bits baixos (suficiente para boxes <4GB)
      if (off + 16 > end) return;
      const hi = readUint32BE(buf, off + 8);
      const lo = readUint32BE(buf, off + 12);
      size = hi * 0x100000000 + lo;
      headerSize = 16;
    } else if (size === 0) {
      // box vai até ao fim do ficheiro
      size = end - off;
    }
    if (size < headerSize) return;
    const bodyStart = off + headerSize;
    const bodyEnd = off + size;
    if (bodyEnd > end) return; // truncada
    yield { type, size, start: off, bodyStart, bodyEnd };
    off = bodyEnd;
  }
}

function findBox(buf: Uint8Array, start: number, end: number, type: string): Box | null {
  for (const b of iterBoxes(buf, start, end)) {
    if (b.type === type) return b;
  }
  return null;
}

type ParseResult = {
  width: number;
  height: number;
  duration_seconds: number;
};

function parseMp4(buf: Uint8Array): ParseResult | null {
  const moov = findBox(buf, 0, buf.length, "moov");
  if (!moov) return null;

  // mvhd: version(1) + flags(3) + (v0: ctime4+mtime4+timescale4+duration4) or (v1: ctime8+mtime8+timescale4+duration8)
  const mvhd = findBox(buf, moov.bodyStart, moov.bodyEnd, "mvhd");
  let durationSec = 0;
  if (mvhd) {
    const v = buf[mvhd.bodyStart];
    let timescale = 0;
    let duration = 0;
    if (v === 0) {
      timescale = readUint32BE(buf, mvhd.bodyStart + 4 + 4 + 4);
      duration = readUint32BE(buf, mvhd.bodyStart + 4 + 4 + 4 + 4);
    } else {
      timescale = readUint32BE(buf, mvhd.bodyStart + 4 + 8 + 8);
      const dHi = readUint32BE(buf, mvhd.bodyStart + 4 + 8 + 8 + 4);
      const dLo = readUint32BE(buf, mvhd.bodyStart + 4 + 8 + 8 + 8);
      duration = dHi * 0x100000000 + dLo;
    }
    if (timescale > 0) durationSec = duration / timescale;
  }

  // Percorre traks; em cada tkhd lê width/height (16.16 fixed-point nos últimos 8 bytes).
  let bestW = 0, bestH = 0;
  for (const b of iterBoxes(buf, moov.bodyStart, moov.bodyEnd)) {
    if (b.type !== "trak") continue;
    const tkhd = findBox(buf, b.bodyStart, b.bodyEnd, "tkhd");
    if (!tkhd) continue;
    // tkhd body: v(1)+flags(3) + (v0: 4+4+4+4+4 / v1: 8+8+4+4+8) + reserved(8) + layer(2)+altGroup(2)+vol(2)+res(2) + matrix(36) + width(4) + height(4)
    const v = buf[tkhd.bodyStart];
    const headerSkip = v === 0 ? 4 + 4 + 4 + 4 + 4 : 4 + 8 + 8 + 4 + 4 + 8;
    const afterHeader = tkhd.bodyStart + headerSkip;
    const matrixEnd = afterHeader + 8 + 2 + 2 + 2 + 2 + 36;
    if (matrixEnd + 8 > tkhd.bodyEnd) continue;
    // width/height são 16.16 fixed-point — parte inteira nos 2 bytes altos
    const w = readUint16BE(buf, matrixEnd);
    const h = readUint16BE(buf, matrixEnd + 4);
    if (w > bestW) bestW = w;
    if (h > bestH) bestH = h;
  }

  if (bestW === 0 || bestH === 0) return null;
  return { width: bestW, height: bestH, duration_seconds: Math.round(durationSec * 100) / 100 };
}

// ---------- main ----------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 200);

  console.log(`[crm-extract-video-dimensions] BUILD_VERSION=${BUILD_VERSION} url=${!!SUPABASE_URL} srk=${!!SRK}`);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ ok: false, error: "missing_authorization" }, 200);
  }

  const admin = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sbCrm = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "crm" as never },
  });

  try {
    let body: { company_id?: string; creative_ids?: string[] } = {};
    try { body = await req.json(); } catch {}
    const companyId = body.company_id;
    if (!companyId) return bizErr({ error: "missing_params", detail: "company_id" });

    let query = (sbCrm as any)
      .from("meta_creatives")
      .select("id, name, storage_bucket, storage_path, file_url, type, file_mime_type, width")
      .eq("company_id", companyId);

    if (Array.isArray(body.creative_ids) && body.creative_ids.length > 0) {
      query = query.in("id", body.creative_ids);
    } else {
      query = query
        .or("type.ilike.%video%,file_mime_type.ilike.%video%")
        .is("width", null);
    }

    const { data: rows, error: qErr } = await query;
    if (qErr) return bizErr({ error: "query_failed", detail: qErr.message });
    if (!rows || rows.length === 0) {
      return json({ ok: true, processed: [], errors: [], note: "no_rows" });
    }

    const processed: any[] = [];
    const errors: any[] = [];
    const INITIAL_BYTES = 4 * 1024 * 1024; // 4 MB

    for (const row of rows as any[]) {
      try {
        const bucket = row.storage_bucket || "crm-meta-creatives";
        const path = row.storage_path as string | null;
        const fileUrl = row.file_url as string | null;

        let buf: Uint8Array | null = null;
        let baixouTudo = false;

        // 1) tenta range parcial via file_url (signed url normalmente aceita Range)
        async function fetchFull(): Promise<Uint8Array | null> {
          if (path) {
            const { data: dl, error: dlErr } = await admin.storage.from(bucket).download(path);
            if (dlErr || !dl) return null;
            return new Uint8Array(await dl.arrayBuffer());
          }
          if (fileUrl) {
            const r = await fetch(fileUrl);
            if (!r.ok) return null;
            return new Uint8Array(await r.arrayBuffer());
          }
          return null;
        }

        async function fetchRange(end: number): Promise<Uint8Array | null> {
          if (fileUrl) {
            const r = await fetch(fileUrl, { headers: { Range: `bytes=0-${end - 1}` } });
            if (r.ok || r.status === 206) {
              return new Uint8Array(await r.arrayBuffer());
            }
          }
          if (path) {
            // supabase-js v2 download não suporta range; tenta via REST direto
            const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
              headers: {
                Authorization: `Bearer ${SRK}`,
                apikey: SRK,
                Range: `bytes=0-${end - 1}`,
              },
            });
            if (r.ok || r.status === 206) {
              return new Uint8Array(await r.arrayBuffer());
            }
          }
          return null;
        }

        // Tenta primeiro range parcial
        buf = await fetchRange(INITIAL_BYTES);
        let parsed: ParseResult | null = null;
        if (buf && findBox(buf, 0, buf.length, "moov")) {
          parsed = parseMp4(buf);
        }

        // Se não encontrou moov nos primeiros bytes, baixa tudo
        if (!parsed) {
          buf = await fetchFull();
          if (!buf) {
            errors.push({ id: row.id, error: "download_failed" });
            continue;
          }
          baixouTudo = true;
          parsed = parseMp4(buf);
        }

        if (!parsed) {
          errors.push({ id: row.id, error: "moov_not_found_or_unparseable" });
          continue;
        }

        const { error: upErr } = await (sbCrm as any)
          .from("meta_creatives")
          .update({
            width: parsed.width,
            height: parsed.height,
            duration_seconds: parsed.duration_seconds,
          })
          .eq("id", row.id);
        if (upErr) {
          errors.push({ id: row.id, error: `update_failed: ${upErr.message}` });
          continue;
        }

        processed.push({
          id: row.id,
          name: row.name,
          width: parsed.width,
          height: parsed.height,
          duration_seconds: parsed.duration_seconds,
          baixou_tudo: baixouTudo,
        });
      } catch (e) {
        errors.push({ id: row.id, error: `threw: ${(e as Error).message}` });
      }
    }

    return json({ ok: true, processed, errors });
  } catch (e) {
    return bizErr({ error: "threw", detail: (e as Error).message });
  }
});
