import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { Layers, Search, Receipt, FileText } from "lucide-react";

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
        .select("id, event_id, description, amount, iva_rate, status, category_id, account_categories(code, name)")
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
    }));
    const all = [...fc, ...tx];
    if (search) {
      const s = search.toLowerCase();
      return all.filter((i) =>
        i.description?.toLowerCase().includes(s) ||
        i.account_categories?.name?.toLowerCase().includes(s) ||
        i.account_categories?.code?.toLowerCase().includes(s) ||
        eventNameMap[i.event_id]?.toLowerCase().includes(s)
      );
    }
    return all;
  }, [filteredForecasts, orphanTransactions, search, eventNameMap]);

  const keyOf = (i: Item) => `${i.kind}:${i.id}`;

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

      // 2) For orphan transactions: create a forecast row in the sub-event referencing the tx and the master
      if (selectedTxs.length > 0) {
        const rows = selectedTxs.map((t) => ({
          event_id: t.event_id,
          type: "expense",
          description: t.description || "(sem descrição)",
          category_id: t.category_id ?? masterCategoryId,
          amount: t.amount,
          iva_rate: t.iva_rate ?? 23,
          status: "approved",
          transaction_id: t.id,
          master_forecast_id: masterForecastId,
        }));
        const { error: insErr } = await (supabase.from("event_forecasts") as any).insert(rows);
        if (insErr) throw insErr;
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
                          <Receipt className="h-3 w-3 text-amber-500 shrink-0" />
                        ) : (
                          <FileText className="h-3 w-3 text-blue-500 shrink-0" />
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
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
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
