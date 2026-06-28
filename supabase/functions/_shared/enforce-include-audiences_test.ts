// Testes puros (deno test) para enforce-include-audiences.
// Sem rede, sem curl, sem invocar edge functions.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceIncludeAudiences } from "./enforce-include-audiences.ts";

function makePlan(): any {
  return {
    recommended_campaigns: [
      {
        phase_id: "awareness",
        objective_meta: "OUTCOME_AWARENESS",
        adsets: [
          {
            name: "AW - Interesses - PT",
            targeting_json: { interests: [{ name: "X" }], exclusions: {} },
          },
          {
            name: "AW - Lookalike 1%",
            targeting_json: {
              custom_audiences: [{ id: "PRE_EXISTING", name: "Pré-existente" }],
              exclusions: {},
            },
          },
        ],
      },
      {
        phase_id: "conversion",
        objective_meta: "OUTCOME_SALES",
        adsets: [
          {
            name: "CV - Site Visitors",
            optimization_goal: "OFFSITE_CONVERSIONS",
            targeting_json: {
              exclusions: { custom_audiences: [{ id: "PURCHASE_EVT" }] },
            },
          },
        ],
      },
      {
        phase_id: "retargeting",
        objective_meta: "OUTCOME_SALES",
        adsets: [
          {
            name: "RT - Warm Visitors",
            optimization_goal: "OFFSITE_CONVERSIONS",
            targeting_json: { exclusions: {} },
          },
        ],
      },
    ],
  };
}

Deno.test("aplica includes nos adsets de prospeção e não nos de conversão/retargeting", () => {
  const plan = makePlan();
  const { plan: out, report } = enforceIncludeAudiences(plan, {
    includeIds: ["A1", "A2"],
    validIdsSet: new Set(["A1", "A2", "PURCHASE_EVT", "PRE_EXISTING"]),
    excludePurchaseIds: ["PURCHASE_EVT"],
  });

  // Awareness adset 1 (interesses) recebe A1+A2
  const aw1 = out.recommended_campaigns[0].adsets[0].targeting_json.custom_audiences;
  assertEquals(aw1.map((x: any) => x.id).sort(), ["A1", "A2"]);

  // Awareness adset 2 mantém o pré-existente e ganha A1+A2 (dedup)
  const aw2 = out.recommended_campaigns[0].adsets[1].targeting_json.custom_audiences;
  assertEquals(aw2.map((x: any) => x.id).sort(), ["A1", "A2", "PRE_EXISTING"]);

  // Conversion adset NÃO recebe
  const cv = out.recommended_campaigns[1].adsets[0].targeting_json.custom_audiences;
  assertEquals(cv, undefined);

  // Retargeting adset NÃO recebe
  const rt = out.recommended_campaigns[2].adsets[0].targeting_json.custom_audiences;
  assertEquals(rt, undefined);

  assertEquals(report.applied_to_adsets, 2);
  assertEquals(report.effective_ids, ["A1", "A2"]);
  assertEquals(report.fallback_used, false);
});

Deno.test("descarta ids inválidos (dropped_invalid)", () => {
  const plan = makePlan();
  const { report } = enforceIncludeAudiences(plan, {
    includeIds: ["A1", "FAKE_999"],
    validIdsSet: new Set(["A1"]),
    excludePurchaseIds: [],
  });
  assertEquals(report.dropped_invalid, ["FAKE_999"]);
  assertEquals(report.effective_ids, ["A1"]);
});

Deno.test("remove ids que colidem com a Purchase do próprio evento", () => {
  const plan = makePlan();
  const { plan: out, report } = enforceIncludeAudiences(plan, {
    includeIds: ["A1", "PURCHASE_EVT"],
    validIdsSet: new Set(["A1", "PURCHASE_EVT"]),
    excludePurchaseIds: ["PURCHASE_EVT"],
  });
  assertEquals(report.conflict_with_purchase, ["PURCHASE_EVT"]);
  assertEquals(report.effective_ids, ["A1"]);

  // PURCHASE_EVT permanece como exclusão do adset de conversão (não foi tocado)
  const cvEx = out.recommended_campaigns[1].adsets[0].targeting_json.exclusions.custom_audiences;
  assertEquals(cvEx, [{ id: "PURCHASE_EVT" }]);
});

Deno.test("retira do exclusions os ids que vão entrar em include", () => {
  // Plano onde o LLM, por erro, colocou A1 em exclusions do adset de prospeção.
  const plan: any = {
    recommended_campaigns: [
      {
        phase_id: "awareness",
        objective_meta: "OUTCOME_AWARENESS",
        adsets: [
          {
            name: "AW - Broad",
            targeting_json: {
              exclusions: { custom_audiences: [{ id: "A1" }, { id: "OTHER" }] },
            },
          },
        ],
      },
    ],
  };
  const { plan: out, report } = enforceIncludeAudiences(plan, {
    includeIds: ["A1"],
    validIdsSet: new Set(["A1", "OTHER"]),
    excludePurchaseIds: [],
  });
  const t = out.recommended_campaigns[0].adsets[0].targeting_json;
  assertEquals(t.custom_audiences, [{ id: "A1" }]);
  assertEquals(t.exclusions.custom_audiences, [{ id: "OTHER" }]);
  assertEquals(report.removed_from_exclusions, [{ adset_name: "AW - Broad", ids: ["A1"] }]);
});

Deno.test("fallback quando nenhum adset tem goal/sinal de prospeção claro", () => {
  // Adsets sem optimization_goal, sem palavras-chave de prospeção nem retarget,
  // numa campanha que não é OUTCOME_SALES puro.
  const plan: any = {
    recommended_campaigns: [
      {
        phase_id: "consideration",
        objective_meta: "OUTCOME_TRAFFIC",
        adsets: [
          { name: "Adset Genérico A", targeting_json: { exclusions: {} } },
          { name: "Adset Genérico B", targeting_json: { exclusions: {} } },
        ],
      },
    ],
  };
  const { plan: out, report } = enforceIncludeAudiences(plan, {
    includeIds: ["A1"],
    validIdsSet: new Set(["A1"]),
    excludePurchaseIds: [],
  });
  assert(report.fallback_used);
  assertEquals(report.applied_to_adsets, 2);
  const adsets = out.recommended_campaigns[0].adsets;
  assertEquals(adsets[0].targeting_json.custom_audiences, [{ id: "A1" }]);
  assertEquals(adsets[1].targeting_json.custom_audiences, [{ id: "A1" }]);
});

Deno.test("fallback NÃO injeta em adsets retarget mesmo quando ativo", () => {
  const plan: any = {
    recommended_campaigns: [
      {
        phase_id: "consideration",
        objective_meta: "OUTCOME_TRAFFIC",
        adsets: [
          { name: "Adset Genérico", targeting_json: {} },
          { name: "RT - Remarketing visitors", targeting_json: {} },
        ],
      },
    ],
  };
  const { plan: out, report } = enforceIncludeAudiences(plan, {
    includeIds: ["A1"],
    validIdsSet: new Set(["A1"]),
    excludePurchaseIds: [],
  });
  assert(report.fallback_used);
  assertEquals(report.applied_to_adsets, 1);
  assertEquals(out.recommended_campaigns[0].adsets[0].targeting_json.custom_audiences, [{ id: "A1" }]);
  assertEquals(out.recommended_campaigns[0].adsets[1].targeting_json.custom_audiences, undefined);
});

Deno.test("noop quando includeIds vazio", () => {
  const plan = makePlan();
  const before = JSON.stringify(plan);
  const { plan: out, report } = enforceIncludeAudiences(plan, {
    includeIds: [],
    validIdsSet: new Set(),
    excludePurchaseIds: [],
  });
  assertEquals(JSON.stringify(out), before);
  assertEquals(report.applied_to_adsets, 0);
  assertEquals(report.effective_ids, []);
});
