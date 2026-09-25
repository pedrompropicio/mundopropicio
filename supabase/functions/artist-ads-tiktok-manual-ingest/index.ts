// artist-ads-tiktok-manual-ingest — porta de ingestão da tarefa agendada (Cowork)
// para as leituras TikTok do Ads Manager, SEM sessão de utilizador (D-ERP144 adenda).
// Autenticação: cabeçalho x-ingest-key vs secret TIKTOK_MANUAL_INGEST_KEY (tempo constante).
// Só ligações da lista ALLOWED. Chama crm.tiktok_manual_upsert_core com service_role.
// Nunca regista a chave.
import { createClient } from "npm:@supabase/supabase-js@2";
import { finishSyncRun, resolveStatus, startSyncRun } from "../_shared/sync-run.ts";

const FN = "artist-ads-tiktok-manual-ingest";
const ALLOWED = new Set(["947ee0c7-60a4-49f6-9882-561237c3483a"]); // Litto
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const hits: number[] = [];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const expected = Deno.env.get("TIKTOK_MANUAL_INGEST_KEY");
  if (!expected) return json(503, { error: "ingest não configurado" });
  const key = req.headers.get("x-ingest-key") ?? "";
  if (!key || !timingSafeEqual(key, expected)) return json(401, { error: "unauthorized" });

  const now = Date.now();
  while (hits.length && now - hits[0] > RATE_WINDOW_MS) hits.shift();
  if (hits.length >= RATE_LIMIT) return json(429, { error: "limite de 30 pedidos/hora" });
  hits.push(now);

  let body: { p_connection_id?: string; connection_id?: string; p_payload?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: "invalid json" }); }
  const connectionId = String(body.p_connection_id ?? body.connection_id ?? "947ee0c7-60a4-49f6-9882-561237c3483a");
  if (!ALLOWED.has(connectionId)) return json(403, { error: "ligação não permitida" });
  const payload = body.p_payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(400, { error: "p_payload obrigatório (objeto)" });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const started = Date.now();
  const runId = await startSyncRun(admin, { function_name: FN, trigger_source: "api", dry_run: false });

  const { data, error } = await admin.schema("crm").rpc("tiktok_manual_upsert_core", {
    p_connection_id: connectionId, p_payload: payload, p_actor: "cowork-ingest",
  });

  if (error) {
    await finishSyncRun(admin, runId, started, {
      status: "error", api_calls: 0, rows_written: 0,
      details: { connection_id: connectionId, code: error.code ?? null }, error_text: error.message,
    });
    const status = error.code === "22023" ? 400 : 500;
    return json(status, { ok: false, error: error.message, code: error.code ?? null });
  }

  const r = data as any;
  const rows = (r?.campanha?.gravada ?? 0) + (r?.grupos?.gravados ?? 0) +
    (r?.dias?.inseridos ?? 0) + (r?.dias?.atualizados ?? 0);
  await finishSyncRun(admin, runId, started, {
    status: resolveStatus(rows, 0), api_calls: 0, rows_written: rows,
    details: { connection_id: connectionId, resultado: r },
  });
  return json(200, r);
});
