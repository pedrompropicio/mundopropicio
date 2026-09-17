import { useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHasHelpPanel, useHelpPanel } from "@/contexts/HelpPanelContext";
import { useHelpAnchor } from "@/hooks/useHelpManual";

interface HelpTooltipProps {
  /** Texto fixo (comportamento original). Com `anchor`, serve de reserva. */
  text?: string;
  /**
   * Âncora do Manual de Orientação (ex.: "rateios.master"). O texto passa a vir
   * de `help_sections.tooltip` e aparece a ligação "Saber mais".
   */
  anchor?: string;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  size?: number;
}

export default function HelpTooltip({ text, anchor, className, side = "top", size = 15 }: HelpTooltipProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const { openHelp } = useHelpPanel();
  const hasPanel = useHasHelpPanel();

  // Só consulta a base depois de o utilizador mostrar interesse.
  const anchorQ = useHelpAnchor(anchor && open ? anchor : null);
  const missing = !!anchor && anchorQ.isSuccess && (!anchorQ.data || !anchorQ.data.tooltip);

  useEffect(() => {
    if (missing) {
      console.warn(`[HelpTooltip] âncora sem texto no manual: ${anchor}`);
    }
  }, [missing, anchor]);

  const body = anchor ? anchorQ.data?.tooltip ?? text ?? "" : text ?? "";
  const showSaberMais = !!anchor && hasPanel && !missing;

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

  const anchoredIconButton = (
    <button
      type="button"
      aria-label="Ajuda"
      aria-expanded={open}
      onFocus={() => setOpen(true)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setPinned(true);
        setOpen(true);
      }}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/60 hover:text-muted-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        className
      )}
    >
      <span className="text-[11px] font-semibold leading-none">?</span>
      <HelpCircle className="sr-only shrink-0" style={{ width: size, height: size }} />
    </button>
  );

  const saberMais = showSaberMais ? (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPinned(false);
        setOpen(false);
        openHelp({ anchor });
      }}
      className="mt-2 block text-[11px] font-semibold text-primary underline underline-offset-2 hover:no-underline"
    >
      Saber mais
    </button>
  ) : null;

  const content = (
    <>
      {body || (anchorQ.isLoading ? "A carregar…" : "")}
      {saberMais}
    </>
  );

  if (anchor && isMobile) {
    return (
      <Popover
        open={open}
        onOpenChange={(next) => {
          setPinned(false);
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          {anchoredIconButton}
        </PopoverTrigger>
        <PopoverContent
          side={side}
          className="max-w-[260px] p-3 text-xs leading-relaxed whitespace-normal break-words"
        >
          {content}
        </PopoverContent>
      </Popover>
    );
  }

  if (anchor) {
    return (
      <HoverCard
        open={open}
        onOpenChange={(next) => {
          if (!next && pinned) return;
          setOpen(next);
        }}
        openDelay={150}
        closeDelay={300}
      >
        <HoverCardTrigger asChild>{anchoredIconButton}</HoverCardTrigger>
        <HoverCardContent
          side={side}
          className="max-w-[280px] p-3 text-xs leading-relaxed whitespace-normal break-words"
          onEscapeKeyDown={() => {
            setPinned(false);
            setOpen(false);
          }}
          onPointerDownOutside={() => {
            setPinned(false);
            setOpen(false);
          }}
        >
          {content}
        </HoverCardContent>
      </HoverCard>
    );
  }

  if (isMobile) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{iconButton}</PopoverTrigger>
        <PopoverContent
          side={side}
          className="max-w-[260px] p-3 text-xs leading-relaxed whitespace-normal break-words"
        >
          {content}
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
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
