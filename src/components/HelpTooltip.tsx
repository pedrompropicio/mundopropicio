import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HelpTooltipProps {
  text: string;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  size?: number;
}

export default function HelpTooltip({ text, className, side = "top", size = 15 }: HelpTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center rounded-full text-muted-foreground/60 hover:text-muted-foreground transition-colors focus:outline-none",
              className
            )}
            tabIndex={-1}
          >
            <HelpCircle className="shrink-0" style={{ width: size, height: size }} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-[280px] text-xs leading-relaxed"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
