import { useState, useMemo } from "react";
import { useActiveBPVersion } from "@/hooks/useBPVersions";
import { useActiveVersionDiff } from "@/hooks/useActiveVersionDiff";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Snowflake, GitBranch, History, Layers, Sparkles, GitCompare, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import HelpTooltip from "@/components/HelpTooltip";
import { FreezeBPVersionModal } from "./FreezeBPVersionModal";
import { BPVersionsHistoryModal } from "./BPVersionsHistoryModal";
import { BPVersionsCompareModal } from "./BPVersionsCompareModal";
import { NewScenarioDraftModal } from "./NewScenarioDraftModal";
import { ScenarioDraftsList } from "./ScenarioDraftsList";
import { ActiveVersionDiffModal } from "./ActiveVersionDiffModal";

interface Props {
  eventId: string;
  eventName?: string;
  isMaster: boolean;
  isSplit: boolean;
  canManage: boolean; // admin or manager
}

export function BPVersionCard({ eventId, eventName, isMaster, isSplit, canManage }: Props) {
  const { activeVersion, versions, isLoading } = useActiveBPVersion(eventId);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [newScenarioOpen, setNewScenarioOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const { data: diff } = useActiveVersionDiff(eventId);
  const pendingChanges = diff?.totalChanges ?? 0;

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
      <div className="glass rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-warning/30">
        <div className="flex items-center gap-3 min-w-0">
          <GitBranch className="h-5 w-5 text-warning shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Sem versão ativa do BP</p>
            <p className="text-xs text-muted-foreground">
              {isSplit
                ? "Os Splits recebem versões via cascade do Master."
                : "Será criada automaticamente quando o evento entrar em Confirmado/Ativo."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {versions.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)} className="shrink-0">
              <History className="h-4 w-4 mr-1.5" />
              Histórico ({versions.length})
            </Button>
          )}
          {canManage && !isSplit && (
            <div className="flex items-center shrink-0">

              <Button size="sm" onClick={() => setFreezeOpen(true)}>
                <Snowflake className="h-4 w-4 mr-1.5" />
                Congelar v1
              </Button>
              <HelpTooltip
                size={13}
                text="Cria a primeira versão imutável do BP deste evento. Passa a ser a Versão Ativa de produção."
              />
            </div>
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
        <BPVersionsHistoryModal
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          eventId={eventId}
          isSplit={isSplit}
          canManage={canManage}
        />
      </div>
    );
  }

  const author = activeVersion.created_by_label ?? "—";
  const approvedAt = activeVersion.approved_at ?? activeVersion.created_at;
  const dateLabel = format(new Date(approvedAt), "d MMM yyyy", { locale: pt });

  return (
    <div className="space-y-2">
    {pendingChanges > 0 && (
      <div className="glass rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-warning/40 bg-warning/5">
        <div className="flex items-center gap-2.5 min-w-0">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {pendingChanges} alteração{pendingChanges > 1 ? "ões" : ""} pendente{pendingChanges > 1 ? "s" : ""} desde v{diff?.versionNumber}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Edições feitas após o último congelamento. Considera congelar uma nova versão.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setDiffOpen(true)}>
            <GitCompare className="h-4 w-4 mr-1.5" />
            Ver alterações
          </Button>
          <HelpTooltip
            size={13}
            text="Mostra linha-a-linha o que mudou desde o último congelamento. Permite reverter alterações individuais ao estado da versão ativa."
          />
        </div>
      </div>
    )}
    <div className="glass rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-primary/20">
      <div className="flex items-center gap-3 min-w-0">
        <div className="rounded-full bg-primary/10 p-2 shrink-0">
          <GitBranch className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">v{activeVersion.version_number}</p>
            <Badge variant="default" className="text-[10px] uppercase tracking-wider">Ativa</Badge>
            <HelpTooltip
              size={13}
              text="Versão Ativa = BP em produção. É a única que recebe transações reais, valida bypass e alimenta os relatórios contabilísticos (DRE, Rentabilidade)."
            />
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
        {versions.length >= 2 && (
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={() => setCompareOpen(true)}>
              <GitCompare className="h-4 w-4 mr-1.5" />
              Comparar
            </Button>
            <HelpTooltip
              size={13}
              text="Compara lado-a-lado a Versão Ativa com versões anteriores e/ou cenários fixados (até 4 colunas). Mostra diferenças por categoria."
            />
          </div>
        )}
        <div className="flex items-center">
          <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4 mr-1.5" />
            Histórico ({versions.length})
          </Button>
          <HelpTooltip
            size={13}
            text="Linha do tempo de todas as versões oficiais e cenários de trabalho. Permite reverter, arquivar, descartar ou promover cenários a Ativa."
          />
        </div>
        {canManage && !isSplit && (
          <>
            <div className="flex items-center">
              <Button variant="outline" size="sm" onClick={() => setNewScenarioOpen(true)}>
                <Sparkles className="h-4 w-4 mr-1.5" />
                Novo cenário
              </Button>
              <HelpTooltip
                size={13}
                text="Cria um cenário sandbox (rascunho nomeado) clonando a Versão Ativa. Permite simular pressupostos sem afetar produção. Não recebe transações reais."
              />
            </div>
            <div className="flex items-center">
              <Button size="sm" onClick={() => setFreezeOpen(true)}>
                <Snowflake className="h-4 w-4 mr-1.5" />
                Congelar nova versão
              </Button>
              <HelpTooltip
                size={13}
                text="Cria uma fotografia imutável do BP atual (rascunho, versão ativa ou cenário). Em Master cascateia automaticamente para os Splits."
              />
            </div>
          </>
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

      {!isSplit && (
        <NewScenarioDraftModal
          open={newScenarioOpen}
          onOpenChange={setNewScenarioOpen}
          eventId={eventId}
          isMaster={isMaster}
        />
      )}

      <BPVersionsHistoryModal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        eventId={eventId}
        isSplit={isSplit}
        canManage={canManage}
      />

      <BPVersionsCompareModal
        open={compareOpen}
        onOpenChange={setCompareOpen}
        eventId={eventId}
        eventName={eventName ?? "Evento"}
      />

      <ActiveVersionDiffModal
        open={diffOpen}
        onOpenChange={setDiffOpen}
        eventId={eventId}
        canManage={canManage}
      />
    </div>

    <ScenarioDraftsList
      eventId={eventId}
      canManage={canManage}
      isMaster={isMaster}
      isSplit={isSplit}
    />
    </div>
  );
}
