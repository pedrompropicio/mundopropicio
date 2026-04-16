import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { Layers, Search, Receipt, FileText, AlertTriangle, Wallet, Hash } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  masterEventId: string;
  childEventIds: string[];
  masterForecast?: { id: string; description: string; category_id: string | null; type: string } | null;
  mode: "adopt" | "create";
  categories?: { id: string; code: string; name: string; type: string }[];
}

type Item =
  | {
      kind: "forecast";
      id: string;
      event_id: string;
      description: string;
      amount: number;
      iva_rate: number;
      status: string;
      specification: string | null;
      category_id: string | null;
      account_categories?: { code?: string; name?: string } | null;
      invoice_ref?: string | null;
      account_name?: string | null;
    }
  | {
      kind: "transaction";
      id: string;
      event_id: string;
      description: string;
      amount: number;
      iva_rate: number;
      status: string;
      category_id: string | null;
      account_categories?: { code?: string; name?: string } | null;
      invoice_ref?: string | null;
      account_name?: string | null;
    };

export function AdoptForecastsModal({ open, onOpenChange, masterEventId, childEventIds, masterForecast, mode, categories = [] }: Props) {
  const queryClient = useQueryClient();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newIvaRate, setNewIvaRate] = useState("23");

  // Master expense categories (for filtering orphan transactions in create mode)
  const { data: masterCategoryIds = [] } = useQuery({
    queryKey: ["master_expense_category_ids", masterEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("category_id")
        .eq("event_id", masterEventId)
        .eq("type", "expense")
        .not("category_id", "is", null);
      if (error) throw error;
      return [...new Set((data ?? []).map((r: any) => r.category_id).filter(Boolean))] as string[];
    },
    enabled: open && mode === "create",
  });

  // Sub-event forecasts NOT yet adopted
  const { data: subForecasts = [], isLoading: loadingForecasts } = useQuery({
    queryKey: ["sub_event_forecasts_for_adopt", childEventIds],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("event_forecasts")
        .select("*, account_categories(code, name)") as any)
        .in("event_id", childEventIds)
        .is("master_forecast_id", null)
        .eq("type", "expense");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: open && childEventIds.length > 0,
  });

  // Orphan transactions: paid/approved txs in sub-events whose category matches a master expense category
  // and which have NO forecast link (no event_forecasts row references them)
  const targetCategoryIds = useMemo(() => {
    if (mode === "adopt" && masterForecast?.category_id) return [masterForecast.category_id];
    if (mode === "create") return masterCategoryIds;
    return [];
  }, [mode, masterForecast, masterCategoryIds]);

  const { data: orphanTransactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ["orphan_transactions_for_adopt", childEventIds, targetCategoryIds],
    queryFn: async () => {
      if (targetCategoryIds.length === 0) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("id, event_id, description, amount, iva_rate, status, category_id, invoice_ref, account_id, account_categories(code, name), financial_accounts(name)")
        .in("event_id", childEventIds)
        .in("category_id", targetCategoryIds)
        .eq("type", "expense")
        .in("status", ["paid", "approved", "pending", "overdue"]);
      if (error) throw error;
      const txs = (data ?? []) as any[];
      if (txs.length === 0) return [];
      // Find which already have a forecast link
      const txIds = txs.map((t) => t.id);
      const { data: linkedFc, error: fcErr } = await supabase
        .from("event_forecasts")
        .select("transaction_id")
        .in("transaction_id", txIds);
      if (fcErr) throw fcErr;
      const linkedSet = new Set((linkedFc ?? []).map((f: any) => f.transaction_id));
      return txs.filter((t) => !linkedSet.has(t.id));
    },
    enabled: open && childEventIds.length > 0 && targetCategoryIds.length > 0,
  });

  const { data: subEvents = [] } = useQuery({
    queryKey: ["sub_event_names_adopt", childEventIds],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").in("id", childEventIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && childEventIds.length > 0,
  });

  const eventNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    subEvents.forEach((e: any) => { map[e.id] = e.name; });
    return map;
  }, [subEvents]);

  // Filter: if adopting into existing, optionally filter by same category
  const filteredForecasts = useMemo(() => {
    let list: any[] = subForecasts;
    if (mode === "adopt" && masterForecast?.category_id) {
      list = list.filter((f) => f.category_id === masterForecast.category_id);
    } else if (mode === "create") {
      list = list.filter((f) => masterCategoryIds.includes(f.category_id));
    }
    return list;
  }, [subForecasts, mode, masterForecast, masterCategoryIds]);

  const items: Item[] = useMemo(() => {
    const fc: Item[] = filteredForecasts.map((f: any) => ({
      kind: "forecast" as const,
      id: f.id,
      event_id: f.event_id,
      description: f.description,
      amount: Number(f.amount),
      iva_rate: f.iva_rate,
      status: f.status,
      specification: f.specification,
      category_id: f.category_id,
      account_categories: f.account_categories,
      invoice_ref: null,
      account_name: null,
    }));
    const tx: Item[] = (orphanTransactions ?? []).map((t: any) => ({
      kind: "transaction" as const,
      id: t.id,
      event_id: t.event_id,
      description: t.description,
      amount: Number(t.amount),
      iva_rate: t.iva_rate ?? 23,
      status: t.status,
      category_id: t.category_id,
      account_categories: t.account_categories,
      invoice_ref: t.invoice_ref ?? null,
      account_name: t.financial_accounts?.name ?? null,
    }));
    const all = [...fc, ...tx];
    if (search) {
      const s = search.toLowerCase();
      return all.filter((i) =>
        i.description?.toLowerCase().includes(s) ||
        i.account_categories?.name?.toLowerCase().includes(s) ||
        i.account_categories?.code?.toLowerCase().includes(s) ||
        eventNameMap[i.event_id]?.toLowerCase().includes(s) ||
        i.invoice_ref?.toLowerCase().includes(s) ||
        i.account_name?.toLowerCase().includes(s)
      );
    }
    return all;
  }, [filteredForecasts, orphanTransactions, search, eventNameMap]);

  const keyOf = (i: Item) => `${i.kind}:${i.id}`;

  // Agrupar transações pela mesma fatura (invoice_ref) — para selecionar fatura completa e detetar seleções parciais
  const invoiceGroups = useMemo(() => {
    const map = new Map<string, Item[]>();
    items.forEach((i) => {
      if (i.kind === "transaction" && i.invoice_ref) {
        const key = `${i.event_id}::${i.invoice_ref}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(i);
      }
    });
    // Apenas grupos com 2+ transações são "agrupados"
    return new Map([...map.entries()].filter(([, arr]) => arr.length > 1));
  }, [items]);

  const getInvoiceGroupKey = (i: Item): string | null => {
    if (i.kind !== "transaction" || !i.invoice_ref) return null;
    const key = `${i.event_id}::${i.invoice_ref}`;
    return invoiceGroups.has(key) ? key : null;
  };

  const partialInvoiceWarnings = useMemo(() => {
    const warnings: string[] = [];
    invoiceGroups.forEach((group, key) => {
      const selectedCount = group.filter((i) => selectedKeys.has(keyOf(i))).length;
      if (selectedCount > 0 && selectedCount < group.length) {
        const ref = key.split("::")[1];
        warnings.push(`Fatura ${ref}: ${selectedCount}/${group.length} lançamentos selecionados`);
      }
    });
    return warnings;
  }, [invoiceGroups, selectedKeys]);

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedKeys.size === items.length) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(items.map(keyOf)));
  };

  const selectInvoiceGroup = (groupKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const group = invoiceGroups.get(groupKey);
    if (!group) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const allSelected = group.every((i) => next.has(keyOf(i)));
      if (allSelected) group.forEach((i) => next.delete(keyOf(i)));
      else group.forEach((i) => next.add(keyOf(i)));
      return next;
    });
  };

  const totalSelected = items.filter((i) => selectedKeys.has(keyOf(i))).reduce((s, i) => s + i.amount, 0);
  const selectedForecasts = items.filter((i) => i.kind === "forecast" && selectedKeys.has(keyOf(i)));
  const selectedTxs = items.filter((i) => i.kind === "transaction" && selectedKeys.has(keyOf(i)));

  const handleSave = async () => {
    if (selectedKeys.size === 0) return;
    setSaving(true);
    try {
      let masterForecastId: string;
      let masterCategoryId: string | null = null;

      if (mode === "create") {
        if (!newDescription.trim()) {
          toast({ title: "Preencha a descrição da linha Master", variant: "destructive" });
          setSaving(false);
          return;
        }
        const totalAmount = items.filter((i) => selectedKeys.has(keyOf(i))).reduce((s, i) => s + i.amount, 0);
        const { data: newForecast, error: createError } = await supabase
          .from("event_forecasts")
          .insert({
            event_id: masterEventId,
            type: "expense",
            description: newDescription.trim(),
            category_id: newCategoryId || null,
            amount: totalAmount,
            iva_rate: parseInt(newIvaRate),
            status: "approved",
          })
          .select("id, category_id")
          .single();
        if (createError) throw createError;
        masterForecastId = newForecast.id;
        masterCategoryId = newForecast.category_id;
      } else {
        if (!masterForecast) throw new Error("Linha Master não definida");
        masterForecastId = masterForecast.id;
        masterCategoryId = masterForecast.category_id;
      }

      // 1) Link existing sub-event forecasts
      if (selectedForecasts.length > 0) {
        const ids = selectedForecasts.map((i) => i.id);
        const { error: updateError } = await (supabase
          .from("event_forecasts")
          .update({ master_forecast_id: masterForecastId }) as any)
          .in("id", ids);
        if (updateError) throw updateError;
      }

      // 2) For orphan transactions: vincular SEMPRE via split (linha BP) do sub-evento
      // Para cada tx órfã: procurar split BP existente (mesmo sub-evento + master_forecast_id + sem transaction_id)
      // Se existir, ligar a tx a esse split; senão, criar um novo split e ligar.
      if (selectedTxs.length > 0) {
        // Buscar splits existentes (linhas no sub-evento já vinculadas ao master, sem tx ainda)
        const subEventIds = [...new Set(selectedTxs.map((t) => t.event_id))];
        const { data: existingSplits, error: splitErr } = await (supabase
          .from("event_forecasts")
          .select("id, event_id, transaction_id") as any)
          .eq("master_forecast_id", masterForecastId)
          .in("event_id", subEventIds);
        if (splitErr) throw splitErr;

        // Mapa de splits livres (sem transaction_id) por sub-evento
        const freeSplitsByEvent: Record<string, string[]> = {};
        (existingSplits ?? []).forEach((s: any) => {
          if (!s.transaction_id) {
            if (!freeSplitsByEvent[s.event_id]) freeSplitsByEvent[s.event_id] = [];
            freeSplitsByEvent[s.event_id].push(s.id);
          }
        });

        const splitsToCreate: any[] = [];
        const txToSplitMap: { txId: string; splitId?: string; createIndex?: number }[] = [];

        for (const t of selectedTxs) {
          const free = freeSplitsByEvent[t.event_id];
          if (free && free.length > 0) {
            // Reaproveita split existente
            const splitId = free.shift()!;
            txToSplitMap.push({ txId: t.id, splitId });
          } else {
            // Cria novo split no sub-evento, vinculado ao Master
            const idx = splitsToCreate.length;
            splitsToCreate.push({
              event_id: t.event_id,
              type: "expense",
              description: t.description || "(sem descrição)",
              category_id: t.category_id ?? masterCategoryId,
              amount: t.amount,
              iva_rate: t.iva_rate ?? 23,
              status: "approved",
              master_forecast_id: masterForecastId,
            });
            txToSplitMap.push({ txId: t.id, createIndex: idx });
          }
        }

        // Inserir novos splits e capturar IDs
        let createdIds: string[] = [];
        if (splitsToCreate.length > 0) {
          const { data: created, error: insErr } = await (supabase
            .from("event_forecasts") as any)
            .insert(splitsToCreate)
            .select("id");
          if (insErr) throw insErr;
          createdIds = (created ?? []).map((r: any) => r.id);
        }

        // Atualizar cada split (existente ou recém-criado) para apontar à transação órfã
        for (const m of txToSplitMap) {
          const splitId = m.splitId ?? createdIds[m.createIndex!];
          if (!splitId) continue;
          const tx = selectedTxs.find((x) => x.id === m.txId)!;
          const { error: updErr } = await (supabase
            .from("event_forecasts") as any)
            .update({
              transaction_id: tx.id,
              amount: tx.amount,
              iva_rate: tx.iva_rate ?? 23,
              description: tx.description || "(sem descrição)",
              category_id: tx.category_id ?? masterCategoryId,
            })
            .eq("id", splitId);
          if (updErr) throw updErr;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["sub_event_forecasts_for_adopt"] });
      queryClient.invalidateQueries({ queryKey: ["orphan_transactions_for_adopt"] });
      queryClient.invalidateQueries({ queryKey: ["adopted_forecasts"] });
      toast({
        title: `${selectedKeys.size} item(ns) vinculado(s) ao Master`,
        description: selectedTxs.length > 0
          ? `${selectedForecasts.length} linha(s) BP + ${selectedTxs.length} transação(ões) órfã(s)`
          : undefined,
      });
      onOpenChange(false);
      setSelectedKeys(new Set());
      setNewDescription("");
      setNewCategoryId("");
    } catch (err: any) {
      toast({ title: "Erro ao vincular", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const expenseCategories = categories.filter((c) => c.type === "expense");
  const isLoading = loadingForecasts || loadingTx;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            {mode === "adopt" ? "Adotar Linhas / Transações dos Sub-Eventos" : "Criar Conta Master + Vincular"}
          </DialogTitle>
          <DialogDescription>
            {mode === "adopt"
              ? `Selecione linhas de BP ou transações órfãs (sem BP) para vincular à conta "${masterForecast?.description ?? ""}".`
              : "Crie uma nova linha no BP do Master e vincule linhas de BP e/ou transações órfãs dos sub-eventos."}
          </DialogDescription>
        </DialogHeader>

        {mode === "create" && (
          <div className="space-y-3 border-b border-border/50 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Nova Linha Master</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Descrição *</label>
                <input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="Ex: Voos equipa"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Categoria</label>
                <SearchableSelect
                  options={expenseCategories.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))}
                  value={newCategoryId}
                  onValueChange={setNewCategoryId}
                  placeholder="Selecionar…"
                  searchPlaceholder="Pesquisar conta…"
                />
              </div>
            </div>
            <div className="w-24">
              <label className="text-xs text-muted-foreground">IVA</label>
              <select
                value={newIvaRate}
                onChange={(e) => setNewIvaRate(e.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              >
                <option value="23">23%</option>
                <option value="13">13%</option>
                <option value="6">6%</option>
                <option value="0">0%</option>
              </select>
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-border bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            placeholder="Pesquisar por descrição, categoria ou evento…"
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">A carregar…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sem linhas ou transações disponíveis nos sub-eventos</p>
          ) : (
            <>
              <div className="flex items-center gap-2 pb-2 border-b border-border/30">
                <Checkbox
                  checked={selectedKeys.size === items.length && items.length > 0}
                  onCheckedChange={toggleAll}
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs text-muted-foreground">
                  {selectedKeys.size > 0
                    ? `${selectedKeys.size} selecionado(s) — ${formatCurrency(totalSelected)}`
                    : `Selecionar todos (${items.length})`}
                </span>
              </div>
              {items.map((i) => {
                const k = keyOf(i);
                const isTx = i.kind === "transaction";
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleSelect(k)}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      selectedKeys.has(k) ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/30 border border-transparent"
                    }`}
                  >
                    <Checkbox checked={selectedKeys.has(k)} className="h-3.5 w-3.5 pointer-events-none shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate flex items-center gap-1.5">
                        {isTx ? (
                          <Receipt className="h-3 w-3 text-warning shrink-0" />
                        ) : (
                          <FileText className="h-3 w-3 text-primary shrink-0" />
                        )}
                        {i.account_categories?.code && (
                          <span className="text-xs text-muted-foreground">{i.account_categories.code}</span>
                        )}
                        <span className="truncate">{i.description}</span>
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {eventNameMap[i.event_id] || "Sub-evento"}
                        {i.kind === "forecast" && i.specification && ` · ${i.specification}`}
                        {isTx && ` · Transação ${i.status}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-semibold">{formatCurrency(i.amount)}</p>
                      <p className="text-[10px] text-muted-foreground">{i.iva_rate}% IVA</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                      isTx
                        ? "bg-warning/15 text-warning"
                        : i.status === "approved"
                          ? "bg-success/15 text-success"
                          : "bg-warning/15 text-warning"
                    }`}>
                      {isTx ? "Órfã" : i.status === "approved" ? "Aprovada" : "Rascunho"}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-secondary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || selectedKeys.size === 0}
            className="rounded-lg px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "A vincular…" : `Vincular ${selectedKeys.size > 0 ? `(${selectedKeys.size})` : ""}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
