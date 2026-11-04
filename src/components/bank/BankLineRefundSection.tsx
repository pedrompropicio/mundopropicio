import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useCompanyLocale } from "@/hooks/useCompanyLocale";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/company-locale";
import { formatDatePT } from "@/lib/utils";

interface Props {
  line: {
    id: string;
    amount: number | string | null;
    description: string | null;
    value_date: string | null;
    booking_date: string | null;
  };
  accountId: string;
  onDone: () => void;
}

/** Mesma paginação sem truncar de BankReconciliation, com ordem única por id. */
async function fetchAllPages<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await run(from, from + 999);
    if (error) throw error;
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < 1000) return out;
  }
}

const group = "Devolução de pagamento — despesas pagas nesta conta";

export function BankLineRefundSection({ line, accountId, onDone }: Props) {
  const companyLocale = useCompanyLocale();
  const headingId = useId();
  const [transactionId, setTransactionId] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const amount = Math.abs(Number(line.amount));
  const isCredit = Number(line.amount) > 0 && Number.isFinite(amount);
  const { data: candidates = [], isPending, isFetching, error } = useQuery({
    queryKey: ["bank-recon-refund-candidates", line.id, accountId],
    enabled: isCredit && !!accountId,
    queryFn: async () => {
      // Não usa txns/accountExplainedIds: o pagamento pode pertencer a um lote SEPA.
      const payments = await fetchAllPages((from, to) => supabase
        .from("transaction_payments")
        .select("id, transaction_id, payment_date")
        .eq("account_id", accountId)
        .eq("status", "paid")
        .is("reversed_at", null)
        .is("reversal_kind", null)
        .is("offset_group_id", null)
        .neq("payment_method", "compensation")
        .eq("amount", amount)
        .order("id").range(from, to));
      const ids = [...new Set(payments.map((payment) => payment.transaction_id))];
      const result = [];
      // Além da paginação, limita os IDs por pedido para não exceder o URL PostgREST.
      for (let start = 0; start < ids.length; start += 100) {
        const transactions = await fetchAllPages((from, to) => supabase
          .from("transactions")
          .select("id, description, date, suppliers:suppliers!transactions_supplier_id_fkey(name)")
          .in("id", ids.slice(start, start + 100))
          .eq("type", "expense")
          .is("reversed_at", null)
          .order("id").range(from, to));
        if (!transactions.length) continue;
        const refunds = await fetchAllPages((from, to) => supabase
          .from("transaction_payments")
          .select("id, transaction_id")
          .in("transaction_id", transactions.map((transaction) => transaction.id))
          .eq("status", "reversed")
          .eq("reversal_kind", "cash_refund")
          .order("id").range(from, to));
        for (const transaction of transactions) {
          result.push({
            ...transaction,
            paymentDate: payments.find((payment) => payment.transaction_id === transaction.id)?.payment_date,
            previousRefunds: refunds.filter((refund) => refund.transaction_id === transaction.id).length,
          });
        }
      }
      return result;
    },
  });
  const selected = candidates.find((candidate) => candidate.id === transactionId);
  const previousRefunds = selected?.previousRefunds ?? 0;
  const canSubmit = !!selected && !error && !isFetching && !saving &&
    !!line.description?.trim() && (previousRefunds === 0 || acknowledged);

  async function refund() {
    if (!canSubmit || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    try {
      // O servidor escolhe e valida a única perna; não há escrita direta nem fallback.
      const { error } = await supabase.rpc("reconcile_bank_line", {
        p_line_id: line.id,
        p_items: [{ transaction_id: transactionId, mode: "devolucao", amount }],
      });
      if (error) throw error;
      toast.success("Pagamento estornado e linha conciliada.");
      onDone();
    } catch (error) {
      const message = (error as { message?: string } | null)?.message ?? "desconhecido";
      toast.error(/Modo inválido \(devolucao\)/.test(message)
        ? "Estorno pela conciliação ainda não disponível no servidor (modo «devolução» por aplicar). Nada foi gravado."
        : "Erro ao estornar: " + message);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  if (!isCredit) return null;

  return (
    <section aria-labelledby={headingId} className="space-y-2 rounded-lg border p-3">
      <h3 id={headingId} className="font-medium">{group}</h3>
      <SearchableSelect
        value={transactionId}
        onValueChange={(value) => { setTransactionId(value); setAcknowledged(false); }}
        disabled={saving || isPending || !!error}
        placeholder="Escolher despesa para estornar"
        options={candidates.map((candidate) => ({
          value: candidate.id,
          group,
          label: `${formatDatePT(candidate.paymentDate ?? candidate.date)} · ${companyLocale.status === "available" ? formatMoney(amount, companyLocale) : "—"} · ${candidate.description} · ${candidate.suppliers?.name ?? "Sem fornecedor"}`,
          searchText: `${candidate.description} ${candidate.suppliers?.name ?? ""} ${amount}`,
        }))}
      />
      {isPending && <p className="text-xs text-muted-foreground" role="status">A procurar despesas pagas…</p>}
      {error && <p className="text-xs text-destructive" role="alert">Erro ao procurar despesas: {error.message}</p>}
      {!isPending && !error && candidates.length === 0 && (
        <p className="text-xs text-muted-foreground">Não há despesas pagas nesta conta pelo valor da linha.</p>
      )}
      {previousRefunds > 0 && (
        <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
          <p role="alert">Esta despesa já teve {previousRefunds} devolução(ões) — confirme que é uma nova devolução</p>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={acknowledged} disabled={saving}
              onChange={(event) => setAcknowledged(event.target.checked)} />
            Confirmo que é uma nova devolução.
          </label>
        </div>
      )}
      {!line.description?.trim() && (
        <p className="text-xs text-destructive">A linha do banco precisa de descrição para registar o motivo do estorno.</p>
      )}
      <Button type="button" variant="outline" disabled={!canSubmit} onClick={refund}>
        {saving ? "A estornar…" : "Estornar"}
      </Button>
    </section>
  );
}
