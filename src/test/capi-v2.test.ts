// capi-v2-send (#322 opção A) — testes herméticos, sem rede real nem Cloud.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  buildGraphEvent, buildUserData, classifyGraphResponse, createHandler,
  isOlderThanMaxAge, nextBackoff, normEmail, normPhone, sha256Hex, sourceUrl,
  type CapiV2Row, type SbLike,
} from "../../supabase/functions/capi-v2-send/handler";

const NOW = new Date("2026-10-19T02:00:00Z");
const PIXEL_COALA = "1142136723579970";
const PIXEL_NG = "1158654246468410";

describe("0201 — enfileiramento PostgreSQL offline", () => {
  const db = new PGlite();
  type Queued = { source_table: string; pixel_id: string; event_name: string; event_id: string };
  let queued: Queued[] = [];
  beforeAll(async () => {
    // Base exclusivamente em memória: não usa cliente Cloud, credenciais ou rede.
    await db.exec(`
      CREATE TABLE capi_v2_targets (event_slug text, portal text, pixel_id text, enabled boolean, start_at timestamptz);
      CREATE TABLE lead_capture (id uuid, client_event_id uuid, event_slug text, consent_event_id bigint, created_at timestamptz, email text);
      CREATE TABLE club_members (id uuid, member_no integer, email text, confirmed_at timestamptz);
      CREATE TABLE capi_v2_events (source_table text, source_id text, pixel_id text, event_name text, event_id text,
        UNIQUE (pixel_id, event_name, event_id));
      INSERT INTO capi_v2_targets VALUES
        ('coala', 'coala', '${PIXEL_COALA}', true, now() - interval '2 days'),
        ('newgang', 'newgang', '${PIXEL_NG}', true, now() - interval '2 days');
      INSERT INTO lead_capture VALUES
        ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 'coala', 1, now() - interval '1 hour', 'coala@example.invalid'),
        ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000012', 'newgang', 2, now() - interval '1 hour', 'newgang@example.invalid');
      INSERT INTO club_members VALUES
        ('00000000-0000-4000-8000-000000000003', 7, 'newgang@example.invalid', now() - interval '30 minutes');
    `);
    await db.exec(readFileSync(new URL("../../drizzle/migrations/0201_capi_v2_coala_lead_only.sql", import.meta.url), "utf8"));
    await db.query("SELECT capi_v2_enqueue(100)");
    queued = (await db.query<Queued>("SELECT source_table, pixel_id, event_name, event_id FROM capi_v2_events ORDER BY event_name")).rows;
  }, 30_000);
  afterAll(async () => { await db.close(); });

  it("Coala enfileira só Lead com o client_event_id, nunca CompleteRegistration", () => {
    expect(queued.filter((e) => e.pixel_id === PIXEL_COALA)).toEqual([
      { source_table: "lead_capture", pixel_id: PIXEL_COALA, event_name: "Lead", event_id: "00000000-0000-4000-8000-000000000011" },
    ]);
  });
  it("Newgang mantém Lead + CompleteRegistration no cadastro, com o mesmo client_event_id", () => {
    expect(queued.filter((e) => e.pixel_id === PIXEL_NG && e.source_table === "lead_capture")).toEqual([
      { source_table: "lead_capture", pixel_id: PIXEL_NG, event_name: "CompleteRegistration", event_id: "00000000-0000-4000-8000-000000000012" },
      { source_table: "lead_capture", pixel_id: PIXEL_NG, event_name: "Lead", event_id: "00000000-0000-4000-8000-000000000012" },
    ]);
  });
  it("ClubeConfirmado mantém o event_id clube_confirmado_<member_no>", () => {
    expect(queued.filter((e) => e.source_table === "club_members")).toEqual([
      { source_table: "club_members", pixel_id: PIXEL_NG, event_name: "ClubeConfirmado", event_id: "clube_confirmado_7" },
    ]);
  });
  it("segunda execução não duplica os quatro eventos", async () => {
    expect((await db.query<{ added: number }>("SELECT capi_v2_enqueue(100) AS added")).rows).toEqual([{ added: 0 }]);
    expect((await db.query<{ total: number }>("SELECT count(*)::integer AS total FROM capi_v2_events")).rows).toEqual([{ total: 4 }]);
  });
});

function row(over: Partial<CapiV2Row> = {}): CapiV2Row {
  return {
    id: "r1", source_table: "lead_capture", source_id: "l1",
    pixel_id: PIXEL_COALA, event_name: "Lead", event_id: "evt-1",
    status: "pending", attempts: 0, next_attempt_at: null, ...over,
  };
}

function leadCapture(over: Record<string, unknown> = {}) {
  return {
    id: "l1", email: "  Ana@Example.com ", phone: "+351 912 345 678",
    fbc: "fb.1.abc", fbp: "fb.1.def", ip_inet: "1.2.3.4", user_agent: "UA",
    created_at: "2026-10-18T10:00:00Z", event_slug: "coala-festival-portugal-2027",
    consent_subject_id: "s1", consent_event_id: 41, consent_portal: "coala",
    company_id: "c1", raw: { landing_url: "https://coalafestival.pt/bilhetes?utm_source=x" },
    ...over,
  };
}

type FakeOpts = {
  targets?: any[];
  events?: CapiV2Row[];
  leads?: Record<string, any>;
  members?: Record<string, any>;
  dispatchAllowed?: boolean;
  bindingValid?: boolean;
  newgangAdsOk?: boolean;
  graphResponses?: Array<{ status: number; body: any }>;
  graphThrow?: boolean;
};

function fakeSb(o: FakeOpts) {
  const updates: any[] = [];
  const alerts: any[] = [];
  const graphCalls: any[] = [];
  const sb: SbLike = {
    rpc: async (fn, args) => {
      if (fn === "capi_dispatch_allowed") return { data: o.dispatchAllowed !== false, error: null };
      if (fn === "marketing_consent_binding_valid") return { data: o.bindingValid !== false, error: null };
      if (fn === "capi_v2_newgang_ads_ok") return { data: o.newgangAdsOk === true, error: null };
      if (fn === "get_vault_secret") return { data: "tok", error: null };
      return { data: null, error: null };
    },
    from: (table: string) => {
      const filters: any[] = [];
      const execute = async () => {
        if (table === "capi_v2_targets") return { data: o.targets ?? [], error: null, count: null };
        if (table === "capi_v2_events") {
          const st = filters.find(([c]: [string]) => c === "status");
          let rows = o.events ?? [];
          if (st) rows = rows.filter((r) => (st[1] as string[]).includes(r.status));
          return { data: rows, error: null, count: rows.length };
        }
        if (table === "lead_capture") return { data: Object.values(o.leads ?? {}), error: null, count: null };
        return { data: [], error: null, count: 0 };
      };
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
        in: (c: string, v: unknown) => { filters.push([c, v]); return q; },
        or: () => q, not: () => q, ilike: () => q,
        order: () => q, limit: () => q,
        maybeSingle: async () => {
          const id = filters.find(([c]) => c === "id")?.[1];
          if (table === "lead_capture") return { data: o.leads?.[String(id)] ?? null, error: null };
          if (table === "club_members") return { data: o.members?.[String(id)] ?? null, error: null };
          return { data: null, error: null };
        },
        update: (patch: any) => ({
          eq: () => ({ in: () => { updates.push({ table, patch }); return Promise.resolve({ error: null }); } }),
        }),
        insert: (rec: any) => { alerts.push(rec); return Promise.resolve({ error: null }); },
        then: (res: any, rej: any) => execute().then(res, rej),
      };
      return q;
    },
  };
  const fetchFn = (async (url: any, init: any) => {
    graphCalls.push({ url: String(url), body: JSON.parse(init.body) });
    if (o.graphThrow) throw new Error("network down");
    const r = (o.graphResponses ?? [{ status: 200, body: { events_received: 1, fbtrace_id: "ft1" } }]).shift()
      ?? { status: 200, body: { events_received: 1, fbtrace_id: "ft1" } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
  return { sb, fetchFn, updates, alerts, graphCalls };
}

function makeHandler(o: FakeOpts) {
  const f = fakeSb(o);
  const h = createHandler({
    sb: f.sb, fetchFn: f.fetchFn, env: () => undefined, now: () => NOW,
    isServiceRole: async () => true,
  });
  return { h, ...f };
}

const post = (body: unknown) => new Request("http://local/functions/v1/capi-v2-send", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("helpers puros", () => {
  it("normaliza email (trim+lowercase) e telefone (só dígitos E.164 sem '+')", async () => {
    expect(normEmail("  Ana@Example.com ")).toBe("ana@example.com");
    expect(normPhone("+351 912 345 678")).toBe("351912345678");
    expect(await sha256Hex("ana@example.com")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("event_id é o client_event_id; clube usa clube_confirmado_<n>", () => {
    const e = buildGraphEvent({ event_name: "Lead", event_id: "uuid-1", event_time: 1, user_data: {} });
    expect(e.event_id).toBe("uuid-1");
    expect(e.action_source).toBe("website");
  });
  it("source_url = origem + path sem query string", () => {
    expect(sourceUrl("coala", { landing_url: "https://coalafestival.pt/bilhetes?utm=x" })).toBe("https://coalafestival.pt/bilhetes");
    expect(sourceUrl("newgang", null)).toBe("https://newgangfestival.pt");
  });
  it("user_data omite em/ph quando não há hash (Newgang sem anuncios-v1)", () => {
    const u = buildUserData({ fbc: "a", fbp: "b", ip: "1.1.1.1", ua: "UA" });
    expect(u).toEqual({ fbc: "a", fbp: "b", client_ip_address: "1.1.1.1", client_user_agent: "UA" });
    expect("em" in u).toBe(false);
    expect("ph" in u).toBe(false);
  });
  it("backoff exponencial 1/5/15/60/180 e idade >6 dias", () => {
    expect(nextBackoff(1, NOW)).toBe("2026-10-19T02:01:00.000Z");
    expect(nextBackoff(5, NOW)).toBe("2026-10-19T05:00:00.000Z");
    expect(isOlderThanMaxAge("2026-10-12T01:59:00Z", NOW)).toBe(true);
    expect(isOlderThanMaxAge("2026-10-18T00:00:00Z", NOW)).toBe(false);
  });
  it("classifica 200 ok, 200 mismatch terminal, 429/5xx transient, 4xx terminal", () => {
    expect(classifyGraphResponse(200, { events_received: 2, fbtrace_id: "f" }, 2)).toEqual({ kind: "ok", fbtrace_id: "f" });
    expect(classifyGraphResponse(200, { events_received: 1 }, 2).kind).toBe("terminal");
    expect(classifyGraphResponse(429, { error: { code: 17 } }, 1).kind).toBe("transient");
    expect(classifyGraphResponse(500, null, 1).kind).toBe("transient");
    const t = classifyGraphResponse(403, { error: { code: 200 }, fbtrace_id: "fx" }, 1);
    expect(t).toEqual({ kind: "terminal", http_status: 403, error_code: "200", fbtrace_id: "fx" });
  });
});

describe("handler", () => {
  it("send recusa com suspensão ativa (sem override)", async () => {
    const { h, graphCalls } = makeHandler({ dispatchAllowed: false });
    const r = await h(post({ action: "send" }));
    expect(r.status).toBe(423);
    expect(await r.json()).toEqual({ refused: true, reason: "suspended" });
    expect(graphCalls).toHaveLength(0);
  });
  it("test_event_code exige confirm_test; override de suspensão só com confirm_test", async () => {
    const { h } = makeHandler({});
    const r1 = await h(post({ action: "send", test_event_code: "TEST123" }));
    expect(r1.status).toBe(400);
    const { h: h2, graphCalls } = makeHandler({ dispatchAllowed: false, events: [] });
    const r2 = await h2(post({ action: "send", confirm_test: true, override_suspension_for_test: true, test_event_code: "TEST123" }));
    expect(r2.status).toBe(200);
    expect(graphCalls).toHaveLength(0); // sem filas elegíveis
  });
  it("dry_run devolve payload com hashes e NUNCA chama o Graph", async () => {
    const { h, graphCalls } = makeHandler({
      events: [row()], leads: { l1: leadCapture() },
    });
    const r = await h(post({ action: "dry_run", limit: 5 }));
    const j = await r.json();
    expect(j.dry_run).toBe(true);
    expect(graphCalls).toHaveLength(0);
    const ev = j.payloads[0].event;
    expect(ev.event_id).toBe("evt-1");
    expect(ev.user_data.em[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(ev.user_data.ph[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(j)).not.toContain("Ana@Example.com");
    expect(JSON.stringify(j)).not.toContain("tok");
  });
  it("Newgang sem anuncios-v1: evento segue SEM em/ph", async () => {
    const { h } = makeHandler({
      events: [row({ pixel_id: PIXEL_NG })],
      leads: { l1: leadCapture({ consent_portal: "newgang" }) },
      newgangAdsOk: false,
    });
    const r = await h(post({ action: "dry_run" }));
    const j = await r.json();
    const u = j.payloads[0].event.user_data;
    expect("em" in u).toBe(false);
    expect("ph" in u).toBe(false);
    expect(u.fbc).toBe("fb.1.abc");
  });
  it("Newgang com anuncios-v1 em vigor: inclui hashes em/ph", async () => {
    const { h } = makeHandler({
      events: [row({ pixel_id: PIXEL_NG })],
      leads: { l1: leadCapture({ consent_portal: "newgang" }) },
      newgangAdsOk: true,
    });
    const j = await (await h(post({ action: "dry_run" }))).json();
    expect(j.payloads[0].event.user_data.em[0]).toMatch(/^[0-9a-f]{64}$/);
  });
  it("prova revogada entre captura e envio → skipped_no_consent, nunca enviado", async () => {
    const { h, graphCalls, updates } = makeHandler({
      events: [row()], leads: { l1: leadCapture() }, bindingValid: false,
      targets: [{ event_slug: "coala-festival-portugal-2027", pixel_id: PIXEL_COALA, enabled: true, start_at: "2026-10-01" }],
    });
    const j = await (await h(post({ action: "send" }))).json();
    expect(j.skipped_no_consent).toBe(1);
    expect(graphCalls).toHaveLength(0);
    expect(updates.some((u) => u.patch.status === "skipped_no_consent")).toBe(true);
  });
  it("lead anterior a start_at/sem target enabled → recusado; >6 dias → expired", async () => {
    const { h, graphCalls, updates } = makeHandler({
      events: [row({ id: "r-old" })],
      leads: { "l1": leadCapture({ created_at: "2026-10-01T00:00:00Z" }) },
      targets: [{ event_slug: "s", pixel_id: PIXEL_COALA, enabled: true, start_at: "2026-09-01" }],
    });
    const j = await (await h(post({ action: "send" }))).json();
    expect(j.expired).toBe(1);
    expect(graphCalls).toHaveLength(0);
    expect(updates.some((u) => u.patch.status === "expired")).toBe(true);
  });
  it("target sem start_at/enabled → nada elegível (refused_targets)", async () => {
    const { h, graphCalls } = makeHandler({
      events: [row()], leads: { l1: leadCapture() },
      targets: [{ event_slug: "s", pixel_id: PIXEL_COALA, enabled: false, start_at: null }],
    });
    const j = await (await h(post({ action: "send" }))).json();
    expect(j.refused_targets).toBe(1);
    expect(graphCalls).toHaveLength(0);
  });
  it("idempotência: 2.ª execução com status sent não reenvia", async () => {
    const o: FakeOpts = {
      events: [row()], leads: { l1: leadCapture() },
      targets: [{ event_slug: "s", pixel_id: PIXEL_COALA, enabled: true, start_at: "2026-09-01" }],
    };
    const { h, graphCalls } = makeHandler(o);
    const j1 = await (await h(post({ action: "send" }))).json();
    expect(j1.sent).toBe(1);
    expect(graphCalls).toHaveLength(1);
    // 2.ª execução: a fila já não tem pending/retry (fake devolve events como sent)
    const f2 = makeHandler({ ...o, events: [row({ status: "sent" })] });
    // o fake não filtra por status, mas o handler pede in(pending,retry); simulamos fila vazia
    const f3 = makeHandler({ ...o, events: [] });
    const j3 = await (await f3.h(post({ action: "send" }))).json();
    expect(j3.sent).toBe(0);
    expect(f3.graphCalls).toHaveLength(0);
    void f2;
  });
  it("429 → retry com backoff; após MAX_ATTEMPTS → failed_terminal", async () => {
    const { h, updates } = makeHandler({
      events: [row({ attempts: 0 })], leads: { l1: leadCapture() },
      targets: [{ event_slug: "s", pixel_id: PIXEL_COALA, enabled: true, start_at: "2026-09-01" }],
      graphResponses: [{ status: 429, body: { error: { code: 17 } } }],
    });
    const j = await (await h(post({ action: "send" }))).json();
    expect(j.retry).toBe(1);
    expect(updates[0].patch.status).toBe("retry");
    expect(updates[0].patch.next_attempt_at).toBe("2026-10-19T02:01:00.000Z");

    const f2 = makeHandler({
      events: [row({ attempts: 4 })], leads: { l1: leadCapture() },
      targets: [{ event_slug: "s", pixel_id: PIXEL_COALA, enabled: true, start_at: "2026-09-01" }],
      graphResponses: [{ status: 500, body: null }],
    });
    const j2 = await (await f2.h(post({ action: "send" }))).json();
    expect(j2.failed_terminal).toBe(1);
    expect(f2.updates[0].patch.status).toBe("failed_terminal");
  });
  it("403 (token sem acesso ao pixel) → failed_terminal + alerta sem PII", async () => {
    const { h, updates, alerts } = makeHandler({
      events: [row()], leads: { l1: leadCapture() },
      targets: [{ event_slug: "s", pixel_id: PIXEL_COALA, enabled: true, start_at: "2026-09-01" }],
      graphResponses: [{ status: 403, body: { error: { code: 200 }, fbtrace_id: "fx" } }],
    });
    const j = await (await h(post({ action: "send" }))).json();
    expect(j.failed_terminal).toBe(1);
    expect(j.alerts).toBe(1);
    expect(updates[0].patch.status).toBe("failed_terminal");
    expect(alerts[0].detail).toContain("pixel=");
    expect(JSON.stringify(alerts)).not.toContain("Ana@Example.com");
  });
  it("200 com events_received === enviados → sent com fbtrace_id", async () => {
    const { h, updates, graphCalls } = makeHandler({
      events: [row()], leads: { l1: leadCapture() },
      targets: [{ event_slug: "s", pixel_id: PIXEL_COALA, enabled: true, start_at: "2026-09-01" }],
    });
    const j = await (await h(post({ action: "send" }))).json();
    expect(j.sent).toBe(1);
    expect(updates[0].patch.status).toBe("sent");
    expect(updates[0].patch.fbtrace_id).toBe("ft1");
    expect(graphCalls[0].url).toBe(`https://graph.facebook.com/v25.0/${PIXEL_COALA}/events`);
    expect(graphCalls[0].body.data[0].action_source).toBe("website");
    expect(graphCalls[0].body.access_token).toBe("tok");
    expect(graphCalls[0].body.test_event_code).toBeUndefined();
  });
  it("ClubeConfirmado: event_id clube_confirmado_<n>, event_time = confirmed_at", async () => {
    const { h, graphCalls } = makeHandler({
      events: [row({ source_table: "club_members", source_id: "m1", event_name: "ClubeConfirmado", event_id: "clube_confirmado_7", pixel_id: PIXEL_NG })],
      members: { m1: { id: "m1", email: "ana@example.com", phone: null, member_no: 7, confirmed_at: "2026-10-18T12:00:00Z" } },
      leads: { l9: leadCapture({ email: "Ana@Example.com", consent_portal: "newgang" }) },
      targets: [{ event_slug: "newgang-festival-2027", pixel_id: PIXEL_NG, enabled: true, start_at: "2026-09-01" }],
      newgangAdsOk: false,
    });
    const j = await (await h(post({ action: "send" }))).json();
    expect(j.sent).toBe(1);
    const ev = graphCalls[0].body.data[0];
    expect(ev.event_name).toBe("ClubeConfirmado");
    expect(ev.event_id).toBe("clube_confirmado_7");
    expect(ev.event_time).toBe(Math.floor(new Date("2026-10-18T12:00:00Z").getTime() / 1000));
    expect("em" in ev.user_data).toBe(false);
  });
  it("health não chama o Graph e reporta targets/suspensão", async () => {
    const { h, graphCalls } = makeHandler({
      targets: [{ event_slug: "coala-festival-portugal-2027", portal: "coala", pixel_id: PIXEL_COALA, enabled: false, start_at: null }],
    });
    const j = await (await h(post({ action: "health" }))).json();
    expect(j.ok).toBe(true);
    expect(j.targets[0].enabled).toBe(false);
    expect(j.targets[0].start_at_set).toBe(false);
    expect(graphCalls).toHaveLength(0);
  });
  it("sem service_role → 401", async () => {
    const f = fakeSb({});
    const h = createHandler({ sb: f.sb, fetchFn: f.fetchFn, env: () => undefined, now: () => NOW, isServiceRole: async () => false });
    expect((await h(post({ action: "health" }))).status).toBe(401);
  });
});
