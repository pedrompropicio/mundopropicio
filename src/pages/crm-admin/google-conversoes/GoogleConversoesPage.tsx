// Google Conversões — MP CRM (/crm/google-conversoes).
// Fila crm.google_conversion + KPIs + botão "Enviar pendentes" via edge
// function crm-google-conversion-upload. Espelha o estilo das outras páginas
// crm-admin (Meta CAPI). RBAC: admin / marketing_manager / platform_admin.

import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  AlertTriangle,
  Inbox,
  Loader2,
  MousePointerClick,
  Send,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  KpiCard,
  fmtEur,
  statusBadgeConv,
  truncate,
  extractEdgeError,
} from "@/lib/google-ads-format";

interface GoogleConversionRow {
  id: string;
  conversion_action_ref: string;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  conversion_value: number | null;
  currency_code: string | null;
  order_id: string | null;
  conversion_datetime: string;
  status: "pending" | "sent" | "failed" | string;
  error_detail: string | null;
  sent_at: string | null;
}

function clickIdLabel(r: GoogleConversionRow): { kind: string; value: string } | null {
  if (r.gclid) return { kind: "gclid", value: r.gclid };
  if (r.gbraid) return { kind: "gbraid", value: r.gbraid };
  if (r.wbraid) return { kind: "wbraid", value: r.wbraid };
  return null;
}

export default function GoogleConversoesPage() {
  const { role, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);

  if (!authLoading && role && !["admin", "marketing_manager", "platform_admin"].includes(role as any)) {
    return <Navigate to="/crm" replace />;
  }

  const conversionsQ = useQuery({
    queryKey: ["google-ads", "conversions"],
    queryFn: async (): Promise<GoogleConversionRow[]> => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("google_conversion")
        .select("id, conversion_action_ref, gclid, gbraid, wbraid, conversion_value, currency_code, order_id, conversion_datetime, status, error_detail, sent_at")
        .order("conversion_datetime", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as GoogleConversionRow[];
    },
  });

  const rows = conversionsQ.data ?? [];
  const kpis = useMemo(() => {
    let pending = 0, sent = 0, failed = 0, pendingValue = 0;
    for (const r of rows) {
      if (r.status === "pending") { pending++; pendingValue += Number(r.conversion_value ?? 0); }
      else if (r.status === "sent") sent++;
      else if (r.status === "failed") failed++;
    }
    return { pending, sent, failed, pendingValue };
  }, [rows]);

  const handleSend = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-google-conversion-upload", { body: {} });
      if (error) throw new Error(await extractEdgeError(error));
      const s = data ?? {};
      const sent = Number(s.sent ?? 0);
      const failed = Number(s.failed ?? 0);
      const read = Number(s.read ?? 0);
      toast.success("Envio de conversões concluído", {
        description: `Lidas: ${read}. Enviadas: ${sent}. Falhadas: ${failed}.`,
      });
      if (failed > 0) {
        toast.warning(`${failed} conversão(ões) falharam`, {
          description: "Vê a coluna 'Detalhe' para a mensagem da Google.",
        });
      }
      if (Array.isArray(s.errors) && s.errors.length > 0) {
        toast.warning("Avisos durante o envio", { description: s.errors.slice(0, 3).join("; ") });
      }
      await qc.invalidateQueries({ queryKey: ["google-ads", "conversions"] });
    } catch (e: any) {
      toast.error("Falha no envio de conversões", { description: e?.message ?? String(e) });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header da página */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MousePointerClick className="h-6 w-6 text-emerald-600" />
          Google Conversões
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fila de conversões offline atribuídas a um clique Google
          (gclid/gbraid/wbraid), enviadas via Data Manager API.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Pendentes" big={new Intl.NumberFormat("pt-PT").format(kpis.pending)} accent="primary" />
        <KpiCard label="Enviadas" big={new Intl.NumberFormat("pt-PT").format(kpis.sent)} />
        <KpiCard label="Falhadas" big={new Intl.NumberFormat("pt-PT").format(kpis.failed)} />
        <KpiCard label="Valor pendente" big={fmtEur(kpis.pendingValue)} />
      </div>

      {/* Cabeçalho da lista + botão */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Tabela <code className="text-xs bg-muted px-1 rounded">crm.google_conversion</code>.
        </div>
        <Button onClick={handleSend} disabled={sending || kpis.pending === 0} className="gap-2">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? "A enviar…" : `Enviar pendentes${kpis.pending > 0 ? ` (${kpis.pending})` : ""}`}
        </Button>
      </div>

      {conversionsQ.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : conversionsQ.error ? (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-6 flex items-start gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Erro ao carregar conversões</p>
              <p className="text-muted-foreground">{(conversionsQ.error as any)?.message ?? String(conversionsQ.error)}</p>
            </div>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Inbox className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Fila vazia. As conversões aparecem aqui automaticamente quando houver vendas (Ticketline/Fever) com um clique Google atribuível (gclid/gbraid/wbraid capturado na landing).
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversões na fila</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Clique</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const cid = clickIdLabel(r);
                    const val = Number(r.conversion_value ?? 0);
                    const ccy = (r.currency_code ?? "EUR").toUpperCase();
                    const valFmt = new Intl.NumberFormat("pt-PT", {
                      style: "currency", currency: ccy, maximumFractionDigits: 2,
                    }).format(val);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs tabular-nums">
                          {format(new Date(r.conversion_datetime), "yyyy-MM-dd HH:mm")}
                        </TableCell>
                        <TableCell className="text-xs">{r.order_id ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-right tabular-nums">{valFmt}</TableCell>
                        <TableCell className="text-xs">
                          {cid ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">
                                  <Badge variant="outline" className="mr-1.5">{cid.kind}</Badge>
                                  <span className="text-muted-foreground">{truncate(cid.value)}</span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md break-all">{cid.value}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground">sem identificador</span>
                          )}
                        </TableCell>
                        <TableCell><Badge className={statusBadgeConv(r.status)}>{r.status}</Badge></TableCell>
                        <TableCell className="text-xs max-w-[280px]">
                          {r.error_detail ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help text-red-500">{truncate(r.error_detail, 40)}</span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md break-words">{r.error_detail}</TooltipContent>
                            </Tooltip>
                          ) : r.sent_at ? (
                            <span className="text-muted-foreground">
                              enviada {formatDistanceToNow(new Date(r.sent_at), { addSuffix: true, locale: ptBR })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
