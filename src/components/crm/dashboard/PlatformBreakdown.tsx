import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { aggregate, computeCpa, type Aggregate } from "@/lib/crm/aggregate";
import { formatCurrency, formatRoas, roasColorByEvent } from "@/lib/crm/dashboard-format";
import { PLATFORM_COLOR_VAR, PLATFORM_LABEL, platformOf, singleCurrency } from "@/lib/crm/platform";
import type { CampaignRow, InsightRow } from "@/components/crm/dashboard/types";

interface Block {
  key: "meta" | "google";
  campaigns: number;
  agg: Aggregate;
  currency: string | null;
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-mono tabular-nums", className)}>{value}</span>
    </div>
  );
}

/**
 * Fase 3B — três blocos por evento: Meta · Google · Consolidado.
 * Só consolida quando as duas plataformas estão na mesma moeda; nunca converte.
 */
export function PlatformBreakdown({
  campaigns,
  insightsByCampaign,
  fallbackCurrency,
}: {
  campaigns: CampaignRow[];
  insightsByCampaign: Map<string, InsightRow[]>;
  fallbackCurrency: string;
}) {
  const blocks = useMemo<Block[]>(() => {
    return (["meta", "google"] as const).map((key) => {
      const list = campaigns.filter((c) => platformOf(c) === key);
      const rows = list.flatMap((c) => insightsByCampaign.get(c.external_campaign_id) ?? []);
      return {
        key,
        campaigns: list.length,
        agg: aggregate(rows),
        currency: singleCurrency(rows, key === "meta" ? fallbackCurrency : null),
      };
    });
  }, [campaigns, insightsByCampaign, fallbackCurrency]);

  const withData = blocks.filter((b) => b.campaigns > 0);
  const currencies = new Set(withData.map((b) => b.currency ?? fallbackCurrency));
  const canConsolidate = withData.length > 0 && currencies.size === 1;
  const consolidatedCurrency = canConsolidate ? [...currencies][0] : null;
  const consolidated = useMemo(() => {
    const spendCents = withData.reduce((s, b) => s + b.agg.spendCents, 0);
    const revenueCents = withData.reduce((s, b) => s + b.agg.revenueCents, 0);
    const conversions = withData.reduce((s, b) => s + b.agg.conversions, 0);
    return {
      spendCents,
      revenueCents,
      conversions,
      roas: spendCents > 0 ? revenueCents / spendCents : null,
      cpa: conversions > 0 ? Math.round(spendCents / conversions) : null,
    };
  }, [withData]);

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {blocks.map((b) => {
        const cur = b.currency ?? fallbackCurrency;
        return (
          <div key={b.key} className="rounded-md border border-border/60 bg-muted/20 p-2.5 space-y-1">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: PLATFORM_COLOR_VAR[b.key] }}
              />
              <span className="text-xs font-semibold">{PLATFORM_LABEL[b.key]}</span>
            </div>
            {b.campaigns === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                sem campanhas {PLATFORM_LABEL[b.key]} ligadas a este evento
              </p>
            ) : (
              <>
                <Metric label="Investido" value={formatCurrency(b.agg.spendCents, cur)} />
                <Metric
                  label="Receita"
                  value={formatCurrency(b.agg.revenueCents, cur)}
                  className="text-emerald-500/90"
                />
                <Metric
                  label="ROAS"
                  value={formatRoas(b.agg.roas)}
                  className={cn("font-semibold", roasColorByEvent(b.agg.roas))}
                />
                <Metric label="CPA" value={formatCurrency(computeCpa(b.agg), cur)} />
              </>
            )}
          </div>
        );
      })}

      <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-1">
        <div className="text-xs font-semibold">Consolidado</div>
        {!canConsolidate ? (
          <p className="text-[11px] text-amber-500">
            Não é possível somar moedas diferentes ({[...currencies].join(" · ")}) — ver cada
            plataforma na sua moeda.
          </p>
        ) : (
          <>
            <Metric
              label="Investido"
              value={formatCurrency(consolidated.spendCents, consolidatedCurrency)}
            />
            <Metric
              label="Receita"
              value={formatCurrency(consolidated.revenueCents, consolidatedCurrency)}
              className="text-emerald-500/90"
            />
            <Metric
              label="ROAS"
              value={formatRoas(consolidated.roas)}
              className={cn("font-semibold", roasColorByEvent(consolidated.roas))}
            />
            <Metric
              label="Custo/conv."
              value={formatCurrency(consolidated.cpa, consolidatedCurrency)}
            />
          </>
        )}
      </div>
    </div>
  );
}
