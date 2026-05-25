import { cn } from "@/lib/utils";

const ETAPA_STYLE: Record<string, { label: string; className: string }> = {
  pending:     { label: "Pendente",   className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/40" },
  in_progress: { label: "Em curso",   className: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
  blocked:     { label: "Bloqueada",  className: "bg-red-500/15 text-red-400 border-red-500/40" },
  done:        { label: "Concluída",  className: "bg-green-500/15 text-green-500 border-green-500/40" },
  cancelled:   { label: "Cancelada",  className: "bg-muted text-muted-foreground border-border" },
};

const CHAMADO_STYLE: Record<string, { label: string; className: string }> = {
  open:        { label: "Aberto",     className: "bg-red-500/15 text-red-400 border-red-500/40" },
  in_progress: { label: "Em curso",   className: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
  resolved:    { label: "Resolvido",  className: "bg-green-500/15 text-green-500 border-green-500/40" },
  closed:      { label: "Fechado",    className: "bg-muted text-muted-foreground border-border" },
};

export function OperacaoStatusBadge({
  status,
  kind = "etapa",
}: {
  status: string | null | undefined;
  kind?: "etapa" | "chamado";
}) {
  const map = kind === "chamado" ? CHAMADO_STYLE : ETAPA_STYLE;
  const s = map[status ?? ""] ?? { label: status ?? "—", className: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", s.className)}>
      {s.label}
    </span>
  );
}
