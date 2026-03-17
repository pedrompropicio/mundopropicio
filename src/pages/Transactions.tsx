import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, calcIvaAmount } from "@/lib/mock-data";
import type { IvaRate } from "@/lib/mock-data";
import { Plus, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { TransactionEditModal } from "@/components/TransactionEditModal";
import { TransactionPaymentModal } from "@/components/TransactionPaymentModal";
import { TransactionAuditModal } from "@/components/TransactionAuditModal";
import { TransactionDocumentsModal } from "@/components/TransactionDocumentsModal";
import { TransactionRow } from "@/components/TransactionRow";

export default function Transactions() {
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPaymentId, setShowPaymentId] = useState<string | null>(null);
  const [showAuditId, setShowAuditId] = useState<string | null>(null);
  const [showDocsId, setShowDocsId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Insert audit log entries for all
      const auditEntries = ids.map((id) => ({
        transaction_id: id,
        changed_by: user?.email ?? "sistema",
        field_name: "status",
        old_value: "pending",
        new_value: "approved",
      }));
      const { error: logError } = await supabase
        .from("transaction_audit_log")
        .insert(auditEntries);
      if (logError) throw logError;

      // Update all transactions
      const { error } = await supabase
        .from("transactions")
        .update({ status: "approved" })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setSelectedIds(new Set());
      toast({ title: `${ids.length} transação(ões) aprovada(s)!` });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao aprovar em lote", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Transação eliminada!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao eliminar", description: err.message, variant: "destructive" });
    },
  });

  const filtered = filter === "all" ? transactions : transactions.filter((t) => t.type === filter);

  // Pending transactions in current filtered view
  const pendingInView = filtered.filter((t) => t.status === "pending");
  const selectedPendingCount = [...selectedIds].filter((id) =>
    pendingInView.some((t) => t.id === id)
  ).length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPendingCount === pendingInView.length && pendingInView.length > 0) {
      // Deselect all pending
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pendingInView.forEach((t) => next.delete(t.id));
        return next;
      });
    } else {
      // Select all pending
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pendingInView.forEach((t) => next.add(t.id));
        return next;
      });
    }
  };

  const handleBulkApprove = () => {
    const ids = [...selectedIds].filter((id) => pendingInView.some((t) => t.id === id));
    if (ids.length === 0) return;
    if (confirm(`Aprovar ${ids.length} transação(ões)? Após aprovação, os valores não podem ser alterados.`)) {
      bulkApproveMutation.mutate(ids);
    }
  };

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
          isAdmin={isAdmin}
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

      {showDocsId && (
        <TransactionDocumentsModal
          transactionId={showDocsId}
          transactionDescription={transactions.find((t) => t.id === showDocsId)?.description ?? ""}
          onClose={() => setShowDocsId(null)}
        />
      )}

      {/* Filters + Bulk Actions */}
      <div className="flex flex-wrap items-center gap-2">
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

        {isAdmin && selectedPendingCount > 0 && (
          <button
            onClick={handleBulkApprove}
            disabled={bulkApproveMutation.isPending}
            className="ml-auto flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-blue-700 disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />
            Aprovar {selectedPendingCount} selecionada{selectedPendingCount > 1 ? "s" : ""}
          </button>
        )}
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
                  {isAdmin && pendingInView.length > 0 && (
                    <th className="pb-3 pr-2 text-center font-medium w-8">
                      <input
                        type="checkbox"
                        checked={selectedPendingCount === pendingInView.length && pendingInView.length > 0}
                        onChange={toggleSelectAll}
                        className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                        title="Selecionar todas pendentes"
                      />
                    </th>
                  )}
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
                {filtered.map((t) => (
                  <TransactionRow
                    key={t.id}
                    transaction={t}
                    isAdmin={isAdmin}
                    selectable={isAdmin && t.status === "pending"}
                    selected={selectedIds.has(t.id)}
                    onToggleSelect={() => toggleSelect(t.id)}
                    showSelectColumn={isAdmin && pendingInView.length > 0}
                    onEdit={(id) => setEditingId(id)}
                    onApprove={(id) => {
                      if (confirm("Aprovar esta transação? Após aprovação, o valor não pode ser alterado.")) {
                        approveMutation.mutate(id);
                      }
                    }}
                    onPayment={(id) => setShowPaymentId(id)}
                    onDocs={(id) => setShowDocsId(id)}
                    onAudit={(id) => setShowAuditId(id)}
                    onDelete={(id) => {
                      if (confirm("Eliminar esta transação? Esta ação não pode ser desfeita.")) {
                        deleteMutation.mutate(id);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
