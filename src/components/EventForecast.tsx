import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, TrendingUp, TrendingDown, BarChart3, Trash2, CheckCircle2, Clock, Link2, Check, X, Ticket } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

interface InlineForm {
  type: string;
  description: string;
  amount: string;
  iva_rate: string;
  category_id: string;
  notes: string;
  specification: string;
}

const emptyInline: InlineForm = {
  type: "expense",
  description: "",
  amount: "",
  iva_rate: "23",
  category_id: "",
  notes: "",
  specification: "",
};

interface Props {
  eventId: string;
  eventDate: string;
}

export function EventForecast({ eventId, eventDate }: Props) {
  const [addingType, setAddingType] = useState<"income" | "expense" | null>(null);
  const [inlineForm, setInlineForm] = useState<InlineForm>(emptyInline);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const descRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { isAdmin, user } = useAuth();

  useEffect(() => {
    if ((addingType || editingId) && descRef.current) {
      descRef.current.focus();
    }
  }, [addingType, editingId]);

  const { data: categories = [] } = useQuery({
    queryKey: ["account_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("*")
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return data;
    },
  });

  const { data: forecasts = [], isLoading } = useQuery({
    queryKey: ["event_forecasts", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("*, account_categories(code, name, type)")
        .eq("event_id", eventId)
        .order("type")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["event_transactions_actual", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, account_categories(code, name, type)")
        .eq("event_id", eventId);
      if (error) throw error;
      return data;
    },
  });

  // Fetch ticket zones and lots for auto-calculated ticket revenue
  const { data: ticketZones = [] } = useQuery({
    queryKey: ["event_ticket_zones", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_zones").select("id").eq("event_id", eventId);
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketLots = [] } = useQuery({
    queryKey: ["event_ticket_lots_for_pl", eventId],
    queryFn: async () => {
      const zoneIds = ticketZones.map((z) => z.id);
      if (zoneIds.length === 0) return [];
      const { data, error } = await supabase.from("event_ticket_lots").select("*").in("zone_id", zoneIds);
      if (error) throw error;
      return data;
    },
    enabled: ticketZones.length > 0,
  });

  const ticketRevenue = ticketLots.reduce((s, l) => s + l.quantity * Number(l.price), 0);

  const saveMutation = useMutation({
    mutationFn: async ({ form, id }: { form: InlineForm; id: string | null }) => {
      const payload = {
        event_id: eventId,
        type: form.type,
        description: form.description,
        amount: parseFloat(form.amount) || 0,
        iva_rate: parseInt(form.iva_rate) || 23,
        category_id: form.category_id || null,
        notes: form.notes || null,
        specification: form.type === "expense" ? (form.specification || null) : null,
      };
      if (id) {
        const { error } = await supabase.from("event_forecasts").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_forecasts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      toast({ title: vars.id ? "Previsão atualizada!" : "Previsão adicionada!" });
      if (!vars.id && addingType) {
        // Keep adding mode open for rapid entry, reset form
        setInlineForm({ ...emptyInline, type: addingType });
        setTimeout(() => descRef.current?.focus(), 50);
      } else {
        setAddingType(null);
        setEditingId(null);
        setInlineForm(emptyInline);
      }
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_forecasts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      toast({ title: "Previsão removida" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (forecast: any) => {
      const { data: txn, error: txnError } = await supabase
        .from("transactions")
        .insert({
          event_id: eventId,
          type: forecast.type,
          description: forecast.description,
          amount: Number(forecast.amount),
          iva_rate: forecast.iva_rate,
          category_id: forecast.category_id || null,
          specification: forecast.specification || null,
          date: eventDate,
          status: "pending",
        })
        .select("id")
        .single();
      if (txnError) throw txnError;

      const { error: updateError } = await supabase
        .from("event_forecasts")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: user?.email || "admin",
          transaction_id: txn.id,
        })
        .eq("id", forecast.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_transactions_actual", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_transactions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_detail", eventId] });
      toast({ title: "Previsão aprovada e transação criada!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao aprovar", description: err.message, variant: "destructive" });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (forecastItems: any[]) => {
      for (const forecast of forecastItems) {
        const { data: txn, error: txnError } = await supabase
          .from("transactions")
          .insert({
            event_id: eventId,
            type: forecast.type,
            description: forecast.description,
            amount: Number(forecast.amount),
            iva_rate: forecast.iva_rate,
            category_id: forecast.category_id || null,
            specification: forecast.specification || null,
            date: eventDate,
            status: "pending",
          })
          .select("id")
          .single();
        if (txnError) throw txnError;

        const { error: updateError } = await supabase
          .from("event_forecasts")
          .update({
            status: "approved",
            approved_at: new Date().toISOString(),
            approved_by: user?.email || "admin",
            transaction_id: txn.id,
          })
          .eq("id", forecast.id);
        if (updateError) throw updateError;
      }
    },
    onSuccess: (_, items) => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_transactions_actual", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_transactions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_detail", eventId] });
      setSelectedIds(new Set());
      toast({ title: `${items.length} previsão(ões) aprovada(s) e transações criadas!` });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao aprovar em lote", description: err.message, variant: "destructive" });
    },
  });

  const handleBulkApprove = () => {
    const items = forecasts.filter((f) => selectedIds.has(f.id) && f.status === "draft");
    if (items.length === 0) return;
    bulkApproveMutation.mutate(items);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllDrafts = (type: "income" | "expense") => {
    const drafts = forecasts.filter((f) => f.type === type && f.status === "draft");
    const allSelected = drafts.every((f) => selectedIds.has(f.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        drafts.forEach((f) => next.delete(f.id));
      } else {
        drafts.forEach((f) => next.add(f.id));
      }
      return next;
    });
  };

  const handleInlineSave = () => {
    if (!inlineForm.description || !inlineForm.amount) {
      toast({ title: "Preencha a descrição e valor", variant: "destructive" });
      return;
    }
    saveMutation.mutate({ form: inlineForm, id: editingId });
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInlineSave();
    } else if (e.key === "Escape") {
      setAddingType(null);
      setEditingId(null);
      setInlineForm(emptyInline);
    }
  };

  const startEdit = (f: any) => {
    setInlineForm({
      type: f.type,
      description: f.description,
      amount: String(f.amount),
      iva_rate: String(f.iva_rate),
      category_id: f.category_id || "",
      notes: f.notes || "",
      specification: f.specification || "",
    });
    setEditingId(f.id);
    setAddingType(null);
  };

  const startAdding = (type: "income" | "expense") => {
    setAddingType(type);
    setEditingId(null);
    setInlineForm({ ...emptyInline, type });
  };

  const cancelInline = () => {
    setAddingType(null);
    setEditingId(null);
    setInlineForm(emptyInline);
  };

  const incomeForecasts = forecasts.filter((f) => f.type === "income");
  const expenseForecasts = forecasts.filter((f) => f.type === "expense");
  const totalForecastIncome = incomeForecasts.reduce((s, f) => s + Number(f.amount), 0) + ticketRevenue;
  const totalForecastExpense = expenseForecasts.reduce((s, f) => s + Number(f.amount), 0);
  const forecastProfit = totalForecastIncome - totalForecastExpense;

  const totalActualIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalActualExpense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const actualProfit = totalActualIncome - totalActualExpense;

  const comparisonData = buildComparison(forecasts, transactions, categories);

  const draftCount = forecasts.filter((f) => f.status === "draft").length;
  const approvedCount = forecasts.filter((f) => f.status === "approved").length;

  const incomeCategories = categories.filter((c) => c.type === "income");
  const expenseCategories = categories.filter((c) => c.type === "expense");

  const inputClass = "w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50";

  const renderInlineRow = (type: "income" | "expense") => {
    const cats = type === "income" ? incomeCategories : expenseCategories;
    const isExpenseType = type === "expense";
    return (
      <tr className="bg-primary/5 animate-fade-in" onKeyDown={handleInlineKeyDown}>
        <td className="py-1.5 pr-2">
          <input
            ref={descRef}
            value={inlineForm.description}
            onChange={(e) => setInlineForm({ ...inlineForm, description: e.target.value })}
            className={inputClass}
            placeholder="Descrição…"
            autoFocus
          />
        </td>
        {isExpenseType && (
          <td className="py-1.5 pr-2">
            <input
              value={inlineForm.specification}
              onChange={(e) => setInlineForm({ ...inlineForm, specification: e.target.value })}
              className={inputClass}
              placeholder="Especificação…"
            />
          </td>
        )}
        <td className="hidden py-1.5 pr-2 sm:table-cell">
          <select
            value={inlineForm.category_id}
            onChange={(e) => setInlineForm({ ...inlineForm, category_id: e.target.value })}
            className={inputClass}
          >
            <option value="">—</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
            ))}
          </select>
        </td>
        <td className="py-1.5 pr-2">
          <select
            value={inlineForm.iva_rate}
            onChange={(e) => setInlineForm({ ...inlineForm, iva_rate: e.target.value })}
            className={`${inputClass} w-20`}
          >
            <option value="23">23%</option>
            <option value="13">13%</option>
            <option value="6">6%</option>
            <option value="0">0%</option>
          </select>
        </td>
        <td className="py-1.5 pr-2">
          <input
            type="number"
            step="0.01"
            min="0"
            value={inlineForm.amount}
            onChange={(e) => setInlineForm({ ...inlineForm, amount: e.target.value })}
            className={`${inputClass} w-28 text-right font-mono`}
            placeholder="0,00"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleInlineSave(); } }}
          />
        </td>
        <td className="py-1.5 text-right">
          <div className="flex justify-end gap-1">
            <button
              onClick={handleInlineSave}
              disabled={saveMutation.isPending}
              className="rounded p-1.5 bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-50"
              title="Guardar (Enter)"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={cancelInline}
              className="rounded p-1.5 hover:bg-secondary transition-colors"
              title="Cancelar (Esc)"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Receitas" forecast={totalForecastIncome} actual={totalActualIncome} icon={<TrendingUp className="h-4 w-4 text-success" />} />
        <SummaryCard label="Despesas" forecast={totalForecastExpense} actual={totalActualExpense} icon={<TrendingDown className="h-4 w-4 text-warning" />} />
        <SummaryCard label="Resultado" forecast={forecastProfit} actual={actualProfit} icon={<BarChart3 className="h-4 w-4 text-primary" />} isProfit />
        <div className="glass rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Estado do P&L
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Pendentes</span>
              <p className="font-mono font-bold text-sm text-warning">{draftCount}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Aprovadas</span>
              <p className="font-mono font-bold text-sm text-success">{approvedCount}</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="forecasts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="forecasts">Previsões</TabsTrigger>
          <TabsTrigger value="comparison">Previsão vs Real</TabsTrigger>
        </TabsList>

        <TabsContent value="forecasts">
          {isLoading ? (
            <p className="py-8 text-center text-muted-foreground">A carregar…</p>
          ) : (
            <div className="space-y-6">
              {/* Income section */}
              <div className="glass rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Receitas Previstas</h3>
                    {isAdmin && incomeForecasts.some((f) => f.status === "draft") && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={incomeForecasts.filter((f) => f.status === "draft").every((f) => selectedIds.has(f.id))}
                          onCheckedChange={() => toggleSelectAllDrafts("income")}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-xs text-muted-foreground">Selecionar rascunhos</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && incomeForecasts.some((f) => selectedIds.has(f.id) && f.status === "draft") && (
                      <button
                        onClick={handleBulkApprove}
                        disabled={bulkApproveMutation.isPending}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success bg-success/15 hover:bg-success/25 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Aprovar ({incomeForecasts.filter((f) => selectedIds.has(f.id) && f.status === "draft").length})
                      </button>
                    )}
                    <button
                      onClick={() => startAdding("income")}
                      disabled={addingType === "income"}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success bg-success/10 hover:bg-success/20 transition-colors disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 text-left font-medium">Descrição</th>
                        <th className="hidden pb-2 text-left font-medium sm:table-cell">Categoria</th>
                        <th className="pb-2 text-right font-medium">IVA</th>
                        <th className="pb-2 text-right font-medium">Valor</th>
                        <th className="pb-2 text-right font-medium w-28">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {incomeForecasts.map((f) => (
                        editingId === f.id ? (
                          <tr key={f.id} className="bg-primary/5" onKeyDown={handleInlineKeyDown}>
                            <td className="py-1.5 pr-2">
                              <input ref={descRef} value={inlineForm.description} onChange={(e) => setInlineForm({ ...inlineForm, description: e.target.value })} className={inputClass} autoFocus />
                            </td>
                            <td className="hidden py-1.5 pr-2 sm:table-cell">
                              <select value={inlineForm.category_id} onChange={(e) => setInlineForm({ ...inlineForm, category_id: e.target.value })} className={inputClass}>
                                <option value="">—</option>
                                {incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                              </select>
                            </td>
                            <td className="py-1.5 pr-2">
                              <select value={inlineForm.iva_rate} onChange={(e) => setInlineForm({ ...inlineForm, iva_rate: e.target.value })} className={`${inputClass} w-20`}>
                                <option value="23">23%</option><option value="13">13%</option><option value="6">6%</option><option value="0">0%</option>
                              </select>
                            </td>
                            <td className="py-1.5 pr-2">
                              <input type="number" step="0.01" min="0" value={inlineForm.amount} onChange={(e) => setInlineForm({ ...inlineForm, amount: e.target.value })} className={`${inputClass} w-28 text-right font-mono`} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleInlineSave(); }}} />
                            </td>
                            <td className="py-1.5 text-right">
                              <div className="flex justify-end gap-1">
                                <button onClick={handleInlineSave} disabled={saveMutation.isPending} className="rounded p-1.5 bg-success/15 text-success hover:bg-success/25 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                                <button onClick={cancelInline} className="rounded p-1.5 hover:bg-secondary"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <ForecastRow key={f.id} item={f} colorClass="text-success" onEdit={startEdit} onDelete={(id) => deleteMutation.mutate(id)} onApprove={(item) => approveMutation.mutate(item)} isAdmin={isAdmin} isApproving={approveMutation.isPending} isSelected={selectedIds.has(f.id)} onToggleSelect={toggleSelect} />
                        )
                      ))}
                      {addingType === "income" && renderInlineRow("income")}
                      {ticketRevenue > 0 && (
                        <tr className="bg-success/5 border-t border-border/30">
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2">
                              <Ticket className="h-3.5 w-3.5 text-success shrink-0" />
                              <div>
                                <p className="font-medium text-success/80">Venda de Bilhetes</p>
                                <p className="text-xs text-muted-foreground">Calculado automaticamente da Bilheteira</p>
                              </div>
                            </div>
                          </td>
                          <td className="hidden py-2.5 pr-3 text-muted-foreground sm:table-cell text-xs">R01 - Venda de Bilhetes</td>
                          <td className="py-2.5 text-right text-muted-foreground text-xs">—</td>
                          <td className="py-2.5 text-right font-mono font-semibold text-success">{formatCurrency(ticketRevenue)}</td>
                          <td />
                        </tr>
                      )}
                    </tbody>
                    {(incomeForecasts.length > 0 || addingType === "income" || ticketRevenue > 0) && (
                      <tfoot>
                        <tr className="border-t border-border/50">
                          <td colSpan={3} className="py-2.5 text-right text-xs font-medium text-muted-foreground">Total</td>
                          <td className="py-2.5 text-right font-mono font-bold text-success">{formatCurrency(totalForecastIncome)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  {incomeForecasts.length === 0 && addingType !== "income" && (
                    <p className="py-4 text-center text-xs text-muted-foreground">Sem receitas previstas</p>
                  )}
                </div>
              </div>

              {/* Expense section */}
              <div className="glass rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Despesas Previstas</h3>
                    {isAdmin && expenseForecasts.some((f) => f.status === "draft") && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={expenseForecasts.filter((f) => f.status === "draft").every((f) => selectedIds.has(f.id))}
                          onCheckedChange={() => toggleSelectAllDrafts("expense")}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-xs text-muted-foreground">Selecionar rascunhos</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && expenseForecasts.some((f) => selectedIds.has(f.id) && f.status === "draft") && (
                      <button
                        onClick={handleBulkApprove}
                        disabled={bulkApproveMutation.isPending}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success bg-success/15 hover:bg-success/25 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Aprovar ({expenseForecasts.filter((f) => selectedIds.has(f.id) && f.status === "draft").length})
                      </button>
                    )}
                    <button
                      onClick={() => startAdding("expense")}
                      disabled={addingType === "expense"}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-warning bg-warning/10 hover:bg-warning/20 transition-colors disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 text-left font-medium">Descrição</th>
                        <th className="pb-2 text-left font-medium">Especificação</th>
                        <th className="hidden pb-2 text-left font-medium sm:table-cell">Categoria</th>
                        <th className="pb-2 text-right font-medium">IVA</th>
                        <th className="pb-2 text-right font-medium">Valor</th>
                        <th className="pb-2 text-right font-medium w-28">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {expenseForecasts.map((f) => (
                        editingId === f.id ? (
                          <tr key={f.id} className="bg-primary/5" onKeyDown={handleInlineKeyDown}>
                            <td className="py-1.5 pr-2">
                              <input ref={descRef} value={inlineForm.description} onChange={(e) => setInlineForm({ ...inlineForm, description: e.target.value })} className={inputClass} autoFocus />
                            </td>
                            <td className="py-1.5 pr-2">
                              <input value={inlineForm.specification} onChange={(e) => setInlineForm({ ...inlineForm, specification: e.target.value })} className={inputClass} placeholder="Especificação…" />
                            </td>
                            <td className="hidden py-1.5 pr-2 sm:table-cell">
                              <select value={inlineForm.category_id} onChange={(e) => setInlineForm({ ...inlineForm, category_id: e.target.value })} className={inputClass}>
                                <option value="">—</option>
                                {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                              </select>
                            </td>
                            <td className="py-1.5 pr-2">
                              <select value={inlineForm.iva_rate} onChange={(e) => setInlineForm({ ...inlineForm, iva_rate: e.target.value })} className={`${inputClass} w-20`}>
                                <option value="23">23%</option><option value="13">13%</option><option value="6">6%</option><option value="0">0%</option>
                              </select>
                            </td>
                            <td className="py-1.5 pr-2">
                              <input type="number" step="0.01" min="0" value={inlineForm.amount} onChange={(e) => setInlineForm({ ...inlineForm, amount: e.target.value })} className={`${inputClass} w-28 text-right font-mono`} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleInlineSave(); }}} />
                            </td>
                            <td className="py-1.5 text-right">
                              <div className="flex justify-end gap-1">
                                <button onClick={handleInlineSave} disabled={saveMutation.isPending} className="rounded p-1.5 bg-success/15 text-success hover:bg-success/25 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                                <button onClick={cancelInline} className="rounded p-1.5 hover:bg-secondary"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <ForecastRow key={f.id} item={f} colorClass="text-warning" isExpense onEdit={startEdit} onDelete={(id) => deleteMutation.mutate(id)} onApprove={(item) => approveMutation.mutate(item)} isAdmin={isAdmin} isApproving={approveMutation.isPending} />
                        )
                      ))}
                      {addingType === "expense" && renderInlineRow("expense")}
                    </tbody>
                    {(expenseForecasts.length > 0 || addingType === "expense") && (
                      <tfoot>
                        <tr className="border-t border-border/50">
                          <td colSpan={4} className="py-2.5 text-right text-xs font-medium text-muted-foreground">Total</td>
                          <td className="py-2.5 text-right font-mono font-bold text-warning">{formatCurrency(totalForecastExpense)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  {expenseForecasts.length === 0 && addingType !== "expense" && (
                    <p className="py-4 text-center text-xs text-muted-foreground">Sem despesas previstas</p>
                  )}
                </div>
              </div>

              {/* P&L summary row */}
              {(incomeForecasts.length > 0 || expenseForecasts.length > 0) && (
                <div className="glass rounded-xl p-4 flex items-center justify-between">
                  <span className="text-sm font-semibold">Resultado Previsto</span>
                  <span className={`font-mono text-lg font-bold ${forecastProfit >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(forecastProfit)}
                  </span>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="comparison">
          <ComparisonTable data={comparisonData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Sub-components ── */

function ForecastRow({ item, colorClass, isExpense, onEdit, onDelete, onApprove, isAdmin, isApproving, isSelected, onToggleSelect }: {
  item: any; colorClass: string; isExpense?: boolean;
  onEdit: (item: any) => void; onDelete: (id: string) => void;
  onApprove: (item: any) => void; isAdmin: boolean; isApproving: boolean;
  isSelected?: boolean; onToggleSelect?: (id: string) => void;
}) {
  const isDraft = item.status === "draft";
  const isApproved = item.status === "approved";

  return (
    <tr className={isApproved ? "opacity-60" : "group hover:bg-muted/30 transition-colors"}>
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2">
          {isDraft && isAdmin && onToggleSelect ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(item.id)}
              className="h-3.5 w-3.5 shrink-0"
            />
          ) : isApproved ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-warning shrink-0" />
          )}
          <div>
            <p className="font-medium">{item.description}</p>
            {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
            {isApproved && item.transaction_id && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Link2 className="h-3 w-3" /> Transação criada
              </p>
            )}
          </div>
        </div>
      </td>
      {isExpense && (
        <td className="py-2.5 pr-3 text-muted-foreground text-xs">
          {item.specification || "—"}
        </td>
      )}
      <td className="hidden py-2.5 pr-3 text-muted-foreground sm:table-cell text-xs">
        {item.account_categories ? `${item.account_categories.code} - ${item.account_categories.name}` : "—"}
      </td>
      <td className="py-2.5 text-right text-muted-foreground text-xs">{item.iva_rate}%</td>
      <td className={`py-2.5 text-right font-mono font-semibold ${colorClass}`}>
        {formatCurrency(Number(item.amount))}
      </td>
      <td className="py-2.5 text-right">
        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {isDraft && isAdmin && (
            <button
              onClick={() => onApprove(item)}
              disabled={isApproving}
              className="rounded px-2 py-1 text-xs font-medium bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-50"
              title="Aprovar e criar transação"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </button>
          )}
          {isDraft && (
            <>
              <button onClick={() => onEdit(item)} className="rounded p-1 hover:bg-secondary" title="Editar">
                <svg className="h-3.5 w-3.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </button>
              <button onClick={() => onDelete(item.id)} className="rounded p-1 hover:bg-destructive/20" title="Remover">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function SummaryCard({ label, forecast, actual, icon, isProfit }: {
  label: string; forecast: number; actual: number; icon: React.ReactNode; isProfit?: boolean;
}) {
  const variance = actual - forecast;
  const variancePct = forecast !== 0 ? (variance / Math.abs(forecast)) * 100 : 0;
  const isPositive = isProfit ? variance >= 0 : (label === "Despesas" ? variance <= 0 : variance >= 0);

  return (
    <div className="glass rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}{label}</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Previsão</span>
          <p className="font-mono font-bold text-sm">{formatCurrency(forecast)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Real</span>
          <p className="font-mono font-bold text-sm">{formatCurrency(actual)}</p>
        </div>
      </div>
      {forecast > 0 && (
        <div className={`text-xs font-medium ${isPositive ? "text-success" : "text-destructive"}`}>
          {variance >= 0 ? "+" : ""}{formatCurrency(variance)} ({variancePct >= 0 ? "+" : ""}{variancePct.toFixed(1)}%)
        </div>
      )}
    </div>
  );
}

/* ── Comparison ── */

interface ComparisonRow {
  categoryCode: string;
  categoryName: string;
  type: string;
  forecast: number;
  actual: number;
  variance: number;
}

function buildComparison(forecasts: any[], transactions: any[], categories: any[]): ComparisonRow[] {
  const map: Record<string, ComparisonRow> = {};
  const getKey = (type: string, catId: string | null) => `${type}_${catId || "none"}`;
  const getCatInfo = (catId: string | null, cats: any[]) => {
    if (!catId) return { code: "—", name: "Sem categoria" };
    const c = cats.find((x) => x.id === catId);
    return c ? { code: c.code, name: c.name } : { code: "—", name: "Desconhecida" };
  };

  forecasts.forEach((f) => {
    const key = getKey(f.type, f.category_id);
    const cat = getCatInfo(f.category_id, categories);
    if (!map[key]) map[key] = { categoryCode: cat.code, categoryName: cat.name, type: f.type, forecast: 0, actual: 0, variance: 0 };
    map[key].forecast += Number(f.amount);
  });
  transactions.forEach((t) => {
    const key = getKey(t.type, t.category_id);
    const cat = getCatInfo(t.category_id, categories);
    if (!map[key]) map[key] = { categoryCode: cat.code, categoryName: cat.name, type: t.type, forecast: 0, actual: 0, variance: 0 };
    map[key].actual += Number(t.amount);
  });

  return Object.values(map)
    .map((r) => ({ ...r, variance: r.actual - r.forecast }))
    .sort((a, b) => { if (a.type !== b.type) return a.type === "income" ? -1 : 1; return a.categoryCode.localeCompare(b.categoryCode); });
}

function ComparisonTable({ data }: { data: ComparisonRow[] }) {
  const incomeRows = data.filter((r) => r.type === "income");
  const expenseRows = data.filter((r) => r.type === "expense");
  const totalFI = incomeRows.reduce((s, r) => s + r.forecast, 0);
  const totalAI = incomeRows.reduce((s, r) => s + r.actual, 0);
  const totalFE = expenseRows.reduce((s, r) => s + r.forecast, 0);
  const totalAE = expenseRows.reduce((s, r) => s + r.actual, 0);

  if (data.length === 0) return <p className="py-8 text-center text-muted-foreground">Adicione previsões e transações para ver a comparação.</p>;

  return (
    <div className="glass rounded-xl p-5 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
            <th className="pb-2 text-left font-medium">Categoria</th>
            <th className="pb-2 text-right font-medium">Previsão</th>
            <th className="pb-2 text-right font-medium">Real</th>
            <th className="pb-2 text-right font-medium">Variação</th>
            <th className="pb-2 text-right font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {incomeRows.length > 0 && (
            <>
              <tr><td colSpan={5} className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-success">Receitas</td></tr>
              {incomeRows.map((r) => <ComparisonRowItem key={`i-${r.categoryCode}`} row={r} isIncome />)}
              <tr className="border-t border-border/50 font-bold">
                <td className="py-2 text-xs text-muted-foreground">Subtotal Receitas</td>
                <td className="py-2 text-right font-mono">{formatCurrency(totalFI)}</td>
                <td className="py-2 text-right font-mono">{formatCurrency(totalAI)}</td>
                <td className={`py-2 text-right font-mono ${totalAI - totalFI >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(totalAI - totalFI)}</td>
                <td className="py-2 text-right text-xs">{totalFI > 0 ? `${(((totalAI - totalFI) / totalFI) * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            </>
          )}
          {expenseRows.length > 0 && (
            <>
              <tr><td colSpan={5} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-warning">Despesas</td></tr>
              {expenseRows.map((r) => <ComparisonRowItem key={`e-${r.categoryCode}`} row={r} />)}
              <tr className="border-t border-border/50 font-bold">
                <td className="py-2 text-xs text-muted-foreground">Subtotal Despesas</td>
                <td className="py-2 text-right font-mono">{formatCurrency(totalFE)}</td>
                <td className="py-2 text-right font-mono">{formatCurrency(totalAE)}</td>
                <td className={`py-2 text-right font-mono ${totalAE - totalFE <= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(totalAE - totalFE)}</td>
                <td className="py-2 text-right text-xs">{totalFE > 0 ? `${(((totalAE - totalFE) / totalFE) * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            </>
          )}
          <tr className="border-t-2 border-primary/30 font-bold">
            <td className="py-3 text-sm">Resultado Líquido</td>
            <td className="py-3 text-right font-mono">{formatCurrency(totalFI - totalFE)}</td>
            <td className="py-3 text-right font-mono">{formatCurrency(totalAI - totalAE)}</td>
            <td className={`py-3 text-right font-mono ${(totalAI - totalAE) - (totalFI - totalFE) >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency((totalAI - totalAE) - (totalFI - totalFE))}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ComparisonRowItem({ row, isIncome }: { row: ComparisonRow; isIncome?: boolean }) {
  const variancePct = row.forecast > 0 ? (row.variance / row.forecast) * 100 : 0;
  const isPositive = isIncome ? row.variance >= 0 : row.variance <= 0;
  return (
    <tr className="border-b border-border/20">
      <td className="py-2 pr-3"><span className="text-xs text-muted-foreground mr-1.5">{row.categoryCode}</span>{row.categoryName}</td>
      <td className="py-2 text-right font-mono">{formatCurrency(row.forecast)}</td>
      <td className="py-2 text-right font-mono">{formatCurrency(row.actual)}</td>
      <td className={`py-2 text-right font-mono ${isPositive ? "text-success" : "text-destructive"}`}>{row.variance >= 0 ? "+" : ""}{formatCurrency(row.variance)}</td>
      <td className={`py-2 text-right text-xs ${isPositive ? "text-success" : "text-destructive"}`}>{row.forecast > 0 ? `${variancePct >= 0 ? "+" : ""}${variancePct.toFixed(1)}%` : "—"}</td>
    </tr>
  );
}
