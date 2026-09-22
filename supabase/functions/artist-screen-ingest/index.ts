// artist-screen-ingest — B1 da Máquina de recolha (D-ERP126).
//
// Recebe leituras de ecrã feitas por um Atalho do iOS (captura do app TikTok +
// OCR) e grava o valor em public.artist_song_metrics_daily com
// source = 'ios_shortcut'.
//
// POST, verify_jwt = false. Autenticação própria por header
// `Authorization: Bearer <SCREEN_INGEST_TOKEN>`.
//
// Body: {
//   song_id: uuid            (obrigatório)
//   platform?: string        (default 'tiktok')
//   metric?: string          (default 'ugc_videos')
//   text?: string            (texto OCR; obrigatório se não vier value)
//   value?: number           (tem prioridade sobre o parse)
//   metric_date?: YYYY-MM-DD (default = hoje em America/Fortaleza)
//   device?: string
// }

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function todayFortaleza(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type Precision = "exata" | "centena" | "milhar";

type Parsed = { value: number; precision: Precision; snippet: string; matched: string };

// "6,5 mil publicações" → 6500 (centena)
// "6.022 publicações"   → 6022 (exata)
// "1,2 mi publicações"  → 1200000 (milhar)
// "12,3 mil publicações"→ 12300 (centena)
// "980 publicações"     → 980 (exata)
function parseOcr(text: string): Parsed | null {
  const re = /(\d[\d.,]*)\s*(mil|mi|k|m)?\s*publica/i;
  const m = re.exec(text);
  if (!m) return null;

  const rawNum = m[1];
  const suffix = (m[2] ?? "").toLowerCase();

  let num: number;
  let hasDecimal = false;
  if (suffix) {
    // Com sufixo, a vírgula (ou o ponto isolado) é decimal: "6,5 mil", "1.2 mi".
    const normalized = rawNum.replace(/,/g, ".");
    num = Number(normalized);
    hasDecimal = /[.,]/.test(rawNum);
  } else {
    // Sem sufixo, pontos e vírgulas são separadores de milhar: "6.022".
    num = Number(rawNum.replace(/[.,]/g, ""));
  }
  if (!Number.isFinite(num)) return null;

  let multiplier = 1;
  if (suffix === "mil" || suffix === "k") multiplier = 1_000;
  if (suffix === "mi" || suffix === "m") multiplier = 1_000_000;

  const value = Math.round(num * multiplier);

  let precision: Precision = "exata";
  if (suffix === "mil" || suffix === "k") precision = hasDecimal ? "centena" : "milhar";
  else if (suffix === "mi" || suffix === "m") precision = "milhar";

  const idx = m.index;
  const start = Math.max(0, idx - 40);
  const snippet = text.slice(start, Math.min(text.length, start + 120)).replace(/\s+/g, " ").trim();

  return { value, precision, snippet, matched: m[0].trim() };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expected = Deno.env.get("SCREEN_INGEST_TOKEN");
  if (!expected) {
    console.error("[artist-screen-ingest] SCREEN_INGEST_TOKEN ausente");
    return json({ error: "secret_missing" }, 500);
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== expected) return json({ error: "unauthorized" }, 401);

  let p: Record<string, unknown>;
  try {
    p = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const songId = typeof p.song_id === "string" ? p.song_id.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(songId)) return json({ error: "song_id obrigatório" }, 400);

  const platform = typeof p.platform === "string" && p.platform.trim() ? p.platform.trim() : "tiktok";
  const metric = typeof p.metric === "string" && p.metric.trim() ? p.metric.trim() : "ugc_videos";
  const text = typeof p.text === "string" ? p.text : "";
  const device = typeof p.device === "string" && p.device.trim() ? p.device.trim() : null;

  const metricDate = typeof p.metric_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.metric_date)
    ? p.metric_date
    : todayFortaleza();

  let value: number;
  let precision: Precision;
  let parsedFrom: string | null = null;
  let snippet: string | null = null;

  if (typeof p.value === "number" && Number.isFinite(p.value)) {
    value = Math.round(p.value);
    precision = "exata";
    parsedFrom = "value";
  } else {
    if (!text.trim()) return json({ error: "text ou value obrigatório" }, 400);
    const parsed = parseOcr(text);
    if (!parsed) return json({ error: "valor_nao_encontrado", text }, 422);
    value = parsed.value;
    precision = parsed.precision;
    parsedFrom = parsed.matched;
    snippet = parsed.snippet;
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: song, error: sErr } = await admin
    .from("artist_songs")
    .select("id, artist_id, company_id")
    .eq("id", songId)
    .maybeSingle();
  if (sErr) {
    console.error("[artist-screen-ingest] artist_songs", sErr.message);
    return json({ error: "lookup_failed", details: sErr.message }, 500);
  }
  if (!song) return json({ error: "song_not_found" }, 404);

  const sourceRef = `App TikTok via Atalho iOS; OCR: "${snippet ?? parsedFrom ?? ""}"; precisão: ${precision}` +
    (device ? `; dispositivo: ${device}` : "");

  const { error: uErr } = await admin
    .from("artist_song_metrics_daily")
    .upsert(
      {
        company_id: (song as any).company_id,
        song_id: songId,
        artist_id: (song as any).artist_id,
        platform,
        metric,
        metric_date: metricDate,
        value,
        source: "ios_shortcut",
        source_ref: sourceRef,
        captured_at: new Date().toISOString(),
      },
      { onConflict: "song_id,platform,metric,metric_date,source" },
    );
  if (uErr) {
    console.error("[artist-screen-ingest] upsert", uErr.message);
    return json({ error: "upsert_failed", details: uErr.message }, 500);
  }

  return json({
    ok: true,
    song_id: songId,
    metric_date: metricDate,
    value,
    precision,
    parsed_from: parsedFrom,
  });
});
