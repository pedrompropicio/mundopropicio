// migrate-legacy-images
// Copia ficheiros de imagem do projeto Supabase antigo (host zjseklogascfwqjoocbl)
// para o bucket `event-images` deste projeto Live. NÃO altera a BD.
//
// Auth: header `Authorization: Bearer <SERVICE_ROLE>` validado em código.
// (verify_jwt=false em config.toml — autenticação manual.)

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OLD_HOST = "zjseklogascfwqjoocbl";
const BUCKET = "event-images";

type ColumnRef = { table: string; column: string };
const COLUMNS: ColumnRef[] = [
  { table: "events", column: "hero_image_url" },
  { table: "events", column: "poster_image_url" },
  { table: "event_marketing", column: "hero_image_url" },
  { table: "event_marketing", column: "og_image_url" },
  { table: "event_marketing", column: "poster_vertical_url" },
  { table: "event_portal_endorsements", column: "override_hero_image_url" },
];

type Result = {
  old_url: string;
  file_name: string;
  new_url?: string;
  bytes?: number;
  status: "copied" | "error";
  error?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(last);
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "missing_env" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  let jwtRole: string | null = null;
  try {
    const p = JSON.parse(
      atob((token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")),
    );
    jwtRole = p?.role ?? null;
  } catch { /* ignore */ }
  if (jwtRole !== "service_role") {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Descoberta
  const urls = new Set<string>();
  const discoveryErrors: Array<{ table: string; column: string; error: string }> = [];

  for (const { table, column } of COLUMNS) {
    const { data, error } = await admin
      .from(table)
      .select(column)
      .ilike(column, `%${OLD_HOST}%`);
    if (error) {
      discoveryErrors.push({ table, column, error: error.message });
      continue;
    }
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const v = row[column];
      if (typeof v === "string" && v.includes(OLD_HOST)) urls.add(v);
    }
  }

  // 2) Cópia
  const results: Result[] = [];
  for (const oldUrl of urls) {
    const fileName = fileNameFromUrl(oldUrl);
    if (!fileName) {
      results.push({ old_url: oldUrl, file_name: "", status: "error", error: "filename_empty" });
      continue;
    }
    try {
      const resp = await fetch(oldUrl);
      if (!resp.ok) {
        results.push({ old_url: oldUrl, file_name: fileName, status: "error", error: `fetch_${resp.status}` });
        continue;
      }
      const contentType = (resp.headers.get("content-type") ?? "application/octet-stream")
        .split(";")[0]
        .trim();
      const buf = new Uint8Array(await resp.arrayBuffer());
      if (buf.byteLength === 0) {
        results.push({ old_url: oldUrl, file_name: fileName, status: "error", error: "empty_body" });
        continue;
      }
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(fileName, buf, { contentType, upsert: true });
      if (upErr) {
        results.push({ old_url: oldUrl, file_name: fileName, status: "error", error: `upload: ${upErr.message}` });
        continue;
      }
      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(fileName);
      results.push({
        old_url: oldUrl,
        file_name: fileName,
        new_url: pub.publicUrl,
        bytes: buf.byteLength,
        status: "copied",
      });
    } catch (e) {
      results.push({
        old_url: oldUrl,
        file_name: fileName,
        status: "error",
        error: (e as Error).message,
      });
    }
  }

  const copied = results.filter((r) => r.status === "copied").length;
  const failed = results.filter((r) => r.status === "error").length;

  return json({
    summary: {
      discovered: urls.size,
      copied,
      failed,
      discovery_errors: discoveryErrors.length,
    },
    discovery_errors: discoveryErrors,
    results,
  });
});
