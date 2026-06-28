// StrategyPlanCard — componente read-only que renderiza o plano canónico de uma
// estratégia (mesmo formato que crm.meta_campaign_strategies.generated_plan).
// DR-2026-06-27d: usado pela DuelView para mostrar 2 candidatos lado-a-lado.
//
// NOTA: optei por DUPLICAR (em vez de extrair do StrategyView.tsx) — o render no
// StrategyView (~1300 linhas) está entrelaçado com hooks de fetch, banners de
// deploy, modais de edição, tabs original/alternative e handlers de aprovação;
// extrair sem regressão exigiria um refactor extenso. Este componente foca-se nas
// secções canónicas do plano, sem qualquer side effect.

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle, AlertTriangle, Sparkles, Target, ImageIcon as Image2, PlayCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FEASIBILITY_BADGE: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  medium: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  low: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  impossible: "bg-red-500/15 text-red-300 border-red-500/40",
};

const PHASE_BORDERS = [
  "border-l-cyan-500/60",
  "border-l-blue-500/60",
  "border-l-emerald-500/60",
  "border-l-amber-500/60",
];

function fmtEur(n: any, digits = 0): string {
  if (n == null || isNaN(Number(n))) return "—";
  return `€${Number(n).toLocaleString("pt-PT", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}`;
}
function fmtNum(n: any): string {
  if (n == null || isNaN(Number(n))) return "—";
  const v = Number(n);
  return v.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs font-medium">{value}</div>
    </div>
  );
}

export default function StrategyPlanCard({
  plan,
  compact = false,
}: {
  plan: any;
  compact?: boolean;
}) {
  if (!plan || typeof plan !== "object") {
    return (
      <Card className="p-4 border-amber-500/40 bg-amber-500/5 text-sm text-amber-300">
        Plano vazio.
      </Card>
    );
  }

  const summary = plan.summary ?? {};
  const phases: any[] = Array.isArray(plan.phases) ? plan.phases : [];
  const recCamps: any[] = Array.isArray(plan.recommended_campaigns)
    ? plan.recommended_campaigns
    : [];
  const scaling: any[] = Array.isArray(plan.scaling_rules) ? plan.scaling_rules : [];
  const risks: any[] = Array.isArray(plan.risks_and_warnings) ? plan.risks_and_warnings : [];
  const brief = plan.creative_brief ?? {};
  const inherited: any[] = Array.isArray(plan.inherited_creatives) ? plan.inherited_creatives : [];

  return (
    <div className={cn("space-y-4", compact && "text-sm")}>
      {/* Summary */}
      <Card className="p-4 border-cyan-500/30 bg-cyan-500/[0.03]">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Badge
            className={cn(
              "text-xs uppercase border flex items-center gap-1",
              FEASIBILITY_BADGE[summary.feasibility] ?? "bg-muted/40"
            )}
          >
            Viabilidade: {summary.feasibility ?? "—"}
          </Badge>
          {summary.confidence && (
            <span className="text-xs text-muted-foreground">
              Confiança: {summary.confidence}
            </span>
          )}
          {summary.ready_to_deploy != null && (
            <Badge variant="outline" className="text-[10px] uppercase">
              {summary.ready_to_deploy ? "Pronto p/ deploy" : "Não pronto"}
            </Badge>
          )}
        </div>
        {summary.feasibility_reason && (
          <p className="text-xs text-muted-foreground mb-3">{summary.feasibility_reason}</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <KPI label="Verba recomendada" value={fmtEur(summary.recommended_total_budget_eur)} />
          <KPI label="Compras esperadas" value={fmtNum(summary.expected_purchases ?? summary.expected_total_purchases)} />
          <KPI label="Receita esperada" value={fmtEur(summary.expected_revenue_eur)} />
          <KPI
            label="ROAS esperado"
            value={
              summary.expected_overall_roas != null
                ? `${fmtNum(summary.expected_overall_roas)}x`
                : "—"
            }
          />
        </div>
        {summary.expected_cpa_eur != null && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            CPA esperado:{" "}
            <span className="text-foreground font-medium">
              {fmtEur(summary.expected_cpa_eur, 2)}
            </span>
          </div>
        )}
      </Card>

      {/* kpi_coherence_warning */}
      {summary.kpi_coherence_warning && (
        <Card className="p-3 border-amber-500/40 bg-amber-500/5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-200">{summary.kpi_coherence_warning}</div>
          </div>
        </Card>
      )}

      {/* Criativos herdados */}
      {inherited.length > 0 && (
        <Card className="p-3 border-cyan-500/30 bg-cyan-500/[0.04]">
          <div className="flex items-center gap-2 mb-2">
            <Image2 className="h-3.5 w-3.5 text-cyan-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider">
              Criativos reaproveitados ({inherited.length})
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {inherited.slice(0, 6).map((c: any) => (
              <div
                key={c.meta_creative_id}
                className="flex gap-2 rounded border border-border bg-background/50 p-2"
              >
                <div className="relative h-10 w-10 rounded bg-muted/50 border border-border overflow-hidden shrink-0 flex items-center justify-center">
                  {c.file_url ? (
                    <img
                      src={c.file_url}
                      alt={c.name ?? ""}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <Image2 className="h-4 w-4 text-amber-400/70" />
                  )}
                  {c.file_url && c.type === "video" && (
                    <PlayCircle className="absolute bottom-0 right-0 h-3 w-3 text-white bg-black/50 rounded-full" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium truncate">{c.name ?? "Sem nome"}</div>
                  <div className="text-[9px] text-muted-foreground font-mono truncate">
                    {c.meta_creative_id}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {inherited.length > 6 && (
            <div className="text-[10px] text-muted-foreground mt-1">
              + {inherited.length - 6} mais
            </div>
          )}
        </Card>
      )}

      {/* Phases */}
      {phases.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-cyan-400" /> Fases ({phases.length})
          </h3>
          <div className="space-y-2">
            {phases.map((p: any, idx: number) => {
              // Fallbacks redesign → from-scratch
              const phaseName = p.name ?? p.phase_label;
              const phaseStart = p.days_from_event_start ?? p.start_days_before_event;
              const phaseObjective = p.objective ?? p.objective_meta;
              const phaseEnd = p.days_from_event_end ?? (
                phaseStart != null && p.duration_days != null
                  ? phaseStart - p.duration_days
                  : undefined
              );
              // Budget da fase: redesign → directo; from-scratch → budget_share × total
              let phaseDaily = p.daily_budget_eur;
              let phaseTotal = p.total_phase_budget_eur;
              if (phaseDaily == null && phaseTotal == null &&
                  typeof p.budget_share === "number" &&
                  typeof summary.recommended_total_budget_eur === "number") {
                phaseTotal = p.budget_share * summary.recommended_total_budget_eur;
                if (typeof p.duration_days === "number" && p.duration_days > 0) {
                  phaseDaily = phaseTotal / p.duration_days;
                }
              }
              const hasBudget = phaseDaily != null || phaseTotal != null;
              return (
              <Card
                key={p.id ?? p.phase_id ?? idx}
                className={cn(
                  "p-3 border-l-4",
                  PHASE_BORDERS[idx % PHASE_BORDERS.length]
                )}
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Fase {idx + 1}
                    </div>
                    <h4 className="text-sm font-semibold">{phaseName}</h4>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {phaseStart != null && phaseEnd != null
                        ? `D-${phaseStart} → D-${phaseEnd} (${p.duration_days}d)`
                        : phaseStart != null
                          ? `D-${phaseStart}${p.duration_days != null ? ` (${p.duration_days}d)` : ""}`
                          : p.duration_days != null ? `${p.duration_days}d` : ""}
                      {phaseObjective ? ` · ${phaseObjective}` : ""}
                    </div>
                  </div>
                  {hasBudget && (
                    <div className="text-right text-[11px]">
                      <div className="text-muted-foreground">Daily / Total</div>
                      <div className="font-semibold">
                        {fmtEur(phaseDaily, 0)} / {fmtEur(phaseTotal, 0)}
                      </div>
                    </div>
                  )}
                </div>
                {p.primary_audiences?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.primary_audiences.slice(0, 4).map((a: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px]">
                        {a.type}: {a.description}
                      </Badge>
                    ))}
                  </div>
                )}
                {p.target_kpis && (
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    <MiniStat
                      label="CPM máx"
                      value={p.target_kpis.cpm_eur_max != null ? fmtEur(p.target_kpis.cpm_eur_max, 2) : "—"}
                    />
                    <MiniStat
                      label="CTR mín"
                      value={p.target_kpis.ctr_pct_min != null ? `${p.target_kpis.ctr_pct_min}%` : "—"}
                    />
                    <MiniStat
                      label="CPA máx"
                      value={p.target_kpis.cpa_eur_max != null ? fmtEur(p.target_kpis.cpa_eur_max, 2) : "—"}
                    />
                    <MiniStat
                      label="ROAS mín"
                      value={p.target_kpis.roas_min != null ? `${p.target_kpis.roas_min}x` : "—"}
                    />
                  </div>
                )}
              </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommended campaigns / adsets / ads */}
      {recCamps.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            Campanhas recomendadas ({recCamps.length})
          </h3>
          <div className="space-y-2">
            {recCamps.map((c: any, ci: number) => {
              const campName = c.campaign_name ?? c.campaign_label;
              const campObjective = c.objective ?? c.objective_meta;
              const metaParts: string[] = [];
              if (campObjective) metaParts.push(campObjective);
              if (c.daily_budget_eur != null) metaParts.push(`${fmtEur(c.daily_budget_eur, 0)}/dia`);
              if (c.duration_days != null) metaParts.push(`${c.duration_days}d`);
              return (
              <Card key={ci} className="p-3 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-medium">{campName}</div>
                  {metaParts.length > 0 && (
                    <div className="text-muted-foreground text-[11px]">
                      {metaParts.join(" · ")}
                    </div>
                  )}
                </div>
                {Array.isArray(c.adsets) &&
                  c.adsets.map((a: any, ai: number) => {
                    const adsetName = a.adset_name ?? a.name;
                    const opt = a.optimization_goal;
                    const billing = a.billing_event;
                    const creativeType = a.creative_type_recommended ?? a.creatives?.[0]?.type;
                    const techBits: string[] = [];
                    if (opt) techBits.push(`opt: ${opt}`);
                    if (billing) techBits.push(`billing: ${billing}`);
                    if (creativeType) techBits.push(`creative: ${creativeType}`);
                    // contagem: redesign usa ads[]; from-scratch usa creatives[]
                    const adsCount = Array.isArray(a.ads) ? a.ads.length : 0;
                    const creativesCount = Array.isArray(a.creatives) ? a.creatives.length : 0;
                    const tj = a.targeting_json;
                    const caCount = Array.isArray(tj?.custom_audiences) ? tj.custom_audiences.length : 0;
                    const intCount = Array.isArray(tj?.interests) ? tj.interests.length : 0;
                    const countries: string[] = Array.isArray(tj?.geo_locations?.countries) ? tj.geo_locations.countries : [];
                    const targetingBits: string[] = [];
                    if (caCount) targetingBits.push(`${caCount} custom audience${caCount > 1 ? "s" : ""}`);
                    if (intCount) targetingBits.push(`${intCount} interesse${intCount > 1 ? "s" : ""}`);
                    if (countries.length) targetingBits.push(`geo: ${countries.join(", ")}`);
                    const placements: string[] = Array.isArray(a.placements) ? a.placements : [];
                    return (
                    <div key={ai} className="rounded bg-muted/30 p-2 space-y-1">
                      <div className="font-medium text-[11px]">{adsetName}</div>
                      {techBits.length > 0 && (
                        <div className="text-muted-foreground text-[10px]">
                          {techBits.join(" · ")}
                        </div>
                      )}
                      {a.audience_description && (
                        <div className="text-[10px] text-foreground/80">
                          Público: <span className="text-muted-foreground">{a.audience_description}</span>
                        </div>
                      )}
                      {targetingBits.length > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          {targetingBits.join(" · ")}
                        </div>
                      )}
                      {placements.length > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          Placements: {placements.join(", ")}
                        </div>
                      )}
                      {Array.isArray(a.creatives) && a.creatives.length > 0 && (
                        <div className="space-y-1 mt-1">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Criativos propostos ({a.creatives.length})
                          </div>
                          {a.creatives.slice(0, 4).map((cr: any, cri: number) => (
                            <div
                              key={cri}
                              className="rounded border border-border/60 bg-background/40 px-1.5 py-1"
                              title={[cr.angle, cr.primary_text_suggestion].filter(Boolean).join("\n\n")}
                            >
                              <div className="text-[10px]">
                                <span className="uppercase text-muted-foreground">{cr.type ?? "—"}</span>
                                {cr.cta_suggestion && (
                                  <span className="ml-1.5 text-muted-foreground">· CTA: {cr.cta_suggestion}</span>
                                )}
                              </div>
                              {cr.headline_suggestion && (
                                <div className="text-[10px] font-medium truncate">{cr.headline_suggestion}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Redesign-only: contagem de ads criados */}
                      {adsCount > 0 && !Array.isArray(a.creatives) && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {adsCount} ad(s) propostos
                        </div>
                      )}
                    </div>
                    );
                  })}
              </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Creative brief */}
      {brief && (brief.primary_message || brief.tone || brief.headline_suggestion) && (
        <Card className="p-3 text-xs space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Briefing criativo
          </div>
          {brief.primary_message && (
            <div>
              <span className="text-muted-foreground">Mensagem: </span>
              {brief.primary_message}
            </div>
          )}
          {brief.headline_suggestion && (
            <div>
              <span className="text-muted-foreground">Headline: </span>
              {brief.headline_suggestion}
            </div>
          )}
          {brief.tone && (
            <div>
              <span className="text-muted-foreground">Tom: </span>
              {brief.tone}
            </div>
          )}
        </Card>
      )}

      {/* Scaling rules */}
      {scaling.length > 0 && (
        <Card className="p-3 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
            Regras de escala ({scaling.length})
          </div>
          <ul className="list-disc pl-4 space-y-0.5">
            {scaling.slice(0, 5).map((r: any, i: number) => (
              <li key={i} className="text-muted-foreground">
                {r.trigger ?? r.condition ?? JSON.stringify(r).slice(0, 80)}
                {r.action ? ` → ${r.action}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Risks */}
      {risks.length > 0 && (
        <Card className="p-3 border-amber-500/30 bg-amber-500/5">
          <div className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold mb-1.5 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Riscos & avisos ({risks.length})
          </div>
          <ul className="space-y-1">
            {risks.slice(0, 6).map((r: any, i: number) => (
              <li key={i} className="text-[11px] text-amber-200/90 flex items-start gap-1.5">
                <span className="font-semibold uppercase text-[9px] mt-0.5">
                  [{r.severity ?? "info"}]
                </span>
                <span>{r.description ?? r.message ?? JSON.stringify(r)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
