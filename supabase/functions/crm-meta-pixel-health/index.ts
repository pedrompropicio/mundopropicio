// cold-start trigger: 2026-06-01-v2 secret rotation
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function normalizeAdAccountId(raw: string): string {
  const c = raw.trim();
  return c.startsWith("act_") ? c : `act_${c}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { connection_id?: string; ad_account_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const connectionId = body.connection_id;
  const rawAcct = body.ad_account_id;
  if (!connectionId || !rawAcct) return json({ error: "missing_params" }, 400);
  const adAccountId = normalizeAdAccountId(rawAcct);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRows, error: tokenErr } = await supabase.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY,
  });
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken } = tokenRows[0] as { access_token: string };

  // 1. Active campaigns → pixel mapping
  const campaignsByPixel: Record<string, Array<{ id: string; name: string }>> = {};
  try {
    const campUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/campaigns`);
    campUrl.searchParams.set("fields", "id,name,effective_status,adsets.limit(50){id,name,promoted_object,status,effective_status}");
    campUrl.searchParams.set("effective_status", JSON.stringify(["ACTIVE"]));
    campUrl.searchParams.set("limit", "200");
    campUrl.searchParams.set("access_token", accessToken);
    const r = await fetch(campUrl);
    const j = await r.json();
    if (r.ok && !j.error) {
      const campaigns = j.data ?? [];
      for (const camp of campaigns) {
        const adsets = camp.adsets?.data ?? [];
        for (const adset of adsets) {
          if (adset.effective_status !== "ACTIVE") continue;
          const pixelId = adset.promoted_object?.pixel_id;
          if (!pixelId) continue;
          if (!campaignsByPixel[pixelId]) campaignsByPixel[pixelId] = [];
          if (!campaignsByPixel[pixelId].some(c => c.id === camp.id)) {
            campaignsByPixel[pixelId].push({ id: camp.id, name: camp.name });
          }
        }
      }
    } else {
      console.error("[pixel-health] campaigns fetch err:", r.status, j.error);
    }
  } catch (e) {
    console.error("[pixel-health] campaigns fetch threw:", e);
  }

  // 2. Pixels list with detailed fields
  let pixelsList: any[] = [];
  try {
    const pixUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/adspixels`);
    pixUrl.searchParams.set("fields", "id,name,creation_time,last_fired_time,can_proxy,is_unavailable,is_created_by_business,automatic_matching_fields,enable_automatic_matching,first_party_cookie_status,data_use_setting");
    pixUrl.searchParams.set("access_token", accessToken);
    const r = await fetch(pixUrl);
    const j = await r.json();
    if (!r.ok || j.error) {
      console.error("[pixel-health] pixels list err:", r.status, j.error);
      return json({ error: "graph_api_error", message: j.error?.message ?? `HTTP ${r.status}` }, 502);
    }
    pixelsList = j.data ?? [];
  } catch (e) {
    console.error("[pixel-health] fetch threw:", e);
    return json({ error: "graph_api_unreachable" }, 502);
  }

  // 3. Per-pixel processing
  const pixelsWithStats = await Promise.all(pixelsList.map(async (pix: any) => {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 7);
    const sinceUnix = Math.floor(since.getTime() / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);

    let eventStats: any[] = [];
    try {
      const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pix.id}/stats`);
      u.searchParams.set("aggregation", "event");
      u.searchParams.set("start_time", String(sinceUnix));
      u.searchParams.set("end_time", String(nowUnix));
      u.searchParams.set("access_token", accessToken);
      const r = await fetch(u);
      const j = await r.json();
      if (r.ok && !j.error) eventStats = j.data ?? [];
    } catch {}

    let domainStats: any[] = [];
    try {
      const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pix.id}/stats`);
      u.searchParams.set("aggregation", "domain");
      u.searchParams.set("start_time", String(sinceUnix));
      u.searchParams.set("end_time", String(nowUnix));
      u.searchParams.set("access_token", accessToken);
      const r = await fetch(u);
      const j = await r.json();
      if (r.ok && !j.error) domainStats = j.data ?? [];
    } catch {}

    let purchaseHasValue = false;
    let purchaseValueSample: number | null = null;
    try {
      const purchase = eventStats.find((s: any) => s.event === "Purchase");
      if (purchase && (purchase.value ?? 0) > 0) {
        purchaseHasValue = true;
        purchaseValueSample = purchase.value;
      }
    } catch {}

    const totalEvents = eventStats.reduce((a, s) => a + (s.count ?? 0), 0);
    const uniqueEvents = eventStats.reduce((a, s) => a + (s.unique_count ?? 0), 0);
    const eventTypes = eventStats.map((s: any) => ({
      event: s.event, count: s.count ?? 0, unique_count: s.unique_count ?? 0, value: s.value ?? null,
    })).sort((a: any, b: any) => b.count - a.count);

    const domains = domainStats.map((s: any) => ({
      domain: s.value || s.domain || s.url || "(desconhecido)",
      count: s.count ?? 0,
    })).sort((a: any, b: any) => b.count - a.count).slice(0, 10);

    const lastFiredAt = pix.last_fired_time ? new Date(pix.last_fired_time) : null;
    const hoursSinceLastFire = lastFiredAt ? (Date.now() - lastFiredAt.getTime()) / (1000 * 60 * 60) : null;

    const linkedCampaigns = campaignsByPixel[pix.id] || [];

    const presentEvents = new Set(eventTypes.map((e: any) => e.event));
    const funnelEvents = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"];
    const funnelPresent = funnelEvents.filter(e => presentEvents.has(e)).length;
    const standardEvents = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase", "Lead", "Search", "CompleteRegistration"];
    const standardPresent = standardEvents.filter(e => presentEvents.has(e)).length;
    const avgPerDay = totalEvents / 7;
    const automaticMatchingFields: any[] = pix.automatic_matching_fields ?? [];
    const allowedDomainsCount = domains.length;

    const checks = [
      { key: "funnel_complete", source: "site", label: "Funil completo (PV→VC→ATC→IC→Purchase)", max: 20, pts: Math.round((funnelPresent / 5) * 20), value: `${funnelPresent}/5` },
      { key: "purchase_value", source: "site", label: "Purchase com valor (essencial p/ ROAS)", max: 15, pts: purchaseHasValue ? 15 : presentEvents.has("Purchase") ? 5 : 0, value: purchaseHasValue ? `~${purchaseValueSample}` : presentEvents.has("Purchase") ? "sem valor" : "ausente" },
      { key: "matching_fields", source: "site", label: "Match Quality fields (email, phone, fbclid…)", max: 10, pts: Math.min(10, automaticMatchingFields.length * 2), value: `${automaticMatchingFields.length} fields` },
      { key: "volume", source: "site", label: "Volume saudável (>100 eventos/dia)", max: 10, pts: avgPerDay >= 100 ? 10 : avgPerDay >= 50 ? 7 : avgPerDay >= 10 ? 4 : 0, value: `${Math.round(avgPerDay)}/dia` },
      { key: "freshness", source: "site", label: "Atividade recente (<2h)", max: 10, pts: hoursSinceLastFire === null ? 0 : hoursSinceLastFire < 2 ? 10 : hoursSinceLastFire < 24 ? 5 : 0, value: hoursSinceLastFire !== null ? `${Math.round(hoursSinceLastFire)}h atrás` : "nunca" },
      { key: "standard_events", source: "site", label: "Coverage standard events (8 tipos)", max: 5, pts: Math.round((standardPresent / 8) * 5), value: `${standardPresent}/8` },
      { key: "auto_matching", source: "meta", label: "Automatic Matching ativo", max: 10, pts: pix.enable_automatic_matching ? 10 : 0, value: pix.enable_automatic_matching ? "ativo" : "inativo" },
      { key: "first_party_cookie", source: "meta", label: "First-party cookie (iOS/ITP)", max: 10, pts: pix.first_party_cookie_status === "ENABLED" ? 10 : 0, value: pix.first_party_cookie_status ?? "?" },
      { key: "domains", source: "meta", label: "Domains verificados a disparar", max: 10, pts: allowedDomainsCount >= 1 ? 10 : 0, value: `${allowedDomainsCount} domains` },
    ];
    const siteChecks = checks.filter(c => c.source === "site");
    const metaChecks = checks.filter(c => c.source === "meta");
    const siteScore = siteChecks.reduce((a, c) => a + c.pts, 0);
    const siteMax = siteChecks.reduce((a, c) => a + c.max, 0);
    const metaScore = metaChecks.reduce((a, c) => a + c.pts, 0);
    const metaMax = metaChecks.reduce((a, c) => a + c.max, 0);
    const score = siteScore + metaScore;
    let grade: string;
    if (score >= 90) grade = "A+";
    else if (score >= 80) grade = "A";
    else if (score >= 70) grade = "B+";
    else if (score >= 60) grade = "B";
    else if (score >= 50) grade = "C";
    else if (score >= 40) grade = "D";
    else grade = "F";

    const recommendations: { source: "site" | "meta"; text: string; priority: "high" | "medium" | "low" }[] = [];
    if (funnelPresent < 5) {
      const missing = funnelEvents.filter(e => !presentEvents.has(e));
      recommendations.push({ source: "site", priority: "high", text: `Implementar eventos do funil em falta: ${missing.join(", ")}. Pedir ao dev da bilheteira para disparar fbq('track', '<EventName>', { value, currency }) nas páginas correspondentes.` });
    }
    if (!purchaseHasValue && presentEvents.has("Purchase")) {
      recommendations.push({ source: "site", priority: "high", text: "Adicionar value e currency ao evento Purchase. Sem isto o ROAS não funciona. Exemplo: fbq('track', 'Purchase', { value: 45.00, currency: 'EUR' })." });
    }
    if (automaticMatchingFields.length < 3) {
      recommendations.push({ source: "site", priority: "medium", text: `Enviar mais parâmetros de matching no checkout. Atualmente: ${automaticMatchingFields.length} parâmetros. Pedir ao dev para incluir hashed email (em), phone (ph), nome, fbclid no fbq.` });
    }
    if (avgPerDay < 50) {
      recommendations.push({ source: "site", priority: "medium", text: `Volume baixo (${Math.round(avgPerDay)} eventos/dia). Verificar se o pixel está nas páginas-chave da bilheteira: home, evento, checkout, confirmação.` });
    }
    if (hoursSinceLastFire !== null && hoursSinceLastFire > 2 && hoursSinceLastFire < 24) {
      recommendations.push({ source: "site", priority: "low", text: `Última atividade há ${Math.round(hoursSinceLastFire)}h. Pode indicar baixo tráfego no momento ou problema intermitente — monitorizar.` });
    }
    if (standardPresent < 6) {
      recommendations.push({ source: "site", priority: "low", text: `Apenas ${standardPresent}/8 standard events disparam. Considerar implementar Lead, Search, CompleteRegistration se aplicável ao negócio.` });
    }
    if (!pix.enable_automatic_matching) {
      recommendations.push({ source: "meta", priority: "high", text: "Ativar Automatic Matching no Events Manager → Pixel Settings → Match Quality. Melhora attribution em 10-30% sem mudanças no site." });
    }
    if (pix.first_party_cookie_status !== "ENABLED") {
      recommendations.push({ source: "meta", priority: "high", text: "Ativar First-Party Cookie no Events Manager → Settings → First-Party Cookie. Crítico para iOS 14.5+ e Safari ITP — sem isto perdes ~30% da attribution." });
    }
    if (allowedDomainsCount === 0) {
      recommendations.push({ source: "meta", priority: "high", text: "Verificar domínios no Business Manager → Brand Safety → Domains. E configurar Aggregated Event Measurement (AEM) para iOS 14.5+ no Events Manager." });
    }

    let healthStatus: "healthy" | "warning" | "critical" | "unknown" = "unknown";
    let healthMessage = "";
    if (pix.is_unavailable) { healthStatus = "critical"; healthMessage = "Pixel marcado como indisponível pela Meta"; }
    else if (hoursSinceLastFire === null) { healthStatus = "critical"; healthMessage = "Pixel nunca disparou eventos"; }
    else if (hoursSinceLastFire > 24) { healthStatus = "critical"; healthMessage = `Sem eventos há ${Math.round(hoursSinceLastFire)}h`; }
    else if (score >= 70) { healthStatus = "healthy"; healthMessage = `${grade} · ${score}/100`; }
    else if (score >= 50) { healthStatus = "warning"; healthMessage = `${grade} · ${score}/100 — melhorias possíveis`; }
    else { healthStatus = "critical"; healthMessage = `${grade} · ${score}/100 — pixel precisa atenção urgente`; }

    return {
      id: pix.id, name: pix.name, is_unavailable: !!pix.is_unavailable,
      last_fired_time: pix.last_fired_time ?? null,
      hours_since_last_fire: hoursSinceLastFire,
      score, grade,
      site_score: siteScore, site_max: siteMax,
      meta_score: metaScore, meta_max: metaMax,
      checks, recommendations,
      health: { status: healthStatus, message: healthMessage },
      stats_7d: { total_events: totalEvents, unique_events: uniqueEvents, events_per_day_avg: Math.round(avgPerDay), event_types: eventTypes },
      domains,
      linked_campaigns: linkedCampaigns,
      automatic_matching_fields: automaticMatchingFields,
      enable_automatic_matching: !!pix.enable_automatic_matching,
      first_party_cookie_status: pix.first_party_cookie_status ?? null,
    };
  }));

  const usedPixels = pixelsWithStats.filter(p => p.linked_campaigns.length > 0);

  return json({
    ad_account_id: adAccountId,
    pixels_used_in_active_campaigns: usedPixels,
    all_pixels: pixelsWithStats,
    counts: { used: usedPixels.length, total: pixelsWithStats.length },
    fetched_at: new Date().toISOString(),
  });
});
