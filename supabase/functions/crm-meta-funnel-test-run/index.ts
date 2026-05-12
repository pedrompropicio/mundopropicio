// crm-meta-funnel-test-run
// Cria run, retorna run_id imediatamente, e executa em background.
// STUB: chamadas a Browserless são simuladas via _stub_fixtures.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import {
  STEP_SEQUENCE,
  STUB_FIXTURES,
  type StepName,
  type StubStepResult,
} from "./_stub_fixtures.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

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
  } catch {
    return false;
  }
}

// TODO[browserless-stub]: substituir por chamada real à API Browserless
// quando BROWSERLESS_API_KEY estiver disponível.
async function runBrowserlessStep(
  step: StepName,
  _targetUrl: string,
  _prevState: { lastUrl: string | null },
): Promise<StubStepResult> {
  // Simula latência da chamada remota
  await new Promise((r) => setTimeout(r, 250));
  return STUB_FIXTURES[step];
}

async function generateAiSummary(payload: unknown): Promise<string | null> {
  if (!LOVABLE_API_KEY) return null;
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "És analista do funil Meta Pixel. Em PT-PT, 4-6 linhas, identifica eventos esperados em falta, problemas de Lighthouse (LCP/TBT/CLS), erros de consola relevantes e dá 1 recomendação prioritária.",
          },
          {
            role: "user",
            content: `Resultado da auditoria:\n${JSON.stringify(payload, null, 2)}`,
          },
        ],
      }),
    });
    if (!resp.ok) {
      console.error("[funnel-test] AI summary error", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.error("[funnel-test] AI summary threw", e);
    return null;
  }
}

function classifySeverity(
  expected: string[],
  detected: { event: string }[],
  consoleErrors: { level: string }[],
): "healthy" | "warning" | "critical" {
  const detectedSet = new Set(detected.map((e) => e.event));
  const missing = expected.filter((e) => !detectedSet.has(e));
  const errors = consoleErrors.filter((c) => c.level === "error").length;
  if (missing.length >= 2 || errors >= 3) return "critical";
  if (missing.length >= 1 || errors >= 1) return "warning";
  return "healthy";
}

async function executeRun(runId: string, targetUrl: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
  const startedAt = new Date();
  await admin.schema("crm").from("funnel_test_runs").update({
    status: "running",
    started_at: startedAt.toISOString(),
  }).eq("id", runId);

  const detectedAll: any[] = [];
  const consoleAll: any[] = [];
  const lighthouseSummary: Record<string, any> = {};
  const prevState = { lastUrl: null as string | null };

  let allPassed = true;
  let stepIdx = 0;

  for (const step of STEP_SEQUENCE) {
    const stepStart = new Date();
    // insert pending step
    const { data: stepRow } = await admin.schema("crm").from("funnel_test_steps").insert({
      run_id: runId,
      step_index: stepIdx,
      step_name: step,
      step_status: "running",
      started_at: stepStart.toISOString(),
    }).select("id").maybeSingle();

    try {
      const result = await runBrowserlessStep(step, targetUrl, prevState);
      const stepEnd = new Date();
      prevState.lastUrl = result.url_at_step;

      detectedAll.push(...result.pixel_events);
      consoleAll.push(...result.console_errors);
      if (result.lighthouse) {
        const key =
          step === "navigate_home" ? "home" :
          step === "click_event" ? "product" :
          step === "open_cart" ? "cart" :
          step === "begin_checkout" ? "checkout" : step;
        lighthouseSummary[key] = result.lighthouse;
      }

      if (result.step_status !== "passed") allPassed = false;

      if (stepRow?.id) {
        await admin.schema("crm").from("funnel_test_steps").update({
          step_status: result.step_status,
          completed_at: stepEnd.toISOString(),
          duration_ms: result.duration_ms,
          screenshot_url: result.screenshot_url,
          url_at_step: result.url_at_step,
          pixel_events_in_step: result.pixel_events,
          console_errors_in_step: result.console_errors,
          lighthouse_at_step: result.lighthouse,
          notes: result.notes ?? null,
        }).eq("id", stepRow.id);
      }
    } catch (e) {
      allPassed = false;
      console.error("[funnel-test] step threw", step, e);
      if (stepRow?.id) {
        await admin.schema("crm").from("funnel_test_steps").update({
          step_status: "failed",
          completed_at: new Date().toISOString(),
          notes: e instanceof Error ? e.message : String(e),
        }).eq("id", stepRow.id);
      }
    }
    stepIdx++;
  }

  // fetch expected to compute severity
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { target_url?: string; connection_id?: string; event_id?: string; test_event_code?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const targetUrl = (body.target_url ?? "").trim();
  if (!targetUrl || !isValidUrl(targetUrl)) return json({ error: "invalid_target_url" }, 400);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: u } = await userClient.auth.getUser();
  const userId = u?.user?.id ?? null;
  if (!userId) return json({ error: "unauthenticated" }, 401);

  const { data: cid } = await userClient.rpc("current_company_id");
  const companyId = (cid as string) ?? null;
  if (!companyId) return json({ error: "no_company_context" }, 403);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

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

  // background
  // @ts-ignore - EdgeRuntime is available in Supabase Edge Runtime
  EdgeRuntime.waitUntil(
    executeRun(ins.id, targetUrl).catch(async (e) => {
      console.error("[funnel-test] run failed", e);
      await admin.schema("crm").from("funnel_test_runs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: e instanceof Error ? e.message : String(e),
      }).eq("id", ins.id);
    }),
  );

  return json({ run_id: ins.id, status: "queued" }, 202);
});
