import { useState } from "react";
import { cn } from "@/lib/utils";

/** Especificação na lista: no máximo 2 linhas; clicar expande/recolhe (Issue #343). */
export function SpecificationText({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.includes("\n") || text.length > 140;
  if (!long) return <p className={cn("text-xs text-muted-foreground", className)}>{text}</p>;
  return (
    <p
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      title={expanded ? "Mostrar menos" : "Mostrar mais"}
      onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setExpanded((v) => !v); }
      }}
      className={cn(
        "text-xs text-muted-foreground whitespace-pre-line cursor-pointer hover:text-foreground",
        !expanded && "line-clamp-2",
        className,
      )}
    >
      {text}
    </p>
  );
}
