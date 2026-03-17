import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, X, TrendingUp, TrendingDown, BarChart3, Trash2, Edit2, CheckCircle2, Clock, Link2 } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ForecastForm {
  type: string;
  description: string;
  amount: string;
  iva_rate: string;
  category_id: string;
  notes: string;
}

const emptyForm: ForecastForm = {
  type: "expense",
  description: "",
  amount: "",
  iva_rate: "23",
  category_id: "",
  notes: "",
};

interface Props {
  eventId: string;
  eventDate: string;
}

export function EventForecast({ eventId, eventDate }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ForecastForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin, user } = useAuth();

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

  const createMutation = useMutation({
    mutationFn: async (data: ForecastForm) => {
      const payload = {
        event_id: eventId,
        type: data.type,
        description: data.description,
        amount: parseFloat(data.amount) || 0,
        iva_rate: parseInt(data.iva_rate) || 23,
        category_id: data.category_id || null,
        notes: data.notes || null,
      };
      if (editingId) {
        const { error } = await supabase.from("event_forecasts").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_forecasts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      toast({ title: editingId ? "Previsão atualizada!" : "Previsão adicionada!" });
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
      // 1. Create the transaction from the forecast
      const { data: txn, error: txnError } = await supabase
        .from("transactions")
        .insert({
          event_id: eventId,
          type: forecast.type,
          description: forecast.description,
          amount: Number(forecast.amount),
          iva_rate: forecast.iva_rate,
          category_id: forecast.category_id || null,
          date: eventDate,
          status: "pending",
        })
        .select("id")
        .single();
      if (txnError) throw txnError;

      // 2. Update the forecast as approved with link to transaction
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount) {
      toast({ title: "Preencha a descrição e valor", variant: "destructive" });
      return;
    }
    createMutation.mutate(form);
  };

  const startEdit = (f: any) => {
    setForm({
      type: f.type,
      description: f.description,
      amount: String(f.amount),
      iva_rate: String(f.iva_rate),
      category_id: f.category_id || "",
      notes: f.notes || "",
    });
    setEditingId(f.id);
    setShowForm(true);
  };

  const incomeForecasts = forecasts.filter((f) => f.type === "income");
  const expenseForecasts = forecasts.filter((f) => f.type === "expense");
  const totalForecastIncome = incomeForecasts.reduce((s, f) => s + Number(f.amount), 0);
  const totalForecastExpense = expenseForecasts.reduce((s, f) => s + Number(f.amount), 0);
  const forecastProfit = totalForecastIncome - totalForecastExpense;

  const totalActualIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalActualExpense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const actualProfit = totalActualIncome - totalActualExpense;

  const comparisonData = buildComparison(forecasts, transactions, categories);

  const filteredCategories = categories.filter((c) =>
    form.type === "income" ? c.type === "income" : c.type === "expense"
  );

  const draftCount = forecasts.filter((f) => f.status === "draft").length;
  const approvedCount = forecasts.filter((f) => f.status === "approved").length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Receitas"
          forecast={totalForecastIncome}
          actual={totalActualIncome}
          icon={<TrendingUp className="h-4 w-4 text-success" />}
        />
        <SummaryCard
          label="Despesas"
          forecast={totalForecastExpense}
          actual={totalActualExpense}
          icon={<TrendingDown className="h-4 w-4 text-warning" />}
        />
        <SummaryCard
          label="Resultado"
          forecast={forecastProfit}
          actual={actualProfit}
          icon={<BarChart3 className="h-4 w-4 text-primary" />}
          isProfit
        />
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
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="forecasts">Previsões</TabsTrigger>
            <TabsTrigger value="comparison">Previsão vs Real</TabsTrigger>
          </TabsList>
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova Previsão</span>
          </button>
        </div>

        <TabsContent value="forecasts">
          {isLoading ? (
            <p className="py-8 text-center text-muted-foreground">A carregar…</p>
          ) : forecasts.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Sem previsões registadas. Adicione receitas e despesas previstas para este evento.</p>
          ) : (
            <div className="space-y-6">
              {incomeForecasts.length > 0 && (
                <ForecastSection
                  title="Receitas Previstas"
                  items={incomeForecasts}
                  total={totalForecastIncome}
                  colorClass="text-success"
                  onEdit={startEdit}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  onApprove={(f) => approveMutation.mutate(f)}
                  isAdmin={isAdmin}
                  isApproving={approveMutation.isPending}
                />
              )}
              {expenseForecasts.length > 0 && (
                <ForecastSection
                  title="Despesas Previstas"
                  items={expenseForecasts}
                  total={totalForecastExpense}
                  colorClass="text-warning"
                  onEdit={startEdit}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  onApprove={(f) => approveMutation.mutate(f)}
                  isAdmin={isAdmin}
                  isApproving={approveMutation.isPending}
                />
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="comparison">
          <ComparisonTable data={comparisonData} />
        </TabsContent>
      </Tabs>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { setShowForm(false); setEditingId(null); }}>
          <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingId ? "Editar Previsão" : "Nova Previsão"}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg p-1 hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Tipo *</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value, category_id: "" })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="income">Receita</option>
                    <option value="expense">Despesa</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Taxa IVA</label>
                  <select
                    value={form.iva_rate}
                    onChange={(e) => setForm({ ...form, iva_rate: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="23">23% - Normal</option>
                    <option value="13">13% - Intermédia</option>
                    <option value="6">6% - Reduzida</option>
                    <option value="0">0% - Isento</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Categoria</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Sem categoria</option>
                  {filteredCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição *</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Ex: Patrocínio principal"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor (€) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Notas</label>
                  <input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                {createMutation.isPending ? "A guardar…" : editingId ? "Atualizar" : "Adicionar Previsão"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
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

function ForecastStatusBadge({ status }: { status: string }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
        <CheckCircle2 className="h-3 w-3" /> Aprovada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
      <Clock className="h-3 w-3" /> Pendente
    </span>
  );
}

function ForecastSection({ title, items, total, colorClass, onEdit, onDelete, onApprove, isAdmin, isApproving }: {
  title: string; items: any[]; total: number; colorClass: string;
  onEdit: (item: any) => void; onDelete: (id: string) => void;
  onApprove: (item: any) => void; isAdmin: boolean; isApproving: boolean;
}) {
  return (
    <div className="glass rounded-xl p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="pb-2 text-left font-medium">Descrição</th>
              <th className="hidden pb-2 text-left font-medium sm:table-cell">Categoria</th>
              <th className="pb-2 text-center font-medium">Estado</th>
              <th className="pb-2 text-right font-medium">IVA</th>
              <th className="pb-2 text-right font-medium">Valor</th>
              <th className="pb-2 text-right font-medium w-28">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {items.map((f) => {
              const isDraft = f.status === "draft";
              const isApproved = f.status === "approved";
              return (
                <tr key={f.id} className={isApproved ? "opacity-75" : ""}>
                  <td className="py-2.5 pr-3">
                    <p className="font-medium">{f.description}</p>
                    {f.notes && <p className="text-xs text-muted-foreground">{f.notes}</p>}
                    {isApproved && f.transaction_id && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Link2 className="h-3 w-3" /> Transação criada
                      </p>
                    )}
                  </td>
                  <td className="hidden py-2.5 pr-3 text-muted-foreground sm:table-cell">
                    {f.account_categories ? `${f.account_categories.code} - ${f.account_categories.name}` : "—"}
                  </td>
                  <td className="py-2.5 text-center">
                    <ForecastStatusBadge status={f.status} />
                  </td>
                  <td className="py-2.5 text-right text-muted-foreground">{f.iva_rate}%</td>
                  <td className={`py-2.5 text-right font-mono font-semibold ${colorClass}`}>
                    {formatCurrency(Number(f.amount))}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      {isDraft && isAdmin && (
                        <button
                          onClick={() => onApprove(f)}
                          disabled={isApproving}
                          className="rounded px-2 py-1 text-xs font-medium bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-50"
                          title="Aprovar e criar transação"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {isDraft && (
                        <>
                          <button onClick={() => onEdit(f)} className="rounded p-1 hover:bg-secondary" title="Editar">
                            <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button onClick={() => onDelete(f.id)} className="rounded p-1 hover:bg-destructive/20" title="Remover">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/50">
              <td colSpan={4} className="py-2.5 text-right text-xs font-medium text-muted-foreground">Total</td>
              <td className={`py-2.5 text-right font-mono font-bold ${colorClass}`}>{formatCurrency(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

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
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "income" ? -1 : 1;
      return a.categoryCode.localeCompare(b.categoryCode);
    });
}

function ComparisonTable({ data }: { data: ComparisonRow[] }) {
  const incomeRows = data.filter((r) => r.type === "income");
  const expenseRows = data.filter((r) => r.type === "expense");

  const totalFI = incomeRows.reduce((s, r) => s + r.forecast, 0);
  const totalAI = incomeRows.reduce((s, r) => s + r.actual, 0);
  const totalFE = expenseRows.reduce((s, r) => s + r.forecast, 0);
  const totalAE = expenseRows.reduce((s, r) => s + r.actual, 0);

  if (data.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">Adicione previsões e transações para ver a comparação.</p>;
  }

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
      <td className="py-2 pr-3">
        <span className="text-xs text-muted-foreground mr-1.5">{row.categoryCode}</span>
        {row.categoryName}
      </td>
      <td className="py-2 text-right font-mono">{formatCurrency(row.forecast)}</td>
      <td className="py-2 text-right font-mono">{formatCurrency(row.actual)}</td>
      <td className={`py-2 text-right font-mono ${isPositive ? "text-success" : "text-destructive"}`}>
        {row.variance >= 0 ? "+" : ""}{formatCurrency(row.variance)}
      </td>
      <td className={`py-2 text-right text-xs ${isPositive ? "text-success" : "text-destructive"}`}>
        {row.forecast > 0 ? `${variancePct >= 0 ? "+" : ""}${variancePct.toFixed(1)}%` : "—"}
      </td>
    </tr>
  );
}
