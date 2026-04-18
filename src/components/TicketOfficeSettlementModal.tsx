import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/mock-data";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit, getAuditUser } from "@/lib/audit";
import { Loader2, Paperclip, X, FileText, AlertCircle, Plus, RefreshCw } from "lucide-react";
import { sumTicketSalesRevenue } from "@/lib/ticket-sales-revenue";
import { TransactionFormModal } from "@/components/TransactionFormModal";

interface Props {
  open: boolean;
  onClose: () => void;
  officeId: string;
  officeName: string;
  existingSettlement?: any | null;
}

export function TicketOfficeSettlementModal({ open, onClose, officeId, officeName, existingSettlement }: Props) {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const isEditingConfirmed = !!existingSettlement && existingSettlement.status === "confirmed";
  const canEdit = !existingSettlement || existingSettlement.status === "draft" || isAdmin;

  const [eventId, setEventId] = useState<string>("");
  const [selectedTxnIds, setSelectedTxnIds] = useState<Set<string>>(new Set());
  const [adjustedNet, setAdjustedNet] = useState<string>("");
  const [adjustmentNotes, setAdjustmentNotes] = useState("");
  const [transferAccountId, setTransferAccountId] = useState<string>("");
  const [transferAmount, setTransferAmount] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [existingDocUrl, setExistingDocUrl] = useState<string | null>(null);
  const [existingDocName, setExistingDocName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [grossOverride, setGrossOverride] = useState<string>("");
  const [showNewExpense, setShowNewExpense] = useState(false);

  // Reset/load when opening
  useEffect(() => {
    if (!open) return;
    if (existingSettlement) {
      setEventId(existingSettlement.event_id);
      setAdjustedNet(existingSettlement.net_adjusted != null ? String(existingSettlement.net_adjusted) : "");
      setAdjustmentNotes(existingSettlement.adjustment_notes ?? "");
      setTransferAccountId(existingSettlement.transfer_account_id ?? "");
      setTransferAmount(existingSettlement.net_transferred ? String(existingSettlement.net_transferred) : "");
      setNotes(existingSettlement.notes ?? "");
      setExistingDocUrl(existingSettlement.document_url ?? null);
      setExistingDocName(existingSettlement.document_name ?? null);
      // Load linked transactions
      (async () => {
        const { data } = await (supabase as any)
          .from("transactions")
          .select("id")
          .eq("settlement_id", existingSettlement.id);
        setSelectedTxnIds(new Set((data || []).map((t: any) => t.id)));
      })();
    } else {
      setEventId("");
      setSelectedTxnIds(new Set());
      setAdjustedNet("");
      setAdjustmentNotes("");
      setTransferAccountId("");
      setTransferAmount("");
      setNotes("");
      setFile(null);
      setExistingDocUrl(null);
      setExistingDocName(null);
      setGrossOverride("");
    }
  }, [open, existingSettlement]);

  // Eligible events for this office (assigned events without confirmed settlement)
  const { data: assignedEvents = [] } = useQuery({
    queryKey: ["settlement_eligible_events", officeId],
    enabled: open && !existingSettlement,
    queryFn: async () => {
      const { data: assigns, error } = await supabase
        .from("event_ticket_office_assignments")
        .select("event_id, events(id, name, date, status)")
        .eq("financial_account_id", officeId);
      if (error) throw error;
      const eventMap = new Map<string, any>();
      (assigns || []).forEach((a: any) => {
        if (a.events) eventMap.set(a.event_id, a.events);
      });
      const events = Array.from(eventMap.values());
      // Exclude events with confirmed settlement on this office
      const { data: confirmed } = await (supabase as any)
        .from("ticket_office_settlements")
        .select("event_id")
        .eq("financial_account_id", officeId)
        .eq("status", "confirmed");
      const used = new Set((confirmed || []).map((s: any) => s.event_id));
      return events.filter((e) => !used.has(e.id)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    },
  });

  // Gross revenue for selected event (c/IVA — usa total_value preservado da importação)
  const { data: grossAuto = 0 } = useQuery({
    queryKey: ["settlement_gross", officeId, eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .eq("event_id", eventId);
      if (!zones || zones.length === 0) return 0;
      const zoneIds = zones.map((z: any) => z.id);
      const { data: sales } = await supabase
        .from("ticket_sales")
        .select("quantity, unit_price, total_value, financial_account_id")
        .in("zone_id", zoneIds);
      const filtered = (sales || []).filter(
        (s: any) => !s.financial_account_id || s.financial_account_id === officeId
      );
      return sumTicketSalesRevenue(filtered);
    },
  });

  const grossRevenue = grossOverride !== "" ? Number(grossOverride) : grossAuto;

  // Eligible transactions: not-yet-paid expenses for the event (direct or via Master split),
  // already linked to this settlement, or unlinked. Excludes already 'paid' (liquidated elsewhere).
  const { data: eligibleTxns = [] } = useQuery({
    queryKey: ["settlement_eligible_txns", officeId, eventId, existingSettlement?.id],
    enabled: !!eventId,
    queryFn: async () => {
      const settlementFilter = `settlement_id.is.null,settlement_id.eq.${existingSettlement?.id ?? "00000000-0000-0000-0000-000000000000"}`;
      const cols = "id, description, amount, paid_amount, status, supplier_id, category_id, event_id, settlement_id, parent_transaction_id, split_amount, split_percentage, suppliers(name), account_categories(name, code)";

      // 1) Direct expenses for this event (Splits also live here with parent_transaction_id set)
      const { data: direct } = await (supabase as any)
        .from("transactions")
        .select(cols)
        .eq("event_id", eventId)
        .eq("type", "expense")
        .or(settlementFilter);

      // 2) Master transactions whose Splits reference this event (Master has event_id NULL)
      const { data: splits } = await (supabase as any)
        .from("transactions")
        .select("parent_transaction_id")
        .eq("event_id", eventId)
        .eq("type", "expense")
        .not("parent_transaction_id", "is", null);
      const masterIds = Array.from(new Set((splits || []).map((s: any) => s.parent_transaction_id).filter(Boolean)));
      let masterTxns: any[] = [];
      if (masterIds.length > 0) {
        const { data } = await (supabase as any)
          .from("transactions")
          .select(cols)
          .in("id", masterIds)
          .eq("type", "expense")
          .or(settlementFilter);
        masterTxns = data || [];
      }

      const all = [...(direct || []), ...masterTxns];
      const seen = new Set<string>();
      return all.filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        // Always keep transactions already linked to this settlement (when editing)
        if (existingSettlement && t.settlement_id === existingSettlement.id) return true;
        // Eligible: not yet liquidated (pending or approved). Exclude 'paid' and 'cancelled'.
        return t.status === "pending" || t.status === "approved";
      });
    },
  });

  // Transferable bank accounts
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["settlement_bank_accounts"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_accounts")
        .select("id, name, type")
        .in("type", ["bank", "cash"])
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const totalDeductions = useMemo(() => {
    return eligibleTxns
      .filter((t: any) => selectedTxnIds.has(t.id))
      .reduce((acc: number, t: any) => acc + Number(t.amount || 0), 0);
  }, [eligibleTxns, selectedTxnIds]);

  const netCalculated = grossRevenue - totalDeductions;
  const netFinal = adjustedNet !== "" ? Number(adjustedNet) : netCalculated;
  const hasAdjustment = adjustedNet !== "" && Math.abs(Number(adjustedNet) - netCalculated) > 0.01;

  const toggleTxn = (id: string) => {
    setSelectedTxnIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSubmit = async (confirm: boolean) => {
    if (!eventId) return toast.error("Selecione o evento");
    if (hasAdjustment && !adjustmentNotes.trim()) {
      return toast.error("Justifique o ajuste manual do líquido");
    }
    const transferAmt = transferAmount ? Number(transferAmount) : 0;
    if (transferAmt > 0 && !transferAccountId) {
      return toast.error("Selecione a conta destino da transferência");
    }

    setSubmitting(true);
    try {
      // Upload file if provided
      let docUrl = existingDocUrl;
      let docName = existingDocName;
      if (file) {
        const path = `${officeId}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("ticket-office-settlements")
          .upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        docUrl = path;
        docName = file.name;
      }

      const payload: any = {
        financial_account_id: officeId,
        event_id: eventId,
        gross_revenue: grossRevenue,
        total_deductions: totalDeductions,
        net_calculated: netCalculated,
        net_adjusted: hasAdjustment ? Number(adjustedNet) : null,
        adjustment_notes: hasAdjustment ? adjustmentNotes : null,
        net_transferred: transferAmt,
        transfer_account_id: transferAccountId || null,
        document_url: docUrl,
        document_name: docName,
        notes: notes || null,
        status: confirm ? "confirmed" : "draft",
      };
      if (confirm) {
        payload.closed_at = new Date().toISOString();
        payload.closed_by = user?.id;
      }

      let settlementId: string;
      if (existingSettlement) {
        const { error } = await (supabase as any)
          .from("ticket_office_settlements")
          .update(payload)
          .eq("id", existingSettlement.id);
        if (error) throw error;
        settlementId = existingSettlement.id;
      } else {
        const { data, error } = await (supabase as any)
          .from("ticket_office_settlements")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        settlementId = data.id;
      }

      // Unlink previously linked transactions not in current selection (admin edits)
      if (existingSettlement) {
        await (supabase as any)
          .from("transactions")
          .update({ settlement_id: null })
          .eq("settlement_id", settlementId)
          .not("id", "in", `(${Array.from(selectedTxnIds).map((id) => `"${id}"`).join(",") || '""'})`);
      }

      // Link selected transactions; if confirming, also mark as paid via this office
      if (selectedTxnIds.size > 0) {
        const ids = Array.from(selectedTxnIds);
        const update: any = { settlement_id: settlementId };
        if (confirm) {
          update.status = "paid";
          update.payment_date = new Date().toISOString().slice(0, 10);
          update.account_id = officeId;
        }
        // For 'paid' update we need each txn's amount as paid_amount
        if (confirm) {
          for (const t of eligibleTxns) {
            if (!selectedTxnIds.has(t.id)) continue;
            await (supabase as any)
              .from("transactions")
              .update({
                settlement_id: settlementId,
                status: "paid",
                payment_date: new Date().toISOString().slice(0, 10),
                account_id: officeId,
                paid_amount: Number(t.amount),
              })
              .eq("id", t.id);
          }
        } else {
          await (supabase as any)
            .from("transactions")
            .update({ settlement_id: settlementId })
            .in("id", ids);
        }
      }

      // Create transfer transaction if requested and confirming
      if (confirm && transferAmt > 0 && transferAccountId) {
        const { data: transferTxn, error: tErr } = await (supabase as any)
          .from("transactions")
          .insert({
            type: "transfer",
            description: `Transferência fecho bilheteira ${officeName}`,
            amount: transferAmt,
            paid_amount: transferAmt,
            status: "paid",
            payment_date: new Date().toISOString().slice(0, 10),
            account_id: officeId,
            target_account_id: transferAccountId,
            event_id: eventId,
            settlement_id: settlementId,
          })
          .select("id")
          .single();
        if (!tErr && transferTxn) {
          await (supabase as any)
            .from("ticket_office_settlements")
            .update({ transfer_transaction_id: transferTxn.id })
            .eq("id", settlementId);
        }
      }

      await logAudit({
        entity_type: "ticket_office_settlement",
        entity_id: settlementId,
        action: existingSettlement ? (confirm ? "confirm" : "update") : (confirm ? "create_confirmed" : "create_draft"),
        changed_by: getAuditUser(user),
        new_data: payload,
      });

      toast.success(confirm ? "Fecho confirmado" : "Rascunho guardado");
      queryClient.invalidateQueries({ queryKey: ["ticket_office_settlements"] });
      queryClient.invalidateQueries({ queryKey: ["ticket_office_balances"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onClose();
    } catch (err: any) {
      toast.error("Erro ao guardar fecho", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const downloadDoc = async () => {
    if (!existingDocUrl) return;
    const { data, error } = await supabase.storage
      .from("ticket-office-settlements")
      .createSignedUrl(existingDocUrl, 60);
    if (error) return toast.error("Erro ao abrir ficheiro");
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {existingSettlement
              ? `Editar Fecho — ${officeName}`
              : `Novo Fecho de Bilheteira — ${officeName}`}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-5">
            {isEditingConfirmed && !isAdmin && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                <span>Este fecho está confirmado. Apenas administradores podem editar.</span>
              </div>
            )}

            {/* Event selector */}
            <div className="space-y-2">
              <Label>Evento</Label>
              {existingSettlement ? (
                <Input value={existingSettlement.events?.name ?? eventId} disabled />
              ) : (
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  disabled={!canEdit}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Selecione um evento…</option>
                  {assignedEvents.map((ev: any) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name} {ev.date ? `(${ev.date})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {eventId && (
              <>
                {/* Gross revenue (c/IVA) */}
                <div className="rounded-lg bg-secondary/40 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Receita bruta de bilhetes (c/IVA)</p>
                      <p className="text-2xl font-mono font-bold text-emerald-500 mt-1">
                        {formatCurrency(grossRevenue)}
                      </p>
                      {grossOverride !== "" && (
                        <p className="text-xs text-amber-500 mt-1">
                          Manual — auto: {formatCurrency(grossAuto)}
                        </p>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setGrossOverride("")}
                        title="Recalcular das vendas"
                        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Ajuste manual da receita bruta (opcional)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={`Auto: ${grossAuto.toFixed(2)}`}
                      value={grossOverride}
                      onChange={(e) => setGrossOverride(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                {/* Eligible transactions */}
                <div className="space-y-2">
                  <Label>Despesas a deduzir (vincular pendentes)</Label>
                  <div className="rounded-lg border border-border max-h-64 overflow-y-auto">
                    {eligibleTxns.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground text-center">
                        Sem transações pendentes elegíveis para este evento.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="w-10 p-2"></th>
                            <th className="text-left p-2">Descrição</th>
                            <th className="text-left p-2">Fornecedor</th>
                            <th className="text-left p-2">Categoria</th>
                            <th className="text-right p-2">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eligibleTxns.map((t: any) => (
                            <tr key={t.id} className="border-t border-border hover:bg-muted/30">
                              <td className="p-2">
                                <Checkbox
                                  checked={selectedTxnIds.has(t.id)}
                                  onCheckedChange={() => canEdit && toggleTxn(t.id)}
                                  disabled={!canEdit}
                                />
                              </td>
                              <td className="p-2">{t.description}</td>
                              <td className="p-2 text-muted-foreground">{t.suppliers?.name ?? "—"}</td>
                              <td className="p-2 text-muted-foreground text-xs">
                                {t.account_categories?.code} {t.account_categories?.name}
                              </td>
                              <td className="p-2 text-right font-mono">{formatCurrency(Number(t.amount))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{selectedTxnIds.size} selecionada(s)</span>
                    <span className="font-mono font-semibold">Total: {formatCurrency(totalDeductions)}</span>
                  </div>
                </div>

                {/* Net calculation */}
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Líquido auto-calculado</span>
                    <span className="font-mono font-bold text-lg">{formatCurrency(netCalculated)}</span>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Ajuste manual do líquido (opcional)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={`Ex: ${netCalculated.toFixed(2)}`}
                      value={adjustedNet}
                      onChange={(e) => setAdjustedNet(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                  {hasAdjustment && (
                    <div className="space-y-2">
                      <Label className="text-xs text-amber-500">Justificação do ajuste *</Label>
                      <Textarea
                        rows={2}
                        value={adjustmentNotes}
                        onChange={(e) => setAdjustmentNotes(e.target.value)}
                        placeholder="Ex: arredondamentos, valores em trânsito, retidos…"
                        disabled={!canEdit}
                      />
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="text-sm font-semibold">Líquido final</span>
                    <span className={`font-mono font-bold text-lg ${netFinal >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                      {formatCurrency(netFinal)}
                    </span>
                  </div>
                </div>

                {/* Transfer (optional) */}
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <Label>Transferência líquida (opcional)</Label>
                  <p className="text-xs text-muted-foreground">
                    Pode adiar a transferência. O líquido fica retido na bilheteira até transferência manual.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Conta destino</Label>
                      <select
                        value={transferAccountId}
                        onChange={(e) => setTransferAccountId(e.target.value)}
                        disabled={!canEdit}
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">— Não transferir agora —</option>
                        {bankAccounts.map((a: any) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Valor a transferir</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        placeholder={netFinal.toFixed(2)}
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                </div>

                {/* Document upload */}
                <div className="space-y-2">
                  <Label>Anexar comprovativo do fecho</Label>
                  {existingDocUrl && !file && (
                    <div className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                      <button
                        type="button"
                        onClick={downloadDoc}
                        className="flex items-center gap-2 text-primary hover:underline"
                      >
                        <FileText className="h-4 w-4" />
                        {existingDocName ?? "Documento anexado"}
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => { setExistingDocUrl(null); setExistingDocName(null); }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                  {(!existingDocUrl || file) && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        disabled={!canEdit}
                      />
                      {file && (
                        <button type="button" onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Paperclip className="h-3 w-3" /> PDF, PNG ou JPG. Recomenda-se mapa de caixa assinado.
                  </p>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          {canEdit && (
            <>
              <Button variant="secondary" onClick={() => handleSubmit(false)} disabled={submitting || !eventId}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Guardar rascunho
              </Button>
              <Button onClick={() => handleSubmit(true)} disabled={submitting || !eventId}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirmar fecho
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
