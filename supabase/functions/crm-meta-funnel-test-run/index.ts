// crm-meta-funnel-test-run
// Cria run, retorna run_id imediatamente, e executa em background.
// Real Browserless quando BROWSERLESS_API_KEY presente; fallback para stub.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import {
  STEP_SEQUENCE,
  STUB_FIXTURES,
  type StepName,
} from "./_stub_fixtures.ts";
import {
  runBrowserlessSession,
  fetchLighthouse,
  type SessionStepResult,
} from "./_browserless.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const BROWSERLESS_API_KEY = Deno.env.get("BROWSERLESS_API_KEY") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch { return false; }
}

function isServiceRoleAuth(authHeader: string): boolean {
  if (SERVICE_ROLE.length > 0 && authHeader === `Bearer ${SERVICE_ROLE}`) return true;
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.role === "service_role";
  } catch { return false; }
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function generateAiSummary(payload: unknown): Promise<string | null> {
  if (!LOVABLE_API_KEY) return null;
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "És analista do funil Meta Pixel. Em PT-PT, 4-6 linhas, identifica eventos esperados em falta, problemas de Lighthouse (LCP/TBT/CLS), erros de consola relevantes e dá 1 recomendação prioritária." },
          { role: "user", content: `Resultado da auditoria:\n${JSON.stringify(payload, null, 2)}` },
        ],
      }),
    });
    if (!resp.ok) { console.error("[funnel-test] AI summary error", resp.status, await resp.text()); return null; }
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (e) { console.error("[funnel-test] AI summary threw", e); return null; }
}

function classifySeverity(
  expected: string[],
  detected: { event: string }[],
  consoleErrors: { level: string }[],
): "healthy" | "warning" | "critical" {
  const set = new Set(detected.map((e) => e.event));
  const missing = expected.filter((e) => !set.has(e));
  const errors = consoleErrors.filter((c) => c.level === "error").length;
  if (missing.length >= 2 || errors >= 3) return "critical";
  if (missing.length >= 1 || errors >= 1) return "warning";
  return "healthy";
}

function lhKeyForStep(step: StepName): string {
  if (step === "navigate_home") return "home";
  if (step === "click_event") return "product";
  if (step === "open_cart") return "cart";
  if (step === "begin_checkout") return "checkout";
  return step;
}

async function buildSessionStepsFromStub(): Promise<SessionStepResult[]> {
  return STEP_SEQUENCE.map((name) => {
    const f = STUB_FIXTURES[name];
    return {
      name,
      step_status: f.step_status,
      duration_ms: f.duration_ms,
      url_at_step: f.url_at_step,
      screenshot_b64: null,
      pixel_events: f.pixel_events,
      console_errors: f.console_errors,
      notes: f.notes ?? null,
      // stub provides lighthouse direct on the fixture; smuggle via _stubLighthouse
      _stubLighthouse: f.lighthouse,
    } as SessionStepResult & { _stubLighthouse?: any };
  });
}

async function executeRun(runId: string, targetUrl: string, companyId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const startedAt = new Date();
  await admin.schema("crm").from("funnel_test_runs").update({
    status: "running",
    started_at: startedAt.toISOString(),
  }).eq("id", runId);

  const useStub = !BROWSERLESS_API_KEY;
  if (useStub) console.warn("[funnel-test] BROWSERLESS_API_KEY ausente — fallback STUB");

  // 1) Pre-insert all step rows as 'running' so o frontend mostra logo a sequência
  const stepRowIds: Record<StepName, string | null> = {
    navigate_home: null, click_event: null, select_ticket: null,
    add_to_cart: null, open_cart: null, begin_checkout: null,
  };
  for (let i = 0; i < STEP_SEQUENCE.length; i++) {
    const name = STEP_SEQUENCE[i];
    const { data: row } = await admin.schema("crm").from("funnel_test_steps").insert({
      run_id: runId,
      step_index: i,
      step_name: name,
      step_status: "running",
      started_at: new Date().toISOString(),
    }).select("id").maybeSingle();
    stepRowIds[name] = row?.id ?? null;
  }

  // 2) Run session (real or stub)
  let sessionSteps: (SessionStepResult & { _stubLighthouse?: any })[] = [];
  let runError: string | null = null;
  try {
    if (useStub) {
      sessionSteps = await buildSessionStepsFromStub();
    } else {
      const result = await runBrowserlessSession(targetUrl, BROWSERLESS_API_KEY);
      sessionSteps = result.steps;
    }
  } catch (e) {
    runError = e instanceof Error ? e.message : String(e);
    console.error("[funnel-test] session failed", runError);
    // mark all pending steps as failed
    for (const name of STEP_SEQUENCE) {
      const id = stepRowIds[name];
      if (id) {
        await admin.schema("crm").from("funnel_test_steps").update({
          step_status: "failed",
          completed_at: new Date().toISOString(),
          notes: "browserless_session_failed",
        }).eq("id", id);
      }
    }
    await admin.schema("crm").from("funnel_test_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: `Browserless: ${runError}`,
    }).eq("id", runId);
    return;
  }

  // 3) Persist screenshots + step rows
  const detectedAll: any[] = [];
  const consoleAll: any[] = [];
  const lighthouseSummary: Record<string, any> = {};
  let allPassed = true;

  for (let i = 0; i < sessionSteps.length; i++) {
    const s = sessionSteps[i];
    const id = stepRowIds[s.name];
    let screenshotUrl: string | null = null;

    if (s.screenshot_b64) {
      try {
        const path = `${companyId}/${runId}/${i}.png`;
        const bytes = b64ToBytes(s.screenshot_b64);
        await admin.storage.from("funnel-test-screenshots").upload(path, bytes, {
          contentType: "image/png",
          upsert: true,
        });
        const { data: signed } = await admin.storage
          .from("funnel-test-screenshots")
          .createSignedUrl(path, 7 * 24 * 3600);
        screenshotUrl = signed?.signedUrl ?? null;
      } catch (e) {
        console.warn("[funnel-test] screenshot upload failed", e);
      }
    }

    detectedAll.push(...(s.pixel_events ?? []));
    consoleAll.push(...(s.console_errors ?? []));
    if (s.step_status !== "passed") allPassed = false;

    // Stub lighthouse goes in directly; real lighthouse comes after.
    if (s._stubLighthouse) {
      lighthouseSummary[lhKeyForStep(s.name)] = s._stubLighthouse;
    }

    if (id) {
      await admin.schema("crm").from("funnel_test_steps").update({
        step_status: s.step_status,
        completed_at: new Date().toISOString(),
        duration_ms: s.duration_ms,
        screenshot_url: screenshotUrl,
        url_at_step: s.url_at_step,
        pixel_events_in_step: s.pixel_events ?? [],
        console_errors_in_step: s.console_errors ?? [],
        lighthouse_at_step: s._stubLighthouse ?? null,
        notes: s.notes ?? null,
      }).eq("id", id);
    }
  }

  // 4) Real Lighthouse (após sessão fechar) para os 4 URLs-chave
  if (!useStub) {
    const lhTargets: { key: string; url: string | null; step: StepName }[] = [
      { key: "home", url: sessionSteps.find((x) => x.name === "navigate_home")?.url_at_step ?? null, step: "navigate_home" },
      { key: "product", url: sessionSteps.find((x) => x.name === "click_event")?.url_at_step ?? null, step: "click_event" },
      { key: "cart", url: sessionSteps.find((x) => x.name === "open_cart")?.url_at_step ?? null, step: "open_cart" },
      { key: "checkout", url: sessionSteps.find((x) => x.name === "begin_checkout")?.url_at_step ?? null, step: "begin_checkout" },
    ];
    await Promise.all(lhTargets.map(async (t) => {
      if (!t.url) return;
      const lh = await fetchLighthouse(t.url, BROWSERLESS_API_KEY);
      if (!lh) return;
      lighthouseSummary[t.key] = lh;
      const id = stepRowIds[t.step];
      if (id) {
        await admin.schema("crm").from("funnel_test_steps").update({
          lighthouse_at_step: lh,
        }).eq("id", id);
      }
    }));
  }

  // 5) Severidade + AI summary + fechar run
  const { data: runRow } = await admin.schema("crm").from("funnel_test_runs")
    .select("expected_pixel_events").eq("id", runId).maybeSingle();
  const expected = runRow?.expected_pixel_events ?? [];
  const severity = classifySeverity(expected, detectedAll, consoleAll);

  const aiSummary = await generateAiSummary({
    target_url: targetUrl,
    expected,
    detected: detectedAll,
    console_errors: consoleAll,
    lighthouse: lighthouseSummary,
  });

  const completedAt = new Date();
  await admin.schema("crm").from("funnel_test_runs").update({
    status: allPassed ? "completed" : "failed",
    completed_at: completedAt.toISOString(),
    total_duration_ms: completedAt.getTime() - startedAt.getTime(),
    detected_pixel_events: detectedAll,
    console_errors: consoleAll,
    lighthouse_summary: lighthouseSummary,
    severity,
    ai_summary: aiSummary,
  }).eq("id", runId);
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!SERVICE_ROLE) {
      console.error("[funnel-test] missing SUPABASE_SERVICE_ROLE_KEY");
      return json({ error: "server_misconfigured", detail: "missing_service_role" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { target_url?: string; connection_id?: string; event_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const targetUrl = (body.target_url ?? "").trim();
  if (!targetUrl || !isValidUrl(targetUrl)) return json({ error: "invalid_target_url" }, 400);

    const serviceRoleRequest = isServiceRoleAuth(authHeader);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    let userId: string | null = null;
    let companyId: string | null = null;

    if (serviceRoleRequest) {
      const { data: conn, error: connErr } = await (admin as any)
        .schema("crm")
        .from("ad_platform_connections")
        .select("company_id")
        .eq("platform", "meta")
        .eq("status", "active")
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (connErr) console.error("[funnel-test] service company lookup err", connErr);
      companyId = conn?.company_id ?? null;
      console.log(`[funnel-test] auth=service_role company=${companyId ? "ok" : "missing"}`);
    } else {
      const { data: u, error: userErr } = await userClient.auth.getUser();
      userId = u?.user?.id ?? null;
      if (userErr || !userId) {
        console.error("[funnel-test] auth getUser failed", userErr);
        return json({ error: "unauthenticated" }, 401);
      }

      const { data: cid, error: cidErr } = await userClient.rpc("current_company_id");
      companyId = (cid as string) ?? null;
      if (cidErr || !companyId) {
        console.error("[funnel-test] current_company_id failed", cidErr);
        return json({ error: "no_company_context" }, 403);
      }
    }

  if (!companyId) return json({ error: "no_company_context" }, 403);

  const { data: ins, error: insErr } = await admin
    .schema("crm")
    .from("funnel_test_runs")
    .insert({
      company_id: companyId,
      connection_id: body.connection_id ?? null,
      event_id: body.event_id ?? null,
      target_url: targetUrl,
      status: "queued",
      created_by: userId,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !ins?.id) {
    console.error("[funnel-test] insert err", insErr);
    return json({ error: "insert_failed", detail: insErr?.message }, 500);
  }

  // @ts-ignore - EdgeRuntime is available in Supabase Edge Runtime
  EdgeRuntime.waitUntil(
    executeRun(ins.id, targetUrl, companyId).catch(async (e) => {
      console.error("[funnel-test] run failed", e);
      await admin.schema("crm").from("funnel_test_runs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: e instanceof Error ? e.message : String(e),
      }).eq("id", ins.id);
    }),
  );

    console.log(`[funnel-test] queued run=${ins.id} browserless=${BROWSERLESS_API_KEY ? "real" : "stub"}`);
    return json({ run_id: ins.id, status: "queued" }, 202);
  } catch (e) {
    console.error("[funnel-test] handler_uncaught", e);
    return json({ error: "handler_uncaught", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
