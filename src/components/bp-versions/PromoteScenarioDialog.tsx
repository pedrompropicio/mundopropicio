import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Rocket, AlertTriangle, Sparkles, Pin, Archive, Trash2, RotateCcw,
} from "lucide-react";
import {
  type BPVersionRow,
  type OtherScenarioAction,
  type OtherScenarioDecision,
  usePromoteScenario,
  useBPLinkedTxCount,
} from "@/hooks/useBPVersions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  scenario: BPVersionRow | null;
  /** Other live scenarios (drafts with scenario_label) of the same event. */
  otherScenarios: BPVersionRow[];
  onSuccess?: () => void;
}

const ACTION_META: Record<OtherScenarioAction, { label: string; icon: any; tone: string }> = {
  keep: { label: "Manter", icon: RotateCcw, tone: "border-border" },
  archive: { label: "Arquivar", icon: Archive, tone: "border-warning/40 text-warning" },
  discard: { label: "Apagar", icon: Trash2, tone: "border-destructive/40 text-destructive" },
};

export function PromoteScenarioDialog({
  open, onOpenChange, eventId, scenario, otherScenarios, onSuccess,
}: Props) {
  const promote = usePromoteScenario(eventId);
  const { data: linkedTxCount = 0 } = useBPLinkedTxCount(open ? eventId : null);

  // Per-scenario action state — defaults to "keep" for everyone.
  const [actions, setActions] = useState<Record<string, OtherScenarioAction>>({});
  const [forcePromote, setForcePromote] = useState(false);

  useEffect(() => {
    if (open) {
      const initial: Record<string, OtherScenarioAction> = {};
      otherScenarios.forEach((s) => {
        initial[s.id] = "keep";
      });
      setActions(initial);
      setForcePromote(false);
    }
  }, [open, otherScenarios]);

  const setAll = (action: OtherScenarioAction) => {
    const next: Record<string, OtherScenarioAction> = {};
    otherScenarios.forEach((s) => {
      // Only allow "discard" for plain drafts (no superseded etc — they are always drafts here anyway)
      next[s.id] = action;
    });
    setActions(next);
  };

  const decisions: OtherScenarioDecision[] = useMemo(
    () => otherScenarios.map((s) => ({ version_id: s.id, action: actions[s.id] ?? "keep" })),
    [otherScenarios, actions]
  );

  const counts = useMemo(() => {
    const c = { keep: 0, archive: 0, discard: 0 };
    decisions.forEach((d) => {
      c[d.action] += 1;
    });
    return c;
  }, [decisions]);

  const blocked = linkedTxCount > 0 && !forcePromote;

  const handleConfirm = () => {
    if (!scenario) return;
    promote.mutate(
      {
        versionId: scenario.id,
        description: null,
        force: forcePromote,
        otherScenariosActions: decisions,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
      }
    );
  };

  if (!scenario) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !promote.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Promover cenário "{scenario.scenario_label}" a versão ativa
          </DialogTitle>
          <DialogDescription>
            O BP do evento será reescrito com este cenário. Em Master, a promoção propaga aos Splits.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Promoted scenario summary */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">
                {scenario.scenario_label ?? `v${scenario.version_number}`}
              </div>
              {scenario.description && (
                <div className="text-xs text-muted-foreground truncate">{scenario.description}</div>
              )}
            </div>
            {scenario.is_pinned_scenario && (
              <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
                <Pin className="h-2.5 w-2.5 mr-1" />
                Fixado
              </Badge>
            )}
          </div>

          {/* Linked-tx warning */}
          {linkedTxCount > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-2">
              <p className="font-medium text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                {linkedTxCount} linha(s) do BP atual têm transações vinculadas
              </p>
              <p className="text-muted-foreground">
                Se prosseguir, essas transações ficam órfãs do BP. Marque "Forçar promoção" para confirmar.
              </p>
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forcePromote}
                  onChange={(e) => setForcePromote(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="font-medium text-destructive">Forçar promoção</span>
              </label>
            </div>
          )}

          {/* Other scenarios */}
          {otherScenarios.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Outros cenários vivos ({otherScenarios.length})
                </h3>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setAll("keep")}>
                    Manter todos
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setAll("archive")}>
                    Arquivar todos
                  </Button>
                </div>
              </div>

              <ScrollArea className="max-h-[280px] -mx-1 px-1">
                <div className="space-y-1.5">
                  {otherScenarios.map((s) => (
                    <ScenarioActionRow
                      key={s.id}
                      scenario={s}
                      action={actions[s.id] ?? "keep"}
                      onChange={(a) => setActions((prev) => ({ ...prev, [s.id]: a }))}
                    />
                  ))}
                </div>
              </ScrollArea>

              <div className="flex gap-2 text-[11px] text-muted-foreground pt-1">
                <span>{counts.keep} mantidos</span>
                <span>·</span>
                <span>{counts.archive} arquivados</span>
                <span>·</span>
                <span>{counts.discard} apagados</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic px-1">
              Não há outros cenários vivos no evento.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={promote.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={promote.isPending || blocked}>
            <Rocket className="h-4 w-4 mr-1.5" />
            {promote.isPending ? "A promover…" : "Promover a ativa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScenarioActionRow({
  scenario, action, onChange,
}: {
  scenario: BPVersionRow;
  action: OtherScenarioAction;
  onChange: (a: OtherScenarioAction) => void;
}) {
  return (
    <div className="rounded-md border bg-card p-2 flex items-center gap-2">
      <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate">
          {scenario.scenario_label ?? `v${scenario.version_number}`}
        </div>
        {scenario.is_pinned_scenario && (
          <span className="text-[10px] text-warning inline-flex items-center gap-1">
            <Pin className="h-2.5 w-2.5" /> Fixado
          </span>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        {(Object.keys(ACTION_META) as OtherScenarioAction[]).map((a) => {
          const meta = ACTION_META[a];
          const Icon = meta.icon;
          const selected = action === a;
          return (
            <Button
              key={a}
              variant={selected ? "default" : "outline"}
              size="sm"
              className="h-7 text-[10px] px-2"
              onClick={() => onChange(a)}
            >
              <Icon className="h-3 w-3 mr-1" />
              {meta.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
