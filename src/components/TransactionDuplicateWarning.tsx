import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompany } from "@/hooks/useCompany";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
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
 *
 * Os campos que se escrevem a correr (descrição, invoiceRef, amount) passam por
 * debounce de 400 ms antes de entrar na queryKey; enquanto o valor com debounce
 * não igualou o actual (`settled`), o aviso fica em silêncio — nunca mostra
 * candidatas calculadas a partir de texto que já mudou.
 */
export function useTransactionDuplicateCheck(input: HookInput) {
  const { companyId } = useCompany() as any;
  const debouncedDescription = useDebouncedValue(input.description ?? "", 400);
  const debouncedInvoiceRef = useDebouncedValue(input.invoiceRef ?? "", 400);
  const debouncedAmount = useDebouncedValue(input.amount, 400);
  const settled =
    debouncedDescription === (input.description ?? "") &&
    debouncedInvoiceRef === (input.invoiceRef ?? "") &&
    debouncedAmount === input.amount;
  const full: DuplicateCheckInput = {
    ...input,
    description: debouncedDescription,
    invoiceRef: debouncedInvoiceRef,
    amount: debouncedAmount,
    companyId,
  };
  const enabled = (input.enabled ?? true) && canCheckDuplicates(full);
  const amountKey = Math.round((Number(debouncedAmount) || 0) * 100);
  const { data: candidates = [] } = useQuery({
    queryKey: [
      "tx-duplicate-check",
      companyId,
      input.supplierId,
      normalizeInvoiceRef(debouncedInvoiceRef),
      amountKey,
      input.date,
      debouncedDescription,
      input.eventId ?? null,
      input.excludeTransactionId ?? null,
      !!input.onlyInvoiceRefRule,
    ],
    enabled,
    staleTime: 15_000,
    queryFn: () => findDuplicateTransactions(full),
  });
  const list = enabled && settled ? candidates : [];
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

const TEXTS: Record<string, { title: string; text: string }> = {
  invoice_ref: {
    title: "Possível fatura repetida deste fornecedor",
    text: "Já existe uma despesa deste fornecedor com o mesmo nº de fatura. Se for o mesmo documento, gravar vai lançá-lo uma segunda vez. Se for uma fatura repartida por várias linhas ou uma proforma, podes gravar.",
  },
  amount_date: {
    title: "Possível despesa repetida deste fornecedor",
    text: "Já existe uma despesa deste fornecedor com o mesmo valor a menos de 30 dias. Se for o mesmo talão, gravar vai lançá-lo uma segunda vez. Se for uma repetição real, podes gravar.",
  },
  description: {
    title: "Possível despesa repetida neste evento",
    text: "Já existe uma despesa com a mesma descrição neste evento, com o mesmo valor ou o mesmo fornecedor. Se for a mesma despesa, gravar vai lançá-la uma segunda vez. Se for uma repetição real, podes gravar.",
  },
  mixed: {
    title: "Possível despesa repetida",
    text: "Já existem despesas parecidas com esta (mesmo nº de fatura, mesmo valor a menos de 30 dias ou mesma descrição no evento). Se for o mesmo documento, gravar vai lançá-lo uma segunda vez. Se for uma fatura repartida, uma proforma ou uma repetição real, podes gravar.",
  },
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
  const rules = new Set(candidates.map((c) => c.rule));
  const only = rules.size === 1 ? candidates[0].rule : null;
  const { title, text } = TEXTS[only ?? "mixed"];
  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold text-amber-600">
        <AlertTriangle className="h-4 w-4" />
        {title}
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
        {text}
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
