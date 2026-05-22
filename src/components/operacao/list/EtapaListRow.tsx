import { Badge } from "@/components/ui/badge";
import { OperacaoStatusBadge } from "@/components/operacao/OperacaoStatusBadge";
import { ChevronRight } from "lucide-react";
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

function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export interface EtapaListRowData {
  id: string;
  name: string;
  status: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  has_no_date: boolean | null;
  frente: {
    id: string;
    name: string;
    color: string | null;
    type: string | null;
    event?: { id: string; name: string } | null;
  } | null;
  responsible: { id: string; full_name: string | null } | null;
  supplier: { id: string; name: string | null } | null;
}

interface Props {
  etapa: EtapaListRowData;
  showEventBadge?: boolean;
  showFrenteBadge?: boolean;
  onClick: () => void;
}

export function EtapaListRow({ etapa, showEventBadge, showFrenteBadge = true, onClick }: Props) {
  const now = Date.now();
  const isLate =
    etapa.status !== "done" &&
    etapa.status !== "cancelled" &&
    etapa.planned_end &&
    new Date(etapa.planned_end).getTime() < now;

  const dateIso =
    etapa.status === "done" || etapa.status === "cancelled"
      ? etapa.actual_end ?? etapa.planned_end
      : etapa.planned_end ?? etapa.planned_start;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-stretch gap-3 p-3 hover:bg-muted/40 text-left cursor-pointer border-b last:border-b-0 transition-colors"
    >
      <div
        className="w-1.5 self-stretch rounded-full shrink-0"
        style={{ backgroundColor: etapa.frente?.color ?? "hsl(var(--muted-foreground))" }}
      />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn("text-sm font-semibold truncate", isLate && "text-destructive")}>
            {etapa.name}
          </p>
          {showEventBadge && etapa.frente?.event && (
            <Badge variant="secondary" className="text-[10px] h-5">
              {etapa.frente.event.name}
            </Badge>
          )}
          {showFrenteBadge && etapa.frente?.name && (
            <Badge variant="outline" className="text-[10px] h-5">
              {etapa.frente.name}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
          {etapa.responsible?.full_name ? (
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-foreground">
                {initials(etapa.responsible.full_name)}
              </span>
              {etapa.responsible.full_name}
            </span>
          ) : (
            <span className="italic">Sem responsável</span>
          )}
          {etapa.supplier?.name && <span>· {etapa.supplier.name}</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0 self-center">
        {dateIso && (
          <span
            className={cn(
              "text-[11px]",
              isLate ? "text-destructive font-medium" : "text-muted-foreground",
            )}
          >
            {formatRelative(dateIso)}
          </span>
        )}
        <OperacaoStatusBadge status={etapa.status} />
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 self-center" />
    </button>
  );
}
