import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { ChevronDown, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

interface SupplierTransactionsProps {
  supplierId: string;
  isOpen: boolean;
  onToggle: () => void;
}

export function SupplierTransactions({ supplierId, isOpen, onToggle }: SupplierTransactionsProps) {
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["supplier-transactions", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, paid_amount, status, type, date, due_date, specification, supplier_id, event_id, events(name), suppliers(name, trade_name)")
        .eq("supplier_id", supplierId)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isOpen,
  });

  const paid = transactions.filter((t) => t.status === "paid");
  const unpaid = transactions.filter((t) => t.status !== "paid");

  const totalAmount = transactions.reduce((s, t) => s + Number(t.amount), 0);
  const totalPaid = transactions.reduce((s, t) => s + Number(t.paid_amount ?? 0), 0);

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        {isOpen ? "Recolher contratações" : "Ver contratações"}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">A carregar…</p>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma contratação encontrada.</p>
          ) : (
            <>
              {/* Summary */}
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
                  {transactions.length} contratação{transactions.length !== 1 ? "ões" : ""}
                </span>
                <span className="rounded-full bg-success/15 px-2.5 py-1 font-medium text-success">
                  Liquidado: {formatCurrency(totalPaid)}
                </span>
                <span className={`rounded-full px-2.5 py-1 font-medium ${totalAmount - totalPaid > 0 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
                  Em aberto: {formatCurrency(totalAmount - totalPaid)}
                </span>
              </div>

              {/* Unpaid */}
              {unpaid.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-warning mb-1.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Não liquidados ({unpaid.length})
                  </h4>
                  <div className="space-y-1">
                    {unpaid.map((t) => (
                      <TransactionLine key={t.id} tx={t} />
                    ))}
                  </div>
                </div>
              )}

              {/* Paid */}
              {paid.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-success mb-1.5 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Liquidados ({paid.length})
                  </h4>
                  <div className="space-y-1">
                    {paid.map((t) => (
                      <TransactionLine key={t.id} tx={t} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TransactionLine({ tx }: { tx: any }) {
  const isPaid = tx.status === "paid";
  const isOverdue = !isPaid && tx.due_date && new Date(tx.due_date) < new Date();

  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground truncate">{tx.description}</p>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>{format(new Date(tx.date), "dd/MM/yyyy")}</span>
          {tx.specification && <span>· {tx.specification}</span>}
          {isOverdue && (
            <span className="flex items-center gap-0.5 text-destructive font-medium">
              <AlertCircle className="h-3 w-3" /> Vencido
            </span>
          )}
        </div>
      </div>
      <div className="text-right ml-3 shrink-0">
        <p className={`font-mono font-medium ${tx.type === "income" ? "text-success" : "text-foreground"}`}>
          {formatCurrency(Number(tx.amount))}
        </p>
        {!isPaid && Number(tx.paid_amount) > 0 && (
          <p className="text-[10px] text-success">Pago: {formatCurrency(Number(tx.paid_amount))}</p>
        )}
      </div>
    </div>
  );
}
