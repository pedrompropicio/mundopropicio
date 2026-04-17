import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { AlertTriangle, Search, Receipt, Layers, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  masterEventId: string;
  childEventIds: string[];
}

/**
 * Lists ALL orphan transactions across ALL categories in the sub-events of a Master.
 * "Orphan" = transaction in a sub-event with NO BP forecast linked AND no parent_transaction_id (not a split child).
 * Allows selection and bulk adoption: each selected tx is linked to a BP split row in its sub-event,
 * which in turn rolls up to a Master BP line (created on-the-fly per category if missing).
 */
export function OrphanTransactionsModal({ open, onOpenChange, masterEventId, childEventIds }: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // 1) All sub-event expense transactions that are NOT split-children
  const { data: orphans = [], isLoading } = useQuery({
    queryKey: ["all_orphan_txs", masterEventId, childEventIds],
    queryFn: async () => {
      if (childEventIds.length === 0) return [];
      const { data: txs, error } = await supabase
        .from("transactions")
        .select("id, event_id, description, amount, iva_rate, status, category_id, invoice_ref, account_id, account_categories(code, name), financial_accounts(name)")
        .in("event_id", childEventIds)
        .eq("type", "expense")
        .is("parent_transaction_id", null)
        .in("status", ["paid", "approved", "pending", "overdue"]);
      if (error) throw error;
      const list = (txs ?? []) as any[];
      if (list.length === 0) return [];
      // Exclude those already linked from any BP forecast row (transaction_id)
      const ids = list.map((t) => t.id);
      const { data: linked, error: lErr } = await supabase
        .from("event_forecasts")
        .select("transaction_id")
        .in("transaction_id", ids);
      if (lErr) throw lErr;
      const linkedSet = new Set((linked ?? []).map((r: any) => r.transaction_id));
      return list.filter((t) => !linkedSet.has(t.id));
    },
    enabled: open && childEventIds.length > 0,
  });

  // 2) Existing master forecasts (to reuse when adopting)
  const { data: masterForecasts = [] } = useQuery({
    queryKey: ["master_forecasts_for_orphans", masterEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, category_id, description, type")
        .eq("event_id", masterEventId)
        .eq("type", "expense");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: open,
  });

  // 3) Sub-event names
  const { data: subEvents = [] } = useQuery({
    queryKey: ["sub_event_names_orphan", childEventIds],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").in("id", childEventIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && childEventIds.length > 0,
  });

  const eventNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    subEvents.forEach((e: any) => { m[e.id] = e.name; });
    return m;
  }, [subEvents]);

  const filtered = useMemo(() => {
    if (!search.trim()) return orphans;
    const q = search.toLowerCase();
    return orphans.filter((t: any) =>
      (t.description || "").toLowerCase().includes(q) ||
      (eventNameMap[t.event_id] || "").toLowerCase().includes(q) ||
      (t.account_categories?.code || "").toLowerCase().includes(q) ||
      (t.account_categories?.name || "").toLowerCase().includes(q) ||
      (t.invoice_ref || "").toLowerCase().includes(q) ||
      (t.financial_accounts?.name || "").toLowerCase().includes(q)
    );
  }, [orphans, search, eventNameMap]);

  // Group by category for clearer overview
  const grouped = useMemo(() => {
    const map = new Map<string, { catCode: string; catName: string; items: any[] }>();
    filtered.forEach((t: any) => {
      const key = t.category_id || "no-cat";
      if (!map.has(key)) {
        map.set(key, {
          catCode: t.account_categories?.code || "—",
          catName: t.account_categories?.name || "Sem categoria",
          items: [],
        });
      }
      map.get(key)!.items.push(t);
    });
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.catCode.localeCompare(b.catCode));
  }, [filtered]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((t: any) => t.id)));
  };

  const handleAdopt = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const txs = orphans.filter((t: any) => selected.has(t.id));
      // Group txs by category
      const byCategory = new Map<string, any[]>();
      txs.forEach((t: any) => {
        const k = t.category_id || "no-cat";
        if (!byCategory.has(k)) byCategory.set(k, []);
        byCategory.get(k)!.push(t);
      });

      let createdMasters = 0;
      let createdSplits = 0;

      for (const [catId, items] of byCategory.entries()) {
        if (catId === "no-cat") {
          toast({ title: "Atenção", description: `${items.length} transação(ões) sem categoria foram ignoradas.`, variant: "destructive" });
          continue;
        }
        // Find/create master forecast for this category
        let masterId: string | undefined = masterForecasts.find((m: any) => m.category_id === catId)?.id;
        if (!masterId) {
          const sample = items[0];
          const total = items.reduce((s, t) => s + Number(t.amount), 0);
          const { data: newMaster, error: mErr } = await supabase
            .from("event_forecasts")
            .insert({
              event_id: masterEventId,
              type: "expense",
              description: sample.account_categories?.name || sample.description || "Despesa adotada",
              category_id: catId,
              amount: total,
              iva_rate: sample.iva_rate ?? 23,
              status: "approved",
              formula_type: "fixed",
              formula_value: total,
            })
            .select("id")
            .single();
          if (mErr) throw mErr;
          masterId = newMaster.id;
          createdMasters++;
        }

        // For each tx: create a split forecast in its sub-event linked to the master + the tx
        for (const t of items) {
          const { error: sErr } = await supabase.from("event_forecasts").insert({
            event_id: t.event_id,
            type: "expense",
            description: t.description || "Transação órfã",
            category_id: t.category_id,
            amount: t.amount,
            iva_rate: t.iva_rate ?? 23,
            status: "approved",
            formula_type: "fixed",
            formula_value: t.amount,
            master_forecast_id: masterId,
            transaction_id: t.id,
          });
          if (sErr) throw sErr;
          createdSplits++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["all_orphan_txs"] });
      queryClient.invalidateQueries({ queryKey: ["adopted_forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["master_forecasts_for_orphans"] });
      toast({
        title: "Órfãs adotadas",
        description: `${createdSplits} transação(ões) vinculada(s)${createdMasters > 0 ? ` · ${createdMasters} linha(s) Master criada(s)` : ""}.`,
      });
      setSelected(new Set());
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao adotar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Transações Órfãs dos Sub-Eventos
          </DialogTitle>
          <DialogDescription>
            Transações lançadas diretamente nos sub-eventos sem ligação a uma linha de BP do Master nem a um rateio. Selecione as que deseja adotar — cada uma será vinculada (criando ou reutilizando a linha Master correspondente da sua categoria).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Pesquisar por descrição, categoria, evento, fatura ou conta…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> A carregar…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-12 text-sm text-muted-foreground">
              {orphans.length === 0 ? "🎉 Nenhuma transação órfã encontrada." : "Nenhum resultado para a pesquisa."}
            </div>
          ) : (
            <>
              <button
                onClick={toggleAll}
                className="flex items-center gap-2 self-start rounded-lg px-2 py-1 text-xs hover:bg-secondary"
              >
                <Checkbox checked={selected.size === filtered.length && filtered.length > 0} className="h-3.5 w-3.5 pointer-events-none" />
                Selecionar todos ({filtered.length})
              </button>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {grouped.map((g) => (
                  <div key={g.id} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 bg-background py-1">
                      <Layers className="h-3 w-3" />
                      <span className="font-mono text-warning">{g.catCode}</span>
                      <span>{g.catName}</span>
                      <span className="ml-auto">{g.items.length} item(ns)</span>
                    </div>
                    {g.items.map((t: any) => {
                      const isSel = selected.has(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggle(t.id)}
                          className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                            isSel ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/40"
                          }`}
                        >
                          <Checkbox checked={isSel} className="mt-0.5 pointer-events-none" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Receipt className="h-3.5 w-3.5 text-warning shrink-0" />
                              <span className="font-medium text-sm truncate">{t.description}</span>
                              <span className="text-[10px] rounded-full bg-warning/15 text-warning px-2 py-0.5">Órfã</span>
                              <span className="text-[10px] rounded-full bg-secondary px-2 py-0.5 capitalize">{t.status}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>{eventNameMap[t.event_id] || "—"}</span>
                              {t.invoice_ref && <span>· Fatura: {t.invoice_ref}</span>}
                              {t.financial_accounts?.name && <span>· Conta: {t.financial_accounts.name}</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono text-sm font-semibold">{formatCurrency(Number(t.amount))}</div>
                            <div className="text-[10px] text-muted-foreground">{t.iva_rate}% IVA</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-4 py-2 text-sm hover:bg-secondary"
            disabled={saving}
          >
            Fechar
          </button>
          <button
            onClick={handleAdopt}
            disabled={selected.size === 0 || saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Adotar {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
