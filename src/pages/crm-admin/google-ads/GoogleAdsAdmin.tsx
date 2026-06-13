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
  Inbox,
  KeyRound,
  Loader2,
  Megaphone,
  MousePointerClick,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
          <PlaceholderCard
            icon={Users}
            titulo="Audiences / Customer Match"
            descricao="Listas de Customer Match a partir da audiência primária do Portal (à semelhança das Custom Audiences do Meta), respeitando consentimento e hashing."
            itens={[
              "Construção de listas a partir de contactos/leads.",
              "Upload e estado de match (Sprint 2).",
              "Lookalike / segmentos derivados.",
            ]}
          />
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
