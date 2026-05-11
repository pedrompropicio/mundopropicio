import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Lightbulb, Search, Trophy, Users, Copy, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAdAccountSelection } from "@/hooks/useAdAccountSelection";

export default function CrmInsights() {
  const navigate = useNavigate();
  const { active } = useAdAccountSelection();

  // ===== Tab A: Top Performers / Blueprints =====
  const [minRoas, setMinRoas] = useState(3);
  const [periodDays, setPeriodDays] = useState(90);
  const [bpLimit, setBpLimit] = useState(10);
  const [bpLoading, setBpLoading] = useState(false);
  const [bpError, setBpError] = useState<string | null>(null);
  const [bpData, setBpData] = useState<any>(null);
  const [bpExpanded, setBpExpanded] = useState<Record<string, boolean>>({});

  const fetchBlueprints = async () => {
    if (!active?.connection_id || !active?.ad_account_id) return;
    setBpLoading(true); setBpError(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-audience-blueprints", {
        body: {
          connection_id: active.connection_id,
          ad_account_id: active.ad_account_id,
          min_roas: minRoas,
          days_back: periodDays,
          limit: bpLimit,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setBpData(data);
    } catch (e: any) { setBpError(e?.message || "Erro"); }
    finally { setBpLoading(false); }
  };

  // ===== Tab B: Interest Search =====
  const [iQuery, setIQuery] = useState("");
  const [iLoading, setILoading] = useState(false);
  const [iError, setIError] = useState<string | null>(null);
  const [iData, setIData] = useState<any>(null);

  const fetchInterests = async () => {
    if (!active?.connection_id || !active?.ad_account_id) return;
    if (!iQuery.trim()) return;
    setILoading(true); setIError(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-interest-search", {
        body: { connection_id: active.connection_id, ad_account_id: active.ad_account_id, query: iQuery.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setIData(data);
    } catch (e: any) { setIError(e?.message || "Erro"); }
    finally { setILoading(false); }
  };

  // ===== Tab C: Custom Audiences =====
  const [caLoading, setCaLoading] = useState(false);
  const [caError, setCaError] = useState<string | null>(null);
  const [caData, setCaData] = useState<any>(null);

  const fetchCustomAudiences = async () => {
    if (!active?.connection_id || !active?.ad_account_id) return;
    setCaLoading(true); setCaError(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-list-custom-audiences", {
        body: { connection_id: active.connection_id, ad_account_id: active.ad_account_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setCaData(data);
    } catch (e: any) { setCaError(e?.message || "Erro"); }
    finally { setCaLoading(false); }
  };

  const copy = (text: string, label = "Copiado") => {
    navigator.clipboard.writeText(text).then(() => toast.success(label));
  };

  if (!active) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            Sem conexão Meta ativa. Liga a conta Meta primeiro em{" "}
            <button onClick={() => navigate("/audience/connections")} className="text-cyan-400 underline">Conexões</button>.
          </p>
        </Card>
      </div>
    );
  }

  const cyanBtn = "flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-cyan-400" />
          Insights de Audiência
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aprende com top performers, descobre interesses Meta e lista as tuas custom audiences.
        </p>
      </div>

      <Tabs defaultValue="blueprints" className="w-full">
        <TabsList>
          <TabsTrigger value="blueprints" className="gap-1.5"><Trophy className="h-4 w-4" /> Top Performers</TabsTrigger>
          <TabsTrigger value="interests" className="gap-1.5"><Search className="h-4 w-4" /> Pesquisar Interesses</TabsTrigger>
          <TabsTrigger value="custom" className="gap-1.5"><Users className="h-4 w-4" /> Custom Audiences</TabsTrigger>
        </TabsList>

        {/* ===== TAB A ===== */}
        <TabsContent value="blueprints" className="space-y-4">
          <Card className="p-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">ROAS mínimo</label>
                <input type="number" min={0} step={0.5} value={minRoas} onChange={(e) => setMinRoas(parseFloat(e.target.value) || 0)} className="w-24 px-2 py-1.5 bg-background border border-border rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Período</label>
                <select value={periodDays} onChange={(e) => setPeriodDays(parseInt(e.target.value, 10))} className="px-2 py-1.5 bg-background border border-border rounded text-sm">
                  <option value={30}>30 dias</option>
                  <option value={60}>60 dias</option>
                  <option value={90}>90 dias</option>
                  <option value={180}>180 dias</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Limite</label>
                <input type="number" min={1} max={30} value={bpLimit} onChange={(e) => setBpLimit(parseInt(e.target.value, 10) || 10)} className="w-20 px-2 py-1.5 bg-background border border-border rounded text-sm" />
              </div>
              <button onClick={fetchBlueprints} disabled={bpLoading} className={cyanBtn}>
                {bpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                Buscar blueprints
              </button>
            </div>
          </Card>

          {bpError && <Card className="p-4 border-red-500/30 bg-red-500/10"><p className="text-sm text-red-400">{bpError}</p></Card>}

          {bpLoading && !bpData && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-sm text-muted-foreground">A buscar top performers e adsets...</p>
            </div>
          )}

          {bpData && bpData.blueprints.length === 0 && (
            <Card className="p-6 bg-muted/20">
              <p className="text-sm text-muted-foreground">
                Nenhuma campanha com ROAS ≥ {minRoas} encontrada nos últimos {periodDays} dias. Tenta baixar o threshold.
              </p>
            </Card>
          )}

          {bpData && bpData.blueprints.map((b: any) => {
            const expanded = bpExpanded[b.campaign_id];
            return (
              <Card key={b.campaign_id} className="p-4 border-cyan-500/20">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setBpExpanded((s) => ({ ...s, [b.campaign_id]: !expanded }))}
                        className="flex items-center gap-1.5 text-left min-w-0"
                      >
                        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        <h3 className="text-base font-semibold truncate">{b.campaign_name}</h3>
                      </button>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                        ROAS {b.roas.toFixed(2)}x
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
                      <span className="px-2 py-0.5 rounded bg-muted/40">Gasto {b.spend_eur.toFixed(2)}€</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300">Receita {b.revenue_eur.toFixed(2)}€</span>
                      <span className="px-2 py-0.5 rounded bg-muted/40">{b.purchases} compras</span>
                      {b.ctr != null && <span className="px-2 py-0.5 rounded bg-muted/40">CTR {(b.ctr * 100).toFixed(2)}%</span>}
                      {b.frequency != null && <span className="px-2 py-0.5 rounded bg-muted/40">Freq {b.frequency.toFixed(1)}</span>}
                      <span className="text-muted-foreground">· {b.adsets.length} adsets</span>
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 space-y-3 border-t border-border pt-3">
                    {b.adsets.length === 0 && <p className="text-xs text-muted-foreground">Sem adsets disponíveis.</p>}
                    {b.adsets.map((a: any) => (
                      <div key={a.id} className="rounded-lg border border-border bg-card/50 p-3">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="font-medium text-sm">{a.name}</span>
                          <span className={cn(
                            "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded",
                            a.effective_status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-300" : "bg-muted text-muted-foreground"
                          )}>{a.effective_status}</span>
                          {a.optimization_goal && (
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300">{a.optimization_goal}</span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          <div className="flex gap-1.5"><span>🌍</span><span><span className="text-muted-foreground">Geo:</span> {a.targeting.countries?.join(", ") || "—"}</span></div>
                          <div className="flex gap-1.5"><span>👤</span><span><span className="text-muted-foreground">Idades:</span> {a.targeting.age || "—"} · <span className="text-muted-foreground">géneros:</span> {a.targeting.genders?.join("/") || "all"}</span></div>
                          {a.targeting.cities?.length > 0 && (
                            <div className="flex gap-1.5 col-span-full"><span>📍</span><span><span className="text-muted-foreground">Cidades:</span> {a.targeting.cities.map((c: any) => c.name).join(", ")}</span></div>
                          )}
                          {a.targeting.publisher_platforms?.length > 0 && (
                            <div className="flex gap-1.5"><span>📱</span><span><span className="text-muted-foreground">Plataformas:</span> {a.targeting.publisher_platforms.join(", ")}</span></div>
                          )}
                        </div>
                        {a.targeting.interests?.length > 0 && (
                          <div className="mt-2">
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">🎯 Interesses ({a.targeting.interests.length})</p>
                            <div className="flex flex-wrap gap-1">
                              {a.targeting.interests.map((i: any) => (
                                <span key={i.id} className="text-[11px] px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">{i.name}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {a.targeting.custom_audiences?.length > 0 && (
                          <div className="mt-2">
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">📋 Custom Audiences ({a.targeting.custom_audiences.length})</p>
                            <div className="flex flex-wrap gap-1">
                              {a.targeting.custom_audiences.map((c: any) => (
                                <span key={c.id} className="text-[11px] px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300">{c.name}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => copy(JSON.stringify(a.raw_targeting, null, 2), "Targeting JSON copiado")}
                          className="mt-3 inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-border hover:bg-muted/50 transition-colors"
                        >
                          <Copy className="h-3 w-3" /> Copiar targeting JSON
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </TabsContent>

        {/* ===== TAB B ===== */}
        <TabsContent value="interests" className="space-y-4">
          <Card className="p-4">
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                value={iQuery}
                onChange={(e) => setIQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") fetchInterests(); }}
                placeholder="Procurar interesses Meta — ex: Anitta, Coldplay, Festivais..."
                className="flex-1 min-w-[260px] px-3 py-2 bg-background border border-border rounded text-sm"
              />
              <button onClick={fetchInterests} disabled={iLoading || !iQuery.trim()} className={cyanBtn}>
                {iLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Procurar
              </button>
            </div>
          </Card>

          {iError && <Card className="p-4 border-red-500/30 bg-red-500/10"><p className="text-sm text-red-400">{iError}</p></Card>}

          {iData && iData.interests.length === 0 && (
            <Card className="p-6 bg-muted/20"><p className="text-sm text-muted-foreground">Nenhum interesse encontrado para "{iData.query}".</p></Card>
          )}

          {iData && iData.interests.map((i: any) => (
            <Card key={i.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{i.name}</h3>
                    {i.topic && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300">{i.topic}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {i.audience_size_lower_bound != null && i.audience_size_upper_bound != null
                      ? `${i.audience_size_lower_bound.toLocaleString("pt-PT")} – ${i.audience_size_upper_bound.toLocaleString("pt-PT")} pessoas`
                      : "Tamanho desconhecido"}
                  </p>
                  {i.path?.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{i.path.join(" › ")}</p>
                  )}
                  {i.description && <p className="text-xs mt-2">{i.description}</p>}
                  <p className="text-[10px] font-mono text-muted-foreground mt-2">ID: {i.id}</p>
                </div>
                <button onClick={() => copy(i.id, "ID copiado")} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted/50 shrink-0">
                  <Copy className="h-3 w-3" /> Copiar ID
                </button>
              </div>
            </Card>
          ))}

          {iData?.reach_estimate_top && (
            <Card className="p-4 border-cyan-500/30 bg-cyan-500/5">
              <p className="text-sm">
                🎯 <span className="font-semibold">Reach estimado em PT+BR para {iData.reach_estimate_top.interest}:</span>{" "}
                {iData.reach_estimate_top.users_lower?.toLocaleString("pt-PT") ?? "?"} a {iData.reach_estimate_top.users_upper?.toLocaleString("pt-PT") ?? "?"} pessoas
              </p>
            </Card>
          )}
        </TabsContent>

        {/* ===== TAB C ===== */}
        <TabsContent value="custom" className="space-y-4">
          <Card className="p-4">
            <button onClick={fetchCustomAudiences} disabled={caLoading} className={cyanBtn}>
              {caLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              Buscar custom audiences
            </button>
          </Card>

          {caError && <Card className="p-4 border-red-500/30 bg-red-500/10"><p className="text-sm text-red-400">{caError}</p></Card>}

          {caData && caData.audiences.length === 0 && (
            <Card className="p-6 bg-muted/20"><p className="text-sm text-muted-foreground">Nenhuma custom audience encontrada. Cria no Events Manager → Audiences.</p></Card>
          )}

          {caData && caData.audiences.map((a: any) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{a.name}</h3>
                    {a.subtype && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300">{a.subtype}</span>}
                    {a.is_value_based && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300">Value-based</span>}
                  </div>
                  {a.description && <p className="text-xs mt-1 text-muted-foreground">{a.description}</p>}
                  <p className="text-xs text-muted-foreground mt-2">
                    ~{(a.approximate_count_lower_bound ?? 0).toLocaleString("pt-PT")} – {(a.approximate_count_upper_bound ?? 0).toLocaleString("pt-PT")} pessoas
                  </p>
                  {a.time_created && (
                    <p className="text-[10px] text-muted-foreground mt-1">Criada em {new Date(a.time_created * 1000).toLocaleDateString("pt-PT")}</p>
                  )}
                  <p className="text-[10px] font-mono text-muted-foreground mt-1">ID: {a.id}</p>
                </div>
                <button onClick={() => copy(a.id, "ID copiado")} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted/50 shrink-0">
                  <Copy className="h-3 w-3" /> Copiar ID
                </button>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
