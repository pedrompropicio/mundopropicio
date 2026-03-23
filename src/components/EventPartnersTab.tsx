import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Users, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { SupplierFormModal } from "@/components/SupplierFormModal";

interface Props {
  eventId: string;
  eventStatus: string;
}

export function EventPartnersTab({ eventId, eventStatus }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin, isManager } = useAuth();
  const canEdit = (isAdmin || isManager) && !["completed"].includes(eventStatus);

  const [showForm, setShowForm] = useState(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [percentage, setPercentage] = useState("");
  const [expenseIncludesIva, setExpenseIncludesIva] = useState(false);
  const [notes, setNotes] = useState("");

  const { data: event } = useQuery({
    queryKey: ["event-detail", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("partner_calc_basis").eq("id", eventId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["event-partners", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_partners")
        .select("*, suppliers(name)")
        .eq("event_id", eventId)
        .order("created_at");
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

  const totalPercentage = partners.reduce((sum: number, p: any) => sum + Number(p.percentage), 0);

  const updateCalcBasis = useMutation({
    mutationFn: async (basis: string) => {
      const { error } = await supabase.from("events").update({ partner_calc_basis: basis }).eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-detail", eventId] });
      toast({ title: "Base de cálculo atualizada" });
    },
  });

  const addPartner = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("event_partners").insert({
        event_id: eventId,
        supplier_id: selectedSupplier,
        percentage: Number(percentage),
        expense_includes_iva: expenseIncludesIva,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-partners", eventId] });
      setShowForm(false);
      setSelectedSupplier("");
      setPercentage("");
      setExpenseIncludesIva(false);
      setNotes("");
      toast({ title: "Sócio adicionado" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const removePartner = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_partners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-partners", eventId] });
      toast({ title: "Sócio removido" });
    },
  });

  const usedSupplierIds = partners.map((p: any) => p.supplier_id);
  const availableSuppliers = suppliers.filter((s: any) => !usedSupplierIds.includes(s.id));

  return (
    <div className="space-y-6">
      {/* Calc basis config */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Base de cálculo da participação</p>
        </div>
        <RadioGroup
          value={event?.partner_calc_basis || "net_result"}
          onValueChange={(v) => canEdit && updateCalcBasis.mutate(v)}
          disabled={!canEdit}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="net_result" id="cb-net" />
            <Label htmlFor="cb-net" className="text-sm cursor-pointer">
              Resultado Líquido (Receitas s/ IVA − Despesas s/ IVA)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="net_result_gross_expenses" id="cb-net-gross" />
            <Label htmlFor="cb-net-gross" className="text-sm cursor-pointer">
              Resultado Líquido (Receitas s/ IVA − Despesas c/ IVA)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="gross_revenue" id="cb-gross" />
            <Label htmlFor="cb-gross" className="text-sm cursor-pointer">
              Receita Bruta (s/ IVA)
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Partners list */}
      <div className="glass rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Sócios / Participações</p>
            <span className="text-xs text-muted-foreground">({totalPercentage}% atribuído)</span>
          </div>
          {canEdit && !showForm && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)} disabled={availableSuppliers.length === 0}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar
            </Button>
          )}
        </div>

        {partners.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sócio</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-center">Despesa c/ IVA</TableHead>
                <TableHead>Notas</TableHead>
                {canEdit && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.suppliers?.name || "—"}</TableCell>
                  <TableCell className="text-right font-mono">{Number(p.percentage).toFixed(1)}%</TableCell>
                  <TableCell className="text-center">{p.expense_includes_iva ? "Sim" : "Não"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{p.notes || "—"}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removePartner.mutate(p.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {partners.length === 0 && !showForm && (
          <p className="text-center text-sm text-muted-foreground py-6">
            Nenhum sócio configurado para este evento.
          </p>
        )}

        {/* Add form */}
        {showForm && (
          <div className="border border-border/50 rounded-lg p-4 space-y-4 bg-secondary/10">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Fornecedor (Sócio)</Label>
                <SearchableSelect
                  options={availableSuppliers.map((s: any) => ({ value: s.id, label: s.name }))}
                  value={selectedSupplier}
                  onValueChange={setSelectedSupplier}
                  placeholder="Selecionar fornecedor..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Percentagem (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max={100 - totalPercentage}
                  step="0.1"
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                  placeholder={`Máx: ${(100 - totalPercentage).toFixed(1)}%`}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="exp-iva"
                checked={expenseIncludesIva}
                onCheckedChange={(v) => setExpenseIncludesIva(!!v)}
              />
              <Label htmlFor="exp-iva" className="text-sm cursor-pointer">
                Despesas consideradas com IVA (ex: sócios BR)
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notas (opcional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações..." />
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button
                size="sm"
                onClick={() => addPartner.mutate()}
                disabled={!selectedSupplier || !percentage || Number(percentage) <= 0 || addPartner.isPending}
              >
                Adicionar Sócio
              </Button>
            </div>
          </div>
        )}

        {totalPercentage > 0 && totalPercentage < 100 && (
          <p className="text-xs text-muted-foreground">
            Mundo Propício retém {(100 - totalPercentage).toFixed(1)}% do resultado.
          </p>
        )}
      </div>
    </div>
  );
}
