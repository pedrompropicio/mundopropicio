// coala-sync-bootstrap
// Popula coala_sync_row_state com identity_key/fallback_key/legacy_key e tenta
// vincular forecast_id por matching best-effort (descrição+valor+supplier).
//
// POST { configId?, dryRun?: boolean }  (admin/manager/platform_admin ou service_role)
//   - sem configId: itera todos os configs activos
//   - dryRun=true: devolve o plano sem escrever
//
// Estratégia matching (por row do XLSX):
//   T1) descrição normalizada IGUAL + cents IGUAIS  → exact
//   T2) Dice(desc) ≥ 0.7 + cents IGUAIS              → fuzzy
//   T3) cents IGUAIS, top candidato com Dice ≥ 0.55  → value_anchor
//   Empate no topo (2+ com score igual): needs_manual_link=true.
//   Sem candidato: row_state gravado sem forecast_id (ainda assim cobre identity_key).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { parseCoalaXlsx } from "../_shared/coalaParser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const norm = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
const moneyKey = (n: number) => Math.round((Number(n) || 0) * 100);
const isInvoiceRefStrong = (ref: string | null | undefined): boolean => {
  if (!ref) return false;
  const n = norm(ref);
  if (n.length < 3) return false;
  return !/^(n\/?a|na|sem|s\/n|sn|nd|0+|-+|x+|fatura|recibo|fact|inv)$/.test(n);
};
const buildIdentityKey = (r: { supplier: string | null; invoiceRef: string | null }) => {
  const sup = norm(r.supplier ?? "");
  if (!sup) return null;
  if (!isInvoiceRefStrong(r.invoiceRef)) return null;
  return `inv::${sup}::${norm(r.invoiceRef ?? "")}`;
};
const buildFallbackKey = (r: { rowNumber: number; supplier: string | null; rawCenterCusto: string | null; netAmount: number }) =>
  ["fb", r.rowNumber, norm(r.supplier ?? ""), norm(r.rawCenterCusto ?? ""), moneyKey(r.netAmount)].join("::");
const buildLegacyKey = (r: { description: string; netAmount: number; supplier: string | null; invoiceRef: string | null; paymentDate: string | null; dueDate: string | null }) =>
  [norm(r.description), moneyKey(r.netAmount), norm(r.supplier ?? ""), norm(r.invoiceRef ?? ""), r.paymentDate ?? "", r.dueDate ?? ""].join("|");

const dice = (a: string, b: string): number => {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const g = (s: string) => { const o = new Set<string>(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o; };
  const A = g(a), B = g(b);
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size || 1);
};

// Remove sufixos de parcela/ordinais e devolve "core" da descrição.
const coreDescription = (s: string): string => {
  let v = norm(s);
  if (!v) return v;
  // "- 3ª parcela", "— 01 parcela", "3a parcela", etc.
  v = v.replace(/[-–—]?\s*\d+\s*[ºoªa]?\s*parcela\b/gi, " ");
  // "parcela 01", "parcela 3"
  v = v.replace(/\bparcela\s*\d+\b/gi, " ");
  // ordinal solto no fim ("... 3ª" ou "... 03o")
  v = v.replace(/\b\d+\s*[ºoªa]\s*$/gi, " ");
  // limpar traços/separadores residuais nas pontas
  v = v.replace(/[\s\-–—·:|]+$/g, "").replace(/^[\s\-–—·:|]+/g, "");
  v = v.replace(/\s+/g, " ").trim();
  return v;
};

// ── Google Drive helpers (replicados de sync-coala-from-drive) ──
async function getDriveAccessToken(): Promise<string> {
  const sets = [
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"],
    ["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET", "GOOGLE_DRIVE_REFRESH_TOKEN"],
    ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET", "GOOGLE_CALENDAR_REFRESH_TOKEN"],
  ] as const;
  for (const [id, sec, rt] of sets) {
    const cId = Deno.env.get(id), cSec = Deno.env.get(sec), cRt = Deno.env.get(rt);
    if (!cId || !cSec || !cRt) continue;
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: cId, client_secret: cSec, refresh_token: cRt, grant_type: "refresh_token" }),
    });
    const p = await r.json().catch(() => ({}));
    if (r.ok && p?.access_token) return p.access_token as string;
  }
  throw new Error("Secrets Google Drive em falta.");
}
function extractDriveFileId(input: string): string {
  const s = String(input ?? "").trim();
  if (!s.includes("/") && !s.startsWith("http")) return s;
  const m1 = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/); if (m1) return m1[1];
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/); if (m2) return m2[1];
  throw new Error(`drive_file_id inválido: ${s}`);
}
async function downloadDriveXlsx(fileIdOrUrl: string, accessToken: string): Promise<ArrayBuffer> {
  const fileId = extractDriveFileId(fileIdOrUrl);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } });
  if (r.ok) return await r.arrayBuffer();
  if (r.status === 403 || r.status === 400) {
    const exp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}`,
      { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!exp.ok) throw new Error(`Drive export falhou (${exp.status})`);
    return await exp.arrayBuffer();
  }
  throw new Error(`Drive download falhou (${r.status})`);
}

const jwtRole = (h: string | null) => {
  const tok = h?.replace(/^Bearer\s+/i, "") ?? "";
  const p = tok.split(".")[1]; if (!p) return null;
  try { return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")))?.role ?? null; } catch { return null; }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { configId, dryRun = false } = body ?? {};

    const auth = req.headers.get("Authorization");
    const isServiceRole = auth === `Bearer ${SERVICE_ROLE}` || jwtRole(auth) === "service_role";
    if (!isServiceRole) {
      if (!auth) return json({ error: "Não autenticado" }, 401);
      const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await u.auth.getUser();
      if (!user) return json({ error: "Sessão inválida" }, 401);
      const admin0 = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: roles } = await admin0.from("user_roles").select("role").eq("user_id", user.id);
      const allowed = new Set(["admin", "manager", "platform_admin"]);
      if (!(roles ?? []).some((r: any) => allowed.has(r.role))) {
        return json({ error: "Sem permissão (admin/manager)" }, 403);
      }
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    let cfgQ = admin.from("coala_sync_config")
      .select("id, event_id, company_id, drive_file_id, enabled")
      .eq("enabled", true);
    if (configId) cfgQ = cfgQ.eq("id", configId) as any;
    const { data: configs, error: cfgErr } = await cfgQ;
    if (cfgErr) return json({ error: `Falha a ler configs: ${cfgErr.message}` }, 500);
    if (!configs?.length) return json({ ok: true, message: "Sem configs activos", configs: [] });

    const accessToken = await getDriveAccessToken();
    const results: any[] = [];

    for (const cfg of configs) {
      const cfgRes: any = { configId: cfg.id, eventId: cfg.event_id };
      try {
        // 1. Download + parse
        const buf = await downloadDriveXlsx(cfg.drive_file_id, accessToken);
        const parsed = parseCoalaXlsx(buf, "bootstrap");
        const rows = parsed.rows.filter((r) => !r.excluded);

        // 2. Forecasts actuais (despesas activas) + mapa de categorias
        const { data: fcs } = await admin.from("event_forecasts")
          .select("id, description, amount, type, category_id")
          .eq("event_id", cfg.event_id)
          .is("version_id", null);
        const expenseFcs = (fcs ?? []).filter((f: any) => f.type === "expense");

        const { data: cats } = await admin.from("account_categories")
          .select("id, code, name, parent_id, is_active");
        const catById = new Map<string, any>();
        for (const c of (cats ?? [])) catById.set(c.id, c);
        // Helper L2 id (L1→null, L2→self, L3→parent) — espelha apply-coala-bp
        const getL2Id = (catId: string | null | undefined): string | null => {
          if (!catId) return null;
          const cur = catById.get(catId);
          if (!cur || !cur.parent_id) return null;
          const parent = catById.get(cur.parent_id);
          if (!parent) return null;
          return parent.parent_id ? parent.id : cur.id;
        };
        // Conjunto de "nomes alvo" (normalizados) por category_id: própria + pais (L2/L1)
        const catNamesById = new Map<string, Set<string>>();
        for (const c of (cats ?? [])) {
          const names = new Set<string>();
          let cur: any = c;
          for (let i = 0; i < 4 && cur; i++) {
            if (cur.name) names.add(norm(cur.name));
            if (cur.code) names.add(norm(cur.code));
            cur = cur.parent_id ? catById.get(cur.parent_id) : null;
          }
          catNamesById.set(c.id, names);
        }
        const categoryMatches = (fcCategoryId: string | null, rawCenterCusto: string | null): boolean => {
          if (!fcCategoryId || !rawCenterCusto) return false;
          const target = norm(rawCenterCusto);
          if (!target) return false;
          const names = catNamesById.get(fcCategoryId);
          if (!names) return false;
          if (names.has(target)) return true;
          for (const n of names) {
            if (!n) continue;
            if (n.includes(target) || target.includes(n)) return true;
          }
          return false;
        };

        // ── FRENTE 2 (bootstrap): aprendizado supplier→categoria ──
        const { data: supRows } = await admin.from("suppliers")
          .select("id, name")
          .eq("company_id", cfg.company_id);
        const supByName = new Map<string, string>();
        for (const s of (supRows ?? [])) supByName.set(s.name, s.id);

        type LearnedRule = { id: string; supplier_id: string; description_normalized: string; category_id: string; confirmed_count: number };
        const learnedRulesBySupplier = new Map<string, LearnedRule[]>();
        try {
          const { data: rules } = await admin.from("coala_supplier_category_map")
            .select("id, supplier_id, description_normalized, category_id, confirmed_count")
            .eq("company_id", cfg.company_id);
          for (const rl of (rules ?? []) as LearnedRule[]) {
            const c = catById.get(rl.category_id);
            if (!c || c.is_active === false) continue;
            const arr = learnedRulesBySupplier.get(rl.supplier_id) ?? [];
            arr.push(rl);
            learnedRulesBySupplier.set(rl.supplier_id, arr);
          }
        } catch (e) {
          console.warn("[bootstrap learning] load failed:", (e as Error).message);
        }
        // Trigram Dice (sim ≥0.85) — alinhado com apply-coala-bp
        const tri = (s: string): Set<string> => {
          const padded = `  ${s}  `;
          const out = new Set<string>();
          for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
          return out;
        };
        const triSim = (a: string, b: string): number => {
          if (!a || !b) return 0;
          if (a === b) return 1;
          const A = tri(a), B = tri(b);
          let inter = 0; for (const t of A) if (B.has(t)) inter++;
          return (2 * inter) / (A.size + B.size);
        };
        // Resolve categoria sugerida pela learning para uma row XLSX.
        // Retorna null se não há sugestão OU se a regra colide com o L2 do CC do XLSX.
        const resolveLearnedCatId = (r: any): string | null => {
          const sup = r.supplier ? supByName.get(r.supplier) ?? null : null;
          if (!sup) return null;
          const rules = learnedRulesBySupplier.get(sup);
          if (!rules || !rules.length) return null;
          const descNorm = norm(r.description);
          const xlsxCat = r.rawCenterCusto
            ? (cats ?? []).find((c: any) => c.parent_id != null && norm(c.name) === norm(r.rawCenterCusto || ""))
            : null;
          const xlsxL2 = xlsxCat ? getL2Id(xlsxCat.id) : null;
          const validate = (rl: LearnedRule): string | null => {
            if (xlsxL2) {
              const ruleL2 = getL2Id(rl.category_id);
              if (ruleL2 && ruleL2 !== xlsxL2) return null;
            }
            return rl.category_id;
          };
          const exact = rules.find((rl) => rl.description_normalized === descNorm);
          if (exact) {
            const v = validate(exact);
            if (v) return v;
          }
          let best: { rule: LearnedRule; sim: number } | null = null;
          for (const rl of rules) {
            const sim = triSim(descNorm, rl.description_normalized);
            if (sim >= 0.85 && (!best || sim > best.sim)) best = { rule: rl, sim };
          }
          if (best) return validate(best.rule);
          return null;
        };

        // Índices
        const byExact = new Map<string, any[]>();
        const byCents = new Map<number, any[]>();
        const byCoreCents = new Map<string, any[]>();
        for (const f of expenseFcs) {
          const k = `${norm(f.description)}|${moneyKey(Number(f.amount) || 0)}`;
          (byExact.get(k) ?? byExact.set(k, []).get(k)!).push(f);
          const c = moneyKey(Number(f.amount) || 0);
          (byCents.get(c) ?? byCents.set(c, []).get(c)!).push(f);
          const ck = `${coreDescription(f.description)}|${c}`;
          (byCoreCents.get(ck) ?? byCoreCents.set(ck, []).get(ck)!).push(f);
        }

        // 3. Estado actual do row_state (preservar manual_override + forecast_id já vinculado)
        const { data: prev } = await admin.from("coala_sync_row_state")
          .select("row_key, manual_override, forecast_id")
          .eq("config_id", cfg.id);
        const prevByKey = new Map<string, any>();
        for (const s of (prev ?? [])) prevByKey.set(s.row_key, s);
        const usedFcIds = new Set<string>(
          (prev ?? []).map((s: any) => s.forecast_id).filter(Boolean),
        );

        // 4. Para cada row: computar keys + matching
        const upserts: any[] = [];
        const stats = {
          exact: 0, fuzzy: 0, value_anchor: 0,
          category_anchor: 0, category_anchor_via_learning: 0, value_tolerance: 0,
          core_description: 0, ambiguous_core: 0,
          value_unique_pair: 0,
          orphan_value_candidate: 0,
          ambiguous: 0, ambiguous_category: 0, ambiguous_value: 0,
          no_match: 0, preserved: 0,
        };

        // Pré-cálculo: contagem de cents nas rows XLSX (para detetar pares 1-para-1 inequívocos)
        const xlsxCentsCount = new Map<number, number>();
        for (const r of rows) {
          const c = moneyKey(r.netAmount);
          xlsxCentsCount.set(c, (xlsxCentsCount.get(c) ?? 0) + 1);
        }

        for (const r of rows) {
          const identityKey = buildIdentityKey(r);
          const fallbackKey = buildFallbackKey(r);
          const legacyKey = buildLegacyKey(r);
          const rowKey = identityKey ?? fallbackKey;
          const existing = prevByKey.get(rowKey);

          let forecastId: string | null = existing?.forecast_id ?? null;
          let bootstrapSource = "no_match";
          let needsManualLink = false;

          if (existing?.manual_override) {
            bootstrapSource = "preserved_manual_override";
            stats.preserved++;
          } else if (forecastId) {
            // já vinculado em run anterior — manter
            bootstrapSource = "preserved_existing_link";
            stats.preserved++;
          } else {
            // T1: exact
            const exactKey = `${norm(r.description)}|${moneyKey(r.netAmount)}`;
            const exactCands = (byExact.get(exactKey) ?? []).filter((f: any) => !usedFcIds.has(f.id));
            if (exactCands.length === 1) {
              forecastId = exactCands[0].id; bootstrapSource = "exact"; stats.exact++;
            } else if (exactCands.length > 1) {
              needsManualLink = true; bootstrapSource = "ambiguous_exact"; stats.ambiguous++;
            } else {
              // T2+T3: mesmo cents, melhor Dice
              const centsCands = (byCents.get(moneyKey(r.netAmount)) ?? []).filter((f: any) => !usedFcIds.has(f.id));
              const scored = centsCands
                .map((f: any) => ({ f, s: dice(r.description, f.description) }))
                .sort((a, b) => b.s - a.s);
              let matched = false;
              if (scored.length) {
                const top = scored[0];
                const tied = scored.filter((x) => Math.abs(x.s - top.s) < 0.001);
                if (top.s >= 0.7 && tied.length === 1) {
                  forecastId = top.f.id; bootstrapSource = "fuzzy"; stats.fuzzy++; matched = true;
                } else if (top.s >= 0.55 && tied.length === 1) {
                  forecastId = top.f.id; bootstrapSource = "value_anchor"; stats.value_anchor++; matched = true;
                } else if (top.s >= 0.55 && tied.length > 1) {
                  needsManualLink = true; bootstrapSource = "ambiguous"; stats.ambiguous++; matched = true;
                }
              }
              // T4: category_anchor — cents iguais + categoria compatível com centerCusto
              if (!matched) {
                const centsCandsAll = (byCents.get(moneyKey(r.netAmount)) ?? []).filter((f: any) => !usedFcIds.has(f.id));
                const catCands = centsCandsAll.filter((f: any) => categoryMatches(f.category_id, r.rawCenterCusto));
                if (catCands.length === 1) {
                  forecastId = catCands[0].id; bootstrapSource = "category_anchor"; stats.category_anchor++; matched = true;
                } else if (catCands.length > 1) {
                  needsManualLink = true; bootstrapSource = "ambiguous_category"; stats.ambiguous_category++; matched = true;
                }
              }
              // T4b: category_anchor_via_learning — sinal adicional da learning table
              // (não override, só desempate/confirmação quando o CC do XLSX falha)
              if (!matched) {
                const learnedCatId = resolveLearnedCatId(r);
                if (learnedCatId) {
                  const learnedL2 = getL2Id(learnedCatId);
                  if (learnedL2) {
                    const targetCents = moneyKey(r.netAmount);
                    const target = Number(r.netAmount) || 0;
                    // 1º cents exatos com L2 compatível
                    let lrnCands = (byCents.get(targetCents) ?? [])
                      .filter((f: any) => !usedFcIds.has(f.id))
                      .filter((f: any) => getL2Id(f.category_id) === learnedL2);
                    // 2º se nenhum, tenta ±10% com L2 compatível
                    if (lrnCands.length === 0 && target !== 0) {
                      lrnCands = expenseFcs.filter((f: any) => {
                        if (usedFcIds.has(f.id)) return false;
                        if (getL2Id(f.category_id) !== learnedL2) return false;
                        const amt = Number(f.amount) || 0;
                        return Math.abs(amt - target) / Math.abs(target) <= 0.10;
                      });
                    }
                    if (lrnCands.length === 1) {
                      forecastId = lrnCands[0].id;
                      bootstrapSource = "category_anchor_via_learning";
                      stats.category_anchor_via_learning++;
                      matched = true;
                    }
                    // empate >1 deixa cair para tiers seguintes (ou orphan/needs_manual_link)
                  }
                }
              }
              // T5: value_tolerance ±10% + categoria compatível
              if (!matched) {
                const target = Number(r.netAmount) || 0;
                const tolCands = expenseFcs.filter((f: any) => {
                  if (usedFcIds.has(f.id)) return false;
                  if (!categoryMatches(f.category_id, r.rawCenterCusto)) return false;
                  const amt = Number(f.amount) || 0;
                  if (target === 0) return false;
                  return Math.abs(amt - target) / Math.abs(target) <= 0.10;
                });
                if (tolCands.length) {
                  const scoredTol = tolCands
                    .map((f: any) => ({ f, s: dice(r.description, f.description) }))
                    .sort((a, b) => b.s - a.s);
                  const top = scoredTol[0];
                  const tied = scoredTol.filter((x) => Math.abs(x.s - top.s) < 0.001);
                  if (top.s >= 0.55 && tied.length === 1) {
                    forecastId = top.f.id; bootstrapSource = "value_tolerance"; stats.value_tolerance++; matched = true;
                  } else if (tied.length > 1) {
                    needsManualLink = true; bootstrapSource = "ambiguous_value"; stats.ambiguous_value++; matched = true;
                  }
                }
              }
              // T6: core_description — descrição sem sufixo de parcela + cents iguais
              if (!matched) {
                const coreKey = `${coreDescription(r.description)}|${moneyKey(r.netAmount)}`;
                const coreCands = (byCoreCents.get(coreKey) ?? []).filter((f: any) => !usedFcIds.has(f.id));
                if (coreCands.length === 1) {
                  forecastId = coreCands[0].id; bootstrapSource = "core_description"; stats.core_description++; matched = true;
                } else if (coreCands.length > 1) {
                  needsManualLink = true; bootstrapSource = "ambiguous_core"; stats.ambiguous_core++; matched = true;
                }
              }
              // T7: value_unique_pair — par 1-para-1 inequívoco por cents EXACTOS
              if (!matched) {
                const targetCents = moneyKey(r.netAmount);
                const fcOrphansSameCents = (byCents.get(targetCents) ?? []).filter((f: any) => !usedFcIds.has(f.id));
                if (fcOrphansSameCents.length === 1 && (xlsxCentsCount.get(targetCents) ?? 0) === 1) {
                  forecastId = fcOrphansSameCents[0].id;
                  bootstrapSource = "value_unique_pair";
                  stats.value_unique_pair++;
                  matched = true;
                }
              }
              // Destino final reforçado: forecast órfão de valor compatível → manual_link
              if (!matched) {
                const target = Number(r.netAmount) || 0;
                const targetCents = moneyKey(r.netAmount);
                const orphanCands = expenseFcs.filter((f: any) => {
                  if (usedFcIds.has(f.id)) return false;
                  const amt = Number(f.amount) || 0;
                  const cents = moneyKey(amt);
                  if (cents === targetCents) return true;
                  if (target === 0) return false;
                  return Math.abs(amt - target) / Math.abs(target) <= 0.10;
                });
                if (orphanCands.length >= 1) {
                  needsManualLink = true;
                  bootstrapSource = "orphan_value_candidate";
                  stats.orphan_value_candidate++;
                  matched = true;
                }
              }
              if (!matched) stats.no_match++;
            }
            if (forecastId) usedFcIds.add(forecastId);
          }

          upserts.push({
            config_id: cfg.id,
            row_key: rowKey,
            identity_key: identityKey,
            fallback_key: fallbackKey,
            legacy_key: legacyKey,
            row_number: r.rowNumber,
            supplier_norm: norm(r.supplier ?? ""),
            invoice_ref_norm: norm(r.invoiceRef ?? ""),
            center_custo_norm: norm(r.rawCenterCusto ?? ""),
            net_amount_cents: moneyKey(r.netAmount),
            forecast_id: forecastId,
            needs_manual_link: needsManualLink,
            bootstrap_source: bootstrapSource,
            // não rescrever manual_override aqui (preservado pelo upsert via fk + lógica acima)
            last_xlsx_payload: {
              rowNumber: r.rowNumber, description: r.description, netAmount: r.netAmount,
              supplier: r.supplier, invoiceRef: r.invoiceRef, status: r.status,
              paymentDate: r.paymentDate, dueDate: r.dueDate,
            },
          });
        }

        cfgRes.parsedRows = rows.length;
        cfgRes.prevStateRows = prev?.length ?? 0;
        cfgRes.stats = stats;
        cfgRes.upsertCount = upserts.length;

        if (!dryRun && upserts.length) {
          // UPSERT em chunks de 500. NOTA: não sobrescreve manual_override
          // (esse não está no payload, fica preservado pelo default da tabela).
          // Mas como o INSERT define manual_override=false default, num conflict
          // o ON CONFLICT só actualiza colunas listadas → preserva.
          const CHUNK = 500;
          let inserted = 0, updated = 0, errs = 0;
          for (let i = 0; i < upserts.length; i += CHUNK) {
            const slice = upserts.slice(i, i + CHUNK);
            const { error } = await admin.from("coala_sync_row_state")
              .upsert(slice, { onConflict: "config_id,row_key", ignoreDuplicates: false });
            if (error) { errs += slice.length; cfgRes.error = error.message; }
            else { inserted += slice.length; }
          }
          cfgRes.upsertResult = { ok: errs === 0, count: inserted, errors: errs };
          // Update audit
          await admin.from("coala_sync_config").update({
            last_run_at: new Date().toISOString(),
          }).eq("id", cfg.id);
          updated++; // silence unused
        } else if (dryRun) {
          cfgRes.dryRun = true;
          cfgRes.samplePlan = upserts.slice(0, 10);
        }
      } catch (e) {
        cfgRes.error = (e as Error).message;
      }
      results.push(cfgRes);
    }

    return json({ ok: true, dryRun, configs: results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
