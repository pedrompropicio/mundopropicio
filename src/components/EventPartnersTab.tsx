/**
 * Aba "Sócios" — épica #146 (e) fase 2 (A).
 *
 * A partir daqui a fonte de verdade é `event_settlement_participants`.
 * `event_partners` passou a ser DERIVADA: o trigger
 * `trg_esp_sync_event_partners` reescreve-a a partir dos participantes com
 * `mode = 'settles'`. Nada nesta peça escreve em `event_partners`.
 *
 * A casa (Mundo Propício) é um participante `participant_kind = 'house'` no
 * apuramento raiz e é read-only aqui: a sua percentagem é 100 − Σ(sócios).
 */
import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { partnerUsesGrossExpenses, describePartnerExpenseBasis } from "@/lib/partner-calc-basis";
import { Trash2, Plus, Users, Info, Pencil, Check, X, Layers } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { PartnerExtrasPanel } from "@/components/PartnerExtrasPanel";
import { HOUSE_PARTNER_NAME } from "@/lib/settlement-participants";

interface Props {
  eventId: string;
  eventStatus: string;
}

type IvaBasis = "inherit" | "gross" | "net";

export function EventPartnersTab({ eventId, eventStatus }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin, isManager, hasPermission } = useAuth();
  const canEdit = (isAdmin || isManager || hasPermission("manage_bp")) && eventStatus !== "completed";

  const [showForm, setShowForm] = useState(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [newSettlementId, setNewSettlementId] = useState("");
  const [newMode, setNewMode] = useState<"settles" | "nominal">("settles");
  const [percentage, setPercentage] = useState("");
  const [lossPercentage, setLossPercentage] = useState("");
  const [notes, setNotes] = useState("");
  const [canOrder, setCanOrder] = useState(true);
  const [canPay, setCanPay] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSettlementId, setEditSettlementId] = useState("");
  const [editMode, setEditMode] = useState<"settles" | "nominal">("settles");
  const [editPercentage, setEditPercentage] = useState("");
  const [editLossPercentage, setEditLossPercentage] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editCanOrder, setEditCanOrder] = useState(false);
  const [editCanPay, setEditCanPay] = useState(false);
  const [editVisibleInDocs, setEditVisibleInDocs] = useState(true);
  const [editIvaBasis, setEditIvaBasis] = useState<IvaBasis>("inherit");

  const { data: event } = useQuery({
    queryKey: ["event-detail", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("partner_calc_basis").eq("id", eventId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: settlements = [] } = useQuery({
    queryKey: ["event-settlements", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_settlements")
        .select("id, name, parent_id, position, is_sealed")
        .eq("event_id", eventId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rootSettlement = useMemo(
    () => (settlements as any[]).find((s) => !s.parent_id) ?? null,
    [settlements],
  );

  const { data: participants = [] } = useQuery({
    queryKey: ["event-settlement-participants", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_settlement_participants")
        .select(
          "id, settlement_id, participant_kind, mode, profit_pct, loss_pct, expense_includes_iva, can_order, can_pay, visible_in_docs, notes, supplier_id, event_partner_id, created_at, suppliers(name)",
        )
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
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

  const partnerRows = useMemo(
    () => (participants as any[]).filter((p) => p.participant_kind === "partner"),
    [participants],
  );
  const houseRow = useMemo(
    () => (participants as any[]).find((p) => p.participant_kind === "house") ?? null,
    [participants],
  );

  const settlementName = (id: string) =>
    (settlements as any[]).find((s) => s.id === id)?.name ?? "—";

  // Inclui os `nominal`: também eles reduzem a quota da casa (#146 (e2) ponto 3).
  const totalPercentage = partnerRows.reduce(
    (sum: number, p: any) => sum + Number(p.profit_pct || 0),
    0,
  );


  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["event-settlement-participants", eventId] });
    queryClient.invalidateQueries({ queryKey: ["event-partners", eventId] });
    queryClient.invalidateQueries({ queryKey: ["event-settlements", eventId] });
  };

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

  const createRoot = useMutation({
    mutationFn: async () => {
      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("company_id")
        .eq("id", eventId)
        .single();
      if (evErr) throw evErr;
      const { data: root, error } = await supabase
        .from("event_settlements")
        .insert({ event_id: eventId, company_id: ev.company_id, name: "Fecho do evento" })
        .select("id")
        .single();
      if (error) throw error;
      const { error: houseErr } = await supabase.from("event_settlement_participants").insert({
        settlement_id: root.id,
        event_id: eventId,
        company_id: ev.company_id,
        participant_kind: "house",
        mode: "settles",
        profit_pct: 100,
        loss_pct: 100,
      });
      if (houseErr) throw houseErr;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Apuramento raiz criado" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  /**
   * Recalcula a quota da casa: 100 − Σ de TODOS os participantes `partner` da
   * raiz, incluindo os `nominal`. Se a casa absorvesse a quota nominal, o motor
   * contava-a duas vezes (declarada + nominalGap) e a C2 deixava de fechar.
   */
  const syncHouse = async () => {
    if (!houseRow || !rootSettlement) return;
    const { data: rows } = await supabase
      .from("event_settlement_participants")
      .select("profit_pct, loss_pct, mode, participant_kind")
      .eq("event_id", eventId)
      .eq("participant_kind", "partner");
    const sumProfit = (rows ?? []).reduce((s: number, r: any) => s + Number(r.profit_pct || 0), 0);
    const sumLoss = (rows ?? []).reduce(
      (s: number, r: any) => s + Number(r.loss_pct ?? r.profit_pct ?? 0),
      0,
    );
    await supabase
      .from("event_settlement_participants")
      .update({ profit_pct: 100 - sumProfit, loss_pct: 100 - sumLoss })
      .eq("id", houseRow.id);
  };


  const addParticipant = useMutation({
    mutationFn: async () => {
      const settlementId = newSettlementId || rootSettlement?.id;
      if (!settlementId) throw new Error("Este evento ainda não tem apuramento. Cria o apuramento raiz primeiro.");
      const { data: ev } = await supabase.from("events").select("company_id").eq("id", eventId).single();
      const { error } = await supabase.from("event_settlement_participants").insert({
        settlement_id: settlementId,
        event_id: eventId,
        company_id: ev?.company_id,
        participant_kind: "partner",
        supplier_id: selectedSupplier,
        mode: newMode,
        profit_pct: Number(percentage),
        loss_pct: lossPercentage ? Number(lossPercentage) : null,
        notes: notes || null,
        can_order: canOrder,
        can_pay: canPay,
      });
      if (error) throw error;
      await syncHouse();
    },
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setSelectedSupplier("");
      setNewSettlementId("");
      setNewMode("settles");
      setPercentage("");
      setLossPercentage("");
      setNotes("");
      setCanOrder(true);
      setCanPay(false);
      toast({ title: "Sócio adicionado ao apuramento" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const removeParticipant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_settlement_participants").delete().eq("id", id);
      if (error) throw error;
      await syncHouse();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Sócio removido do apuramento" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const updateParticipant = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await supabase
        .from("event_settlement_participants")
        .update({
          settlement_id: editSettlementId || row.settlement_id,
          mode: editMode,
          profit_pct: Number(editPercentage),
          loss_pct: editLossPercentage ? Number(editLossPercentage) : null,
          notes: editNotes || null,
          can_order: editCanOrder,
          can_pay: editCanPay,
          visible_in_docs: editVisibleInDocs,
          expense_includes_iva: editIvaBasis === "inherit" ? null : editIvaBasis === "gross",
        })
        .eq("id", row.id);
      if (error) throw error;
      const trimmed = editName.trim();
      const originalName = row.suppliers?.name || "";
      if (trimmed && trimmed !== originalName && row.supplier_id) {
        const { error: nameError } = await supabase
          .from("suppliers")
          .update({ name: trimmed })
          .eq("id", row.supplier_id);
        if (nameError) throw nameError;
      }
      await syncHouse();
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["suppliers-active"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setEditingId(null);
      toast({ title: "Participação atualizada" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const usedSupplierIds = partnerRows.map((p: any) => p.supplier_id);
  const availableSuppliers = (suppliers as any[]).filter((s: any) => !usedSupplierIds.includes(s.id));

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setEditName(p.suppliers?.name || "");
    setEditSettlementId(p.settlement_id);
    setEditMode(p.mode);
    setEditPercentage(String(p.profit_pct));
    setEditLossPercentage(p.loss_pct != null ? String(p.loss_pct) : "");
    setEditNotes(p.notes || "");
    setEditCanOrder(!!p.can_order);
    setEditCanPay(!!p.can_pay);
    setEditVisibleInDocs(p.visible_in_docs !== false);
    setEditIvaBasis(
      p.expense_includes_iva === null || p.expense_includes_iva === undefined
        ? "inherit"
        : p.expense_includes_iva
          ? "gross"
          : "net",
    );
  };

  const colCount = canEdit ? 9 : 8;

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

      {/* Participants list */}
      <div className="glass rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Sócios / Participações por apuramento</p>
            <span className="text-xs text-muted-foreground">({totalPercentage}% atribuído)</span>
          </div>
          {canEdit && !showForm && rootSettlement && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setNewSettlementId(rootSettlement.id);
                setShowForm(true);
              }}
              disabled={availableSuppliers.length === 0}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar
            </Button>
          )}
        </div>

        {!rootSettlement && (
          <div className="rounded-lg border border-border/50 bg-secondary/10 p-4 text-sm">
            <p className="text-muted-foreground">
              Este evento ainda não tem apuramento. Os sócios vivem dentro de um apuramento.
            </p>
            {canEdit && (
              <Button size="sm" className="mt-3" onClick={() => createRoot.mutate()} disabled={createRoot.isPending}>
                Criar apuramento raiz
              </Button>
            )}
          </div>
        )}

        {partnerRows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sócio</TableHead>
                <TableHead>Apuramento</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead className="text-right">% Lucro</TableHead>
                <TableHead className="text-right">% Prejuízo</TableHead>
                <TableHead>Base IVA</TableHead>
                <TableHead>BP</TableHead>
                <TableHead>Notas</TableHead>
                {canEdit && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {partnerRows.map((p: any) => {
                const isEditing = editingId === p.id;
                const otherTotal = partnerRows.reduce(
                  (sum: number, op: any) =>
                    op.id === p.id || op.mode !== "settles" ? sum : sum + Number(op.profit_pct || 0),
                  0,
                );
                const maxPct = 100 - otherTotal;
                const hasLoss = p.loss_pct !== null && p.loss_pct !== undefined;
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
                      <TableCell className="text-xs">
                        {isEditing ? (
                          <Select value={editSettlementId} onValueChange={setEditSettlementId}>
                            <SelectTrigger className="h-7 w-[180px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(settlements as any[]).map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Layers className="h-3 w-3 text-muted-foreground" />
                            {settlementName(p.settlement_id)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {isEditing ? (
                          <Select value={editMode} onValueChange={(v) => setEditMode(v as any)}>
                            <SelectTrigger className="h-7 w-[130px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="settles">Acerta aqui</SelectItem>
                              <SelectItem value="nominal">Nominal</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : p.mode === "settles" ? (
                          <Badge variant="secondary" className="text-[10px]">Acerta aqui</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Nominal</Badge>
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
                          <>{Number(p.profit_pct).toFixed(1)}%</>
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
                        ) : hasLoss ? (
                          <>{Number(p.loss_pct).toFixed(1)}%</>
                        ) : (
                          <span className="text-muted-foreground text-xs">Igual</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {isEditing ? (
                          <div className="space-y-1">
                            <Select value={editIvaBasis} onValueChange={(v) => setEditIvaBasis(v as IvaBasis)}>
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
                            <label className="flex items-center gap-2 text-xs text-foreground">
                              <Switch checked={editVisibleInDocs} onCheckedChange={setEditVisibleInDocs} />
                              Visível nos documentos deste apuramento
                            </label>
                            <p className="text-[10px] leading-tight text-muted-foreground">
                              Não confundir com "Pago pelo Sócio" nas transações: esse é o registo pontual de um desembolso e continua disponível para qualquer sócio, mesmo sem esta opção ligada.
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {p.can_order && <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">Ordenador</span>}
                            {p.can_pay && <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">Pagador</span>}
                            {p.visible_in_docs === false && <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">Oculto nos docs</span>}
                            {!p.can_order && !p.can_pay && p.visible_in_docs !== false && <span className="text-xs text-muted-foreground">—</span>}
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
                                  onClick={() => updateParticipant.mutate(p)}
                                  disabled={!editName.trim() || !editPercentage || Number(editPercentage) <= 0 || updateParticipant.isPending}
                                >
                                  <Check className="h-3.5 w-3.5 text-green-600" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(p)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeParticipant.mutate(p.id)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                    {p.event_partner_id && (
                      <TableRow>
                        <TableCell colSpan={colCount} className="pt-0 pb-2 px-2">
                          <PartnerExtrasPanel
                            partnerId={p.event_partner_id}
                            partnerName={p.suppliers?.name || "Sócio"}
                            eventId={eventId}
                            canEdit={canEdit}
                            calcBasis={event?.partner_calc_basis}
                            expenseIncludesIva={p.expense_includes_iva ?? null}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}

              {houseRow && (
                <TableRow className="[&>td]:py-1 [&>td]:px-2 bg-secondary/10">
                  <TableCell className="font-medium">
                    {HOUSE_PARTNER_NAME}
                    <Badge variant="outline" className="ml-2 text-[10px]">casa</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{settlementName(houseRow.settlement_id)}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="secondary" className="text-[10px]">Acerta aqui</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{Number(houseRow.profit_pct).toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-mono">
                    {houseRow.loss_pct != null ? `${Number(houseRow.loss_pct).toFixed(1)}%` : <span className="text-muted-foreground text-xs">Igual</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">—</TableCell>
                  <TableCell className="text-xs text-muted-foreground">—</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    Calculada: 100 − Σ(sócios). Não é editável.
                  </TableCell>
                  {canEdit && <TableCell />}
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {partnerRows.length === 0 && rootSettlement && !showForm && (
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
                <Label className="text-xs">Apuramento</Label>
                <Select value={newSettlementId} onValueChange={setNewSettlementId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                  <SelectContent>
                    {(settlements as any[]).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Modo</Label>
                <Select value={newMode} onValueChange={(v) => setNewMode(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="settles">Acerta aqui (é pago neste apuramento)</SelectItem>
                    <SelectItem value="nominal">Nominal (acerta noutro apuramento)</SelectItem>
                  </SelectContent>
                </Select>
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
                onClick={() => addParticipant.mutate()}
                disabled={!selectedSupplier || !newSettlementId || !percentage || Number(percentage) <= 0 || addParticipant.isPending}
              >
                Adicionar Sócio
              </Button>
            </div>
          </div>
        )}

        <p className="flex items-start gap-2 text-[11px] leading-snug text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          A lista de sócios do evento é agora derivada destes participantes: os que
          "acertam aqui" descem automaticamente para os seletores de ordenador/pagador
          do BP e das transações. A casa nunca desce.
        </p>
      </div>
    </div>
  );
}
