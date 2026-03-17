import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatCurrencyDecimal, formatDate, calcIvaAmount } from "@/lib/mock-data";
import type { IvaRate } from "@/lib/mock-data";
import { Plus, X, CreditCard } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface TransactionForm {
  description: string;
  type: "income" | "expense";
  amount: string;
  iva_rate: IvaRate;
  event_id: string;
  category_id: string;
  supplier_id: string;
  date: string;
  status: "pending" | "paid" | "overdue";
}

const emptyForm: TransactionForm = {
  description: "",
  type: "income",
  amount: "",
  iva_rate: 23,
  event_id: "",
  category_id: "",
  supplier_id: "",
  date: new Date().toISOString().split("T")[0],
  status: "pending",
};

export default function Transactions() {
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [showForm, setShowForm] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [form, setForm] = useState<TransactionForm>(emptyForm);
  const queryClient = useQueryClient();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, events(name), account_categories(name), suppliers(name)")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["account_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("id, name, type").eq("is_active", true).order("code");
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

  const createMutation = useMutation({
    mutationFn: async (data: TransactionForm) => {
      const { error } = await supabase.from("transactions").insert({
        description: data.description,
        type: data.type,
        amount: parseFloat(data.amount),
        iva_rate: data.iva_rate,
        event_id: data.event_id,
        category_id: data.category_id || null,
        supplier_id: data.supplier_id || null,
        date: data.date,
        status: data.status,
        paid_amount: data.status === "paid" ? parseFloat(data.amount) : 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setShowForm(false);
      setForm(emptyForm);
      toast({ title: "Transação criada com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar transação", description: err.message, variant: "destructive" });
    },
  });

  const paymentMutation = useMutation({
    mutationFn: async ({ id, newPaidAmount, totalAmount }: { id: string; newPaidAmount: number; totalAmount: number }) => {
      const newStatus = newPaidAmount >= totalAmount ? "paid" : "pending";
      const { error } = await supabase
        .from("transactions")
        .update({ paid_amount: newPaidAmount, status: newStatus })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setShowPaymentModal(null);
      setPaymentAmount("");
      toast({ title: "Pagamento registado com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao registar pagamento", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount || !form.event_id) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    createMutation.mutate(form);
  };

  const handlePayment = (transaction: any) => {
    const amount = Number(transaction.amount);
    const currentPaid = Number(transaction.paid_amount ?? 0);
    const addAmount = parseFloat(paymentAmount);
    if (!addAmount || addAmount <= 0) {
      toast({ title: "Insira um valor válido", variant: "destructive" });
      return;
    }
    const newPaid = currentPaid + addAmount;
    if (newPaid > amount) {
      toast({ title: "O valor excede o saldo em aberto", variant: "destructive" });
      return;
    }
    paymentMutation.mutate({ id: transaction.id, newPaidAmount: newPaid, totalAmount: amount });
  };

  const filtered = filter === "all" ? transactions : transactions.filter((t) => t.type === filter);

  const filteredCategories = categories.filter((c) =>
    form.type === "income" ? c.type === "income" : c.type === "expense"
  );

  const paymentTransaction = transactions.find((t) => t.id === showPaymentModal);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Transações</h1>
          <p className="text-sm text-muted-foreground">Todas as movimentações financeiras</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova Transação</span>
        </button>
      </div>

      {/* Creation Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowForm(false)}>
          <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Nova Transação</h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1 hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type toggle */}
              <div className="flex gap-2">
                {(["income", "expense"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, type: t, category_id: "", supplier_id: "" })}
                    className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                      form.type === t
                        ? t === "income"
                          ? "bg-success/20 text-success ring-1 ring-success/40"
                          : "bg-warning/20 text-warning ring-1 ring-warning/40"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {t === "income" ? "Receita" : "Despesa"}
                  </button>
                ))}
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição *</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Ex: Venda de bilhetes"
                />
              </div>

              {/* Amount + IVA */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor c/IVA (€) *</label>
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
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Taxa IVA</label>
                  <select
                    value={form.iva_rate}
                    onChange={(e) => setForm({ ...form, iva_rate: Number(e.target.value) as IvaRate })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value={23}>23% - Normal</option>
                    <option value={13}>13% - Intermédia</option>
                    <option value={6}>6% - Reduzida</option>
                    <option value={0}>0% - Isento</option>
                  </select>
                </div>
              </div>

              {/* Event + Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Evento *</label>
                  <select
                    value={form.event_id}
                    onChange={(e) => setForm({ ...form, event_id: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">Selecionar…</option>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>{ev.name}</option>
                    ))}
                  </select>
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
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Supplier (only for expenses) */}
              {form.type === "expense" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Fornecedor</label>
                  <select
                    value={form.supplier_id}
                    onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">Sem fornecedor</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Data</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Estado</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="pending">Pendente</option>
                    <option value="paid">Pago</option>
                    <option value="overdue">Atrasado</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                {createMutation.isPending ? "A guardar…" : "Criar Transação"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Partial Payment Modal */}
      {showPaymentModal && paymentTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { setShowPaymentModal(null); setPaymentAmount(""); }}>
          <div className="glass w-full max-w-sm rounded-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Registar Pagamento</h2>
              <button onClick={() => { setShowPaymentModal(null); setPaymentAmount(""); }} className="rounded-lg p-1 hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">{paymentTransaction.description}</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor total:</span>
                <span className="font-semibold">{formatCurrency(Number(paymentTransaction.amount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Já pago:</span>
                <span className="font-semibold text-success">{formatCurrency(Number(paymentTransaction.paid_amount ?? 0))}</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-2">
                <span className="text-muted-foreground">Saldo em aberto:</span>
                <span className="font-bold text-warning">
                  {formatCurrency(Number(paymentTransaction.amount) - Number(paymentTransaction.paid_amount ?? 0))}
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor a pagar (€)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={Number(paymentTransaction.amount) - Number(paymentTransaction.paid_amount ?? 0)}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="0.00"
              />
            </div>

            <button
              onClick={() => handlePayment(paymentTransaction)}
              disabled={paymentMutation.isPending}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              {paymentMutation.isPending ? "A processar…" : "Confirmar Pagamento"}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "income", "expense"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              filter === f ? "bg-primary text-primary-foreground glow-primary" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {f === "all" ? "Todas" : f === "income" ? "Receitas" : "Despesas"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass rounded-xl p-5">
        {isLoading ? (
          <p className="py-8 text-center text-muted-foreground">A carregar transações…</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Sem transações registadas. Clique em "Nova Transação" para começar.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 text-left font-medium">Descrição</th>
                  <th className="hidden pb-3 text-left font-medium sm:table-cell">Evento</th>
                  <th className="hidden pb-3 text-left font-medium md:table-cell">Fornecedor</th>
                  <th className="hidden pb-3 text-center font-medium lg:table-cell">IVA</th>
                  <th className="pb-3 text-left font-medium">Estado</th>
                  <th className="pb-3 text-left font-medium">Data</th>
                  <th className="pb-3 text-right font-medium">Pago</th>
                  <th className="pb-3 text-right font-medium">Valor c/IVA</th>
                  <th className="pb-3 text-center font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.map((t) => {
                  const eventName = (t.events as any)?.name ?? "—";
                  const supplierName = (t.suppliers as any)?.name ?? "—";
                  const ivaRate = (t.iva_rate ?? 23) as IvaRate;
                  const amount = Number(t.amount);
                  const paidAmount = Number((t as any).paid_amount ?? 0);
                  const balance = amount - paidAmount;
                  const isExpense = t.type === "expense";

                  return (
                    <tr key={t.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{t.description}</p>
                        <p className="text-xs text-muted-foreground sm:hidden">{eventName}</p>
                      </td>
                      <td className="hidden py-3 pr-4 text-muted-foreground sm:table-cell">{eventName}</td>
                      <td className="hidden py-3 pr-4 text-muted-foreground md:table-cell">{supplierName}</td>
                      <td className="hidden py-3 pr-4 text-center lg:table-cell">
                        <span className="inline-flex h-6 w-10 items-center justify-center rounded bg-primary/15 text-xs font-bold text-primary">{ivaRate}%</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          t.status === "paid" ? "bg-success/15 text-success" : t.status === "pending" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"
                        }`}>
                          {t.status === "paid" ? "Pago" : t.status === "pending" ? "Pendente" : "Atrasado"}
                        </span>
                        {isExpense && balance > 0 && t.status !== "paid" && (
                          <p className="mt-0.5 text-[10px] text-warning">
                            Aberto: {formatCurrency(balance)}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="py-3 text-right font-mono text-muted-foreground whitespace-nowrap">
                        {formatCurrency(paidAmount)}
                      </td>
                      <td className={`py-3 text-right font-mono font-semibold whitespace-nowrap ${isExpense ? "text-warning" : "text-success"}`}>
                        {isExpense ? "-" : "+"}{formatCurrency(amount)}
                      </td>
                      <td className="py-3 text-center">
                        {isExpense && balance > 0 && t.status !== "paid" && (
                          <button
                            onClick={() => setShowPaymentModal(t.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-success/15 px-2 py-1 text-xs font-medium text-success hover:bg-success/25 transition-colors"
                            title="Registar pagamento parcial"
                          >
                            <CreditCard className="h-3 w-3" />
                            Pagar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
