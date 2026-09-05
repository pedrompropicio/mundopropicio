/**
 * Verbas de patrocínio por segmento + encerramento datado da captação.
 * Aba Receitas do BP (DR-2026-09-05-D22). Gated por `manage_bp`.
 *
 * Não toca em cards do pipeline, linhas de BP ou transações.
 */
import { useMemo, useState } from "react";
import { Target, Lock, Unlock, Save, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/format";
import {
  useEventSponsorshipTargets,
  useSaveSponsorshipTargets,
  useSponsorshipSegments,
  useUpsertSponsorshipSegment,
  useCloseSponsorshipCapture,
} from "@/hooks/useSponsorshipSegments";

interface Props {
  eventId: string;
  companyId: string | null;
  canEdit: boolean;
  closedAt: string | null;
  extraEventIds?: string[];
}

export function SponsorshipTargetsPanel({ eventId, companyId, canEdit, closedAt, extraEventIds = [] }: Props) {
  const { data: segments = [] } = useSponsorshipSegments(companyId);
  const { data: targets = [] } = useEventSponsorshipTargets(eventId, extraEventIds);
  const save = useSaveSponsorshipTargets(eventId, companyId);
  const upsertSegment = useUpsertSponsorshipSegment(companyId);
  const closeCapture = useCloseSponsorshipCapture(eventId);

  const [open, setOpen] = useState(false);
  const [newSegment, setNewSegment] = useState("");
  const [confirmClose, setConfirmClose] = useState<null | "close" | "reopen">(null);
  const [draft, setDraft] = useState<Record<string, number> | null>(null);

  const activeSegments = useMemo(
    () => segments.filter((s) => s.is_active || targets.some((t) => t.segment_id === s.id)),
    [segments, targets],
  );

  const targetBySegment = useMemo(() => {
    const m = new Map<string, { id: string; amount: number }>();
    for (const t of targets) {
      if (t.event_id !== eventId) continue;
      m.set(t.segment_id, { id: t.id, amount: Number(t.amount || 0) });
    }
    return m;
  }, [targets, eventId]);

  const values = draft ?? Object.fromEntries(activeSegments.map((s) => [s.id, targetBySegment.get(s.id)?.amount ?? 0]));
  const total = activeSegments.reduce((s, seg) => s + Number(values[seg.id] || 0), 0);

  async function handleSave() {
    await save.mutateAsync(
      activeSegments
        .map((s) => ({
          segment_id: s.id,
          amount: Number(values[s.id] || 0),
          existingId: targetBySegment.get(s.id)?.id,
        }))
        .filter((r) => r.existingId || r.amount > 0),
    );
    setDraft(null);
    setOpen(false);
  }

  const hasTargets = targets.some((t) => Number(t.amount || 0) > 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
        >
          <Target className="h-3.5 w-3.5" />
          {hasTargets ? `Verbas de patrocínio (${formatCurrency(total)})` : "Verbas de patrocínio"}
        </button>
        {canEdit && (
          <button
            onClick={() => setConfirmClose(closedAt ? "reopen" : "close")}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground bg-secondary/40 hover:bg-secondary/70 transition-colors"
          >
            {closedAt ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {closedAt ? "Reabrir captação" : "Encerrar captação"}
          </button>
        )}
        {closedAt && (
          <span className="text-[11px] text-muted-foreground">
            Captação encerrada em {new Date(closedAt).toLocaleDateString("pt-PT")}
          </span>
        )}
      </div>

      {open && (
        <div className="mt-3 w-full rounded-lg border border-border/60 bg-secondary/10 p-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 text-left font-medium">Segmento</th>
                <th className="pb-2 text-right font-medium">Verba (s/IVA)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {activeSegments.map((s) => (
                <tr key={s.id}>
                  <td className="py-1.5">{s.name}</td>
                  <td className="py-1.5 text-right">
                    <div className="flex justify-end">
                      <MoneyInput
                        value={Number(values[s.id] || 0)}
                        onChange={(v) => setDraft({ ...values, [s.id]: v })}
                        disabled={!canEdit}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {activeSegments.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-3 text-center text-xs text-muted-foreground">
                    Sem segmentos definidos.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/50">
                <td className="py-2 text-xs font-medium text-muted-foreground">Total</td>
                <td className="py-2 text-right font-mono font-bold">{formatCurrency(total)}</td>
              </tr>
            </tfoot>
          </table>

          {canEdit && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="flex items-end gap-1">
                <Input
                  placeholder="Novo segmento…"
                  value={newSegment}
                  onChange={(e) => setNewSegment(e.target.value)}
                  className="h-8 w-44 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!newSegment.trim() || upsertSegment.isPending}
                  onClick={async () => {
                    await upsertSegment.mutateAsync({ name: newSegment.trim() });
                    setNewSegment("");
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button size="sm" onClick={handleSave} disabled={save.isPending} className="ml-auto">
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Guardar verbas
              </Button>
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            O valor original de cada verba é fixado na criação e nunca é reescrito.
          </p>
        </div>
      )}

      <AlertDialog open={!!confirmClose} onOpenChange={(o) => !o && setConfirmClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmClose === "close" ? "Encerrar a captação de patrocínios?" : "Reabrir a captação?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmClose === "close"
                ? "A partir de agora o previsto corrente de patrocínios passa a contar só os patrocínios fechados. A verba não captada fica visível como desvio. Podes reabrir depois."
                : "A verba ainda não captada volta a contar no previsto corrente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const action = confirmClose;
                setConfirmClose(null);
                await closeCapture.mutateAsync(action === "close");
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
