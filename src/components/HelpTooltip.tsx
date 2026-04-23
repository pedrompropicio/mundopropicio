import { useState } from "react";
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
  const [open, setOpen] = useState(false);

  const iconButton = (
    <button
      type="button"
      aria-label="Ajuda"
      aria-expanded={open}
      onMouseEnter={() => !isMobile && setOpen(true)}
      onMouseLeave={() => !isMobile && setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => !isMobile && setOpen(false)}
      onClick={() => setOpen((prev) => !prev)}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/60 hover:text-muted-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        className
      )}
    >
      <span className="text-[11px] font-semibold leading-none">?</span>
      <HelpCircle className="sr-only shrink-0" style={{ width: size, height: size }} />
    </button>
  );

  if (isMobile) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
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
      <Tooltip open={open} onOpenChange={setOpen}>
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
