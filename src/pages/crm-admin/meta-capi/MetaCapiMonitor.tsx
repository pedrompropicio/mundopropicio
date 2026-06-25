import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, Clock, ExternalLink, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardData {
  token_status: "configured" | "missing_or_invalid";
  period_days: number;
  generated_at: string;
  stats_leads: { total: number; sent_ok: number; errors: number; pending: number };
  stats_redirects: { total: number; sent_ok: number; pending: number };
  events_pixel_status: Array<{
    id: string;
    slug: string;
    name: string;
    date: string | null;
    meta_pixel_id: string | null;
    has_pixel: boolean;
    meta_audience_id: string | null;
    meta_audience_name: string | null;
    leads_period: number;
  }>;
  recent_errors: Array<{
    id: string;
    event_slug: string | null;
    source: string | null;
    client_event_id: string | null;
    created_at: string;
    processing_error: string | null;
  }>;
  recent_sent: Array<{
    id: string;
    event_slug: string | null;
    source: string | null;
    client_event_id: string | null;
    created_at: string;
    processed_at: string | null;
  }>;
}

function StatCard({
  label,
  value,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "warning" | "error";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
      ? "text-amber-600"
      : tone === "error"
      ? "text-destructive"
      : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-muted-foreground tracking-wider">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${toneClass}`}>{value}</p>
          </div>
          {Icon ? <Icon className={`h-8 w-8 ${toneClass} opacity-30`} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function trunc(s: string | null | undefined, n = 16): string {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export default function MetaCapiMonitor() {
  const [days, setDays] = useState<1 | 7 | 30>(7);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["crm-meta-capi-dashboard", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("crm_meta_capi_dashboard" as never, {
        p_days: days,
      } as never);
      if (error) throw error;
      return data as unknown as DashboardData;
    },
  });

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-emerald-600" />
            Meta Conversions API
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor server-side de eventos enviados ao Meta (Pixel + CAPI).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.token_status === "configured" ? (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Token configurado
            </Badge>
          ) : data?.token_status === "missing_or_invalid" ? (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
              <AlertTriangle className="h-3 w-3 mr-1" /> Token CAPI em falta
            </Badge>
          ) : null}
          <div className="flex rounded-md border">
            {[1, 7, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d as 1 | 7 | 30)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === d
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "..." : "↻"}
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">
            Erro: {(error as Error).message}
          </CardContent>
        </Card>
      ) : null}

      {/* Stats — Leads */}
      <div>
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
          Leads (evento "Lead")
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : (
            <>
              <StatCard label="Total" value={data?.stats_leads.total ?? 0} icon={Activity} />
              <StatCard
                label="Enviados"
                value={data?.stats_leads.sent_ok ?? 0}
                tone="success"
                icon={CheckCircle2}
              />
              <StatCard
                label="Erros"
                value={data?.stats_leads.errors ?? 0}
                tone="error"
                icon={XCircle}
              />
              <StatCard
                label="Pendentes"
                value={data?.stats_leads.pending ?? 0}
                tone="warning"
                icon={Clock}
              />
            </>
          )}
        </div>
      </div>

      {/* Stats — Redirects */}
      <div>
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
          Redirects (evento "InitiateCheckout")
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : (
            <>
              <StatCard label="Total" value={data?.stats_redirects.total ?? 0} icon={Activity} />
              <StatCard
                label="Enviados"
                value={data?.stats_redirects.sent_ok ?? 0}
                tone="success"
                icon={CheckCircle2}
              />
              <StatCard
                label="Pendentes"
                value={data?.stats_redirects.pending ?? 0}
                tone="warning"
                icon={Clock}
              />
            </>
          )}
        </div>
      </div>

      {/* Pixel status por evento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado de Pixel por evento</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : (data?.events_pixel_status?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Sem eventos visíveis nos últimos 60 dias.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slug</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Pixel</TableHead>
                  <TableHead className="text-right">Leads {days}d</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.events_pixel_status.map((ev) => (
                  <TableRow key={ev.id} className={!ev.has_pixel ? "bg-amber-500/5" : ""}>
                    <TableCell className="font-mono text-xs">{ev.slug}</TableCell>
                    <TableCell className="font-medium">{ev.name}</TableCell>
                    <TableCell className="text-muted-foreground">{ev.date ?? "—"}</TableCell>
                    <TableCell>
                      {ev.has_pixel ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> {trunc(ev.meta_pixel_id, 14)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Sem pixel
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{ev.leads_period}</TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/crm/eventos/${ev.slug}`}>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tabs: Sucessos / Erros */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="errors">
            <TabsList>
              <TabsTrigger value="errors">
                Erros ({data?.recent_errors?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="sent">
                Sucessos ({data?.recent_sent?.length ?? 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="errors" className="mt-4">
              {(data?.recent_errors?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Sem erros no período. 🎉
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>event_id</TableHead>
                      <TableHead>Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.recent_errors.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDateTime(r.created_at)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.event_slug ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.source ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs" title={r.client_event_id ?? ""}>
                          {trunc(r.client_event_id, 12)}
                        </TableCell>
                        <TableCell className="text-xs text-destructive max-w-md truncate" title={r.processing_error ?? ""}>
                          {r.processing_error}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="sent" className="mt-4">
              {(data?.recent_sent?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Sem envios bem-sucedidos no período.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Enviado em</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>event_id</TableHead>
                      <TableHead>Criado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.recent_sent.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {fmtDateTime(r.processed_at)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.event_slug ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.source ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs" title={r.client_event_id ?? ""}>
                          {trunc(r.client_event_id, 12)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDateTime(r.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Setup guide */}
      <Collapsible>
        <Card>
          <CollapsibleTrigger asChild>
            <button className="w-full">
              <CardHeader className="flex flex-row items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors">
                <CardTitle className="text-base">Como configurar (setup guide)</CardTitle>
                <ChevronDown className="h-4 w-4" />
              </CardHeader>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 text-sm">
              <section>
                <h3 className="font-semibold mb-1">1. Pixel ID por evento</h3>
                <p className="text-muted-foreground">
                  Meta Events Manager → Data Sources → seleccionar o Pixel → Settings → copiar "Pixel ID".
                  Cola no campo <code className="text-xs bg-muted px-1 rounded">meta_pixel_id</code> do evento
                  (Admin → Eventos → editar evento → secção Marketing).
                </p>
              </section>
              <section>
                <h3 className="font-semibold mb-1">2. CAPI Access Token (global)</h3>
                <p className="text-muted-foreground">
                  Events Manager → Settings do Pixel → Conversions API → Generate Access Token.
                  Adiciona como secret <code className="text-xs bg-muted px-1 rounded">META_CAPI_ACCESS_TOKEN</code> em
                  Lovable Cloud → Edge Functions → Secrets. O token é partilhado por todos os pixels da mesma BM.
                </p>
              </section>
              <section>
                <h3 className="font-semibold mb-1">3. Test Events (durante desenvolvimento)</h3>
                <p className="text-muted-foreground">
                  Events Manager → Test Events → copiar test event code.
                  Para activar para a MP precisa de mudança no <code className="text-xs bg-muted px-1 rounded">portal_tick_*</code>
                  para incluir <code className="text-xs bg-muted px-1 rounded">test_event_code</code> no payload Graph.
                </p>
              </section>
              <section>
                <h3 className="font-semibold mb-1">4. Como funciona</h3>
                <p className="text-muted-foreground">
                  Cron <code className="text-xs bg-muted px-1 rounded">portal_tick_lead_capture</code> corre a cada
                  minuto. Lê batches de 50 leads não-processados de <code className="text-xs bg-muted px-1 rounded">lead_capture</code>,
                  faz POST directo a <code className="text-xs bg-muted px-1 rounded">graph.facebook.com/v25.0/{`{pixel}/events`}</code> via
                  <code className="text-xs bg-muted px-1 rounded">pg_net</code>. <code className="text-xs bg-muted px-1 rounded">client_event_id</code>
                  partilhado client-side (Pixel) ↔ server-side (CAPI) permite deduplicação no Meta.
                </p>
              </section>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
