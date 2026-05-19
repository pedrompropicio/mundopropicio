import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, Camera, MessageSquare, Clipboard, Activity, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useOperacaoMode } from "@/hooks/useOperacaoMode";
import { FrenteTypeBadge } from "./FrenteTypeBadge";

export interface FrenteCardData {
  id: string;
  name: string;
  color: string | null;
  status: string;
  current_lead_id: string | null;
  event_id?: string | null;
  type?: string | null;
}

export interface LastActivity {
  kind: string;
  text: string | null;
  created_at: string;
  author_name?: string | null;
}

interface Props {
  frente: FrenteCardData;
  counts: {
    etapas_pending: number; etapas_in_progress: number; etapas_done: number;
    chamados_open: number; chamados_in_progress: number;
  };
  lastActivity?: LastActivity | null;
  isLead?: boolean;
}

const KIND_ICON: Record<string, any> = {
  evolucao: Activity,
  observacao: MessageSquare,
  punch: Clipboard,
};

export function FrenteCard({ frente, counts, lastActivity, isLead }: Props) {
  const mode = useOperacaoMode(frente.event_id ?? undefined);
  const total = counts.etapas_pending + counts.etapas_in_progress + counts.etapas_done;
  const done = counts.etapas_done;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const chamadosOpen = counts.chamados_open + counts.chamados_in_progress;

  // Modo planning/montagem: só mostra chamados se houver não-resolvidos
  // Modo evento/post: sempre mostra contagem
  const showChamados =
    chamadosOpen > 0 && (mode === "evento" || mode === "post" || chamadosOpen > 0);

  const ActivityIcon = lastActivity ? (KIND_ICON[lastActivity.kind] ?? Camera) : null;

  return (
    <Link to={`/operacao/frente/${frente.id}`}>
      <Card className="p-4 active:scale-[0.98] transition-transform hover:bg-accent/50">
        <div className="flex items-start gap-3">
          <div
            className="h-12 w-2 rounded-full shrink-0"
            style={{ backgroundColor: frente.color ?? "#6b7280" }}
          />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold truncate">{frente.name}</h3>
              <FrenteTypeBadge type={frente.type} />
              {isLead && (
                <Badge variant="default" className="gap-1 h-5 text-[10px]">
                  <Crown className="h-3 w-3" /> PRODUTOR
                </Badge>
              )}
            </div>

            {/* Progresso de etapas */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {total === 0 ? "Sem etapas" : `${done} de ${total} concluídas`}
                </span>
                {total > 0 && <span className="text-muted-foreground">{progressPct}%</span>}
              </div>
              {total > 0 && (
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
                </div>
              )}
              {counts.etapas_in_progress > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {counts.etapas_in_progress} em curso · {counts.etapas_pending} pendentes
                </p>
              )}
            </div>

            {/* Última atividade */}
            {lastActivity && ActivityIcon && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border-t pt-1.5">
                <ActivityIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {lastActivity.text ?? "Registo sem texto"}
                </span>
                <span className="shrink-0">
                  · {formatDistanceToNow(new Date(lastActivity.created_at), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            )}

            {/* Chamados — só se houver e/ou em modo evento/post */}
            {showChamados && (
              <div className="flex items-center gap-1.5 text-[11px] text-orange-600 dark:text-orange-400">
                <AlertCircle className="h-3 w-3" />
                <span>{chamadosOpen} chamado{chamadosOpen === 1 ? "" : "s"} em curso</span>
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
