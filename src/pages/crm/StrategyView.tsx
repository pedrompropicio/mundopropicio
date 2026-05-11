import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Loader2, Brain, Copy, Check, Archive, Target, Calendar, Mic2,
  AlertTriangle, Sparkles, ChevronDown, ChevronUp, Pencil, RefreshCw, FileDown, Trash2, Zap,
  Plus, X as XIcon, ImageIcon as Image2,
  Rocket, ExternalLink, CheckCircle2, XCircle, AlertCircle, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { statusLabel, STRATEGY_STATUS_OPTIONS } from "@/lib/strategy-status";

const feasibilityStyles: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  low: "bg-orange-500/15 text-orange-400 border-orange-500/40",
  impossible: "bg-red-500/15 text-red-400 border-red-500/40",
};

const severityStyles: Record<string, string> = {
  high: "bg-red-500/15 text-red-400 border-red-500/40",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  low: "bg-blue-500/15 text-blue-400 border-blue-500/40",
};

const statusStyles: Record<string, string> = {
  draft: "bg-muted/40 text-muted-foreground border-border",
  generated: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  in_progress: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  completed: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  archived: "bg-muted/40 text-muted-foreground border-border opacity-60",
};

const PHASE_BORDERS = ["border-cyan-500", "border-blue-500", "border-violet-500", "border-amber-500", "border-emerald-500"];

function fmtEur(n: number | null | undefined, frac = 0) {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: frac });
}
function fmtNum(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("pt-PT", { maximumFractionDigits: 2 });
}

export default function CrmStrategyView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState<string>("draft");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorPhaseId, setSelectorPhaseId] = useState<string | null>(null);
  const [selectedCreativeIds, setSelectedCreativeIds] = useState<Set<string>>(new Set());
  const [deployOpen, setDeployOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<any>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-strategy", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_strategies")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      let event: any = null;
      if (data.event_id) {
        const { data: e } = await supabase.from("events").select("id, name, date").eq("id", data.event_id).maybeSingle();
        event = e ?? null;
      }
      return { ...data, event };
    },
  });

  const { data: associations } = useQuery({
    queryKey: ["crm-strategy-creatives", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_strategy_creatives")
        .select("id, creative_id, phase_id, position, meta_creatives:creative_id(id, name, type, file_url, duration_seconds)")
        .eq("strategy_id", id)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const associationsByPhase = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const a of associations ?? []) {
      const key = a.phase_id ?? "_global";
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [associations]);

  const { data: allCreatives } = useQuery({
    queryKey: ["crm-creatives-for-selector"],
    enabled: selectorOpen,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_creatives")
        .select("id, name, type, file_url, duration_seconds, headline")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: connection } = useQuery({
    queryKey: ["crm-active-connection", data?.connection_id],
    enabled: !!data?.connection_id,
    queryFn: async () => {
      const { data: c, error } = await (supabase as any)
        .schema("crm")
        .from("ad_platform_connections")
        .select("id, status, selected_ad_account_id, selected_ad_account_name, selected_page_id, selected_instagram_id, expires_at")
        .eq("id", data.connection_id)
        .maybeSingle();
      if (error) throw error;
      return c;
    },
  });

  const { data: deployments } = useQuery({
    queryKey: ["crm-strategy-deployments", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_strategy_deployments")
        .select("id, status, ad_account_id, meta_campaign_ids, meta_adset_ids, meta_ad_ids, error_summary, started_at, completed_at, duration_ms, created_at")
        .eq("strategy_id", id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const plan = data?.generated_plan as any;

  const phasesById = useMemo(() => {
    const map = new Map<string, any[]>();
    if (!plan?.recommended_campaigns) return map;
    for (const c of plan.recommended_campaigns) {
      const arr = map.get(c.phase_id) ?? [];
      arr.push(c);
      map.set(c.phase_id, arr);
    }
    return map;
  }, [plan]);

  const handleApprove = async () => {
    if (!data || !user) return;
    setActionLoading(true);
    try {
      const { error } = await (supabase as any).schema("crm").from("meta_campaign_strategies")
        .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user.id })
        .eq("id", data.id);
      if (error) throw error;
      toast.success("Estratégia aprovada");
      queryClient.invalidateQueries({ queryKey: ["crm-strategy", id] });
      queryClient.invalidateQueries({ queryKey: ["crm-strategies-list"] });
    } catch (e: any) {
      toast.error(e?.message || "Erro a aprovar");
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!data) return;
    if (!confirm("Arquivar esta estratégia?")) return;
    setActionLoading(true);
    try {
      const { error } = await (supabase as any).schema("crm").from("meta_campaign_strategies")
        .update({ status: "archived" }).eq("id", data.id);
      if (error) throw error;
      toast.success("Estratégia arquivada");
      queryClient.invalidateQueries({ queryKey: ["crm-strategy", id] });
      queryClient.invalidateQueries({ queryKey: ["crm-strategies-list"] });
    } catch (e: any) {
      toast.error(e?.message || "Erro a arquivar");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyJson = async () => {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(plan, null, 2));
      setCopied(true);
      toast.success("JSON copiado para o clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const openEdit = () => {
    if (!data) return;
    setEditName(data.name ?? "");
    setEditStatus(data.status ?? "draft");
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!data) return;
    setActionLoading(true);
    try {
      const { error } = await (supabase as any).schema("crm").from("meta_campaign_strategies")
        .update({ name: editName, status: editStatus }).eq("id", data.id);
      if (error) throw error;
      toast.success("Estratégia atualizada");
      queryClient.invalidateQueries({ queryKey: ["crm-strategy", id] });
      queryClient.invalidateQueries({ queryKey: ["crm-strategies-list"] });
      setEditOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro a guardar");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!data) return;
    setActionLoading(true);
    try {
      const { error } = await (supabase as any).schema("crm").from("meta_campaign_strategies")
        .delete().eq("id", data.id);
      if (error) throw error;
      toast.success("Estratégia apagada");
      queryClient.invalidateQueries({ queryKey: ["crm-strategies-list"] });
      navigate("/audience/strategies");
    } catch (e: any) {
      toast.error(e?.message || "Erro a apagar");
      setActionLoading(false);
    }
  };

  const handleOpenSelector = (phaseId: string) => {
    setSelectorPhaseId(phaseId);
    setSelectedCreativeIds(new Set());
    setSelectorOpen(true);
  };

  const handleAddCreatives = async () => {
    if (!selectorPhaseId || !data || selectedCreativeIds.size === 0 || !user) return;
    setActionLoading(true);
    try {
      const rows = Array.from(selectedCreativeIds).map((creativeId, idx) => ({
        company_id: data.company_id,
        strategy_id: data.id,
        creative_id: creativeId,
        phase_id: selectorPhaseId,
        position: idx,
        created_by: user.id,
      }));
      const { error } = await (supabase as any)
        .schema("crm")
        .from("meta_strategy_creatives")
        .insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} criativo(s) adicionado(s)`);
      queryClient.invalidateQueries({ queryKey: ["crm-strategy-creatives", id] });
      setSelectorOpen(false);
    } catch (e: any) {
      toast.error("Falha a adicionar", { description: e?.message ?? String(e) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveAssociation = async (associationId: string) => {
    setActionLoading(true);
    try {
      const { error } = await (supabase as any)
        .schema("crm")
        .from("meta_strategy_creatives")
        .delete()
        .eq("id", associationId);
      if (error) throw error;
      toast.success("Criativo removido");
      queryClient.invalidateQueries({ queryKey: ["crm-strategy-creatives", id] });
    } catch (e: any) {
      toast.error("Falha a remover", { description: e?.message ?? String(e) });
    } finally {
      setActionLoading(false);
    }
  };

  const deployChecks = useMemo(() => {
    const checks: { label: string; ok: boolean; detail?: string }[] = [];
    checks.push({
      label: "Conexão Meta ativa",
      ok: connection?.status === "active",
      detail: connection?.status === "active" ? connection.selected_ad_account_name ?? "" : "Vai a /audience/connections",
    });
    checks.push({
      label: "Page do Facebook selecionada",
      ok: !!connection?.selected_page_id,
      detail: connection?.selected_page_id ? "✓" : "Seleciona uma Page em /audience/connections",
    });
    checks.push({
      label: "Instagram associado",
      ok: !!connection?.selected_instagram_id,
      detail: connection?.selected_instagram_id ? "✓ (ads no IG ativos)" : "Opcional — sem IG, ads só no Facebook",
    });
    const phasesWithoutCreatives: string[] = [];
    for (const phase of plan?.phases ?? []) {
      const hasCreatives = (associationsByPhase.get(phase.id) ?? []).length > 0;
      if (!hasCreatives) phasesWithoutCreatives.push(phase.name);
    }
    checks.push({
      label: `Criativos em todas as fases (${(plan?.phases?.length ?? 0) - phasesWithoutCreatives.length}/${plan?.phases?.length ?? 0})`,
      ok: phasesWithoutCreatives.length === 0,
      detail: phasesWithoutCreatives.length === 0 ? "✓" : `Em falta: ${phasesWithoutCreatives.join(", ")}`,
    });
    return checks;
  }, [connection, plan, associationsByPhase]);

  const canDeploy = deployChecks.filter((c) => c.label !== "Instagram associado").every((c) => c.ok);

  const deployEstimate = useMemo(() => {
    let campaigns = 0, adsets = 0, ads = 0;
    for (const phase of plan?.phases ?? []) {
      const phaseCreatives = associationsByPhase.get(phase.id) ?? [];
      if (phaseCreatives.length === 0) continue;
      const phaseCampaigns = (plan?.recommended_campaigns ?? []).filter((c: any) => c.phase_id === phase.id);
      campaigns += phaseCampaigns.length;
      for (const c of phaseCampaigns) {
        const phaseAdsets = (c.adsets ?? []).length;
        adsets += phaseAdsets;
        ads += phaseAdsets * phaseCreatives.length;
      }
    }
    return { campaigns, adsets, ads };
  }, [plan, associationsByPhase]);

  const handleDeploy = async () => {
    if (!data || isDeploying) return;
    setIsDeploying(true);
    setDeployResult(null);
    try {
      const { data: resp, error } = await supabase.functions.invoke(
        "crm-meta-strategy-deploy",
        { body: { strategy_id: data.id } }
      );
      if (error) {
        let detail = error.message;
        if ((error as any).context) {
          try {
            const ctx = (error as any).context;
            const b = await (ctx.clone ? ctx.clone() : ctx).json();
            detail = `[${b?.error || "?"}] ${b?.message || b?.detail || detail}`;
          } catch {}
        }
        throw new Error(detail);
      }
      setDeployResult(resp);
      if (resp.status === "success") {
        toast.success(`Deploy concluído: ${resp.summary?.ads_created ?? 0} ads criados`);
      } else if (resp.status === "partial") {
        toast.warning(`Deploy parcial: ${resp.summary?.ads_created ?? 0} ads criados, ${resp.summary?.errors ?? 0} erros`);
      } else {
        toast.error("Deploy falhou — vê os logs no histórico");
      }
      queryClient.invalidateQueries({ queryKey: ["crm-strategy", id] });
      queryClient.invalidateQueries({ queryKey: ["crm-strategy-deployments", id] });
    } catch (e: any) {
      toast.error("Falha no deploy", { description: e?.message ?? String(e) });
      setDeployResult({ status: "failed", error: e?.message });
    } finally {
      setIsDeploying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> A carregar estratégia…
      </div>
    );
  }
  if (error) return <Card className="p-4 border-destructive/40 bg-destructive/5 text-sm text-destructive">{(error as Error).message}</Card>;
  if (!data) return <Card className="p-4">Estratégia não encontrada.</Card>;
  if (!plan) return <Card className="p-4 border-amber-500/40 bg-amber-500/5">Esta estratégia ainda não tem plano gerado.</Card>;

  const summary = plan.summary ?? {};
  const phases: any[] = plan.phases ?? [];
  const scaling: any[] = plan.scaling_rules ?? [];
  const kpis = plan.kpis_global ?? {};
  const risks: any[] = plan.risks_and_warnings ?? [];
  const brief = plan.creative_brief ?? {};
  

  return (
    <div className="space-y-6">
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => navigate("/audience/strategies")} className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Estratégias
        </button>
        <span>›</span>
        <span className="text-foreground truncate">{data.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <Brain className="h-5 w-5 text-cyan-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold truncate">{data.name}</h1>
              <Badge variant="outline" className={cn("text-[10px] uppercase", statusStyles[data.status] ?? statusStyles.draft)}>
                {statusLabel(data.status)}
              </Badge>
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> Meta: <span className="text-foreground font-medium">{fmtEur(data.goal_revenue_eur)}</span></span>
              {data.event && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> {data.event.name} {data.days_until_event != null && <>({data.days_until_event}d)</>}
                </span>
              )}
              {data.detected_artist && (
                <span className="flex items-center gap-1.5"><Mic2 className="h-3.5 w-3.5" /> {data.detected_artist}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Pencil className="h-4 w-4 mr-1.5" /> Editar
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/audience/strategies/new?from=${data.id}`)}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Regenerar
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/audience/strategies/${data.id}/print`, "_blank")}>
            <FileDown className="h-4 w-4 mr-1.5" /> Exportar PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyJson}>
            <Copy className="h-4 w-4 mr-1.5" /> {copied ? "Copiado!" : "Copiar JSON"}
          </Button>
          {data.status === "generated" && (
            <Button onClick={handleApprove} disabled={actionLoading} className="bg-emerald-500 hover:bg-emerald-600 text-white" size="sm">
              <Check className="h-4 w-4 mr-1.5" /> Aprovar
            </Button>
          )}
          {data.status !== "archived" && (
            <Button variant="outline" size="sm" onClick={handleArchive} disabled={actionLoading}>
              <Archive className="h-4 w-4 mr-1.5" /> Arquivar
            </Button>
          )}
          {data.status === "archived" && (
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-4 w-4 mr-1.5" /> Apagar
            </Button>
          )}
        </div>
      </div>

      {/* Summary */}
      <Card className="p-5 border-cyan-500/30 bg-cyan-500/[0.03]">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="flex items-center gap-3">
            <Badge className={cn("text-xs uppercase border", feasibilityStyles[summary.feasibility] ?? "bg-muted/40")}>
              Viabilidade: {summary.feasibility ?? "—"}
            </Badge>
            {summary.confidence && (
              <span className="text-xs text-muted-foreground">Confiança: {summary.confidence}</span>
            )}
          </div>
        </div>
        {summary.feasibility_reason && (
          <p className="text-sm text-muted-foreground mb-4">{summary.feasibility_reason}</p>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPI label="Verba recomendada" value={fmtEur(summary.recommended_total_budget_eur)} />
          <KPI label="Compras esperadas" value={fmtNum(summary.expected_purchases)} />
          <KPI label="Receita esperada" value={fmtEur(summary.expected_revenue_eur)} />
          <KPI label="ROAS esperado" value={summary.expected_overall_roas != null ? `${fmtNum(summary.expected_overall_roas)}x` : "—"} />
        </div>
        {summary.expected_cpa_eur != null && (
          <div className="mt-3 text-xs text-muted-foreground">CPA esperado: <span className="text-foreground font-medium">{fmtEur(summary.expected_cpa_eur, 2)}</span></div>
        )}
      </Card>

      {/* Phases */}
      {phases.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Fases</h2>
          <div className="grid gap-3">
            {phases.map((p: any, idx: number) => {
              const border = PHASE_BORDERS[idx % PHASE_BORDERS.length];
              const camps = phasesById.get(p.id) ?? [];
              return (
                <Card key={p.id ?? idx} className={cn("p-4 border-l-4", border)}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Fase {idx + 1}</div>
                      <h3 className="text-base font-semibold">{p.name}</h3>
                      <div className="text-xs text-muted-foreground mt-1">
                        D-{p.days_from_event_start} → D-{p.days_from_event_end} ({p.duration_days}d) · {p.objective}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="text-muted-foreground">Daily / Total</div>
                      <div className="font-semibold">{fmtEur(p.daily_budget_eur, 0)} / {fmtEur(p.total_phase_budget_eur, 0)}</div>
                    </div>
                  </div>

                  {p.primary_audiences?.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Audiences</div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.primary_audiences.map((a: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-[11px]">
                            {a.type}: {a.description} {a.estimated_size && <span className="text-muted-foreground ml-1">({a.estimated_size})</span>}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {p.creative_focus && (
                    <div className="mt-3">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Criativo</div>
                      <Badge variant="outline" className="text-[11px]">{p.creative_focus}</Badge>
                    </div>
                  )}

                  {p.target_kpis && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <MiniStat label="CPM máx" value={p.target_kpis.cpm_eur_max != null ? fmtEur(p.target_kpis.cpm_eur_max, 2) : "—"} />
                      <MiniStat label="CTR mín" value={p.target_kpis.ctr_pct_min != null ? `${p.target_kpis.ctr_pct_min}%` : "—"} />
                      <MiniStat label="CPA máx" value={p.target_kpis.cpa_eur_max != null ? fmtEur(p.target_kpis.cpa_eur_max, 2) : "—"} />
                      <MiniStat label="ROAS mín" value={p.target_kpis.roas_min != null ? `${p.target_kpis.roas_min}x` : "—"} />
                    </div>
                  )}

                  {p.success_criteria_to_next_phase && (
                    <div className="mt-3 text-xs text-muted-foreground">
                      → Passa à próxima fase quando: <span className="text-foreground">{p.success_criteria_to_next_phase}</span>
                    </div>
                  )}

                  {p.learning_phase_note && (
                    <div className="mt-2 text-[11px] text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
                      {p.learning_phase_note}
                    </div>
                  )}

                  {camps.length > 0 && (
                    <div className="mt-4 border-t border-border pt-3">
                      <button
                        onClick={() => setExpandedCampaigns((s) => ({ ...s, [p.id]: !s[p.id] }))}
                        className="flex items-center gap-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300"
                      >
                        {expandedCampaigns[p.id] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        Campanhas recomendadas ({camps.length})
                      </button>
                      {expandedCampaigns[p.id] && (
                        <div className="mt-3 space-y-3">
                          {camps.map((c: any, ci: number) => (
                            <div key={ci} className="rounded border border-border p-3 text-xs space-y-1.5">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="font-medium">{c.campaign_name}</div>
                                <div className="text-muted-foreground">{c.objective} · {fmtEur(c.daily_budget_eur, 0)}/dia · {c.duration_days}d</div>
                              </div>
                              {c.adsets?.map((a: any, ai: number) => (
                                <div key={ai} className="rounded bg-muted/30 p-2">
                                  <div className="font-medium">{a.adset_name}</div>
                                  <div className="text-muted-foreground">opt: {a.optimization_goal} · billing: {a.billing_event} · creative: {a.creative_type_recommended}</div>
                                  <pre className="mt-1.5 overflow-x-auto text-[10px] bg-background/50 rounded p-2 border border-border">{JSON.stringify(a.targeting_json, null, 2)}</pre>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 border-t border-border pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Image2 className="h-3.5 w-3.5" /> Criativos para esta fase
                        {(associationsByPhase.get(p.id) ?? []).length > 0 && (
                          <span className="text-foreground">({(associationsByPhase.get(p.id) ?? []).length})</span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-cyan-400 hover:text-cyan-300"
                        onClick={() => handleOpenSelector(p.id)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                      </Button>
                    </div>

                    {(associationsByPhase.get(p.id) ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        Sem criativos associados. Adiciona pelo menos 1 para poder fazer deploy desta fase.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(associationsByPhase.get(p.id) ?? []).map((assoc: any) => {
                          const c = assoc.meta_creatives;
                          if (!c) return null;
                          return (
                            <div key={assoc.id} className="group relative rounded border border-border bg-muted/30 overflow-hidden w-24">
                              <div className="aspect-square bg-muted overflow-hidden">
                                {c.type === "video" ? (
                                  <video src={c.file_url} className="w-full h-full object-cover" muted playsInline />
                                ) : (
                                  <img src={c.file_url} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                                )}
                              </div>
                              <div className="px-1.5 py-1 text-[10px] truncate" title={c.name}>{c.name}</div>
                              <button
                                onClick={() => handleRemoveAssociation(assoc.id)}
                                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remover"
                                disabled={actionLoading}
                              >
                                <XIcon className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Scaling rules */}
      {scaling.length > 0 && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-3">Regras de scaling</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left py-2 pr-3">Trigger</th>
                  <th className="text-left py-2 pr-3">Action</th>
                  <th className="text-left py-2">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {scaling.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 align-top">{r.trigger}</td>
                    <td className="py-2 pr-3 align-top font-medium">{r.action}</td>
                    <td className="py-2 align-top text-muted-foreground">{r.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Global KPIs */}
      {kpis && Object.keys(kpis).length > 0 && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-3">KPIs globais esperados</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KPI label="Impressões" value={fmtNum(kpis.expected_total_impressions)} />
            <KPI label="Reach" value={fmtNum(kpis.expected_total_reach)} />
            <KPI label="Clicks" value={fmtNum(kpis.expected_total_clicks)} />
            <KPI label="Frequência" value={fmtNum(kpis.expected_avg_frequency)} />
            <KPI label="Compras" value={fmtNum(kpis.expected_total_purchases)} />
          </div>
        </Card>
      )}

      {/* Risks */}
      {risks.length > 0 && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" /> Riscos & avisos
          </h2>
          <div className="space-y-2">
            {risks.map((r: any, i: number) => (
              <div key={i} className="rounded border border-border p-3 flex items-start gap-3">
                <Badge variant="outline" className={cn("text-[10px] uppercase shrink-0", severityStyles[r.severity] ?? "")}>
                  {r.severity}
                </Badge>
                <div className="text-sm min-w-0">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-muted-foreground">{r.description}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Creative brief */}
      {brief && Object.keys(brief).length > 0 && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-400" /> Creative brief
          </h2>
          {brief.primary_message && (
            <div className="rounded bg-cyan-500/[0.05] border border-cyan-500/20 p-3 mb-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Mensagem central</div>
              <div className="text-sm font-medium">{brief.primary_message}</div>
            </div>
          )}
          {brief.tone && <div className="text-sm mb-3"><span className="text-muted-foreground">Tom: </span>{brief.tone}</div>}
          {brief.must_include?.length > 0 && (
            <div className="mb-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Deve incluir</div>
              <div className="flex flex-wrap gap-1.5">
                {brief.must_include.map((x: string, i: number) => (
                  <Badge key={i} variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[11px]">{x}</Badge>
                ))}
              </div>
            </div>
          )}
          {brief.avoid?.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Evitar</div>
              <div className="flex flex-wrap gap-1.5">
                {brief.avoid.map((x: string, i: number) => (
                  <Badge key={i} variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-[11px]">{x}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Next steps - Deploy real */}
      <Card className="p-5 border-cyan-500/30 bg-cyan-500/[0.03]">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Rocket className="h-4 w-4 text-cyan-400" /> Deploy para Meta
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Cria automaticamente todas as campanhas, conjuntos de anúncios e anúncios no Meta. Tudo em PAUSED — ativas manualmente no Ads Manager depois de rever.
        </p>

        <div className="space-y-1.5 mb-4">
          {deployChecks.map((check, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {check.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
              ) : check.label === "Instagram associado" ? (
                <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <div className="font-medium">{check.label}</div>
                {check.detail && <div className="text-muted-foreground text-[11px]">{check.detail}</div>}
              </div>
            </div>
          ))}
        </div>

        {canDeploy && (
          <div className="rounded border border-border bg-muted/30 p-3 mb-4 text-xs space-y-0.5">
            <div className="font-medium mb-1">Vai criar no Meta:</div>
            <div className="text-muted-foreground">
              <strong className="text-foreground">{deployEstimate.campaigns}</strong> Campanhas ·{" "}
              <strong className="text-foreground">{deployEstimate.adsets}</strong> AdSets ·{" "}
              <strong className="text-foreground">{deployEstimate.ads}</strong> Anúncios
            </div>
            <div className="text-[11px] text-amber-400 mt-1.5">
              ⚠ Tudo criado em status PAUSED. Tens de ativar manualmente no Ads Manager.
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setDeployOpen(true)}
            disabled={!canDeploy || isDeploying}
            className="bg-cyan-500 hover:bg-cyan-600 text-white"
          >
            {isDeploying ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> A deployar…</>
            ) : (
              <><Rocket className="h-4 w-4 mr-1.5" /> Deploy para Meta</>
            )}
          </Button>
          <Button variant="outline" onClick={handleCopyJson}>
            <Copy className="h-4 w-4 mr-1.5" /> {copied ? "Copiado!" : "Copiar plano (JSON)"}
          </Button>
        </div>

        {plan.automation_metadata?.requires_manual_setup?.length > 0 && (
          <div className="mt-4 text-xs text-muted-foreground">
            <strong className="text-foreground">Antes de deployar, garante que existe no Business Manager:</strong>
            <ul className="list-disc list-inside mt-1.5 space-y-0.5">
              {plan.automation_metadata.requires_manual_setup.map((item: string, i: number) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Histórico de Deployments */}
      {deployments && deployments.length > 0 && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-3">Histórico de Deployments</h2>
          <div className="space-y-2">
            {deployments.map((d: any) => {
              const statusColors: Record<string, string> = {
                success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/40",
                partial: "bg-amber-500/10 text-amber-400 border-amber-500/40",
                failed: "bg-red-500/10 text-red-400 border-red-500/40",
                running: "bg-blue-500/10 text-blue-400 border-blue-500/40",
                pending: "bg-muted/40 text-muted-foreground border-border",
              };
              const statusLabels: Record<string, string> = {
                success: "Sucesso",
                partial: "Parcial",
                failed: "Falhou",
                running: "Em curso",
                pending: "Pendente",
              };
              const StatusIcon = d.status === "success" ? CheckCircle2 : d.status === "failed" ? XCircle : d.status === "partial" ? AlertCircle : Clock;
              const campaignsCount = Array.isArray(d.meta_campaign_ids) ? d.meta_campaign_ids.length : 0;
              const adsetsCount = Array.isArray(d.meta_adset_ids) ? d.meta_adset_ids.length : 0;
              const adsCount = Array.isArray(d.meta_ad_ids) ? d.meta_ad_ids.length : 0;
              const adsMgrUrl = `https://business.facebook.com/adsmanager/manage/campaigns?act=${d.ad_account_id.replace("act_", "")}`;
              return (
                <div key={d.id} className="rounded border border-border p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("text-[10px] uppercase border", statusColors[d.status])}>
                        <StatusIcon className="h-3 w-3 mr-1" /> {statusLabels[d.status] ?? d.status}
                      </Badge>
                      <span className="text-muted-foreground">
                        {new Date(d.created_at).toLocaleString("pt-PT")}
                      </span>
                    </div>
                    {d.duration_ms && (
                      <span className="text-[10px] text-muted-foreground">
                        {(d.duration_ms / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    <strong className="text-foreground">{campaignsCount}</strong> campanhas ·{" "}
                    <strong className="text-foreground">{adsetsCount}</strong> adsets ·{" "}
                    <strong className="text-foreground">{adsCount}</strong> ads
                  </div>
                  {d.error_summary && (
                    <div className="text-red-400 text-[11px] bg-red-500/5 rounded p-1.5 border border-red-500/20">
                      {d.error_summary}
                    </div>
                  )}
                  {campaignsCount > 0 && (
                    <a
                      href={adsMgrUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-cyan-400 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Abrir no Ads Manager
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar estratégia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nome</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger id="edit-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STRATEGY_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={actionLoading}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={actionLoading || !editName.trim()}>
              {actionLoading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tens a certeza que queres apagar definitivamente esta estratégia? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={actionLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Creative selector */}
      <Dialog open={selectorOpen} onOpenChange={setSelectorOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar criativos à fase</DialogTitle>
            <DialogDescription>
              Seleciona os criativos a usar nesta fase. Cada criativo será deployado como Ad em todos os AdSets desta fase.
            </DialogDescription>
          </DialogHeader>

          {!allCreatives ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (() => {
            const existingIds = new Set((associationsByPhase.get(selectorPhaseId ?? "") ?? []).map((a: any) => a.creative_id));
            const available = (allCreatives ?? []).filter((c: any) => !existingIds.has(c.id));
            if (available.length === 0) {
              return (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    {existingIds.size > 0
                      ? "Todos os criativos disponíveis já estão associados a esta fase."
                      : "Não tens criativos ainda."}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => { setSelectorOpen(false); navigate("/audience/creatives/new"); }}>
                    <Plus className="h-4 w-4 mr-1.5" /> Criar novo criativo
                  </Button>
                </div>
              );
            }
            return (
              <>
                <div className="text-xs text-muted-foreground">
                  {selectedCreativeIds.size} de {available.length} selecionado(s)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {available.map((c: any) => {
                    const selected = selectedCreativeIds.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCreativeIds((s) => {
                            const next = new Set(s);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          });
                        }}
                        className={cn(
                          "relative rounded border-2 overflow-hidden text-left transition-all",
                          selected ? "border-cyan-400 ring-2 ring-cyan-400/40" : "border-border hover:border-cyan-500/50"
                        )}
                      >
                        <div className="aspect-square bg-muted overflow-hidden">
                          {c.type === "video" ? (
                            <video src={c.file_url} className="w-full h-full object-cover" muted playsInline />
                          ) : (
                            <img src={c.file_url} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                          )}
                        </div>
                        <div className="px-2 py-1.5">
                          <div className="text-xs font-medium truncate" title={c.name}>{c.name}</div>
                          {c.headline && <div className="text-[10px] text-muted-foreground truncate">{c.headline}</div>}
                        </div>
                        {selected && (
                          <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-cyan-500 text-white flex items-center justify-center text-xs font-bold">
                            ✓
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectorOpen(false)} disabled={actionLoading}>Cancelar</Button>
            <Button onClick={handleAddCreatives} disabled={actionLoading || selectedCreativeIds.size === 0}>
              {actionLoading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Adicionar {selectedCreativeIds.size > 0 ? `(${selectedCreativeIds.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs font-medium">{value}</div>
    </div>
  );
}
