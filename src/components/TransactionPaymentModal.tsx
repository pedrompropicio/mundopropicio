import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { X, CalendarIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface Props {
  transaction: any;
  onClose: () => void;
}

export function TransactionPaymentModal({ transaction, onClose }: Props) {
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [invoiceRef, setInvoiceRef] = useState("");
  const [accountId, setAccountId] = useState(transaction.account_id ?? "");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: financialAccounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("id, name, type").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const amount = Number(transaction.amount);
  const currentPaid = Number(transaction.paid_amount ?? 0);
  const balance = amount - currentPaid;

  const accountOptions = financialAccounts.map((a: any) => ({ value: a.id, label: a.name }));

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const addAmount = parseFloat(paymentAmount);
      if (!addAmount || addAmount <= 0) throw new Error("Insira um valor válido");
      if (!accountId) throw new Error("Selecione a conta de origem/destino");
      const newPaid = currentPaid + addAmount;
      if (newPaid > amount) throw new Error("O valor excede o saldo em aberto");

      await supabase.from("transaction_audit_log").insert({
        transaction_id: transaction.id,
        changed_by: "utilizador",
        field_name: "Pagamento parcial",
        old_value: String(currentPaid),
        new_value: String(newPaid),
      });

      const newStatus = newPaid >= amount ? "paid" : "approved";
      const updateData: any = { paid_amount: newPaid, status: newStatus, account_id: accountId, payment_date: format(paymentDate, "yyyy-MM-dd") };
      if (invoiceRef.trim()) updateData.invoice_ref = invoiceRef.trim();
      const { error } = await supabase
        .from("transactions")
        .update(updateData)
        .eq("id", transaction.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onClose();
      toast({ title: "Pagamento registado com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-sm rounded-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Registar Pagamento</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">{transaction.description}</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Valor total:</span>
            <span className="font-semibold">{formatCurrency(amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Já pago:</span>
            <span className="font-semibold text-success">{formatCurrency(currentPaid)}</span>
          </div>
          <div className="flex justify-between border-t border-border/50 pt-2">
            <span className="text-muted-foreground">Saldo em aberto:</span>
            <span className="font-bold text-warning">{formatCurrency(balance)}</span>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Conta de origem/destino *</label>
          <SearchableSelect
            options={accountOptions}
            value={accountId}
            onValueChange={setAccountId}
            placeholder="Selecionar conta…"
            searchPlaceholder="Pesquisar conta…"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Data de Pagamento *</label>
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary/50",
                !paymentDate && "text-muted-foreground"
              )}>
                {paymentDate ? format(paymentDate, "dd/MM/yyyy", { locale: pt }) : "Selecionar data…"}
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[80]" align="start">
              <Calendar
                mode="single"
                selected={paymentDate}
                onSelect={(d) => d && setPaymentDate(d)}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Nº Doc/Fatura</label>
          <input type="text" value={invoiceRef}
            onChange={(e) => setInvoiceRef(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Ex: FT 2026/001" />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor a pagar (€)</label>
          <input type="number" step="0.01" min="0.01" max={balance} value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="0.00" />
        </div>

        <button onClick={() => paymentMutation.mutate()} disabled={paymentMutation.isPending}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
          {paymentMutation.isPending ? "A processar…" : "Confirmar Pagamento"}
        </button>
      </div>
    </div>
  );
}
