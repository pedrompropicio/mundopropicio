import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface HelpTooltipProps {
  text: string;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  size?: number;
}

export default function HelpTooltip({ text, className, side = "top", size = 15 }: HelpTooltipProps) {
  const isMobile = useIsMobile();

  const iconButton = (
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
  );

  if (isMobile) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          {iconButton}
        </PopoverTrigger>
        <PopoverContent
          side={side}
          className="max-w-[260px] p-3 text-xs leading-relaxed whitespace-normal break-words"
        >
          {text}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {iconButton}
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-[280px] text-xs leading-relaxed whitespace-normal break-words"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
