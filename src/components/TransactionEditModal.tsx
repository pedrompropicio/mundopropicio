import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { IvaRate } from "@/lib/mock-data";
import { X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { sortByHierarchicalCode } from "@/lib/utils";

interface Props {
  transaction: any;
  onClose: () => void;
  isAdmin: boolean;
}

export function TransactionEditModal({ transaction, onClose, isAdmin }: Props) {
  const isPaid = transaction.status === "paid";
  const [form, setForm] = useState({
    description: transaction.description,
    amount: String(transaction.amount),
    iva_rate: transaction.iva_rate as IvaRate,
    event_id: transaction.event_id,
    category_id: transaction.category_id ?? "",
    supplier_id: transaction.supplier_id ?? "",
    account_id: transaction.account_id ?? "",
    date: transaction.date,
    due_date: transaction.due_date ?? "",
    specification: transaction.specification ?? "",
  });
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Check if this is a parent split transaction (has children)
  const { data: childTransactions = [] } = useQuery({
    queryKey: ["child-transactions", transaction.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id")
        .eq("parent_transaction_id", transaction.id);
      if (error) throw error;
      return data;
    },
  });
  const hasChildren = childTransactions.length > 0;

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
      const { data, error } = await supabase.from("account_categories").select("id, name, code, type, parent_id, event_required").eq("is_active", true);
      if (error) throw error;
      return sortByHierarchicalCode(data ?? [], (category) => category.code);
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

  const editMutation = useMutation({
    mutationFn: async () => {
      const changes: { field_name: string; old_value: string; new_value: string }[] = [];
      const fieldLabels: Record<string, string> = {
        description: "Descrição", amount: "Valor", iva_rate: "Taxa IVA",
        event_id: "Evento", category_id: "Categoria", supplier_id: "Fornecedor",
        account_id: "Conta", specification: "Especificação", date: "Data", due_date: "Data Vencimento",
      };
      const allowedFields = isPaid ? ["specification", "supplier_id"] : Object.keys(fieldLabels);
      for (const key of allowedFields) {
        const oldVal = String(transaction[key] ?? "");
        const newVal = String((form as any)[key] ?? "");
        if (oldVal !== newVal) {
          changes.push({ field_name: fieldLabels[key], old_value: oldVal, new_value: newVal });
        }
      }
      if (changes.length === 0) throw new Error("Nenhuma alteração detectada.");

      const updates = isPaid ? {
        supplier_id: form.supplier_id || null,
        specification: transaction.type === "expense" ? (form.specification || null) : null,
      } : {
        description: form.description,
        amount: parseFloat(form.amount),
        iva_rate: form.iva_rate,
        event_id: form.event_id,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        account_id: form.account_id || null,
        specification: transaction.type === "expense" ? (form.specification || null) : null,
        date: form.date,
        due_date: form.due_date || null,
      };

      const { data, error } = await supabase.functions.invoke("update-transaction", {
        body: { transaction_id: transaction.id, updates, changes },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onClose();
      toast({ title: "Transação atualizada com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    },
  });

  // Check if transaction is linked to a BP forecast
  const { data: linkedForecast } = useQuery({
    queryKey: ["linked-forecast", transaction.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id")
        .eq("transaction_id", transaction.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const isBpLinked = !!linkedForecast;

  const isExpense = transaction.type === "expense";
  const isApproved = transaction.status === "approved";
  const valueLocked = isApproved && !isAdmin && !isBpLinked;
  const isParentSplit = !transaction.parent_transaction_id && transaction.split_percentage === null;

  const getRootFlags = (categoryId: string) => {
    if (!categoryId) return { event_required: false };
    let cat = categories.find((c: any) => c.id === categoryId);
    while (cat && cat.parent_id) {
      cat = categories.find((c: any) => c.id === cat!.parent_id);
    }
    return { event_required: cat?.event_required ?? true };
  };

  const rootFlags = getRootFlags(form.category_id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    // Only require event if the category demands it AND the transaction originally had an event
    // (general/administrative transactions without event should remain editable without forcing event selection)
    const originallyHadEvent = !!transaction.event_id && transaction.event_id !== "";
    if (rootFlags.event_required && !form.event_id && !hasChildren && originallyHadEvent) {
      toast({ title: "Selecione o evento (obrigatório para esta categoria)", variant: "destructive" });
      return;
    }
    if (!isExpense && !form.account_id) {
      toast({ title: "Selecione a conta destino para receitas", variant: "destructive" });
      return;
    }
    editMutation.mutate();
  };

  const filteredCategories = categories.filter((c) => {
    const typeMatch = transaction.type === "income" ? c.type === "income" : c.type === "expense";
    if (!typeMatch) return false;
    // Only leaf categories (no children)
    return !categories.some((ch) => ch.parent_id === c.id);
  });

  const eventOptions = events.map((ev) => ({ value: ev.id, label: ev.name }));
  const categoryOptions = filteredCategories.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }));
  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name }));
  const accountOptions = financialAccounts.map((a: any) => ({ value: a.id, label: a.name }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{isPaid ? "Editar (Liquidada)" : "Editar Transação"}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        <div className={`rounded-lg px-3 py-1.5 text-xs font-medium inline-flex ${
          isExpense ? "bg-warning/20 text-warning" : "bg-success/20 text-success"
        }`}>
          {isExpense ? "Despesa" : "Receita"}
        </div>

        {isPaid && (
          <div className="rounded-lg bg-success/10 border border-success/20 px-3 py-2 text-xs text-success">
            Transação liquidada — apenas Especificação e Fornecedor podem ser alterados.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição *</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              disabled={isPaid}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed" />
          </div>

          {isExpense && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Especificação</label>
              <input value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Detalhes adicionais da despesa" />
            </div>
          )}

          {!isPaid && valueLocked && (
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-xs text-blue-400">
              Transação aprovada — valor e IVA não podem ser alterados.
            </div>
          )}
          {!isPaid && isApproved && !isAdmin && isBpLinked && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-400">
              Transação vinculada ao BP — valor editável até à liquidação.
            </div>
          )}

          {!isPaid && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor Base (€) *</label>
                <input type="number" step="0.01" min="0" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  disabled={valueLocked}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Taxa IVA</label>
                <select value={form.iva_rate} onChange={(e) => setForm({ ...form, iva_rate: Number(e.target.value) as IvaRate })}
                  disabled={valueLocked}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed">
                  <option value={23}>23% - Normal</option>
                  <option value={13}>13% - Intermédia</option>
                  <option value={6}>6% - Reduzida</option>
                  <option value={0}>0% - Isento</option>
                </select>
              </div>
            </div>
            {(() => {
              const base = parseFloat(form.amount) || 0;
              const iva = base * (form.iva_rate / 100);
              const total = base + iva;
              if (base <= 0) return null;
              return (
                <div className="rounded-lg border border-border/50 bg-secondary/30 px-3 py-2 flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">Base: {base.toFixed(2)}€</span>
                  <span className="text-muted-foreground">+ IVA ({form.iva_rate}%): {iva.toFixed(2)}€</span>
                  <span className="font-semibold text-foreground">Total: {total.toFixed(2)}€</span>
                </div>
              );
            })()}
          </div>
          )}

          {!isPaid && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Categoria</label>
              <SearchableSelect
                options={categoryOptions}
                value={form.category_id}
                onValueChange={(v) => setForm({ ...form, category_id: v, event_id: "", supplier_id: "" })}
                placeholder="Sem categoria"
                searchPlaceholder="Pesquisar categoria…"
              />
            </div>
            {hasChildren ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Evento</label>
                <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-muted-foreground">
                  Multi-evento ({childTransactions.length} sub-transações)
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Evento {rootFlags.event_required ? "*" : ""}</label>
                <SearchableSelect
                  options={eventOptions}
                  value={form.event_id}
                  onValueChange={(v) => setForm({ ...form, event_id: v })}
                  placeholder={rootFlags.event_required ? "Selecionar…" : "Sem evento"}
                  searchPlaceholder="Pesquisar evento…"
                />
              </div>
            )}
          </div>
          )}

          {isExpense && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Fornecedor</label>
              <SearchableSelect
                options={supplierOptions}
                value={form.supplier_id}
                onValueChange={(v) => setForm({ ...form, supplier_id: v })}
                placeholder="Sem fornecedor"
                searchPlaceholder="Pesquisar fornecedor…"
              />
            </div>
          )}

          {!isPaid && !isExpense && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Conta Destino *</label>
              <SearchableSelect
                options={accountOptions}
                value={form.account_id}
                onValueChange={(v) => setForm({ ...form, account_id: v })}
                placeholder="Selecionar conta…"
                searchPlaceholder="Pesquisar conta…"
              />
            </div>
          )}

          {!isPaid && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Data</label>
              <DatePicker value={form.date} onChange={(d) => setForm({ ...form, date: d })} />
            </div>
            {isExpense && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Vencimento</label>
                <DatePicker value={form.due_date} onChange={(d) => setForm({ ...form, due_date: d })} />
              </div>
            )}
          </div>
          )}

          <button type="submit" disabled={editMutation.isPending}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
            {editMutation.isPending ? "A guardar…" : "Guardar Alterações"}
          </button>
        </form>
      </div>
    </div>
  );
}
