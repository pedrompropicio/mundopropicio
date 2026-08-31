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

  return {
    canRenegotiate: structurallyOk && paymentCount === 0,
    isManager,
  };
}

export function TransactionRenegotiateInstallmentsModal({
  transaction,
  onClose,
}: {
  transaction: any;
  onClose: () => void;
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
      const groupId = crypto.randomUUID();
      const changedBy = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
      const audit: any[] = [];

      // ---- 1) A original passa a ser a parcela 1/N ----
      const oldAmount = baseTotal;
      const oldDue = transaction.due_date ?? null;
      const firstNet = nets[0] ?? 0;
      const firstDue = rows[0].scheduled_date;

      const rootPatch: any = {
        description: `${baseDescription} (1/${n})`,
        amount: firstNet,
        due_date: firstDue,
        installment_group_id: groupId,
        installment_number: 1,
        installment_total: n,
      };
      if (transaction.currency && transaction.currency !== "EUR" && transaction.original_amount != null) {
        rootPatch.original_amount = +(
          (Number(transaction.original_amount) * firstNet) / (baseTotal || 1)
        ).toFixed(2);
      }
      const { error: rootErr } = await supabase
        .from("transactions")
        .update(rootPatch)
        .eq("id", transaction.id);
      if (rootErr) throw rootErr;

      audit.push({
        transaction_id: transaction.id,
        changed_by: changedBy,
        field_name: "Valor (renegociação em parcelas)",
        old_value: oldAmount.toFixed(2),
        new_value: Number(firstNet).toFixed(2),
      });
      audit.push({
        transaction_id: transaction.id,
        changed_by: changedBy,
        field_name: "Data Vencimento (renegociação em parcelas)",
        old_value: oldDue ?? "",
        new_value: firstDue,
      });

      // ---- 2) Parcelas 2..N ----
      for (let i = 1; i < n; i++) {
        const parcelNet = nets[i] ?? 0;
        const payload: any = {
          description: `${baseDescription} (${i + 1}/${n})`,
          type: transaction.type,
          amount: parcelNet,
          iva_rate: ivaRate,
          event_id: transaction.event_id ?? null,
          category_id: transaction.category_id ?? null,
          supplier_id: transaction.supplier_id ?? null,
          account_id: transaction.account_id ?? null,
          specification: transaction.specification ?? null,
          date: transaction.date,
          due_date: rows[i].scheduled_date,
          status: transaction.status,
          paid_amount: 0,
          payment_date: null,
          is_reimbursement: false,
          is_transitory: false,
          exclude_from_result: transaction.exclude_from_result ?? false,
          invoice_ref: transaction.invoice_ref ?? null,
          invoice_group_id: transaction.invoice_group_id ?? null,
          payment_method: transaction.payment_method ?? "transfer",
          payment_entity: transaction.payment_entity ?? null,
          payment_reference: transaction.payment_reference ?? null,
          ordering_partner_id: transaction.ordering_partner_id ?? null,
          paying_partner_id: transaction.paying_partner_id ?? null,
          currency: transaction.currency ?? "EUR",
          fx_rate: transaction.fx_rate ?? null,
          fx_rate_source: transaction.fx_rate_source ?? null,
          original_amount:
            transaction.currency && transaction.currency !== "EUR" && transaction.original_amount != null
              ? +((Number(transaction.original_amount) * parcelNet) / (baseTotal || 1)).toFixed(2)
              : null,
          parent_transaction_id: transaction.id,
          installment_group_id: groupId,
          installment_number: i + 1,
          installment_total: n,
          split_percentage: null,
          split_amount: null,
        };
        if (transaction.company_id) payload.company_id = transaction.company_id;

        const { data: created, error: sErr } = await supabase
          .from("transactions")
          .insert(payload)
          .select("id")
          .single();
        if (sErr) throw sErr;
        if (created?.id) {
          audit.push({
            transaction_id: created.id,
            changed_by: changedBy,
            field_name: "Criação (renegociação em parcelas)",
            old_value: null,
            new_value: `${baseDescription} (${i + 1}/${n}) — ${Number(rows[i].amount).toFixed(2)} € (bruto) — venc. ${rows[i].scheduled_date}`,
          });
        }
      }

      const { error: aErr } = await supabase.from("transaction_audit_log").insert(audit);
      if (aErr) console.error("[renegotiate installments audit] failed", aErr);

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
