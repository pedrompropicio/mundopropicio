// crm-meta-fq-recon
// READ-ONLY. Decifra o significado de [F] vs [Q] nos nomes de campanha cruzando com targeting real.
// Não escreve em tabelas. Não regista token. Só GET à Graph API.

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

const mask = (id?: string) => !id ? "" : id.length <= 8 ? id : id.slice(0, 4) + "…" + id.slice(-4);
const gfetch = async (u: string) => await (await fetch(u)).json();

type Arch = "lookalike" | "retargeting" | "interesse" | "broad" | "advantage_plus" | "unknown";

function classifyTargeting(t: Record<string, unknown> | null | undefined): { arch: Arch; reason: string } {
  if (!t) return { arch: "unknown", reason: "no_targeting" };

  const adv = (t.targeting_automation as Record<string, unknown> | undefined)?.advantage_audience;
  const cas = (t.custom_audiences ?? []) as Array<{ id?: string; name?: string }>;
  const interests = (t.interests ?? []) as unknown[];
  const flex = (t.flexible_spec ?? []) as Array<Record<string, unknown>>;
  const flexInterests = flex.flatMap((f) => (f.interests as unknown[] | undefined) ?? []);
  const hasInterests = interests.length > 0 || flexInterests.length > 0;

  const lookalikeCAs = cas.filter((c) =>
    /seme(lh|lha)nte|lookalike|^lal\b|\blal\b/i.test(c.name ?? "")
  );
  const otherCAs = cas.filter((c) => !lookalikeCAs.includes(c));

  // ordem de precedência
  if (lookalikeCAs.length > 0 && otherCAs.length === 0) return { arch: "lookalike", reason: `lookalike_CAs=${lookalikeCAs.length}` };
  if (otherCAs.length > 0) return { arch: "retargeting", reason: `included_CAs=${otherCAs.length} (${otherCAs.slice(0,2).map(c=>c.name).join("|")})` };
  if (hasInterests) return { arch: "interesse", reason: `interests=${interests.length}+flex=${flexInterests.length}` };
  if (adv === 1 || adv === true) return { arch: "advantage_plus", reason: "advantage_audience=1" };
  return { arch: "broad", reason: "no_CAs_no_interests" };
}

function fqGroup(name: string): "F" | "Q" | null {
  const m = name.match(/\[(F|Q)\]/);
  return m ? (m[1] as "F" | "Q") : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  let companyId = DEFAULT_COMPANY;
  if (req.method === "POST") {
    try { const b = await req.json(); if (typeof b?.company_id === "string") companyId = b.company_id; } catch {}
  }

  const sb = createClient(SUPABASE_URL, SRK, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "crm" as never } });
  const { data: conn } = await sb
    .from("ad_platform_connections")
    .select("id, selected_ad_account_id")
    .eq("company_id", companyId).eq("platform", "meta").eq("status", "active").maybeSingle();
  if (!conn?.selected_ad_account_id) return json({ error: "connection_not_found" }, 404);

  const pub = createClient(SUPABASE_URL, SRK, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: tokRows, error: tokErr } = await pub.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: conn.id, p_master_key: KEY,
  });
  if (tokErr || !Array.isArray(tokRows) || tokRows.length === 0) return json({ error: "token_decrypt_failed", detail: tokErr?.message }, 403);
  const token = (tokRows[0] as { access_token: string }).access_token;
  const adAct = conn.selected_ad_account_id;

  const tr = JSON.stringify({ since: "2025-01-01", until: "2025-12-31" });

  // PASSO 1 — listar campanhas 2025 com spend > 0
  const u1 = new URL(`https://graph.facebook.com/${GRAPH}/${adAct}/insights`);
  u1.searchParams.set("level", "campaign");
  u1.searchParams.set("time_range", tr);
  u1.searchParams.set("fields", "campaign_id,campaign_name,spend");
  u1.searchParams.set("filtering", JSON.stringify([{ field: "spend", operator: "GREATER_THAN", value: 0 }]));
  u1.searchParams.set("sort", "spend_descending");
  u1.searchParams.set("limit", "40");
  u1.searchParams.set("access_token", token);
  const j1 = await gfetch(u1.toString());
  if (j1?.error) return json({ step: 1, error: j1.error });

  const all = (j1.data ?? []) as Array<{ campaign_id: string; campaign_name: string; spend: string }>;
  const grupoF = all.filter((c) => fqGroup(c.campaign_name) === "F");
  const grupoQ = all.filter((c) => fqGroup(c.campaign_name) === "Q");
  const semMarcador = all.filter((c) => fqGroup(c.campaign_name) === null);

  // PASSO 2 — top-3 de cada grupo por spend (já vem ordenado desc)
  const sampleF = grupoF.slice(0, 3);
  const sampleQ = grupoQ.slice(0, 3);

  // helper: buscar adsets + classificar
  const analiseCampanha = async (c: { campaign_id: string; campaign_name: string; spend: string }) => {
    const u = new URL(`https://graph.facebook.com/${GRAPH}/${c.campaign_id}/adsets`);
    u.searchParams.set("fields", "id,name,optimization_goal,targeting");
    u.searchParams.set("limit", "10");
    u.searchParams.set("access_token", token);
    const j = await gfetch(u.toString());
    if (j?.error) return { campaign_name: c.campaign_name, spend: c.spend, error: j.error };

    const adsets = (j.data ?? []) as Array<{ id: string; name: string; optimization_goal: string; targeting: Record<string, unknown> }>;
    const classificados = adsets.map((a) => {
      const r = classifyTargeting(a.targeting);
      return { adset_name: a.name, optimization_goal: a.optimization_goal, arch: r.arch, reason: r.reason };
    });
    const dist: Record<string, number> = {};
    classificados.forEach((x) => { dist[x.arch] = (dist[x.arch] ?? 0) + 1; });

    return {
      campaign_id_mask: mask(c.campaign_id),
      campaign_name: c.campaign_name,
      spend: c.spend,
      n_adsets: adsets.length,
      distribuicao: dist,
      adsets: classificados,
    };
  };

  const detalhesF = [];
  for (const c of sampleF) detalhesF.push(await analiseCampanha(c));
  const detalhesQ = [];
  for (const c of sampleQ) detalhesQ.push(await analiseCampanha(c));

  // PASSO 4 — agregar distribuição por grupo
  const aggregate = (det: Array<Record<string, unknown>>) => {
    const agg: Record<string, number> = {};
    let totalAdsets = 0;
    for (const d of det) {
      const dist = (d.distribuicao ?? {}) as Record<string, number>;
      for (const [k, v] of Object.entries(dist)) { agg[k] = (agg[k] ?? 0) + v; totalAdsets += v; }
    }
    const pct: Record<string, string> = {};
    for (const [k, v] of Object.entries(agg)) pct[k] = totalAdsets ? `${((v / totalAdsets) * 100).toFixed(1)}%` : "0%";
    return { totais: agg, total_adsets: totalAdsets, pct };
  };

  // PASSO 5 — encontrar 1 adset INTERESSE em qualquer dos amostrados
  let interesseSample: unknown = null;
  for (const det of [...detalhesF, ...detalhesQ]) {
    if (interesseSample) break;
    const adsets = (det as { adsets?: Array<{ arch: string }> }).adsets ?? [];
    const hit = adsets.find((a) => a.arch === "interesse");
    if (hit) {
      // refetch desse adset com targeting cru
      const cid = (det as { campaign_id_mask: string }).campaign_id_mask;
      const u = new URL(`https://graph.facebook.com/${GRAPH}/${(det as { campaign_name: string }).campaign_name ? "" : ""}`);
      // melhor: refazer fetch adsets da campanha e devolver targeting cru desse adset
      const cRaw = [...sampleF, ...sampleQ].find((c) => mask(c.campaign_id) === cid);
      if (cRaw) {
        const u2 = new URL(`https://graph.facebook.com/${GRAPH}/${cRaw.campaign_id}/adsets`);
        u2.searchParams.set("fields", "id,name,optimization_goal,targeting");
        u2.searchParams.set("limit", "10");
        u2.searchParams.set("access_token", token);
        const j2 = await gfetch(u2.toString());
        const found = (j2.data ?? []).find((a: { name: string }) => a.name === hit && false); // skip
        // simplesmente devolver o primeiro adset cuja classificação dê 'interesse'
        for (const a of (j2.data ?? []) as Array<{ id: string; name: string; targeting: Record<string, unknown> }>) {
          const r = classifyTargeting(a.targeting);
          if (r.arch === "interesse") {
            interesseSample = {
              campaign_name: cRaw.campaign_name,
              adset_id_mask: mask(a.id),
              adset_name: a.name,
              targeting_keys: Object.keys(a.targeting ?? {}),
              targeting_raw: a.targeting,
            };
            break;
          }
        }
      }
    }
  }

  return json({
    company_id: companyId,
    ad_account_id: adAct,
    graph_api_version: GRAPH,
    passo_1_contagens: {
      total_campanhas_2025_com_spend: all.length,
      grupo_F: grupoF.length,
      grupo_Q: grupoQ.length,
      sem_marcador: semMarcador.length,
      nomes_sem_marcador: semMarcador.map((c) => c.campaign_name).slice(0, 10),
    },
    passo_2_3_amostra_F: detalhesF,
    passo_2_3_amostra_Q: detalhesQ,
    passo_4_agregado_F: aggregate(detalhesF),
    passo_4_agregado_Q: aggregate(detalhesQ),
    passo_5_interesse_targeting_cru: interesseSample,
    legenda_arquetipos: {
      lookalike: "custom_audiences com nome 'Semelhante'/'Lookalike'/'LAL'",
      retargeting: "custom_audiences incluídas sem prefixo Semelhante (ex.: [COMPRA], seguidores)",
      interesse: "interests[] ou flexible_spec[].interests[]",
      broad: "sem CAs e sem interests",
      advantage_plus: "targeting_automation.advantage_audience=1",
    },
  });
});
