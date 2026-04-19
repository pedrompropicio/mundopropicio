/**
 * Post-import dialog: after distributing a tour BP across sub-events, we look for
 * forecast lines that exist with the *same description, same category and same
 * value* in every sub-event. Those are almost always shared/master costs (sound,
 * production team, transport, etc.) that the user wants accounted once on the
 * tour-level (Master) BP rather than duplicated per city.
 *
 * The user confirms line-by-line which groups should be promoted. For each
 * selected group we create a single forecast on the Master event and delete the
 * per-sub-event copies.
 */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/mock-data";
import { Sparkles } from "lucide-react";

export interface PromoteCandidate {
  /** Stable key built from category + description so the user can toggle it */
  key: string;
  description: string;
  categoryCode: string | null;
  categoryName: string | null;
  /** Amount per row (the same for every sub-event copy) */
  amount: number;
  ivaRate: number;
  /** Sub-event names where this line was created */
  subEventNames: string[];
  /** The forecast row IDs on the sub-events. Used by the parent to delete them. */
  forecastIds: string[];
  /** Category id, propagated to the Master row */
  categoryId: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidates: PromoteCandidate[];
  /** Called with the selected candidates when the user confirms the promotion. */
  onConfirm: (selected: PromoteCandidate[]) => Promise<void> | void;
}

export default function PromoteToMasterModal({ open, onOpenChange, candidates, onConfirm }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(candidates.map((c) => c.key)));
  const [submitting, setSubmitting] = useState(false);

  // Re-seed defaults whenever the candidate list changes (every new import).
  useMemo(() => {
    setSelected(new Set(candidates.map((c) => c.key)));
  }, [candidates]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === candidates.length) setSelected(new Set());
    else setSelected(new Set(candidates.map((c) => c.key)));
  };

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const chosen = candidates.filter((c) => selected.has(c.key));
      await onConfirm(chosen);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const totalSavings = candidates
    .filter((c) => selected.has(c.key))
    .reduce((sum, c) => sum + c.amount * (c.subEventNames.length - 1), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Promover despesas comuns ao Master?
          </DialogTitle>
          <DialogDescription>
            Estas linhas foram importadas com o mesmo valor em todos os sub-eventos da turnê — geralmente são custos partilhados (produção, transporte, equipa…) que devem ficar no Master para não duplicar no resultado consolidado. Confirma quais queres mover.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/50 pb-2">
          <button
            type="button"
            onClick={toggleAll}
            className="text-primary hover:underline"
          >
            {selected.size === candidates.length ? "Desmarcar tudo" : "Marcar tudo"}
          </button>
          <span>
            {selected.size} / {candidates.length} selecionada(s) · poupa {formatCurrency(totalSavings)} em duplicados
          </span>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <ul className="space-y-1.5 py-2">
            {candidates.map((c) => {
              const isSelected = selected.has(c.key);
              return (
                <li
                  key={c.key}
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                    isSelected ? "border-primary/40 bg-primary/5" : "border-border/40 bg-secondary/20"
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggle(c.key)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.categoryCode ? `${c.categoryCode} · ` : ""}
                      {c.categoryName ?? "Sem categoria"} · presente em {c.subEventNames.length} sub-evento(s)
                    </p>
                    <p className="text-[10px] text-muted-foreground/80 mt-0.5 truncate">
                      {c.subEventNames.join(" · ")}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-semibold">{formatCurrency(c.amount)}</p>
                    <p className="text-[10px] text-muted-foreground">IVA {c.ivaRate}%</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Manter tudo nos sub-eventos
          </Button>
          <Button onClick={handleConfirm} disabled={submitting || selected.size === 0}>
            {submitting ? "A promover…" : `Promover ${selected.size} linha(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}