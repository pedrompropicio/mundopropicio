import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { SupplierCreditBanner, resolveCreditSelection, type CreditSelection } from "@/components/supplier-credits/SupplierCreditBanner";
import { applySupplierCredit } from "@/lib/supplier-credits";
import { useAvailableSupplierCredits } from "@/hooks/useAvailableSupplierCredits";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  installment: {
    id: string;
    amount: number;
    scheduled_date: string | null;
    payment_method?: string | null;
  } | null;
  transactionId: string;
};

const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fromYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
};

export function MarkInstallmentPaidModal({ open, onOpenChange, installment, transactionId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [paymentDate, setPaymentDate] = useState<Date>(
    installment?.scheduled_date ? fromYmd(installment.scheduled_date) : new Date(),
  );
  const [accountId, setAccountId] = useState<string>("");
  const [method, setMethod] = useState<string>(installment?.payment_method || "transfer");
  const [withholding, setWithholding] = useState<string>("0");
  const [credit, setCredit] = useState<string>("0");
  const [creditSel, setCreditSel] = useState<CreditSelection>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["mark-paid-accounts"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: tx } = useQuery({
    queryKey: ["mark-paid-tx", transactionId],
    enabled: open && !!transactionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, supplier_id")
        .eq("id", transactionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: availableCredits = [] } = useAvailableSupplierCredits(tx?.supplier_id, open);

  const mut = useMutation({
    mutationFn: async () => {
      if (!installment) return;
      const creditToApply = resolveCreditSelection(creditSel, availableCredits, Number(installment.amount));
      if (!accountId) throw new Error("Escolhe uma conta financeira.");
      const { error } = await supabase
        .from("transaction_payments" as any)
        .update({
          status: "paid",
          payment_date: ymd(paymentDate),
          account_id: accountId,
          payment_method: method,
          withholding_amount: parseFloat(withholding) || 0,
          credit_amount: parseFloat(credit) || 0,
          created_by: user?.email ?? "sistema",
        } as any)
        .eq("id", installment.id);
      if (error) throw error;

      // Abate do crédito de fornecedor (transacional, só depois de confirmado).
      if (creditToApply) {
        await applySupplierCredit({
          creditId: creditToApply.creditId,
          transactionId,
          amount: creditToApply.amount,
          paymentId: installment.id,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-timeline", transactionId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-credits-available"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-credits-all"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-credits-summary"] });
      toast({ title: "Parcela marcada como paga" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (!installment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar parcela como paga</DialogTitle>
          <DialogDescription>
            Valor: <span className="font-mono font-semibold">
              {Number(installment.amount).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
            </span>
            {installment.scheduled_date && (
              <> · Prevista: {format(fromYmd(installment.scheduled_date), "dd/MM/yyyy", { locale: pt })}</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <SupplierCreditBanner
            supplierId={tx?.supplier_id}
            maxAmount={Number(installment.amount)}
            value={creditSel}
            onChange={setCreditSel}
            disabled={mut.isPending}
          />

          <div className="space-y-1.5">
            <Label className="text-xs">Data efetiva</Label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(paymentDate, "dd/MM/yyyy", { locale: pt })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[100]" align="start">
                <Calendar
                  mode="single"
                  selected={paymentDate}
                  onSelect={(d) => {
                    if (d) {
                      setPaymentDate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));
                      setDatePickerOpen(false);
                    }
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Conta financeira</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
              <SelectContent>
                {(accounts as any[]).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Método</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">Transferência</SelectItem>
                <SelectItem value="service_payment">Pag. Serviços</SelectItem>
                <SelectItem value="direct_debit">Débito Direto</SelectItem>
                <SelectItem value="state_payment">Pag. Estado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Retenção (€)</Label>
              <Input type="number" step="0.01" min="0" value={withholding} onChange={(e) => setWithholding(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Crédito usado (€)</Label>
              <Input type="number" step="0.01" min="0" value={credit} onChange={(e) => setCredit(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !accountId}>
            {mut.isPending ? "A guardar…" : "Marcar como paga"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
