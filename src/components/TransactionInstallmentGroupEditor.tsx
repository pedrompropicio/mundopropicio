import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Lock, Unlock, Wand2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { distributeEvenly } from "@/components/ScheduleInstallmentsModal";

/**
 * Editor do parcelamento ANTIGO (issue #39): N transações irmãs "(n/N)" ligadas
 * por `parent_transaction_id`, em que a filha NÃO é split de rateio entre
 * eventos (`split_percentage IS NULL`).
 *
 * NÃO confundir com o Modelo B (cronograma em `transaction_payments`).
 */

type GroupRow = {
  id: string;
  description: string;
  amount: number;
  iva_rate: number;
  due_date: string | null;
  date: string;
  status: string;
  paid_amount: number;
  isRoot: boolean;
};

const isPaidRow = (r: GroupRow) => r.status === "paid" || Number(r.paid_amount) > 0.01;

export function useInstallmentGroup(transaction: any) {
  const rootId: string = transaction.parent_transaction_id ?? transaction.id;
  return useQuery({
    queryKey: ["installment-group", rootId],
    queryFn: async (): Promise<GroupRow[]> => {
      const cols =
        "id, description, amount, iva_rate, due_date, date, status, paid_amount, split_percentage, parent_transaction_id";
      const { data: root, error: rootErr } = await supabase
        .from("transactions")
        .select(cols)
        .eq("id", rootId)
        .maybeSingle();
      if (rootErr) throw rootErr;
      if (!root || (root as any).split_percentage !== null) return [];

      const { data: children, error: childErr } = await supabase
        .from("transactions")
        .select(cols)
        .eq("parent_transaction_id", rootId)
        .is("split_percentage", null);
      if (childErr) throw childErr;
      if (!children || children.length === 0) return [];

      const map = (r: any, isRoot: boolean): GroupRow => ({
        id: r.id,
        description: r.description ?? "",
        amount: Number(r.amount) || 0,
        iva_rate: Number(r.iva_rate) || 0,
        due_date: r.due_date ?? null,
        date: r.date,
        status: r.status,
        paid_amount: Number(r.paid_amount) || 0,
        isRoot,
      });

      const rows = [map(root, true), ...children.map((c: any) => map(c, false))];
      rows.sort((a, b) => (a.due_date ?? a.date).localeCompare(b.due_date ?? b.date));
      return rows;
    },
  });
}

export function TransactionInstallmentGroupEditor({
  transaction,
  isAdmin,
}: {
  transaction: any;
  isAdmin: boolean;
}) {
  const { user, isManager } = useAuth();
  const queryClient = useQueryClient();
  const { data: group = [] } = useInstallmentGroup(transaction);

  const [rows, setRows] = useState<Record<string, { amount: number; due_date: string }>>({});
  const [totalInput, setTotalInput] = useState<string>("");
  const [unlockPaid, setUnlockPaid] = useState(false);
  const [open, setOpen] = useState(false);

  const originalTotal = useMemo(
    () => +group.reduce((s, r) => s + r.amount, 0).toFixed(2),
    [group],
  );

  useEffect(() => {
    if (group.length === 0) return;
    const init: Record<string, { amount: number; due_date: string }> = {};
    group.forEach((r) => {
      init[r.id] = { amount: r.amount, due_date: r.due_date ?? r.date };
    });
    setRows(init);
    setTotalInput(originalTotal.toFixed(2));
  }, [group.length, originalTotal]);

  const canEdit = isAdmin || isManager;

  const newTotal = parseFloat(totalInput) || 0;
  const sum = +Object.values(rows).reduce((s, r) => s + (Number(r.amount) || 0), 0).toFixed(2);
  const diff = +(newTotal - sum).toFixed(2);
  const mismatch = Math.abs(diff) > 0.01;

  const paidRows = group.filter(isPaidRow);
  const paidSum = +paidRows.reduce((s, r) => s + (rows[r.id]?.amount ?? r.amount), 0).toFixed(2);

  const rowLocked = (r: GroupRow) => isPaidRow(r) && !(isAdmin && unlockPaid);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (mismatch) throw new Error("A soma das parcelas tem de igualar o novo total (±0,01 €).");
      const changedBy = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
      const audit: any[] = [];
      let updated = 0;

      for (const r of group) {
        const edited = rows[r.id];
        if (!edited) continue;
        const newAmount = +Number(edited.amount).toFixed(2);
        const newDue = edited.due_date || null;
        const amountChanged = Math.abs(newAmount - r.amount) > 0.001;
        const dueChanged = (r.due_date ?? null) !== newDue;
        if (!amountChanged && !dueChanged) continue;
        if (rowLocked(r)) throw new Error("Parcela paga travada — destranca antes de gravar (admin).");

        const patch: any = {};
        if (amountChanged) patch.amount = newAmount;
        if (dueChanged) patch.due_date = newDue;
        const { error } = await supabase.from("transactions").update(patch).eq("id", r.id);
        if (error) throw error;
        updated++;

        if (amountChanged) {
          audit.push({
            transaction_id: r.id,
            changed_by: changedBy,
            field_name: "Valor (parcelamento)",
            old_value: r.amount.toFixed(2),
            new_value: newAmount.toFixed(2),
          });
        }
        if (dueChanged) {
          audit.push({
            transaction_id: r.id,
            changed_by: changedBy,
            field_name: "Data Vencimento (parcelamento)",
            old_value: r.due_date ?? "",
            new_value: newDue ?? "",
          });
        }
      }

      if (updated === 0) throw new Error("Nenhuma parcela alterada.");
      if (audit.length > 0) {
        const { error: aErr } = await supabase.from("transaction_audit_log").insert(audit);
        if (aErr) console.error("[installment group audit] failed", aErr);
      }
      return updated;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ["installment-group"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      // Badge azul da proforma/fatura na lista (agrupamento por invoice_ref + fornecedor)
      queryClient.invalidateQueries({ queryKey: ["invoice-group"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-group-progress"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-audit-log"] });
      toast({ title: `${n} parcela(s) atualizada(s)` });
    },
    onError: (e: any) =>
      toast({ title: "Erro ao gravar parcelas", description: e.message, variant: "destructive" }),
  });

  if (group.length < 2) return null;

  const distribute = () => {
    const unpaid = group.filter((r) => !isPaidRow(r) || (isAdmin && unlockPaid));
    if (unpaid.length === 0) {
      toast({ title: "Todas as parcelas estão pagas", variant: "destructive" });
      return;
    }
    const lockedSum = +group
      .filter((r) => !unpaid.includes(r))
      .reduce((s, r) => s + (rows[r.id]?.amount ?? r.amount), 0)
      .toFixed(2);
    const remaining = +(newTotal - lockedSum).toFixed(2);
    if (remaining < 0) {
      toast({ title: "Total inferior às parcelas pagas", variant: "destructive" });
      return;
    }
    const amounts = distributeEvenly(remaining, unpaid.length);
    setRows((prev) => {
      const next = { ...prev };
      unpaid.forEach((r, i) => {
        next[r.id] = { ...next[r.id], amount: amounts[i] };
      });
      return next;
    });
  };


  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/20 px-2 py-1 font-semibold text-primary">
            <Layers className="h-3.5 w-3.5" /> Parcelado em {group.length}×
          </span>
          <span className="text-muted-foreground">
            Total da fatura:{" "}
            <span className="font-mono font-semibold text-foreground">
              {originalTotal.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
            </span>
          </span>
        </div>
        {canEdit && (
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            {open ? "Fechar parcelas" : "Editar parcelas"}
          </Button>
        )}
      </div>

      {!canEdit && (
        <p className="text-[11px] text-muted-foreground">
          Sem permissão para editar as parcelas (admin/manager).
        </p>
      )}

      {open && canEdit && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Novo total da fatura (base)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={totalInput}
                onChange={(e) => setTotalInput(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={distribute}>
                <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Distribuir igualmente
              </Button>
              {isAdmin && paidRows.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setUnlockPaid((v) => !v)}
                >
                  {unlockPaid ? <Unlock className="h-3.5 w-3.5 mr-1.5" /> : <Lock className="h-3.5 w-3.5 mr-1.5" />}
                  {unlockPaid ? "Travar pagas" : "Destravar pagas"}
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border overflow-hidden bg-background">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">Parcela</th>
                  <th className="text-left px-2 py-1.5 font-medium w-32">Vencimento</th>
                  <th className="text-right px-2 py-1.5 font-medium w-28">Valor (€)</th>
                </tr>
              </thead>
              <tbody>
                {group.map((r, i) => {
                  const locked = rowLocked(r);
                  const edited = rows[r.id] ?? { amount: r.amount, due_date: r.due_date ?? r.date };
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        "border-t border-border/50",
                        r.id === transaction.id && "bg-primary/5",
                      )}
                    >
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">{i + 1}.</span>
                          <span className="truncate max-w-[220px]">{r.description}</span>
                          {isPaidRow(r) && (
                            <span className="rounded bg-success/20 px-1.5 py-0.5 text-[10px] text-success">
                              paga
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="date"
                          value={edited.due_date ?? ""}
                          disabled={locked}
                          onChange={(e) =>
                            setRows((p) => ({ ...p, [r.id]: { ...p[r.id], due_date: e.target.value } }))
                          }
                          className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs disabled:opacity-60"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={edited.amount || ""}
                          disabled={locked}
                          onChange={(e) =>
                            setRows((p) => ({
                              ...p,
                              [r.id]: { ...p[r.id], amount: parseFloat(e.target.value) || 0 },
                            }))
                          }
                          className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs text-right font-mono disabled:opacity-60"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <span className="text-muted-foreground">
              Pagas: <span className="font-mono">{paidSum.toFixed(2)}€</span> · Soma:{" "}
              <span className="font-mono">{sum.toFixed(2)}€</span> · Novo total:{" "}
              <span className="font-mono">{newTotal.toFixed(2)}€</span>
            </span>
            <span
              className={cn(
                "font-mono font-semibold",
                mismatch ? "text-destructive" : "text-success",
              )}
            >
              {mismatch
                ? `${diff > 0 ? "Falta" : "Excesso"} ${Math.abs(diff).toFixed(2)}€`
                : "Soma confere"}
            </span>
          </div>

          {mismatch && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              A soma das parcelas tem de igualar o novo total (tolerância 0,01 €). Usa{" "}
              <strong>Distribuir igualmente</strong> ou ajusta manualmente.
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={mismatch || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "A gravar…" : "Gravar parcelas"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
