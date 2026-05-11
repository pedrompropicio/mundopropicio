import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, HelpCircle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CrmPixels() {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);

  const { data: connection } = useQuery({
    queryKey: ["meta-connection-for-pixels"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("ad_platform_connections")
        .select("id, selected_ad_account_id, selected_ad_account_currency, status")
        .eq("platform", "meta")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; selected_ad_account_id: string | null; selected_ad_account_currency: string | null; status: string } | null;
    },
  });

  const [pixelsData, setPixelsData] = useState<any>(null);
  const [pixelsError, setPixelsError] = useState<string | null>(null);

  const fetchPixels = async () => {
    if (!connection?.id || !connection?.selected_ad_account_id) return;
    setLoading(true);
    setPixelsError(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-pixel-health", {
        body: { connection_id: connection.id, ad_account_id: connection.selected_ad_account_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setPixelsData(data);
    } catch (e: any) {
      setPixelsError(e?.message || "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connection?.id) fetchPixels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.id, refreshKey]);

  if (!connection) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            Sem conexão Meta ativa. Liga a conta Meta primeiro em{" "}
            <button onClick={() => navigate("/audience/connections")} className="text-cyan-400 underline">
              Conexões
            </button>
            .
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-cyan-400" />
            Pixel Health
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Diagnóstico dos pixels Meta ligados à conta. Atualizado em tempo real via API.
          </p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </button>
      </div>

      {pixelsError && (
        <Card className="p-4 border-red-500/30 bg-red-500/10">
          <p className="text-sm text-red-400">{pixelsError}</p>
        </Card>
      )}

      {loading && !pixelsData && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <p className="text-sm text-muted-foreground">A buscar dados dos pixels...</p>
        </div>
      )}

      {pixelsData && (
        <>
          {pixelsData.pixels.length === 0 && (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">Nenhum pixel encontrado nesta conta de anúncios.</p>
            </Card>
          )}

          {pixelsData.pixels.map((px: any) => {
            const statusColor =
              px.health.status === "healthy" ? "emerald" :
              px.health.status === "warning" ? "amber" :
              px.health.status === "critical" ? "red" : "gray";
            const StatusIcon =
              px.health.status === "healthy" ? CheckCircle2 :
              px.health.status === "warning" ? AlertTriangle :
              px.health.status === "critical" ? XCircle : HelpCircle;
            return (
              <Card key={px.id} className={cn(
                "p-6",
                px.health.status === "healthy" && "border-emerald-500/20",
                px.health.status === "warning" && "border-amber-500/20",
                px.health.status === "critical" && "border-red-500/20"
              )}>
                <div className="flex items-start justify-between mb-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusIcon className={cn(
                        "h-5 w-5",
                        statusColor === "emerald" && "text-emerald-400",
                        statusColor === "amber" && "text-amber-400",
                        statusColor === "red" && "text-red-400",
                        statusColor === "gray" && "text-muted-foreground"
                      )} />
                      <h3 className="text-lg font-semibold truncate">{px.name}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">ID: {px.id}</p>
                    <p className={cn(
                      "text-sm mt-2",
                      statusColor === "emerald" && "text-emerald-400",
                      statusColor === "amber" && "text-amber-400",
                      statusColor === "red" && "text-red-400"
                    )}>
                      {px.health.message}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg border border-border bg-background/50 p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Eventos 7d</p>
                    <p className="text-xl font-bold mt-1">{px.stats_7d.total_events.toLocaleString("pt-PT")}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/50 p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Users únicos</p>
                    <p className="text-xl font-bold mt-1">{px.stats_7d.unique_events.toLocaleString("pt-PT")}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/50 p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Média/dia</p>
                    <p className="text-xl font-bold mt-1">{px.stats_7d.events_per_day_avg.toLocaleString("pt-PT")}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/50 p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Tipos eventos</p>
                    <p className="text-xl font-bold mt-1">{px.stats_7d.event_types.length}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Cobertura do funil</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"].map(ev => {
                      const present = px.coverage.present_events.includes(ev);
                      return (
                        <span key={ev} className={cn(
                          "text-xs px-2 py-1 rounded border",
                          present
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "bg-muted/30 border-border text-muted-foreground line-through"
                        )}>
                          {present ? "✓ " : ""}{ev}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {px.stats_7d.event_types.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Top eventos (últimos 7d)</p>
                    <div className="space-y-1">
                      {px.stats_7d.event_types.slice(0, 8).map((et: any) => (
                        <div key={et.event} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                          <span className="font-mono text-xs">{et.event}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">{et.unique_count.toLocaleString("pt-PT")} únicos</span>
                            <span className="font-medium tabular-nums">{et.count.toLocaleString("pt-PT")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}

          <p className="text-xs text-muted-foreground text-center pt-2">
            Última atualização: {new Date(pixelsData.fetched_at).toLocaleString("pt-PT")}
          </p>
        </>
      )}
    </div>
  );
}
