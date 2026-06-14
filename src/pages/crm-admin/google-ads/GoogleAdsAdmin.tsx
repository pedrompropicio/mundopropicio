// Dashboard Google Ads — MP Audience.
// Leitura das tabelas crm.google_* + botão de sync via edge function
// crm-google-ads-sync. Espelha o estilo do Dashboard Meta Live (cards KPI,
// dark theme, badges, tabela com drill-down). Apenas leitura — não escreve
// no Google. RBAC: admin / marketing_manager.

import { Fragment, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CloudUpload,
  Inbox,
  Info,
  KeyRound,
  Loader2,
  Megaphone,
  MousePointerClick,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  UploadCloud,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================
interface GoogleCampaign {
  id: string;
  external_campaign_id: string;
  name: string;
  status: string | null;
  advertising_channel_type: string | null;
  bidding_strategy_type: string | null;
  budget_amount_micros: number | null;
  impressions: number | null;
  clicks: number | null;
  cost_micros: number | null;
  conversions: number | null;
  conversions_value: number | null;
  last_synced_at: string;
}
interface GoogleAdGroup {
  id: string;
  external_campaign_id: string | null;
  external_ad_group_id: string;
  name: string;
  status: string | null;
  type: string | null;
  impressions: number | null;
  clicks: number | null;
  cost_micros: number | null;
  conversions: number | null;
}
interface GoogleKeyword {
  id: string;
  external_ad_group_id: string | null;
  external_criterion_id: string;
  keyword_text: string | null;
  match_type: string | null;
  status: string | null;
  impressions: number | null;
  clicks: number | null;
  cost_micros: number | null;
  conversions: number | null;
}

// ============================================================
// Helpers
// ============================================================
const microsToEur = (m: number | null | undefined) => ((m ?? 0) / 1_000_000);
const fmtEur = (eur: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(eur);
const fmtNum = (n: number | null | undefined) =>
  new Intl.NumberFormat("pt-PT").format(Number(n ?? 0));
const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;

function statusBadge(status: string | null | undefined) {
  const s = (status ?? "").toUpperCase();
  if (s === "ENABLED") return "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30";
  if (s === "PAUSED") return "bg-amber-500/15 text-amber-500 border border-amber-500/30";
  if (s === "REMOVED") return "bg-red-500/15 text-red-500 border border-red-500/30";
  return "bg-muted text-muted-foreground";
}

// ============================================================
// KPI Card (mesmo padrão do Dashboard Meta)
// ============================================================
function KpiCard({ label, big, subtitle, accent = "default" }: {
  label: string; big: string; subtitle?: string; accent?: "default" | "primary";
}) {
  return (
    <Card className={cn(
      "relative overflow-hidden",
      accent === "primary" && "border-emerald-500/40 bg-gradient-to-br from-emerald-500/[0.04] to-transparent",
    )}>
      <CardContent className="p-5">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{big}</div>
        {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Page
// ============================================================
type SecaoId = "dashboard" | "conversoes" | "audiences" | "definicoes";

export default function GoogleAdsAdmin() {
  const { role, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const [secao, setSecao] = useState<SecaoId>("dashboard");
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedAg, setExpandedAg] = useState<Record<string, boolean>>({});

  // RBAC — admin / marketing_manager / platform_admin
  if (!authLoading && role && !["admin", "marketing_manager", "platform_admin"].includes(role)) {
    return <Navigate to="/crm" replace />;
  }

  // ---- queries
  const campaignsQ = useQuery({
    queryKey: ["google-ads", "campaigns"],
    queryFn: async (): Promise<GoogleCampaign[]> => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("google_campaign")
        .select("id, external_campaign_id, name, status, advertising_channel_type, bidding_strategy_type, budget_amount_micros, impressions, clicks, cost_micros, conversions, conversions_value, last_synced_at")
        .order("cost_micros", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as GoogleCampaign[];
    },
  });

  const adGroupsQ = useQuery({
    queryKey: ["google-ads", "ad_groups"],
    queryFn: async (): Promise<GoogleAdGroup[]> => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("google_ad_group")
        .select("id, external_campaign_id, external_ad_group_id, name, status, type, impressions, clicks, cost_micros, conversions")
        .order("cost_micros", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as GoogleAdGroup[];
    },
  });

  const keywordsQ = useQuery({
    queryKey: ["google-ads", "keywords"],
    queryFn: async (): Promise<GoogleKeyword[]> => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("google_keyword")
        .select("id, external_ad_group_id, external_criterion_id, keyword_text, match_type, status, impressions, clicks, cost_micros, conversions")
        .order("cost_micros", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as GoogleKeyword[];
    },
  });

  const isLoading = campaignsQ.isLoading || adGroupsQ.isLoading || keywordsQ.isLoading;
  const loadError = campaignsQ.error || adGroupsQ.error || keywordsQ.error;
  const campaigns = campaignsQ.data ?? [];
  const adGroups = adGroupsQ.data ?? [];
  const keywords = keywordsQ.data ?? [];

  // ---- agregados
  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, cost_micros: 0, conversions: 0, conversions_value: 0 };
    for (const c of campaigns) {
      t.impressions += Number(c.impressions ?? 0);
      t.clicks += Number(c.clicks ?? 0);
      t.cost_micros += Number(c.cost_micros ?? 0);
      t.conversions += Number(c.conversions ?? 0);
      t.conversions_value += Number(c.conversions_value ?? 0);
    }
    const spend = microsToEur(t.cost_micros);
    const ctr = t.impressions > 0 ? t.clicks / t.impressions : 0;
    const cpc = t.clicks > 0 ? spend / t.clicks : 0;
    return { ...t, spend, ctr, cpc };
  }, [campaigns]);

  const lastSync = useMemo(() => {
    const ts = campaigns.map((c) => c.last_synced_at).filter(Boolean).sort();
    return ts.length ? ts[ts.length - 1] : null;
  }, [campaigns]);

  // ---- sync handler
  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-google-ads-sync", { body: {} });
      if (error) {
        let detail = error.message;
        const ctx = (error as any).context;
        if (ctx) {
          try { const b = await (ctx.clone ? ctx.clone() : ctx).json(); detail = b?.message || b?.detail || b?.error || detail; } catch {}
        }
        throw new Error(detail);
      }
      const s = data ?? {};
      const parts = [
        s.campaigns && `${s.campaigns.upserted} campanha(s)`,
        s.ad_groups && `${s.ad_groups.upserted} grupo(s)`,
        s.keywords && `${s.keywords.upserted} palavra(s)-chave`,
        s.asset_groups && `${s.asset_groups.upserted} asset group(s)`,
      ].filter(Boolean).join(", ");
      toast.success("Sincronização Google Ads concluída", { description: parts || "Sem alterações." });
      if (Array.isArray(s.errors) && s.errors.length > 0) {
        toast.warning("Sync devolveu avisos", { description: s.errors.map((e: any) => e?.resource ?? "?").join(", ") });
      }
      await qc.invalidateQueries({ queryKey: ["google-ads"] });
    } catch (e: any) {
      toast.error("Falha na sincronização Google Ads", { description: e?.message ?? String(e) });
    } finally {
      setSyncing(false);
    }
  };

  // ---- drill-down helpers
  const adGroupsByCampaign = useMemo(() => {
    const m = new Map<string, GoogleAdGroup[]>();
    for (const ag of adGroups) {
      if (!ag.external_campaign_id) continue;
      const list = m.get(ag.external_campaign_id) ?? [];
      list.push(ag);
      m.set(ag.external_campaign_id, list);
    }
    return m;
  }, [adGroups]);

  const keywordsByAdGroup = useMemo(() => {
    const m = new Map<string, GoogleKeyword[]>();
    for (const kw of keywords) {
      if (!kw.external_ad_group_id) continue;
      const list = m.get(kw.external_ad_group_id) ?? [];
      list.push(kw);
      m.set(kw.external_ad_group_id, list);
    }
    return m;
  }, [keywords]);

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Toggle plataforma (Meta ↔ Google) */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        <Link
          to="/crm"
          className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          <Activity className="h-3.5 w-3.5 inline-block mr-1.5" />
          Meta Live
        </Link>
        <div className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
          <Sparkles className="h-3.5 w-3.5 inline-block mr-1.5" />
          Google Ads
        </div>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-emerald-600" />
            Dashboard Google Ads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Snapshot read-only das campanhas, grupos e palavras-chave Google Ads. Últimos 30 dias.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {lastSync
              ? <>Última sincronização: <span className="font-medium text-foreground">{formatDistanceToNow(new Date(lastSync), { addSuffix: true, locale: ptBR })}</span></>
              : "Ainda nunca sincronizado."}
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing} className="gap-2">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {syncing ? "A sincronizar…" : "Sincronizar agora"}
        </Button>
      </div>

      {/* Tabs (Dashboard + placeholders existentes) */}
      <Tabs value={secao} onValueChange={(v) => setSecao(v as SecaoId)}>
        <TabsList>
          <TabsTrigger value="dashboard"><Megaphone className="h-3.5 w-3.5 mr-1.5" /> Dashboard</TabsTrigger>
          <TabsTrigger value="conversoes"><MousePointerClick className="h-3.5 w-3.5 mr-1.5" /> Conversões</TabsTrigger>
          <TabsTrigger value="audiences"><Users className="h-3.5 w-3.5 mr-1.5" /> Audiences</TabsTrigger>
          <TabsTrigger value="definicoes"><Settings className="h-3.5 w-3.5 mr-1.5" /> Definições</TabsTrigger>
        </TabsList>

        {/* ---------------- DASHBOARD ---------------- */}
        <TabsContent value="dashboard" className="mt-4 space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <KpiCard label="Gasto Total" big={fmtEur(totals.spend)} accent="primary" />
            <KpiCard label="Impressões" big={fmtNum(totals.impressions)} />
            <KpiCard label="Cliques" big={fmtNum(totals.clicks)} />
            <KpiCard label="CTR" big={fmtPct(totals.ctr)} />
            <KpiCard label="CPC médio" big={fmtEur(totals.cpc)} />
            <KpiCard label="Conversões" big={fmtNum(totals.conversions)} />
            <KpiCard label="Valor conv." big={fmtEur(totals.conversions_value)} />
          </div>

          {/* Loading / Error / Empty / Tabela */}
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : loadError ? (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="pt-6 flex items-start gap-3 text-sm">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Erro ao carregar dados</p>
                  <p className="text-muted-foreground">{(loadError as any)?.message ?? String(loadError)}</p>
                </div>
              </CardContent>
            </Card>
          ) : campaigns.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <Sparkles className="h-10 w-10 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Sem campanhas Google Ads sincronizadas. Carrega em <strong>Sincronizar agora</strong> para puxar os últimos 30 dias da conta.
                </p>
                <Button onClick={handleSync} disabled={syncing} className="gap-2">
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Sincronizar agora
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Campanhas</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-6"></TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Orç./dia</TableHead>
                      <TableHead className="text-right">Gasto</TableHead>
                      <TableHead className="text-right">Impr.</TableHead>
                      <TableHead className="text-right">Cliques</TableHead>
                      <TableHead className="text-right">CPC</TableHead>
                      <TableHead className="text-right">Conv.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((c) => {
                      const spend = microsToEur(c.cost_micros);
                      const clicks = Number(c.clicks ?? 0);
                      const cpc = clicks > 0 ? spend / clicks : 0;
                      const budget = microsToEur(c.budget_amount_micros);
                      const isOpen = !!expanded[c.external_campaign_id];
                      const ags = adGroupsByCampaign.get(c.external_campaign_id) ?? [];
                      return (
                        <Fragment key={c.id}>
                          <TableRow
                            className="cursor-pointer"
                            onClick={() => setExpanded((p) => ({ ...p, [c.external_campaign_id]: !p[c.external_campaign_id] }))}
                          >
                            <TableCell>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell><Badge className={statusBadge(c.status)}>{c.status ?? "—"}</Badge></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{c.advertising_channel_type ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{budget > 0 ? fmtEur(budget) : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtEur(spend)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtNum(c.impressions)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtNum(c.clicks)}</TableCell>
                            <TableCell className="text-right tabular-nums">{cpc > 0 ? fmtEur(cpc) : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtNum(c.conversions)}</TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow key={`${c.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                              <TableCell colSpan={10} className="p-4">
                                {ags.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Sem grupos de anúncios sincronizados.</p>
                                ) : (
                                  <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Grupos de anúncios</div>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="w-6"></TableHead>
                                          <TableHead>Nome</TableHead>
                                          <TableHead>Status</TableHead>
                                          <TableHead>Tipo</TableHead>
                                          <TableHead className="text-right">Gasto</TableHead>
                                          <TableHead className="text-right">Impr.</TableHead>
                                          <TableHead className="text-right">Cliques</TableHead>
                                          <TableHead className="text-right">Conv.</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {ags.map((ag) => {
                                          const agOpen = !!expandedAg[ag.external_ad_group_id];
                                          const kws = keywordsByAdGroup.get(ag.external_ad_group_id) ?? [];
                                          return (
                                            <Fragment key={ag.id}>
                                              <TableRow
                                                className="cursor-pointer"
                                                onClick={() => setExpandedAg((p) => ({ ...p, [ag.external_ad_group_id]: !p[ag.external_ad_group_id] }))}
                                              >
                                                <TableCell>{agOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                                                <TableCell className="font-medium">{ag.name}</TableCell>
                                                <TableCell><Badge className={statusBadge(ag.status)}>{ag.status ?? "—"}</Badge></TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{ag.type ?? "—"}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtEur(microsToEur(ag.cost_micros))}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtNum(ag.impressions)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtNum(ag.clicks)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtNum(ag.conversions)}</TableCell>
                                              </TableRow>
                                              {agOpen && (
                                                <TableRow key={`${ag.id}-kw`} className="bg-muted/50 hover:bg-muted/50">
                                                  <TableCell colSpan={8} className="p-3">
                                                    {kws.length === 0 ? (
                                                      <p className="text-xs text-muted-foreground">Sem palavras-chave neste grupo (ou grupo Performance Max).</p>
                                                    ) : (
                                                      <Table>
                                                        <TableHeader>
                                                          <TableRow>
                                                            <TableHead>Palavra-chave</TableHead>
                                                            <TableHead>Match</TableHead>
                                                            <TableHead>Status</TableHead>
                                                            <TableHead className="text-right">Gasto</TableHead>
                                                            <TableHead className="text-right">Impr.</TableHead>
                                                            <TableHead className="text-right">Cliques</TableHead>
                                                            <TableHead className="text-right">Conv.</TableHead>
                                                          </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                          {kws.map((kw) => (
                                                            <TableRow key={kw.id}>
                                                              <TableCell className="font-medium">{kw.keyword_text ?? "—"}</TableCell>
                                                              <TableCell className="text-xs text-muted-foreground">{kw.match_type ?? "—"}</TableCell>
                                                              <TableCell><Badge className={statusBadge(kw.status)}>{kw.status ?? "—"}</Badge></TableCell>
                                                              <TableCell className="text-right tabular-nums">{fmtEur(microsToEur(kw.cost_micros))}</TableCell>
                                                              <TableCell className="text-right tabular-nums">{fmtNum(kw.impressions)}</TableCell>
                                                              <TableCell className="text-right tabular-nums">{fmtNum(kw.clicks)}</TableCell>
                                                              <TableCell className="text-right tabular-nums">{fmtNum(kw.conversions)}</TableCell>
                                                            </TableRow>
                                                          ))}
                                                        </TableBody>
                                                      </Table>
                                                    )}
                                                  </TableCell>
                                                </TableRow>
                                              )}
                                            </Fragment>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------------- placeholders existentes ---------------- */}
        <TabsContent value="conversoes" className="mt-4">
          <ConversoesTab />
        </TabsContent>
        <TabsContent value="audiences" className="mt-4">
          <AudiencesTab />
        </TabsContent>
        <TabsContent value="definicoes" className="mt-4">
          <PlaceholderCard
            icon={Settings}
            titulo="Definições"
            descricao="Ligação da conta Google Ads (OAuth), developer token, conversion actions e mapeamento de eventos."
            itens={[
              "Conexão OAuth (crm.ad_platform_connections, platform='google').",
              "Conversion actions e mapeamento order → conversão.",
              "Estado do developer token (Basic/Standard).",
            ]}
          />
        </TabsContent>
      </Tabs>

      {/* Gate developer token */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-6 flex items-start gap-3 text-sm">
          <KeyRound className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Sync read-only via service account</p>
            <p className="text-muted-foreground">
              Sincronização lê os últimos 30 dias via Google Ads API v24 (edge function <code className="text-xs bg-muted px-1 rounded">crm-google-ads-sync</code>).
              Envio de conversões offline e Customer Match dependem da <strong>Data Manager API</strong> + <strong>developer token</strong> aprovado (Sprint 2).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Placeholder card (mantido do esqueleto Sprint 1)
// ============================================================
function PlaceholderCard({
  icon: Icon, titulo, descricao, itens,
}: { icon: React.ComponentType<{ className?: string }>; titulo: string; descricao: string; itens: string[]; }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" /> {titulo}
          <Badge variant="outline" className="ml-auto bg-muted text-muted-foreground border-border">Sprint 2</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{descricao}</p>
        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
          {itens.map((it) => <li key={it}>{it}</li>)}
        </ul>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Conversões offline — tab
// ============================================================
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

function truncate(s: string, n = 14): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function statusBadgeConv(status: string) {
  if (status === "sent") return "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30";
  if (status === "pending") return "bg-amber-500/15 text-amber-500 border border-amber-500/30";
  if (status === "failed") return "bg-red-500/15 text-red-500 border border-red-500/30";
  return "bg-muted text-muted-foreground";
}

function ConversoesTab() {
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);

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
      if (error) {
        let detail = error.message;
        const ctx = (error as any).context;
        if (ctx) {
          try { const b = await (ctx.clone ? ctx.clone() : ctx).json(); detail = b?.message || b?.detail || b?.error || detail; } catch {}
        }
        throw new Error(detail);
      }
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
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Pendentes" big={new Intl.NumberFormat("pt-PT").format(kpis.pending)} accent="primary" />
        <KpiCard label="Enviadas" big={new Intl.NumberFormat("pt-PT").format(kpis.sent)} />
        <KpiCard label="Falhadas" big={new Intl.NumberFormat("pt-PT").format(kpis.failed)} />
        <KpiCard label="Valor pendente" big={fmtEur(kpis.pendingValue)} />
      </div>

      {/* Header da tab + botão */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Fila <code className="text-xs bg-muted px-1 rounded">crm.google_conversion</code> — conversões de venda atribuídas a um clique Google (gclid/gbraid/wbraid), enviadas via Data Manager API.
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

// ============================================================
// Audiences / Customer Match — tab
// ============================================================
interface GoogleUserListRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  member_count: number | null;
  external_user_list_id: string | null;
  last_synced_at: string | null;
  raw: any;
  created_at: string;
}

interface GoogleUserListJobRow {
  id: string;
  user_list_id: string | null;
  operation: string;
  members_submitted: number | null;
  status: string;
  raw: any;
  created_at: string;
}

function listStatusBadge(s: string) {
  if (s === "active") return "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30";
  if (s === "draft") return "bg-amber-500/15 text-amber-500 border border-amber-500/30";
  if (s === "error") return "bg-red-500/15 text-red-500 border border-red-500/30";
  return "bg-muted text-muted-foreground";
}

function jobStatusBadge(s: string) {
  if (s === "completed" || s === "success") return "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30";
  if (s === "pending" || s === "running") return "bg-amber-500/15 text-amber-500 border border-amber-500/30";
  if (s === "failed" || s === "error") return "bg-red-500/15 text-red-500 border border-red-500/30";
  return "bg-muted text-muted-foreground";
}

function AudiencesTab() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const listsQ = useQuery({
    queryKey: ["google-ads", "user_lists"],
    queryFn: async (): Promise<GoogleUserListRow[]> => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("google_user_list")
        .select("id, name, description, status, member_count, external_user_list_id, last_synced_at, raw, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GoogleUserListRow[];
    },
  });

  const jobsQ = useQuery({
    queryKey: ["google-ads", "user_list_jobs"],
    queryFn: async (): Promise<GoogleUserListJobRow[]> => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("google_user_list_job")
        .select("id, user_list_id, operation, members_submitted, status, raw, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as GoogleUserListJobRow[];
    },
  });

  const lists = listsQ.data ?? [];
  const jobs = jobsQ.data ?? [];

  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["google-ads", "user_lists"] }),
      qc.invalidateQueries({ queryKey: ["google-ads", "user_list_jobs"] }),
    ]);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Indica um nome para a audiência.");
      return;
    }
    setCreating(true);
    try {
      const { error } = await (supabase as any)
        .schema("crm")
        .from("google_user_list")
        .insert({
          name,
          description: newDesc.trim() || null,
          status: "draft",
        });
      if (error) throw error;
      toast.success("Audiência criada em rascunho", {
        description: `"${name}" está pronta para preparar membros / criar no Google.`,
      });
      setNewName("");
      setNewDesc("");
      setShowForm(false);
      await refreshAll();
    } catch (e: any) {
      toast.error("Falha ao criar audiência", { description: e?.message ?? String(e) });
    } finally {
      setCreating(false);
    }
  };

  const extractEdgeError = async (error: any): Promise<string> => {
    let detail = error?.message ?? String(error);
    const ctx = error?.context;
    if (ctx) {
      try {
        const b = await (ctx.clone ? ctx.clone() : ctx).json();
        detail = b?.message || b?.detail || b?.error || detail;
      } catch {}
    }
    return detail;
  };

  const handleEnsure = async (row: GoogleUserListRow) => {
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "crm-google-user-list-ensure",
        { body: { user_list_id: row.id } },
      );
      if (error) throw new Error(await extractEdgeError(error));
      const s: any = data ?? {};
      const created = Number(s.created ?? 0);
      const errs = Array.isArray(s.errors) ? s.errors : [];
      if (created > 0) {
        toast.success(`Audiência "${row.name}" criada no Google`, {
          description: `external_id: ${s.results?.[0]?.external_user_list_id ?? "—"}`,
        });
      } else if (errs.length > 0) {
        toast.warning("Google rejeitou a criação (gate de acesso)", {
          description: String(errs[0]).slice(0, 240),
        });
      } else {
        toast.info("Nada a criar", { description: "Linha já tinha external_user_list_id." });
      }
      await refreshAll();
    } catch (e: any) {
      toast.error("Falha ao criar no Google", { description: e?.message ?? String(e) });
    } finally {
      setBusyId(null);
    }
  };

  const handlePrepare = async (row: GoogleUserListRow) => {
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "crm-google-customer-match-sync",
        { body: { user_list_id: row.id } },
      );
      if (error) throw new Error(await extractEdgeError(error));
      const s: any = data ?? {};
      toast.success(`Membros preparados (${s.prepared ?? 0})`, {
        description: `Elegíveis: ${s.eligible ?? 0} · Hashed: ${s.hashed ?? 0} · Deduplicados: ${s.deduped ?? 0} · Transporte: ${s.transport ?? "—"}`,
      });
      await refreshAll();
    } catch (e: any) {
      toast.error("Falha a preparar membros", { description: e?.message ?? String(e) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Banner de estado */}
      <Card className="border-sky-500/30 bg-sky-500/5">
        <CardContent className="pt-6 flex items-start gap-3 text-sm">
          <Info className="h-5 w-5 text-sky-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Estado actual do Customer Match</p>
            <p className="text-muted-foreground">
              A preparação de membros (elegibilidade + hashing) já funciona. A
              criação da lista no Google e o envio de membros estão pendentes
              de aprovação do acesso Basic à Google Ads API; o Customer Match
              depende ainda da Data Manager API e da elegibilidade da conta
              (histórico de gasto).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Acções topo */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Listas em <code className="text-xs bg-muted px-1 rounded">crm.google_user_list</code> + jobs em <code className="text-xs bg-muted px-1 rounded">crm.google_user_list_job</code>.
        </div>
        <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? "outline" : "default"} className="gap-2">
          <Plus className="h-4 w-4" />
          {showForm ? "Cancelar" : "Criar audiência"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova audiência (rascunho)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Nome</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Leads MP — consent_email"
                disabled={creating}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Descrição (opcional)</label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
                placeholder="Para que serve esta audiência?"
                disabled={creating}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleCreate} disabled={creating} className="gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creating ? "A criar…" : "Criar rascunho"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabela de listas */}
      {listsQ.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : listsQ.error ? (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-6 flex items-start gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Erro ao carregar audiências</p>
              <p className="text-muted-foreground">{(listsQ.error as any)?.message ?? String(listsQ.error)}</p>
            </div>
          </CardContent>
        </Card>
      ) : lists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Users className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Ainda não existem audiências. Carrega em <strong>Criar audiência</strong> para
              começar com um rascunho.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audiências Customer Match</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Membros</TableHead>
                    <TableHead>External ID</TableHead>
                    <TableHead>Última sync</TableHead>
                    <TableHead className="text-right">Acções</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lists.map((r) => {
                    const isBusy = busyId === r.id;
                    const errMsg = r.status === "error"
                      ? String(r.raw?.error ?? "").slice(0, 240)
                      : null;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          <div>{r.name}</div>
                          {r.description && (
                            <div className="text-xs text-muted-foreground">{r.description}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {errMsg ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">
                                  <Badge className={listStatusBadge(r.status)}>{r.status}</Badge>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md break-words">{errMsg}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Badge className={listStatusBadge(r.status)}>{r.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(r.member_count)}</TableCell>
                        <TableCell className="text-xs">
                          {r.external_user_list_id ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.last_synced_at
                            ? formatDistanceToNow(new Date(r.last_synced_at), { addSuffix: true, locale: ptBR })
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              disabled={isBusy}
                              onClick={() => handlePrepare(r)}
                            >
                              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                              Preparar membros
                            </Button>
                            <Button
                              size="sm"
                              className="gap-1.5"
                              disabled={isBusy || !!r.external_user_list_id}
                              onClick={() => handleEnsure(r)}
                            >
                              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                              Criar no Google
                            </Button>
                          </div>
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

      {/* Jobs recentes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jobs recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {jobsQ.isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Sem jobs até ao momento.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Operação</TableHead>
                  <TableHead className="text-right">Submetidos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Transporte</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="text-xs tabular-nums">
                      {format(new Date(j.created_at), "yyyy-MM-dd HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs">{j.operation}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(j.members_submitted)}</TableCell>
                    <TableCell><Badge className={jobStatusBadge(j.status)}>{j.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {j.raw?.transport ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
