import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function CampaignTableHeader() {
  return (
    <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
      <tr>
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
        <th className="py-2 px-3 text-left font-medium">Gasto</th>
        <th className="py-2 px-3 text-left font-medium">Receita</th>
        <th className="py-2 px-3 text-left font-medium">CPC</th>
        <th className="py-2 px-3 text-left font-medium">Impr.</th>
        <th className="py-2 px-3 text-left font-medium">Conv.</th>
        <th className="py-2 px-3 text-left font-medium">Verba/dia</th>
        <th className="py-2 px-3 text-left font-medium">Tend. 14d</th>
        <th className="py-2 px-3 text-left font-medium">Status</th>
      </tr>
    </thead>
  );
}
