import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { IvaRate } from "@/lib/mock-data";
import { X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  transaction: any;
  onClose: () => void;
}

export function TransactionEditModal({ transaction, onClose }: Props) {
  const [form, setForm] = useState({
    description: transaction.description,
    amount: String(transaction.amount),
    iva_rate: transaction.iva_rate as IvaRate,
    event_id: transaction.event_id,
    category_id: transaction.category_id ?? "",
    supplier_id: transaction.supplier_id ?? "",
    date: transaction.date,
    due_date: transaction.due_date ?? "",
    status: transaction.status,
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

  const editMutation = useMutation({
    mutationFn: async () => {
      // Build audit log entries for changed fields
      const changes: { field_name: string; old_value: string; new_value: string }[] = [];
      const fieldLabels: Record<string, string> = {
        description: "Descrição",
        amount: "Valor",
        iva_rate: "Taxa IVA",
        event_id: "Evento",
        category_id: "Categoria",
        supplier_id: "Fornecedor",
        date: "Data",
        due_date: "Data Vencimento",
        status: "Estado",
      };

      for (const key of Object.keys(fieldLabels)) {
        const oldVal = String(transaction[key] ?? "");
        const newVal = String((form as any)[key] ?? "");
        if (oldVal !== newVal) {
          changes.push({
            field_name: fieldLabels[key],
            old_value: oldVal,
            new_value: newVal,
          });
        }
      }

      if (changes.length === 0) {
        throw new Error("Nenhuma alteração detectada.");
      }

      // Insert audit log entries
      const { error: logError } = await supabase.from("transaction_audit_log").insert(
        changes.map((c) => ({
          transaction_id: transaction.id,
          changed_by: user?.email ?? "sistema",
          field_name: c.field_name,
          old_value: c.old_value,
          new_value: c.new_value,
        }))
      );
      if (logError) throw logError;

      // Update the transaction
      const { error } = await supabase
        .from("transactions")
        .update({
          description: form.description,
          amount: parseFloat(form.amount),
          iva_rate: form.iva_rate,
          event_id: form.event_id,
          category_id: form.category_id || null,
          supplier_id: form.supplier_id || null,
          date: form.date,
          due_date: form.due_date || null,
          status: form.status,
        })
        .eq("id", transaction.id);
      if (error) throw error;
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount || !form.event_id) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    editMutation.mutate();
  };

  const filteredCategories = categories.filter((c) =>
    transaction.type === "income" ? c.type === "income" : c.type === "expense"
  );

  const isExpense = transaction.type === "expense";

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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor c/IVA (€) *</label>
              <input type="number" step="0.01" min="0" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Evento *</label>
              <select value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">Selecionar…</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Categoria</label>
              <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">Sem categoria</option>
                {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {isExpense && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Fornecedor</label>
              <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">Sem fornecedor</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
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
            {!isExpense && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Estado</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="pending">Pendente</option>
                  <option value="paid">Pago</option>
                </select>
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
