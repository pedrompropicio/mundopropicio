import { useState, useMemo } from "react";
import { useActiveBPVersion } from "@/hooks/useBPVersions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Snowflake, GitBranch, History, Layers, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { FreezeBPVersionModal } from "./FreezeBPVersionModal";

interface Props {
  eventId: string;
  isMaster: boolean;
  isSplit: boolean;
  canManage: boolean; // admin or manager
}

export function BPVersionCard({ eventId, isMaster, isSplit, canManage }: Props) {
  const { activeVersion, versions, isLoading } = useActiveBPVersion(eventId);
  const [freezeOpen, setFreezeOpen] = useState(false);

  const scenarios = useMemo(
    () => (versions ?? []).filter((v) => v.scenario_label && v.state === "draft"),
    [versions]
  );
  const pinnedScenarios = scenarios.filter((s) => s.is_pinned_scenario);

  if (isLoading) {
    return (
      <div className="glass rounded-xl px-4 py-3 animate-pulse">
        <div className="h-4 w-40 bg-muted rounded mb-2" />
        <div className="h-3 w-64 bg-muted/60 rounded" />
      </div>
    );
  }

  if (!activeVersion) {
    return (
      <div className="glass rounded-xl px-4 py-3 flex items-center justify-between gap-3 border-warning/30">
        <div className="flex items-center gap-3">
          <GitBranch className="h-5 w-5 text-warning shrink-0" />
          <div>
            <p className="text-sm font-medium">Sem versão ativa do BP</p>
            <p className="text-xs text-muted-foreground">
              {isSplit
                ? "Os Splits recebem versões via cascade do Master."
                : "Será criada automaticamente quando o evento entrar em Confirmado/Ativo."}
            </p>
          </div>
        </div>
        {canManage && !isSplit && (
          <Button size="sm" onClick={() => setFreezeOpen(true)}>
            <Snowflake className="h-4 w-4 mr-1.5" />
            Congelar v1
          </Button>
        )}
        {!isSplit && (
          <FreezeBPVersionModal
            open={freezeOpen}
            onOpenChange={setFreezeOpen}
            eventId={eventId}
            isMaster={isMaster}
          />
        )}
      </div>
    );
  }

  const author = activeVersion.created_by_label ?? "—";
  const approvedAt = activeVersion.approved_at ?? activeVersion.created_at;
  const dateLabel = format(new Date(approvedAt), "d MMM yyyy", { locale: pt });

  return (
    <div className="glass rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-primary/20">
      <div className="flex items-center gap-3 min-w-0">
        <div className="rounded-full bg-primary/10 p-2 shrink-0">
          <GitBranch className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">v{activeVersion.version_number}</p>
            <Badge variant="default" className="text-[10px] uppercase tracking-wider">Ativa</Badge>
            {isSplit && activeVersion.cascaded_from_version_id && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Layers className="h-2.5 w-2.5" />
                Do Master
              </Badge>
            )}
            {pinnedScenarios.length > 0 && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                {pinnedScenarios.length} cenário{pinnedScenarios.length > 1 ? "s" : ""} fixado{pinnedScenarios.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            Aprovada {dateLabel} por {author}
            {activeVersion.description ? ` · ${activeVersion.description}` : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button variant="ghost" size="sm" disabled title="Disponível na próxima fase (timeline)">
          <History className="h-4 w-4 mr-1.5" />
          Histórico
        </Button>
        {canManage && !isSplit && (
          <Button size="sm" onClick={() => setFreezeOpen(true)}>
            <Snowflake className="h-4 w-4 mr-1.5" />
            Congelar nova versão
          </Button>
        )}
      </div>

      {!isSplit && (
        <FreezeBPVersionModal
          open={freezeOpen}
          onOpenChange={setFreezeOpen}
          eventId={eventId}
          isMaster={isMaster}
        />
      )}
    </div>
  );
}
