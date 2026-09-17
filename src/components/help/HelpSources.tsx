import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Fontes internas do Manual (D-ERP…, PROC-…, ficheiros de memória).
 *
 * São referências de trabalho, não conteúdo para a equipa: só aparecem a
 * admin / platform_admin, num bloco recolhido (fechado por omissão). Para todos
 * os outros perfis não são renderizadas.
 */
export default function HelpSources({
  sources,
  label = "Fontes",
  className,
}: {
  sources: string[];
  label?: string;
  className?: string;
}) {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  if (!isAdmin || !sources || sources.length === 0) return null;

  return (
    <div className={cn("border-t border-border pt-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        {label} ({sources.length})
      </button>
      {open && (
        <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">{sources.join(", ")}</p>
      )}
    </div>
  );
}
