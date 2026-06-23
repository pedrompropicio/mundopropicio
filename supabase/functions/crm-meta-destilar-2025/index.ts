// crm-meta-destilar-2025
// Piloto histórico 2025 MP. Lógica baixa→destila→descarta. Bruto NUNCA persiste.
// Upsert idempotente em crm.campaign_memory + crm.campaign_memory_element.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;
const DEFAULT_COMPANY = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Normalização robusta: lowercase, sem acentos, sem "festival/fest", espaços colapsados.
function norm(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(festival|fest)\b/g, " ")
    .replace(/[^a-z0-9& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Mapa estilo: chave normalizada -> género. Match por igualdade OU CONTÉM.
const STYLE_MAP: Array<[string, string]> = [
  // sertanejo
  ["simone mendes", "sertanejo"],
  ["chitaozinho & xororo", "sertanejo"], ["chitaozinho e xororo", "sertanejo"],
  ["maiara e maraisa", "sertanejo"],
  ["matheus e kauan", "sertanejo"], ["matheus & kauan", "sertanejo"],
  ["henrique e juliano", "sertanejo"], ["henrique & juliano", "sertanejo"],
  ["jorge e mateus", "sertanejo"], ["jorge & mateus", "sertanejo"],
  ["gusttavo lima", "sertanejo"], ["luan santana", "sertanejo"],
  // pagode
  ["zeca pagodinho", "pagode"], ["pixote", "pagode"],
  ["pericles", "pagode"], ["ferrugem", "pagode"], ["thiaguinho", "pagode"],
  // axé
  ["ivete sangalo", "axé"], ["ivete clareou", "axé"], ["saulo fernandes", "axé"],
  // pop/funk/axé
  ["ensaios da anitta", "pop/funk/axé"], ["anitta", "pop/funk/axé"],
  // mpb/forró
  ["elba ramalho & geraldo azevedo", "mpb/forró"],
  ["elba ramalho e geraldo azevedo", "mpb/forró"],
  ["elba ramalho", "mpb/forró"], ["geraldo azevedo", "mpb/forró"],
  // mpb/romântico
  ["roberto carlos", "mpb/romântico"],
  // trap/funk
  ["mc cabelinho", "trap/funk"], ["mc daniel", "trap/funk"],
  // trap
  ["veigh", "trap"], ["oruam", "trap"], ["matue", "trap"],
  // humor
  ["whindersson nunes", "humor"], ["igor guimaraes", "humor"],
  ["gio lisboa", "humor"], ["raphael ghanem", "humor"],
  // palestra
  ["cortella", "palestra"],
  // infantil
  ["luccas neto", "infantil"], ["enaldinho", "infantil"],
  // festivais
  ["festyvybbe", "forró/piseiro"],
  ["newgang", "trap/rap/funk"],
  ["santa festa", "trap/rap/funk"],
  ["sotrap", "trap/rap/funk"], ["so trap", "trap/rap/funk"],
  ["coala", "mpb/indie/alternativo"],
  ["bloquinho de verao", "axé/pagode"],
];

const FESTIVAL_KEYS = ["newgang","santa festa","sotrap","so trap","festyvybbe","coala","bloquinho de verao"];
const OUTRO_KEYS = ["cortella"];

function lookupStyle(entityNorm: string): string | null {
  for (const [k, v] of STYLE_MAP) {
    if (entityNorm === k || entityNorm.includes(k)) return v;
  }
  return null;
}

const SALES_OBJECTIVES = new Set(["OUTCOME_SALES","CONVERSIONS","PRODUCT_CATALOG_SALES"]);

type Arch = "advantage_plus"|"interesse"|"lookalike"|"retargeting"|"broad";

function parseName(name: string): { entity: string|null; city: string|null; year: number|null; funnel: "frio"|"quente"|null } {
  const fq = name.match(/\[(F|Q)\]/);
  const funnel = fq ? (fq[1]==="F" ? "frio" : "quente") : null;
  const m = name.match(/\]\s*\[(?:F|Q)\]\s*(.+?)\s*-\s*([^-]+?)\s+(\d{4})\s*-/);
  if (m) return { entity: m[1].trim(), city: m[2].trim(), year: parseInt(m[3]), funnel };
  const m2 = name.match(/\]\s*\[(?:F|Q)\]\s*(.+?)\s*-/);
  if (m2) return { entity: m2[1].trim(), city: null, year: null, funnel };
  return { entity: null, city: null, year: null, funnel };
}

function entityType(entityNorm: string): "festival"|"artista"|"outro" {
  if (FESTIVAL_KEYS.some(k => entityNorm === k || entityNorm.includes(k))) return "festival";
  if (OUTRO_KEYS.some(k => entityNorm === k || entityNorm.includes(k))) return "outro";
  return "artista";
}


function classifyTargeting(t: Record<string, unknown> | null | undefined): Arch {
  if (!t) return "broad";
  const cas = (t.custom_audiences ?? []) as Array<{ name?: string }>;
  const interests = (t.interests ?? []) as unknown[];
  const flex = (t.flexible_spec ?? []) as Array<Record<string, unknown>>;
  const flexInterests = flex.flatMap((f) => (f.interests as unknown[] | undefined) ?? []);
  const adv = (t.targeting_automation as Record<string, unknown> | undefined)?.advantage_audience;
  const lookalikeCAs = cas.filter((c) => /seme(lh|lha)nte|lookalike|^lal\b|\blal\b/i.test(c.name ?? ""));
  const otherCAs = cas.filter((c) => !lookalikeCAs.includes(c));
  // precedência conforme spec
  if (otherCAs.length > 0) return "retargeting";
  if (lookalikeCAs.length > 0) return "lookalike";
  if (interests.length > 0 || flexInterests.length > 0) return "interesse";
  if (adv === 1 || adv === true) return "advantage_plus";
  return "broad";
}

function audienceKey(arch: Arch, t: Record<string, unknown> | null | undefined, adsetName: string): string {
  if (!t) return arch;
  const cas = (t.custom_audiences ?? []) as Array<{ name?: string }>;
  const flex = (t.flexible_spec ?? []) as Array<Record<string, unknown>>;
  const interests = (t.interests ?? []) as Array<{ name?: string }>;
  const flexInterests = flex.flatMap((f) => (f.interests as Array<{name?:string}> | undefined) ?? []);
  if (arch === "retargeting") {
    const names = cas.map(c=>c.name).filter(Boolean).slice(0,2).join("|");
    return `retargeting ${names}`.slice(0,180);
  }
  if (arch === "lookalike") {
    const names = cas.map(c=>c.name).filter(Boolean).slice(0,2).join("|");
    return `lookalike ${names}`.slice(0,180);
  }
  if (arch === "interesse") {
    const all = [...interests, ...flexInterests].map(i=>i.name).filter(Boolean).slice(0,3).join("+");
    return `interesse ${all}`.slice(0,180);
  }
  return `${arch} ${adsetName.slice(0,80)}`;
}

function verdict(roas: number | null, isSales: boolean): string | null {
  if (!isSales || roas === null || !isFinite(roas)) return null;
  if (roas >= 4) return "positivo";
  if (roas >= 2) return "neutro";
  return "fraco";
}

function actionsToMetrics(actions: Array<{action_type:string;value:string}>|undefined,
                          values: Array<{action_type:string;value:string}>|undefined,
                          roasArr: Array<{action_type:string;value:string}>|undefined,
                          spend: number) {
  const findVal = (arr: Array<{action_type:string;value:string}>|undefined, type:string) => {
    if (!arr) return null;
    const f = arr.find(a=>a.action_type===type);
    return f ? parseFloat(f.value) : null;
  };
  const purchases = findVal(actions, "omni_purchase");
  const revenue = findVal(values, "omni_purchase");
  let roas = findVal(roasArr, "omni_purchase");
  if (roas === null && revenue !== null && spend > 0) roas = revenue / spend;
  return {
    purchases: purchases !== null ? Math.round(purchases) : null,
    revenue_cents: revenue !== null ? Math.round(revenue * 100) : null,
    roas: roas !== null ? Number(roas.toFixed(4)) : null,
  };
}

async function gfetchWithRetry(url: string, maxRetries = 5): Promise<{json: Record<string, unknown>; throttle?: string}> {
  let last: Record<string, unknown> = { error: { message: "no_attempt" } };
  for (let i = 0; i < maxRetries; i++) {
    try {
      const r = await fetch(url);
      const throttle = r.headers.get("x-fb-ads-insights-throttle") || undefined;
      const j = await r.json();
      const code = (j?.error as {code?:number})?.code;
      if (code === 17 || code === 4 || code === 32 || code === 613) {
        last = j;
        await new Promise(res => setTimeout(res, 3000 * (i+1)));
        continue;
      }
      return { json: j, throttle };
    } catch (e) {
      last = { error: { message: (e as Error)?.message ?? String(e) } };
      await new Promise(r=>setTimeout(r,1000*(i+1)));
    }
  }
  return { json: last };
}


Deno.serve(async (req: Request) => {
  try {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  let companyId = DEFAULT_COMPANY;
  let dryRun = false;
  let offset = 0;
  let limit = 9999;
  let batchSize: number | null = null;
  if (req.method === "POST") {
    try { const b = await req.json();
      if (typeof b?.company_id === "string") companyId = b.company_id;
      if (b?.dry_run === true) dryRun = true;
      if (typeof b?.offset === "number") offset = b.offset;
      if (typeof b?.limit === "number") limit = b.limit;
      if (typeof b?.batch_size === "number") batchSize = b.batch_size;
    } catch {}
  }
  if (batchSize !== null) limit = batchSize;

  const sbCrm = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "crm" as never },
  });
  const sbPub = createClient(SUPABASE_URL, SRK, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: conn } = await sbCrm.from("ad_platform_connections")
    .select("id, selected_ad_account_id")
    .eq("company_id", companyId).eq("platform", "meta").eq("status", "active").maybeSingle();
  if (!conn?.selected_ad_account_id) return json({ error: "connection_not_found" }, 404);

  const { data: tokRows, error: tokErr } = await sbPub.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: conn.id, p_master_key: KEY,
  });
  if (tokErr || !Array.isArray(tokRows) || tokRows.length === 0) return json({ error: "token_decrypt_failed", detail: tokErr?.message }, 403);
  const token = (tokRows[0] as { access_token: string }).access_token;
  const adAct = conn.selected_ad_account_id;
  const tr = JSON.stringify({ since: "2025-01-01", until: "2025-12-31" });

  // PASSO 1 — paginação completa de campanhas 2025
  const campanhasCrudas: Array<{campaign_id:string;campaign_name:string;spend:string}> = [];
  let next: string | null = (() => {
    const u = new URL(`https://graph.facebook.com/${GRAPH}/${adAct}/insights`);
    u.searchParams.set("level", "campaign");
    u.searchParams.set("time_range", tr);
    u.searchParams.set("fields", "campaign_id,campaign_name,spend");
    u.searchParams.set("filtering", JSON.stringify([{ field: "spend", operator: "GREATER_THAN", value: 0 }]));
    u.searchParams.set("limit", "100");
    u.searchParams.set("access_token", token);
    return u.toString();
  })();
  let pages = 0;
  while (next && pages < 10) {
    const { json: j } = await gfetchWithRetry(next);
    if (j?.error) return json({ step: 1, error: j.error });
    for (const row of (j.data ?? []) as Array<{campaign_id:string;campaign_name:string;spend:string}>) campanhasCrudas.push(row);
    next = ((j.paging as {next?:string})?.next) ?? null;
    pages++;
  }

  // ordenação estável por campaign_id (paginação determinística entre invocações)
  campanhasCrudas.sort((a, b) => a.campaign_id.localeCompare(b.campaign_id));

  const fatia = campanhasCrudas.slice(offset, offset + limit);

  const result = {
    company_id: companyId,
    ad_account_id: adAct,
    dry_run: dryRun,
    n_campanhas_listadas: campanhasCrudas.length,
    janela: { offset, limit, fatia_size: fatia.length },
    processadas: 0, upserts_campaign: 0, upserts_element: 0, n_erros_elementos: 0,
    verdict_dist: { positivo:0, neutro:0, fraco:0, null:0 } as Record<string, number>,
    funnel_dist: { frio:0, quente:0, null:0 } as Record<string, number>,
    archetype_dist: { advantage_plus:0, interesse:0, lookalike:0, retargeting:0, broad:0 } as Record<string, number>,
    entity_counts: {} as Record<string, { n: number; sum_roas: number; cnt_roas: number }>,
    entity_null: [] as string[],
    style_null: [] as string[],
    errors: [] as Array<{campaign:string; step:string; err:unknown}>,
    notes: {} as Record<string, unknown>,
  };

  for (const c of fatia) {
    result.processadas++;
    const parsed = parseName(c.campaign_name);
    if (!parsed.entity) result.entity_null.push(c.campaign_name);
    const entityNorm = parsed.entity ? norm(parsed.entity) : null;
    const et = entityNorm ? entityType(entityNorm) : null;
    const style = entityNorm ? lookupStyle(entityNorm) : null;
    if (entityNorm && !style) result.style_null.push(parsed.entity!);

    result.funnel_dist[parsed.funnel ?? "null"]++;

    // 4 calls Graph em paralelo
    const uObj = new URL(`https://graph.facebook.com/${GRAPH}/${c.campaign_id}`);
    uObj.searchParams.set("fields", "objective"); uObj.searchParams.set("access_token", token);
    const uIns = new URL(`https://graph.facebook.com/${GRAPH}/${c.campaign_id}/insights`);
    uIns.searchParams.set("time_range", tr);
    uIns.searchParams.set("fields", "spend,actions,action_values,purchase_roas");
    uIns.searchParams.set("access_token", token);
    const uAds = new URL(`https://graph.facebook.com/${GRAPH}/${c.campaign_id}/adsets`);
    uAds.searchParams.set("fields", "id,name,optimization_goal,targeting,daily_budget");
    uAds.searchParams.set("limit", "50"); uAds.searchParams.set("access_token", token);
    const uAdsIns = new URL(`https://graph.facebook.com/${GRAPH}/${c.campaign_id}/insights`);
    uAdsIns.searchParams.set("level", "adset"); uAdsIns.searchParams.set("time_range", tr);
    uAdsIns.searchParams.set("fields", "adset_id,spend,actions,action_values,purchase_roas");
    uAdsIns.searchParams.set("limit", "100"); uAdsIns.searchParams.set("access_token", token);

    const [rObj, rIns, rAds, rAdsIns] = await Promise.all([
      gfetchWithRetry(uObj.toString()),
      gfetchWithRetry(uIns.toString()),
      gfetchWithRetry(uAds.toString()),
      gfetchWithRetry(uAdsIns.toString()),
    ]);
    const objective = (rObj.json?.objective as string) ?? null;
    const isSales = objective ? SALES_OBJECTIVES.has(objective) : false;
    const insRow = ((rIns.json?.data as Array<Record<string, unknown>>) ?? [])[0] ?? {};
    const spend = parseFloat((insRow.spend as string) ?? "0");
    const spend_cents = Math.round(spend * 100);
    const m = actionsToMetrics(insRow.actions as never, insRow.action_values as never, insRow.purchase_roas as never, spend);
    const vd = verdict(m.roas, isSales);
    result.verdict_dist[vd ?? "null"]++;

    if (parsed.entity) {
      const e = result.entity_counts[parsed.entity] ?? { n:0, sum_roas:0, cnt_roas:0 };
      e.n++;
      if (m.roas !== null) { e.sum_roas += m.roas; e.cnt_roas++; }
      result.entity_counts[parsed.entity] = e;
    }

    const adsets = (rAds.json?.data ?? []) as Array<{id:string;name:string;optimization_goal:string;targeting:Record<string,unknown>;daily_budget?:string}>;
    const adsetIns = new Map<string, Record<string, unknown>>();
    for (const r of (rAdsIns.json?.data ?? []) as Array<Record<string, unknown>>) adsetIns.set(r.adset_id as string, r);


    // upsert campaign_memory
    let memoryId: string | null = null;
    if (!dryRun) {
      const { data: up, error: upErr } = await sbCrm.from("campaign_memory").upsert({
        company_id: companyId,
        event_id: null,
        external_campaign_id: c.campaign_id,
        campaign_name: c.campaign_name,
        artist: parsed.entity,
        entity_type: et,
        music_style: style,
        audience_axis: null,
        market_scope: "PT",
        market_country: "PT",
        currency: "EUR",
        days_before_event: null,
        objective,
        structure: null,
        n_adsets: adsets.length,
        spend_cents,
        revenue_cents: m.revenue_cents,
        purchases: m.purchases,
        roas: m.roas,
        roas_source: "meta",
        verdict: vd,
        diagnosis_class: null,
        funnel_stage: parsed.funnel, // 'frio' | 'quente' | null (coluna dedicada)
        is_provisional: false,
        matured_at: parsed.year ? `${parsed.year}-12-31T23:59:59Z` : null,
        distilled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "company_id,external_campaign_id" }).select("id").maybeSingle();
      if (upErr) { result.errors.push({campaign:c.campaign_name,step:"upsert_memory",err:upErr.message}); continue; }
      memoryId = up?.id ?? null;
      result.upserts_campaign++;
    } else {
      result.upserts_campaign++; // simulate
    }

    // elements
    for (const a of adsets) {
      const arch = classifyTargeting(a.targeting);
      result.archetype_dist[arch]++;
      const ak = audienceKey(arch, a.targeting, a.name);
      const ins = adsetIns.get(a.id) ?? {};
      const aSpend = parseFloat((ins.spend as string) ?? "0");
      const am = actionsToMetrics(ins.actions as never, ins.action_values as never, ins.purchase_roas as never, aSpend);
      const aVd = verdict(am.roas, isSales);
      const dailyB = a.daily_budget ? Math.round(parseInt(a.daily_budget)) : null; // já em cents na API (centavos da moeda)
      if (!dryRun && memoryId) {
        const { error: eErr } = await sbCrm.from("campaign_memory_element").upsert({
          campaign_memory_id: memoryId,
          external_adset_id: a.id,
          adset_name: a.name,
          audience_archetype: arch,
          audience_key: ak,
          optimization_goal: a.optimization_goal ?? null,
          daily_budget_cents: dailyB,
          spend_cents: Math.round(aSpend * 100),
          revenue_cents: am.revenue_cents,
          roas: am.roas,
          verdict: aVd,
          updated_at: new Date().toISOString(),
        }, { onConflict: "campaign_memory_id,external_adset_id" });
        if (eErr) {
          console.error("UPSERT_ELEMENT_ERR", c.campaign_id, a.id, eErr.message);
          result.errors.push({campaign:c.campaign_name,step:`upsert_element ${a.name}`,err:eErr.message});
          result.n_erros_elementos++;
          continue;
        }
        result.upserts_element++;
      } else {
        result.upserts_element++;
      }
      // pequeno delay entre adsets para aliviar rate-limit
      await new Promise(r => setTimeout(r, 60));
    }
  }

  // Top 5 entidades
  const topEntities = Object.entries(result.entity_counts)
    .sort((a,b)=>b[1].n - a[1].n).slice(0,5)
    .map(([k,v])=>({entity:k, n_campanhas:v.n, roas_medio: v.cnt_roas? Number((v.sum_roas/v.cnt_roas).toFixed(2)) : null}));
  (result as Record<string, unknown>).top5_entities = topEntities;
  (result as Record<string, unknown>).entity_null_count = result.entity_null.length;
  (result as Record<string, unknown>).style_null_unique = [...new Set(result.style_null)];

  // contagem final
  const { count } = await sbCrm.from("campaign_memory").select("*", { count:"exact", head:true }).eq("company_id", companyId);
  (result as Record<string, unknown>).campaign_memory_total_apos = count;

  result.notes = {
    funnel_storage: "funnel_stage grava 'frio'/'quente'",
    purchase_metric: "só omni_purchase usado (não somar variantes)",
    bruto_persistido: false,
  };

  return json(result);
  } catch (e) {
    console.error("DESTILAR_FATAL", (e as Error)?.message, (e as Error)?.stack);
    return json({ error: "fatal", message: (e as Error)?.message, stack: (e as Error)?.stack }, 500);
  }
});
