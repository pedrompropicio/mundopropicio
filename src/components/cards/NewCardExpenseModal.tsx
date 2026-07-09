import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { X, Receipt } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  cardAccountId: string;
  defaultEventId?: string | null;
}

export function NewCardExpenseModal({ open, onOpenChange, sessionId, cardAccountId, defaultEventId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [ivaRate, setIvaRate] = useState("23");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [eventId, setEventId] = useState<string>(defaultEventId ?? "");
  const [categoryId, setCategoryId] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");

  const { data: events = [] } = useQuery({
    queryKey: ["events-for-card-expense"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, name, date, status")
        .in("status", ["planning", "confirmed", "active", "completed"])
        .order("date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["l3-categories"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("account_categories")
        .select("id, name, code, type, parent_id")
        .eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-active"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name").order("name");
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

  const mut = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (isNaN(amt) || amt <= 0) throw new Error("Valor inválido.");
      if (!description.trim()) throw new Error("Descrição obrigatória.");
      if (!categoryId) throw new Error("Categoria obrigatória.");

      const { error } = await supabase.from("transactions").insert({
        description: description.trim(),
        type: "expense",
        amount: amt,
        iva_rate: parseFloat(ivaRate) || 0,
        category_id: categoryId,
        account_id: cardAccountId,
        supplier_id: supplierId || null,
        event_id: eventId || null,
        date,
        status: "paid",
        paid_amount: amt,
        payment_date: date,
        card_session_id: sessionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Despesa registada." });
      qc.invalidateQueries({ queryKey: ["card-session", sessionId] });
      qc.invalidateQueries({ queryKey: ["financial-accounts"] });
      onOpenChange(false);
      setDescription(""); setAmount(""); setCategoryId(""); setSupplierId("");
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Nova despesa (cartão)</h2>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição *</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} required className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor (€) *</label>
              <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">IVA (%)</label>
              <input type="number" step="0.01" value={ivaRate} onChange={(e) => setIvaRate(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
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
              placeholder="(sem evento — custo comum)"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Fornecedor</label>
            <SearchableSelect
              options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
              value={supplierId}
              onValueChange={setSupplierId}
              placeholder="(opcional)"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={mut.isPending} className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {mut.isPending ? "A registar…" : "Registar despesa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
