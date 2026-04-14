import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { IvaRate } from "@/lib/mock-data";
import { X, Building, FileText, Landmark, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { DatePicker } from "@/components/ui/date-picker";
import { sortByHierarchicalCode, cn } from "@/lib/utils";

type PaymentMethod = "transfer" | "service_payment" | "state_payment";

interface Props {
  transaction: any;
  onClose: () => void;
  isAdmin: boolean;
}

export function TransactionEditModal({ transaction, onClose, isAdmin }: Props) {
  const isPaid = transaction.status === "paid";

  // Lock body scroll while modal is open to preserve scroll position
  useEffect(() => {
    const originalOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = originalOverflow;
    };
  }, []);
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
    is_transitory: transaction.is_transitory ?? false,
    exclude_from_result: transaction.exclude_from_result ?? false,
    invoice_ref: transaction.invoice_ref ?? "",
    payment_method: (transaction.payment_method ?? "transfer") as PaymentMethod,
    payment_entity: transaction.payment_entity ?? "",
    payment_reference: transaction.payment_reference ?? "",
  });
  const queryClient = useQueryClient();
  const { user, isManager } = useAuth();

  // Check if this is a parent split transaction (has children)
  const isAbsoluteMode = (transaction.split_mode ?? "percentage") === "absolute";
  const { data: childTransactions = [] } = useQuery({
    queryKey: ["child-transactions-full", transaction.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, split_percentage, split_amount, amount, event_id, events(name)")
        .eq("parent_transaction_id", transaction.id);
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id,
        split_percentage: c.split_percentage,
        split_amount: c.split_amount,
        amount: Number(c.amount),
        event_id: c.event_id,
        event_name: c.events?.name ?? "—",
      }));
    },
  });
  const hasChildren = childTransactions.length > 0;

  // Editable child amounts for absolute mode adjustment
  const [childAdjustments, setChildAdjustments] = useState<Record<string, number>>({});

  // Initialize child adjustments when children load
  useEffect(() => {
    if (hasChildren && Object.keys(childAdjustments).length === 0) {
      const initial: Record<string, number> = {};
      childTransactions.forEach((c: any) => {
        initial[c.id] = c.amount;
      });
      setChildAdjustments(initial);
    }
  }, [hasChildren, childTransactions.length]);

  const newParentAmount = parseFloat(form.amount) || 0;
  const amountChanged = hasChildren && newParentAmount !== Number(transaction.amount);
  
  const childAdjustmentTotal = useMemo(() => {
    return Object.values(childAdjustments).reduce((s, v) => s + v, 0);
  }, [childAdjustments]);
  
  const childMismatch = hasChildren && amountChanged && Math.abs(childAdjustmentTotal - newParentAmount) > 0.01;

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
        is_transitory: "Transitória",
        exclude_from_result: "Fora do Resultado",
        invoice_ref: "Nº Fatura",
        payment_method: "Método Pagamento",
        payment_entity: "Entidade Pagamento",
        payment_reference: "Referência Pagamento",
      };
      const allowedFields = isPaid
        ? ["specification", "supplier_id", "is_transitory", "exclude_from_result", "invoice_ref", "payment_method", "payment_entity", "payment_reference"]
        : Object.keys(fieldLabels);
      for (const key of allowedFields) {
        const oldVal = String(transaction[key] ?? "");
        const newVal = String((form as any)[key] ?? "");
        if (oldVal !== newVal) {
          changes.push({ field_name: fieldLabels[key], old_value: oldVal, new_value: newVal });
        }
      }
      if (changes.length === 0) throw new Error("Nenhuma alteração detectada.");

      const paymentFields = {
        payment_method: form.payment_method,
        payment_entity: form.payment_method === "service_payment" ? (form.payment_entity.trim() || null) : null,
        payment_reference: form.payment_method !== "transfer" ? (form.payment_reference.trim() || null) : null,
      };

      const updates = isPaid ? {
        supplier_id: form.supplier_id || null,
        specification: transaction.type === "expense" ? (form.specification || null) : null,
        is_transitory: form.is_transitory,
        exclude_from_result: form.exclude_from_result,
        invoice_ref: form.invoice_ref.trim() || null,
        ...paymentFields,
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
        is_transitory: form.is_transitory,
        exclude_from_result: form.exclude_from_result,
        invoice_ref: form.invoice_ref.trim() || null,
        ...paymentFields,
      };

      // Send child adjustments if amount changed on a parent split
      const childUpdatesPayload = (amountChanged && hasChildren)
        ? Object.entries(childAdjustments).map(([id, amt]) => ({ id, amount: amt }))
        : undefined;

      const { data, error } = await supabase.functions.invoke("update-transaction", {
        body: { transaction_id: transaction.id, updates, changes, child_adjustments: childUpdatesPayload },
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
  const valueLocked = isPaid;
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
    if (childMismatch) {
      toast({ title: "A soma dos splits deve igualar o valor total", variant: "destructive" });
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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
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
            Transação liquidada — Especificação, Fornecedor, Nº Fatura e Método de Pagamento podem ser alterados.
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

          {/* Split adjustment panel when parent amount changes */}
          {hasChildren && !isPaid && (
            <div className={`rounded-lg border p-3 space-y-2 ${amountChanged ? "border-warning/50 bg-warning/5" : "border-border/50 bg-secondary/20"}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  {amountChanged && <AlertTriangle className="h-3 w-3 text-warning" />}
                  Distribuição pelos Splits ({childTransactions.length})
                </p>
                {amountChanged && (
                  <button
                    type="button"
                    onClick={() => {
                      const pct = +(100 / childTransactions.length).toFixed(2);
                      const adj: Record<string, number> = {};
                      childTransactions.forEach((c: any, i: number) => {
                        const isLast = i === childTransactions.length - 1;
                        const val = isLast
                          ? +(newParentAmount - Object.values(adj).reduce((s, v) => s + v, 0)).toFixed(2)
                          : +(newParentAmount * pct / 100).toFixed(2);
                        adj[c.id] = val;
                      });
                      setChildAdjustments(adj);
                    }}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Dividir igualmente
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {childTransactions.map((child: any) => {
                  const adjVal = childAdjustments[child.id] ?? child.amount;
                  const pctOfNew = newParentAmount > 0 ? (adjVal / newParentAmount * 100).toFixed(1) : "—";
                  return (
                    <div key={child.id} className="flex items-center gap-2">
                      <span className="flex-1 truncate text-xs">{child.event_name}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={adjVal || ""}
                        onChange={(e) => setChildAdjustments(prev => ({
                          ...prev,
                          [child.id]: parseFloat(e.target.value) || 0,
                        }))}
                        disabled={!amountChanged}
                        className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-60"
                      />
                      <span className="text-[10px] text-muted-foreground w-10 text-right">{pctOfNew}%</span>
                    </div>
                  );
                })}
              </div>
              {amountChanged && (
                <div className="flex items-center justify-between border-t border-border/30 pt-1.5">
                  <span className="text-[10px] text-muted-foreground">Total splits</span>
                  <span className={`text-xs font-mono font-semibold ${childMismatch ? "text-destructive" : "text-success"}`}>
                    {childAdjustmentTotal.toFixed(2)}€
                    {childMismatch && ` (esperado: ${newParentAmount.toFixed(2)}€)`}
                  </span>
                </div>
              )}
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
                  Master ({childTransactions.length} transações split)
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

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nº Fatura</label>
            <input value={form.invoice_ref} onChange={(e) => setForm({ ...form, invoice_ref: e.target.value })}
              placeholder="Ex: FT 002/5944"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            <p className="mt-0.5 text-[10px] text-muted-foreground">Transações com o mesmo nº serão agrupadas</p>
          </div>

          {/* Método de Pagamento — editável a qualquer tempo */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Método de Pagamento</label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { value: "transfer" as const, label: "Transferência", icon: Building },
                { value: "service_payment" as const, label: "Pag. Serviços", icon: FileText },
                { value: "state_payment" as const, label: "Pag. Estado", icon: Landmark },
              ]).map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setForm({ ...form, payment_method: m.value, ...(m.value === "transfer" ? { payment_entity: "", payment_reference: "" } : m.value === "state_payment" ? { payment_entity: "" } : {}) })}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-all",
                    form.payment_method === m.value
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border bg-background text-muted-foreground hover:bg-secondary"
                  )}
                >
                  <m.icon className="h-4 w-4" />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {form.payment_method === "service_payment" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Entidade</label>
                <input type="text" value={form.payment_entity}
                  onChange={(e) => setForm({ ...form, payment_entity: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Ex: 10611" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Referência</label>
                <input type="text" value={form.payment_reference}
                  onChange={(e) => setForm({ ...form, payment_reference: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Referência MB" />
              </div>
            </div>
          )}

          {form.payment_method === "state_payment" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Referência de Pagamento</label>
              <input type="text" value={form.payment_reference}
                onChange={(e) => setForm({ ...form, payment_reference: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Referência AT / SS" />
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

          {/* Transitory toggle — only admin/manager can change */}
          {(isAdmin || isManager) && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3">
            <Switch
              checked={form.is_transitory}
              onCheckedChange={(v) => setForm({ ...form, is_transitory: v, ...(v ? { exclude_from_result: false } : {}) })}
            />
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">🔄 Transitória</span>
              <HelpTooltip text={helpTexts.transitoryTransaction} size={13} />
            </div>
            <span className="ml-auto text-xs text-muted-foreground">Sem impacto no resultado</span>
          </div>
          )}

          {/* Exclude from result toggle — only admin/manager, mutually exclusive with transitory */}
          {(isAdmin || isManager) && !form.is_transitory && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3">
            <Switch
              checked={form.exclude_from_result}
              onCheckedChange={(v) => setForm({ ...form, exclude_from_result: v })}
            />
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">📋 Fora do Resultado</span>
              <HelpTooltip text={helpTexts.excludeFromResultToggle} size={13} />
            </div>
            <span className="ml-auto text-xs text-muted-foreground">Apenas para registo</span>
          </div>
          )}

          <button type="submit" disabled={editMutation.isPending}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
            {editMutation.isPending ? "A guardar…" : "Guardar Alterações"}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
