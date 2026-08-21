import { ArrowDown, ArrowUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDashboardTableCtx } from "@/components/crm/dashboard/dashboard-table-context";
import type { SortKey } from "@/lib/crm/table-sort";

/** Cabeçalho clicável de uma coluna numérica (desc → asc → sem ordenação). */
function SortableTh({
  sortKey,
  label,
  tooltip,
}: {
  sortKey: SortKey;
  label: string;
  tooltip?: string;
}) {
  const { sort, onSort } = useDashboardTableCtx();
  const active = sort.key === sortKey;
  const inner = (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        tooltip &&
          "underline decoration-dotted decoration-muted-foreground/40 underline-offset-2",
      )}
    >
      {label}
      {active ? (
        sort.dir === "desc" ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUp className="h-3 w-3" />
        )
      ) : null}
    </span>
  );
  return (
    <th
      className={cn(
        "py-2 px-3 text-left font-medium whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors",
        active && "text-foreground",
      )}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      onClick={(e) => {
        e.stopPropagation();
        onSort(sortKey);
      }}
    >
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{inner}</TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        inner
      )}
    </th>
  );
}

export function CampaignTableHeader() {
  const { columns } = useDashboardTableCtx();
  return (
    <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
      <tr>
        {/* coluna do chevron de drill-down */}
        <th className="py-2 px-1 w-6" />
        <th className="py-2 px-3 text-left font-medium">Campanha</th>
        <SortableTh
          sortKey="roas"
          label="ROAS"
          tooltip="Avaliação por fase do funil — ROAS individual não é a meta principal. Meta = ROAS 8x blended por evento. Clica para ordenar."
        />
        <th className="py-2 px-3 text-left font-medium">Score</th>
        {columns.map((col) => (
          <SortableTh key={col.id} sortKey={col.id} label={col.label} tooltip={col.tooltip} />
        ))}
        <SortableTh sortKey="budgetPerDay" label="Verba/dia" />
        <th className="py-2 px-3 text-left font-medium">Tend. 14d</th>
        <th className="py-2 px-3 text-left font-medium">Status</th>
      </tr>
    </thead>
  );
}
