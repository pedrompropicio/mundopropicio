import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Bell, Pencil, ExternalLink } from "lucide-react";
import { frenteLabel } from "@/lib/operacao-labels";
import { cn } from "@/lib/utils";

export interface ZonaCardData {
  id: string;
  name: string;
  type: string | null;
  color: string | null;
  status: string;
  event?: { id: string; name: string; date?: string | null } | null;
  lead?: { id: string; full_name: string | null } | null;
  current_lead_id?: string | null;
  leads?: { profile_id: string; full_name: string | null }[];
  counts: {
    total: number;
    pending: number;
    in_progress: number;
    blocked: number;
    done: number;
    cancelled: number;
    chamados_open: number;
  };
}

interface Props {
  zona: ZonaCardData;
  showEventBadge?: boolean;
  onClick: () => void;
  onEdit?: () => void;
  canEdit?: boolean;
}

function StatPill({
  label,
  value,
  toneClass,
}: {
  label: string;
  value: number;
  toneClass: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        toneClass,
      )}
      title={`${value} ${label}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {value}
    </span>
  );
}

export function ZonaCard({ zona, showEventBadge, onClick, onEdit, canEdit }: Props) {
  const c = zona.counts;
  const color = zona.color ?? "hsl(var(--muted-foreground))";

  return (
    <Card className="relative overflow-hidden group hover:bg-muted/40 transition-colors">
      <div className="h-1.5 w-full" style={{ backgroundColor: color }} />

      <div className="absolute top-2 right-2 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {canEdit && onEdit && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onClick}>
              <ExternalLink className="h-3.5 w-3.5 mr-2" /> Ver detalhes
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <button
        type="button"
        onClick={onClick}
        className="w-full text-left p-4 pt-3 pr-10 space-y-2 cursor-pointer"
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[10px] h-5">
            {frenteLabel(zona.type ?? undefined)}
          </Badge>
          {showEventBadge && zona.event && (
            <Badge variant="secondary" className="text-[10px] h-5">
              {zona.event.name}
            </Badge>
          )}
          {zona.status === "completed" && (
            <Badge className="text-[10px] h-5 bg-green-500/15 text-green-600 border-green-500/30">
              Concluída
            </Badge>
          )}
          {zona.status === "cancelled" && (
            <Badge variant="outline" className="text-[10px] h-5 opacity-60">
              Cancelada
            </Badge>
          )}
        </div>

        <h3 className="text-base font-semibold truncate">{zona.name}</h3>

        {(() => {
          const leads = zona.leads ?? (zona.lead ? [{ profile_id: zona.lead.id, full_name: zona.lead.full_name }] : []);
          if (leads.length === 0) {
            return <p className="text-xs text-muted-foreground italic">Sem produtor</p>;
          }
          if (leads.length === 1) {
            return (
              <p className="text-xs text-muted-foreground truncate">
                <span className="text-muted-foreground/70">Produtor: </span>
                {leads[0].full_name ?? "—"}
              </p>
            );
          }
          return (
            <div className="flex items-center gap-2">
              <FrenteLeadsAvatars leads={leads} currentLeadId={zona.current_lead_id ?? zona.lead?.id ?? null} max={3} size="xs" />
              <span className="text-xs text-muted-foreground">{leads.length} produtores</span>
            </div>
          );
        })()}

        <div className="pt-1 space-y-1.5">
          <p className="text-[11px] text-muted-foreground">
            {c.total} {c.total === 1 ? "etapa" : "etapas"}
          </p>
          {c.total > 0 && (
            <div className="flex flex-wrap gap-1">
              {c.pending > 0 && (
                <StatPill
                  label="pendentes"
                  value={c.pending}
                  toneClass="bg-muted text-muted-foreground"
                />
              )}
              {c.in_progress > 0 && (
                <StatPill
                  label="em curso"
                  value={c.in_progress}
                  toneClass="bg-blue-500/15 text-blue-600"
                />
              )}
              {c.blocked > 0 && (
                <StatPill
                  label="bloqueadas"
                  value={c.blocked}
                  toneClass="bg-amber-500/15 text-amber-700 dark:text-amber-400"
                />
              )}
              {c.done > 0 && (
                <StatPill
                  label="concluídas"
                  value={c.done}
                  toneClass="bg-green-500/15 text-green-600"
                />
              )}
            </div>
          )}
          {c.chamados_open > 0 && (
            <div className="inline-flex items-center gap-1 rounded-md bg-destructive/10 text-destructive px-2 py-1 text-[11px] font-medium">
              <Bell className="h-3 w-3" />
              {c.chamados_open} {c.chamados_open === 1 ? "chamado aberto" : "chamados abertos"}
            </div>
          )}
        </div>
      </button>
    </Card>
  );
}
