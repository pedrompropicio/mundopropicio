import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { IvaRate } from "@/lib/mock-data";
import { X, Plus, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SupplierFormModal } from "@/components/SupplierFormModal";

interface TransactionForm {
  description: string;
  type: "income" | "expense";
  amount: string;
  iva_rate: IvaRate;
  event_id: string;
  category_id: string;
  supplier_id: string;
  account_id: string;
  date: string;
  due_date: string;
  specification: string;
}

const emptyForm: TransactionForm = {
  description: "",
  type: "income",
  amount: "",
  iva_rate: 23,
  event_id: "",
  category_id: "",
  supplier_id: "",
  account_id: "",
  date: new Date().toISOString().split("T")[0],
  due_date: "",
  specification: "",
};

export function TransactionFormModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<TransactionForm>(emptyForm);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [showProrationConfirm, setShowProrationConfirm] = useState(false);
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery({
    queryKey: ["events-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name, pl_mode, event_type, parent_event_id" as any).in("status", ["planning", "active", "confirmed"]).order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["account_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("id, name, type, parent_id, event_required").eq("is_active", true).order("code");
      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: financialAccounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("id, name, type").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  // Get the selected event's pl_mode and multi_day info
  const selectedEvent = events.find((e: any) => e.id === form.event_id);
  const isActivePL = selectedEvent?.pl_mode === "active";
  const isParentMultiDay = selectedEvent?.event_type === "multi_day";

  // Group events: parents and sub-events
  const parentEvents = useMemo(() => events.filter((e: any) => !e.parent_event_id), [events]);
  const subEventsByParent = useMemo(() => {
    const map: Record<string, any[]> = {};
    events.filter((e: any) => e.parent_event_id).forEach((e: any) => {
      if (!map[e.parent_event_id]) map[e.parent_event_id] = [];
      map[e.parent_event_id].push(e);
    });
    return map;
  }, [events]);

  // Fetch forecasts for active P&L events
  const { data: eventForecasts = [] } = useQuery({
    queryKey: ["event_forecasts_budget", form.event_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, type, category_id, amount, status")
        .eq("event_id", form.event_id);
      if (error) throw error;
      return data;
    },
    enabled: !!form.event_id && isActivePL,
  });

  // Fetch existing transactions for the event to calculate used budget
  const { data: eventTransactions = [] } = useQuery({
    queryKey: ["event_transactions_budget", form.event_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, type, category_id, amount")
        .eq("event_id", form.event_id);
      if (error) throw error;
      return data;
    },
    enabled: !!form.event_id && isActivePL,
  });

  // For active P&L: get allowed categories and remaining budgets
  const forecastBudgetByCategory = isActivePL
    ? eventForecasts.reduce<Record<string, number>>((acc, f) => {
        const key = `${f.type}_${f.category_id || "none"}`;
        acc[key] = (acc[key] || 0) + Number(f.amount);
        return acc;
      }, {})
    : {};

  const usedBudgetByCategory = isActivePL
    ? eventTransactions.reduce<Record<string, number>>((acc, t) => {
        const key = `${t.type}_${t.category_id || "none"}`;
        acc[key] = (acc[key] || 0) + Number(t.amount);
        return acc;
      }, {})
    : {};

  const allowedCategoryIds = isActivePL
    ? [...new Set(eventForecasts.filter(f => f.type === form.type).map(f => f.category_id).filter(Boolean))]
    : [];


  const createMutation = useMutation({
    mutationFn: async (data: TransactionForm) => {
      const { error } = await supabase.from("transactions").insert({
        description: data.description,
        type: data.type,
        amount: parseFloat(data.amount),
        iva_rate: data.iva_rate,
        event_id: data.event_id || null,
        category_id: data.category_id || null,
        supplier_id: data.supplier_id || null,
        account_id: data.account_id || null,
        specification: data.type === "expense" ? (data.specification || null) : null,
        date: data.date,
        due_date: data.due_date || null,
        status: "pending",
        paid_amount: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onClose();
      toast({ title: "Transação criada com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar transação", description: err.message, variant: "destructive" });
    },
  });

  // Find root category flags for selected category
  const getRootFlags = (categoryId: string) => {
    if (!categoryId) return { event_required: true };
    let cat = categories.find((c: any) => c.id === categoryId);
    while (cat && cat.parent_id) {
      cat = categories.find((c: any) => c.id === cat!.parent_id);
    }
    return {
      event_required: cat?.event_required ?? true,
    };
  };

  const rootFlags = getRootFlags(form.category_id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    if (rootFlags.event_required && !form.event_id) {
      toast({ title: "Selecione o evento (obrigatório para esta categoria)", variant: "destructive" });
      return;
    }
    if (form.type === "income" && !form.account_id) {
      toast({ title: "Selecione a conta destino para receitas", variant: "destructive" });
      return;
    }

    // P&L Ativo validations
    if (isActivePL && form.event_id) {
      if (!form.category_id) {
        toast({ title: "Evento com P&L Ativo: selecione uma categoria existente no P&L", variant: "destructive" });
        return;
      }
      if (!allowedCategoryIds.includes(form.category_id)) {
        toast({ title: "Esta categoria não existe no P&L do evento", variant: "destructive" });
        return;
      }
      const budgetKey = `${form.type}_${form.category_id}`;
      const forecast = forecastBudgetByCategory[budgetKey] || 0;
      const used = usedBudgetByCategory[budgetKey] || 0;
      const newAmount = parseFloat(form.amount) || 0;
      const remaining = forecast - used;
      if (newAmount > remaining) {
        toast({
          title: "Saldo insuficiente no P&L",
          description: `Orçamento: ${forecast.toFixed(2)}€ | Utilizado: ${used.toFixed(2)}€ | Disponível: ${remaining.toFixed(2)}€`,
          variant: "destructive",
        });
        return;
      }
    }

    // Multi-day parent proration confirmation
    if (isParentMultiDay && !showProrationConfirm) {
      setShowProrationConfirm(true);
      return;
    }

    setShowProrationConfirm(false);
    createMutation.mutate(form);
  };

  // Filter categories - for active P&L, only show categories in the forecast
  const filteredCategories = categories.filter((c) => {
    const typeMatch = form.type === "income" ? c.type === "income" : c.type === "expense";
    if (!typeMatch) return false;
    if (isActivePL && form.event_id && allowedCategoryIds.length > 0) {
      return allowedCategoryIds.includes(c.id);
    }
    return true;
  });


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Nova Transação</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            {(["income", "expense"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, type: t, category_id: "", supplier_id: "" })}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  form.type === t
                    ? t === "income" ? "bg-success/20 text-success ring-1 ring-success/40" : "bg-warning/20 text-warning ring-1 ring-warning/40"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {t === "income" ? "Receita" : "Despesa"}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição *</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Ex: Venda de bilhetes" />
          </div>

          {form.type === "expense" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Especificação</label>
              <input value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Ex: Detalhes adicionais da despesa" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor c/IVA (€) *</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="0.00" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Taxa IVA</label>
              <select value={form.iva_rate} onChange={(e) => setForm({ ...form, iva_rate: Number(e.target.value) as IvaRate })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value={23}>23% - Normal</option>
                <option value={13}>13% - Intermédia</option>
                <option value={6}>6% - Reduzida</option>
                <option value={0}>0% - Isento</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Evento {rootFlags.event_required ? "*" : ""}
                {isActivePL && <span className="ml-1 text-success">(P&L Ativo)</span>}
              </label>
              <select value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value, category_id: "" })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">{rootFlags.event_required ? "Selecionar…" : "Sem evento"}</option>
                {events.map((ev: any) => <option key={ev.id} value={ev.id}>{ev.name} {ev.pl_mode === "active" ? "🔒" : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Categoria {isActivePL ? "*" : ""}
              </label>
              <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">{isActivePL ? "Selecionar do P&L…" : "Sem categoria"}</option>
                {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Budget indicator for active P&L */}
          {isActivePL && form.category_id && form.event_id && (() => {
            const budgetKey = `${form.type}_${form.category_id}`;
            const forecast = forecastBudgetByCategory[budgetKey] || 0;
            const used = usedBudgetByCategory[budgetKey] || 0;
            const remaining = forecast - used;
            const pct = forecast > 0 ? (used / forecast) * 100 : 0;
            return (
              <div className="rounded-lg border border-border/50 bg-secondary/30 p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Orçamento P&L</span>
                  <span className="font-mono font-medium">{pct.toFixed(0)}% utilizado</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-success"}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>Previsto: {forecast.toFixed(2)}€</span>
                  <span>Utilizado: {used.toFixed(2)}€</span>
                  <span className={remaining < 0 ? "text-destructive" : "text-success"}>Disponível: {remaining.toFixed(2)}€</span>
                </div>
              </div>
            );
          })()}

          {form.type === "income" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Conta Destino *</label>
              <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">Selecionar conta…</option>
                {financialAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          {form.type === "expense" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Fornecedor</label>
              <div className="flex gap-2">
                <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">Sem fornecedor</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewSupplier(true)}
                  className="rounded-lg border border-border bg-background p-2 hover:bg-secondary transition-colors"
                  title="Cadastrar novo fornecedor"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <SupplierFormModal
                open={showNewSupplier}
                onOpenChange={setShowNewSupplier}
                onCreated={(id) => setForm((prev) => ({ ...prev, supplier_id: id }))}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Vcto</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            {form.type === "expense" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Vencimento</label>
                <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            )}
          </div>

          <button type="submit" disabled={createMutation.isPending}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
            {createMutation.isPending ? "A guardar…" : "Criar Transação"}
          </button>
        </form>
      </div>
    </div>
  );
}
