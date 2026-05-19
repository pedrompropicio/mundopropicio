import { Badge } from "@/components/ui/badge";

const ETAPA_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "outline" },
  in_progress: { label: "Em curso", variant: "default" },
  blocked: { label: "Bloqueada", variant: "destructive" },
  done: { label: "Concluída", variant: "secondary" },
  cancelled: { label: "Cancelada", variant: "outline" },
};

const CHAMADO_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "Aberto", variant: "destructive" },
  in_progress: { label: "Em curso", variant: "default" },
  resolved: { label: "Resolvido", variant: "secondary" },
  closed: { label: "Fechado", variant: "outline" },
};

export function OperacaoStatusBadge({
  status,
  kind = "etapa",
}: {
  status: string | null | undefined;
  kind?: "etapa" | "chamado";
}) {
  const map = kind === "chamado" ? CHAMADO_LABEL : ETAPA_LABEL;
  const s = map[status ?? ""] ?? { label: status ?? "—", variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
