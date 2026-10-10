import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { OverlayLayer } from "@/components/ui/overlay-layer";
import { toast } from "@/hooks/use-toast";
import { invalidateTransactionQueries } from "@/lib/invalidate-transactions";

/**
 * #29 — Repartir uma despesa por N linhas de BP do mesmo evento.
 * A transação actual fica com a 1.ª linha; as outras nascem como irmãs no mesmo
 * invoice_group_id (modelo "fatura única → N itens"). Não há mãe: o fecho conta
 * cada irmã uma vez. Tudo numa só operação (RPC split_transaction_by_bp_lines).
 */
export function SplitByBpLinesModal({ transaction, onClose, onSuccess }: { transaction: any; onClose: () => void; onSuccess?: () => void }) {
  const qc = useQueryClient();
  const total = +Number(transaction.amount || 0).toFixed(2);
  const [rows, setRows] = useState<{ forecast_id: string; amount: string }[]>([
    { forecast_id: transaction.forecast_id ?? "", amount: total.toFixed(2) },
    { forecast_id: "", amount: "0.00" },
  ]);
  const [saving, setSaving] = useState(false);

  const { data: lines = [] } = useQuery({
    queryKey: ["split-bp-lines", transaction.event_id],
    enabled: !!transaction.event_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, description, amount, account_categories(code, name)")
        .eq("event_id", transaction.event_id)
        .is("version_id", null)
        .eq("type", "expense")
        .order("description");
      if (error) throw error;
      return data ?? [];
    },
  });

  const sum = useMemo(() => +rows.reduce((s, r) => s + (Number(r.amount) || 0), 0).toFixed(2), [rows]);
  const diff = +(total - sum).toFixed(2);
  const ids = rows.map((r) => r.forecast_id);
  const invalid =
    rows.length < 2 || rows.some((r) => !r.forecast_id || !(Number(r.amount) > 0)) || new Set(ids).size !== ids.length || Math.abs(diff) > 0.01;

  const save = async () => {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.rpc("split_transaction_by_bp_lines" as any, {
        p_transaction_id: transaction.id,
        p_lines: rows.map((r) => ({ forecast_id: r.forecast_id, amount: +Number(r.amount).toFixed(2) })),
        p_changed_by: u?.user?.user_metadata?.full_name ?? u?.user?.email ?? "sistema",
      } as any);
      if (error) throw new Error(error.message);
      invalidateTransactionQueries(qc);
      toast({ title: `Transação repartida por ${rows.length} linhas de BP` });
      onSuccess?.();
      onClose();
    } catch (e: any) {
      toast({ title: "Não foi possível repartir", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const label = (l: any) => `${l.account_categories?.code ?? ""} ${l.description ?? l.account_categories?.name ?? ""}`.trim();

  return (
    <OverlayLayer className="fixed inset-0 flex items-start justify-center bg-black/60 p-4 overflow-y-auto" onClick={onClose}>
      <div className="glass w-full max-w-2xl rounded-xl p-5 my-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Repartir por linhas de BP</h2>
        <p className="text-xs text-muted-foreground">
          Valor s/IVA a repartir: <span className="font-mono">{total.toFixed(2)} €</span>. A transação actual fica com a 1.ª linha; as
          outras são criadas com o mesmo fornecedor, fatura e anexos, agrupadas como uma só fatura.
        </p>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={r.forecast_id}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, forecast_id: e.target.value } : x)))}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Escolher linha de BP…</option>
              {lines.map((l: any) => (
                <option key={l.id} value={l.id}>{label(l)} — {Number(l.amount).toFixed(2)} €</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              value={r.amount}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              className="w-32 rounded-md border border-border bg-background px-2 py-1.5 text-right font-mono text-sm"
            />
            <button
              type="button"
              disabled={rows.length <= 2}
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
              title="Remover"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, { forecast_id: "", amount: "0.00" }])}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Linha
        </Button>
        <p className={`text-xs ${Math.abs(diff) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
          Soma {sum.toFixed(2)} € de {total.toFixed(2)} €{Math.abs(diff) > 0.01 ? ` — diferença ${diff.toFixed(2)} €` : ""}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={invalid || saving} onClick={save}>Repartir</Button>
        </div>
      </div>
    </OverlayLayer>
  );
}
