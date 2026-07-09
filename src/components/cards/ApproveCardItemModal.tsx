import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { X, CheckCircle2 } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";

interface Item {
  id: string;
  session_id: string;
  item_date: string;
  supplier_name: string | null;
  description: string | null;
  amount: number;
  iva_rate: number;
  event_id: string | null;
  category_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: Item | null;
  cardAccountId: string;
}

export function ApproveCardItemModal({ open, onOpenChange, item, cardAccountId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [ivaRate, setIvaRate] = useState("");
  const [date, setDate] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [eventId, setEventId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");

  useEffect(() => {
    if (item) {
      setDescription(item.description ?? "");
      setAmount(String(item.amount));
      setIvaRate(String(item.iva_rate));
      setDate(item.item_date);
      setSupplierName(item.supplier_name ?? "");
      setEventId(item.event_id ?? "");
      setCategoryId(item.category_id ?? "");
    }
  }, [item]);

  const { data: events = [] } = useQuery({
    queryKey: ["events-for-card-expense"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("events").select("id, name").order("date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["l3-categories"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("account_categories").select("id, name, code, type, parent_id").eq("is_active", true);
      return data ?? [];
    },
  });

  const l3Options = useMemo(() => {
    const byId = new Map(categories.map((c: any) => [c.id, c]));
    const isL3 = (c: any) => {
      const p1 = byId.get(c.parent_id);
      if (!p1) return false;
      const p2 = byId.get((p1 as any).parent_id);
      return !!p2;
    };
    return categories
      .filter((c: any) => isL3(c) && c.type === "expense")
      .sort((a: any, b: any) => (a.code || "").localeCompare(b.code || ""))
      .map((c: any) => ({ value: c.id, label: `${c.code} — ${c.name}` }));
  }, [categories]);

  const approve = useMutation({
    mutationFn: async () => {
      if (!item) return;
      if (!categoryId) throw new Error("Categoria obrigatória para aprovar.");
      const amt = parseFloat(amount);
      if (isNaN(amt) || amt <= 0) throw new Error("Valor inválido.");

      const { data: tx, error } = await supabase
        .from("transactions")
        .insert({
          description: description.trim() || supplierName || "Despesa cartão",
          type: "expense",
          amount: amt,
          iva_rate: parseFloat(ivaRate) || 0,
          category_id: categoryId,
          account_id: cardAccountId,
          event_id: eventId || null,
          date,
          status: "paid",
          paid_amount: amt,
          payment_date: date,
          card_session_id: item.session_id,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: updErr } = await supabase
        .from("card_session_items")
        .update({
          status: "approved",
          amount: amt,
          iva_rate: parseFloat(ivaRate) || 0,
          item_date: date,
          supplier_name: supplierName || null,
          description: description || null,
          event_id: eventId || null,
          category_id: categoryId,
          transaction_id: tx.id,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast({ title: "Item aprovado." });
      qc.invalidateQueries({ queryKey: ["card-session", item?.session_id] });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const reason = window.prompt("Motivo da rejeição:");
      if (!reason) throw new Error("cancelado");
      const { error } = await supabase
        .from("card_session_items")
        .update({
          status: "rejected",
          rejection_reason: reason,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Item rejeitado." });
      qc.invalidateQueries({ queryKey: ["card-session", item?.session_id] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      if (e.message !== "cancelado") toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Aprovar despesa</h2>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="input-base" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Fornecedor</label>
            <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="input-base" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor (€)</label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="input-base" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">IVA (%)</label>
              <input type="number" step="0.01" value={ivaRate} onChange={(e) => setIvaRate(e.target.value)} className="input-base" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Categoria (L3) *</label>
            <SearchableSelect
              options={l3Options}
              value={categoryId}
              onValueChange={setCategoryId}
              placeholder="Selecionar categoria…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Evento</label>
            <SearchableSelect
              options={events.map((e: any) => ({ value: e.id, label: e.name }))}
              value={eventId}
              onValueChange={setEventId}
              placeholder="(sem evento)"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => reject.mutate()}
              disabled={reject.isPending}
              className="flex-1 rounded-lg border border-destructive/40 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Rejeitar
            </button>
            <button
              type="button"
              onClick={() => approve.mutate()}
              disabled={approve.isPending}
              className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {approve.isPending ? "A aprovar…" : "Aprovar → Criar transação"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
