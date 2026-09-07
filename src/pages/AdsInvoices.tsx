import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, CheckCircle2, AlertTriangle, Lock, Unlock, FileDown, ChevronsUpDown, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

interface AdsInvoiceRow {
  id: string;
  company_id: string;
  platform: string;
  invoice_number: string;
  billing_period: string;
  issue_date: string | null;
  total_amount: number;
  lines_sum: number | null;
  source: string;
  status: string;
  parent_transaction_id: string | null;
  confirmed_at: string | null;
  applied_at: string | null;
  reopen_count: number | null;
}

interface AdsInvoiceLineRow {
  id: string;
  line_no: number;
  raw_description: string;
  placement: string | null;
  campaign_name: string | null;
  event_id: string | null;
  match_source: string;
  match_note: string | null;
  matched_by: string | null;
  matched_at: string | null;
  amount: number;
  is_adjustment: boolean;
}

interface EventOption {
  id: string;
  name: string;
  parent_event_id: string | null;
  eligible: boolean;
  isChild: boolean;
}

const platformLabels: Record<string, string> = { meta: "Meta", google: "Google" };
const statusLabels: Record<string, string> = {
  proposed: "Proposta",
  confirmed: "Confirmada",
  applied: "Aplicada",
  cancelled: "Cancelada",
};

/** Rótulos legíveis dos impedimentos devolvidos pela reversão. */
const blockerKindLabels: Record<string, string> = {
  pago: "Pago",
  fecho_bilheteira: "Fecho de bilheteira",
  sessao_cartao: "Sessão de cartão",
  parcela_registada: "Parcela registada",
  lista_pagamento: "Lista de pagamento",
  nota_reembolso: "Nota de reembolso",
  nota_reembolso_pagamento: "Pagamento de nota de reembolso",
  conferencia_contabilista: "Conferência do contabilista",
  exportado_contabilidade: "Exportado para a contabilidade",
};

function periodLabel(d: string) {
  const [y, m] = d.split("-");
  return `${m}/${y}`;
}

function monthBounds(billingPeriod: string) {
  const [y, m] = billingPeriod.split("-").map(Number);
  const start = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

function reconciles(total: number, sum: number | null) {
  if (sum === null) return false;
  return Math.abs(Number(total) - Number(sum)) < 0.005;
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
}

export default function AdsInvoices() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<any[] | null>(null);
  const [revertBlockers, setRevertBlockers] = useState<any[] | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [revertConfirmText, setRevertConfirmText] = useState("");
  const queryClient = useQueryClient();

  // O card vermelho pertence a uma fatura; ao trocar de fatura tem de sair.
  useEffect(() => {
    setBlocked(null);
    setRevertBlockers(null);
    setRevertConfirmText("");
  }, [openId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ads-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["ads-invoice-detail"] });
    queryClient.invalidateQueries({ queryKey: ["ads-invoice-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["ads-invoice-lines-counts"] });
  };

  const callApply = async (action: "confirm" | "generate" | "reopen" | "revert", invoiceId: string) => {
    const { data, error } = await supabase.functions.invoke("ads-invoice-apply", {
      body: { action, invoice_id: invoiceId },
    });
    // A trava anti-duplicação e a recusa da reversão respondem 409 com a lista
    // do que encontraram: não é erro de execução, é informação para decidir.
    const ctx = (error as any)?.context;
    if (error) {
      let payload: any = null;
      try { payload = await ctx?.json?.(); } catch { /* sem corpo JSON */ }
      if (payload?.duplicate_block || payload?.revert_block) return payload;
      throw new Error(payload?.error ?? error.message);
    }
    if ((data as any)?.duplicate_block || (data as any)?.revert_block) return data as any;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const confirmMutation = useMutation({
    mutationFn: (invoiceId: string) => callApply("confirm", invoiceId),
    onSuccess: (data) => {
      toast.success(
        data?.already
          ? "Fatura já estava confirmada."
          : `Rateio confirmado. ${data?.campaigns_locked ?? 0} campanha(s) com vínculo trancado.`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateMutation = useMutation({
    mutationFn: (invoiceId: string) => callApply("generate", invoiceId),
    onSuccess: (data) => {
      if (data?.duplicate_block) {
        setBlocked(data.existing ?? []);
        toast.error("Geração recusada: já existem lançamentos para esta fatura.");
        return;
      }
      setBlocked(null);
      setRevertBlockers(null);
      toast.success(
        data?.already
          ? "Os lançamentos desta fatura já existem."
          : `Lançamentos criados: 1 mãe e ${(data?.transactions?.length ?? 1) - 1} por evento.`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reopenMutation = useMutation({
    mutationFn: (invoiceId: string) => callApply("reopen", invoiceId),
    onSuccess: (data) => {
      toast.success(
        `Rateio reaberto. ${data?.campaigns_unlocked ?? 0} campanha(s) com vínculo destrancado.`,
      );
      setReopenOpen(false);
      setBlocked(null);
      setRevertBlockers(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revertMutation = useMutation({
    mutationFn: (invoiceId: string) => callApply("revert", invoiceId),
    onSuccess: (data) => {
      if (data?.revert_block) {
        setRevertBlockers(data.blockers ?? []);
        setRevertOpen(false);
        toast.error("Reversão recusada: há impedimentos nos lançamentos.");
        return;
      }
      setBlocked(null);
      setRevertBlockers(null);
      setRevertOpen(false);
      setRevertConfirmText("");
      toast.success(
        `Revertido: ${data?.deleted_transactions ?? 0} lançamento(s) apagado(s), ${data?.files_deleted ?? 0} anexo(s) removido(s).`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markMutation = useMutation({
    mutationFn: async (v: { id: string; note: string | null }) => {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr || !auth?.user?.id) throw new Error("Não foi possível identificar o utilizador.");
      const stamp = { matched_by: auth.user.id, matched_at: new Date().toISOString() };
      const { error } = await supabase
        .from("ads_invoice_line")
        .update(
          v.note === null
            ? { match_source: "none", match_note: null, ...stamp }
            : { match_source: "fora_sistema", event_id: null, match_note: v.note, ...stamp },
        )
        .eq("id", v.id);
      if (error) throw error;
      return v;
    },
    onSuccess: (v) => {
      toast.success(v.note === null ? "Linha reposta por resolver." : "Linha marcada como fora do sistema.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignMutation = useMutation({
    mutationFn: async (v: { id: string; eventId: string }) => {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr || !auth?.user?.id) throw new Error("Não foi possível identificar o utilizador.");
      const { error } = await supabase
        .from("ads_invoice_line")
        .update({
          event_id: v.eventId,
          match_source: "manual",
          match_note: "atribuído à mão",
          matched_by: auth.user.id,
          matched_at: new Date().toISOString(),
        })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento atribuído.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["ads-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ads_invoice")
        .select(
          "id, company_id, platform, invoice_number, billing_period, issue_date, total_amount, lines_sum, source, status, parent_transaction_id, confirmed_at, applied_at, reopen_count",
        )
        .order("billing_period", { ascending: false })
        .order("platform");
      if (error) throw error;
      return (data ?? []) as AdsInvoiceRow[];
    },
  });

  const { data: allLines = [] } = useQuery({
    queryKey: ["ads-invoice-lines-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ads_invoice_line")
        .select("invoice_id, event_id, is_adjustment, match_source");
      if (error) throw error;
      return data ?? [];
    },
  });

  const missingByInvoice = new Map<string, number>();
  for (const l of allLines as any[]) {
    if (l.is_adjustment || l.event_id || l.match_source === "fora_sistema") continue;
    missingByInvoice.set(l.invoice_id, (missingByInvoice.get(l.invoice_id) ?? 0) + 1);
  }

  const { data: detail } = useQuery({
    queryKey: ["ads-invoice-detail", openId],
    enabled: !!openId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ads_invoice_line")
        .select(
          "id, line_no, raw_description, placement, campaign_name, event_id, match_source, match_note, matched_by, matched_at, amount, is_adjustment",
        )
        .eq("invoice_id", openId!)
        .order("line_no");
      if (error) throw error;
      return (data ?? []) as AdsInvoiceLineRow[];
    },
  });

  const openInvoice = invoices.find((i) => i.id === openId) ?? null;

  // Eventos elegíveis: mesmo critério do resolve_ads_event — activos da empresa
  // com janela de venda sobreposta ao mês faturado.
  const { data: eventOptions = [] } = useQuery({
    queryKey: ["ads-invoice-event-options", openInvoice?.company_id, openInvoice?.billing_period],
    enabled: !!openInvoice,
    queryFn: async (): Promise<EventOption[]> => {
      const inv = openInvoice!;
      const { start, end } = monthBounds(inv.billing_period);
      const [{ data: evs, error: ee }, { data: wins, error: we }] = await Promise.all([
        supabase.from("events").select("id, name, parent_event_id, status").eq("company_id", inv.company_id),
        supabase.rpc("ads_event_windows", { p_company_id: inv.company_id }),
      ]);
      if (ee) throw ee;
      if (we) throw we;
      const inWindow = new Set(
        ((wins ?? []) as any[])
          .filter((w) => w.win_start && w.win_end && w.win_start <= end && w.win_end >= start)
          .map((w) => w.event_id as string),
      );
      // O status faz parte do critério de elegibilidade, não é um corte prévio:
      // com o interruptor ligado tem de aparecer tudo, seja qual for o status.
      const all = (evs ?? []) as any[];
      const isEligible = (e: any) => e.status === "active" && inWindow.has(e.id);
      const byId = new Map(all.map((e) => [e.id, e]));
      const mothers = all
        .filter((e) => !e.parent_event_id || !byId.has(e.parent_event_id))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const out: EventOption[] = [];
      for (const m of mothers) {
        out.push({ id: m.id, name: m.name, parent_event_id: m.parent_event_id, eligible: isEligible(m), isChild: false });
        const kids = all
          .filter((e) => e.parent_event_id === m.id)
          .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        for (const k of kids) {
          out.push({ id: k.id, name: k.name, parent_event_id: k.parent_event_id, eligible: isEligible(k), isChild: true });
        }
      }
      return out;
    },
  });

  const lineEventIds = Array.from(new Set((detail ?? []).map((l) => l.event_id).filter(Boolean))) as string[];
  const { data: lineEvents = [] } = useQuery({
    queryKey: ["ads-invoice-events", lineEventIds.join(",")],
    enabled: lineEventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").in("id", lineEventIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const eventName = (id: string | null) => {
    if (!id) return "Por resolver";
    return (
      (lineEvents as any[]).find((e) => e.id === id)?.name ??
      eventOptions.find((e) => e.id === id)?.name ??
      "(sem nome)"
    );
  };

  const matcherIds = Array.from(new Set((detail ?? []).map((l) => l.matched_by).filter(Boolean))) as string[];
  const { data: matchers = [] } = useQuery({
    queryKey: ["ads-invoice-matchers", matcherIds.join(",")],
    enabled: matcherIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", matcherIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const matcherName = (id: string | null) =>
    id ? ((matchers as any[]).find((p) => p.id === id)?.full_name ?? null) : null;

  const { data: createdTx = [] } = useQuery({
    queryKey: ["ads-invoice-transactions", openInvoice?.parent_transaction_id],
    enabled: !!openInvoice?.parent_transaction_id,
    queryFn: async () => {
      const parentId = openInvoice!.parent_transaction_id!;
      const { data, error } = await supabase
        .from("transactions")
        .select("id, event_id, amount, parent_transaction_id")
        .or(`id.eq.${parentId},parent_transaction_id.eq.${parentId}`);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (openInvoice) {
    const lines = detail ?? [];
    const byEvent = new Map<string, number>();
    let adjustments = 0;
    let missing = 0;
    let outOfScope = 0;
    let outOfScopeLines = 0;
    for (const l of lines) {
      if (l.is_adjustment) { adjustments += Number(l.amount); continue; }
      if (l.match_source === "fora_sistema") {
        outOfScope += Number(l.amount);
        outOfScopeLines++;
        continue;
      }
      if (!l.event_id || l.match_source === "none") { missing++; continue; }
      byEvent.set(l.event_id, (byEvent.get(l.event_id) ?? 0) + Number(l.amount));
    }
    const allocation = Array.from(byEvent.entries()).sort((a, b) => b[1] - a[1]);
    const sumOk = reconciles(
      Number(openInvoice.total_amount),
      openInvoice.lines_sum === null ? null : Number(openInvoice.lines_sum),
    );
    const canConfirm = openInvoice.status === "proposed" && sumOk && missing === 0;
    const isConfirmed = openInvoice.status === "confirmed";
    const isApplied = openInvoice.status === "applied" || !!openInvoice.parent_transaction_id;
    const readOnly = isConfirmed || isApplied;

    return (
      <TooltipProvider>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">
              {platformLabels[openInvoice.platform] ?? openInvoice.platform} · {openInvoice.invoice_number}
            </h1>
            <p className="text-sm text-muted-foreground">
              Período {periodLabel(openInvoice.billing_period)} · total {formatCurrency(Number(openInvoice.total_amount))} ·
              soma das linhas {formatCurrency(Number(openInvoice.lines_sum ?? 0))}
              {readOnly && " · linhas só de leitura"}
              {Number(openInvoice.reopen_count ?? 0) > 0 && ` · reaberta ${openInvoice.reopen_count}×`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{statusLabels[openInvoice.status] ?? openInvoice.status}</Badge>
            {!isApplied && (
              <Button
                size="sm"
                disabled={!canConfirm || confirmMutation.isPending || isConfirmed}
                onClick={() => confirmMutation.mutate(openInvoice.id)}
              >
                <Lock className="mr-2 h-4 w-4" />
                {isConfirmed ? "Rateio confirmado" : "Confirmar rateio"}
              </Button>
            )}
            {isConfirmed && !isApplied && (
              <Button size="sm" variant="outline" disabled={reopenMutation.isPending} onClick={() => setReopenOpen(true)}>
                <Unlock className="mr-2 h-4 w-4" /> Reabrir rateio
              </Button>
            )}
            {(isConfirmed || isApplied) && (
              <Button
                size="sm"
                variant={isApplied ? "outline" : "default"}
                disabled={isApplied || generateMutation.isPending}
                onClick={() => generateMutation.mutate(openInvoice.id)}
              >
                <FileDown className="mr-2 h-4 w-4" />
                {isApplied ? "Lançamentos gerados" : "Gerar lançamentos"}
              </Button>
            )}
            {isApplied && (
              <Button
                size="sm"
                variant="destructive"
                disabled={revertMutation.isPending}
                onClick={() => { setRevertConfirmText(""); setRevertOpen(true); }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Reverter lançamentos
              </Button>
            )}
          </div>
        </div>

        <AlertDialog open={reopenOpen} onOpenChange={setReopenOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reabrir rateio</AlertDialogTitle>
              <AlertDialogDescription>
                Reabrir devolve a fatura ao estado proposto e destranca os vínculos das campanhas desta fatura.
                Não há lançamentos a afetar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); reopenMutation.mutate(openInvoice.id); }}
              >
                Reabrir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={revertOpen} onOpenChange={setRevertOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reverter lançamentos</AlertDialogTitle>
              <AlertDialogDescription>
                Isto apaga a transação-mãe e todas as filhas desta fatura, com os respetivos anexos, e devolve a
                fatura ao estado proposto. Não é reversível.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="revert-confirm" className="text-sm">
                Escreva o número da fatura ({openInvoice.invoice_number}) para confirmar
              </Label>
              <Input
                id="revert-confirm"
                value={revertConfirmText}
                onChange={(e) => setRevertConfirmText(e.target.value)}
                placeholder={openInvoice.invoice_number}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={revertConfirmText.trim() !== openInvoice.invoice_number || revertMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => { e.preventDefault(); revertMutation.mutate(openInvoice.id); }}
              >
                Reverter
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {!canConfirm && openInvoice.status === "proposed" && (
          <p className="text-sm text-warning">
            {missing > 0
              ? `Não é possível confirmar: ${missing} linha(s) sem evento resolvido.`
              : "Não é possível confirmar: a soma das linhas não bate com o total da fatura."}
          </p>
        )}

        {blocked && blocked.length > 0 && (
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-base text-destructive">
                Geração recusada — já existem lançamentos para esta fatura
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Não foi criado nada. Confirme se estes lançamentos já cobrem a fatura antes de decidir.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Lançamento</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blocked.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.date ?? "—"}</TableCell>
                      <TableCell>{t.event ?? "Fatura (sem evento)"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.invoice_ref || t.specification || "—"}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(t.amount))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {revertBlockers && revertBlockers.length > 0 && (
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-base text-destructive">
                Reversão recusada — os lançamentos desta fatura já estão em uso
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Nada foi apagado. Resolva estes pontos primeiro.</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Lançamento</TableHead>
                    <TableHead>Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revertBlockers.map((b, i) => (
                    <TableRow key={i}>
                      <TableCell>{blockerKindLabels[b.kind] ?? b.kind}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{b.transaction_id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[
                          b.status,
                          b.paid_amount ? formatCurrency(Number(b.paid_amount)) : null,
                          b.note,
                          b.period_from ? `export ${b.period_from} → ${b.period_to}` : null,
                          b.exported_at ? `entregue ${fmtDateTime(b.exported_at)}` : null,
                          b.transaction_date,
                          b.payment_list_id,
                          b.payment_id,
                          b.note_id,
                          b.settlement_id,
                          b.card_session_id,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {isApplied && createdTx.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lançamentos gerados</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lançamento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(createdTx as any[])
                    .sort((a, b) => (a.parent_transaction_id ? 1 : 0) - (b.parent_transaction_id ? 1 : 0))
                    .map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.event_id ? eventName(t.event_id) : "Fatura (sem evento)"}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(t.amount))}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}


        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rateio proposto por evento</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocation.map(([id, value]) => (
                  <TableRow key={id}>
                    <TableCell>{eventName(id)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(value)}</TableCell>
                  </TableRow>
                ))}
                {adjustments !== 0 && (
                  <TableRow>
                    <TableCell className="text-muted-foreground">Ajustes (cupões, taxas)</TableCell>
                    <TableCell className="text-right">{formatCurrency(adjustments)}</TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    Fora do sistema ({outOfScopeLines} linha{outOfScopeLines === 1 ? "" : "s"})
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(outOfScope)}</TableCell>
                </TableRow>
                {missing > 0 && (
                  <TableRow>
                    <TableCell className="text-warning">Linhas sem evento</TableCell>
                    <TableCell className="text-right text-warning">{missing}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalhe das linhas</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>Descrição na fatura</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead className="w-28">Origem</TableHead>
                  <TableHead>Porquê</TableHead>
                  <TableHead className="text-right w-28">Valor</TableHead>
                  <TableHead className="w-64" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.line_no}</TableCell>
                    <TableCell className="max-w-[520px] text-xs">{l.raw_description}</TableCell>
                    <TableCell className={l.event_id ? "" : "text-muted-foreground"}>
                      {l.is_adjustment ? "—" : eventName(l.event_id)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{l.match_source}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[240px] text-[11px] text-muted-foreground">
                      {l.match_note ? (
                        l.matched_at ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help underline decoration-dotted">{l.match_note}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {matcherName(l.matched_by)
                                ? `${matcherName(l.matched_by)} · ${fmtDateTime(l.matched_at)}`
                                : fmtDateTime(l.matched_at)}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          l.match_note
                        )
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(l.amount))}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {!readOnly && !l.is_adjustment && (
                          <EventPicker
                            options={eventOptions}
                            selectedId={l.event_id}
                            disabled={assignMutation.isPending}
                            onSelect={(eventId) => assignMutation.mutate({ id: l.id, eventId })}
                          />
                        )}
                        {!readOnly && !l.is_adjustment && l.match_source === "fora_sistema" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={markMutation.isPending}
                            onClick={() => markMutation.mutate({ id: l.id, note: null })}
                          >
                            Repor por resolver
                          </Button>
                        )}
                        {!readOnly && !l.is_adjustment && l.match_source !== "fora_sistema" && (
                          <MarkOutsideButton
                            disabled={markMutation.isPending}
                            onConfirm={(note) => markMutation.mutate({ id: l.id, note })}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Faturas Ads</h1>
        <p className="text-sm text-muted-foreground">
          Propostas de rateio das faturas de tráfego pago (Meta e Google).
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plataforma</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Soma das linhas</TableHead>
                <TableHead>Reconcilia</TableHead>
                <TableHead className="text-right">Sem evento</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">A carregar…</TableCell>
                </TableRow>
              )}
              {!isLoading && invoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Ainda não há faturas propostas.
                  </TableCell>
                </TableRow>
              )}
              {invoices.map((inv) => {
                const ok = reconciles(Number(inv.total_amount), inv.lines_sum === null ? null : Number(inv.lines_sum));
                const missing = missingByInvoice.get(inv.id) ?? 0;
                return (
                  <TableRow key={inv.id} className="cursor-pointer" onClick={() => setOpenId(inv.id)}>
                    <TableCell>{platformLabels[inv.platform] ?? inv.platform}</TableCell>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>{periodLabel(inv.billing_period)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(inv.total_amount))}</TableCell>
                    <TableCell className="text-right">
                      {inv.lines_sum === null ? "—" : formatCurrency(Number(inv.lines_sum))}
                    </TableCell>
                    <TableCell>
                      {ok ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 className="h-4 w-4" /> Sim
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-warning">
                          <AlertTriangle className="h-4 w-4" /> Não
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{missing}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{statusLabels[inv.status] ?? inv.status}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/** Combobox pesquisável de eventos, com interruptor para sair do período faturado. */
function EventPicker({
  options,
  selectedId,
  disabled,
  onSelect,
}: {
  options: EventOption[];
  selectedId: string | null;
  disabled?: boolean;
  onSelect: (eventId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const visible = useMemo(() => (showAll ? options : options.filter((o) => o.eligible)), [options, showAll]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} className="max-w-[180px] justify-between">
          <span className="truncate">{selectedId ? "Trocar evento" : "Escolher evento"}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Pesquisar evento…" />
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <Label htmlFor="show-all-events" className="text-xs text-muted-foreground">
              Mostrar todos os eventos
            </Label>
            <Switch id="show-all-events" checked={showAll} onCheckedChange={setShowAll} />
          </div>
          <CommandList>
            <CommandEmpty>Nenhum evento.</CommandEmpty>
            <CommandGroup>
              {visible.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.name} ${o.id}`}
                  onSelect={() => { onSelect(o.id); setOpen(false); }}
                >
                  <Check className={`mr-2 h-3.5 w-3.5 ${o.id === selectedId ? "opacity-100" : "opacity-0"}`} />
                  <span className={o.isChild ? "pl-4" : "font-medium"}>{o.name}</span>
                  {showAll && !o.eligible && (
                    <Badge variant="outline" className="ml-auto text-[10px]">fora do período</Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** "Marcar como fora do sistema" com nota obrigatória, sem window.prompt. */
function MarkOutsideButton({ disabled, onConfirm }: { disabled?: boolean; onConfirm: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("evento anterior ao sistema");
  return (
    <>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        Marcar como fora do sistema
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fora do sistema</AlertDialogTitle>
            <AlertDialogDescription>
              Porque é que esta linha não pertence a nenhum evento do sistema?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="motivo" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!note.trim()}
              onClick={(e) => { e.preventDefault(); onConfirm(note.trim()); setOpen(false); }}
            >
              Marcar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
