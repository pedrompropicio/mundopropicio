import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, AlertTriangle, Lock, FileDown } from "lucide-react";
import { toast } from "sonner";

interface AdsInvoiceRow {
  id: string;
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
  amount: number;
  is_adjustment: boolean;
}

const platformLabels: Record<string, string> = { meta: "Meta", google: "Google" };
const statusLabels: Record<string, string> = {
  proposed: "Proposta",
  confirmed: "Confirmada",
  applied: "Aplicada",
  cancelled: "Cancelada",
};

function periodLabel(d: string) {
  const [y, m] = d.split("-");
  return `${m}/${y}`;
}

function reconciles(total: number, sum: number | null) {
  if (sum === null) return false;
  return Math.abs(Number(total) - Number(sum)) < 0.005;
}

export default function AdsInvoices() {
  const [openId, setOpenId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ads-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["ads-invoice-detail"] });
    queryClient.invalidateQueries({ queryKey: ["ads-invoice-transactions"] });
  };

  const callApply = async (action: "confirm" | "generate", invoiceId: string) => {
    const { data, error } = await supabase.functions.invoke("ads-invoice-apply", {
      body: { action, invoice_id: invoiceId },
    });
    if (error) throw new Error(error.message);
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
      toast.success(
        data?.already
          ? "Os lançamentos desta fatura já existem."
          : `Lançamentos criados: 1 mãe e ${(data?.transactions?.length ?? 1) - 1} por evento.`,
      );
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
          "id, platform, invoice_number, billing_period, issue_date, total_amount, lines_sum, source, status, parent_transaction_id, confirmed_at, applied_at",
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
        .select("invoice_id, event_id, is_adjustment");
      if (error) throw error;
      return data ?? [];
    },
  });

  const missingByInvoice = new Map<string, number>();
  for (const l of allLines as any[]) {
    if (l.is_adjustment || l.event_id) continue;
    missingByInvoice.set(l.invoice_id, (missingByInvoice.get(l.invoice_id) ?? 0) + 1);
  }

  const { data: detail } = useQuery({
    queryKey: ["ads-invoice-detail", openId],
    enabled: !!openId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ads_invoice_line")
        .select("id, line_no, raw_description, placement, campaign_name, event_id, match_source, match_note, amount, is_adjustment")
        .eq("invoice_id", openId!)
        .order("line_no");
      if (error) throw error;
      return (data ?? []) as AdsInvoiceLineRow[];
    },
  });

  const eventIds = Array.from(new Set((detail ?? []).map((l) => l.event_id).filter(Boolean))) as string[];
  const { data: events = [] } = useQuery({
    queryKey: ["ads-invoice-events", eventIds.join(",")],
    enabled: eventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").in("id", eventIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const eventName = (id: string | null) =>
    id ? (events as any[]).find((e) => e.id === id)?.name ?? "(sem nome)" : "Por resolver";

  const openInvoice = invoices.find((i) => i.id === openId) ?? null;

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
    for (const l of lines) {
      if (l.is_adjustment) { adjustments += Number(l.amount); continue; }
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
          </div>
        </div>

        {!canConfirm && openInvoice.status === "proposed" && (
          <p className="text-sm text-warning">
            {missing > 0
              ? `Não é possível confirmar: ${missing} linha(s) sem evento resolvido.`
              : "Não é possível confirmar: a soma das linhas não bate com o total da fatura."}
          </p>
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
                      {l.match_note ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(l.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Faturas de plataformas</h1>
        <p className="text-sm text-muted-foreground">
          Propostas de rateio das faturas de tráfego pago (Meta e Google). Só leitura — nada é lançado.
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
