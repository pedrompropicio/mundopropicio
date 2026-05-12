import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, RefreshCw, Target, ExternalLink, Globe, Zap, AlertTriangle, CheckCircle2, XCircle, Activity, FileDown } from "lucide-react";
import { useAdAccountSelection } from "@/hooks/useAdAccountSelection";
import { printAuditReport } from "@/lib/audience-pdf";
import { cn } from "@/lib/utils";

type AuditContext = { type: "event" | "campaign" | "landing" | "pixel"; id: string };


function statusForMetric(metric: string, v: number | null | undefined): "good" | "warn" | "bad" | "unknown" {
  if (v == null) return "unknown";
  switch (metric) {
    case "lcp_ms": return v <= 2500 ? "good" : v <= 4000 ? "warn" : "bad";
    case "fcp_ms": return v <= 1800 ? "good" : v <= 3000 ? "warn" : "bad";
    case "tbt_ms": return v <= 200 ? "good" : v <= 600 ? "warn" : "bad";
    case "tti_ms": return v <= 3800 ? "good" : v <= 7300 ? "warn" : "bad";
    case "ttfb_ms": return v <= 600 ? "good" : v <= 1500 ? "warn" : "bad";
    case "cls": return v <= 0.1 ? "good" : v <= 0.25 ? "warn" : "bad";
    case "perf": return v >= 90 ? "good" : v >= 50 ? "warn" : "bad";
    default: return "unknown";
  }
}

function statusColors(s: "good" | "warn" | "bad" | "unknown"): string {
  if (s === "good") return "text-emerald-400";
  if (s === "warn") return "text-amber-400";
  if (s === "bad") return "text-red-400";
  return "text-muted-foreground";
}

function MetricCell({ label, value, suffix, status }: { label: string; value: any; suffix?: string; status: "good" | "warn" | "bad" | "unknown" }) {
  return (
    <div className="rounded-md border border-border bg-card/50 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-base font-bold tabular-nums", statusColors(status))}>
        {value ?? "—"}{value != null && suffix ? <span className="text-xs font-normal ml-0.5">{suffix}</span> : null}
      </div>
    </div>
  );
}

function ScoreBadge({ label, score }: { label: string; score: number | null | undefined }) {
  const status = score == null ? "unknown" : score >= 90 ? "good" : score >= 50 ? "warn" : "bad";
  return (
    <div className="text-center">
      <div className={cn("text-2xl font-bold tabular-nums", statusColors(status))}>{score ?? "—"}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function severityClass(s: string): string {
  switch (s) {
    case "healthy": return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
    case "landing": return "bg-amber-500/15 text-amber-300 border-amber-500/40";
    case "pixel": return "bg-purple-500/15 text-purple-300 border-purple-500/40";
    case "placement": return "bg-cyan-500/15 text-cyan-300 border-cyan-500/40";
    case "audience": return "bg-blue-500/15 text-blue-300 border-blue-500/40";
    case "mixed": return "bg-orange-500/15 text-orange-300 border-orange-500/40";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function evStatusIcon(s: string) {
  if (s === "good") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (s === "warning") return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  if (s === "critical") return <XCircle className="h-4 w-4 text-red-400" />;
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}

export default function CrmAudit() {
  const { contextType, contextId } = useParams<{ contextType: string; contextId: string }>();
  const navigate = useNavigate();
  const { active } = useAdAccountSelection();

  const ctx: AuditContext | null = useMemo(() => {
    if (!contextType) return null;
    if (!["event", "campaign", "landing"].includes(contextType)) return null;
    return { type: contextType as any, id: contextId ?? "" };
  }, [contextType, contextId]);

  // Resolve landing URLs + campaign info
  const [resolving, setResolving] = useState(true);
  const [contextInfo, setContextInfo] = useState<{ title: string; landingUrls: string[]; campaignName?: string; campaignId?: string; eventName?: string }>({ title: "", landingUrls: [] });

  // Landing audits per URL
  const [landingByUrl, setLandingByUrl] = useState<Record<string, { loading: boolean; data?: any; error?: string }>>({});
  // Funnel breakdowns
  const [funnel, setFunnel] = useState<{
    placement?: { loading: boolean; data?: any; error?: string };
    device?: { loading: boolean; data?: any; error?: string };
    platform?: { loading: boolean; data?: any; error?: string };
  }>({});
  // Pixel
  const [pixel, setPixel] = useState<{ loading: boolean; data?: any; error?: string }>({ loading: false });
  // AI verdict
  const [verdict, setVerdict] = useState<{ loading: boolean; data?: any; error?: string }>({ loading: false });

  // ── Resolve context
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ctx) return;
      setResolving(true);
      try {
        if (ctx.type === "landing") {
          let url = "";
          try { url = decodeURIComponent(escape(atob(decodeURIComponent(ctx.id)))); } catch { /* */ }
          if (!url) { try { url = decodeURIComponent(ctx.id); } catch { url = ctx.id; } }
          setContextInfo({ title: url || "Landing", landingUrls: url ? [url] : [] });
        } else if (ctx.type === "campaign") {
          // Read campaign + try to extract landing URLs from ad creatives
          const { data: camp } = await (supabase as any).schema("crm").from("meta_campaign_snapshot")
            .select("external_campaign_id, name").eq("external_campaign_id", ctx.id).maybeSingle();
          const { data: adsets } = await (supabase as any).schema("crm").from("meta_adset_snapshot")
            .select("external_adset_id").eq("external_campaign_id", ctx.id);
          const adsetIds = (adsets ?? []).map((a: any) => a.external_adset_id);
          let creativeIds: string[] = [];
          if (adsetIds.length) {
            const { data: ads } = await (supabase as any).schema("crm").from("meta_ad_snapshot")
              .select("meta_creative_id").in("external_adset_id", adsetIds);
            creativeIds = Array.from(new Set((ads ?? []).map((a: any) => a.meta_creative_id).filter(Boolean)));
          }
          let urls = new Set<string>();
          if (creativeIds.length) {
            const { data: crs } = await (supabase as any).schema("crm").from("meta_creatives")
              .select("link_url").in("meta_creative_id", creativeIds);
            for (const c of crs ?? []) {
              if (c.link_url) urls.add(String(c.link_url));
            }
          }
          setContextInfo({
            title: camp?.name ?? "Campanha",
            campaignName: camp?.name,
            campaignId: ctx.id,
            landingUrls: Array.from(urls).slice(0, 10),
          });
        } else if (ctx.type === "event") {
          const { data: ev } = await supabase.from("events").select("id,name").eq("id", ctx.id).maybeSingle();
          const { data: camps } = await (supabase as any).schema("crm").from("meta_campaign_snapshot")
            .select("external_campaign_id, name").eq("linked_event_id", ctx.id);
          const adsetIds: string[] = [];
          for (const c of camps ?? []) {
            const { data: as } = await (supabase as any).schema("crm").from("meta_adset_snapshot")
              .select("external_adset_id").eq("external_campaign_id", c.external_campaign_id);
            for (const a of as ?? []) adsetIds.push(a.external_adset_id);
          }
          let urls = new Set<string>();
          if (adsetIds.length) {
            const { data: ads } = await (supabase as any).schema("crm").from("meta_ad_snapshot")
              .select("meta_creative_id").in("external_adset_id", adsetIds);
            const cIds = Array.from(new Set((ads ?? []).map((a: any) => a.meta_creative_id).filter(Boolean)));
            if (cIds.length) {
              const { data: crs } = await (supabase as any).schema("crm").from("meta_creatives")
                .select("link_url").in("meta_creative_id", cIds);
              for (const c of crs ?? []) {
                if (c.link_url) urls.add(String(c.link_url));
              }
            }
          }
          setContextInfo({
            title: ev?.name ?? "Evento",
            eventName: ev?.name,
            campaignId: camps?.[0]?.external_campaign_id,
            campaignName: camps?.[0]?.name,
            landingUrls: Array.from(urls).slice(0, 10),
          });
        }
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ctx?.type, ctx?.id]);

  // ── Trigger audits
  const auditLanding = useCallback(async (url: string) => {
    setLandingByUrl(prev => ({ ...prev, [url]: { loading: true } }));
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-landing-audit", { body: { url, strategy: "mobile" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setLandingByUrl(prev => ({ ...prev, [url]: { loading: false, data } }));
      return data;
    } catch (e: any) {
      setLandingByUrl(prev => ({ ...prev, [url]: { loading: false, error: e?.message || "Erro" } }));
      return null;
    }
  }, []);

  const auditFunnel = useCallback(async (breakdown: "placement" | "device" | "platform") => {
    if (!active?.connection_id || !contextInfo.campaignId) return null;
    setFunnel(prev => ({ ...prev, [breakdown]: { loading: true } }));
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-funnel-breakdown", {
        body: { connection_id: active.connection_id, level: "campaign", external_id: contextInfo.campaignId, breakdown_by: breakdown, days_back: 30 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setFunnel(prev => ({ ...prev, [breakdown]: { loading: false, data } }));
      return data;
    } catch (e: any) {
      setFunnel(prev => ({ ...prev, [breakdown]: { loading: false, error: e?.message || "Erro" } }));
      return null;
    }
  }, [active?.connection_id, contextInfo.campaignId]);

  const auditPixel = useCallback(async () => {
    if (!active?.connection_id || !active?.ad_account_id) return null;
    setPixel({ loading: true });
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-pixel-health", {
        body: { connection_id: active.connection_id, ad_account_id: active.ad_account_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setPixel({ loading: false, data });
      return data;
    } catch (e: any) {
      setPixel({ loading: false, error: e?.message || "Erro" });
      return null;
    }
  }, [active?.connection_id, active?.ad_account_id]);

  const runVerdict = useCallback(async (landingArr: any[], funnelArr: any[], pixelData: any) => {
    setVerdict({ loading: true });
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-audit-summary", {
        body: {
          landing_results: landingArr.filter(Boolean),
          funnel_results: funnelArr.filter(Boolean),
          pixel_results: pixelData ? [pixelData] : [],
          context: { event_name: contextInfo.eventName, campaign_name: contextInfo.campaignName },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setVerdict({ loading: false, data: data.verdict });
    } catch (e: any) {
      setVerdict({ loading: false, error: e?.message || "Erro" });
    }
  }, [contextInfo.eventName, contextInfo.campaignName]);

  const runAll = useCallback(async () => {
    if (resolving) return;
    // landing in parallel
    const landingPromises = contextInfo.landingUrls.map(u => auditLanding(u));
    // funnel sequential
    const fnPromise = (async () => {
      const a = await auditFunnel("placement");
      const b = await auditFunnel("device");
      const c = await auditFunnel("platform");
      return [a, b, c];
    })();
    const pixelPromise = auditPixel();
    const [landingArr, funnelArr, pixelData] = await Promise.all([
      Promise.all(landingPromises),
      fnPromise,
      pixelPromise,
    ]);
    await runVerdict(landingArr, funnelArr, pixelData);
  }, [resolving, contextInfo.landingUrls, auditLanding, auditFunnel, auditPixel, runVerdict]);

  useEffect(() => {
    if (!resolving && ctx) {
      runAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolving, ctx?.type, ctx?.id]);

  if (!ctx) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Contexto inválido. Volta a <button onClick={() => navigate("/audience/pixels")} className="text-cyan-400 underline">Pixel Health</button>.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-amber-400" />
            Auditoria técnica
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-muted">{ctx.type}</span>
            <span>{resolving ? "A carregar contexto…" : contextInfo.title}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => printAuditReport({
              context: { type: ctx.type, title: contextInfo.title, eventName: contextInfo.eventName, campaignName: contextInfo.campaignName, primary_url: contextInfo.landingUrls[0] },
              generated_at: new Date().toISOString(),
              verdict: verdict.data,
              landing: contextInfo.landingUrls.map(u => landingByUrl[u]?.data).filter(Boolean),
              funnel: {
                placement: funnel.placement?.data ? { rows: funnel.placement.data.rows ?? [] } : undefined,
                device: funnel.device?.data ? { rows: funnel.device.data.rows ?? [] } : undefined,
                platform: funnel.platform?.data ? { rows: funnel.platform.data.rows ?? [] } : undefined,
              },
              pixel: pixel.data,
            })}
            disabled={resolving || verdict.loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" />
            PDF
          </button>
          <button
            onClick={runAll}
            disabled={resolving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Re-auditar tudo
          </button>
        </div>
      </div>

      {/* AI Verdict */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">Veredicto IA</h2>
        </div>
        {verdict.loading && (
          <div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-20 w-full" /></div>
        )}
        {verdict.error && <p className="text-sm text-red-400">{verdict.error}</p>}
        {verdict.data && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-[11px] uppercase font-bold px-2 py-1 rounded border", severityClass(verdict.data.verdict_severity))}>
                {verdict.data.verdict_severity}
              </span>
              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                Confiança: {verdict.data.confidence}
              </span>
            </div>
            <p className="text-sm">{verdict.data.summary_pt}</p>
            {Array.isArray(verdict.data.evidence) && verdict.data.evidence.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-2">
                {verdict.data.evidence.map((e: any, i: number) => (
                  <div key={i} className="rounded-md border border-border bg-card/50 p-2 flex items-start gap-2">
                    {evStatusIcon(e.status)}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold">{e.metric}: <span className="font-normal text-muted-foreground">{String(e.value)}</span></div>
                      <div className="text-[10px] text-muted-foreground/80">benchmark: {e.benchmark}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {Array.isArray(verdict.data.actions) && verdict.data.actions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ações</h3>
                {verdict.data.actions.map((a: any, i: number) => (
                  <div key={i} className="rounded-md border border-border bg-card p-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                        a.priority === "high" ? "bg-red-500/15 text-red-300" : a.priority === "medium" ? "bg-amber-500/15 text-amber-300" : "bg-muted text-muted-foreground")}>
                        {a.priority}
                      </span>
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{a.target}</span>
                    </div>
                    <p className="text-sm">{a.action}</p>
                    {a.expected_impact && <p className="text-xs text-muted-foreground mt-0.5">→ {a.expected_impact}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Landing Performance */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">Landing Performance</h2>
          <span className="text-[10px] text-muted-foreground">({contextInfo.landingUrls.length} URL{contextInfo.landingUrls.length === 1 ? "" : "s"})</span>
        </div>
        {contextInfo.landingUrls.length === 0 && !resolving && (
          <p className="text-sm text-muted-foreground">Nenhuma landing URL detectada nos creatives.</p>
        )}
        <div className="space-y-3">
          {contextInfo.landingUrls.map(url => {
            const st = landingByUrl[url];
            const m = st?.data?.metrics;
            const s = st?.data?.scores;
            return (
              <div key={url} className="rounded-lg border border-border bg-card/30 p-3">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <a href={url} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 hover:underline truncate flex items-center gap-1 min-w-0">
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{url}</span>
                  </a>
                  <button
                    onClick={() => auditLanding(url)}
                    disabled={st?.loading}
                    className="flex items-center gap-1 text-[10px] uppercase px-2 py-1 rounded bg-muted hover:bg-muted/70 disabled:opacity-50"
                  >
                    {st?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Re-auditar
                  </button>
                </div>
                {st?.loading && <Skeleton className="h-20 w-full" />}
                {st?.error && <p className="text-xs text-red-400">{st.error}</p>}
                {st?.data && (
                  <>
                    <div className="grid grid-cols-4 gap-3 mb-3">
                      <ScoreBadge label="Performance" score={s?.performance} />
                      <ScoreBadge label="Acessibilidade" score={s?.accessibility} />
                      <ScoreBadge label="SEO" score={s?.seo} />
                      <ScoreBadge label="Best Practices" score={s?.best_practices} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                      <MetricCell label="LCP" value={m?.lcp_ms} suffix="ms" status={statusForMetric("lcp_ms", m?.lcp_ms)} />
                      <MetricCell label="FCP" value={m?.fcp_ms} suffix="ms" status={statusForMetric("fcp_ms", m?.fcp_ms)} />
                      <MetricCell label="TBT" value={m?.tbt_ms} suffix="ms" status={statusForMetric("tbt_ms", m?.tbt_ms)} />
                      <MetricCell label="TTI" value={m?.tti_ms} suffix="ms" status={statusForMetric("tti_ms", m?.tti_ms)} />
                      <MetricCell label="SI" value={m?.si_ms} suffix="ms" status="unknown" />
                      <MetricCell label="TTFB" value={m?.ttfb_ms} suffix="ms" status={statusForMetric("ttfb_ms", m?.ttfb_ms)} />
                      <MetricCell label="CLS" value={m?.cls} status={statusForMetric("cls", m?.cls)} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Benchmarks Mundo Propício: LCP &lt;2.5s · TBT &lt;200ms · TTI &lt;3.8s · TTFB &lt;600ms · CLS &lt;0.1
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Funnel Breakdown */}
      {contextInfo.campaignId && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">Funnel Breakdown (30 dias)</h2>
          </div>
          <Tabs defaultValue="placement">
            <TabsList>
              <TabsTrigger value="placement">Placement</TabsTrigger>
              <TabsTrigger value="device">Device</TabsTrigger>
              <TabsTrigger value="platform">Platform</TabsTrigger>
            </TabsList>
            {(["placement", "device", "platform"] as const).map(b => {
              const st = funnel[b];
              return (
                <TabsContent key={b} value={b} className="mt-3">
                  {st?.loading && <Skeleton className="h-32 w-full" />}
                  {st?.error && <p className="text-xs text-red-400">{st.error}</p>}
                  {st?.data && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b border-border">
                            <th className="py-2 pr-2">Categoria</th>
                            <th className="py-2 pr-2 text-right">Spend</th>
                            <th className="py-2 pr-2 text-right">Clicks</th>
                            <th className="py-2 pr-2 text-right">LPV</th>
                            <th className="py-2 pr-2 text-right">ATC</th>
                            <th className="py-2 pr-2 text-right">IC</th>
                            <th className="py-2 pr-2 text-right">Purch</th>
                            <th className="py-2 pr-2 text-right">LPV/Click</th>
                            <th className="py-2 pr-2 text-right">Purch/Click</th>
                            <th className="py-2 pr-2 text-right">ROAS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(st.data.rows ?? []).map((r: any) => (
                            <tr key={r.key} className="border-b border-border/40">
                              <td className="py-1.5 pr-2 truncate max-w-xs">{r.label}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">€{r.spend_eur}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{r.link_clicks}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{r.lpv}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{r.atc}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{r.ic}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{r.purchases}</td>
                              <td className={cn("py-1.5 pr-2 text-right tabular-nums",
                                r.rates?.lpv_per_click_pct == null ? "text-muted-foreground" :
                                r.rates.lpv_per_click_pct >= 80 ? "text-emerald-400" :
                                r.rates.lpv_per_click_pct >= 60 ? "text-amber-400" : "text-red-400")}>
                                {r.rates?.lpv_per_click_pct ?? "—"}%
                              </td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{r.rates?.overall_funnel_conversion_pct ?? "—"}%</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{r.rates?.roas ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </Card>
      )}

      {/* Pixel Health */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">Pixel Health</h2>
        </div>
        {pixel.loading && <Skeleton className="h-32 w-full" />}
        {pixel.error && <p className="text-xs text-red-400">{pixel.error}</p>}
        {pixel.data && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {pixel.data.counts?.used ?? 0} pixel(s) em uso de {pixel.data.counts?.total ?? 0}.
            </p>
            <button
              onClick={() => navigate("/audience/pixels")}
              className="text-xs text-cyan-400 hover:underline inline-flex items-center gap-1"
            >
              Ver detalhe completo em Pixel Health <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
