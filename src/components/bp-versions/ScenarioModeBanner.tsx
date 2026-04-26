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
        className="rounded-xl border-2 border-warning/60 bg-gradient-to-r from-warning/15 via-warning/10 to-warning/5 px-4 py-3 shadow-lg shadow-warning/10 backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-full bg-warning/20 p-2 shrink-0 ring-2 ring-warning/30">
              <FlaskConical className="h-4 w-4 text-warning" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-warning">
                  Modo Sandbox
                </span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="inline-flex items-center gap-1 text-sm font-bold text-foreground">
                  <Sparkles className="h-3 w-3 text-warning" />
                  {label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Estás a editar um <strong className="text-foreground">cenário</strong> — as alterações <strong className="text-foreground">não afetam a Versão Ativa</strong> em produção.
                {assumptions && (assumptions.publico_estimado || assumptions.ticket_medio || assumptions.ocupacao_pct) ? (
                  <span className="ml-1">
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
            className="shrink-0 border-warning/50 hover:bg-warning/10 hover:border-warning"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Voltar à Versão Ativa
          </Button>
        </div>
      </div>
    </div>
  );
}
