import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const redesign = readFileSync("supabase/functions/crm-meta-campaign-redesign/index.ts", "utf8");
const newDesign = readFileSync("supabase/functions/crm-meta-campaign-new-design/index.ts", "utf8");

function evaluate(source: string, context: Record<string, unknown>) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  return runInNewContext(compiled.outputText, context);
}

function statement(source: string, name: string) {
  const match = source.match(new RegExp(`const ${name}[^\\n]*;`));
  if (!match) throw new Error(`Missing ${name}`);
  return match[0];
}

describe("crm-meta-campaign-redesign — meta opcional", () => {
  it.each([undefined, null, 0, -1, NaN, Infinity])("sem meta (%s) conserva NULL na viabilidade", (floor) => {
    const start = redesign.indexOf("function analyzeViability(");
    const end = redesign.indexOf("const viability = analyzeViability", start);
    const result = evaluate([
      statement(redesign, "effRoasFloor"), statement(redesign, "targetBlendedRoas"),
      redesign.slice(start, end), "analyzeViability({});",
    ].join("\n"), {
      ctIn: { roas_floor: floor }, campMetrics: { roas: 2 },
      campAgg: { spendCents: 10000, purchases: 4 }, periodDays: 30,
      eventCtx: { tickets_total: 1000, daysUntil: 60 },
      classifyTrajectory: () => "stable", TICKET_AVG_FALLBACK_EUR: 25,
      STATISTICAL_FLOOR_SPEND_EUR: 2000,
    });
    expect(result.target_roas).toBeNull();
    expect(result.spend_needed_for_goal).toBeNull();
    expect(result.daily_spend_needed_for_goal_eur).toBeNull();
    expect(result.roas_gap).toBeNull();
    expect(result.gap_severity).toBeNull();
  });

  it("mantém a meta positiva e não classifica winners sem meta", () => {
    expect(evaluate(`${statement(redesign, "effRoasFloor")}\n${statement(redesign, "targetBlendedRoas")}\ntargetBlendedRoas;`, { ctIn: { roas_floor: 6 } })).toBe(6);
    expect(evaluate(`${statement(redesign, "winnerRoasThreshold")}\nwinnerRoasThreshold;`, { targetBlendedRoas: null, CREATIVE_WINNER_ROAS_RATIO: 0.6 })).toBeNull();
    expect(redesign).toContain("winnerRoasThreshold == null ||");
    expect(redesign).toContain("const target_roas = targetBlendedRoas;");
    expect(redesign).not.toMatch(/\b8x\b/);
  });

  it("sem meta não gera contrapropostas de floor e não aplica cap à projecção", () => {
    const cpStart = redesign.indexOf("function generateCounterProposals(");
    const cpEnd = redesign.indexOf("function metricsOf(", cpStart);
    const proposals = evaluate(`${redesign.slice(cpStart, cpEnd)}\ngenerateCounterProposals(args);`, {
      args: { viability: { roas_lifetime: 1, days_until_event: 60 }, constraints: { daily_budget_eur: 100, roas_floor: null, end_date: "" }, horizon_days: 60, statistical_floor_eur: 2000, current_daily_total_eur: 6000 },
    });
    expect(proposals).toHaveLength(0);
    expect(evaluate(`${statement(redesign, "max_allowed")}\nmax_allowed;`, { constraints: { roas_floor: null }, ANCHORED_ROAS_CAP_VS_FLOOR: 1.2 })).toBeNull();
  });
});

describe("crm-meta-campaign-new-design — meta opcional", () => {
  it.each([undefined, null, 0, -1, NaN, Infinity])("sem meta (%s) grava NULL, não 9", (target) => {
    expect(evaluate(`${statement(newDesign, "targetRoas")}\ntargetRoas;`, { body: { target_roas: target } })).toBeNull();
    expect(newDesign).toContain("target_roas: targetRoas,");
    expect(newDesign).toContain("sem meta de ROAS definida — não fixes um alvo");
    expect(newDesign).toContain("if (targetRoas == null)");
    expect(newDesign).not.toMatch(/>=8x|10–20x|awareness 0–2x/);
  });

  it("preserva a meta real e deixa o orçamento recomendado ao LLM", () => {
    expect(evaluate(`${statement(newDesign, "targetRoas")}\ntargetRoas;`, { body: { target_roas: 6 } })).toBe(6);
    expect(newDesign).not.toContain("plan.summary.recommended_total_budget_eur =");
  });
});