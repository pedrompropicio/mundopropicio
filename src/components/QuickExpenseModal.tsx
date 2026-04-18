import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit, getAuditUser } from "@/lib/audit";

interface Props {
  open: boolean;
  onClose: () => void;
  officeId: string;
  officeName: string;
  eventId: string;
  defaultDate: string;
  onCreated?: (transactionId: string) => void;
}

const IVA_OPTIONS = [0, 6, 13, 23];

/**
 * Quick "Nova Despesa Liquidada" modal — for use inside the ticket office settlement flow.
 * Creates a transaction already paid by the box office (status=paid, account_id=officeId, payment_date=settlementDate).
 */
export function QuickExpenseModal({ open, onClose, officeId, officeName, eventId, defaultDate, onCreated }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [ivaRate, setIvaRate] = useState<number>(23);
  const [paymentDate, setPaymentDate] = useState(defaultDate);
  const [supplierId, setSupplierId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setPaymentDate(defaultDate);
  }, [open, defaultDate]);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["quick_expense_suppliers"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["quick_expense_categories"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("account_categories")
        .select("id, code, name, type")
        .eq("is_active", true)
        .eq("type", "expense")
        .order("code");
      // Only leaf categories (no children)
      const all = data || [];
      const parentIds = new Set(all.map((c: any) => c.id).filter(Boolean));
      const { data: parents } = await supabase
        .from("account_categories")
        .select("parent_id")
        .not("parent_id", "is", null);
      const isParent = new Set((parents || []).map((p: any) => p.parent_id));
      return all.filter((c: any) => !isParent.has(c.id));
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!description.trim()) throw new Error("Descrição obrigatória");
      const value = Number(amount);
      if (!value || value <= 0) throw new Error("Valor inválido");
      if (!paymentDate) throw new Error("Data obrigatória");
      if (!categoryId) throw new Error("Categoria obrigatória");

      const payload: any = {
        type: "expense",
        description: description.trim(),
        amount: value,
        paid_amount: value,
        iva_rate: ivaRate,
        status: "paid",
        date: paymentDate,
        payment_date: paymentDate,
        account_id: officeId,
        event_id: eventId,
        category_id: categoryId,
        supplier_id: supplierId || null,
        specification: notes || null,
      };

      const { data, error } = await (supabase as any)
        .from("transactions")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      await logAudit({
        entity_type: "transaction",
        entity_id: data.id,
        action: "create",
        changed_by: getAuditUser(user),
        new_data: { ...payload, _context: "ticket_office_settlement_quick_expense" },
      });

      return data.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["settlement_eligible_txns"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["ticket_office_balances"] });
      toast.success("Despesa liquidada registada");
      onCreated?.(id);
      handleClose();
    },
    onError: (err: any) => toast.error("Erro", { description: err.message }),
  });

  const handleClose = () => {
    setDescription("");
    setAmount("");
    setIvaRate(23);
    setSupplierId("");
    setCategoryId("");
    setNotes("");
    onClose();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await saveMutation.mutateAsync();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="z-[100] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Despesa Liquidada</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-0.5">
            <div><span className="font-medium text-foreground">Bilheteira:</span> {officeName}</div>
            <div className="text-[11px]">A despesa será criada como <strong>paga pela bilheteira</strong> e marcada automaticamente como dedução do fecho.</div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Segurança, comissão..." />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Valor (€) c/ IVA</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>IVA %</Label>
              <Select value={String(ivaRate)} onValueChange={(v) => setIvaRate(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IVA_OPTIONS.map((r) => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Data de pagamento</Label>
            <DatePicker value={paymentDate} onChange={(v) => setPaymentDate(v ?? "")} />
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <SearchableSelect
              value={categoryId}
              onValueChange={setCategoryId}
              options={categories.map((c: any) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
              placeholder="Selecione a categoria"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Fornecedor (opcional)</Label>
            <SearchableSelect
              value={supplierId}
              onValueChange={setSupplierId}
              options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
              placeholder="Selecione o fornecedor"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notas (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registar como paga
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
