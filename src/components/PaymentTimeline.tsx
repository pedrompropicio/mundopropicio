import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { calcWithIva, formatDatePT } from "@/lib/utils";
import {
  Receipt,
  ListChecks,
  Wallet,
  HandCoins,
  Users,
  Loader2,
} from "lucide-react";

interface Props {
  transaction: any;
}

/**
 * Timeline unificado de pagamento de uma transação.
 * Agrega em vista única:
 *  - Parcelas individuais (transaction_payments)
 *  - Lista de pagamento (payment_list_items + payment_lists)
 *  - Nota de reembolso (reimbursement_note_items + reimbursement_notes)
 *  - Crédito de fornecedor utilizado (supplier_credit_usages)
 *  - Pago por sócio (partner_paid_expenses)
 */
export function PaymentTimeline({ transaction }: Props) {
  const txId = transaction.id;
  const baseAmount = Number(transaction.amount ?? 0);
  const ivaRate = Number(transaction.iva_rate ?? 0);
  const totalWithIva = calcWithIva(baseAmount, ivaRate);

  const { data, isLoading } = useQuery({
    queryKey: ["payment-timeline", txId],
    queryFn: async () => {
      const [
        paymentsRes,
        plItemsRes,
        rnItemsRes,
        creditUsagesRes,
        partnerPaidRes,
      ] = await Promise.all([
        supabase
          .from("transaction_payments" as any)
          .select("id, amount, payment_date, payment_method, account_id, invoice_ref, financial_accounts:account_id(name)")
          .eq("transaction_id", txId)
          .order("payment_date", { ascending: true }),
        supabase
          .from("payment_list_items")
          .select("id, payment_list_id, manually_marked_paid, payment_lists:payment_list_id(id, title, status, payment_date)")
          .eq("transaction_id", txId),
        supabase
          .from("reimbursement_note_items")
          .select("id, reimbursement_note_id, reimbursement_notes:reimbursement_note_id(id, code, status, employee_name, paid_at, total_amount)")
          .eq("transaction_id", txId),
        supabase
          .from("supplier_credit_usages")
          .select("id, amount, used_by, created_at, credit_id, supplier_credits:credit_id(reason, document_ref)")
          .eq("transaction_id", txId),
        supabase
          .from("partner_paid_expenses")
          .select("id, partner_id, notes, created_at, event_partners:partner_id(supplier_id, suppliers:supplier_id(name))")
          .eq("transaction_id", txId),
      ]);

      return {
        payments: (paymentsRes.data ?? []) as any[],
        paymentListItems: (plItemsRes.data ?? []) as any[],
        reimbursementItems: (rnItemsRes.data ?? []) as any[],
        creditUsages: (creditUsagesRes.data ?? []) as any[],
        partnerPaid: (partnerPaidRes.data ?? []) as any[],
      };
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-secondary/30 p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const payments = data?.payments ?? [];
  const paymentListItems = data?.paymentListItems ?? [];
  const reimbursementItems = data?.reimbursementItems ?? [];
  const creditUsages = data?.creditUsages ?? [];
  const partnerPaid = data?.partnerPaid ?? [];

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalCredit = creditUsages.reduce((s, c) => s + Number(c.amount), 0);
  const openBalance = Math.max(0, totalWithIva - totalPaid - totalCredit);

  const hasAny =
    payments.length > 0 ||
    paymentListItems.length > 0 ||
    reimbursementItems.length > 0 ||
    creditUsages.length > 0 ||
    partnerPaid.length > 0;

  if (!hasAny) {
    return (
      <div className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
        Esta transação ainda não tem pagamentos, listas, reembolsos, créditos ou registos de pagamento por sócio.
      </div>
    );
  }

  const methodLabels: Record<string, string> = {
    transfer: "Transferência",
    service_payment: "Pag. Serviços",
    state_payment: "Pag. Estado",
  };

  return (
    <div className="space-y-3">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-xs">
        <div>
          <div className="text-muted-foreground">Total c/ IVA</div>
          <div className="font-mono font-semibold">{formatCurrency(totalWithIva)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Pago + Crédito</div>
          <div className="font-mono font-semibold text-success">
            {formatCurrency(totalPaid + totalCredit)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Saldo aberto</div>
          <div className={`font-mono font-semibold ${openBalance > 0.01 ? "text-warning" : "text-muted-foreground"}`}>
            {formatCurrency(openBalance)}
          </div>
        </div>
      </div>

      {/* Parcelas */}
      {payments.length > 0 && (
        <Section icon={<Receipt className="h-3.5 w-3.5" />} title={`Parcelas pagas (${payments.length})`}>
          <ul className="divide-y divide-border/40">
            {payments.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-muted-foreground">#{i + 1}</span>
                  <span>{formatDatePT(p.payment_date)}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {methodLabels[p.payment_method] ?? p.payment_method}
                  </span>
                  {p.financial_accounts?.name && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground truncate max-w-[120px]">
                        {p.financial_accounts.name}
                      </span>
                    </>
                  )}
                </div>
                <span className="font-mono font-semibold">{formatCurrency(Number(p.amount))}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Listas de pagamento */}
      {paymentListItems.length > 0 && (
        <Section icon={<ListChecks className="h-3.5 w-3.5" />} title={`Em lista de pagamento (${paymentListItems.length})`}>
          <ul className="divide-y divide-border/40">
            {paymentListItems.map((it) => {
              const list = it.payment_lists;
              return (
                <li key={it.id} className="flex items-center justify-between py-1.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{list?.title ?? "—"}</span>
                    <StatusPill status={list?.status} />
                    {it.manually_marked_paid && (
                      <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] text-success">
                        Marcado pago
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {list?.payment_date ? formatDatePT(list.payment_date) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* Notas de reembolso */}
      {reimbursementItems.length > 0 && (
        <Section icon={<Wallet className="h-3.5 w-3.5" />} title={`Em nota de reembolso (${reimbursementItems.length})`}>
          <ul className="divide-y divide-border/40">
            {reimbursementItems.map((it) => {
              const note = it.reimbursement_notes;
              return (
                <li key={it.id} className="flex items-center justify-between py-1.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono">{note?.code ?? "—"}</span>
                    <span className="text-muted-foreground truncate">{note?.employee_name ?? ""}</span>
                    <StatusPill status={note?.status} />
                  </div>
                  <span className="text-muted-foreground">
                    {note?.paid_at ? formatDatePT(note.paid_at.split("T")[0]) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* Créditos de fornecedor */}
      {creditUsages.length > 0 && (
        <Section icon={<HandCoins className="h-3.5 w-3.5" />} title={`Crédito de fornecedor aplicado (${creditUsages.length})`}>
          <ul className="divide-y divide-border/40">
            {creditUsages.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-1.5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">
                    {u.supplier_credits?.reason ?? "Crédito"}
                  </span>
                  {u.supplier_credits?.document_ref && (
                    <span className="text-muted-foreground">· {u.supplier_credits.document_ref}</span>
                  )}
                </div>
                <span className="font-mono font-semibold text-primary">
                  −{formatCurrency(Number(u.amount))}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Pago por sócio */}
      {partnerPaid.length > 0 && (
        <Section icon={<Users className="h-3.5 w-3.5" />} title="Pago por sócio">
          <ul className="divide-y divide-border/40">
            {partnerPaid.map((pp) => (
              <li key={pp.id} className="flex items-center justify-between py-1.5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-500">🤝 Sócio</span>
                  <span className="truncate">
                    {pp.event_partners?.suppliers?.name ?? "Sócio"}
                  </span>
                  {pp.notes && <span className="text-muted-foreground truncate">· {pp.notes}</span>}
                </div>
                <span className="text-muted-foreground">
                  {pp.created_at ? formatDatePT(pp.created_at.split("T")[0]) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/50">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="px-3 py-1">{children}</div>
    </div>
  );
}

function StatusPill({ status }: { status?: string }) {
  if (!status) return null;
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
    pending: { label: "Pendente", cls: "bg-warning/15 text-warning" },
    approved: { label: "Aprovada", cls: "bg-blue-500/15 text-blue-500" },
    paid: { label: "Paga", cls: "bg-success/15 text-success" },
    cancelled: { label: "Cancelada", cls: "bg-destructive/15 text-destructive" },
  };
  const cfg = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${cfg.cls}`}>{cfg.label}</span>;
}
