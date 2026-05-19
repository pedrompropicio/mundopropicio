import { Badge } from "@/components/ui/badge";
import { OperacaoStatusBadge } from "@/components/operacao/OperacaoStatusBadge";
import { PriorityBadge } from "@/components/operacao/PriorityBadge";
import { ChevronRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

function formatRelative(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((d - now) / 60000);
  const abs = Math.abs(diffMin);
  const future = diffMin >= 0;
  let label: string;
  if (abs < 1) label = "agora";
  else if (abs < 60) label = `${abs} min`;
  else if (abs < 60 * 24) label = `${Math.round(abs / 60)}h`;
  else if (abs < 60 * 24 * 7) label = `${Math.round(abs / (60 * 24))}d`;
  else label = new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
  return future ? `daqui a ${label}` : `há ${label}`;
}

export interface ChamadoListRowData {
  id: string;
  text: string | null;
  priority: string | null;
  status: string;
  sla_due_at: string | null;
  escalation_level: number | null;
  acked_at: string | null;
  resolved_at: string | null;
  created_at: string;
  frente: {
    id: string;
    name: string;
    color: string | null;
    event?: { id: string; name: string } | null;
  } | null;
  etapa?: { id: string; name: string } | null;
  author?: { id: string; full_name: string | null } | null;
}

interface Props {
  chamado: ChamadoListRowData;
  showEventBadge?: boolean;
  onClick: () => void;
}

export function ChamadoListRow({ chamado, showEventBadge, onClick }: Props) {
  const isActive = chamado.status === "open" || chamado.status === "in_progress";
  const slaPassed =
    chamado.sla_due_at && new Date(chamado.sla_due_at).getTime() < Date.now();
  const breach = (chamado.escalation_level ?? 0) >= 2 || (isActive && slaPassed);
  const showSla = isActive && chamado.sla_due_at;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-stretch gap-3 p-3 hover:bg-muted/40 text-left cursor-pointer border-b last:border-b-0 transition-colors"
    >
      <div
        className="w-1.5 self-stretch rounded-full shrink-0"
        style={{ backgroundColor: chamado.frente?.color ?? "hsl(var(--muted-foreground))" }}
      />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <PriorityBadge priority={chamado.priority} />
          <p className="text-sm font-medium line-clamp-2 sm:line-clamp-1 min-w-0">
            {chamado.text?.trim() || <span className="italic text-muted-foreground">(sem descrição)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
          {showEventBadge && chamado.frente?.event && (
            <Badge variant="secondary" className="text-[10px] h-5">
              {chamado.frente.event.name}
            </Badge>
          )}
          {chamado.frente?.name && <span>{chamado.frente.name}</span>}
          {chamado.etapa?.name && <span>· {chamado.etapa.name}</span>}
          {chamado.author?.full_name && <span>· {chamado.author.full_name}</span>}
          <span>· {formatRelative(chamado.created_at)}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0 self-center">
        {showSla && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px]",
              breach ? "text-destructive font-bold" : "text-muted-foreground",
            )}
          >
            <Clock className="h-3 w-3" />
            SLA {formatRelative(chamado.sla_due_at)}
          </span>
        )}
        <OperacaoStatusBadge status={chamado.status} kind="chamado" />
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 self-center" />
    </button>
  );
}
