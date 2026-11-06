import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency as formatLegacyCurrency } from "@/lib/mock-data";
import { useCompanyLocale } from "@/hooks/useCompanyLocale";
import { formatMoney } from "@/lib/company-locale";
import { Link2, Trash2 } from "lucide-react";
import {
  offsetBadgeLabel,
  offsetOtherLabel,
  offsetsFor,
  removeOffset,
  useAllTransactionOffsets,
  useOffsetsInvalidate,
} from "@/lib/transaction-offsets";
import { formatDatePT } from "@/lib/utils";
import { OFFSET_GROUP_STATUS_LABEL, useOffsetGroupsForTransaction } from "@/lib/offset-plan/groups";
import { OffsetGroupDetailDialog } from "@/components/OffsetGroupDetailDialog";

interface Props {
  transaction: {
    id: string;
    type: string;
    supplier_id?: string | null;
    amount: number;
    iva_rate?: number | null;
    paid_amount?: number | null;
  };
  canEdit: boolean;
}

/** Bloco "Compensação" do modal da transação (compensação ligada, 28/09/2026). */
export function TransactionOffsetsBlock({ transaction, canEdit }: Props) {
  const companyLocale = useCompanyLocale();
  const formatCurrency = (value: number) => companyLocale.status !== "available"
    ? "—"
    : companyLocale.locale === "pt-PT" && companyLocale.currency === "EUR"
      ? formatLegacyCurrency(value)
      : formatMoney(value, companyLocale);
  const { toast } = useToast();
  const invalidate = useOffsetsInvalidate();
  const { data: all } = useAllTransactionOffsets();
  const offsets = offsetsFor(all, transaction.id);
  const [busy, setBusy] = useState(false);
  // #335 fase 3b: participação em encontros de contas — só leitura (nunca se cria encontro na ficha).
  const { data: groups } = useOffsetGroupsForTransaction(transaction.id);
  const [groupOpen, setGroupOpen] = useState<string | null>(null);

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await removeOffset(id);
      toast({ title: "Ligação removida" });
      invalidate();
    } catch (e: any) {
      toast({ title: "Não foi possível remover", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!offsets.length && !canEdit && !(groups ?? []).length) return null;

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <Link2 className="h-4 w-4" /> Compensação
        </p>
      </div>

      {(groups ?? []).map((g) => (
        <div key={g.group_id} className="flex items-center justify-between gap-2 text-xs" data-testid="offset-group-participation">
          <span className="flex-1 truncate">
            Faz parte do encontro de contas de {formatDatePT(g.operation_date)} · {g.supplier_name ?? "entidade"} ·{" "}
            {formatCurrency(g.movement_amount)}
          </span>
          <Badge variant="secondary">{OFFSET_GROUP_STATUS_LABEL[g.status] ?? g.status}</Badge>
          <Button type="button" size="sm" variant="link" className="h-6 px-1" onClick={() => setGroupOpen(g.group_id)}>
            Ver encontro
          </Button>
        </div>
      ))}
      {groupOpen && <OffsetGroupDetailDialog groupId={groupOpen} onClose={() => setGroupOpen(null)} />}

      {offsets.length === 0 && (
        <p className="text-xs text-muted-foreground">Sem ligações de compensação.</p>
      )}

      {offsets.map((o) => (
        <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate flex-1">{offsetOtherLabel(o)}</span>
          <span className="font-mono">{formatCurrency(o.amount)}</span>
          <Badge variant={offsetBadgeLabel(o) === "Por aplicar" ? "secondary" : "default"} data-testid="legacy-offset-badge">
            {offsetBadgeLabel(o)}
          </Badge>
          {o.offset_group_id && o.group_status === "applied" && !(groups ?? []).some((g) => g.group_id === o.offset_group_id) && (
            <Button type="button" size="sm" variant="link" className="h-6 px-1" onClick={() => setGroupOpen(o.offset_group_id)}>
              Ver encontro
            </Button>
          )}
          {canEdit && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              disabled={busy || offsetBadgeLabel(o) !== "Por aplicar"}
              title={o.applied ? "Já aplicada — estorna primeiro o pagamento de origem" : "Remover ligação"}
              onClick={() => remove(o.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}

    </div>
  );
}

/** Nota para a linha de uma despesa/receita com ligação, na lista de pagamento e no lote. */
export function OffsetLineNote({ txId }: { txId: string }) {
  const companyLocale = useCompanyLocale();
  const formatCurrency = (value: number) => companyLocale.status !== "available"
    ? "—"
    : companyLocale.locale === "pt-PT" && companyLocale.currency === "EUR"
      ? formatLegacyCurrency(value)
      : formatMoney(value, companyLocale);
  const { data: all } = useAllTransactionOffsets();
  const offsets = offsetsFor(all, txId);
  if (!offsets.length) return null;
  return (
    <div className="mt-0.5 space-y-0.5">
      {offsets.map((o) => (
        <div key={o.id} className="text-[11px] text-muted-foreground">
          <Badge variant="outline" className="text-[10px] mr-1">compensa {offsetOtherLabel(o)} · {formatCurrency(o.amount)}</Badge>
          {!o.applied && "ao liquidar, a outra fica paga por compensação"}
        </div>
      ))}
    </div>
  );
}

/** Selo "Compensada" para a lista de transações. */
export function OffsetPaidBadge({ txId }: { txId: string }) {
  const { data: all } = useAllTransactionOffsets();
  const offsets = offsetsFor(all, txId);
  if (!offsets.some((o) => o.applied)) return null;
  return <Badge variant="outline" className="ml-1.5 text-[10px]">Compensada</Badge>;
}
