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
  Play, Pause, PowerOff, PlayCircle, ArrowRight, Wrench,
} from "lucide-react";

type CounterProposal = {
  id?: string;
  type?: "single_knob" | "multi_knob" | string;
  priority?: number;
  label?: string;
  constraints_change?: Record<string, { from?: number; to?: number } | undefined>;
  rationale?: string;
  expected_outcome?: { feasibility_estimate?: string; rationale?: string };
  trade_offs?: string[];
  confidence?: "high" | "medium" | "low" | string;
};

const KNOB_LABELS: Record<string, { label: string; format: (n: number | undefined) => string }> = {
  daily_budget_eur: {
    label: "Verba diária",
    format: (n) => (n == null || isNaN(Number(n)) ? "—" : `€${Number(n).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}`),
  },
  roas_floor: {
    label: "ROAS floor",
    format: (n) => (n == null || isNaN(Number(n)) ? "—" : `${Number(n).toFixed(1)}x`),
  },
};

const FEASIBILITY_BADGE: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  medium: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  low: "bg-amber-500/15 text-amber-300 border-amber-500/40",
};

function CounterProposalCard({ proposal }: { proposal: CounterProposal }) {
  const knobs = Object.entries(proposal.constraints_change ?? {}).filter(([, v]) => v && (v.from != null || v.to != null));
  return (
    <Card className="p-4 border-blue-500/30 bg-blue-500/5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-sm leading-snug">{proposal.label ?? "Sugestão"}</div>
        <Badge variant="outline" className="text-[10px] uppercase shrink-0">
          {proposal.type === "multi_knob" ? "multi" : "single"}
        </Badge>
      </div>

      {knobs.length > 0 && (
        <div className="rounded-md border border-blue-500/20 bg-background/40 p-2.5 space-y-1.5">
          {knobs.map(([key, change]) => {
            const meta = KNOB_LABELS[key] ?? { label: key, format: (n: number | undefined) => (n == null ? "—" : String(n)) };
            return (
              <div key={key} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-24 shrink-0">{meta.label}</span>
                <span className="text-muted-foreground tabular-nums">{meta.format(change?.from)}</span>
                <ArrowRight className="h-3 w-3 text-blue-400 shrink-0" />
                <span className="font-semibold text-primary tabular-nums">{meta.format(change?.to)}</span>
              </div>
            );
          })}
        </div>
      )}

      {proposal.rationale && (
        <p className="text-sm text-muted-foreground leading-relaxed">{proposal.rationale}</p>
      )}

      {proposal.expected_outcome && (
        <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Resultado esperado</span>
            {proposal.expected_outcome.feasibility_estimate && (
              <Badge
                variant="outline"
                className={cn("text-[10px] uppercase border", FEASIBILITY_BADGE[proposal.expected_outcome.feasibility_estimate] ?? "bg-muted/40")}
              >
                Viabilidade: {proposal.expected_outcome.feasibility_estimate}
              </Badge>
            )}
          </div>
          {proposal.expected_outcome.rationale && (
            <p className="text-xs text-foreground/80">{proposal.expected_outcome.rationale}</p>
          )}
        </div>
      )}

      {proposal.trade_offs && proposal.trade_offs.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Trade-offs</div>
          <ul className="list-disc list-inside space-y-0.5 text-xs text-muted-foreground">
            {proposal.trade_offs.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-1 mt-auto">
        <Button
          variant="outline"
          size="sm"
          disabled
          className="w-full border-blue-500/30 text-blue-300"
          title="Funcionalidade em breve — copia os valores e ajusta no wizard de redesign"
        >
          <Sparkles className="h-4 w-4 mr-1.5" />
          Aplicar e regenerar
        </Button>
      </div>
    </Card>
  );
}
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
      let sourceCampaign: { external_campaign_id: string; name: string | null } | null = null;
      if (data.source_campaign_id) {
        const { data: sc } = await (supabase as any)
          .schema("crm").from("meta_campaign_snapshot")
          .select("external_campaign_id, name")
          .eq("external_campaign_id", data.source_campaign_id).maybeSingle();
        sourceCampaign = sc ?? { external_campaign_id: data.source_campaign_id, name: null };
      }
      return { ...data, event, sourceCampaign };
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
        .select("id, status, current_status, last_toggled_at, ad_account_id, meta_campaign_ids, meta_adset_ids, meta_ad_ids, error_summary, started_at, completed_at, duration_ms, created_at")
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

  // Detectar herdados no plan: ads com existing_creative_id por fase
  const inheritedByPhase = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of plan?.recommended_campaigns ?? []) {
      const phaseId = c.phase_id;
      if (!phaseId) continue;
      for (const a of c.adsets ?? []) {
        for (const ad of a.ads ?? []) {
          if (typeof ad?.existing_creative_id === "string") {
            if (!map.has(phaseId)) map.set(phaseId, new Set());
            map.get(phaseId)!.add(ad.existing_creative_id);
          }
        }
      }
    }
    return map;
  }, [plan]);

  const inheritedTotal = useMemo(() => {
    const all = new Set<string>();
    for (const set of inheritedByPhase.values()) for (const id of set) all.add(id);
    return all.size;
  }, [inheritedByPhase]);

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
    let phasesCovered = 0;
    for (const phase of plan?.phases ?? []) {
      const hasNew = (associationsByPhase.get(phase.id) ?? []).length > 0;
      const hasInherited = (inheritedByPhase.get(phase.id)?.size ?? 0) > 0;
      if (hasNew || hasInherited) phasesCovered++;
      else phasesWithoutCreatives.push(phase.name);
    }
    const totalPhases = plan?.phases?.length ?? 0;
    const detail = phasesWithoutCreatives.length === 0
      ? (inheritedTotal > 0 ? `✓ ${inheritedTotal} criativo(s) reaproveitado(s) da campanha original` : "✓")
      : `Em falta: ${phasesWithoutCreatives.join(", ")}`;
    checks.push({
      label: `Criativos em todas as fases (${phasesCovered}/${totalPhases})`,
      ok: phasesWithoutCreatives.length === 0,
      detail,
    });
    return checks;
  }, [connection, plan, associationsByPhase, inheritedByPhase, inheritedTotal]);

  const canDeploy = deployChecks.filter((c) => c.label !== "Instagram associado").every((c) => c.ok);

  const deployEstimate = useMemo(() => {
    let campaigns = 0, adsets = 0, ads = 0;
    for (const phase of plan?.phases ?? []) {
      const phaseCreatives = associationsByPhase.get(phase.id) ?? [];
      const inherited = inheritedByPhase.get(phase.id) ?? new Set<string>();
      if (phaseCreatives.length === 0 && inherited.size === 0) continue;
      const phaseCampaigns = (plan?.recommended_campaigns ?? []).filter((c: any) => c.phase_id === phase.id);
      campaigns += phaseCampaigns.length;
      for (const c of phaseCampaigns) {
        const phaseAdsets = (c.adsets ?? []).length;
        adsets += phaseAdsets;
        // Por adset: se há herdados no plano, usa esses; caso contrário usa associações novas
        for (const a of c.adsets ?? []) {
          const inheritedInAdset = (a.ads ?? []).filter((x: any) => typeof x?.existing_creative_id === "string").length;
          ads += inheritedInAdset > 0 ? inheritedInAdset : phaseCreatives.length;
        }
      }
    }
    return { campaigns, adsets, ads };
  }, [plan, associationsByPhase, inheritedByPhase]);

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

  const [togglingDeploymentId, setTogglingDeploymentId] = useState<string | null>(null);

  const handleToggleDeployment = async (deploymentId: string, target: "ACTIVE" | "PAUSED") => {
    setTogglingDeploymentId(deploymentId);
    try {
      const { data: resp, error } = await supabase.functions.invoke(
        "crm-meta-deployment-toggle",
        { body: { deployment_id: deploymentId, target_status: target } }
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
      const action = target === "ACTIVE" ? "Ativadas" : "Pausadas";
      if (resp.summary.errors === 0) {
        toast.success(`${action} ${resp.summary.success} entidades no Meta`);
      } else {
        toast.warning(`${action} ${resp.summary.success}, com ${resp.summary.errors} erros`);
      }
      queryClient.invalidateQueries({ queryKey: ["crm-strategy-deployments", id] });
    } catch (e: any) {
      toast.error("Falha a alterar status no Meta", { description: e?.message ?? String(e) });
    } finally {
      setTogglingDeploymentId(null);
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

  // Deployment com sucesso e ainda pausado → banner "Publicar agora"
  const publishableDeployment = (deployments ?? []).find(
    (d: any) =>
      (d.status === "success" || d.status === "partial") &&
      (d.current_status === "paused" || d.current_status === "mixed") &&
      Array.isArray(d.meta_campaign_ids) && d.meta_campaign_ids.length > 0,
  );

  return (
    <div className="space-y-6">
      {/* Sprint 3c-2.5 — Banner deploy_blocked (prioridade máxima) */}
      {plan.automation_metadata?.deploy_blocked_reason && (
        <Card className="p-4 border-red-500/40 bg-red-500/5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
              <XCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-red-400">Plano não recomendado para deploy</div>
              <div className="text-xs text-muted-foreground mt-1">
                {plan.automation_metadata.deploy_blocked_reason}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Sugestão: reanalisar premissas (constraints de verba, ROAS floor, goal de receita) e regenerar antes de deployar.
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Sprint 3c-2.5 — Banner deploy_warning (não bloqueante, só se não há deploy_blocked) */}
      {!plan.automation_metadata?.deploy_blocked_reason && plan.automation_metadata?.deploy_warning && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-amber-400">Aviso de deploy</div>
              <div className="text-xs text-muted-foreground mt-1">
                {plan.automation_metadata.deploy_warning}
              </div>
            </div>
          </div>
        </Card>
      )}

      {publishableDeployment && (
        <Card className="p-4 border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 to-cyan-500/5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                <Play className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <div className="font-semibold text-sm">Tudo pronto — falta só publicar no Meta</div>
                <div className="text-xs text-muted-foreground">
                  {(publishableDeployment.meta_campaign_ids?.length ?? 0)} campanhas criadas em PAUSED. Carrega para activar todas.
                </div>
              </div>
            </div>
            <Button
              size="lg"
              onClick={() => {
                if (!confirm("Vai activar todas as campanhas/adsets/ads no Meta. Continuar?")) return;
                handleToggleDeployment(publishableDeployment.id, "ACTIVE");
              }}
              disabled={togglingDeploymentId === publishableDeployment.id}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {togglingDeploymentId === publishableDeployment.id ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Publicar agora no Meta
            </Button>
          </div>
        </Card>
      )}
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
              {data.source_campaign_id && (
                <Badge variant="outline" className="text-[10px] uppercase border-cyan-500/40 text-cyan-300 bg-cyan-500/10">
                  Re-design
                </Badge>
              )}
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
              {data.source_campaign_id && (
                <span className="flex items-center gap-1.5 text-cyan-300/80">
                  Baseado na campanha: <span className="font-medium text-foreground">{data.sourceCampaign?.name ?? data.source_campaign_id}</span>
                </span>
              )}
            </div>
            {data.redesign_rationale && (
              <div className="mt-3 rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-cyan-300 mb-1">Mudanças vs original</div>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">{data.redesign_rationale}</p>
              </div>
            )}
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
            <Badge className={cn("text-xs uppercase border flex items-center gap-1", feasibilityStyles[summary.feasibility] ?? "bg-muted/40")}>
              Viabilidade: {summary.feasibility ?? "—"}
              {summary.feasibility_capped_reason && (
                <span title={summary.feasibility_capped_reason} className="cursor-help">
                  <AlertCircle className="h-3 w-3 text-amber-400 inline" />
                </span>
              )}
            </Badge>
            {summary.confidence && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                Confiança: {summary.confidence}
                {summary.confidence_capped_reason && (
                  <span title={summary.confidence_capped_reason} className="cursor-help">
                    <AlertCircle className="h-3 w-3 text-amber-400 inline" />
                  </span>
                )}
              </span>
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
          {(() => {
            const va = (data as any).applied_constraints?.viability_analysis;
            const currentR = va?.current_roas;
            const expectedR = summary.expected_overall_roas;
            return (
              <div className="rounded border border-border p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">ROAS esperado</div>
                <div className="text-base font-semibold">
                  {expectedR != null ? `${fmtNum(expectedR)}x` : "—"}
                </div>
                {currentR != null && expectedR != null && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    actual: {fmtNum(currentR)}x · gap: {va?.gap_severity ?? "—"}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        {summary.expected_cpa_eur != null && (
          <div className="mt-3 text-xs text-muted-foreground">CPA esperado: <span className="text-foreground font-medium">{fmtEur(summary.expected_cpa_eur, 2)}</span></div>
        )}
      </Card>

      {/* Sprint 3c-4 — Card de análise de orçamento (budget_recommendation) */}
      {plan.budget_recommendation && (
        <Card className="p-5 border-cyan-500/30 bg-cyan-500/[0.03]">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-cyan-400" />
            <h2 className="text-base font-semibold">Análise de orçamento</h2>
            <Badge variant="outline" className={cn(
              "text-[10px] uppercase",
              plan.budget_recommendation.adjustment_direction === "increase"
                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                : plan.budget_recommendation.adjustment_direction === "decrease"
                ? "border-red-500/40 text-red-400 bg-red-500/10"
                : "border-muted-foreground/40 text-muted-foreground bg-muted/20",
            )}>
              {plan.budget_recommendation.adjustment_direction === "increase"
                ? "Aumentar"
                : plan.budget_recommendation.adjustment_direction === "decrease"
                ? "Reduzir"
                : "Manter"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <KPI label="Verba diária actual" value={fmtEur(plan.budget_recommendation.current_daily_eur, 2)} />
            <KPI label="Verba diária sugerida" value={fmtEur(plan.budget_recommendation.suggested_daily_eur, 2)} />
            <KPI label="Total actual projectado" value={fmtEur(plan.budget_recommendation.current_projected_total_eur)} />
            <KPI label="Total sugerido" value={fmtEur(plan.budget_recommendation.suggested_total_eur)} />
          </div>
          {plan.budget_recommendation.adjustment_reason && (
            <p className="text-sm text-muted-foreground">
              {plan.budget_recommendation.adjustment_reason}
            </p>
          )}
          {plan.budget_recommendation.floor_warning && (
            <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span className="text-amber-400">{plan.budget_recommendation.floor_warning}</span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Sprint 3c-4.5 — Banner incoerência KPIs (FIX 5) */}
      {summary.kpi_coherence_warning && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-amber-400">Incoerência detectada nos KPIs</div>
              <div className="text-xs text-muted-foreground mt-1">
                {summary.kpi_coherence_warning}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                A confiança foi rebaixada automaticamente para low. Considera regenerar o plano.
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Criativos herdados (re-design) */}
      {Array.isArray(plan.inherited_creatives) && plan.inherited_creatives.length > 0 && (
        <Card className="p-5 border-cyan-500/30 bg-cyan-500/[0.04]">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="flex items-center gap-2">
              <Image2 className="h-4 w-4 text-cyan-400" />
              <h2 className="text-base font-semibold">Criativos reaproveitados da campanha original</h2>
              <Badge className="bg-cyan-500/15 text-cyan-300 border-cyan-500/40 text-[10px] uppercase">
                {inheritedTotal}/{plan.inherited_creatives.length} usados no plano
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Estes criativos já existem no Meta — vão ser reutilizados directamente sem upload.
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {plan.inherited_creatives.map((c: any) => {
              const phasesUsing: string[] = [];
              for (const phase of plan?.phases ?? []) {
                if (inheritedByPhase.get(phase.id)?.has(c.meta_creative_id)) phasesUsing.push(phase.name);
              }
              const hasPreview = !!c.file_url;
              return (
                <div
                  key={c.meta_creative_id}
                  className={cn(
                    "flex gap-3 rounded border p-2",
                    hasPreview
                      ? "border-border bg-background/50"
                      : "border-amber-500/30 bg-amber-500/5",
                  )}
                >
                  <div className="relative h-14 w-14 rounded bg-muted/50 border border-border overflow-hidden shrink-0 flex items-center justify-center">
                    {c.file_url ? (
                      <img src={c.file_url} alt={c.name ?? ""} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <Image2 className="h-5 w-5 text-amber-400/70" />
                    )}
                    {c.file_url && c.type === "video" && (
                      <PlayCircle className="absolute bottom-0.5 right-0.5 h-4 w-4 text-white drop-shadow bg-black/50 rounded-full" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{c.name ?? c.ad_name ?? "Sem nome"}</div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate">{c.meta_creative_id}</div>
                    {!hasPreview && (
                      <MissingPreviewActions metaCreativeId={c.meta_creative_id} compact />
                    )}
                    {phasesUsing.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {phasesUsing.map((pn) => (
                          <Badge key={pn} variant="outline" className="text-[9px] py-0 px-1.5 border-cyan-500/30 text-cyan-300/90">
                            {pn}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted-foreground mt-1">Disponível mas não atribuído</div>
                    )}
                  </div>
                </div>
              );

            })}
          </div>
        </Card>
      )}

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
                      <div className="rounded bg-muted/30 px-2 py-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          ROAS mín
                          {p.target_kpis._roas_min_overridden_reason && (
                            <span title={p.target_kpis._roas_min_overridden_reason} className="cursor-help">
                              <AlertCircle className="h-2.5 w-2.5 text-amber-400" />
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-medium">
                          {p.target_kpis.roas_min != null ? `${p.target_kpis.roas_min}x` : "—"}
                        </div>
                      </div>
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

                  {/* Sprint 3c-4 — Preview dos anúncios desta fase */}
                  <div className="mt-4 border-t border-border pt-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-3">
                      <Sparkles className="h-3.5 w-3.5" /> Preview dos anúncios desta fase
                    </div>
                    {(() => {
                      const phaseAds: Array<{
                        creative: { type?: string | null; file_url?: string | null; name?: string | null; meta_creative_id?: string | null };

                        headline: string | null;
                        primaryText: string | null;
                        ctaType: string | null;
                        isInherited: boolean;
                        adsetName: string;
                      }> = [];
                      for (const camp of camps) {
                        for (const adset of camp.adsets ?? []) {
                          for (const ad of adset.ads ?? []) {
                            if (typeof ad?.existing_creative_id === "string") {
                              const inheritedCreative = (plan.inherited_creatives ?? [])
                                .find((c: any) => c.meta_creative_id === ad.existing_creative_id);
                              if (inheritedCreative) {
                                phaseAds.push({
                                  creative: {
                                    type: inheritedCreative.type ?? null,
                                    file_url: inheritedCreative.file_url ?? null,
                                    name: inheritedCreative.name ?? null,
                                    meta_creative_id: inheritedCreative.meta_creative_id ?? null,
                                  },

                                  headline: inheritedCreative.headline ?? null,
                                  primaryText: inheritedCreative.body ?? null,
                                  ctaType: inheritedCreative.cta_type ?? null,
                                  isInherited: true,
                                  adsetName: adset.adset_name ?? "Adset",
                                });
                              }
                            } else if (ad?.creative_brief && typeof ad.creative_brief === "object") {
                              const cb = ad.creative_brief;
                              phaseAds.push({
                                creative: {
                                  type: null,
                                  file_url: null,
                                  name: cb.primary_message ? String(cb.primary_message).slice(0, 50) : "Brief novo",
                                },
                                headline: cb.headline_suggestion ?? null,
                                primaryText: cb.primary_text_suggestion ?? cb.primary_message ?? null,
                                ctaType: cb.cta_suggestion ?? null,
                                isInherited: false,
                                adsetName: adset.adset_name ?? "Adset",
                              });
                            }
                          }
                        }
                      }
                      if (phaseAds.length === 0) {
                        return (
                          <p className="text-xs text-muted-foreground italic">
                            Sem ads propostos para esta fase. IA vai gerar quando regenerares.
                          </p>
                        );
                      }
                      return (
                        <div className="flex gap-3 overflow-x-auto pb-2">
                          {phaseAds.map((ad, i) => (
                            <div key={i} className="shrink-0">
                              <AdMockup
                                creative={ad.creative}
                                headline={ad.headline}
                                primaryText={ad.primaryText}
                                ctaLabel={ctaLabel(ad.ctaType)}
                                isInherited={ad.isInherited}
                              />
                              <div className="text-[10px] text-muted-foreground mt-1 max-w-[280px] truncate" title={ad.adsetName}>
                                → {ad.adsetName}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

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
                              <div className="relative aspect-square bg-muted overflow-hidden">
                                {c.file_url ? (
                                  <img src={c.file_url} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                                ) : (
                                  <Image2 className="w-5 h-5 text-muted-foreground m-auto mt-6" />
                                )}
                                {c.file_url && c.type === "video" && (
                                  <PlayCircle className="absolute bottom-1 right-1 h-4 w-4 text-white drop-shadow bg-black/50 rounded-full" />
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
          Cria automaticamente todas as campanhas, conjuntos de anúncios e anúncios no Meta. Por segurança, tudo é criado em PAUSED. Depois aprovas e ativas tudo aqui na plataforma com 1 clique — sem precisar do Ads Manager.
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
                  {(d.status === "success" || d.status === "partial") && campaignsCount > 0 && (
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {d.current_status === "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleDeployment(d.id, "PAUSED")}
                          disabled={togglingDeploymentId === d.id}
                          className="h-7 px-2.5 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                        >
                          {togglingDeploymentId === d.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Pause className="h-3 w-3 mr-1" />
                          )}
                          Pausar tudo
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleToggleDeployment(d.id, "ACTIVE")}
                          disabled={togglingDeploymentId === d.id}
                          className="h-7 px-2.5 text-xs bg-emerald-500 hover:bg-emerald-600 text-white"
                        >
                          {togglingDeploymentId === d.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3 mr-1" />
                          )}
                          Ativar tudo no Meta
                        </Button>
                      )}

                      <Badge variant="outline" className={cn(
                        "text-[10px] uppercase",
                        d.current_status === "active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40" :
                        d.current_status === "mixed" ? "bg-amber-500/10 text-amber-400 border-amber-500/40" :
                        "bg-muted/40 text-muted-foreground border-border"
                      )}>
                        {d.current_status === "active" ? "🟢 No ar" :
                         d.current_status === "mixed" ? "🟡 Misto" :
                         "⏸ Pausado"}
                      </Badge>

                      {d.last_toggled_at && (
                        <span className="text-[10px] text-muted-foreground">
                          Última alteração: {new Date(d.last_toggled_at).toLocaleString("pt-PT")}
                        </span>
                      )}
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
                        <div className="relative aspect-square bg-muted overflow-hidden">
                          {c.file_url ? (
                            <img src={c.file_url} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <Image2 className="w-5 h-5 text-muted-foreground m-auto mt-6" />
                          )}
                          {c.file_url && c.type === "video" && (
                            <PlayCircle className="absolute bottom-1 right-1 h-4 w-4 text-white drop-shadow bg-black/50 rounded-full" />
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

      {/* Deploy confirmation */}
      <AlertDialog open={deployOpen} onOpenChange={setDeployOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-cyan-400" /> Deploy para Meta?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Vai criar no Meta Ads Manager (ad account <strong>{connection?.selected_ad_account_name}</strong>):</p>
                <div className="bg-muted/40 rounded p-3 text-sm space-y-1">
                  <div>• <strong>{deployEstimate.campaigns}</strong> Campanhas</div>
                  <div>• <strong>{deployEstimate.adsets}</strong> AdSets</div>
                  <div>• <strong>{deployEstimate.ads}</strong> Anúncios</div>
                </div>
                <p className="text-amber-400 text-sm">⚠ Tudo será criado em status <strong>PAUSED</strong>. Nada vai correr sem ativares manualmente no Ads Manager.</p>
                <p className="text-xs text-muted-foreground">Demora ~30s a 2 min. Não fechas esta página durante o processo.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeploying}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); setDeployOpen(false); handleDeploy(); }}
              disabled={isDeploying}
              className="bg-cyan-500 hover:bg-cyan-600 text-white"
            >
              {isDeploying && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Sim, deployar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Sprint 3c-4 — CTA labels Meta Ads → PT
const CTA_LABELS_PT: Record<string, string> = {
  GET_TICKETS: "Reservar bilhete",
  LEARN_MORE: "Saber mais",
  SHOP_NOW: "Comprar agora",
  SIGN_UP: "Inscrever-se",
  CONTACT_US: "Contactar",
  BOOK_TRAVEL: "Reservar",
  DOWNLOAD: "Descarregar",
  LISTEN_MUSIC: "Ouvir música",
  WATCH_MORE: "Ver mais",
};
function ctaLabel(ctaType: string | null | undefined): string {
  if (!ctaType) return "Saber mais";
  return CTA_LABELS_PT[ctaType.toUpperCase()] ?? "Saber mais";
}

// Sprint 3c-4 — Mockup Instagram vertical (4:5) para preview de ads
function AdMockup({
  creative,
  headline,
  primaryText,
  ctaLabel: ctaLabelText,
  isInherited,
}: {
  creative: { type?: string | null; file_url?: string | null; name?: string | null; meta_creative_id?: string | null };
  headline: string | null;
  primaryText: string | null;
  ctaLabel: string;
  isInherited: boolean;
}) {
  const fallbackHeadline = isInherited ? "(sem headline)" : "(headline em falta)";
  const fallbackPrimary = isInherited ? "(sem primary text)" : "(primary text em falta)";
  const hasPreview = !!creative.file_url;
  return (
    <div className={cn(
      "rounded-lg border bg-background overflow-hidden max-w-[280px]",
      hasPreview ? "border-border" : "border-amber-500/30",
    )}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">mundopropicio</div>
          <div className="text-[10px] text-muted-foreground">Sponsored · Patrocinado</div>
        </div>
      </div>
      <div className="px-3 py-2 text-xs text-foreground/90 line-clamp-3">
        {primaryText || fallbackPrimary}
      </div>
      <div className={cn(
        "relative aspect-[4/5] overflow-hidden flex items-center justify-center",
        hasPreview ? "bg-muted" : "bg-amber-500/5",
      )}>
        {creative.file_url ? (
          <img src={creative.file_url} alt={creative.name ?? ""} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <MissingPreviewBlock metaCreativeId={creative.meta_creative_id ?? null} />
        )}
        {creative.file_url && creative.type === "video" && (
          <PlayCircle className="absolute bottom-2 right-2 h-6 w-6 text-white drop-shadow bg-black/50 rounded-full" />
        )}
      </div>

      <div className="px-3 py-2.5 border-t border-border bg-muted/20">
        <div className="text-xs font-semibold text-foreground line-clamp-2 mb-2">
          {headline || fallbackHeadline}
        </div>
        <button
          type="button"
          className="w-full bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold py-2 rounded transition-colors"
        >
          {ctaLabelText}
        </button>
      </div>
      <div className="px-3 py-1.5 text-[10px] flex items-center justify-between border-t border-border bg-muted/10">
        <span className={cn(
          "uppercase tracking-wider font-medium",
          isInherited ? "text-cyan-400" : "text-amber-400",
        )}>
          {isInherited ? "Reaproveitado" : "Brief novo"}
        </span>
        {creative.name && (
          <span className="text-muted-foreground truncate max-w-[140px]" title={creative.name}>
            {creative.name}
          </span>
        )}
      </div>
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

// Workaround UI para criativos sem file_url (parser MCS v1 limitado)
function MissingPreviewActions({ metaCreativeId, compact = false }: { metaCreativeId: string; compact?: boolean }) {
  const copy = async (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(metaCreativeId);
      toast.success("ID copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };
  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap", compact ? "mt-1" : "mt-2")}>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300 hover:bg-amber-500/20"
      >
        <Copy className="h-2.5 w-2.5" /> Copiar ID
      </button>
      <a
        href="https://business.facebook.com/ads/manager"
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 hover:underline"
      >
        Abrir no Meta Ads Manager <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </div>
  );
}

function MissingPreviewBlock({ metaCreativeId }: { metaCreativeId: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-3 text-center w-full h-full">
      <Image2 className="h-6 w-6 text-amber-400/70" />
      <div className="text-[10px] text-muted-foreground">Sem preview disponível</div>
      {metaCreativeId && (
        <>
          <div className="text-[10px] font-mono text-foreground/80 break-all max-w-full px-1">
            {metaCreativeId}
          </div>
          <MissingPreviewActions metaCreativeId={metaCreativeId} />
        </>
      )}
    </div>
  );
}
