import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { IvaRate } from "@/lib/mock-data";
import { X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { sortByHierarchicalCode } from "@/lib/utils";

interface Props {
  transaction: any;
  onClose: () => void;
  isAdmin: boolean;
}

export function TransactionEditModal({ transaction, onClose, isAdmin }: Props) {
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
      for (const key of Object.keys(fieldLabels)) {
        const oldVal = String(transaction[key] ?? "");
        const newVal = String((form as any)[key] ?? "");
        if (oldVal !== newVal) {
          changes.push({ field_name: fieldLabels[key], old_value: oldVal, new_value: newVal });
        }
      }
      if (changes.length === 0) throw new Error("Nenhuma alteração detectada.");

      const updates = {
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

  const isExpense = transaction.type === "expense";
  const isApproved = transaction.status === "approved";
  const valueLocked = isApproved && !isAdmin;

  const getRootFlags = (categoryId: string) => {
    if (!categoryId) return { event_required: true };
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
    if (rootFlags.event_required && !form.event_id) {
      toast({ title: "Selecione o evento (obrigatório para esta categoria)", variant: "destructive" });
      return;
    }
    if (!isExpense && !form.account_id) {
      toast({ title: "Selecione a conta destino para receitas", variant: "destructive" });
      return;
    }
    editMutation.mutate();
  };

  const filteredCategories = categories.filter((c) =>
    transaction.type === "income" ? c.type === "income" : c.type === "expense"
  );

  const eventOptions = events.map((ev) => ({ value: ev.id, label: ev.name }));
  const categoryOptions = filteredCategories.map((c) => ({ value: c.id, label: c.name }));
  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name }));
  const accountOptions = financialAccounts.map((a: any) => ({ value: a.id, label: a.name }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Editar Transação</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        <div className={`rounded-lg px-3 py-1.5 text-xs font-medium inline-flex ${
          isExpense ? "bg-warning/20 text-warning" : "bg-success/20 text-success"
        }`}>
          {isExpense ? "Despesa" : "Receita"}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição *</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          {isExpense && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Especificação</label>
              <input value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Detalhes adicionais da despesa" />
            </div>
          )}

          {valueLocked && (
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-xs text-blue-400">
              Transação aprovada — valor e IVA não podem ser alterados.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor c/IVA (€) *</label>
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
          </div>

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

          {!isExpense && (
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Data</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            {isExpense && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Vencimento</label>
                <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            )}
          </div>

          <button type="submit" disabled={editMutation.isPending}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
            {editMutation.isPending ? "A guardar…" : "Guardar Alterações"}
          </button>
        </form>
      </div>
    </div>
  );
}
