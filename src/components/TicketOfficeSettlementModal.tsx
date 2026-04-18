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
import { Loader2, Paperclip, X, FileText, AlertCircle, Plus, RefreshCw, Ticket, Receipt, Calculator, ArrowRightLeft, CheckCircle2, CalendarDays } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
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
  const [settlementDate, setSettlementDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [creditStatus, setCreditStatus] = useState<"credited" | "pending">("credited");
  const [expectedCreditDate, setExpectedCreditDate] = useState<string>("");

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
      setSettlementDate(existingSettlement.settlement_date ?? new Date().toISOString().slice(0, 10));
      // Detect credit status from existing transfer transaction
      (async () => {
        const { data } = await (supabase as any)
          .from("transactions")
          .select("id")
          .eq("settlement_id", existingSettlement.id);
        setSelectedTxnIds(new Set((data || []).map((t: any) => t.id)));
        if (existingSettlement.transfer_transaction_id) {
          const { data: tt } = await (supabase as any)
            .from("transactions")
            .select("status, expected_date")
            .eq("id", existingSettlement.transfer_transaction_id)
            .single();
          if (tt) {
            setCreditStatus(tt.status === "paid" ? "credited" : "pending");
            setExpectedCreditDate(tt.expected_date ?? "");
          }
        } else {
          setCreditStatus("credited");
          setExpectedCreditDate("");
        }
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
      setSettlementDate(new Date().toISOString().slice(0, 10));
      setCreditStatus("credited");
      setExpectedCreditDate("");
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
      // Receita = vendas registadas/importadas DESTA bilheteira para o evento.
      // Eventos com múltiplas bilheteiras geram fechos independentes por bilheteira.
      const { data: sales } = await supabase
        .from("ticket_sales")
        .select("quantity, unit_price, total_value")
        .in("zone_id", zoneIds)
        .eq("financial_account_id", officeId);
      return sumTicketSalesRevenue(sales || []);
    },
  });

  const grossRevenue = grossOverride !== "" ? Number(grossOverride) : grossAuto;

  // Sales log presence check — required to allow a settlement
  const { data: salesCount = 0, isLoading: salesCountLoading } = useQuery({
    queryKey: ["settlement_sales_count", officeId, eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .eq("event_id", eventId);
      const zoneIds = (zones || []).map((z: any) => z.id);
      if (zoneIds.length === 0) return 0;
      const { count } = await (supabase as any)
        .from("ticket_sales")
        .select("id", { count: "exact", head: true })
        .in("zone_id", zoneIds)
        .eq("financial_account_id", officeId);
      return count ?? 0;
    },
  });
  const hasSalesLog = salesCount > 0;

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

  // Pending advances for this event on this office (excluding any already linked to this settlement)
  const { data: pendingAdvances = [] } = useQuery({
    queryKey: ["settlement_advances", officeId, eventId, existingSettlement?.id],
    enabled: !!eventId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("event_ticket_office_advances")
        .select("*")
        .eq("financial_account_id", officeId)
        .eq("event_id", eventId)
        .order("advance_date", { ascending: true });
      const list = data || [];
      // Include unlinked OR linked to this settlement (when editing)
      return list.filter((a: any) =>
        !a.settlement_id || (existingSettlement && a.settlement_id === existingSettlement.id)
      );
    },
  });

  const totalAdvances = useMemo(
    () => pendingAdvances.reduce((s: number, a: any) => s + Number(a.amount), 0),
    [pendingAdvances]
  );

  const totalDeductions = useMemo(() => {
    return eligibleTxns
      .filter((t: any) => selectedTxnIds.has(t.id))
      .reduce((acc: number, t: any) => acc + Number(t.amount || 0), 0);
  }, [eligibleTxns, selectedTxnIds]);

  const netCalculated = grossRevenue - totalDeductions - totalAdvances;
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
    if (!hasSalesLog) {
      return toast.error("Sem registo de vendas", {
        description: "Só é possível fazer fecho de eventos com bilhetes vendidos registados nesta bilheteira. Importe ou registe as vendas antes de prosseguir.",
      });
    }
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
        settlement_date: settlementDate,
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
          update.payment_date = settlementDate;
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
                payment_date: settlementDate,
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
        const isCredited = creditStatus === "credited";
        const { data: transferTxn, error: tErr } = await (supabase as any)
          .from("transactions")
          .insert({
            type: "transfer",
            description: `Transferência fecho bilheteira ${officeName}${isCredited ? "" : " (a receber)"}`,
            amount: transferAmt,
            paid_amount: isCredited ? transferAmt : 0,
            status: isCredited ? "paid" : "pending",
            payment_date: isCredited ? settlementDate : null,
            expected_date: isCredited ? null : (expectedCreditDate || settlementDate),
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

      // Link advances to settlement (or unlink when reverting to draft)
      if (pendingAdvances.length > 0) {
        const advanceIds = pendingAdvances.map((a: any) => a.id);
        await (supabase as any)
          .from("event_ticket_office_advances")
          .update({ settlement_id: confirm ? settlementId : null })
          .in("id", advanceIds);
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
      queryClient.invalidateQueries({ queryKey: ["ticket_office_advances"] });
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

  // Progress indicators
  const stepDone = {
    event: !!eventId,
    revenue: !!eventId && grossRevenue > 0,
    deductions: !!eventId,
    net: !!eventId && (!hasAdjustment || !!adjustmentNotes.trim()),
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            {existingSettlement ? "Editar Fecho" : "Novo Fecho de Bilheteira"}
            <span className="text-muted-foreground font-normal">— {officeName}</span>
            {existingSettlement?.status === "confirmed" && (
              <Badge variant="default" className="ml-auto bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Confirmado
              </Badge>
            )}
            {existingSettlement?.status === "draft" && (
              <Badge variant="outline" className="ml-auto">Rascunho</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          <div className="space-y-6">
            {isEditingConfirmed && !isAdmin && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <span>Este fecho está confirmado. Apenas administradores podem editar.</span>
              </div>
            )}

            {/* STEP 1 — Event */}
            <section className="space-y-2">
              <StepHeader n={1} icon={<Ticket className="h-4 w-4" />} title="Evento e data do fecho" done={stepDone.event} />
              <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Evento</Label>
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
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" /> Data do fecho
                  </Label>
                  <DatePicker
                    value={settlementDate}
                    onChange={setSettlementDate}
                    disabled={!canEdit}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Esta data é usada como data de pagamento das despesas e da transferência ao confirmar.
              </p>
            </section>

            {eventId && !salesCountLoading && !hasSalesLog && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-destructive">Sem registo de vendas para este evento</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Só é possível fazer fecho de eventos que tenham bilhetes vendidos registados nesta bilheteira. Importe ou registe as vendas no Log de Vendas antes de criar o fecho.
                  </p>
                </div>
              </div>
            )}

            {eventId && hasSalesLog && (
              <>
                {/* STEP 2 — Gross revenue */}
                <section className="space-y-2">
                  <StepHeader n={2} icon={<Ticket className="h-4 w-4" />} title="Receita bruta de bilhetes (c/IVA)" done={stepDone.revenue} />
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-3xl font-mono font-bold text-emerald-500 tracking-tight">
                          {formatCurrency(grossRevenue)}
                        </p>
                        {grossOverride !== "" ? (
                          <p className="text-xs text-amber-500 mt-1">
                            Manual · auto: {formatCurrency(grossAuto)}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-1">Calculado das vendas registadas</p>
                        )}
                      </div>
                      {canEdit && grossOverride !== "" && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setGrossOverride("")}>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recalcular
                        </Button>
                      )}
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Ajustar receita bruta manualmente (opcional)
                      </Label>
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
                </section>

                {/* STEP 3 — Deductions */}
                <section className="space-y-2">
                  <StepHeader
                    n={3}
                    icon={<Receipt className="h-4 w-4" />}
                    title="Despesas pagas pela bilheteira (c/IVA)"
                    done={stepDone.deductions}
                    badge={selectedTxnIds.size > 0 ? `${selectedTxnIds.size} selecionada(s)` : undefined}
                  />
                  {canEdit && (
                    <div className="flex justify-end">
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowNewExpense(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Nova despesa
                      </Button>
                    </div>
                  )}
                  <div className="rounded-lg border border-border max-h-56 overflow-y-auto">
                    {eligibleTxns.length === 0 ? (
                      <p className="p-6 text-sm text-muted-foreground text-center">
                        Sem transações pendentes elegíveis. Use <strong>+ Nova despesa</strong> para registar.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {eligibleTxns.map((t: any) => {
                          const checked = selectedTxnIds.has(t.id);
                          return (
                            <li
                              key={t.id}
                              onClick={() => canEdit && toggleTxn(t.id)}
                              className={`flex items-center gap-3 p-3 text-sm cursor-pointer transition-colors ${
                                checked ? "bg-primary/5" : "hover:bg-muted/40"
                              }`}
                            >
                              <Checkbox
                                checked={checked}
                                onClick={(e) => e.stopPropagation()}
                                onCheckedChange={() => canEdit && toggleTxn(t.id)}
                                disabled={!canEdit}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{t.description}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {t.suppliers?.name ?? "—"}
                                  {t.account_categories?.code && ` · ${t.account_categories.code}`}
                                </p>
                              </div>
                              <span className="font-mono text-sm font-semibold whitespace-nowrap">
                                {formatCurrency(Number(t.amount))}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-sm pt-1">
                    <span className="text-muted-foreground">Total deduções</span>
                    <span className="font-mono font-bold text-red-400">− {formatCurrency(totalDeductions)}</span>
                  </div>
                </section>

                {/* STEP 3.5 — Advances received */}
                {pendingAdvances.length > 0 && (
                  <section className="space-y-2">
                    <StepHeader
                      n={4}
                      icon={<Banknote className="h-4 w-4" />}
                      title="Adiantamentos já recebidos"
                      badge={`${pendingAdvances.length}`}
                    />
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Valores que esta bilheteira já transferiu para este evento. São automaticamente abatidos do líquido a transferir.
                      </p>
                      <ul className="divide-y divide-border/60 rounded-md border border-border bg-background">
                        {pendingAdvances.map((a: any) => (
                          <li key={a.id} className="flex items-center gap-2 p-2 text-xs">
                            <span className="text-muted-foreground whitespace-nowrap">
                              {new Date(a.advance_date).toLocaleDateString("pt-PT")}
                            </span>
                            <span className="flex-1 truncate">{a.notes || "Adiantamento"}</span>
                            <span className="font-mono font-semibold text-amber-500 whitespace-nowrap">
                              − {formatCurrency(Number(a.amount))}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex justify-between items-center text-sm pt-1">
                        <span className="text-muted-foreground">Total adiantamentos</span>
                        <span className="font-mono font-bold text-amber-500">− {formatCurrency(totalAdvances)}</span>
                      </div>
                    </div>
                  </section>
                )}

                {/* STEP 4 — Net */}
                <section className="space-y-2">
                  <StepHeader n={pendingAdvances.length > 0 ? 5 : 4} icon={<Calculator className="h-4 w-4" />} title="Líquido a receber" done={stepDone.net} />
                  <div className="rounded-lg border border-border p-4 space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">
                        Bruto − Deduções{totalAdvances > 0 ? " − Adiantamentos" : ""}
                      </span>
                      <span className="font-mono font-semibold">{formatCurrency(netCalculated)}</span>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-border/60">
                      <Label className="text-xs text-muted-foreground">
                        Líquido recebido pelo banco (ajuste manual)
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={`Calculado: ${netCalculated.toFixed(2)}`}
                        value={adjustedNet}
                        onChange={(e) => setAdjustedNet(e.target.value)}
                        disabled={!canEdit}
                      />
                      {hasAdjustment && (
                        <Textarea
                          rows={2}
                          value={adjustmentNotes}
                          onChange={(e) => setAdjustmentNotes(e.target.value)}
                          placeholder="Justificação obrigatória: comissões extra, arredondamentos…"
                          disabled={!canEdit}
                          className="border-amber-500/40"
                        />
                      )}
                      {adjustedNet !== "" && !canEdit && (
                        <p className="text-xs text-muted-foreground">
                          Apenas administradores podem editar fechos confirmados.
                        </p>
                      )}
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-border">
                      <span className="text-sm font-semibold">Líquido final</span>
                      <span className={`font-mono font-bold text-2xl ${netFinal >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {formatCurrency(netFinal)}
                      </span>
                    </div>
                  </div>
                </section>

                {/* STEP 5 — Transfer (optional) */}
                <section className="space-y-2">
                  <StepHeader n={5} icon={<ArrowRightLeft className="h-4 w-4" />} title="Transferência para banco (opcional)" />
                  <div className="rounded-lg border border-border p-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Pode adiar — o líquido fica retido na bilheteira até transferência manual.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
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
                      <div className="space-y-1">
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

                    {transferAccountId && Number(transferAmount || 0) > 0 && (
                      <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                        <Label className="text-xs text-muted-foreground">Estado do crédito na conta destino</Label>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer transition-colors ${
                            creditStatus === "credited" ? "border-emerald-500/40 bg-emerald-500/5" : "border-border hover:bg-muted/40"
                          }`}>
                            <input
                              type="radio"
                              name="creditStatus"
                              value="credited"
                              checked={creditStatus === "credited"}
                              onChange={() => setCreditStatus("credited")}
                              disabled={!canEdit}
                              className="mt-0.5"
                            />
                            <div className="text-xs">
                              <p className="font-semibold">Já creditado</p>
                              <p className="text-muted-foreground">Movimento criado liquidado na data do fecho.</p>
                            </div>
                          </label>
                          <label className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer transition-colors ${
                            creditStatus === "pending" ? "border-amber-500/40 bg-amber-500/5" : "border-border hover:bg-muted/40"
                          }`}>
                            <input
                              type="radio"
                              name="creditStatus"
                              value="pending"
                              checked={creditStatus === "pending"}
                              onChange={() => setCreditStatus("pending")}
                              disabled={!canEdit}
                              className="mt-0.5"
                            />
                            <div className="text-xs">
                              <p className="font-semibold">A receber</p>
                              <p className="text-muted-foreground">Cria um movimento pendente. Confirme depois com a data real do crédito.</p>
                            </div>
                          </label>
                        </div>
                        {creditStatus === "pending" && (
                          <div className="space-y-1 pt-1">
                            <Label className="text-xs text-muted-foreground">Data prevista do crédito (opcional)</Label>
                            <DatePicker
                              value={expectedCreditDate}
                              onChange={setExpectedCreditDate}
                              disabled={!canEdit}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                {/* STEP 6 — Document & notes */}
                <section className="space-y-2">
                  <StepHeader n={6} icon={<Paperclip className="h-4 w-4" />} title="Comprovativo e notas (opcional)" />
                  <div className="rounded-lg border border-border p-4 space-y-3">
                    {existingDocUrl && !file ? (
                      <div className="flex items-center justify-between rounded-md bg-muted/40 p-2 text-sm">
                        <button type="button" onClick={downloadDoc} className="flex items-center gap-2 text-primary hover:underline">
                          <FileText className="h-4 w-4" />
                          {existingDocName ?? "Documento anexado"}
                        </button>
                        {canEdit && (
                          <button type="button" onClick={() => { setExistingDocUrl(null); setExistingDocName(null); }} className="text-muted-foreground hover:text-destructive">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <Input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        disabled={!canEdit}
                      />
                    )}
                    <Textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      disabled={!canEdit}
                      placeholder="Observações internas…"
                    />
                  </div>
                </section>

                {/* Sticky summary footer */}
                <div className="sticky bottom-0 -mx-6 -mb-5 px-6 py-3 bg-background/95 backdrop-blur border-t border-border">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Resumo</span>
                    <span>
                      <span className="text-emerald-500 font-mono">{formatCurrency(grossRevenue)}</span>
                      <span className="mx-1">−</span>
                      <span className="text-red-400 font-mono">{formatCurrency(totalDeductions)}</span>
                      <span className="mx-1">=</span>
                      <span className="text-foreground font-mono font-semibold">{formatCurrency(netFinal)}</span>
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border gap-2 flex-row">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          {canEdit && (
            <>
              <Button variant="secondary" onClick={() => handleSubmit(false)} disabled={submitting || !eventId || !hasSalesLog}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Guardar rascunho
              </Button>
              <Button onClick={() => handleSubmit(true)} disabled={submitting || !eventId || !hasSalesLog}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar fecho
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      {showNewExpense && (
        <TransactionFormModal
          onClose={() => {
            setShowNewExpense(false);
            queryClient.invalidateQueries({ queryKey: ["settlement_eligible_txns", officeId, eventId] });
          }}
        />
      )}
    </Dialog>
  );
}

function StepHeader({ n, icon, title, done, badge }: { n: number; icon: React.ReactNode; title: string; done?: boolean; badge?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-bold transition-colors ${
        done ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"
      }`}>
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
      </div>
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="text-sm font-semibold flex-1">{title}</h3>
      {badge && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
    </div>
  );
}

