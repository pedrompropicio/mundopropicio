// supabase/functions/_shared/enforce-include-audiences.ts
//
// Helper PURO (sem I/O). Garante que as audiências de INCLUSÃO escolhidas pelo
// utilizador entram nos adsets de PROSPEÇÃO do plano gerado pelo LLM, e não
// colidem com exclusões nem com a audiência de compradores do próprio evento.
//
// Estrutura do `plan` esperada (confirmada na BD, 2026-06-28):
//   plan.recommended_campaigns[].objective_meta?: string
//   plan.recommended_campaigns[].phase_id?: string
//   plan.recommended_campaigns[].adsets[].name?: string
//   plan.recommended_campaigns[].adsets[].optimization_goal?: string  (nem sempre presente)
//   plan.recommended_campaigns[].adsets[].targeting_json.custom_audiences?: Array<{id:string,name?:string}>
//   plan.recommended_campaigns[].adsets[].targeting_json.exclusions?: { custom_audiences?: Array<{id:string}> }
//
// API:
//   enforceIncludeAudiences(plan, {
//     includeIds: string[],
//     validIdsSet: Set<string>,
//     excludePurchaseIds: string[],
//   }) => { plan, report }

export interface EnforceOptions {
  includeIds: string[];
  validIdsSet: Set<string>;
  excludePurchaseIds: string[];
}

export interface EnforceReport {
  applied_to_adsets: number;
  effective_ids: string[];
  dropped_invalid: string[];
  conflict_with_purchase: string[];
  removed_from_exclusions: Array<{ adset_name: string; ids: string[] }>;
  fallback_used: boolean;
}

export interface EnforceResult<P = any> {
  plan: P;
  report: EnforceReport;
}

const CONVERSION_GOALS = new Set(["OFFSITE_CONVERSIONS", "CONVERSIONS", "VALUE"]);
const CONVERSION_OBJECTIVES = new Set(["OUTCOME_SALES", "CONVERSIONS"]);
const PROSPECTING_RX = /awareness|reach|prospect|broad|lookalike|semelhant/i;
const RETARGETING_RX = /retarget|warm|remarket|reengaj|reengag/i;

function isProspectingAdset(adset: any, campaign: any): boolean {
  const goal = String(adset?.optimization_goal ?? "").toUpperCase();
  if (goal && !CONVERSION_GOALS.has(goal)) return true;

  const name = String(adset?.name ?? "");
  const phaseId = String(campaign?.phase_id ?? "");
  if (PROSPECTING_RX.test(name) || PROSPECTING_RX.test(phaseId)) return true;

  return false;
}

function isClearlyRetargeting(adset: any, campaign: any): boolean {
  const name = String(adset?.name ?? "");
  const phaseId = String(campaign?.phase_id ?? "");
  return RETARGETING_RX.test(name) || RETARGETING_RX.test(phaseId);
}

function isCampaignConversionOnly(campaign: any): boolean {
  const obj = String(campaign?.objective_meta ?? "").toUpperCase();
  return CONVERSION_OBJECTIVES.has(obj);
}

export function enforceIncludeAudiences<P = any>(
  plan: P,
  opts: EnforceOptions,
): EnforceResult<P> {
  const report: EnforceReport = {
    applied_to_adsets: 0,
    effective_ids: [],
    dropped_invalid: [],
    conflict_with_purchase: [],
    removed_from_exclusions: [],
    fallback_used: false,
  };

  // 1. Filtrar inválidos (não existem no catálogo Meta).
  const validIds: string[] = [];
  const excludeSet = new Set(opts.excludePurchaseIds.map(String));
  for (const raw of opts.includeIds ?? []) {
    const id = String(raw);
    if (!opts.validIdsSet.has(id)) {
      report.dropped_invalid.push(id);
      continue;
    }
    // 2. Anti-colisão com a audiência de compradores deste evento.
    if (excludeSet.has(id)) {
      report.conflict_with_purchase.push(id);
      continue;
    }
    validIds.push(id);
  }

  // Dedup preservando ordem.
  const effectiveIds = Array.from(new Set(validIds));
  report.effective_ids = effectiveIds;

  if (effectiveIds.length === 0) {
    return { plan, report };
  }

  const campaigns: any[] = Array.isArray((plan as any)?.recommended_campaigns)
    ? (plan as any).recommended_campaigns
    : [];

  // 3. Identificar adsets de prospeção.
  type Target = { campaign: any; adset: any };
  let targets: Target[] = [];
  for (const c of campaigns) {
    const adsets: any[] = Array.isArray(c?.adsets) ? c.adsets : [];
    for (const a of adsets) {
      if (isProspectingAdset(a, c)) targets.push({ campaign: c, adset: a });
    }
  }

  // Fallback: nenhum adset claramente de prospeção → usa todos os não-retarget,
  // mas só se a campanha não for OUTCOME_SALES puro (evita injetar em campanhas
  // exclusivamente de conversão sem qualquer sinal de prospeção).
  if (targets.length === 0) {
    report.fallback_used = true;
    for (const c of campaigns) {
      if (isCampaignConversionOnly(c)) continue;
      const adsets: any[] = Array.isArray(c?.adsets) ? c.adsets : [];
      for (const a of adsets) {
        if (!isClearlyRetargeting(a, c)) targets.push({ campaign: c, adset: a });
      }
    }
  }

  // 4 + 5. Injetar nos targets, remover de exclusions.
  for (const { adset } of targets) {
    if (!adset.targeting_json || typeof adset.targeting_json !== "object") {
      adset.targeting_json = {};
    }
    const t = adset.targeting_json;

    // 4. Garantir os ids em custom_audiences.
    const current: any[] = Array.isArray(t.custom_audiences) ? t.custom_audiences : [];
    const currentIds = new Set(current.map((x) => String(x?.id ?? "")));
    const merged = current.slice();
    for (const id of effectiveIds) {
      if (!currentIds.has(id)) {
        merged.push({ id });
        currentIds.add(id);
      }
    }
    t.custom_audiences = merged;

    // 5. Remover dos exclusions.
    if (t.exclusions && typeof t.exclusions === "object" && !Array.isArray(t.exclusions)) {
      const exCa: any[] = Array.isArray(t.exclusions.custom_audiences)
        ? t.exclusions.custom_audiences
        : [];
      if (exCa.length > 0) {
        const removed: string[] = [];
        const kept = exCa.filter((x) => {
          const id = String(x?.id ?? "");
          if (effectiveIds.includes(id)) {
            removed.push(id);
            return false;
          }
          return true;
        });
        if (removed.length > 0) {
          report.removed_from_exclusions.push({
            adset_name: String(adset?.name ?? ""),
            ids: removed,
          });
        }
        if (kept.length > 0) {
          t.exclusions.custom_audiences = kept;
        } else {
          delete t.exclusions.custom_audiences;
        }
        // Se exclusions ficou um objeto vazio, deixa-o vazio (não removemos o
        // objeto inteiro porque pode conter outras chaves no futuro — neste
        // momento o LLM emite {} vazio em adsets sem exclusion).
      }
    }

    report.applied_to_adsets += 1;
  }

  return { plan, report };
}
