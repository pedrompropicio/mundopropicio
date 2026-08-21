import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { aggregate } from "@/lib/crm/aggregate";
import { useAdsQuery } from "@/lib/crm/dashboard-queries";
import { formatCurrency, formatRoas, roasBadgeClass } from "@/lib/crm/dashboard-format";
import { AdRow } from "@/components/crm/dashboard/AdRow";
import { MetricCells } from "@/components/crm/dashboard/MetricCells";
import { useDashboardTableCtx } from "@/components/crm/dashboard/dashboard-table-context";
import type { AdsetSnapshotRow, InsightRow } from "@/components/crm/dashboard/types";

/** "7d clique · 1d visualização" a partir de attribution_spec. */
function formatAttribution(spec: AdsetSnapshotRow["attribution_spec"]): string | null {
  if (!Array.isArray(spec) || spec.length === 0) return null;
  const label = (t?: string) =>
    t === "CLICK_THROUGH" ? "clique" : t === "VIEW_THROUGH" ? "visualização" : (t ?? "").toLowerCase();
  const parts = spec
    .filter((s) => s?.window_days != null)
    .map((s) => `${s.window_days}d ${label(s.event_type)}`);
  return parts.length ? parts.join(" · ") : null;
}

/** Nível 2 do drill-down: conjunto (adset). Expande para anúncios (lazy). */
export function AdsetRow({
  snap,
  insights,
  name,
  externalAdsetId,
  colSpanTotal,
}: {
  snap: AdsetSnapshotRow | undefined;
  insights: InsightRow[];
  name: string;
  externalAdsetId: string;
  colSpanTotal: number;
}) {
  const { columns, currency, companyId, adAccountId, from, to } = useDashboardTableCtx();
  const [expanded, setExpanded] = useState(false);
  const agg = useMemo(() => aggregate(insights), [insights]);

  const { data, isLoading } = useAdsQuery({
    companyId,
    adAccountId,
    externalAdsetId,
    from,
    to,
    enabled: expanded,
  });

  const adGroups = useMemo(() => {
    const byId = new Map<string, InsightRow[]>();
    for (const r of data?.insights ?? []) {
      const id = r.external_ad_id ?? "";
      if (!id) continue;
      const arr = byId.get(id) ?? [];
      arr.push(r);
      byId.set(id, arr);
    }
    const snapById = new Map((data?.snapshots ?? []).map((s) => [s.external_ad_id, s]));
    // Inclui anúncios sem insights no período (ficam a zero).
    for (const s of data?.snapshots ?? []) if (!byId.has(s.external_ad_id)) byId.set(s.external_ad_id, []);
    return [...byId.entries()]
      .map(([id, rows]) => ({
        id,
        rows,
        snap: snapById.get(id),
        name: snapById.get(id)?.name ?? rows[0]?.ad_name ?? id,
      }))
      .sort((a, b) => aggregate(b.rows).spendCents - aggregate(a.rows).spendCents);
  }, [data]);

  const eff = snap?.effective_status ?? snap?.status ?? null;
  const isPaused = eff === "PAUSED";
  const learning = snap?.learning_stage_info ?? null;
  const attribution = formatAttribution(snap?.attribution_spec ?? null);
  const budget = snap?.daily_budget_cents ?? null;

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/30 bg-muted/20 hover:bg-muted/50 transition-colors cursor-pointer",
          isPaused && "opacity-60",
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2 px-1 align-middle">
          <span className="inline-flex pl-5 text-muted-foreground">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        </td>
        <td className="py-2 px-3 max-w-[280px] text-xs">
          <div className="flex flex-col gap-1 min-w-0 pl-5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[9px] uppercase text-muted-foreground shrink-0">conjunto</span>
              <span className="truncate font-medium">{name}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {learning?.status === "LEARNING" && (
                <Badge
                  variant="outline"
                  className="text-[9px] uppercase px-1.5 py-0 bg-amber-500/15 text-amber-500 border-amber-500/30"
                >
                  aprendizagem · {learning.conversions ?? 0}/50
                </Badge>
              )}
              {learning?.status === "SUCCESS" && (
                <Badge
                  variant="outline"
                  className="text-[9px] uppercase px-1.5 py-0 bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                >
                  saiu da aprendizagem
                </Badge>
              )}
              {attribution && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] text-muted-foreground cursor-help">{attribution}</span>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Janela de atribuição do conjunto</TooltipContent>
                </Tooltip>
              )}
              {snap?.optimization_goal && (
                <span className="text-[10px] text-muted-foreground">{snap.optimization_goal}</span>
              )}
            </div>
          </div>
        </td>
        <td className="py-2 px-3">
          <span
            className={cn(
              "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-mono font-semibold",
              roasBadgeClass(agg.roas),
            )}
          >
            {formatRoas(agg.roas)}
          </span>
        </td>
        <td className="py-2 px-3 text-muted-foreground">—</td>
        <MetricCells columns={columns} agg={agg} rows={insights} currency={currency} muted />
        <td className="py-2 px-3 text-sm font-mono tabular-nums text-muted-foreground">
          {budget ? formatCurrency(budget, currency) : "—"}
        </td>
        <td className="py-2 px-3 text-muted-foreground">—</td>
        <td className="py-2 px-3">
          {eff && (
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] uppercase px-1.5 py-0",
                eff === "ACTIVE"
                  ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                  : "bg-muted text-muted-foreground border-muted-foreground/30",
              )}
            >
              {eff}
            </Badge>
          )}
        </td>
      </tr>

      {expanded && isLoading && (
        <tr className="bg-muted/40 border-b border-border/20">
          <td colSpan={colSpanTotal} className="py-2 px-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 pl-14">
              <Loader2 className="h-3 w-3 animate-spin" /> a carregar anúncios…
            </span>
          </td>
        </tr>
      )}
      {expanded && !isLoading && adGroups.length === 0 && (
        <tr className="bg-muted/40 border-b border-border/20">
          <td colSpan={colSpanTotal} className="py-2 px-3 text-xs text-muted-foreground pl-14">
            Sem anúncios neste conjunto.
          </td>
        </tr>
      )}
      {expanded &&
        adGroups.map((a) => (
          <AdRow key={a.id} snap={a.snap} insights={a.rows} name={a.name} />
        ))}
    </>
  );
}
