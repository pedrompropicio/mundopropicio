import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  TransactionInstallmentsEditor,
  validateInstallments,
  type PlannedInstallment,
} from "@/components/TransactionInstallmentsEditor";
import { computeInstallmentNets } from "@/lib/installment-nets";
import { stripInstallmentSuffix } from "@/lib/installment-guard";
import { invalidateTransactionQueries } from "@/lib/invalidate-transactions";

/**
 * Renegociar em parcelas — transforma uma despesa de pagamento único (sem
 * qualquer valor pago) num grupo de N transações irmãs.
 *
 * A transação original passa a ser a parcela 1/N: mantém `id`, `forecast_id`,
 * rubrica, fornecedor, ordenador, pagador, conta e anexos. As parcelas 2..N
 * nascem como transações novas com o mesmo `installment_group_id`.
 *
 * Identificação ESTRUTURAL: o sufixo "(i/N)" na descrição é cosmético e nunca
 * é lido.
 */

const eur = (v: number) =>
  v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

/** Traduz os códigos de exceção da RPC em mensagens legíveis. */
const RPC_ERRORS: Record<string, string> = {
  permission_denied: "Apenas administradores ou gestores podem renegociar em parcelas.",
  transaction_not_found: "Transação não encontrada.",
  not_expense: "Apenas despesas podem ser renegociadas em parcelas.",
  already_paid: "A transação já tem valor pago.",
  has_payments: "A transação já tem pagamentos registados.",
  already_installment_group: "A transação já pertence a um grupo de parcelas.",
  is_split: "Transações de rateio não podem ser renegociadas em parcelas.",
  is_split_parent:
    "Transações rateadas entre eventos não podem ser renegociadas em parcelas; ajuste o rateio primeiro.",
  is_reimbursement: "Notas de reembolso não podem ser renegociadas em parcelas.",
  is_transitory: "Transações transitórias não podem ser renegociadas em parcelas.",
  is_partner_paid: "Despesas pagas por sócio não podem ser renegociadas em parcelas.",
  is_partner_extra: "Extras de sócio não podem ser renegociados em parcelas.",
  event_completed: "O evento associado está fechado.",
  invalid_installments: "Lista de parcelas inválida.",
  too_few_installments: "São necessárias pelo menos 2 parcelas.",
  invalid_due_date: "Há parcelas sem data de vencimento.",
  invalid_amount: "Há parcelas com valor inválido.",
  installments_sum_mismatch:
    "A soma das parcelas não bate com o valor da transação.",
};

export function translateRpcError(message: string): string {
  const code = String(message ?? "").match(/([a-z_]+):/)?.[1];
  const friendly = code ? RPC_ERRORS[code] : undefined;
  return friendly ? `${friendly} (${message})` : message;
}

const fmtDate = (s: string) => {
  const [y, m, d] = String(s).split("-");
  return d ? `${d}/${m}/${y}` : s;
};

/** Elegibilidade da ação (ver `.lovable/memory/features/transaction-installments.md`). */
export function useCanRenegotiateInstallments(params: {
  transaction: any;
  isPaidByPartner: boolean;
  isPartnerExtra: boolean;
  eventCompleted: boolean;
}) {
  const { transaction, isPaidByPartner, isPartnerExtra, eventCompleted } = params;
  const { isManager } = useAuth();

  const structurallyOk =
    transaction?.type === "expense" &&
    Number(transaction?.paid_amount ?? 0) <= 0 &&
    !transaction?.installment_group_id &&
    transaction?.split_percentage === null &&
    !transaction?.is_reimbursement &&
    !transaction?.is_transitory &&
    !isPaidByPartner &&
    !isPartnerExtra &&
    !eventCompleted &&
    Number(transaction?.amount ?? 0) > 0;

  const { data: paymentCount = 0 } = useQuery({
    queryKey: ["tx-payment-count", transaction?.id],
    enabled: !!transaction?.id && structurallyOk,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("transaction_payments")
        .select("id", { count: "exact", head: true })
        .eq("transaction_id", transaction.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Mãe de rateio: as filhas é que têm split_percentage. A validação
  // `split_percentage === null` acima só protege a FILHA — este contador
  // protege o lado oposto da relação pai-filho.
  const { data: splitChildCount = 0 } = useQuery({
    queryKey: ["tx-split-child-count", transaction?.id],
    enabled: !!transaction?.id && structurallyOk,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("parent_transaction_id", transaction.id)
        .not("split_percentage", "is", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  return {
    canRenegotiate: structurallyOk && paymentCount === 0 && splitChildCount === 0,
    isManager,
  };
}


export function TransactionRenegotiateInstallmentsModal({
  transaction,
  onClose,
  onSuccess,
}: {
  transaction: any;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const ivaRate = Number(transaction.iva_rate) || 0;
  const baseTotal = Number(transaction.amount) || 0;
  const ivaMultiplier = 1 + ivaRate / 100;
  const grossTotal = +(baseTotal * ivaMultiplier).toFixed(2);

  const defaultFirstDate: string = transaction.due_date || transaction.date;

  const [rows, setRows] = useState<PlannedInstallment[]>([]);
  const [wizard, setWizard] = useState<{
    count: number;
    firstDate: string;
    interval: "weekly" | "biweekly" | "monthly";
  }>({ count: 2, firstDate: defaultFirstDate, interval: "monthly" });
  const [confirming, setConfirming] = useState(false);

  const validationError = useMemo(
    () => validateInstallments(rows, grossTotal),
    [rows, grossTotal],
  );

  const baseDescription = stripInstallmentSuffix(transaction.description);


  const mutation = useMutation({
    mutationFn: async () => {
      const err = validateInstallments(rows, grossTotal);
      if (err) throw new Error(err);

      const n = rows.length;
      const nets = computeInstallmentNets(
        rows.map((r) => Number(r.amount) || 0),
        baseTotal,
        ivaMultiplier,
      );
      const changedBy = user?.user_metadata?.full_name ?? user?.email ?? "sistema";

      // Escrita ATÓMICA no servidor: UPDATE da original + INSERT das parcelas
      // 2..N + auditoria, tudo numa só transação. As validações (11 condições)
      // são reavaliadas do lado do servidor — a validação de UI é só feedback.
      const { data, error } = await supabase.rpc("renegotiate_transaction_installments", {
        p_transaction_id: transaction.id,
        p_installments: rows.map((r, i) => ({
          due_date: r.scheduled_date,
          amount: nets[i] ?? 0,
        })),
        p_changed_by: changedBy,
      });
      if (error) throw new Error(translateRpcError(error.message));
      void data;

      return n;
    },
    onSuccess: (n) => {
      invalidateTransactionQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["installment-group"] });
      toast({ title: `Renegociado em ${n} parcelas` });
      onClose();
    },
    onError: (e: any) =>
      toast({
        title: "Erro ao renegociar em parcelas",
        description: e.message,
        variant: "destructive",
      }),
  });

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
      <div className="glass w-full max-w-2xl rounded-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Layers className="h-4 w-4 text-primary" /> Renegociar em parcelas
            </h2>
            <p className="text-xs text-muted-foreground">
              {baseDescription} · total {eur(grossTotal)} (c/IVA {ivaRate}%)
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!confirming ? (
          <>
            <TransactionInstallmentsEditor
              grossTotal={grossTotal}
              defaultFirstDate={defaultFirstDate}
              installments={rows}
              onChange={setRows}
              count={wizard.count}
              firstDate={wizard.firstDate}
              interval={wizard.interval}
              onWizardChange={setWizard}
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!!validationError}
                onClick={() => setConfirming(true)}
              >
                Continuar
              </Button>
            </div>
            {validationError && (
              <p className="text-xs text-destructive">{validationError}</p>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 space-y-2">
              <p className="font-semibold">
                A transação atual passa a ser a 1ª parcela de {rows.length}.
              </p>
              <p>
                Mantém o mesmo registo (rubrica, fornecedor, vínculo ao BP e anexos) e
                fica com o valor e o vencimento da parcela 1. As restantes{" "}
                {rows.length - 1} parcelas são criadas como transações novas do mesmo
                grupo. Os anexos <strong>não</strong> são duplicados — ficam na 1ª parcela.
              </p>
            </div>

            <div className="rounded-md border border-border bg-background divide-y divide-border/50 text-xs">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-muted-foreground">
                    Parcela {i + 1}/{rows.length}
                    {i === 0 && (
                      <span className="ml-1.5 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                        transação atual
                      </span>
                    )}
                  </span>
                  <span className="font-mono">
                    {fmtDate(r.scheduled_date)} · {eur(Number(r.amount) || 0)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 px-3 py-2 font-semibold">
                <span>Total</span>
                <span className="font-mono">
                  {eur(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0))}
                </span>
              </div>
            </div>

            {validationError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {validationError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirming(false)}
                disabled={mutation.isPending}
              >
                Voltar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!!validationError || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "A gravar…" : "Confirmar renegociação"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
