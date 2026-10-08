import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompany } from "@/hooks/useCompany";
import {
  canCheckDuplicates,
  findDuplicateTransactions,
  normalizeInvoiceRef,
  type DuplicateCandidate,
  type DuplicateCheckInput,
} from "@/lib/transaction-duplicate-check";

type HookInput = Omit<DuplicateCheckInput, "companyId"> & { enabled?: boolean };

/**
 * #284 — estado do aviso de duplicação. `needsConfirmation` fica true enquanto
 * houver candidatas e a pessoa não tiver marcado a confirmação. NUNCA bloqueia
 * por si: o ecrã usa-o só para pedir o visto antes de gravar.
 */
export function useTransactionDuplicateCheck(input: HookInput) {
  const { companyId } = useCompany() as any;
  const full: DuplicateCheckInput = { ...input, companyId };
  const enabled = (input.enabled ?? true) && canCheckDuplicates(full);
  const amountKey = Math.round((Number(input.amount) || 0) * 100);
  const { data: candidates = [] } = useQuery({
    queryKey: [
      "tx-duplicate-check",
      companyId,
      input.supplierId,
      normalizeInvoiceRef(input.invoiceRef),
      amountKey,
      input.date,
      input.excludeTransactionId ?? null,
      !!input.onlyInvoiceRefRule,
    ],
    enabled,
    staleTime: 15_000,
    queryFn: () => findDuplicateTransactions(full),
  });
  const list = enabled ? candidates : [];
  const signature = list.map((c) => c.id).join(",");
  const [confirmed, setConfirmed] = useState(false);
  // Nova lista de candidatas → pede nova confirmação.
  useEffect(() => setConfirmed(false), [signature]);
  return {
    candidates: list as DuplicateCandidate[],
    confirmed,
    setConfirmed,
    needsConfirmation: list.length > 0 && !confirmed,
  };
}

const STATUS_LABEL: Record<string, string> = {
  paid: "Paga",
  approved: "Aprovada",
  pending: "Pendente",
  partial: "Paga parcialmente",
};

const fmt = (v: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
const fmtDate = (d: string | null) => {
  const p = String(d ?? "").slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : "—";
};

export function TransactionDuplicateWarning({
  state,
}: {
  state: ReturnType<typeof useTransactionDuplicateCheck>;
}) {
  const { candidates, confirmed, setConfirmed } = state;
  if (candidates.length === 0) return null;
  const byRef = candidates[0].rule === "invoice_ref";
  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold text-amber-600">
        <AlertTriangle className="h-4 w-4" />
        {byRef ? "Possível fatura repetida deste fornecedor" : "Possível despesa repetida deste fornecedor"}
      </p>
      <ul className="mt-2 space-y-1">
        {candidates.map((t) => (
          <li key={t.id} className="flex justify-between gap-2">
            <span className="truncate">
              {fmtDate(t.date)} · {t.description ?? "(sem descrição)"}
              {t.event_name ? ` · ${t.event_name}` : ""} · {STATUS_LABEL[t.status ?? ""] ?? t.status ?? "—"}
            </span>
            <span className="shrink-0 tabular-nums font-medium">
              {fmt(t.amount)}
              {t.paid_amount > 0 ? ` (pago ${fmt(t.paid_amount)})` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        {byRef
          ? "Já existe uma despesa deste fornecedor com o mesmo nº de fatura. Se for o mesmo documento, gravar vai lançá-lo uma segunda vez. Se for uma fatura repartida por várias linhas ou uma proforma, podes gravar."
          : "Já existe uma despesa deste fornecedor com o mesmo valor a menos de 30 dias. Se for o mesmo talão, gravar vai lançá-lo uma segunda vez. Se for uma repetição real, podes gravar."}
      </p>
      <label className="mt-2 flex items-center gap-2 text-xs font-medium">
        <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
        Confirmo que não é a mesma despesa e quero gravar
      </label>
    </div>
  );
}

export const DUPLICATE_CONFIRM_TOAST = {
  title: "Possível duplicado",
  description: "Vê o aviso âmbar e confirma que não é a mesma despesa para gravar.",
  variant: "destructive" as const,
};
