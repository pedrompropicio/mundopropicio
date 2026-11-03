// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { assertNotTraining, assertPushOrigin, isTrainingCompany, TrainingCompanyError, trainingSafeConsentBinding } from "../../supabase/functions/_shared/training-guard.ts";
import { createHandler } from "../../supabase/functions/capi-v2-send/handler.ts";

function fixture(company: string | null, training = false, serviceRole = true) {
  const writes: { table: string; action: string; data: any }[] = [];
  const rpcCalls: { name: string; args: any }[] = [];
  const provider = vi.fn(async () => ({ sid: "synthetic" }));
  const fetchFn = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "synthetic" }] }), { status: 200 }));
  const rows: Record<string, any[]> = {
    system_reminder_settings: [{ default_whatsapp_recipient: "+00000000000" }],
    system_reminders: [{ id: "reminder", company_id: company, title: "synthetic", message: "fixture", key: "fixture", frequency: "daily" }],
    notification_queue: [{ id: "notification", company_id: company, recipient_phone: "+00000000000", params: [], template: { meta_template_name: "synthetic" } }],
    email_send_state: [{ send_delay_ms: 0 }], email_send_log: [], suppressed_emails: [],
    email_unsubscribe_tokens: [{ token: "synthetic", used_at: null }],
    user_roles: [{ user_id: "user" }], profiles: [{ id: "user", active_company_id: company, phone: "+00000000000" }],
    push_subscriptions: [{ user_id: "user", endpoint: "https://example.invalid/push", p256dh: "fixture", auth: "fixture" }],
    operacao_frentes: [{ company_id: company, current_lead_id: "user" }],
  };
  const sb = {
    auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
    rpc: vi.fn(async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      if (name === "is_training_company") return { data: training, error: null };
      if (name === "capi_dispatch_allowed") return { data: true, error: null };
      if (name === "marketing_consent_binding_valid") return { data: !training, error: null };
      if (name === "get_vault_secret") return { data: "synthetic-secret", error: null };
      if (name === "is_platform_admin") return { data: false, error: null };
      if (name === "read_email_batch") return { data: args.queue_name === "auth_emails" ? [] : [{ msg_id: 1, read_ct: 1, enqueued_at: new Date().toISOString(), message: { company_id: company, message_id: "message", to: "fixture@example.invalid", label: "synthetic", queued_at: new Date().toISOString() } }], error: null };
      return { data: null, error: null };
    }),
    from: (table: string) => {
      const q: any = {};
      for (const method of ["select", "eq", "is", "lte", "lt", "order", "limit", "in", "not", "range", "or"]) q[method] = () => q;
      for (const action of ["insert", "update", "upsert", "delete"]) q[action] = (data: any) => { writes.push({ table, action, data }); return q; };
      q.then = (done: any) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(done);
      q.maybeSingle = q.single = async () => ({ data: rows[table]?.[0] ?? null, error: null });
      return q;
    },
  };
  return { sb, writes, rpcCalls, provider, fetchFn, rows, serviceRole };
}

// Evaluate the actual Deno entrypoint after removing import declarations only.
// Every imported dependency and provider is injected; no credential or network is used.
function edge(name: string, f: ReturnType<typeof fixture>) {
  let handler: (req: Request) => Promise<Response>;
  const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    transformers: { before: [context => file => ts.factory.updateSourceFile(file, file.statements.filter(s => !ts.isImportDeclaration(s)))] },
  }).outputText.replace('import("npm:web-push@3.6.7")', "Promise.resolve(injectedWebPush)").replace(/export \{\};?/, "");
  const dependencies: Record<string, any> = {
    Deno: { env: { get: (key: string) => key === "WHATSAPP_DISPATCHER_CRON_SECRET" ? undefined : "https://example.invalid" }, serve: (fn: any) => { handler = fn; } },
    createClient: () => f.sb, isTrainingCompany, assertNotTraining, assertPushOrigin, TrainingCompanyError,
    sendWhatsApp: f.provider, isServiceRoleRequest: async () => f.serviceRole,
    fetch: f.fetchFn, sendLovableEmail: f.provider,
    fetchAllPagedQuery: async (q: any) => q,
    TEMPLATES: { synthetic: { component: () => null, subject: "synthetic" } },
    React: { createElement: () => null }, renderAsync: async () => "<p>synthetic</p>",
    sanitizeRenderedEmail: (html: string) => ({ out: html, findings: [] }),
    injectedWebPush: { setVapidDetails: vi.fn(), sendNotification: f.provider },
  };
  new Function(...Object.keys(dependencies), compiled)(...Object.values(dependencies));
  return (body: any = {}) => handler(new Request("https://example.invalid", { method: "POST", headers: { Authorization: "Bearer synthetic", "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

describe("#562 guard puro", () => {
  it.each([false, true])("RPC devolve %s sem fallback", async value => {
    const sb = fixture("company", value).sb;
    expect(await isTrainingCompany(sb, "company")).toBe(value);
    if (value) await expect(assertNotTraining(sb, "company")).rejects.toMatchObject({ status: 403, body: { error: "training_company" } });
    else await expect(assertNotTraining(sb, "company")).resolves.toBeUndefined();
  });
  it("globais não consultam a base; fallback válido e ausência/erro recusados", async () => {
    const f = fixture(null);
    expect(await isTrainingCompany(f.sb, null)).toBe(false);
    expect(f.sb.rpc).not.toHaveBeenCalled();
    f.sb.rpc.mockResolvedValue({ data: null, error: null });
    f.rows.companies = [{ is_training: true }];
    expect(await isTrainingCompany(f.sb, "company")).toBe(true);
    f.rows.companies = [{ is_training: false }];
    expect(await isTrainingCompany(f.sb, "company")).toBe(false);
    f.rows.companies = [];
    await expect(isTrainingCompany(f.sb, "company")).rejects.toThrow("training_company_lookup_failed");
    await expect(isTrainingCompany(f.sb, " ")).rejects.toThrow();
  });
  it("push sem origem recusa até service_role; nomes arbitrários não autorizam", async () => {
    await expect(assertPushOrigin(fixture(null).sb, null, true, "inventado")).rejects.toBeInstanceOf(TrainingCompanyError);
  });
  it("decisão CAPI combinada aceita só boolean true da RPC canónica", async () => {
    const f = fixture("real");
    const binding = { p_subject: "subject", p_event: 1, p_company: "real", p_portal: "synthetic", p_captured_at: "2026-11-03T12:00:00Z" };
    f.sb.rpc.mockResolvedValue({ data: true, error: null });
    expect(await trainingSafeConsentBinding(f.sb, binding)).toBe(true);
    f.sb.rpc.mockResolvedValue({ data: false, error: null });
    expect(await trainingSafeConsentBinding(f.sb, binding)).toBe(false);
    f.sb.rpc.mockResolvedValue({ data: true, error: { message: "unavailable" } } as any);
    expect(await trainingSafeConsentBinding(f.sb, binding)).toBe(false);
  });
});

describe("#562 handlers Deno reais com transportes sintéticos", () => {
  it.each([false, true, null])("reminders: treino=%s antes do destinatário global", async value => {
    const f = fixture(value === null ? null : "company", value === true);
    expect((await edge("send-system-reminders", f)()).status).toBe(200);
    expect(f.provider).toHaveBeenCalledTimes(value === true ? 0 : 1);
  });
  it.each([false, true, null])("WhatsApp: treino=%s antes do POST/log externo", async value => {
    const f = fixture(value === null ? null : "company", value === true);
    expect((await edge("whatsapp-dispatcher", f)()).status).toBe(200);
    expect(f.fetchFn).toHaveBeenCalledTimes(value === true ? 0 : 1);
    if (value) {
      expect(f.writes).toContainEqual({ table: "notification_queue", action: "update", data: { status: "skipped", last_error: "suppressed_training" } });
      expect(f.writes.some(w => w.table === "notification_log")).toBe(false);
    }
  });
  it.each([false, true, null])("fila email: treino=%s suprime e elimina sem provider", async value => {
    const f = fixture(value === null ? null : "company", value === true);
    expect((await edge("process-email-queue", f)()).status).toBe(200);
    expect(f.provider).toHaveBeenCalledTimes(value === true ? 0 : 1);
    if (value) expect(f.writes).toContainEqual(expect.objectContaining({ table: "email_send_log", data: expect.objectContaining({ status: "suppressed", error_message: "suppressed_training" }) }));
    expect(f.rpcCalls.some(c => c.name === "delete_email")).toBe(true);
  });
  it.each([false, true])("transacional: treino=%s antes de tokens/enqueue", async value => {
    const f = fixture("company", value);
    const response = await edge("send-transactional-email", f)({ companyId: "company", templateName: "synthetic", recipientEmail: "fixture@example.invalid" });
    expect(response.status).toBe(value ? 403 : 200);
    expect(f.rpcCalls.some(c => c.name === "enqueue_email")).toBe(!value);
    if (value) expect(f.writes).toEqual([]);
  });
  it.each(["company_admins", "frente_team", "users"])("push %s: origem de treino recusa antes dos destinatários", async type => {
    const f = fixture("company", true);
    const response = await edge("send-push-notification", f)({ title: "synthetic", body: "fixture", company_id: "company", target: { type, company_id: "company", frente_id: "front", user_ids: ["user"] } });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "training_company" });
    expect(f.provider).not.toHaveBeenCalled();
  });
  it.each([true, false])("push real mantém envio (service_role=%s)", async serviceRole => {
    const f = fixture("real", false, serviceRole);
    expect((await edge("send-push-notification", f)({ title: "synthetic", body: "fixture", company_id: "real", user_ids: ["user"] })).status).toBe(200);
    expect(f.provider).toHaveBeenCalledOnce();
  });
  it.each([false, true])("CAPI v2 treino=%s: decisão canónica antes de resolver token/Graph", async training => {
    const f = fixture("company", training);
    const instant = new Date();
    f.rows.capi_v2_targets = [{ pixel_id: "synthetic-pixel", enabled: true, start_at: "2026-01-01T00:00:00Z" }];
    f.rows.capi_v2_events = [{ id: "event", pixel_id: "synthetic-pixel", source_table: "lead_capture", source_id: "lead", event_name: "Lead", event_id: "synthetic-event", status: "pending", attempts: 0 }];
    f.rows.lead_capture = [{ id: "lead", company_id: "company", created_at: instant.toISOString(), consent_subject_id: "subject", consent_event_id: 1, consent_portal: "coala" }];
    f.fetchFn.mockImplementation(async () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    const handler = createHandler({ sb: f.sb, fetchFn: f.fetchFn as typeof fetch, now: () => instant, env: () => undefined, isServiceRole: async () => true });
    const response = await handler(new Request("https://example.invalid", { method: "POST", body: JSON.stringify({ action: "send" }) }));
    expect(response.status).toBe(200);
    expect(f.fetchFn).toHaveBeenCalledTimes(training ? 0 : 1);
    expect(f.rpcCalls.some(c => c.name === "get_vault_secret")).toBe(!training);
  });
});
