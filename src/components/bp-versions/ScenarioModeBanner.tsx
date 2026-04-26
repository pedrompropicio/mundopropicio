import { useMemo } from "react";
import { useEventScenario } from "@/contexts/EventScenarioContext";
import { useBPVersions } from "@/hooks/useBPVersions";
import { Sparkles, X, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  eventId: string;
}

/**
 * Banner global, proeminente e sticky que avisa o utilizador que está a operar
 * num cenário sandbox (não na Versão Ativa). Aparece em todas as abas dentro do
 * EventScenarioProvider quando isScenarioMode = true.
 */
export function ScenarioModeBanner({ eventId }: Props) {
  const { selectedVersionId, setSelectedVersionId, isScenarioMode } = useEventScenario();
  const { data: versions = [] } = useBPVersions(eventId);

  const scenario = useMemo(
    () => versions.find((v) => v.id === selectedVersionId) ?? null,
    [versions, selectedVersionId]
  );

  if (!isScenarioMode || !scenario) return null;

  const label = scenario.scenario_label ?? `Cenário v${scenario.version_number}`;
  const assumptions = (scenario as any).scenario_assumptions as
    | { publico_estimado?: number; ticket_medio?: number; ocupacao_pct?: number; notas?: string }
    | null
    | undefined;

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-2 px-4 sm:mx-0 sm:px-0">
      <div
        className="rounded-xl border-2 border-amber-500/60 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/5 px-4 py-3 shadow-lg shadow-amber-500/10 backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-full bg-amber-500/20 p-2 shrink-0 ring-2 ring-amber-500/30">
              <FlaskConical className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Modo Sandbox
                </span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-900 dark:text-amber-100">
                  <Sparkles className="h-3 w-3" />
                  {label}
                </span>
              </div>
              <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
                Estás a editar um <strong>cenário</strong> — as alterações <strong>não afetam a Versão Ativa</strong> em produção.
                {assumptions && (assumptions.publico_estimado || assumptions.ticket_medio || assumptions.ocupacao_pct) ? (
                  <span className="ml-1 text-muted-foreground">
                    {assumptions.publico_estimado ? ` Público: ${assumptions.publico_estimado.toLocaleString("pt-PT")}` : ""}
                    {assumptions.ticket_medio ? ` · Ticket: €${assumptions.ticket_medio.toFixed(2)}` : ""}
                    {assumptions.ocupacao_pct ? ` · Ocupação: ${assumptions.ocupacao_pct}%` : ""}
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedVersionId(null)}
            className="shrink-0 border-amber-500/50 bg-background/60 hover:bg-amber-500/10 hover:border-amber-500"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Voltar à Versão Ativa
          </Button>
        </div>
      </div>
    </div>
  );
}
