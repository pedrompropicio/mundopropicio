import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  Pause,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const IVA_RATES = [0, 6, 13, 23];
const FREQUENCIES = [
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "yearly", label: "Anual" },
];

interface RecurringForm {
  description: string;
  type: string;
  amount: string;
  iva_rate: number;
  category_id: string;
  event_id: string;
  supplier_id: string;
  account_id: string;
  specification: string;
  frequency: string;
  day_of_month: number;
  start_date: string;
  end_date: string;
}

const emptyForm: RecurringForm = {
  description: "",
  type: "expense",
  amount: "",
  iva_rate: 23,
  category_id: "",
  event_id: "",
  supplier_id: "",
  account_id: "",
  specification: "",
  frequency: "monthly",
  day_of_month: 1,
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
};

export default function RecurringTransactions() {
  const { isAdmin, isManager, user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<RecurringForm>(emptyForm);

  const { data: recurring = [], isLoading } = useQuery({
    queryKey: ["recurring-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_transactions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["account-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*").eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").in("status", ["planning", "confirmed", "active"]).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  // Leaf categories for the selected type
  const leafCategories = categories.filter((c) => {
    const hasChildren = categories.some((ch) => ch.parent_id === c.id);
    return !hasChildren && c.type === form.type;
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        description: form.description,
        type: form.type,
        amount: Number(form.amount),
        iva_rate: form.iva_rate,
        category_id: form.category_id || null,
        event_id: form.event_id || null,
        supplier_id: form.supplier_id || null,
        account_id: form.account_id || null,
        specification: form.specification || null,
        frequency: form.frequency,
        day_of_month: form.day_of_month,
        start_date: form.start_date,
        end_date: form.end_date || null,
        created_by: user?.email ?? "system",
      };

      if (editId) {
        const { error } = await supabase.from("recurring_transactions").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("recurring_transactions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-transactions"] });
      toast.success(editId ? "Template atualizado" : "Template criado");
      closeForm();
    },
    onError: () => toast.error("Erro ao guardar template"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-transactions"] });
      toast.success("Template eliminado");
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("recurring_transactions").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring-transactions"] }),
  });

  // Manual generation for a single template
  const generateNow = useMutation({
    mutationFn: async (rec: any) => {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("transactions").insert({
        description: rec.description,
        type: rec.type,
        amount: rec.amount,
        iva_rate: rec.iva_rate,
        category_id: rec.category_id,
        event_id: rec.event_id,
        supplier_id: rec.supplier_id,
        account_id: rec.account_id,
        specification: rec.specification,
        date: today,
        status: "pending",
      });
      if (error) throw error;

      // Update last_generated_at
      await supabase.from("recurring_transactions").update({
        last_generated_at: today,
      }).eq("id", rec.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-transactions"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transação gerada com sucesso");
    },
    onError: () => toast.error("Erro ao gerar transação"),
  });

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const openEdit = (rec: any) => {
    setEditId(rec.id);
    setForm({
      description: rec.description,
      type: rec.type,
      amount: String(rec.amount),
      iva_rate: rec.iva_rate,
      category_id: rec.category_id ?? "",
      event_id: rec.event_id ?? "",
      supplier_id: rec.supplier_id ?? "",
      account_id: rec.account_id ?? "",
      specification: rec.specification ?? "",
      frequency: rec.frequency,
      day_of_month: rec.day_of_month,
      start_date: rec.start_date,
      end_date: rec.end_date ?? "",
    });
    setShowForm(true);
  };

  const freqLabel = (f: string) => FREQUENCIES.find((x) => x.value === f)?.label ?? f;

  const getCategoryLabel = (id: string | null) => {
    if (!id) return "—";
    const cat = categories.find((c) => c.id === id);
    return cat ? `${cat.code} — ${cat.name}` : "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Transações Recorrentes</h1>
          <p className="text-sm text-muted-foreground">Templates para lançamentos automáticos periódicos</p>
        </div>
        {(isAdmin || isManager) && (
          <button
            onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo Template</span>
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-muted-foreground">A carregar…</p>
      ) : recurring.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center">
          <RefreshCw className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-muted-foreground">Nenhum template recorrente criado.</p>
          <p className="text-sm text-muted-foreground">Crie templates para automatizar lançamentos mensais como salários, rendas e seguros.</p>
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead className="hidden md:table-cell">Tipo</TableHead>
                <TableHead className="hidden sm:table-cell">Frequência</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="hidden lg:table-cell">Categoria</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recurring.map((rec: any) => (
                <TableRow key={rec.id}>
                  <TableCell>
                    <p className="font-medium">{rec.description}</p>
                    <p className="text-xs text-muted-foreground md:hidden">
                      {rec.type === "income" ? "Receita" : "Despesa"} · {freqLabel(rec.frequency)}
                    </p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={rec.type === "income" ? "default" : "secondary"}>
                      {rec.type === "income" ? "Receita" : "Despesa"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{freqLabel(rec.frequency)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(Number(rec.amount))}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                    {getCategoryLabel(rec.category_id)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={rec.is_active ? "default" : "outline"}>
                      {rec.is_active ? "Ativo" : "Pausado"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => generateNow.mutate(rec)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        title="Gerar transação agora"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => toggleActive.mutate({ id: rec.id, active: !rec.is_active })}
                        className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        title={rec.is_active ? "Pausar" : "Ativar"}
                      >
                        {rec.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      {(isAdmin || isManager) && (
                        <>
                          <button
                            onClick={() => openEdit(rec)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(rec.id)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Template" : "Novo Template Recorrente"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Descrição *</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required
                  placeholder="Ex: Renda do escritório"
                />
              </div>

              <div>
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v, category_id: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Despesa</SelectItem>
                    <SelectItem value="income">Receita</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Valor (€) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label>Taxa IVA</Label>
                <Select value={String(form.iva_rate)} onValueChange={(v) => setForm({ ...form, iva_rate: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IVA_RATES.map((r) => (
                      <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Frequência</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Dia do mês</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={form.day_of_month}
                  onChange={(e) => setForm({ ...form, day_of_month: Number(e.target.value) })}
                />
              </div>

              <div>
                <Label>Data início</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>

              <div>
                <Label>Data fim (opcional)</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>

              <div className="sm:col-span-2">
                <Label>Categoria</Label>
                <SearchableSelect
                  options={leafCategories.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
                  value={form.category_id}
                  onValueChange={(v) => setForm({ ...form, category_id: v })}
                  placeholder="Selecionar categoria..."
                />
              </div>

              <div>
                <Label>Evento (opcional)</Label>
                <SearchableSelect
                  options={events.map((e) => ({ value: e.id, label: e.name }))}
                  value={form.event_id}
                  onValueChange={(v) => setForm({ ...form, event_id: v })}
                  placeholder="Selecionar evento..."
                />
              </div>

              <div>
                <Label>Fornecedor (opcional)</Label>
                <SearchableSelect
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                  value={form.supplier_id}
                  onValueChange={(v) => setForm({ ...form, supplier_id: v })}
                  placeholder="Selecionar fornecedor..."
                />
              </div>

              <div>
                <Label>Conta financeira (opcional)</Label>
                <SearchableSelect
                  options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                  value={form.account_id}
                  onValueChange={(v) => setForm({ ...form, account_id: v })}
                  placeholder="Selecionar conta..."
                />
              </div>

              <div>
                <Label>Especificação (opcional)</Label>
                <Input
                  value={form.specification}
                  onChange={(e) => setForm({ ...form, specification: e.target.value })}
                  placeholder="Ex: Ref. contrato 123"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary disabled:opacity-50"
              >
                {saveMutation.isPending ? "A guardar…" : editId ? "Atualizar" : "Criar Template"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
