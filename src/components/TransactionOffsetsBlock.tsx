import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { Link2, Trash2 } from "lucide-react";
import {
  createOffset,
  offsetOtherLabel,
  offsetsFor,
  removeOffset,
  useAllTransactionOffsets,
  useOffsetsInvalidate,
} from "@/lib/transaction-offsets";

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

const gross = (t: { amount: number; iva_rate?: number | null }) =>
  Math.round(Number(t.amount) * (1 + Number(t.iva_rate ?? 0) / 100) * 100) / 100;
const openOf = (t: any) => Math.max(0, Math.round((gross(t) - Number(t.paid_amount ?? 0)) * 100) / 100);

/** Bloco "Compensação" do modal da transação (compensação ligada, 28/09/2026). */
export function TransactionOffsetsBlock({ transaction, canEdit }: Props) {
  const { toast } = useToast();
  const invalidate = useOffsetsInvalidate();
  const { data: all } = useAllTransactionOffsets();
  const offsets = offsetsFor(all, transaction.id);
  const [adding, setAdding] = useState(false);
  const [otherId, setOtherId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const oppositeType = transaction.type === "income" ? "expense" : "income";
  const { data: candidates } = useQuery({
    queryKey: ["offset-candidates", transaction.id, transaction.supplier_id],
    enabled: adding && !!transaction.supplier_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("transactions")
        .select("id, description, invoice_ref, amount, iva_rate, paid_amount, status, date")
        .eq("supplier_id", transaction.supplier_id)
        .eq("type", oppositeType)
        .is("reversed_at", null)
        .neq("status", "reversed")
        .order("date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).filter((t: any) => openOf(t) > 0.01);
    },
  });

  const options = useMemo(
    () =>
      (candidates ?? []).map((t: any) => ({
        value: t.id,
        label: t.description ?? "(sem descrição)",
        description: `${t.invoice_ref ? t.invoice_ref + " · " : ""}em aberto ${formatCurrency(openOf(t))}`,
      })),
    [candidates],
  );

  const myOpen = openOf(transaction);
  const pick = (id: string) => {
    setOtherId(id);
    const other = (candidates ?? []).find((t: any) => t.id === id);
    if (other) setAmount(String(Math.min(myOpen, openOf(other)).toFixed(2)));
  };

  const save = async () => {
    const v = Number(amount.replace(",", "."));
    if (!otherId || !(v > 0)) return;
    setBusy(true);
    try {
      const isIncome = transaction.type === "income";
      await createOffset(isIncome ? transaction.id : otherId, isIncome ? otherId : transaction.id, v);
      toast({ title: "Compensação ligada", description: "Quando um dos lados for pago, o outro fica pago por compensação." });
      setAdding(false);
      setOtherId("");
      setAmount("");
      invalidate();
    } catch (e: any) {
      toast({ title: "Não foi possível ligar", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

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

  if (!offsets.length && !canEdit) return null;

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <Link2 className="h-4 w-4" /> Compensação
        </p>
        {canEdit && !adding && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!transaction.supplier_id}
            title={!transaction.supplier_id ? "A transação precisa de fornecedor/cliente" : undefined}
            onClick={() => setAdding(true)}
          >
            Compensa com…
          </Button>
        )}
      </div>

      {offsets.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">Sem ligações de compensação.</p>
      )}

      {offsets.map((o) => (
        <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate flex-1">{offsetOtherLabel(o)}</span>
          <span className="font-mono">{formatCurrency(o.amount)}</span>
          <Badge variant={o.applied ? "default" : "secondary"}>{o.applied ? "Aplicada" : "Por aplicar"}</Badge>
          {canEdit && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              disabled={busy || o.applied}
              title={o.applied ? "Já aplicada — estorna primeiro o pagamento de origem" : "Remover ligação"}
              onClick={() => remove(o.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}

      {adding && (
        <div className="space-y-2">
          <SearchableSelect
            options={options}
            value={otherId}
            onValueChange={pick}
            placeholder={transaction.type === "income" ? "Despesa do mesmo fornecedor…" : "Receita do mesmo cliente…"}
            emptyMessage="Nenhuma transação em aberto deste fornecedor"
          />
          <div className="flex items-center gap-2">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="h-8" placeholder="Valor" />
            <Button type="button" size="sm" disabled={busy || !otherId} onClick={save}>Ligar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Quando um dos lados recebe um pagamento real, o outro fica pago por compensação, na mesma data, sem conta.
          </p>
        </div>
      )}
    </div>
  );
}

/** Nota para a linha de uma despesa/receita com ligação, na lista de pagamento e no lote. */
export function OffsetLineNote({ txId }: { txId: string }) {
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
