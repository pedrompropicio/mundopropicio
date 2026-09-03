/**
 * DR-2026-09-02-D2 (revista 03/09) — "Elevar verba da linha de BP".
 *
 * Aparece na APROVAÇÃO, depois do passo da linha de BP (D1+D8), quando o
 * realizado da linha passa a ultrapassar a verba. Não há alternativa: ou se
 * eleva a linha, ou não se aprova. Quem não tem `raise_budget` vê apenas a
 * explicação e escala.
 *
 * Dois modos:
 *  - `onConfirm` — devolve os raises ao chamador (para ir no body das edge
 *    functions, que aplicam tudo atomicamente);
 *  - `applyViaRpc` — aplica pela RPC `raise_forecast_budget`, linha a linha, e
 *    só chama `onDone` se todas passarem (caminhos de escrita directa).
 */
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, TrendingUp, Loader2 } from "lucide-react";
import {
  isLikelyIvaRounding,
  type BudgetExcessLine,
  type BudgetRaise,
} from "@/lib/bp-budget-excess";

interface Props {
  lines: BudgetExcessLine[];
  onClose: () => void;
  /** Modo "devolver": o chamador é que aplica (edge functions, atomicamente). */
  onConfirm?: (raises: BudgetRaise[]) => void;
  /** Modo "aplicar": eleva pela RPC, linha a linha, antes de chamar `onDone`. */
  applyViaRpc?: boolean;
  onDone?: () => void;
}

export default function RaiseBudgetDialog({ lines, onClose, onConfirm, applyViaRpc, onDone }: Props) {
  const { hasPermission } = useAuth();
  const canRaise = hasPermission("raise_budget");

  const [sharedObservation, setSharedObservation] = useState("");
  const [ownObs, setOwnObs] = useState<Record<string, boolean>>({});
  const [obsByLine, setObsByLine] = useState<Record<string, string>>({});
  const [amountByLine, setAmountByLine] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.forecast_id, l.suggested_amount.toFixed(2)])),
  );
  const [saving, setSaving] = useState(false);

  const totalExcess = useMemo(() => lines.reduce((s, l) => s + l.excess, 0), [lines]);

  const parseAmount = (raw: string) => Number(String(raw).replace(",", "."));

  const observationFor = (forecastId: string) =>
    (ownObs[forecastId] ? obsByLine[forecastId] ?? "" : sharedObservation).trim();

  const buildRaises = (): BudgetRaise[] | null => {
    const raises: BudgetRaise[] = [];
    for (const l of lines) {
      const newAmount = parseAmount(amountByLine[l.forecast_id] ?? "");
      if (!Number.isFinite(newAmount) || newAmount < l.suggested_amount) {
        toast({
          title: "Nova verba insuficiente",
          description: `"${l.description}": a nova verba não pode ser inferior a ${formatCurrency(l.suggested_amount)}.`,
          variant: "destructive",
        });
        return null;
      }
      const observation = observationFor(l.forecast_id);
      if (!observation) {
        toast({
          title: "Observação obrigatória",
          description: "Toda a elevação de verba fica escrita — preenche a observação.",
          variant: "destructive",
        });
        return null;
      }
      raises.push({ forecast_id: l.forecast_id, new_amount: Math.round(newAmount * 100) / 100, observation });
    }
    return raises;
  };

  const handleConfirm = async () => {
    const raises = buildRaises();
    if (!raises) return;

    if (!applyViaRpc) {
      onConfirm?.(raises);
      onClose();
      return;
    }

    setSaving(true);
    try {
      for (const r of raises) {
        const { error } = await supabase.rpc("raise_forecast_budget" as any, {
          _forecast_id: r.forecast_id,
          _new_amount: r.new_amount,
          _observation: r.observation,
        } as any);
        if (error) throw error;
      }
      toast({
        title: raises.length === 1 ? "Verba da linha elevada" : `${raises.length} verbas elevadas`,
      });
      onClose();
      onDone?.();
    } catch (err: any) {
      toast({ title: "Erro ao elevar a verba", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-warning" />
            Elevar verba do BP
          </DialogTitle>
          <DialogDescription>
            {canRaise
              ? "Aprovar estas despesas faz o realizado ultrapassar a verba da linha. A linha é elevada no mesmo acto — o BP é o norte e nunca fica abaixo do realizado."
              : "Aprovar estas despesas faz o realizado ultrapassar a verba da linha do BP."}
          </DialogDescription>
        </DialogHeader>

        {!canRaise ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>
                  Não tens a permissão <strong>Elevar verba do BP</strong>. A linha tem de ser elevada
                  por quem a tem (normalmente um gestor ou administrador) — até lá, estas despesas
                  ficam pendentes. Nada foi aprovado.
                </span>
              </p>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {lines.map((l) => (
                <div key={l.forecast_id} className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                  <p className="font-medium">{l.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Verba {formatCurrency(l.line_amount)} · Realizado {formatCurrency(l.realized)} ·
                    A aprovar {formatCurrency(l.to_approve)} ·{" "}
                    <span className="text-warning">Excesso {formatCurrency(l.excess)}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="raise-shared-obs">
                Observação (aplica-se a todas as linhas) <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="raise-shared-obs"
                rows={2}
                placeholder="Porque é que a verba sobe?"
                value={sharedObservation}
                onChange={(e) => setSharedObservation(e.target.value)}
              />
            </div>

            <div className="max-h-[22rem] space-y-3 overflow-y-auto pr-1">
              {lines.map((l) => {
                const rounding = isLikelyIvaRounding(l);
                return (
                  <div key={l.forecast_id} className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                    <p className="text-sm font-medium">{l.description}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                      <span className="text-muted-foreground">
                        Verba actual: <strong className="text-foreground tabular-nums">{formatCurrency(l.line_amount)}</strong>
                      </span>
                      {l.baseline_amount != null && l.baseline_amount !== l.line_amount && (
                        <span className="text-muted-foreground">
                          Previsto original: <strong className="text-foreground tabular-nums">{formatCurrency(l.baseline_amount)}</strong>
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        Realizado: <strong className="text-foreground tabular-nums">{formatCurrency(l.realized)}</strong>
                      </span>
                      <span className="text-muted-foreground">
                        A aprovar: <strong className="text-foreground tabular-nums">{formatCurrency(l.to_approve)}</strong>
                      </span>
                      <span className="text-muted-foreground">
                        Excesso: <strong className="tabular-nums text-warning">{formatCurrency(l.excess)}</strong>
                      </span>
                    </div>

                    {rounding && (
                      <p className="text-[11px] text-muted-foreground">
                        Provável arredondamento de IVA linha a linha (Art.º 18 CIVA).
                      </p>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor={`raise-amount-${l.forecast_id}`} className="text-xs">
                        Nova verba
                      </Label>
                      <Input
                        id={`raise-amount-${l.forecast_id}`}
                        inputMode="decimal"
                        className="h-9 font-mono"
                        value={amountByLine[l.forecast_id] ?? ""}
                        onChange={(e) =>
                          setAmountByLine((prev) => ({ ...prev, [l.forecast_id]: e.target.value }))
                        }
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Mínimo {formatCurrency(l.suggested_amount)} — a linha nunca fica abaixo do realizado.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`raise-own-obs-${l.forecast_id}`}
                        checked={!!ownObs[l.forecast_id]}
                        onCheckedChange={(v) =>
                          setOwnObs((prev) => ({ ...prev, [l.forecast_id]: v === true }))
                        }
                      />
                      <Label htmlFor={`raise-own-obs-${l.forecast_id}`} className="cursor-pointer text-xs">
                        Usar observação própria
                      </Label>
                    </div>

                    {ownObs[l.forecast_id] && (
                      <Textarea
                        rows={2}
                        placeholder="Observação desta linha"
                        value={obsByLine[l.forecast_id] ?? ""}
                        onChange={(e) =>
                          setObsByLine((prev) => ({ ...prev, [l.forecast_id]: e.target.value }))
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {lines.length > 1 && (
              <p className="text-xs text-muted-foreground">
                {lines.length} linhas em excesso · total {formatCurrency(totalExcess)}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {canRaise ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={() => void handleConfirm()} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {lines.length === 1 ? "Elevar verba e aprovar" : "Elevar verbas e aprovar"}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>Entendi</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
