import { useMemo } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBPVersions, type BPVersionRow } from "@/hooks/useBPVersions";

const ACTIVE_VALUE = "__active__";

interface Props {
  /** Evento "âncora" (Master ou standalone). Se null/undefined o seletor é escondido. */
  eventId: string | null | undefined;
  /** Indica se há mais de um evento selecionado — quando true, escondemos. */
  isMultiEvent: boolean;
  value: string | null;
  onChange: (versionId: string | null) => void;
  className?: string;
  /** Quando true, inclui também cenários não fixados (drafts). Default: só fixados. */
  includeUnpinnedScenarios?: boolean;
}

/**
 * Seletor de versão do BP para relatórios estratégicos.
 * - Lista a versão Ativa + cenários (fixados por default; drafts se includeUnpinnedScenarios)
 * - Só visível quando 1 evento está selecionado e existirem cenários
 * - Mostra banner amarelo + badge quando o utilizador escolhe um cenário
 */
export function ReportScenarioSelector({
  eventId,
  isMultiEvent,
  value,
  onChange,
  className,
  includeUnpinnedScenarios = false,
}: Props) {
  const { data: versions = [] } = useBPVersions(eventId ?? null);

  const scenarios = useMemo<BPVersionRow[]>(
    () =>
      versions
        .filter((v) => v.state !== "archived" && v.state !== "active")
        .filter((v) => includeUnpinnedScenarios || v.is_pinned_scenario)
        .sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0)),
    [versions, includeUnpinnedScenarios],
  );

  const activeVersion = versions.find((v) => v.state === "active") ?? null;
  const selectedScenario = value ? versions.find((v) => v.id === value) ?? null : null;

  // Hide when multi-evento OR sem cenários disponíveis
  if (isMultiEvent || !eventId || scenarios.length === 0) {
    return null;
  }

  const selectValue = value ?? ACTIVE_VALUE;
  const formatLabel = (v: BPVersionRow) => {
    // Cenários nomeados mostram só o label; sem label cai no fallback técnico v{N}.
    return v.scenario_label ?? `v${v.version_number}`;
  };

  return (
    <div className={className}>
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Versão do Business Plan</p>
          </div>
          <Select
            value={selectValue}
            onValueChange={(v) => onChange(v === ACTIVE_VALUE ? null : v)}
          >
            <SelectTrigger className="w-full sm:w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ACTIVE_VALUE}>
                Versão Ativa{activeVersion ? ` · v${activeVersion.version_number}` : ""}
              </SelectItem>
              {scenarios.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  Cenário · {formatLabel(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedScenario && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              A visualizar o cenário{" "}
              <strong>
                {selectedScenario.scenario_label ?? `v${selectedScenario.version_number}`}
              </strong>
              . Os valores não refletem o BP em produção —
              servem apenas para análise de planeamento.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { ACTIVE_VALUE as REPORT_SCENARIO_ACTIVE_VALUE };
