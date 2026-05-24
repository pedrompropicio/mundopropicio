// whatsapp-dispatcher — cron 1/min
// Lê notification_queue (status='queued') e envia via Meta WhatsApp Cloud API.
// Atualiza status para sent/failed e regista em notification_log.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_API_VERSION = "v25.0";
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 3;

interface QueueRow {
  id: string;
  template_id: string;
  recipient_phone: string;
  params: any[];
  attempts: number;
  template?: { meta_template_name: string; language_code: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // SECURITY: gateway enforces verify_jwt=true. Defense in depth: only allow
  // service_role JWT (cron) OR explicit cron secret. Blocks anon JWT replay.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  let jwtRole: string | null = null;
  try {
    const p = JSON.parse(atob((token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
    jwtRole = p?.role ?? null;
  } catch { /* ignore */ }
  const cronSecret = Deno.env.get("WHATSAPP_DISPATCHER_CRON_SECRET");
  const providedCronSecret = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && providedCronSecret === cronSecret;
  if (jwtRole !== "service_role" && !isCron) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const phoneNumberId = Deno.env.get("META_WA_PHONE_NUMBER_ID") ?? "1090662907471517";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Token sensível: ler do Vault (Deno.env não acede a secrets META_WA_* neste projeto)
  const envTok = Deno.env.get("META_WA_SYSTEM_TOKEN") ?? null;
  let wamToken: string | null = envTok;
  let tokenSource = envTok ? "env" : "vault";
  if (!wamToken) {
    const { data: tokRpc, error: tokErr } = await supabase.rpc("get_vault_secret" as any, {
      _name: "META_WA_SYSTEM_TOKEN",
    });
    if (tokErr || !tokRpc) {
      return new Response(JSON.stringify({ error: "META_WA_SYSTEM_TOKEN not found in vault", detail: tokErr?.message ?? null }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    wamToken = typeof tokRpc === "string" ? tokRpc : String(tokRpc);
  }
  // TEMP diagnóstico 190: comparar token usado vs vault sem expor o valor
  console.log("[wa-disp] token", {
    source: tokenSource,
    len: wamToken?.length ?? 0,
    prefix: wamToken?.slice(0, 8) ?? null,
    suffix: wamToken?.slice(-4) ?? null,
    envPresent: !!envTok,
    envLen: envTok?.length ?? 0,
    envPrefix: envTok?.slice(0, 8) ?? null,
  });

  if (!phoneNumberId || !wamToken) {
    return new Response(JSON.stringify({ error: "Meta WA secrets missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: items, error: selErr } = await supabase
    .from("notification_queue")
    .select("id, template_id, recipient_phone, params, attempts, template:notification_templates(meta_template_name, language_code)")
    .eq("status", "queued")
    .lte("scheduled_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (selErr) {
    return new Response(JSON.stringify({ error: selErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const item of (items ?? []) as QueueRow[]) {
    // Lock: marca sending + incrementa attempts
    const newAttempts = (item.attempts ?? 0) + 1;
    const { error: lockErr } = await supabase
      .from("notification_queue")
      .update({ status: "sending", attempts: newAttempts, updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("status", "queued"); // só se ainda estiver queued (idempotência)
    if (lockErr) {
      results.push({ id: item.id, ok: false, error: lockErr.message });
      continue;
    }

    const to = (item.recipient_phone || "").replace(/^\+/, "").replace(/\s+/g, "");
    // params pode vir como array OU objeto {"1": "...", "2": "..."} (jsonb)
    const rawParams = item.params;
    const paramsArr: any[] = Array.isArray(rawParams)
      ? rawParams
      : (rawParams && typeof rawParams === "object"
          ? Object.keys(rawParams as Record<string, any>)
              .sort((a, b) => Number(a) - Number(b))
              .map((k) => (rawParams as Record<string, any>)[k])
          : []);
    const parameters = paramsArr.map((p) => ({ type: "text", text: String(p ?? "") }));
    const templatePayload: Record<string, unknown> = {
      name: item.template?.meta_template_name,
      language: { code: item.template?.language_code || "pt_PT" },
    };
    // Só incluir components se houver parâmetros — templates sem variáveis (ex: hello_world)
    // rebentam com "number of parameters mismatch" se enviarmos body component vazio.
    if (parameters.length > 0) {
      templatePayload.components = [{ type: "body", parameters }];
    }
    const body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: templatePayload,
    };

    try {
      const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${wamToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const metaMsgId = data?.messages?.[0]?.id ?? null;
        await supabase.from("notification_queue").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          meta_message_id: metaMsgId,
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        await supabase.from("notification_log").insert({
          queue_id: item.id, event_type: "sent", payload: { meta_message_id: metaMsgId, response: data },
        });
        results.push({ id: item.id, ok: true });
      } else {
        const errMsg = data?.error?.message ?? `HTTP ${res.status}`;
        const finalFail = newAttempts >= MAX_ATTEMPTS;
        await supabase.from("notification_queue").update({
          status: finalFail ? "failed" : "queued",
          last_error: errMsg,
          failed_at: finalFail ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        await supabase.from("notification_log").insert({
          queue_id: item.id, event_type: "send_error", payload: { http_status: res.status, error: data },
        });
        results.push({ id: item.id, ok: false, error: errMsg });
      }
    } catch (e) {
      const errMsg = (e as Error).message || "fetch failed";
      const finalFail = newAttempts >= MAX_ATTEMPTS;
      await supabase.from("notification_queue").update({
        status: finalFail ? "failed" : "queued",
        last_error: errMsg,
        failed_at: finalFail ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      await supabase.from("notification_log").insert({
        queue_id: item.id, event_type: "exception", payload: { error: errMsg },
      });
      results.push({ id: item.id, ok: false, error: errMsg });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
