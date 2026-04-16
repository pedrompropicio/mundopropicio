import { Building } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  className?: string;
}

export function LocalReinforcementBadge({ className = "" }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase bg-blue-500/15 text-blue-400 ${className}`}>
          <Building className="h-2.5 w-2.5" />
          Reforço local
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-52">
        Despesa exclusiva deste sub-evento, não vinculada ao rateio Master
      </TooltipContent>
    </Tooltip>
  );
}
