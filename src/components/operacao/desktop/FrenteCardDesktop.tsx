import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Crown, AlertCircle, HardHat, ArrowRight, Settings } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useOperacaoMode } from "@/hooks/useOperacaoMode";
import { FrenteTypeBadge } from "@/components/operacao/FrenteTypeBadge";

export interface FrenteCardDesktopData {
  id: string;
  name: string;
  color: string | null;
  status: string;
  current_lead_id: string | null;
  event_id?: string | null;
  type?: string | null;
}

export interface TeamMember {
  profile_id: string;
  full_name: string | null;
  role_in_frente: "lead" | "auxiliary" | "observer" | string;
  profile_type?: "user" | "field_staff" | null;
}

export interface LastActivity {
  kind: string;
  text: string | null;
  created_at: string;
  author_name?: string | null;
}

interface Props {
  frente: FrenteCardDesktopData;
  counts: {
    etapas_pending: number; etapas_in_progress: number; etapas_done: number;
    chamados_open: number; chamados_in_progress: number;
  };
  lastActivity?: LastActivity | null;
  team?: TeamMember[];
  isLead?: boolean;
  canManage?: boolean;
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function FrenteCardDesktop({
  frente, counts, lastActivity, team = [], isLead, canManage,
}: Props) {
  const mode = useOperacaoMode(frente.event_id ?? undefined);
  const total = counts.etapas_pending + counts.etapas_in_progress + counts.etapas_done;
  const done = counts.etapas_done;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const chamadosOpen = counts.chamados_open + counts.chamados_in_progress;
  const showChamados = chamadosOpen > 0 || mode === "evento" || mode === "post";

  const lead = team.find((m) => m.role_in_frente === "lead");
  const aux = team.filter((m) => m.role_in_frente === "auxiliary").slice(0, 4);
  const otherObs = team.filter((m) => m.role_in_frente === "observer").length;

  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="h-1.5" style={{ backgroundColor: frente.color ?? "#6b7280" }} />
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h3 className="font-semibold text-lg leading-tight truncate">{frente.name}</h3>
            <FrenteTypeBadge type={frente.type} />
          </div>
          {isLead && (
            <Badge variant="default" className="gap-1 text-[10px] shrink-0">
              <Crown className="h-3 w-3" /> LEAD
            </Badge>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {total === 0 ? "Sem etapas" : `${done} de ${total} concluídas`}
            </span>
            {total > 0 && <span className="font-medium">{pct}%</span>}
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: frente.color ?? "hsl(var(--primary))" }}
            />
          </div>
          {(counts.etapas_in_progress > 0 || counts.etapas_pending > 0) && (
            <p className="text-[11px] text-muted-foreground">
              {counts.etapas_in_progress} em curso · {counts.etapas_pending} pendentes
            </p>
          )}
        </div>

        {lastActivity ? (
          <div className="text-xs text-muted-foreground border-t pt-2">
            <p className="truncate">{lastActivity.text ?? "Registo sem texto"}</p>
            <p className="text-[10px] mt-0.5">
              {lastActivity.author_name ?? "—"} ·{" "}
              {formatDistanceToNow(new Date(lastActivity.created_at), {
                addSuffix: true, locale: ptBR,
              })}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground border-t pt-2 italic">Sem atividade recente</p>
        )}

        <div className="flex items-center gap-1">
          {lead && (
            <span
              title={`Lead: ${lead.full_name}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium"
            >
              <Crown className="h-3 w-3" />
              {initials(lead.full_name)}
              {lead.profile_type === "field_staff" && <HardHat className="h-3 w-3" />}
            </span>
          )}
          {aux.map((m) => (
            <span
              key={m.profile_id}
              title={m.full_name ?? ""}
              className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px]"
            >
              {initials(m.full_name)}
              {m.profile_type === "field_staff" && <HardHat className="h-3 w-3" />}
            </span>
          ))}
          {otherObs > 0 && (
            <span className="text-[10px] text-muted-foreground">+{otherObs} observ.</span>
          )}
        </div>

        {showChamados && (
          <div
            className={
              "flex items-center gap-1.5 text-xs " +
              (chamadosOpen > 0
                ? "text-orange-600 dark:text-orange-400"
                : "text-muted-foreground")
            }
          >
            <AlertCircle className="h-3.5 w-3.5" />
            <span>
              {chamadosOpen} chamado{chamadosOpen === 1 ? "" : "s"} em curso
            </span>
          </div>
        )}

        <div className="flex gap-2 mt-auto pt-2 border-t">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link to={`/operacao/frente/${frente.id}`}>
              Abrir <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
          {canManage && (
            <Button asChild variant="default" size="sm">
              <Link to={`/operacao/frente/${frente.id}/manage`}>
                <Settings className="h-3 w-3 mr-1" /> Gerir
              </Link>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
