// Vigia de bilheteira — envio de email (D-ERP193, Issue #282).
// A detecção, os lembretes e o plano POR EMPRESA vivem em check_ticketing_sync_health();
// aqui só se envia, 1 email/dia/empresa, só a destinatários com papel nessa empresa.
// Body: { dry_run?: boolean } — dry_run é o default; enviar exige dry_run:false explícito.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${SERVICE_ROLE}`) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dry_run !== false;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data, error } = await admin.rpc("check_ticketing_sync_health", { _dry_run: dryRun });
  if (error) return json({ error: error.message }, 500);

  const plan = ((data as any)?.plano_por_empresa ?? []) as Array<{
    company_id: string; recipients: string[]; itens: unknown[]; status: string; idempotency_day: string;
  }>;
  const result: unknown[] = [];

  for (const p of plan) {
    if (p.status !== "enviar" || dryRun) {
      result.push({ company_id: p.company_id, status: dryRun && p.status === "enviar" ? "dry_run" : p.status, recipients: p.recipients });
      continue;
    }
    let ok = 0;
    const failures: string[] = [];
    for (const rcpt of p.recipients) {
      const { error: e } = await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "ticketing-sync-alert",
          recipientEmail: rcpt,
          companyId: p.company_id,
          idempotencyKey: `ticketing-sync-health-${p.company_id}-${rcpt}-${p.idempotency_day}`,
          templateData: { runAt: (data as any).run_at, itens: p.itens },
        },
      });
      if (e) failures.push(`${rcpt}: ${e.message ?? e}`); else ok++;
    }
    if (ok > 0) await admin.rpc("ticketing_health_mark_notified", { _company: p.company_id });
    if (failures.length) {
      console.error("[ticketing-sync-health] falhas de envio", p.company_id, failures);
      await admin.from("system_audit_log").insert({
        entity_type: "ticketing_sync_health", entity_id: p.company_id, action: "email_failed",
        changed_by: "sistema", metadata: { failures, itens: p.itens },
      });
    }
    result.push({ company_id: p.company_id, status: "enviado", sent: ok, failed: failures.length });
  }

  return json({ dry_run: dryRun, run_at: (data as any)?.run_at, resultado: result });
});
