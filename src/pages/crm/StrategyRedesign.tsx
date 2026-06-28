// StrategyRedesign — wizard 4 passos de re-design com herança (Sprint 3b).
// Consome crm-meta-redesign-inventory (GET) e crm-meta-campaign-redesign (POST com inheritance_decisions).

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowLeft, ArrowRight, Sparkles, Loader2,
  Image as ImageIcon, Users, Target, AlertTriangle,
  Check, TrendingUp, TrendingDown, Info, FileVideo,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PurchaseAudienceCard from "@/components/crm/PurchaseAudienceCard";


// ============================================================
// Types (matches crm-meta-redesign-inventory output)
// ============================================================
interface CreativeItem {
  meta_creative_id: string;
  name: string | null;
  type: string | null;
  file_url: string | null;
  headline: string | null;
  body: string | null;
  performance: { roas: number | null; spend_eur: number; ctr: number | null; impressions: number; purchases: number; score_ai: number | null };
  verdict: "winning" | "neutral" | "losing";
  reason: string;
  recommended_action: "inherit" | "discard";
}
interface AdsetItem {
  external_adset_id: string;
  name: string;
  optimization_goal: string | null;
  billing_event: string | null;
  targeting_summary: string;
  performance: { roas: number | null; spend_eur: number; purchases: number; frequency: number | null; cpa_eur: number | null; days_active: number; roas_decay_pct: number | null };
  verdict: "winning" | "neutral" | "losing" | "saturated";
  reason: string;
  recommended_action: "inherit" | "discard" | "modify";
}
interface AudienceItem {
  source_adset_id: string;
  type: string;
  description: string;
  verdict: string;
  recommended_action: "inherit" | "create_new";
}
interface GapItem {
  tag: "missing_phase" | "creative_fatigue" | "audience_saturation" | "audience_gap";
  description: string;
  suggested_phase?: string;
  suggested_angle?: string;
  affected_adset_id?: string;
  suggested_audience_type?: string;
}
interface InventoryResponse {
  campaign_summary: {
    external_campaign_id: string;
    name: string;
    status: string;
    effective_status: string | null;
    objective: string | null;
    currency: string;
    roas: number | null;
    spend_eur: number;
    revenue_eur: number;
    purchases: number;
    days_running: number;
    linked_event_id: string | null;
  };
  creatives_inventory: CreativeItem[];
  adsets_inventory: AdsetItem[];
  audiences_inventory: AudienceItem[];
  cross_event_context: {
    event_id: string | null;
    event_name: string | null;
    other_campaigns_same_event: Array<{ external_campaign_id: string; name: string; status: string; roas: number | null; spend_eur: number; purchases: number }>;
    learnings_summary: string | null;
  };
  gaps_detected: GapItem[];
}

const LOADING_STEPS_REDESIGN = [
  "A construir contexto…",
  "A pedir à IA…",
  "A processar plano…",
  "A persistir strategy…",
];

const PAUSE_MODE_LABELS: Record<"immediate" | "delayed_7d" | "manual", { title: string; desc: string; warn?: string }> = {
  immediate: {
    title: "Pausar imediatamente ao fazer deploy",
    desc: "Mais limpo. A nova campanha herda 100% do budget e aprendizagem.",
  },
  delayed_7d: {
    title: "Manter activa 7 dias após deploy (A/B)",
    desc: "Permite comparar lado-a-lado. Cron pausa automaticamente após 7d.",
    warn: "Risco: canibalização Meta entre as duas campanhas. ROAS de ambas pode degradar durante o A/B.",
  },
  manual: {
    title: "Não pausar — eu decido depois",
    desc: "A original continua activa. Tens de a pausar manualmente quando quiseres.",
  },
};

// ============================================================
// Helpers
// ============================================================
function formatRoas(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}x`;
}
function formatEur(v: number | null | undefined): string {
  if (v == null) return "—";
  return `€${v.toFixed(2)}`;
}
function verdictBadgeClass(v: string): string {
  if (v === "winning") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (v === "saturated") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  if (v === "losing") return "bg-red-500/15 text-red-400 border-red-500/30";
  return "bg-muted text-muted-foreground border-border";
}
function gapIcon(tag: GapItem["tag"]) {
  if (tag === "missing_phase") return <Target className="h-4 w-4 text-cyan-400" />;
  if (tag === "creative_fatigue") return <ImageIcon className="h-4 w-4 text-amber-400" />;
  if (tag === "audience_saturation") return <Users className="h-4 w-4 text-amber-400" />;
  return <AlertTriangle className="h-4 w-4 text-red-400" />;
}
function gapTagLabel(tag: GapItem["tag"]): string {
  if (tag === "missing_phase") return "Fase em falta";
  if (tag === "creative_fatigue") return "Fadiga criativa";
  if (tag === "audience_saturation") return "Saturação audience";
  return "Audience gap";
}
function isVideoType(t: string | null | undefined): boolean {
  if (!t) return false;
  return /video|reel|story/i.test(t);
}

// ============================================================
// Page
// ============================================================
export default function CrmStrategyRedesign() {
  const navigate = useNavigate();
  const { campaignId } = useParams<{ campaignId: string }>();

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [inheritCreativeIds, setInheritCreativeIds] = useState<Set<string>>(new Set());
  const [inheritAdsetIds, setInheritAdsetIds] = useState<Set<string>>(new Set());
  const [approvedGaps, setApprovedGaps] = useState<Set<number>>(new Set());
  const [dailyBudgetEur, setDailyBudgetEur] = useState<string>("");
  const [roasFloor, setRoasFloor] = useState<string>("8");
  const [endTime, setEndTime] = useState<string>("");
  const [pauseOriginalMode, setPauseOriginalMode] = useState<"immediate" | "delayed_7d" | "manual">("immediate");

  const [submitting, setSubmitting] = useState(false);
  const [submittingStepIdx, setSubmittingStepIdx] = useState(0);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Redirect se sem campaignId
  useEffect(() => {
    if (!campaignId) navigate("/audience/dashboard", { replace: true });
  }, [campaignId, navigate]);

  // ── Inventory query ──────────────────────────────────────────
  const { data: inventory, isLoading: invLoading, error: invErr, refetch: refetchInventory } = useQuery({
    queryKey: ["redesign-inventory", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("crm-meta-redesign-inventory", {
        body: { campaign_id: campaignId, period_days: 30 },
      });
      if (error) {
        let detail = error.message;
        if ((error as any).context) {
          try {
            const ctx = (error as any).context;
            const b = await (ctx.clone ? ctx.clone() : ctx).json();
            detail = b?.message || b?.detail || b?.error || detail;
          } catch {}
        }
        throw new Error(detail);
      }
      if ((data as any)?.error) throw new Error((data as any).message ?? (data as any).error);
      return data as InventoryResponse;
    },
  });

  // Buscar data do evento linkado para defaults de endTime + verba original.
  const { data: campaignSnap } = useQuery({
    queryKey: ["redesign-campaign-snap", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .schema("crm").from("meta_campaign_snapshot")
        .select("daily_budget_cents, linked_event_id")
        .eq("external_campaign_id", campaignId).maybeSingle();
      return data as { daily_budget_cents: number | null; linked_event_id: string | null } | null;
    },
  });

  const { data: eventDate } = useQuery({
    queryKey: ["redesign-event-date", campaignSnap?.linked_event_id],
    enabled: !!campaignSnap?.linked_event_id,
    queryFn: async () => {
      const { data } = await supabase.from("events")
        .select("date").eq("id", campaignSnap!.linked_event_id!).maybeSingle();
      return (data?.date as string | null) ?? null;
    },
  });

  // ── Populate defaults quando inventory chega ─────────────────
  useEffect(() => {
    if (!inventory) return;
    setInheritCreativeIds(new Set(
      inventory.creatives_inventory.filter((c) => c.recommended_action === "inherit").map((c) => c.meta_creative_id),
    ));
    setInheritAdsetIds(new Set(
      inventory.adsets_inventory.filter((a) => a.recommended_action === "inherit").map((a) => a.external_adset_id),
    ));
    setApprovedGaps(new Set(inventory.gaps_detected.map((_, i) => i)));
  }, [inventory]);

  useEffect(() => {
    if (campaignSnap?.daily_budget_cents != null && !dailyBudgetEur) {
      setDailyBudgetEur((campaignSnap.daily_budget_cents / 100).toFixed(2));
    }
  }, [campaignSnap, dailyBudgetEur]);

  useEffect(() => {
    if (eventDate && !endTime) {
      setEndTime(eventDate.slice(0, 10));
    }
  }, [eventDate, endTime]);

  // ── Toggles ──────────────────────────────────────────────────
  const toggleInheritCreative = (id: string) => {
    setInheritCreativeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleInheritAdset = (id: string) => {
    setInheritAdsetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleGap = (i: number) => {
    setApprovedGaps((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  // ── Submit (passo 4 → chamar redesign + navegar) ─────────────
  const handleSubmit = async () => {
    if (!inventory || !campaignId) return;
    setSubmitting(true);
    setSubmittingStepIdx(0);
    setErrMsg(null);

    // Rotate loading messages
    const tickInterval = setInterval(() => {
      setSubmittingStepIdx((s) => Math.min(s + 1, LOADING_STEPS_REDESIGN.length - 1));
    }, 8000);

    const inh = {
      inherit_creative_ids: [...inheritCreativeIds],
      discard_creative_ids: inventory.creatives_inventory
        .filter((c) => !inheritCreativeIds.has(c.meta_creative_id))
        .map((c) => c.meta_creative_id),
      inherit_adset_ids: [...inheritAdsetIds],
      discard_adset_ids: inventory.adsets_inventory
        .filter((a) => !inheritAdsetIds.has(a.external_adset_id))
        .map((a) => a.external_adset_id),
      new_creatives_to_generate: inventory.gaps_detected
        .map((g, i) => ({ g, i }))
        .filter(({ i }) => approvedGaps.has(i))
        .filter(({ g }) => g.tag === "creative_fatigue" || g.tag === "missing_phase")
        .map(({ g }) => ({
          phase_id: g.suggested_phase ?? "phase_2_conversion",
          angle: g.suggested_angle ?? "auto",
          gap_tag: g.tag,
          justification: g.description,
        })),
      new_audiences_to_create: inventory.gaps_detected
        .map((g, i) => ({ g, i }))
        .filter(({ i }) => approvedGaps.has(i))
        .filter(({ g }) => g.tag === "audience_gap" || g.tag === "audience_saturation")
        .map(({ g }) => ({
          phase_id: "phase_2_conversion",
          type: g.suggested_audience_type ?? "custom_buyers_lookalike",
          description: g.description,
          gap_tag: g.tag,
        })),
    };

    const constraints: any = { keep_original_budget: !dailyBudgetEur };
    if (dailyBudgetEur) {
      const n = parseFloat(dailyBudgetEur.replace(",", "."));
      if (Number.isFinite(n) && n > 0) constraints.daily_budget_cents = Math.round(n * 100);
    }
    if (roasFloor) {
      const r = parseFloat(roasFloor.replace(",", "."));
      if (Number.isFinite(r) && r > 0) constraints.roas_floor = r;
    }
    if (endTime) constraints.end_time = `${endTime}T23:59:59Z`;

    const payload = {
      campaign_id: campaignId,
      period_days: 30,
      inheritance_decisions: inh,
      pause_original_mode: pauseOriginalMode,
      constraints,
    };

    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-campaign-redesign", { body: payload });
      if (error) {
        let detail = error.message;
        if ((error as any).context) {
          try {
            const ctx = (error as any).context;
            const b = await (ctx.clone ? ctx.clone() : ctx).json();
            detail = b?.message || b?.detail || b?.error || detail;
          } catch {}
        }
        throw new Error(detail);
      }
      if ((data as any)?.error) throw new Error((data as any).message ?? (data as any).error);
      if (!(data as any)?.strategy_id) throw new Error("Resposta inválida do servidor (sem strategy_id).");
      clearInterval(tickInterval);
      toast.success("Re-design gerado! A abrir nova strategy…");
      navigate(`/audience/strategies/${(data as any).strategy_id}`);
    } catch (e: any) {
      clearInterval(tickInterval);
      const msg = e?.message ?? "Falha a gerar re-design";
      setErrMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Counts derivados ─────────────────────────────────────────
  const totalCreatives = inventory?.creatives_inventory.length ?? 0;
  const totalAdsets = inventory?.adsets_inventory.length ?? 0;
  const totalGaps = inventory?.gaps_detected.length ?? 0;
  const totalPeers = inventory?.cross_event_context.other_campaigns_same_event.length ?? 0;

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  if (!campaignId) return null;

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 pt-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/audience/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar ao dashboard
        </Button>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-cyan-400" />
          Re-desenhar campanha (com herança)
        </h1>
      </div>

      {invLoading && (
        <Card className="p-8 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <p className="text-sm text-muted-foreground">A construir inventário da campanha…</p>
          <p className="text-xs text-muted-foreground/70">5–10 segundos</p>
        </Card>
      )}

      {invErr && (
        <Card className="p-6 border-red-500/30 bg-red-500/10 space-y-3">
          <p className="text-sm text-red-300">Erro ao carregar inventário: {(invErr as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => refetchInventory()}>Tentar novamente</Button>
        </Card>
      )}

      {inventory && (
        <>
          {/* Stepper */}
          <div className="flex items-center gap-2 flex-wrap">
            {([1, 2, 3, 4] as const).map((n, idx) => (
              <div key={n} className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0",
                    step === n
                      ? "bg-cyan-500 text-white"
                      : step > n
                      ? "bg-cyan-500/20 text-cyan-300"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {step > n ? <Check className="h-4 w-4" /> : n}
                </div>
                <span className={cn("text-sm font-medium", step >= n ? "text-foreground" : "text-muted-foreground")}>
                  {n === 1 && `Inventário (${totalCreatives + totalAdsets})`}
                  {n === 2 && `Lacunas (${totalGaps})`}
                  {n === 3 && "Constraints"}
                  {n === 4 && "Resultado"}
                </span>
                {idx < 3 && <div className="w-6 h-px bg-border mx-1" />}
              </div>
            ))}
          </div>

          {/* Campaign summary card */}
          <Card className="p-4 bg-muted/30">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-xs uppercase text-muted-foreground">Campanha original</p>
                <p className="font-semibold truncate">{inventory.campaign_summary.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                  {inventory.campaign_summary.objective ?? "—"} · {inventory.campaign_summary.effective_status ?? inventory.campaign_summary.status} · {inventory.campaign_summary.days_running}d activa
                </p>
              </div>
              <div className="text-right text-xs tabular-nums">
                <p>
                  ROAS{" "}
                  <span className={cn(
                    "font-semibold font-mono",
                    (inventory.campaign_summary.roas ?? 0) >= 8 ? "text-emerald-400"
                    : (inventory.campaign_summary.roas ?? 0) >= 4 ? "text-amber-400" : "text-red-400",
                  )}>
                    {formatRoas(inventory.campaign_summary.roas)}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  Spend {formatEur(inventory.campaign_summary.spend_eur)} · Rev{" "}
                  <span className="text-emerald-400/90">{formatEur(inventory.campaign_summary.revenue_eur)}</span> · {inventory.campaign_summary.purchases} compras
                </p>
              </div>
            </div>
          </Card>

          {/* ─── STEP 1: Inventário ─── */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Criativos */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4 text-cyan-400" />
                    Criativos ({totalCreatives}) — {inheritCreativeIds.size} selecionados
                  </h2>
                  {totalCreatives > 0 && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => setInheritCreativeIds(new Set(inventory.creatives_inventory.map((c) => c.meta_creative_id)))}>
                        Todos
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => setInheritCreativeIds(new Set())}>
                        Nenhum
                      </Button>
                    </div>
                  )}
                </div>
                {totalCreatives === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum criativo encontrado.</p>
                ) : (
                  <div className="grid gap-2">
                    {inventory.creatives_inventory.map((c) => {
                      const checked = inheritCreativeIds.has(c.meta_creative_id);
                      const isVideo = isVideoType(c.type);
                      return (
                        <div key={c.meta_creative_id} className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                          checked ? "border-cyan-500/30 bg-cyan-500/5" : "border-border",
                        )}>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleInheritCreative(c.meta_creative_id)}
                            className="mt-1"
                            aria-label="Inherit criativo"
                          />
                          <div className="w-16 h-16 rounded bg-muted shrink-0 flex items-center justify-center overflow-hidden">
                            {isVideo ? (
                              <FileVideo className="h-6 w-6 text-muted-foreground" />
                            ) : c.file_url ? (
                              <img src={c.file_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <ImageIcon className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-sm font-medium truncate">
                                {c.name ?? c.meta_creative_id}
                              </span>
                              <Badge variant="outline" className={cn("text-[9px] uppercase", verdictBadgeClass(c.verdict))}>
                                {c.verdict}
                              </Badge>
                              {c.type && <Badge variant="secondary" className="text-[9px]">{c.type}</Badge>}
                            </div>
                            {c.headline && <p className="text-xs text-muted-foreground line-clamp-1">{c.headline}</p>}
                            {c.body && <p className="text-[11px] text-muted-foreground/80 line-clamp-2">{c.body}</p>}
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground/90 tabular-nums">
                              {c.performance.score_ai != null && <span>Score IA: <span className="font-mono">{c.performance.score_ai}/100</span></span>}
                              <span>ROAS {formatRoas(c.performance.roas)}</span>
                              <span>Spend {formatEur(c.performance.spend_eur)}</span>
                              <span>{c.performance.impressions.toLocaleString("pt-PT")} imp</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground/70 mt-0.5">{c.reason}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Adsets */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Target className="h-4 w-4 text-cyan-400" />
                    Adsets ({totalAdsets}) — {inheritAdsetIds.size} selecionados
                  </h2>
                  {totalAdsets > 0 && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => setInheritAdsetIds(new Set(inventory.adsets_inventory.map((a) => a.external_adset_id)))}>
                        Todos
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => setInheritAdsetIds(new Set())}>
                        Nenhum
                      </Button>
                    </div>
                  )}
                </div>
                {totalAdsets === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum adset encontrado.</p>
                ) : (
                  <div className="grid gap-2">
                    {inventory.adsets_inventory.map((a) => {
                      const checked = inheritAdsetIds.has(a.external_adset_id);
                      const decay = a.performance.roas_decay_pct;
                      return (
                        <div key={a.external_adset_id} className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                          checked ? "border-cyan-500/30 bg-cyan-500/5" : "border-border",
                        )}>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleInheritAdset(a.external_adset_id)}
                            className="mt-1"
                            aria-label="Inherit adset"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-sm font-medium truncate">{a.name}</span>
                              {a.optimization_goal && <Badge variant="secondary" className="text-[9px]">{a.optimization_goal}</Badge>}
                              <Badge variant="outline" className={cn("text-[9px] uppercase", verdictBadgeClass(a.verdict))}>
                                {a.verdict}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground/80">{a.targeting_summary}</p>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground/90 tabular-nums flex-wrap">
                              <span>ROAS {formatRoas(a.performance.roas)}</span>
                              <span>Spend {formatEur(a.performance.spend_eur)}</span>
                              <span>Freq {a.performance.frequency != null ? a.performance.frequency.toFixed(2) : "—"}</span>
                              <span>CPA {formatEur(a.performance.cpa_eur)}</span>
                              <span>{a.performance.days_active}d</span>
                              {decay != null && (
                                <span className={cn("flex items-center gap-0.5", decay < 0 ? "text-red-400" : "text-emerald-400")}>
                                  {decay < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                                  {(decay * 100).toFixed(0)}% (7d vs prev)
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground/70 mt-0.5">{a.reason}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Audiences (read-only) */}
              <Card className="p-4 space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-cyan-400" />
                  Audiences detectadas ({inventory.audiences_inventory.length})
                </h2>
                {inventory.audiences_inventory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem audiences identificadas a partir dos adsets winning.</p>
                ) : (
                  <div className="space-y-1.5">
                    {inventory.audiences_inventory.map((au, i) => (
                      <div key={`${au.source_adset_id}-${i}`} className="flex items-center gap-2 text-xs flex-wrap">
                        <Badge variant="secondary" className="text-[9px] uppercase">{au.type}</Badge>
                        <span className="truncate">{au.description}</span>
                        <Badge variant="outline" className={cn("text-[9px] uppercase ml-auto", verdictBadgeClass(au.verdict))}>{au.verdict}</Badge>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground/70 italic pt-1">As audiences seguem os adsets que escolheres manter.</p>
              </Card>
            </div>
          )}

          {/* ─── STEP 2: Lacunas + Cross-event ─── */}
          {step === 2 && (
            <div className="space-y-5">
              {totalPeers > 0 && (
                <Card className="p-4 border-cyan-500/30 bg-cyan-500/5 space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                    <Info className="h-4 w-4" />
                    Contexto cross-event{inventory.cross_event_context.event_name ? ` — ${inventory.cross_event_context.event_name}` : ""}
                  </h2>
                  <div className="space-y-1.5">
                    {inventory.cross_event_context.other_campaigns_same_event.map((p) => (
                      <div key={p.external_campaign_id} className="flex items-center gap-2 text-xs flex-wrap tabular-nums">
                        <Badge variant="outline" className="text-[9px] uppercase">{p.status}</Badge>
                        <span className="truncate flex-1">{p.name}</span>
                        <span className="text-muted-foreground">ROAS {formatRoas(p.roas)} · {formatEur(p.spend_eur)} · {p.purchases} compras</span>
                      </div>
                    ))}
                  </div>
                  {inventory.cross_event_context.learnings_summary && (
                    <>
                      <Separator className="my-2" />
                      <p className="text-xs italic text-cyan-200/80">{inventory.cross_event_context.learnings_summary}</p>
                    </>
                  )}
                </Card>
              )}

              <Card className="p-4 space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Lacunas detectadas ({totalGaps}) — {approvedGaps.size} aprovadas
                </h2>
                {totalGaps === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma lacuna detectada — a campanha cobre bem fases e audiences. Continua para o próximo passo.</p>
                ) : (
                  <div className="grid gap-2">
                    {inventory.gaps_detected.map((g, i) => {
                      const checked = approvedGaps.has(i);
                      return (
                        <div key={i} className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                          checked ? "border-amber-500/30 bg-amber-500/5" : "border-border",
                        )}>
                          <Checkbox checked={checked} onCheckedChange={() => toggleGap(i)} className="mt-0.5" aria-label="Aprovar lacuna" />
                          <div className="shrink-0 mt-0.5">{gapIcon(g.tag)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Badge variant="outline" className="text-[9px] uppercase border-amber-500/30 text-amber-300 bg-amber-500/10">
                                {gapTagLabel(g.tag)}
                              </Badge>
                            </div>
                            <p className="text-sm">{g.description}</p>
                            {g.suggested_phase && <p className="text-[11px] text-muted-foreground/80 mt-1">Sugestão: criar fase <span className="font-mono text-cyan-400">{g.suggested_phase}</span></p>}
                            {g.suggested_angle && <p className="text-[11px] text-muted-foreground/80 mt-1">Sugestão: angle <span className="font-mono text-cyan-400">{g.suggested_angle}</span></p>}
                            {g.suggested_audience_type && <p className="text-[11px] text-muted-foreground/80 mt-1">Sugestão: audience type <span className="font-mono text-cyan-400">{g.suggested_audience_type}</span></p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ─── STEP 3: Constraints ─── */}
          {step === 3 && (
            <div className="space-y-5">
              <Card className="p-4 space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Constraints</h2>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="rd-budget" className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                      Verba diária (€)
                      <Tooltip>
                        <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">Distribuído pelas fases. Default = mesma verba da original.</TooltipContent>
                      </Tooltip>
                    </Label>
                    <Input id="rd-budget" type="number" step="0.01" value={dailyBudgetEur} onChange={(e) => setDailyBudgetEur(e.target.value)} placeholder="ex: 50.00" className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="rd-roas" className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                      ROAS floor
                      <Tooltip>
                        <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">Cada adset deve entregar pelo menos este ROAS. Target blended do evento é normalmente 8x.</TooltipContent>
                      </Tooltip>
                    </Label>
                    <Input id="rd-roas" type="number" step="0.5" value={roasFloor} onChange={(e) => setRoasFloor(e.target.value)} placeholder="8" className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="rd-end" className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                      Data de fim
                      <Tooltip>
                        <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">Quando a campanha pára. Default = data do evento.</TooltipContent>
                      </Tooltip>
                    </Label>
                    <Input id="rd-end" type="date" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1" />
                  </div>
                </div>
              </Card>

              {campaignSnap?.linked_event_id ? (
                <PurchaseAudienceCard eventId={campaignSnap.linked_event_id} variant="inline" />
              ) : null}


              <Card className="p-4 space-y-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pause original</h2>
                  <p className="text-xs text-muted-foreground mt-1">Esta campanha será substituída pela nova. Escolhe quando a original deve ser pausada.</p>
                </div>
                <RadioGroup value={pauseOriginalMode} onValueChange={(v) => setPauseOriginalMode(v as any)} className="space-y-2">
                  {(["immediate", "delayed_7d", "manual"] as const).map((mode) => {
                    const conf = PAUSE_MODE_LABELS[mode];
                    return (
                      <label
                        key={mode}
                        htmlFor={`pause-${mode}`}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                          pauseOriginalMode === mode ? "border-cyan-500/40 bg-cyan-500/5" : "border-border hover:bg-muted/40",
                        )}
                      >
                        <RadioGroupItem id={`pause-${mode}`} value={mode} className="mt-1" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{conf.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{conf.desc}</p>
                          {conf.warn && (
                            <p className="text-[11px] text-amber-400 mt-1 flex items-start gap-1">
                              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {conf.warn}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </RadioGroup>
              </Card>
            </div>
          )}

          {/* ─── STEP 4: Resultado ─── */}
          {step === 4 && (
            <div className="space-y-5">
              <Card className="p-4 space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Resumo das decisões</h2>
                <div className="grid gap-2 sm:grid-cols-2 text-sm">
                  <div className="p-3 rounded-lg border border-border bg-muted/30">
                    <p className="text-xs text-muted-foreground">Criativos a manter</p>
                    <p className="text-2xl font-bold tabular-nums">{inheritCreativeIds.size}<span className="text-base text-muted-foreground">/{totalCreatives}</span></p>
                  </div>
                  <div className="p-3 rounded-lg border border-border bg-muted/30">
                    <p className="text-xs text-muted-foreground">Adsets a manter</p>
                    <p className="text-2xl font-bold tabular-nums">{inheritAdsetIds.size}<span className="text-base text-muted-foreground">/{totalAdsets}</span></p>
                  </div>
                  <div className="p-3 rounded-lg border border-border bg-muted/30">
                    <p className="text-xs text-muted-foreground">Lacunas a preencher</p>
                    <p className="text-2xl font-bold tabular-nums">{approvedGaps.size}<span className="text-base text-muted-foreground">/{totalGaps}</span></p>
                  </div>
                  <div className="p-3 rounded-lg border border-border bg-muted/30">
                    <p className="text-xs text-muted-foreground">Cross-event peers</p>
                    <p className="text-2xl font-bold tabular-nums">{totalPeers}</p>
                  </div>
                </div>
                <Separator />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• Verba diária: <span className="font-mono text-foreground">{dailyBudgetEur ? `€${dailyBudgetEur}` : "(manter original)"}</span></p>
                  <p>• ROAS floor: <span className="font-mono text-foreground">{roasFloor || "—"}x</span></p>
                  <p>• End: <span className="font-mono text-foreground">{endTime || "(não definido)"}</span></p>
                  <p>• Pause original: <span className="font-mono text-foreground">{PAUSE_MODE_LABELS[pauseOriginalMode].title}</span></p>
                </div>
              </Card>

              {errMsg && (
                <Card className="p-4 border-red-500/30 bg-red-500/10">
                  <p className="text-sm text-red-300">{errMsg}</p>
                </Card>
              )}

              {submitting && (
                <Card className="p-4 border-cyan-500/30 bg-cyan-500/5 flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                  <p className="text-sm">{LOADING_STEPS_REDESIGN[submittingStepIdx]}</p>
                </Card>
              )}
            </div>
          )}

          {/* Footer nav */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (step === 1) navigate("/audience/dashboard");
                else setStep((step - 1) as 1 | 2 | 3);
              }}
              disabled={submitting}
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" /> {step === 1 ? "Cancelar" : "Voltar"}
            </Button>

            <span className="text-xs text-muted-foreground">Passo {step}/4</span>

            {step < 4 ? (
              <Button size="sm" onClick={() => setStep((step + 1) as 2 | 3 | 4)}>
                Avançar <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                Gerar redesign
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
