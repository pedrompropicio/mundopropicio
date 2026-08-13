import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCardSessionQueries } from "@/lib/card-session-helpers";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { X, Lock } from "lucide-react";
import { formatCurrency } from "@/lib/card-session-helpers";

interface SessionData {
  id: string;
  card_account_id: string;
  card_name: string;
  opening_balance: number;
  total_loads: number;
  total_approved_expenses: number;
  pending_items: number;
  expenses_by_event: Record<string, { name: string; amount: number }>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: SessionData;
}

export function CloseCardSessionModal({ open, onOpenChange, session }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const theoretical = session.opening_balance + session.total_loads - session.total_approved_expenses;
  const [confirmedBalance, setConfirmedBalance] = useState(String(theoretical.toFixed(2)));
  const [note, setNote] = useState("");
  const [createAdjustment, setCreateAdjustment] = useState(false);
  const [confirmedHighDiff, setConfirmedHighDiff] = useState(false);

  const diff = parseFloat(confirmedBalance) - theoretical;
  const adjType: "income" | "expense" = diff < 0 ? "expense" : "income";

  // Salvaguarda: diferença invulgarmente alta (>50% do gasto aprovado) sugere
  // que foi digitado o saldo de abertura em vez do saldo atual do cartão.
  const noteRequired = Math.abs(diff) > 0.01 && createAdjustment;

  const highDiff =
    !isNaN(diff) &&
    session.total_approved_expenses > 0 &&
    Math.abs(diff) > session.total_approved_expenses * 0.5;

  const close = useMutation({
    mutationFn: async () => {
      if (session.pending_items > 0) throw new Error("Existem itens pendentes de aprovação.");
      if (highDiff && !confirmedHighDiff) throw new Error("Confirme a diferença invulgarmente alta antes de fechar.");
      const confirmed = parseFloat(confirmedBalance);
      if (isNaN(confirmed)) throw new Error("Saldo real inválido.");

      // Ajuste opcional
      if (Math.abs(diff) > 0.01 && createAdjustment) {
        if (!note.trim())
          throw new Error(
            "Explica a origem da diferença (ex.: fatura perdida pelo operador do cartão).",
          );
        const amt = Math.abs(diff);
        const type = adjType; // diff < 0 → despesa não registada; diff > 0 → receita/sobra
        const today = new Date().toISOString().split("T")[0];
        // Conciliação de saldo da conta do cartão — NÃO é receita/despesa do
        // evento: sem categoria do plano de contas, sem evento, IVA 0 e
        // exclude_from_result para nunca entrar em BP / P&L / apuramento IVA.
        const { error } = await supabase.from("transactions").insert({
          description: `Acerto de fecho de sessão — cartão ${session.card_name}${note.trim() ? ` (${note.trim()})` : ""}`,
          type,
          amount: amt,
          iva_rate: 0,
          category_id: null,
          account_id: session.card_account_id,
          date: today,
          status: "paid",
          paid_amount: amt,
          payment_date: today,
          exclude_from_result: true,
          card_session_id: session.id,
        });

        if (error) throw error;
      }

      const summary = {
        opening_balance: session.opening_balance,
        total_loads: session.total_loads,
        total_approved_expenses: session.total_approved_expenses,
        theoretical_balance: theoretical,
        confirmed_balance: parseFloat(confirmedBalance),
        difference: diff,
        adjustment_created: Math.abs(diff) > 0.01 && createAdjustment,
        note: note.trim() || null,
        expenses_by_event: session.expenses_by_event,
        closed_by_user_id: user?.id ?? null,
        closed_at: new Date().toISOString(),
      };

      const { error: updErr } = await supabase
        .from("card_sessions")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          closed_by: user?.id ?? null,
          closing_balance_confirmed: parseFloat(confirmedBalance),
          closing_summary: summary,
        })
        .eq("id", session.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast({ title: "Sessão fechada." });
      invalidateCardSessionQueries(qc, session.id);
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Fechar sessão de cartão</h2>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {session.pending_items > 0 ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600">
            Existem <strong>{session.pending_items}</strong> item(s) pendentes de aprovação. Aprove ou rejeite antes de fechar.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
              <Row label="Saldo abertura" value={formatCurrency(session.opening_balance)} />
              <Row label="Recargas" value={formatCurrency(session.total_loads)} />
              <Row label="Despesas aprovadas" value={`− ${formatCurrency(session.total_approved_expenses)}`} />
              <hr className="my-2 border-border" />
              <Row label="Saldo teórico" value={formatCurrency(theoretical)} bold />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Saldo real conferido no cartão</label>
              <input
                type="number" step="0.01"
                value={confirmedBalance}
                onChange={(e) => setConfirmedBalance(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {Math.abs(diff) > 0.01 && (
                <p className={`mt-1 text-xs font-medium ${diff < 0 ? "text-destructive" : "text-emerald-500"}`}>
                  Diferença: {diff > 0 ? "+" : ""}{formatCurrency(diff)}
                </p>
              )}
              {highDiff && (
                <div className="mt-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-600">
                  <p className="font-semibold">Diferença invulgarmente alta</p>
                  <p className="mt-1">
                    Confirma que digitaste o saldo <strong>ATUAL</strong> do cartão (não o saldo de abertura).
                    Uma diferença grande normalmente significa despesa mal registada — investiga antes de ajustar.
                  </p>
                  <label className="mt-2 flex cursor-pointer items-center gap-2 font-medium">
                    <input type="checkbox" checked={confirmedHighDiff} onChange={(e) => setConfirmedHighDiff(e.target.checked)} />
                    Confirmo que este é o saldo atual do cartão
                  </label>
                </div>
              )}
            </div>

            {Math.abs(diff) > 0.01 && (
              <div className="rounded-lg border border-border/60 p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={createAdjustment} onChange={(e) => setCreateAdjustment(e.target.checked)} />
                  Criar transação de ajuste ({adjType === "expense" ? "despesa" : "receita"})
                </label>
                {createAdjustment && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Conciliação do saldo da conta do cartão — sem categoria do plano de contas e
                    fora do BP/P&amp;L do evento. A nota abaixo é obrigatória.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Nota / justificação {noteRequired && <span className="text-destructive">*</span>}
              </label>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              {noteRequired && !note.trim() && (
                <p className="mt-1 text-xs text-destructive">
                  Explica a origem da diferença (ex.: fatura perdida pelo operador do cartão).
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              O saldo remanescente fica no cartão. A próxima sessão abre com esse saldo como opening_balance.
            </p>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => onOpenChange(false)} className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-muted">Cancelar</button>
              <button
                type="button"
                onClick={() => close.mutate()}
                disabled={close.isPending || (highDiff && !confirmedHighDiff) || (noteRequired && !note.trim())}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {close.isPending ? "A fechar…" : "Fechar sessão"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
