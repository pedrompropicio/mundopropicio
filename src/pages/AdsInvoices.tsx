import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";

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

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["ads-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ads_invoice")
        .select("id, platform, invoice_number, billing_period, issue_date, total_amount, lines_sum, source, status")
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

  if (openInvoice) {
    const lines = detail ?? [];
    const byEvent = new Map<string, number>();
    let adjustments = 0;
    let missing = 0;
    for (const l of lines) {
      if (l.is_adjustment) { adjustments += Number(l.amount); continue; }
      if (!l.event_id) { missing++; continue; }
      byEvent.set(l.event_id, (byEvent.get(l.event_id) ?? 0) + Number(l.amount));
    }
    const allocation = Array.from(byEvent.entries()).sort((a, b) => b[1] - a[1]);

    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">
              {platformLabels[openInvoice.platform] ?? openInvoice.platform} · {openInvoice.invoice_number}
            </h1>
            <p className="text-sm text-muted-foreground">
              Período {periodLabel(openInvoice.billing_period)} · total {formatCurrency(Number(openInvoice.total_amount))} ·
              soma das linhas {formatCurrency(Number(openInvoice.lines_sum ?? 0))}
            </p>
          </div>
        </div>

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
