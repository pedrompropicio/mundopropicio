import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  computeCpa,
  computeCpcAvg,
  computeCpm,
  computeCpp,
  computeCtrAvg,
  computeFreqAvg,
  computeHookRate,
  computeRetention75,
  computeThumbstop,
  computeTicket,
  computeUniqueCtr,
  type Aggregate,
} from "@/lib/crm/aggregate";

import { formatCompact, formatCurrency } from "@/lib/crm/dashboard-format";
import type { MetricColumnDef } from "@/lib/crm/columns";
import type { InsightRow } from "@/components/crm/dashboard/types";

function pct(v: number | null): string {
  return v != null && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "—";
}

/**
 * Células de métricas partilhadas pelos 3 níveis (campanha / conjunto / anúncio).
 * Usa sempre as funções de src/lib/crm/aggregate.ts — nunca recalcula ROAS/CPC à mão.
 */
export function MetricCells({
  columns,
  agg,
  rows,
  currency,
  muted,
}: {
  columns: MetricColumnDef[];
  agg: Aggregate;
  rows: InsightRow[];
  currency: string;
  /** Nível inferior: números em tom mais discreto. */
  muted?: boolean;
}) {
  const cpc = computeCpcAvg(agg);
  const ctr = computeCtrAvg(agg);
  const cpm = computeCpm(agg);
  const cpp = computeCpp(agg);
  const cpa = computeCpa(agg);
  const ticket = computeTicket(agg);
  const uCtr = computeUniqueCtr(agg);
  const freq = computeFreqAvg(rows);
  const hook = computeHookRate(agg);
  const thumb = computeThumbstop(agg);
  const ret75 = computeRetention75(agg);


  const base = `py-2.5 px-3 text-sm font-mono tabular-nums${muted ? " text-muted-foreground" : ""}`;

  const render = (id: MetricColumnDef["id"]) => {
    switch (id) {
      case "spend":
        return <span className={muted ? "" : "text-foreground"}>{formatCurrency(agg.spendCents, currency)}</span>;
      case "revenue":
        return (
          <span className={muted ? "" : "text-emerald-500/90"}>
            {agg.revenueCents > 0 ? formatCurrency(agg.revenueCents, currency) : "—"}
          </span>
        );
      case "conversions":
        return <>{agg.conversions > 0 ? agg.conversions : "—"}</>;
      case "cpa":
        return <>{formatCurrency(cpa, currency)}</>;
      case "ticket":
        return <>{formatCurrency(ticket, currency)}</>;
      case "cpc":
        return <>{formatCurrency(cpc, currency)}</>;
      case "ctr":
        return <>{pct(ctr)}</>;
      case "cpm":
        return <>{formatCurrency(cpm, currency)}</>;
      case "freq":
        return <>{freq != null ? freq.toFixed(2) : "—"}</>;
      case "reach":
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                {agg.hasReach ? formatCompact(agg.reachSum) : "—"}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              Soma do alcance diário — não deduplicado. A mesma pessoa pode ser contada em vários dias
              ou linhas.
            </TooltipContent>
          </Tooltip>
        );
      case "impressions":
        return <>{formatCompact(agg.impressions)}</>;
      case "cpp":
        return <>{formatCurrency(cpp, currency)}</>;
      case "uniqueClicks":
        return <>{agg.hasUniqueClicks ? formatCompact(agg.uniqueClicks) : "—"}</>;
      case "uniqueCtr":
        return <>{pct(uCtr)}</>;
      case "viewContent":
        return <>{agg.hasViewContent && agg.viewContent > 0 ? formatCompact(agg.viewContent) : "—"}</>;
      case "addToCart":
        return <>{agg.hasAddToCart && agg.addToCart > 0 ? formatCompact(agg.addToCart) : "—"}</>;
      case "initiateCheckout":
        return (
          <>{agg.hasInitiateCheckout && agg.initiateCheckout > 0 ? formatCompact(agg.initiateCheckout) : "—"}</>
        );
      case "hookRate":
        return <>{pct(hook)}</>;
      case "thumbstop":
        return <>{pct(thumb)}</>;
      case "retention75":
        return <>{pct(ret75)}</>;

      default:
        return <>—</>;
    }
  };

  return (
    <>
      {columns.map((col) => (
        <td key={col.id} className={base}>
          {render(col.id)}
        </td>
      ))}
    </>
  );
}
