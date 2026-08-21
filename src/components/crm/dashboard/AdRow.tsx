import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { aggregate } from "@/lib/crm/aggregate";
import { formatRoas, roasBadgeClass } from "@/lib/crm/dashboard-format";
import { MetricCells } from "@/components/crm/dashboard/MetricCells";
import { useDashboardTableCtx } from "@/components/crm/dashboard/dashboard-table-context";
import type { AdSnapshotRow, InsightRow } from "@/components/crm/dashboard/types";

/** Nível 3 do drill-down: anúncio. */
export function AdRow({
  snap,
  insights,
  name,
}: {
  snap: AdSnapshotRow | undefined;
  insights: InsightRow[];
  name: string;
}) {
  const { columns, currency } = useDashboardTableCtx();
  const agg = useMemo(() => aggregate(insights), [insights]);
  const eff = snap?.effective_status ?? snap?.status ?? null;
  const isPaused = eff === "PAUSED";

  return (
    <tr className={cn("border-b border-border/20 bg-muted/40", isPaused && "opacity-60")}>
      <td className="py-2 px-1" />
      <td className="py-2 px-3 max-w-[280px] text-xs">
        <div className="flex items-center gap-1.5 min-w-0 pl-10">
          <span className="text-[9px] uppercase text-muted-foreground shrink-0">anúncio</span>
          <span className="truncate">{name}</span>
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
      <td className="py-2 px-3 text-muted-foreground">—</td>
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
  );
}
