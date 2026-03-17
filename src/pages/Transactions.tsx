import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, calcIvaAmount } from "@/lib/mock-data";
import type { IvaRate } from "@/lib/mock-data";
import { Plus, X, CreditCard, Pencil, ShieldCheck, History } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { TransactionEditModal } from "@/components/TransactionEditModal";
import { TransactionPaymentModal } from "@/components/TransactionPaymentModal";
import { TransactionAuditModal } from "@/components/TransactionAuditModal";

export default function Transactions() {
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPaymentId, setShowPaymentId] = useState<string | null>(null);
  const [showAuditId, setShowAuditId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin, user } = useAuth();

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

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      // Log the status change
      await supabase.from("transaction_audit_log").insert({
        transaction_id: id,
        changed_by: user?.email ?? "sistema",
        field_name: "status",
        old_value: "pending",
        new_value: "approved",
      });
      const { error } = await supabase
        .from("transactions")
        .update({ status: "approved" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Transação aprovada!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao aprovar", description: err.message, variant: "destructive" });
    },
  });

  const filtered = filter === "all" ? transactions : transactions.filter((t) => t.type === filter);

  const editingTransaction = transactions.find((t) => t.id === editingId);
  const paymentTransaction = transactions.find((t) => t.id === showPaymentId);

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

      {showForm && (
        <TransactionFormModal onClose={() => setShowForm(false)} />
      )}

      {editingTransaction && (
        <TransactionEditModal
          transaction={editingTransaction}
          onClose={() => setEditingId(null)}
        />
      )}

      {paymentTransaction && (
        <TransactionPaymentModal
          transaction={paymentTransaction}
          onClose={() => setShowPaymentId(null)}
        />
      )}

      {showAuditId && (
        <TransactionAuditModal
          transactionId={showAuditId}
          onClose={() => setShowAuditId(null)}
        />
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
          <p className="py-8 text-center text-muted-foreground">Sem transações registadas.</p>
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
                  const isApproved = t.status === "approved";

                  return (
                    <tr key={t.id} className={`hover:bg-secondary/20 transition-colors ${isApproved ? "opacity-80" : ""}`}>
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
                          isApproved
                            ? "bg-blue-500/15 text-blue-400"
                            : t.status === "paid"
                            ? "bg-success/15 text-success"
                            : t.status === "pending"
                            ? "bg-warning/15 text-warning"
                            : "bg-destructive/15 text-destructive"
                        }`}>
                          {isApproved ? "Aprovado" : t.status === "paid" ? "Pago" : t.status === "pending" ? "Pendente" : "Atrasado"}
                        </span>
                        {isExpense && balance > 0 && !isApproved && t.status !== "paid" && (
                          <p className="mt-0.5 text-[10px] text-warning">Aberto: {formatCurrency(balance)}</p>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="py-3 text-right font-mono text-muted-foreground whitespace-nowrap">
                        {formatCurrency(paidAmount)}
                      </td>
                      <td className={`py-3 text-right font-mono font-semibold whitespace-nowrap ${isExpense ? "text-warning" : "text-success"}`}>
                        {isExpense ? "-" : "+"}{formatCurrency(amount)}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-center gap-1">
                          {/* Edit */}
                          {!isApproved && (
                            <button
                              onClick={() => setEditingId(t.id)}
                              className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {/* Approve */}
                          {!isApproved && t.status !== "paid" && (
                            <button
                              onClick={() => {
                                if (confirm("Aprovar esta transação? Após aprovação, o valor não pode ser alterado.")) {
                                  approveMutation.mutate(t.id);
                                }
                              }}
                              className="rounded-lg p-1.5 text-blue-400 hover:bg-blue-500/15 transition-colors"
                              title="Aprovar"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {/* Partial payment */}
                          {isExpense && balance > 0 && !isApproved && t.status !== "paid" && (
                            <button
                              onClick={() => setShowPaymentId(t.id)}
                              className="rounded-lg p-1.5 text-success hover:bg-success/15 transition-colors"
                              title="Registar pagamento"
                            >
                              <CreditCard className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {/* Audit log */}
                          <button
                            onClick={() => setShowAuditId(t.id)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                            title="Histórico de alterações"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                        </div>
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
