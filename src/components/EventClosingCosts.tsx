import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Pencil, X, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface Props {
  eventId: string;
  eventStatus: string;
}

export function EventClosingCosts({ eventId, eventStatus }: Props) {
  const queryClient = useQueryClient();
  const isEventLocked = eventStatus === "completed";
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");

  const { data: costs = [], isLoading } = useQuery({
    queryKey: ["event-closing-costs", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_closing_costs")
        .select("*, account_categories(code, name)")
        .eq("event_id", eventId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["account-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*").eq("is_active", true).order("code");
      if (error) throw error;
      return data;
    },
  });

  const expenseCategories = categories.filter((c: any) => c.type === "expense");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        event_id: eventId,
        description,
        amount: parseFloat(amount) || 0,
        category_id: categoryId || null,
        notes: notes || null,
      };
      if (editingId) {
        const { error } = await supabase.from("event_closing_costs").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_closing_costs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-closing-costs", eventId] });
      toast({ title: editingId ? "Custo atualizado" : "Custo adicionado" });
      resetForm();
    },
    onError: () => toast({ title: "Erro ao guardar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_closing_costs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-closing-costs", eventId] });
      toast({ title: "Custo removido" });
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setDescription("");
    setAmount("");
    setCategoryId("");
    setNotes("");
  }

  function startEdit(cost: any) {
    setEditingId(cost.id);
    setDescription(cost.description);
    setAmount(String(cost.amount));
    setCategoryId(cost.category_id || "");
    setNotes(cost.notes || "");
    setShowForm(true);
  }

  const totalCosts = costs.reduce((s: number, c: any) => s + Number(c.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">Custos de Fecho <HelpTooltip text={helpTexts.eventClosingTab} size={13} /></h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Custos internos que não geram transações bancárias (rateio de equipa, assessoria, etc.)
          </p>
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar
          </Button>
        )}
      </div>

      {showForm && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição *</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Rateio equipa de produção" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (€) *</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <SearchableSelect
                options={expenseCategories.map((c: any) => ({ value: c.id, label: `${c.code} - ${c.name}` }))}
                value={categoryId}
                onValueChange={setCategoryId}
                placeholder="Selecionar categoria…"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notas</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações opcionais" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={resetForm}>
              <X className="mr-1 h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!description || !amount || saveMutation.isPending}>
              <Check className="mr-1 h-3.5 w-3.5" /> {editingId ? "Atualizar" : "Guardar"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-4">A carregar…</p>
      ) : costs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhum custo de fecho registado.</p>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="text-sm font-medium">{c.description}</p>
                    {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.account_categories ? `${c.account_categories.code} - ${c.account_categories.name}` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-warning">{formatCurrency(Number(c.amount))}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(c)} className="p-1 rounded hover:bg-secondary transition-colors">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => { if (window.confirm("Remover este custo?")) deleteMutation.mutate(c.id); }}
                        className="p-1 rounded hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-border bg-muted/30">
                <TableCell colSpan={2} className="font-bold text-sm">TOTAL CUSTOS DE FECHO</TableCell>
                <TableCell className="text-right font-mono font-bold text-warning">{formatCurrency(totalCosts)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
