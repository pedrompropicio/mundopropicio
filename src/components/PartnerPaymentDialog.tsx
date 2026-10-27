/**
 * P7a — «Pagamento do sócio» (padrão do modal Cachê).
 * Congelar/descongelar a negociação, estado, até 4 contratos e ligar adiantamentos.
 * Só consome RPCs já em Live; a parte vem SEMPRE do motor do fecho.
 * Limitação: o servidor aceita o share_amount enviado pelo cliente (sem recálculo).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { useEventSettlementEngine } from "@/hooks/useEventSettlementEngine";
import {
  MAX_PARTNER_CONTRACTS, buildFreezeValues, emptyContractForm, partnerContractsApi, validateContractForm,
  type ContractForm, type PartnerContractStatus,
} from "@/lib/partner-contracts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  participantId: string;
  supplierId: string;
  partnerName: string;
}

export function PartnerPaymentDialog({ open, onOpenChange, eventId, participantId, supplierId, partnerName }: Props) {
  const qc = useQueryClient();
  const engine = useEventSettlementEngine(eventId);
  const engineParticipant = useMemo(
    () => engine.result?.nodes.flatMap((n) => n.participants).find((p) => p.id === participantId) ?? null,
    [engine.result, participantId],
  );

  const { data: row, refetch: refetchRow } = useQuery({
    queryKey: ["partner-payment-participant", participantId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("event_settlement_participants")
        .select("id, mode, frozen_at, frozen_values, freeze_note").eq("id", participantId).single();
      if (error) throw error;
      return data as any;
    },
  });
  const frozen = !!row?.frozen_at;

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["partner-contract-status", participantId],
    enabled: open && frozen,
    queryFn: () => partnerContractsApi.status(participantId),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["partner-payment-suppliers"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    void refetchRow(); void refetchStatus();
    qc.invalidateQueries({ queryKey: ["event-settlement-participants", eventId] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };
  const onErr = (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" });

  const [note, setNote] = useState("");
  const [confirmFreeze, setConfirmFreeze] = useState(false);
  const [unfreezeReason, setUnfreezeReason] = useState("");
  const [form, setForm] = useState<ContractForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState("");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [attachFor, setAttachFor] = useState<string | null>(null);
  const [attachConfirm, setAttachConfirm] = useState(false);

  const freezeMut = useMutation({
    mutationFn: () => {
      if (!engineParticipant) throw new Error("O motor ainda não calculou a parte deste sócio.");
      return partnerContractsApi.freeze(participantId, engineParticipant, note);
    },
    onSuccess: () => { toast({ title: "Sócio congelado" }); setConfirmFreeze(false); setNote(""); refresh(); },
    onError: onErr,
  });
  const unfreezeMut = useMutation({
    mutationFn: () => partnerContractsApi.unfreeze(participantId, unfreezeReason.trim()),
    onSuccess: () => { toast({ title: "Sócio descongelado" }); setUnfreezeReason(""); refresh(); },
    onError: onErr,
  });
  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form) return;
      return editingId ? partnerContractsApi.update(editingId, form) : partnerContractsApi.create(participantId, form, formKey);
    },
    onSuccess: () => { toast({ title: editingId ? "Contrato alterado" : "Contrato criado" }); setForm(null); setEditingId(null); refresh(); },
    onError: onErr,
  });
  const cancelMut = useMutation({
    mutationFn: () => partnerContractsApi.cancel(cancelId!, cancelReason.trim()),
    onSuccess: () => { toast({ title: "Contrato cancelado" }); setCancelId(null); setCancelReason(""); refresh(); },
    onError: onErr,
  });
  const attachMut = useMutation({
    mutationFn: (advanceId: string) => partnerContractsApi.attach(attachFor!, advanceId, attachConfirm),
    onSuccess: () => { toast({ title: "Adiantamento ligado" }); setAttachFor(null); setAttachConfirm(false); refresh(); },
    onError: onErr,
  });

  const st = status as PartnerContractStatus | undefined;
  const contracts = st?.contracts ?? [];
  const freeAdvances = st?.free_advances ?? [];
  const editing = editingId ? contracts.find((c) => c.id === editingId) : null;
  const advancesTotal = form ? freeAdvances.filter((a) => form.advanceIds.includes(a.id)).reduce((s, a) => s + Number(a.amount), 0) : 0;
  const formError = form && st ? validateContractForm(form, {
    available: Number(st.remaining) + Number(editing?.gross ?? 0),
    activeCount: contracts.length, replacing: !!editingId, advancesTotal,
  }) : null;
  const supplierName = (id: string) => (suppliers as any[]).find((s) => s.id === id)?.name ?? "—";
  const freezePreview = engineParticipant ? buildFreezeValues(engineParticipant) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Pagamento do sócio — {partnerName}</DialogTitle>
          <DialogDescription>Congelar a parte do motor do fecho e definir até {MAX_PARTNER_CONTRACTS} contratos de pagamento.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
          {/* Passo 1 — congelar */}
          <section className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">1. Congelar parte</h4>
              {frozen ? <Badge>Congelado</Badge> : <Badge variant="outline">Por congelar</Badge>}
            </div>
            {frozen ? (
              <>
                <p className="text-sm">Parte congelada: <span className="font-mono">{formatCurrency(Number(row?.frozen_values?.share_amount ?? 0))}</span>
                  {row?.freeze_note ? <span className="text-muted-foreground"> · {row.freeze_note}</span> : null}</p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1"><Label className="text-xs">Motivo para descongelar</Label>
                    <Input value={unfreezeReason} onChange={(e) => setUnfreezeReason(e.target.value)} /></div>
                  <Button variant="outline" size="sm" disabled={!unfreezeReason.trim() || unfreezeMut.isPending} onClick={() => unfreezeMut.mutate()}>Descongelar</Button>
                </div>
                {contracts.length > 0 && <p className="text-xs text-muted-foreground">Com contratos ativos não se descongela: cancele-os primeiro.</p>}
              </>
            ) : !freezePreview ? (
              <p className="text-sm text-muted-foreground">{engine.isLoading ? "A calcular pelo motor do fecho…" : "O motor não devolveu este sócio."}</p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-4 text-sm">
                  <dt className="text-muted-foreground">Parte (motor, {freezePreview.uses_gross_expenses ? "c/IVA" : "s/IVA"})</dt><dd className="font-mono text-right">{formatCurrency(freezePreview.share_amount)}</dd>
                  <dt className="text-muted-foreground">% aplicada</dt><dd className="font-mono text-right">{freezePreview.effective_pct}%</dd>
                  <dt className="text-muted-foreground">Pagas pelo sócio</dt><dd className="font-mono text-right">{formatCurrency(freezePreview.paid_by_partner)}</dd>
                  <dt className="text-muted-foreground">Extras</dt><dd className="font-mono text-right">{formatCurrency(freezePreview.extras)}</dd>
                  <dt className="text-muted-foreground">Acerto (informativo)</dt><dd className="font-mono text-right">{formatCurrency(freezePreview.settlement_amount)}</dd>
                </dl>
                <p className="text-[11px] text-muted-foreground">Valores calculados pelo motor do fecho, não editáveis. O servidor aceita a parte enviada por este ecrã (não a recalcula).</p>
                <Label className="text-xs">Nota</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={confirmFreeze} onCheckedChange={(v) => setConfirmFreeze(!!v)} /> Confirmo congelar estes valores</label>
                <Button size="sm" disabled={!confirmFreeze || freezeMut.isPending} onClick={() => freezeMut.mutate()}>Congelar</Button>
              </>
            )}
          </section>

          {frozen && st && (
            <>
              <section className="grid grid-cols-4 gap-2 text-center text-xs">
                {([["Contratado", st.contracted], ["Pago", st.paid], ["Em falta", st.missing], ["Restante", st.remaining]] as const).map(([k, v]) => (
                  <div key={k} className="rounded-md border border-border p-2"><div className="text-muted-foreground">{k}</div><div className="font-mono text-sm">{formatCurrency(Number(v))}</div></div>
                ))}
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">2. Contratos ({contracts.length}/{MAX_PARTNER_CONTRACTS})</h4>
                  <Button size="sm" variant="outline" disabled={contracts.length >= MAX_PARTNER_CONTRACTS || !!form}
                    onClick={() => { setEditingId(null); setFormKey(crypto.randomUUID()); setForm({ ...emptyContractForm(supplierId), gross: Number(st.remaining) > 0 ? String(st.remaining) : "" }); }}>
                    Novo contrato
                  </Button>
                </div>
                {contracts.map((c) => (
                  <div key={c.id} className="rounded-md border border-border p-2 text-sm space-y-1">
                    <div className="flex justify-between gap-2">
                      <span>{c.label || "Contrato"} · {supplierName(c.beneficiary_supplier_id)}</span>
                      <span className="font-mono">{formatCurrency(Number(c.gross))}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Vence {c.due_date}{c.withholding_applies ? ` · retenção ${c.withholding_rate}% = ${formatCurrency(Number(c.withholding_amount))} (até ${c.withholding_due_date})` : " · sem retenção"}
                      {Number(c.advances_amount) > 0 ? ` · adiantamentos ${formatCurrency(Number(c.advances_amount))}` : ""}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" disabled={!!form} onClick={() => { setEditingId(c.id); setForm({
                        beneficiaryId: c.beneficiary_supplier_id, gross: String(c.gross), withholding: c.withholding_applies,
                        whRate: c.withholding_rate != null ? String(c.withholding_rate) : "", whDue: c.withholding_due_date ?? "",
                        due: c.due_date, label: c.label ?? "", advanceIds: [] }); }}>Alterar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAttachFor(c.id)} disabled={freeAdvances.length === 0}>Ligar adiantamento</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelId(c.id)}>Cancelar</Button>
                    </div>
                    {cancelId === c.id && (
                      <div className="flex gap-2 items-end">
                        <div className="flex-1"><Label className="text-xs">Motivo do cancelamento</Label><Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></div>
                        <Button size="sm" variant="destructive" disabled={!cancelReason.trim() || cancelMut.isPending} onClick={() => cancelMut.mutate()}>Confirmar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setCancelId(null)}>Voltar</Button>
                      </div>
                    )}
                    {attachFor === c.id && (
                      <div className="space-y-1 rounded border border-border p-2">
                        {freeAdvances.map((a) => (
                          <div key={a.id} className="flex items-start justify-between gap-2">
                            <span className="whitespace-normal break-words text-xs">{a.date} · {a.description}</span>
                            <span className="flex items-center gap-2 shrink-0"><span className="font-mono text-xs">{formatCurrency(Number(a.amount))}</span>
                              <Button size="sm" variant="outline" disabled={attachMut.isPending} onClick={() => attachMut.mutate(a.id)}>Ligar</Button></span>
                          </div>
                        ))}
                        <label className="flex items-center gap-2 text-xs"><Checkbox checked={attachConfirm} onCheckedChange={(v) => setAttachConfirm(!!v)} /> Confirmo, mesmo que o beneficiário seja diferente</label>
                        <Button size="sm" variant="ghost" onClick={() => setAttachFor(null)}>Fechar</Button>
                      </div>
                    )}
                  </div>
                ))}
              </section>

              {form && (
                <section className="rounded-lg border border-primary/30 p-3 space-y-2">
                  <h4 className="text-sm font-semibold">{editingId ? "Alterar contrato (cancela e recria)" : "Novo contrato"}</h4>
                  <div><Label className="text-xs">Beneficiário *</Label>
                    <SearchableSelect value={form.beneficiaryId} onValueChange={(v: string) => setForm({ ...form, beneficiaryId: v })}
                      options={(suppliers as any[]).map((s) => ({ value: s.id, label: s.name }))} placeholder="Escolher…" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Valor bruto (€) *</Label><Input type="number" step="0.01" value={form.gross} onChange={(e) => setForm({ ...form, gross: e.target.value })} /></div>
                    <div><Label className="text-xs">Vencimento *</Label><DatePicker value={form.due} onChange={(d) => setForm({ ...form, due: d })} /></div>
                  </div>
                  <div><Label className="text-xs">Retenção na fonte? *</Label>
                    <RadioGroup value={form.withholding === null ? "" : form.withholding ? "yes" : "no"} onValueChange={(v) => setForm({ ...form, withholding: v === "yes", ...(v === "no" ? { whRate: "", whDue: "" } : {}) })} className="flex gap-4">
                      <label className="flex items-center gap-1 text-sm"><RadioGroupItem value="yes" /> Sim</label>
                      <label className="flex items-center gap-1 text-sm"><RadioGroupItem value="no" /> Não</label>
                    </RadioGroup></div>
                  {form.withholding && (
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">Taxa (%) *</Label><Input type="number" step="0.01" value={form.whRate} onChange={(e) => setForm({ ...form, whRate: e.target.value })} /></div>
                      <div><Label className="text-xs">Data da retenção *</Label><DatePicker value={form.whDue} onChange={(d) => setForm({ ...form, whDue: d })} /></div>
                    </div>
                  )}
                  <div><Label className="text-xs">Etiqueta</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
                  {freeAdvances.length > 0 && (
                    <div className="space-y-1"><Label className="text-xs">Adiantamentos livres a abater (inteiros)</Label>
                      {freeAdvances.map((a) => (
                        <label key={a.id} className="flex items-start justify-between gap-2 text-xs">
                          <span className="flex items-start gap-2"><Checkbox checked={form.advanceIds.includes(a.id)} onCheckedChange={(v) => setForm({ ...form, advanceIds: v ? [...form.advanceIds, a.id] : form.advanceIds.filter((x) => x !== a.id) })} />
                            <span className="whitespace-normal break-words">{a.date} · {a.description}</span></span>
                          <span className="font-mono shrink-0">{formatCurrency(Number(a.amount))}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {formError && <p className="text-xs text-destructive">{formError}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!!formError || saveMut.isPending} onClick={() => saveMut.mutate()}>{editingId ? "Guardar alteração" : "Criar contrato"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setForm(null); setEditingId(null); }}>Cancelar</Button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
