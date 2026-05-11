import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, HelpCircle, Zap, Sparkles, Check, X, AlertCircle, Globe, Target, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdAccountSelection } from "@/hooks/useAdAccountSelection";
import { printPixelHealth } from "@/lib/audience-pdf";

export default function CrmPixels() {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [onlyUsed, setOnlyUsed] = useState(true);

  const { active } = useAdAccountSelection();

  const [pixelsData, setPixelsData] = useState<any>(null);
  const [pixelsError, setPixelsError] = useState<string | null>(null);

  const fetchPixels = async () => {
    if (!active?.connection_id || !active?.ad_account_id) return;
    setLoading(true);
    setPixelsError(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-pixel-health", {
        body: { connection_id: active.connection_id, ad_account_id: active.ad_account_id },
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
    if (active?.ad_account_id) fetchPixels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.ad_account_id, refreshKey]);

  if (!active) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            Sem ad account ativa. Liga uma conta Meta em{" "}
            <button onClick={() => navigate("/audience/connections")} className="text-cyan-400 underline">
              Conexões
            </button>
            .
          </p>
        </Card>
      </div>
    );
  }

  const pixelsToShow = pixelsData
    ? (onlyUsed ? pixelsData.pixels_used_in_active_campaigns : pixelsData.all_pixels) ?? []
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-cyan-400" />
            Pixel Health
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Diagnóstico dos pixels Meta com health score e recomendações.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {pixelsData && (
            <div className="flex items-center gap-2 text-sm">
              <Switch checked={onlyUsed} onCheckedChange={setOnlyUsed} id="only-used" />
              <label htmlFor="only-used" className="cursor-pointer text-muted-foreground">
                Apenas usados em campanhas ativas
                <span className="ml-2 text-xs">
                  ({pixelsData.counts.used}/{pixelsData.counts.total})
                </span>
              </label>
            </div>
          )}
          <button
            onClick={() => printPixelHealth(pixelsData, onlyUsed)}
            disabled={!pixelsData || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/40 border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="Exportar como PDF"
          >
            <FileDown className="h-4 w-4" />
            PDF
          </button>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>
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

      {pixelsData && pixelsToShow.length === 0 && (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            {onlyUsed
              ? "Nenhum pixel está atualmente ligado a campanhas ativas. Desliga o filtro para ver todos."
              : "Nenhum pixel encontrado nesta conta de anúncios."}
          </p>
        </Card>
      )}

      {pixelsData && pixelsToShow.map((px: any) => {
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
            {/* HEADER */}
            <div className="flex items-start justify-between gap-4 mb-5">
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
              <div className={cn(
                "flex flex-col items-center justify-center rounded-xl border-2 px-5 py-3 min-w-[110px]",
                statusColor === "emerald" && "border-emerald-500/40 bg-emerald-500/10",
                statusColor === "amber" && "border-amber-500/40 bg-amber-500/10",
                statusColor === "red" && "border-red-500/40 bg-red-500/10",
                statusColor === "gray" && "border-border bg-muted/30"
              )}>
                <span className={cn(
                  "text-3xl font-black leading-none",
                  statusColor === "emerald" && "text-emerald-400",
                  statusColor === "amber" && "text-amber-400",
                  statusColor === "red" && "text-red-400"
                )}>{px.grade}</span>
                <span className="text-xs text-muted-foreground mt-1 tabular-nums">{px.score}/100</span>
              </div>
            </div>

            {/* LINKED CAMPAIGNS */}
            {px.linked_campaigns?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Target className="h-3 w-3" />
                  Usado por {px.linked_campaigns.length} campanha{px.linked_campaigns.length > 1 ? "s" : ""} ativa{px.linked_campaigns.length > 1 ? "s" : ""}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {px.linked_campaigns.map((c: any) => (
                    <span key={c.id} className="text-xs px-2 py-1 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 max-w-[280px] truncate" title={c.name}>
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* DOMAINS */}
            {px.domains?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Globe className="h-3 w-3" />
                  Domínios detetados ({px.domains.length})
                </p>
                <div className="space-y-1">
                  {px.domains.slice(0, 5).map((d: any) => (
                    <div key={d.domain} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                      <span className="font-mono text-xs truncate">{d.domain}</span>
                      <span className="text-xs text-muted-foreground tabular-nums ml-3">{d.count.toLocaleString("pt-PT")} eventos</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUB-SCORES */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span>🛒</span> Bilheteira (site)
                </p>
                <p className="text-2xl font-bold mt-1">
                  {px.site_score}<span className="text-sm font-normal text-muted-foreground">/{px.site_max}</span>
                </p>
                <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${px.site_max ? (px.site_score / px.site_max) * 100 : 0}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Responsabilidade do dev/site</p>
              </div>
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span>⚙️</span> Meta (config)
                </p>
                <p className="text-2xl font-bold mt-1">
                  {px.meta_score}<span className="text-sm font-normal text-muted-foreground">/{px.meta_max}</span>
                </p>
                <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-cyan-500 transition-all" style={{ width: `${px.meta_max ? (px.meta_score / px.meta_max) * 100 : 0}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Events Manager / Business Manager</p>
              </div>
            </div>

            {/* CHECKS BREAKDOWN — split por source */}
            {(() => {
              const siteChecks = px.checks.filter((c: any) => c.source === "site");
              const metaChecks = px.checks.filter((c: any) => c.source === "meta");
              const renderCheck = (c: any) => {
                const full = c.pts === c.max;
                const partial = c.pts > 0 && c.pts < c.max;
                const Icon = full ? Check : partial ? AlertCircle : X;
                return (
                  <div key={c.key} className={cn(
                    "flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border",
                    full && "border-emerald-500/30 bg-emerald-500/5",
                    partial && "border-amber-500/30 bg-amber-500/5",
                    !full && !partial && "border-red-500/30 bg-red-500/5"
                  )}>
                    <Icon className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      full && "text-emerald-400",
                      partial && "text-amber-400",
                      !full && !partial && "text-red-400"
                    )} />
                    <span className="flex-1 truncate" title={c.label}>{c.label}</span>
                    <span className="text-muted-foreground tabular-nums whitespace-nowrap">{c.value}</span>
                    <span className="text-muted-foreground tabular-nums font-mono">{c.pts}/{c.max}</span>
                  </div>
                );
              };
              return (
                <div className="mb-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400/80 mb-2 flex items-center gap-1.5">
                      <span>🛒</span> Checks da bilheteira ({siteChecks.length})
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {siteChecks.map(renderCheck)}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400/80 mb-2 flex items-center gap-1.5">
                      <span>⚙️</span> Checks da Meta ({metaChecks.length})
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {metaChecks.map(renderCheck)}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* RECOMMENDATIONS — split por source */}
            {(() => {
              const siteRecs = (px.recommendations ?? []).filter((r: any) => r.source === "site");
              const metaRecs = (px.recommendations ?? []).filter((r: any) => r.source === "meta");
              const prioCls = (p: string) =>
                p === "high" ? "bg-red-500/15 text-red-400" :
                p === "medium" ? "bg-amber-500/15 text-amber-400" :
                "bg-muted text-muted-foreground";
              return (
                <>
                  {siteRecs.length > 0 && (
                    <div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                        <span>🛒</span> Ações para o dev da bilheteira ({siteRecs.length})
                      </p>
                      <ul className="space-y-1.5">
                        {siteRecs.map((r: any, i: number) => (
                          <li key={i} className="text-xs text-foreground/90 flex items-start gap-2">
                            <span className={cn("text-[9px] font-bold uppercase px-1 py-0.5 rounded shrink-0 mt-0.5", prioCls(r.priority))}>{r.priority}</span>
                            <span>{r.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {metaRecs.length > 0 && (
                    <div className="mb-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-2 flex items-center gap-1.5">
                        <span>⚙️</span> Ações no Events Manager / Business Manager ({metaRecs.length})
                      </p>
                      <ul className="space-y-1.5">
                        {metaRecs.map((r: any, i: number) => (
                          <li key={i} className="text-xs text-foreground/90 flex items-start gap-2">
                            <span className={cn("text-[9px] font-bold uppercase px-1 py-0.5 rounded shrink-0 mt-0.5", prioCls(r.priority))}>{r.priority}</span>
                            <span>{r.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}

            {/* STATS 7d */}
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

      {pixelsData && (
        <p className="text-xs text-muted-foreground text-center pt-2">
          Última atualização: {new Date(pixelsData.fetched_at).toLocaleString("pt-PT")}
        </p>
      )}
    </div>
  );
}
