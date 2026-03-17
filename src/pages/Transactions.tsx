import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, calcIvaAmount } from "@/lib/mock-data";
import type { IvaRate } from "@/lib/mock-data";
import { Plus } from "lucide-react";
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

      {showDocsId && (
        <TransactionDocumentsModal
          transactionId={showDocsId}
          transactionDescription={transactions.find((t) => t.id === showDocsId)?.description ?? ""}
          onClose={() => setShowDocsId(null)}
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
                {filtered.map((t) => (
                  <TransactionRow
                    key={t.id}
                    transaction={t}
                    isAdmin={isAdmin}
                    onEdit={(id) => setEditingId(id)}
                    onApprove={(id) => {
                      if (confirm("Aprovar esta transação? Após aprovação, o valor não pode ser alterado.")) {
                        approveMutation.mutate(id);
                      }
                    }}
                    onPayment={(id) => setShowPaymentId(id)}
                    onDocs={(id) => setShowDocsId(id)}
                    onAudit={(id) => setShowAuditId(id)}
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
