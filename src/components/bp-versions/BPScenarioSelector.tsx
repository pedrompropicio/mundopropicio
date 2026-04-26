import { useMemo } from "react";
import { useBPVersions } from "@/hooks/useBPVersions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Sparkles } from "lucide-react";
import HelpTooltip from "@/components/HelpTooltip";

interface Props {
  eventId: string;
  selectedVersionId: string | null; // null = Active
  onSelectVersion: (versionId: string | null) => void;
}

/**
 * Permite alternar a vista (e edição) do BP entre a versão Ativa e qualquer
 * cenário working_draft existente. Render apenas se houver pelo menos 1 cenário.
 */
export function BPScenarioSelector({ eventId, selectedVersionId, onSelectVersion }: Props) {
  const { data: versions = [] } = useBPVersions(eventId);

  const drafts = useMemo(
    () => versions.filter((v) => v.state === ("working_draft" as any)),
    [versions]
  );

  if (drafts.length === 0) return null;

  const selected = drafts.find((d) => d.id === selectedVersionId) ?? null;
  const isSandbox = !!selected;

  return (
    <div
      className={`glass rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 transition-colors ${
        isSandbox ? "border-2 border-warning/50 bg-warning/5" : "border-primary/20"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`rounded-full p-2 shrink-0 ${isSandbox ? "bg-warning/15" : "bg-primary/10"}`}>
          <Sparkles className={`h-4 w-4 ${isSandbox ? "text-warning" : "text-primary"}`} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-1">
            A editar
            <HelpTooltip
              size={13}
              text="Alterna entre a Versão Ativa (BP em produção, recebe transações reais) e cenários sandbox (rascunhos isolados, só para simulação)."
            />
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            Escolhe a versão do BP que queres visualizar e editar nesta vista.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {selected ? (
          <Badge className="text-[10px] gap-1 bg-warning text-warning-foreground hover:bg-warning/90">
            <Sparkles className="h-2.5 w-2.5" />
            Cenário sandbox
          </Badge>
        ) : (
          <Badge variant="default" className="text-[10px] gap-1">
            <GitBranch className="h-2.5 w-2.5" />
            Versão Ativa
          </Badge>
        )}
        <Select
          value={selectedVersionId ?? "__active__"}
          onValueChange={(v) => onSelectVersion(v === "__active__" ? null : v)}
        >
          <SelectTrigger
            className={`h-9 w-[260px] ${isSandbox ? "border-warning/50 ring-1 ring-warning/20" : ""}`}
          >
            <SelectValue placeholder="Selecionar versão" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__active__">
              <div className="flex items-center gap-2">
                <GitBranch className="h-3.5 w-3.5" />
                <span>Versão Ativa (BP em produção)</span>
              </div>
            </SelectItem>
            {drafts.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-warning" />
                  <span className="truncate">
                    {d.scenario_label ?? `Cenário v${d.version_number}`}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
