import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDashboardTableCtx } from "@/components/crm/dashboard/dashboard-table-context";

export function CampaignTableHeader() {
  const { columns } = useDashboardTableCtx();
  return (
    <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
      <tr>
        {/* coluna do chevron de drill-down */}
        <th className="py-2 px-1 w-6" />
        <th className="py-2 px-3 text-left font-medium">Campanha</th>
        <th className="py-2 px-3 text-left font-medium">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                ROAS
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              Avaliação por fase do funil — ROAS individual não é a meta principal. Meta = ROAS 8x blended por evento.
            </TooltipContent>
          </Tooltip>
        </th>
        <th className="py-2 px-3 text-left font-medium">Score</th>
        {columns.map((col) => (
          <th key={col.id} className="py-2 px-3 text-left font-medium whitespace-nowrap">
            {col.tooltip ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                    {col.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{col.tooltip}</TooltipContent>
              </Tooltip>
            ) : (
              col.label
            )}
          </th>
        ))}
        <th className="py-2 px-3 text-left font-medium">Verba/dia</th>
        <th className="py-2 px-3 text-left font-medium">Tend. 14d</th>
        <th className="py-2 px-3 text-left font-medium">Status</th>
      </tr>
    </thead>
  );
}
