// StrategyNewDesign — "novo desenho do zero" (Etapa 5)
// Para uma campanha MORTA: cria uma campanha NOVA a partir do evento, herdando
// SELETIVAMENTE criativos do pool do evento (campanha morta + peers).
// Reutiliza os inputs de objetivo da StrategyNew + a seleção de herança do
// padrão da StrategyRedesign. No fim chama crm-meta-campaign-new-design e
// encaminha para a vista de estratégia (revisão + deploy existentes).

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ArrowLeft, Sparkles, Loader2, Info, ImageIcon } from "lucide-react";
import { toast } from "sonner";

const COUNTRY_OPTIONS = [
  { code: "PT", label: "Portugal" },
  { code: "BR", label: "Brasil" },
];
const LOADING_STEPS = [
  "A resolver evento e peers…",
  "A agregar o pool de herança…",
  "A buscar contexto Meta…",
  "A pedir à IA o novo desenho…",
];
const verdictBadge: Record<string, string> = {
  winning: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  losing: "bg-red-500/10 text-red-300 border-red-500/40",
  neutral: "bg-muted text-muted-foreground border-border",
};

interface PoolCreative {
  meta_creative_id: string;
  name: string | null;
  type: string | null;
  file_url: string | null;
  headline: string | null;
  verdict: "winning" | "neutral" | "losing";
  performance: { roas: number | null; spend_eur: number; impressions: number; purchases: number; score_ai: number | null };
  source_campaign_ids: string[];
}

export default function CrmStrategyNewDesign() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();

  // Inputs de objetivo (espelham a StrategyNew)
  const [name, setName] = useState("");
  const [goalRevenue, setGoalRevenue] = useState("");
  const [ticketAvg, setTicketAvg] = useState("25");
  const [totalBudget, setTotalBudget] = useState("");
  const [targetRoas, setTargetRoas] = useState("9");
  const [countries, setCountries] = useState<string[]>(["PT", "BR"]);
  const [userNotes, setUserNotes] = useState("");

  // Herança
  const [inheritIds, setInheritIds] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) navigate("/audience/dashboard", { replace: true });
  }, [campaignId, navigate]);

  // Campanha morta (evento + nome)
  const { data: campaignSnap, isLoading: snapLoading } = useQuery({
    queryKey: ["new-design-campaign", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .schema("crm").from("meta_campaign_snapshot")
        .select("external_campaign_id, name, linked_event_id")
        .eq("external_campaign_id", campaignId).maybeSingle();
      return data as { external_campaign_id: string; name: string; linked_event_id: string | null } | null;
    },
  });
  const eventId = campaignSnap?.linked_event_id ?? null;

  const { data: event } = useQuery({
    queryKey: ["new-design-event", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data } = await supabase.from("events").select("id, name, date").eq("id", eventId!).maybeSingle();
      return data as { id: string; name: string; date: string | null } | null;
    },
  });

  // Pool de herança (morta + peers do evento) via inventory com event_id
  const { data: pool, isLoading: poolLoading, error: poolErr } = useQuery({
    queryKey: ["new-design-pool", campaignId, eventId],
    enabled: !!campaignId && !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("crm-meta-redesign-inventory", {
        body: { campaign_id: campaignId, event_id: eventId, period_days: 30 },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).message ?? (data as any).error);
      return (data as any)?.event_inheritance_pool ?? { creatives: [], audiences: [], source_campaigns: [] };
    },
  });
  const poolCreatives: PoolCreative[] = pool?.creatives ?? [];

  // Pré-selecionar os winning quando o pool chega.
  useEffect(() => {
    if (!poolCreatives.length) return;
    setInheritIds(new Set(poolCreatives.filter((c) => c.verdict === "winning").map((c) => c.meta_creative_id)));
  }, [pool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Por defeito mostra winning+neutral; "mostrar todos" inclui losing (G4).
  const visibleCreatives = useMemo(
    () => poolCreatives.filter((c) => showAll || c.verdict !== "losing"),
    [poolCreatives, showAll],
  );
  const hiddenLosing = poolCreatives.length - poolCreatives.filter((c) => c.verdict !== "losing").length;

  const daysUntil = useMemo(() => {
    if (!event?.date) return null;
    return Math.max(0, Math.round((new Date(event.date).getTime() - Date.now()) / 86400000));
  }, [event]);
  const expectedPurchases = useMemo(() => {
    const g = parseFloat(goalRevenue), t = parseFloat(ticketAvg);
    if (!g || !t || t <= 0) return null;
    return Math.ceil(g / t);
  }, [goalRevenue, ticketAvg]);

  const toggleCountry = (code: string) =>
    setCountries((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  const toggleCreative = (id: string) =>
    setInheritIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const canSubmit = !!eventId && !!parseFloat(goalRevenue) && !!parseFloat(ticketAvg) && !submitting;

  useEffect(() => {
    if (!submitting) return;
    setLoadingStep(0);
    const itv = setInterval(() => setLoadingStep((s) => (s + 1) % LOADING_STEPS.length), 4000);
    return () => clearInterval(itv);
  }, [submitting]);

  const handleSubmit = async () => {
    if (!canSubmit || !campaignId) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      const keep = [...inheritIds];
      const discard = poolCreatives.map((c) => c.meta_creative_id).filter((id) => !inheritIds.has(id));
      const payload = {
        campaign_id: campaignId,
        goal_revenue_eur: parseFloat(goalRevenue),
        ticket_avg_eur: parseFloat(ticketAvg),
        total_budget_eur: totalBudget ? parseFloat(totalBudget) : undefined,
        target_roas: targetRoas ? parseFloat(targetRoas) : undefined,
        country_codes: countries.length ? countries : undefined,
        user_notes: userNotes || undefined,
        strategy_name: name || undefined,
        // Herança seletiva: vazio => plano 100% novo.
        inheritance_decisions: { inherit_creative_ids: keep, discard_creative_ids: discard },
      };
      const { data, error } = await supabase.functions.invoke("crm-meta-campaign-new-design", { body: payload });
      if (error) {
        let detail = error.message;
        const ctx = (error as any).context;
        if (ctx) {
          try { const b = await (ctx.clone ? ctx.clone() : ctx).json(); detail = b?.message || b?.detail || b?.error || detail; } catch {}
        }
        throw new Error(detail);
      }
      if ((data as any)?.error) throw new Error(`[${(data as any).error}] ${(data as any).message ?? ""}`);
      if (!(data as any)?.strategy_id) throw new Error("Resposta sem strategy_id.");
      toast.success("Novo desenho gerado!");
      navigate(`/audience/strategies/${(data as any).strategy_id}`);
    } catch (e: any) {
      setErrMsg(e?.message ?? String(e));
      toast.error("Erro ao gerar novo desenho", { description: (e?.message ?? "").slice(0, 200) });
    } finally {
      setSubmitting(false);
    }
  };

  if (snapLoading) {
    return <div className="space-y-4 max-w-3xl"><Skeleton className="h-10 w-64" /><Skeleton className="h-48" /></div>;
  }

  // G5 — sem evento associado: bloquear com CTA claro.
  if (campaignSnap && !eventId) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/audience/campaigns/${campaignId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar à campanha
        </Button>
        <Card className="p-6 border-amber-500/40 bg-amber-500/5 space-y-3">
          <h1 className="text-lg font-semibold">Campanha sem evento associado</h1>
          <p className="text-sm text-muted-foreground">
            O "novo desenho" parte do evento da campanha (estrutura + pool de herança dos peers). Esta
            campanha não tem evento associado (<code>linked_event_id</code> vazio). Associa um evento à
            campanha, ou usa o fluxo "Nova estratégia" a partir de um evento.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/audience/strategies/new")}>
              <Sparkles className="h-4 w-4 mr-1" /> Nova estratégia (do evento)
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/audience/campaigns/${campaignId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar à campanha
        </Button>
      </div>

      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Novo desenho do zero</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Campanha morta <strong>{campaignSnap?.name}</strong> → desenho novo para{" "}
            <strong>{event?.name ?? "o evento"}</strong>
            {daysUntil !== null && <> · {daysUntil} dias até ao evento</>}. Herda seletivamente o que valeu a pena.
          </p>
        </div>
      </div>

      {/* Objetivo */}
      <Card className="p-5 space-y-5">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Objetivo</h2>
        <div className="grid gap-2">
          <Label htmlFor="nd-name">Nome da estratégia</Label>
          <Input id="nd-name" placeholder={`Novo desenho — ${event?.name ?? ""}`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="nd-goal">Meta de receita (€) *</Label>
            <Input id="nd-goal" type="number" min={0} value={goalRevenue} onChange={(e) => setGoalRevenue(e.target.value)} placeholder="50000" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nd-avg">Ticket médio (€) *</Label>
            <Input id="nd-avg" type="number" min={0} value={ticketAvg} onChange={(e) => setTicketAvg(e.target.value)} placeholder="25" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nd-budget">Verba total disponível (€)</Label>
            <Input id="nd-budget" type="number" min={0} value={totalBudget} onChange={(e) => setTotalBudget(e.target.value)} placeholder="calcular automaticamente" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nd-roas">ROAS alvo</Label>
            <Input id="nd-roas" type="number" step="0.1" min={0} value={targetRoas} onChange={(e) => setTargetRoas(e.target.value)} placeholder="9" />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Países alvo</Label>
          <div className="flex flex-wrap gap-4">
            {COUNTRY_OPTIONS.map((c) => (
              <label key={c.code} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={countries.includes(c.code)} onCheckedChange={() => toggleCountry(c.code)} />
                {c.label} ({c.code})
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="nd-notes">Notas adicionais</Label>
          <Textarea id="nd-notes" rows={3} value={userNotes} onChange={(e) => setUserNotes(e.target.value)} placeholder="Contexto extra para a IA" />
        </div>
        {expectedPurchases !== null && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> Vendas necessárias: <strong className="text-foreground">{expectedPurchases}</strong> ingressos.
          </div>
        )}
      </Card>

      {/* Herança seletiva */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Herança de criativos (evento)
          </h2>
          <span className="text-xs text-muted-foreground">{inheritIds.size} selecionado(s)</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Criativos da campanha morta + campanhas do mesmo evento. Os <strong>winning</strong> vêm
          pré-selecionados. Não selecionar nada → plano 100% novo (todos os criativos gerados de raiz).
        </p>

        {poolLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A agregar o pool…</div>
        ) : poolErr ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{(poolErr as Error).message}</div>
        ) : poolCreatives.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem criativos no pool do evento — o plano será 100% novo.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleCreatives.map((c) => {
                const checked = inheritIds.has(c.meta_creative_id);
                return (
                  <button
                    type="button"
                    key={c.meta_creative_id}
                    onClick={() => toggleCreative(c.meta_creative_id)}
                    className={cn(
                      "text-left rounded-lg border p-3 flex gap-3 transition-colors",
                      checked ? "border-emerald-500/50 bg-emerald-500/5" : "border-border hover:border-muted-foreground/40",
                    )}
                  >
                    <Checkbox checked={checked} className="mt-0.5 pointer-events-none" />
                    <div className="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                      {c.file_url && (c.type === "image" || c.type === "IMAGE") ? (
                        <img src={c.file_url} alt={c.name ?? ""} className="w-full h-full object-cover" />
                      ) : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className={cn("border text-[9px]", verdictBadge[c.verdict])}>{c.verdict}</Badge>
                        {c.type && <span className="text-[10px] text-muted-foreground">{c.type}</span>}
                      </div>
                      <div className="text-sm font-medium truncate">{c.name ?? c.meta_creative_id}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        ROAS {c.performance.roas != null ? c.performance.roas.toFixed(2) + "x" : "n/a"} · €{c.performance.spend_eur.toFixed(0)} · {c.performance.purchases} compras
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {hiddenLosing > 0 && (
              <Button variant="ghost" size="sm" className="text-[11px] h-7" onClick={() => setShowAll((s) => !s)}>
                {showAll ? "Esconder fracos" : `Mostrar todos (+${hiddenLosing} losing)`}
              </Button>
            )}
          </>
        )}
      </Card>

      {errMsg && (
        <Card className="p-3 border-destructive/40 bg-destructive/5 text-sm text-destructive">
          <pre className="whitespace-pre-wrap font-mono text-xs">{errMsg}</pre>
        </Card>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(`/audience/campaigns/${campaignId}`)} disabled={submitting}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={!canSubmit} className="bg-red-500 hover:bg-red-600 text-white min-w-[280px]">
          {submitting ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {LOADING_STEPS[loadingStep]} (15-30s)</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-2" /> Gerar novo desenho com IA</>
          )}
        </Button>
      </div>
    </div>
  );
}
