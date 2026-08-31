import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { partnerUsesGrossExpenses, describePartnerExpenseBasis } from "@/lib/partner-calc-basis";
import { Trash2, Plus, Users, Info, Pencil, Check, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { PartnerExtrasPanel } from "@/components/PartnerExtrasPanel";

interface Props {
  eventId: string;
  eventStatus: string;
}

export function EventPartnersTab({ eventId, eventStatus }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin, isManager } = useAuth();
  const canEdit = (isAdmin || isManager) && eventStatus !== "completed";

  const [showForm, setShowForm] = useState(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [percentage, setPercentage] = useState("");
  const [lossPercentage, setLossPercentage] = useState("");
  const [notes, setNotes] = useState("");
  const [canOrder, setCanOrder] = useState(false);
  const [canPay, setCanPay] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPercentage, setEditPercentage] = useState("");
  const [editLossPercentage, setEditLossPercentage] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editCanOrder, setEditCanOrder] = useState(false);
  const [editCanPay, setEditCanPay] = useState(false);
  // Base de apuramento da despesa deste sócio: "inherit" | "gross" | "net".
  const [editIvaBasis, setEditIvaBasis] = useState<"inherit" | "gross" | "net">("inherit");

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
        loss_percentage: lossPercentage ? Number(lossPercentage) : null,
        notes: notes || null,
        can_order: canOrder,
        can_pay: canPay,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-partners", eventId] });
      setShowForm(false);
      setSelectedSupplier("");
      setPercentage("");
      setLossPercentage("");
      setNotes("");
      setCanOrder(false);
      setCanPay(false);
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

  const updatePartner = useMutation({
    mutationFn: async ({ id, supplier_id, name, percentage: pct, loss_percentage: lp, notes: n, originalName, can_order, can_pay, expense_includes_iva }: { id: string; supplier_id: string; name: string; percentage: number; loss_percentage: number | null; notes: string; originalName: string; can_order: boolean; can_pay: boolean; expense_includes_iva: boolean | null }) => {
      const { error } = await supabase.from("event_partners").update({ percentage: pct, loss_percentage: lp, notes: n || null, can_order, can_pay, expense_includes_iva }).eq("id", id);
      if (error) throw error;
      const trimmed = name.trim();
      if (trimmed && trimmed !== originalName) {
        const { error: nameError } = await supabase.from("suppliers").update({ name: trimmed }).eq("id", supplier_id);
        if (nameError) throw nameError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-partners", eventId] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-active"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setEditingId(null);
      toast({ title: "Sócio atualizado" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
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
                <TableHead className="text-right">% Lucro</TableHead>
                <TableHead className="text-right">% Prejuízo</TableHead>
                <TableHead>Base IVA</TableHead>
                <TableHead>BP</TableHead>
                <TableHead>Notas</TableHead>
                {canEdit && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((p: any) => {
                const isEditing = editingId === p.id;
                const otherTotal = partners.reduce((sum: number, op: any) => op.id === p.id ? sum : sum + Number(op.percentage), 0);
                const maxPct = 100 - otherTotal;
                const hasLoss = p.loss_percentage !== null && p.loss_percentage !== undefined;
                return (
                  <React.Fragment key={p.id}>
                  <TableRow className="[&>td]:py-1 [&>td]:px-2">
                    <TableCell className="font-medium">
                      {isEditing ? (
                        <div className="space-y-1">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-7 min-w-[180px]"
                            placeholder="Nome do sócio"
                          />
                          <p className="text-[10px] leading-tight text-muted-foreground">
                            Altera o nome desta entidade em todo o sistema.
                          </p>
                        </div>
                      ) : (
                        p.suppliers?.name || "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {isEditing ? (
                        <Input
                          type="number" min="0" max={maxPct} step="0.1"
                          value={editPercentage}
                          onChange={(e) => setEditPercentage(e.target.value)}
                          className="h-7 w-20 text-right ml-auto"
                        />
                      ) : (
                        <>{Number(p.percentage).toFixed(1)}%</>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {isEditing ? (
                        <Input
                          type="number" min="0" max="100" step="0.1"
                          value={editLossPercentage}
                          onChange={(e) => setEditLossPercentage(e.target.value)}
                          className="h-7 w-20 text-right ml-auto"
                          placeholder="Igual"
                        />
                      ) : (
                        hasLoss ? <>{Number(p.loss_percentage).toFixed(1)}%</> : <span className="text-muted-foreground text-xs">Igual</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {isEditing ? (
                        <div className="space-y-1">
                          <Select value={editIvaBasis} onValueChange={(v) => setEditIvaBasis(v as any)}>
                            <SelectTrigger className="h-7 w-[190px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="inherit">Herda do evento</SelectItem>
                              <SelectItem value="gross">Apura c/IVA</SelectItem>
                              <SelectItem value="net">Apura s/IVA</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-[10px] leading-tight text-muted-foreground">
                            Um sócio com sede fora de Portugal não recupera o IVA: o custo dele é o valor c/IVA. Esta regra é contratual e não muda com o seletor de vista do Fecho.
                          </p>
                        </div>
                      ) : (
                        <span
                          className="text-xs"
                          title={describePartnerExpenseBasis(event?.partner_calc_basis, p.expense_includes_iva)}
                        >
                          {partnerUsesGrossExpenses(event?.partner_calc_basis, p.expense_includes_iva) ? "c/IVA" : "s/IVA"}
                          {(p.expense_includes_iva === null || p.expense_includes_iva === undefined) && (
                            <span className="ml-1 text-[10px] text-muted-foreground">(herda)</span>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {isEditing ? (
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-xs text-foreground">
                            <Switch checked={editCanOrder} onCheckedChange={setEditCanOrder} />
                            Pode ser ordenador de despesas
                          </label>
                          <label className="flex items-center gap-2 text-xs text-foreground">
                            <Switch checked={editCanPay} onCheckedChange={setEditCanPay} />
                            Pode ser pagador de despesas
                          </label>
                          <p className="text-[10px] leading-tight text-muted-foreground">
                            Não confundir com "Pago pelo Sócio" nas transações: esse é o registo pontual de um desembolso e continua disponível para qualquer sócio, mesmo sem esta opção ligada.
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {p.can_order && <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">Ordenador</span>}
                          {p.can_pay && <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">Pagador</span>}
                          {!p.can_order && !p.can_pay && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {isEditing ? (
                        <Input
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="h-7"
                          placeholder="Observações..."
                        />
                      ) : (
                        p.notes || "—"
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          {isEditing ? (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7"
                                onClick={() => updatePartner.mutate({ id: p.id, supplier_id: p.supplier_id, name: editName, originalName: p.suppliers?.name || "", percentage: Number(editPercentage), loss_percentage: editLossPercentage ? Number(editLossPercentage) : null, notes: editNotes, can_order: editCanOrder, can_pay: editCanPay, expense_includes_iva: editIvaBasis === "inherit" ? null : editIvaBasis === "gross" })}
                                disabled={!editName.trim() || !editPercentage || Number(editPercentage) <= 0 || updatePartner.isPending}
                              >
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7"
                                onClick={() => { setEditingId(p.id); setEditName(p.suppliers?.name || ""); setEditPercentage(String(p.percentage)); setEditLossPercentage(p.loss_percentage != null ? String(p.loss_percentage) : ""); setEditNotes(p.notes || ""); setEditCanOrder(!!p.can_order); setEditCanPay(!!p.can_pay); setEditIvaBasis(p.expense_includes_iva === null || p.expense_includes_iva === undefined ? "inherit" : (p.expense_includes_iva ? "gross" : "net")); }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removePartner.mutate(p.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={canEdit ? 7 : 6} className="pt-0 pb-2 px-2">
                      <PartnerExtrasPanel
                        partnerId={p.id}
                        partnerName={p.suppliers?.name || "Sócio"}
                        eventId={eventId}
                        canEdit={canEdit}
                      />
                    </TableCell>
                  </TableRow>
                  </React.Fragment>
                );
              })}
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
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Parceiro / Sócio</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      options={availableSuppliers.map((s: any) => ({ value: s.id, label: s.name }))}
                      value={selectedSupplier}
                      onValueChange={setSelectedSupplier}
                      placeholder="Selecionar fornecedor..."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewSupplier(true)}
                    className="rounded-lg border border-border bg-background p-2 hover:bg-secondary transition-colors"
                    title="Cadastrar novo fornecedor"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                    <SupplierFormModal
                      open={showNewSupplier}
                      onOpenChange={setShowNewSupplier}
                      onCreated={(id) => setSelectedSupplier(id)}
                      defaultIsPartner
                    />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">% no Lucro</Label>
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
              <div className="space-y-1.5">
                <Label className="text-xs">% no Prejuízo (opcional)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={lossPercentage}
                  onChange={(e) => setLossPercentage(e.target.value)}
                  placeholder="Igual ao lucro"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notas (opcional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações..." />
            </div>
            <div className="space-y-2 rounded-lg border border-border/50 p-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={canOrder} onCheckedChange={setCanOrder} />
                Pode ser ordenador de despesas
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={canPay} onCheckedChange={setCanPay} />
                Pode ser pagador de despesas
              </label>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Não confundir com "Pago pelo Sócio" nas transações: esse é o registo pontual de um desembolso e continua disponível para qualquer sócio, mesmo sem esta opção ligada.
              </p>
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
            Mundo Propício com {(100 - totalPercentage).toFixed(1)}% do resultado.
          </p>
        )}
      </div>
    </div>
  );
}
