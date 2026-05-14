// crm-meta-funnel-test-run
// Cria run, retorna run_id imediatamente, e executa em background.
// Real Browserless quando BROWSERLESS_API_KEY presente; fallback para stub.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import {
  STEP_SEQUENCE as STUB_STEP_SEQUENCE,
  STUB_FIXTURES,
} from "./_stub_fixtures.ts";
import {
  runBrowserlessSession,
  fetchLighthouse,
  pingBrowserless,
  normalizeBrowserlessApiKey,
  type SessionStepResult,
} from "./_browserless.ts";
import {
  selectPreset,
  SUPPORTED_PROVIDERS,
  type FlowPreset,
} from "./presets/index.ts";

// Pós-Fase-1: step IDs são `string` genérico (variam por preset).
type StepName = string;

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
const BROWSERLESS_API_KEY_RAW = Deno.env.get("BROWSERLESS_API_KEY") ?? "";
const BROWSERLESS_API_KEY = normalizeBrowserlessApiKey(BROWSERLESS_API_KEY_RAW);

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
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
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

async function buildSessionStepsFromStub(): Promise<SessionStepResult[]> {
  // Stub é degradado a Ticketline-only por enquanto (usado quando
  // BROWSERLESS_API_KEY ausente; modo dev). Futuro: per-preset stubs.
  return STUB_STEP_SEQUENCE.map((name) => {
    const f = STUB_FIXTURES[name as keyof typeof STUB_FIXTURES];
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

async function executeRun(runId: string, targetUrl: string, companyId: string, preset: FlowPreset) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const startedAt = new Date();
  await admin.schema("crm").from("funnel_test_runs").update({
    status: "running",
    started_at: startedAt.toISOString(),
  }).eq("id", runId);

  // Fase 1 multi-bilheteira: step IDs vêm do preset.
  const stepIds: StepName[] = preset.steps.map((s) => s.id);
  const lhKeyByStepId = new Map<StepName, string>(
    preset.steps.filter((s) => !!s.lhKey).map((s) => [s.id, s.lhKey as string]),
  );

  const useStub = !BROWSERLESS_API_KEY;
  if (useStub) console.warn("[funnel-test] BROWSERLESS_API_KEY ausente — fallback STUB");

  // 1) Pre-insert all step rows as 'running' so o frontend mostra logo a sequência
  const stepRowIds: Record<StepName, string | null> = Object.fromEntries(
    stepIds.map((id) => [id, null]),
  );
  for (let i = 0; i < stepIds.length; i++) {
    const name = stepIds[i];
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
      const result = await runBrowserlessSession(targetUrl, preset, BROWSERLESS_API_KEY);
      sessionSteps = result.steps;
    }
  } catch (e) {
    runError = e instanceof Error ? e.message : String(e);
    console.error("[funnel-test] session failed", runError);
    const failedAt = new Date();
    const elapsedMs = failedAt.getTime() - startedAt.getTime();
    // mark all pending steps as failed
    for (const name of stepIds) {
      const id = stepRowIds[name];
      if (id) {
        await admin.schema("crm").from("funnel_test_steps").update({
          step_status: "failed",
          completed_at: failedAt.toISOString(),
          duration_ms: elapsedMs,
          notes: `browserless_session_failed: ${runError}`,
        }).eq("id", id);
      }
    }
    await admin.schema("crm").from("funnel_test_runs").update({
      status: "failed",
      completed_at: failedAt.toISOString(),
      total_duration_ms: elapsedMs,
      error_message: `Browserless: ${runError}`,
      severity: "critical",
      ai_summary: `Falha no arranque Browserless: ${runError}`,
    }).eq("id", runId);
    return;
  }

  // 3a) Patch 1: propagação SKIPPED transitiva.
  //     Se QUALQUER step anterior na cadeia (não só predecessor direto) terminou
  //     em failed/skipped, este step é consequência — marca-se como skipped,
  //     mesmo que o seu próprio status seja "failed" (selector terá apanhado lixo).
  // Pós-Fase-1: PREREQ derivado da ordem do preset.steps (step[i].prereq = step[i-1].id).
  const PREREQ: Record<StepName, StepName> = {};
  for (let i = 1; i < stepIds.length; i++) {
    PREREQ[stepIds[i]] = stepIds[i - 1];
  }
  const ancestorsOf = (name: StepName): StepName[] => {
    const out: StepName[] = [];
    let cur: StepName | undefined = PREREQ[name];
    while (cur) { out.push(cur); cur = PREREQ[cur]; }
    return out;
  };
  const statusByName = new Map<StepName, string>(
    sessionSteps.map((s) => [s.name, s.step_status]),
  );
  for (const s of sessionSteps) {
    if (s.step_status === "skipped") continue;
    for (const anc of ancestorsOf(s.name)) {
      const ancStatus = statusByName.get(anc);
      if (ancStatus === "failed" || ancStatus === "skipped") {
        const prevStatus = s.step_status;
        s.step_status = "skipped";
        s.notes = `skipped: ancestral "${anc}" terminou em ${ancStatus}${prevStatus === "failed" ? " (descartado FAILED — consequência da cadeia)" : ""}`;
        statusByName.set(s.name, "skipped");
        console.log(`[funnel-test] step=${s.name} forçado a skipped (ancestor=${anc} status=${ancStatus} prev=${prevStatus})`);
        break;
      }
    }
  }

  // 3b) Persist screenshots + step rows
  // Patch 3: detectedAll é a ÚNICA fonte de verdade — anotado com step name,
  //          alimenta tanto o payload do LLM (Veredicto IA) como a tabela
  //          "Eventos Pixel" do frontend (que lê run.detected_pixel_events).
  // Patch 6: para steps FAILED, sobe full-page screenshot + DOM + console
  //          recente para o bucket e regista os URLs em notes para o PDF.
  const detectedAll: any[] = [];
  const consoleAll: any[] = [];
  const lighthouseSummary: Record<string, any> = {};
  let allPassed = true;

  const uploadBlob = async (path: string, bytes: Uint8Array, contentType: string): Promise<string | null> => {
    try {
      const { error: upErr } = await admin.storage
        .from("funnel-test-screenshots")
        .upload(path, bytes, { contentType, upsert: true });
      if (upErr) {
        console.warn(`[funnel-test] upload error path=${path}: ${upErr.message}`);
        return null;
      }
      const { data: signed, error: signErr } = await admin.storage
        .from("funnel-test-screenshots")
        .createSignedUrl(path, 7 * 24 * 3600);
      if (signErr) {
        console.warn(`[funnel-test] signed url error path=${path}: ${signErr.message}`);
        return null;
      }
      return signed?.signedUrl ?? null;
    } catch (e) {
      console.warn(`[funnel-test] upload threw path=${path}:`, e);
      return null;
    }
  };

  // F.2: wrapper defensivo — nunca lança, devolve null se atob falhar.
  // Conta falhas para diagnóstico no fim do run (sistémico vs flake).
  let b64FailCount = 0;
  const safeB64ToBytes = (b64: string | null | undefined, label: string): Uint8Array | null => {
    if (!b64 || b64.length < 4) return null;
    try {
      return b64ToBytes(b64);
    } catch (e) {
      b64FailCount++;
      console.warn(`[funnel-test] b64 decode failed for ${label} (skipping upload): ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };

  for (let i = 0; i < sessionSteps.length; i++) {
    const s = sessionSteps[i];
    const id = stepRowIds[s.name];
    let screenshotUrl: string | null = null;

    const b64Len = s.screenshot_b64 ? s.screenshot_b64.length : 0;
    console.log(`[funnel-test] step=${s.name} screenshot_b64_len=${b64Len}`);
    if (s.screenshot_b64 && b64Len > 100) {
      const bytes = safeB64ToBytes(s.screenshot_b64, `${s.name}/viewport_screenshot`);
      if (bytes) {
        screenshotUrl = await uploadBlob(
          `${companyId}/${runId}/${i}.png`,
          bytes,
          "image/png",
        );
        console.log(`[funnel-test] step=${s.name} screenshot uploaded url=${screenshotUrl ? "ok" : "null"}`);
      }
    }

    // Patch 6: failure_context (apenas em steps FAILED reais — pós patch 1 já não inclui cascata)
    let notesWithLinks = s.notes ?? null;
    if (s.step_status === "failed" && s.failure_context) {
      const failureUrls: { full_screenshot?: string | null; dom?: string | null } = {};
      if (s.failure_context.full_screenshot_b64 && s.failure_context.full_screenshot_b64.length > 100) {
        const bytes = safeB64ToBytes(s.failure_context.full_screenshot_b64, `${s.name}/full_screenshot`);
        if (bytes) {
          failureUrls.full_screenshot = await uploadBlob(
            `${companyId}/${runId}/${i}-full.png`,
            bytes,
            "image/png",
          );
        }
      }
      if (s.failure_context.dom_b64 && s.failure_context.dom_b64.length > 100) {
        const bytes = safeB64ToBytes(s.failure_context.dom_b64, `${s.name}/dom`);
        if (bytes) {
          failureUrls.dom = await uploadBlob(
            `${companyId}/${runId}/${i}-dom.html`,
            bytes,
            "text/html; charset=utf-8",
          );
        }
      }
      const linkBits: string[] = [];
      if (failureUrls.full_screenshot) linkBits.push(`screenshot: ${failureUrls.full_screenshot}`);
      if (failureUrls.dom) linkBits.push(`dom: ${failureUrls.dom}`);
      const recent = s.failure_context.recent_console ?? [];
      if (recent.length > 0) linkBits.push(`console_recent: ${recent.length} entradas`);
      if (linkBits.length > 0) {
        notesWithLinks = `${notesWithLinks ?? ""}\nfailure_context — ${linkBits.join(" | ")}`.trim();
      }
      console.log(`[funnel-test] step=${s.name} failure_context uploaded full=${!!failureUrls.full_screenshot} dom=${!!failureUrls.dom}`);
    }

    // Patch 3: anota cada evento com o step onde foi detectado
    for (const ev of s.pixel_events ?? []) {
      detectedAll.push({ ...ev, step: s.name });
    }
    for (const ce of s.console_errors ?? []) {
      consoleAll.push({ ...ce, step: s.name });
    }
    if (s.step_status !== "passed") allPassed = false;

    // Stub lighthouse goes in directly; real lighthouse comes after.
    if (s._stubLighthouse) {
      const lhKey = lhKeyByStepId.get(s.name) ?? s.name;
      lighthouseSummary[lhKey] = s._stubLighthouse;
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
        notes: notesWithLinks,
      }).eq("id", id);
    }
  }

  // 4) Real Lighthouse (após sessão fechar) — alvos derivados dos steps que
  // o preset declarou com `lhKey`. Fase 1 multi-bilheteira: zero hardcoding.
  if (!useStub) {
    const lhTargets: { key: string; url: string | null; step: StepName }[] =
      preset.steps
        .filter((p) => !!p.lhKey)
        .map((p) => ({
          key: p.lhKey as string,
          url: sessionSteps.find((x) => x.name === p.id)?.url_at_step ?? null,
          step: p.id,
        }));
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

  // F.2: se b64FailCount > 0, prepende warning ao ai_summary para diagnóstico
  // (≥4 numa run = problema sistémico do encoding Browserless; 1-2 = flake).
  const aiSummaryWithB64Warning = b64FailCount > 0
    ? `⚠️ ${b64FailCount} screenshot(s)/dom(s) com b64 inválido — verificar Browserless return type (Uint8Array vs Buffer). Logs Supabase têm detalhe por label.\n\n${aiSummary ?? ""}`.trim()
    : aiSummary;
  if (b64FailCount > 0) {
    console.warn(`[funnel-test] run=${runId} b64_fail_count=${b64FailCount} — anexado ao ai_summary`);
  }

  const completedAt = new Date();
  await admin.schema("crm").from("funnel_test_runs").update({
    status: allPassed ? "completed" : "failed",
    completed_at: completedAt.toISOString(),
    total_duration_ms: completedAt.getTime() - startedAt.getTime(),
    detected_pixel_events: detectedAll,
    console_errors: consoleAll,
    lighthouse_summary: lighthouseSummary,
    severity,
    ai_summary: aiSummaryWithB64Warning,
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

  let body: { target_url?: string; connection_id?: string; event_id?: string; debug_browserless?: boolean };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  if (body.debug_browserless === true && isServiceRoleAuth(authHeader)) {
    if (!BROWSERLESS_API_KEY) return json({ error: "missing_browserless_api_key" }, 500);
    const ping = await pingBrowserless(BROWSERLESS_API_KEY);
    return json({ browserless: ping }, ping.some((x) => x.ok) ? 200 : 502);
  }

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
      // Extract userId directly from JWT claim (sub) — avoids /auth/v1/user round-trip
      // which can fail with new asymmetric signing keys.
      try {
        const token = authHeader.replace(/^Bearer\s+/i, "");
        const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
        userId = payload?.sub ?? null;
      } catch (e) {
        console.error("[funnel-test] JWT decode failed", e);
        return json({ error: "unauthenticated", detail: "jwt_decode_failed" }, 401);
      }
      if (!userId) {
        console.error("[funnel-test] no sub claim in JWT");
        return json({ error: "unauthenticated", detail: "no_sub_claim" }, 401);
      }

      const { data: cid, error: cidErr } = await userClient.rpc("current_company_id");
      companyId = (cid as string) ?? null;
      if (cidErr || !companyId) {
        console.error("[funnel-test] current_company_id failed", cidErr);
        return json({ error: "no_company_context", detail: cidErr?.message }, 403);
      }
      console.log(`[funnel-test] auth=user user=${userId} company=${companyId}`);
    }

  if (!companyId) return json({ error: "no_company_context" }, 403);

  // Fase 1 multi-bilheteira: resolver preset por hostname ANTES de inserir.
  // Bilheteiras não suportadas falham graciosamente com mensagem clara.
  const preset = selectPreset(targetUrl);
  if (!preset) {
    const supportedList = SUPPORTED_PROVIDERS.join(", ");
    const errMsg = `Bilheteira não suportada. Provedores suportados: ${supportedList}. Outras bilheteiras (Blueticket, BOL, See Tickets, FNAC Tickets, etc.) em roadmap.`;
    // PATCH 2: timestamp único partilhado para created_at/started_at/completed_at.
    // Resolve started_at NULL (UI mostrava "Invalid Date"/epoch zero) +
    // completed_at < created_at por drift de ~100-400ms.
    const nowIso = new Date().toISOString();
    // PATCH 3: severity="info" em vez de "critical" — "não suportado ainda"
    // não é equivalente a "implementação do cliente partida". Requer
    // 'info' no CHECK constraint (migration 20260514160000_*.sql).
    const { data: failedIns, error: failedInsErr } = await admin
      .schema("crm")
      .from("funnel_test_runs")
      .insert({
        company_id: companyId,
        connection_id: body.connection_id ?? null,
        event_id: body.event_id ?? null,
        target_url: targetUrl,
        status: "failed",
        severity: "info",
        error_message: errMsg,
        ai_summary: errMsg,
        created_at: nowIso,
        started_at: nowIso,
        completed_at: nowIso,
        total_duration_ms: 0,
        created_by: userId,
      })
      .select("id")
      .maybeSingle();
    if (failedInsErr) {
      console.error(`[funnel-test] unsupported_provider insert failed: ${failedInsErr.message}`);
    }
    console.warn(`[funnel-test] unsupported_provider target=${targetUrl} run=${failedIns?.id}`);
    return json({
      run_id: failedIns?.id ?? null,
      status: "failed",
      error: "unsupported_provider",
      error_message: errMsg,
      detail: errMsg,
    }, 400);
  }

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
      preset_id: preset.id,
      preset_version: preset.version,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !ins?.id) {
    console.error("[funnel-test] insert err", insErr);
    return json({ error: "insert_failed", detail: insErr?.message }, 500);
  }

  // @ts-ignore - EdgeRuntime is available in Supabase Edge Runtime
  EdgeRuntime.waitUntil(
    executeRun(ins.id, targetUrl, companyId, preset).catch(async (e) => {
      console.error("[funnel-test] run failed", e);
      // Bonus F: severity explícita em early-abort. Sem isto fica null e UI
      // mostra ícones neutros (loading-like) confundindo o utilizador.
      await admin.schema("crm").from("funnel_test_runs").update({
        status: "failed",
        severity: "critical",
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
