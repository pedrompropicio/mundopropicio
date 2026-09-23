import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PiggyBank, Check, ChevronDown, ChevronRight, Link2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/mock-data";
import { formatDatePT } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { computeBpLineReview, vatLabel, type BpLineReviewRow } from "@/lib/event-cost-basis";
import { hasResultBlockingFlags } from "@/lib/fecho-filters";
import { type FechoBasis } from "@/hooks/useFechoBasis";

interface Props {
  eventId: string;
  basis: FechoBasis;
}

type Decision = "pending_invoice" | "partner_paid" | "adjusted";

const DECISION_LABEL: Record<Decision, string> = {
  pending_invoice: "Custo real — fatura por chegar",
  partner_paid: "Pago por sócio",
  adjusted: "Previsto ajustado",
};

/**
 * Verba por usar, LINHA A LINHA (#239 / D-ERP131).
 *
 * Cada linha de BP com saldo exige uma decisão antes do selo: é obrigação futura
 * da MP, é financiamento de um sócio, ou o previsto tem de descer. O cálculo vive
 * em `computeBpLineReview` (pacote partilhado) — aqui não se soma nada por fora.
 */
export function BpUnusedBudgetPanel({ eventId, basis }: Props) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManageBp = hasPermission("manage_bp");

  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialogRow, setDialogRow] = useState<BpLineReviewRow | null>(null);
  const [dialogDecision, setDialogDecision] = useState<Decision>("pending_invoice");
  const [note, setNote] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [saving, setSaving] = useState(false);

  // Eventos sem BP: painel não se aplica.
  const { data: budgetMode, isLoading: loadingMode } = useQuery({
    queryKey: ["event-budget-mode", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("event_budget_mode", { _event_id: eventId });
      if (error) throw error;
      return (data as string | null) ?? "with_bp";
    },
  });
  const hasBp = budgetMode !== "without_bp";

  const { data: forecasts = [] } = useQuery({
    queryKey: ["bp-line-review-forecasts", eventId],
    enabled: hasBp,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select(
          "id, company_id, category_id, description, amount, iva_rate, status, type, is_overhead, is_transitory, exclude_from_result, version_id, account_categories(code, name)",
        )
        .eq("event_id", eventId)
        .eq("type", "expense")
        .eq("status", "approved")
        .eq("is_overhead", false)
        .is("version_id", null);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: txs = [] } = useQuery({
    queryKey: ["bp-line-review-tx", eventId],
    enabled: hasBp,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, forecast_id, category_id, description, amount, iva_rate, status, paid_amount, date, installment_group_id, is_transitory, exclude_from_result, reversed_at, is_hidden, type, suppliers(name)",
        )
        .eq("event_id", eventId)
        .eq("type", "expense");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["bp-line-reviews", eventId],
    enabled: hasBp,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("event_bp_line_reviews")
        .select("id, forecast_id, decision, saldo_at_review, note, reviewed_by, reviewed_at")
        .eq("event_id", eventId)
        .order("reviewed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const reviewerIds = useMemo(
    () => Array.from(new Set(reviews.map((r: any) => r.reviewed_by).filter(Boolean))),
    [reviews],
  );
  const { data: reviewers = [] } = useQuery({
    queryKey: ["bp-line-reviewers", reviewerIds.slice().sort().join(",")],
    enabled: reviewerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", reviewerIds as string[]);
      if (error) throw error;
      return data || [];
    },
  });
  const reviewerName = (id: string) => {
    const p: any = reviewers.find((r: any) => r.id === id);
    return p?.full_name || p?.email || "—";
  };

  // Vista (segue o seletor de IVA do Fecho) e registo (SEMPRE s/IVA).
  const rowsView = useMemo(
    () => computeBpLineReview({ forecasts: forecasts as any, transactions: txs as any, withVat: basis.withVat }),
    [forecasts, txs, basis.withVat],
  );
  const rowsNet = useMemo(
    () => computeBpLineReview({ forecasts: forecasts as any, transactions: txs as any, withVat: false }),
    [forecasts, txs],
  );
  const netSaldoById = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rowsNet) m.set(r.forecastId, r.saldo);
    return m;
  }, [rowsNet]);

  /** Decisão mais recente da linha, válida só se o saldo s/IVA bater (±0,01). */
  const latestReview = (forecastId: string) => reviews.find((r: any) => r.forecast_id === forecastId) ?? null;
  const reviewState = (forecastId: string) => {
    const r = latestReview(forecastId);
    if (!r) return { review: null as any, valid: false };
    const net = netSaldoById.get(forecastId) ?? 0;
    return { review: r, valid: Math.abs(Number(r.saldo_at_review) - net) <= 0.01 };
  };

  const catLabel = (forecastId: string) => {
    const f: any = (forecasts as any[]).find((x) => x.id === forecastId);
    const c = f?.account_categories;
    return c ? [c.code, c.name].filter(Boolean).join(" · ") : "—";
  };

  /** Candidatas a vínculo: mesma rubrica, mesmo evento, sem linha de BP. */
  const candidatesFor = (row: BpLineReviewRow) =>
    (txs as any[]).filter(
      (t) =>
        !t.forecast_id &&
        t.category_id &&
        t.category_id === row.categoryId &&
        !hasResultBlockingFlags(t),
    );

  const totals = useMemo(() => {
    let obligation = 0;
    let partner = 0;
    let unreviewed = 0;
    for (const r of rowsView) {
      const { review, valid } = reviewState(r.forecastId);
      if (!valid) unreviewed += r.saldo;
      else if (review.decision === "pending_invoice") obligation += r.saldo;
      else if (review.decision === "partner_paid") partner += r.saldo;
    }
    return { obligation, partner, unreviewed };
  }, [rowsView, reviews, netSaldoById]);

  const totalView = rowsView.reduce((s, r) => s + r.saldo, 0);

  async function linkTx(row: BpLineReviewRow, t: any) {
    setSaving(true);
    try {
      let q = supabase.from("transactions").update({ forecast_id: row.forecastId } as any);
      // D-ERP77: parcelas herdam a linha da mãe — vincula o grupo inteiro.
      q = t.installment_group_id
        ? q.eq("installment_group_id", t.installment_group_id)
        : q.eq("id", t.id);
      const { error } = await q;
      if (error) throw error;
      toast.success(t.installment_group_id ? "Parcelas vinculadas à linha" : "Transação vinculada à linha");
      queryClient.invalidateQueries({ queryKey: ["bp-line-review-tx", eventId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível vincular");
    } finally {
      setSaving(false);
    }
  }

  function openDialog(row: BpLineReviewRow, decision: Decision) {
    setDialogRow(row);
    setDialogDecision(decision);
    setNote("");
    const realizedNet = 0; // preenchido abaixo com o realizado s/IVA
    const netRow = rowsNet.find((r) => r.forecastId === row.forecastId);
    const realized = netRow ? netRow.pago + netRow.aPagar : realizedNet;
    setNewAmount(decision === "adjusted" ? realized.toFixed(2) : "");
  }

  async function saveDecision() {
    if (!dialogRow) return;
    setSaving(true);
    try {
      const f: any = (forecasts as any[]).find((x) => x.id === dialogRow.forecastId);
      const netRow = rowsNet.find((r) => r.forecastId === dialogRow.forecastId);
      const saldoNet = netRow?.saldo ?? 0;
      let saldoAtReview = saldoNet;

      if (dialogDecision === "adjusted") {
        const amount = Number(String(newAmount).replace(",", "."));
        if (!Number.isFinite(amount)) throw new Error("Valor inválido.");
        if (!note.trim()) throw new Error("Observação obrigatória para ajustar o previsto.");
        const { error } = await (supabase as any).rpc("reduce_forecast_budget", {
          _forecast_id: dialogRow.forecastId,
          _new_amount: amount,
          _observation: note.trim(),
        });
        if (error) throw error;
        const realized = netRow ? netRow.pago + netRow.aPagar : 0;
        saldoAtReview = amount - realized;
      }

      const { error: insErr } = await (supabase as any).from("event_bp_line_reviews").insert({
        event_id: eventId,
        forecast_id: dialogRow.forecastId,
        company_id: f?.company_id,
        decision: dialogDecision,
        saldo_at_review: saldoAtReview,
        note: note.trim() || null,
      });
      if (insErr) throw insErr;

      toast.success("Decisão registada");
      setDialogRow(null);
      queryClient.invalidateQueries({ queryKey: ["bp-line-reviews", eventId] });
      queryClient.invalidateQueries({ queryKey: ["bp-line-review-forecasts", eventId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível registar a decisão");
    } finally {
      setSaving(false);
    }
  }

  if (loadingMode || !hasBp) return null;

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50 flex flex-wrap items-center gap-2">
        <PiggyBank className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">Verba por usar</span>
        <span className="font-mono text-sm font-bold">{formatCurrency(totalView)}</span>
        <Badge variant="outline" className="text-[10px]">Despesas {vatLabel(basis.withVat)}</Badge>
        <Badge variant="outline" className="text-[10px]">{rowsView.length} linha(s)</Badge>
      </div>

      <p className="px-4 py-2 text-[11px] text-muted-foreground border-b border-border/50">
        Lista de revisão, não de erro. Faturas de um evento podem chegar depois de ele acontecer — o valor que deve ficar em cada linha é decisão de gestão.
      </p>

      {rowsView.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma linha de BP com verba por usar.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rubrica</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Previsto</TableHead>
              <TableHead className="text-right">Pago</TableHead>
              <TableHead className="text-right">A pagar</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Decisão</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsView.map((r) => {
              const { review, valid } = reviewState(r.forecastId);
              const cands = candidatesFor(r);
              const isOpen = expanded === r.forecastId;
              return (
                <>
                  <TableRow key={r.forecastId}>
                    <TableCell className="text-sm align-top">{catLabel(r.forecastId)}</TableCell>
                    <TableCell className="text-sm align-top">
                      <div className="flex flex-col gap-1">
                        <span>{r.description || "—"}</span>
                        <div className="flex flex-wrap gap-1">
                          {r.pendingCount > 0 && (
                            <Badge variant="outline" className="text-[9px] bg-warning/10 text-warning border-warning/30">
                              {r.pendingCount} por aprovar · {formatCurrency(r.pendingAmount)}
                            </Badge>
                          )}
                          {cands.length > 0 && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                              onClick={() => setExpanded(isOpen ? null : r.forecastId)}
                            >
                              {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              {cands.length} candidata(s) a vínculo
                            </button>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(r.previsto)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(r.pago)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(r.aPagar)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(r.saldo)}</TableCell>
                    <TableCell className="align-top">
                      {review && valid ? (
                        <div className="text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1 text-foreground">
                            <Check className="h-3 w-3 text-success" />
                            {DECISION_LABEL[review.decision as Decision]}
                          </span>
                          Revisto por {reviewerName(review.reviewed_by)} em {format(new Date(review.reviewed_at), "dd/MM/yyyy HH:mm")}
                        </div>
                      ) : (
                        <div className="flex flex-col items-start gap-1">
                          {review && (
                            <Badge variant="outline" className="text-[9px] bg-warning/10 text-warning border-warning/30">
                              Revisão desactualizada
                            </Badge>
                          )}
                          {canManageBp ? (
                            <div className="flex flex-wrap gap-1">
                              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => openDialog(r, "pending_invoice")}>
                                Fatura por chegar
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => openDialog(r, "partner_paid")}>
                                Pago por sócio
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => openDialog(r, "adjusted")}>
                                Ajustar previsto
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">por rever</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>

                  {isOpen && (
                    <TableRow key={`${r.forecastId}-cands`} className="bg-muted/20">
                      <TableCell colSpan={7} className="py-2">
                        <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Transações da mesma rubrica sem linha de BP — vincular antes de decidir.
                        </p>
                        <div className="space-y-1">
                          {cands.map((t: any) => (
                            <div key={t.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                              <span className="font-mono">{formatDatePT(t.date)}</span>
                              <span className="text-muted-foreground">{t.suppliers?.name || "—"}</span>
                              <span className="min-w-0 truncate">{t.description}</span>
                              <span className="font-mono">{formatCurrency(Number(t.amount))}</span>
                              <Badge variant="outline" className="text-[9px]">{t.status}</Badge>
                              {t.installment_group_id && (
                                <Badge variant="outline" className="text-[9px]">grupo de parcelas</Badge>
                              )}
                              {canManageBp && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px]"
                                  disabled={saving}
                                  onClick={() => linkTx(r, t)}
                                >
                                  <Link2 className="mr-1 h-3 w-3" /> Vincular a esta linha
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      )}

      <div className="px-4 py-3 border-t border-border/50 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Obrigação futura da MP</p>
          <p className="font-mono text-sm font-bold">{formatCurrency(totals.obligation)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Financiamento de sócios a devolver</p>
          <p className="font-mono text-sm font-bold">{formatCurrency(totals.partner)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Por rever</p>
          <p className="font-mono text-sm font-bold text-warning">{formatCurrency(totals.unreviewed)}</p>
        </div>
      </div>

      <Dialog open={!!dialogRow} onOpenChange={(o) => !o && setDialogRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogRow ? DECISION_LABEL[dialogDecision] : ""}</DialogTitle>
            <DialogDescription>
              {dialogRow?.description || "—"} · saldo {formatCurrency(netSaldoById.get(dialogRow?.forecastId || "") ?? 0)} s/IVA
            </DialogDescription>
          </DialogHeader>

          {dialogDecision === "adjusted" && (
            <div className="space-y-2">
              <Label htmlFor="bp-review-amount">Novo previsto (s/IVA)</Label>
              <Input
                id="bp-review-amount"
                inputMode="decimal"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Não pode ficar abaixo do realizado da linha. O previsto original fica intacto.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="bp-review-note">
              {dialogDecision === "adjusted" ? "Observação (obrigatória)" : "Nota (opcional)"}
            </Label>
            <Textarea id="bp-review-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogRow(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={saveDecision} disabled={saving}>
              Registar decisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
