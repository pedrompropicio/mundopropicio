import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/currency";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
  ExternalLink,
  Image as ImageIcon,
  Target,
  Users,
  UserMinus,
  MapPin,
  Wallet,
  TrendingUp,
  Eye,
  ShoppingCart,
  Sparkles,
  Activity,
  AlertTriangle,
  TrendingDown,
  Minus,
  History,
  Settings2,
  Pause,
  Play,
  Loader2,
  Pencil,
  Link2,
  Wand2,
  Hourglass,
  Rocket,
  Stethoscope,
  Database,
  RefreshCw,
  ArrowRight,
  Star,
  Info,
  Scissors,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ShieldQuestion,
  MessageSquareWarning,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { classifyCreative, metaAdsManagerUrl } from "@/lib/creative-media";
import { EditCampaignPopover, type CampaignRow } from "@/pages/crm/Campaigns";
import { ReactivateCampaignDialog } from "@/components/crm/ReactivateCampaignDialog";
import { PeriodSelector } from "@/components/crm/PeriodSelector";
import { EditAdsetBudgetDialog } from "@/components/crm/EditAdsetBudgetDialog";
import { periodFromMode, type PeriodState } from "@/lib/crm/period";
import { StrategicTriggersCard } from "@/components/crm/StrategicTriggersCard";
import { AssistedAssemblyPanel } from "@/components/crm/AssistedAssemblyPanel";
import { CampaignDesignStudio } from "@/components/crm/CampaignDesignStudio";
import { MetaPublishPanel } from "@/components/crm/MetaPublishPanel";
import { useConfirmMetaAction, type PendingMetaAction } from "@/components/crm/ConfirmMetaActionDialog";

// ── Tipos (subset dos snapshots; só o que a página usa) ─────────────────────
interface CampaignSnap {
  external_campaign_id: string;
  name: string;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  buying_type: string | null;
  bid_strategy: string | null;
  start_time: string | null;
  stop_time: string | null;
  linked_event_id: string | null;
  company_id: string | null;
}
interface AdsetSnap {
  external_adset_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  optimization_goal: string | null;
  billing_event: string | null;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  currency: string | null;
  targeting: any;
  connection_id: string;
  ad_account_id: string;
}
interface AdSnap {
  external_ad_id: string;
  external_adset_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  meta_creative_id: string | null;
  connection_id: string;
  ad_account_id: string;
}
interface CreativeRow {
  id: string;
  meta_creative_id: string | null;
  name: string;
  type: string;
  file_url: string;
  file_mime_type: string | null;
  headline: string | null;
  body: string | null;
  cta_type: string | null;
  link_url: string | null;
  analysis_jsonb: any;
}
interface InsightRow {
  date_start: string;
  spend_cents: number | null;
  ctr: number | null;
  impressions: number | null;
  clicks: number | null;
  purchases_count: number | null;
  purchases_value_cents: number | null;
  roas: number | null;
  currency: string | null;
}
// Linhas das tabelas de insights granulares (subset usado na UI)
interface AdsetInsightRow {
  external_adset_id: string;
  date_start: string;
  spend_cents: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  purchases_count: number | null;
  purchases_value_cents: number | null;
  currency: string | null;
}
interface AdInsightRow {
  external_ad_id: string;
  date_start: string;
  spend_cents: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  purchases_count: number | null;
  purchases_value_cents: number | null;
  currency: string | null;
}
// Métricas agregadas por entidade (adset ou ad), com divisões protegidas
interface EntityMetrics {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchases: number;
  revenue: number;
  cpc: number | null;
  cpm: number | null;
  ctr: number | null;
  frequency: number | null;
  roas: number | null;
  currency: string | null;
}
interface DiagnosisRow {
  target_roas: number | null;
  source_campaign_class: string | null;
  projected_baseline_roas: number | null;
  diagnosis_jsonb: any;
  created_at: string;
}
// ── Prescrição (output de crm-meta-campaign-surgical E crm-meta-campaign-scale) ──
// Contrato partilhado pelos dois motores → a mesma vista renderiza ambos.
interface SurgicalAction {
  action_index: number;
  group: "pause" | "reduce_budget" | "reallocate_increase" | "pause_ad" | "scale_increase" | "recommendation";
  executable: boolean;
  entity_type: "adset" | "ad" | "campaign";
  external_id: string | null;
  connection_id: string | null;
  ad_account_id: string | null;
  entity_name: string | null;
  verdict: string | null;
  audience_type?: string | null;
  current_value_cents?: number | null;
  proposed_value_cents?: number | null;
  entity_action?: { action: "pause" | "update"; updates?: { daily_budget_cents?: number } };
  rationale: string;
  selected_by_default: boolean;
  blocked: boolean;
  blocked_reason?: string;
}
interface SurgicalPrescription {
  ok: boolean;
  campaign_id: string;
  diagnosis_id: string;
  source_campaign_class: string | null;
  recommended_posture: string | null;
  period_days: number;
  budget_mode: "ABO" | "CBO" | "unknown";
  generated_at: string;
  summary: {
    total_daily_before_cents: number;
    total_daily_after_cents: number;
    // cirúrgico (poda/realoca):
    pool_freed_cents?: number;
    pool_reallocated_cents?: number;
    pool_unallocated_cents?: number;
    // escala (infla):
    total_increase_cents?: number;
    eligible_count?: number;
    scaled_count?: number;
    cooldown_count?: number;
    cap_eur: number | null;
    learning_adsets_count: number;
    currency: string;
    counts: Record<string, number>;
  };
  proposed_actions: SurgicalAction[];
}
type PrescriptionKind = "surgical" | "scale";

interface ChangeRow {
  id: string;
  change_type: string;
  before_jsonb: any;
  after_jsonb: any;
  reason_text: string | null;
  triggered_by: string | null;
  applied_by_user_id: string | null;
  applied_at: string;
}
interface ActionRow {
  id: string;
  action: string;
  prev_status: string | null;
  new_status: string | null;
  success: boolean;
  error_message: string | null;
  performed_by: string | null;
  performed_at: string;
}
interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

// ── Helpers de formatação ───────────────────────────────────────────────────
const eur = (cents: number | null | undefined, currency?: string | null) =>
  cents == null ? "—" : formatMoney(cents, currency, { fromCents: true });
const intFmt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("pt-PT").format(n);
const dateFmt = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("pt-PT") : "—";

function statusColor(status: string | null): string {
  const s = (status || "").toUpperCase();
  if (s === "ACTIVE") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  if (s === "PAUSED") return "bg-amber-500/10 text-amber-400 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

// Verdict do analysis_jsonb do criativo (reaproveita vocabulário do CreativeView)
const verdictLabel: Record<string, { label: string; color: string }> = {
  ready: { label: "Pronto", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/40" },
  needs_minor_changes: { label: "Ajustes", color: "bg-amber-500/10 text-amber-400 border-amber-500/40" },
  needs_major_changes: { label: "Mudanças", color: "bg-orange-500/10 text-orange-400 border-orange-500/40" },
  reject: { label: "Não usar", color: "bg-red-500/10 text-red-400 border-red-500/40" },
};

// Classe da campanha (diagnóstico 360) → label + cor.
// em_maturacao usa tom neutro/informativo (sky), NUNCA vermelho — é estado de
// aprendizagem, não de fraqueza. indeterminada = neutro.
const classMeta: Record<string, { label: string; color: string }> = {
  saudavel_subindo: { label: "Saudável a subir", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/40" },
  saudavel_caindo: { label: "Saudável a cair", color: "bg-amber-500/10 text-amber-400 border-amber-500/40" },
  fraca: { label: "Fraca", color: "bg-orange-500/10 text-orange-400 border-orange-500/40" },
  morta: { label: "Morta", color: "bg-red-500/10 text-red-400 border-red-500/40" },
  em_maturacao: { label: "Em maturação", color: "bg-sky-500/10 text-sky-300 border-sky-500/40" },
  indeterminada: { label: "Indeterminada", color: "bg-muted text-muted-foreground border-border" },
};

// ── Tela de decisão: postura recomendada (diagnóstico 360) → ação oferecida ──
// As chaves batem EXACTAMENTE com POSTURE_BY_CLASS em crm-campaign-diagnosis:
//   saudavel_subindo→manter_escalar, saudavel_caindo→intervencao_cirurgica,
//   fraca→redesign, morta→novo_desenho, indeterminada→recolher_mais_dados,
//   em_maturacao→aguardar_maturacao.
// kind: "redesign" (wizard) · "surgical" (cirúrgico, Etapa 3) · "scale" (escalar,
//       Etapa 4) · "new_design" (novo desenho, Etapa 5) · "coming_soon" · "info".
type PostureKind = "redesign" | "surgical" | "scale" | "new_design" | "coming_soon" | "info";
const postureMeta: Record<
  string,
  { label: string; tagline: string; icon: any; kind: PostureKind; accent: string }
> = {
  redesign: {
    label: "Redesenhar campanha",
    tagline: "Gerar uma variante optimizada com o assistente de redesign.",
    icon: Wand2, kind: "redesign", accent: "orange",
  },
  aguardar_maturacao: {
    label: "Aguardar maturação",
    tagline: "Campanha em aprendizagem — aguardar maturação e re-diagnosticar antes de qualquer mudança.",
    icon: Hourglass, kind: "info", accent: "sky",
  },
  manter_escalar: {
    label: "Manter e escalar",
    tagline: "Campanha saudável a subir — escalar verba da prospecção para crescer volume.",
    icon: Rocket, kind: "scale", accent: "emerald",
  },
  intervencao_cirurgica: {
    label: "Intervenção cirúrgica",
    tagline: "Podar e realocar nos adsets/ads existentes, sem redesenhar (preserva o aprendizado).",
    icon: Stethoscope, kind: "surgical", accent: "amber",
  },
  novo_desenho: {
    label: "Novo desenho",
    tagline: "Campanha esgotada — recomeçar do zero, herdando seletivamente criativos/audiências do evento.",
    icon: Sparkles, kind: "new_design", accent: "red",
  },
  recolher_mais_dados: {
    label: "Recolher mais dados",
    tagline: "Sem baseline suficiente — aguardar mais dados antes de decidir.",
    icon: Database, kind: "info", accent: "slate",
  },
};
// Ordem estável das alternativas (a recomendada é destacada à parte).
const POSTURE_ORDER = [
  "redesign", "aguardar_maturacao", "manter_escalar",
  "intervencao_cirurgica", "novo_desenho", "recolher_mais_dados",
];
const postureAccent: Record<string, { card: string; icon: string; badge: string; btn: string }> = {
  orange: {
    card: "border-orange-500/60 bg-orange-500/5", icon: "text-orange-400",
    badge: "bg-orange-500/10 text-orange-300 border-orange-500/40",
    btn: "border-orange-500/50 text-orange-300 hover:bg-orange-500/10",
  },
  sky: {
    card: "border-sky-500/60 bg-sky-500/5", icon: "text-sky-300",
    badge: "bg-sky-500/10 text-sky-300 border-sky-500/40",
    btn: "border-sky-500/50 text-sky-300 hover:bg-sky-500/10",
  },
  emerald: {
    card: "border-emerald-500/60 bg-emerald-500/5", icon: "text-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
    btn: "border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10",
  },
  amber: {
    card: "border-amber-500/60 bg-amber-500/5", icon: "text-amber-400",
    badge: "bg-amber-500/10 text-amber-300 border-amber-500/40",
    btn: "border-amber-500/50 text-amber-300 hover:bg-amber-500/10",
  },
  red: {
    card: "border-red-500/60 bg-red-500/5", icon: "text-red-400",
    badge: "bg-red-500/10 text-red-300 border-red-500/40",
    btn: "border-red-500/50 text-red-300 hover:bg-red-500/10",
  },
  slate: {
    card: "border-slate-500/50 bg-slate-500/5", icon: "text-slate-300",
    badge: "bg-slate-500/10 text-slate-300 border-slate-500/40",
    btn: "border-slate-500/50 text-slate-300 hover:bg-slate-500/10",
  },
};

// ── Vista de ações propostas (motor cirúrgico) ──────────────────────────────
// Grupos pela ordem de apresentação; ícone + label PT-PT.
const SURGICAL_GROUP_META: Record<
  string,
  { label: string; icon: any; order: number }
> = {
  pause: { label: "Pausar adsets", icon: Pause, order: 0 },
  reduce_budget: { label: "Reduzir verba", icon: TrendingDown, order: 1 },
  reallocate_increase: { label: "Realocar para winners", icon: TrendingUp, order: 2 },
  scale_increase: { label: "Escalar verba (prospecção)", icon: Rocket, order: 3 },
  pause_ad: { label: "Pausar anúncios", icon: Pause, order: 4 },
  recommendation: { label: "Recomendações (informativas)", icon: Info, order: 5 },
};
const SURGICAL_GROUP_ORDER = ["pause", "reduce_budget", "reallocate_increase", "scale_increase", "pause_ad", "recommendation"];
const verdictBadge: Record<string, string> = {
  winning: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  losing: "bg-red-500/10 text-red-300 border-red-500/40",
  saturated: "bg-amber-500/10 text-amber-300 border-amber-500/40",
  neutral: "bg-muted text-muted-foreground border-border",
};
const changeTypeMeta: Record<string, string> = {
  budget: "Orçamento", targeting: "Targeting", creative: "Criativo",
  status: "Status", bid: "Licitação", name: "Nome", other: "Outro",
};
const actionMeta: Record<string, string> = {
  pause: "Campanha pausada", activate: "Campanha ativada",
  update_budget: "Orçamento alterado", update_name: "Nome alterado",
  update_end_time: "Data de fim alterada",
};
const triggerMeta: Record<string, string> = {
  user_manual: "Manual", cron_auto: "Automático", ai_suggestion: "IA",
};

const relTime = (ts: string) =>
  formatDistanceToNow(new Date(ts), { addSuffix: true, locale: pt });

function truncId(id: string) {
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}
function actorLabel(id: string | null, map: Map<string, ProfileRow>) {
  if (!id) return "sistema";
  const p = map.get(id);
  if (p?.full_name && p.full_name.trim()) {
    const parts = p.full_name.trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  }
  if (p?.email) return p.email;
  return truncId(id);
}
function TrendIcon({ band }: { band?: string | null }) {
  const b = (band || "").toLowerCase();
  if (/sub|up|melhor/.test(b)) return <TrendingUp className="h-4 w-4 text-emerald-400" />;
  if (/caind|desc|down|pior/.test(b)) return <TrendingDown className="h-4 w-4 text-red-400" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

// Agrega o targeting de TODOS os adsets em conjuntos únicos
function aggregateTargeting(adsets: AdsetSnap[]) {
  const countries = new Set<string>();
  const cities = new Map<string, { name: string; radius?: number; unit?: string }>();
  const included = new Map<string, string>();
  const excluded = new Map<string, string>();
  let ageMin = Infinity;
  let ageMax = -Infinity;

  for (const a of adsets) {
    const t = a.targeting ?? {};
    const geo = t.geo_locations ?? {};
    (geo.countries ?? []).forEach((c: string) => countries.add(c));
    (geo.cities ?? []).forEach((c: any) =>
      cities.set(String(c.key ?? c.name), {
        name: c.name ?? String(c.key),
        radius: c.radius,
        unit: c.distance_unit,
      }),
    );
    if (typeof t.age_min === "number") ageMin = Math.min(ageMin, t.age_min);
    if (typeof t.age_max === "number") ageMax = Math.max(ageMax, t.age_max);
    (t.custom_audiences ?? []).forEach((x: any) =>
      included.set(String(x.id ?? x.name), x.name ?? String(x.id)),
    );
    (t.excluded_custom_audiences ?? []).forEach((x: any) =>
      excluded.set(String(x.id ?? x.name), x.name ?? String(x.id)),
    );
  }
  return {
    countries: [...countries],
    cities: [...cities.values()],
    ageMin: Number.isFinite(ageMin) ? ageMin : null,
    ageMax: Number.isFinite(ageMax) ? ageMax : null,
    included: [...included.values()],
    excluded: [...excluded.values()],
  };
}

export default function CrmCampaignView() {
  const { id } = useParams<{ id: string }>(); // external_campaign_id
  const displayCurrency = useDisplayCurrency();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { confirm: confirmMetaAction } = useConfirmMetaAction();
  const [toggling, setToggling] = useState(false);
  const [adsetToggling, setAdsetToggling] = useState<string | null>(null);
  const [adToggling, setAdToggling] = useState<string | null>(null);
  const [editAdsetBudget, setEditAdsetBudget] = useState<AdsetSnap | null>(null);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodState>(periodFromMode("30d"));
  // Tela de decisão: diagnóstico on-demand + escolha de acção (postura).
  const [diagnosing, setDiagnosing] = useState(false);
  const [selectedAlt, setSelectedAlt] = useState<string | null>(null);
  // DR-2026-06-27d — modo duelo (default OFF)
  const [duelMode, setDuelMode] = useState(false);
  const [duelLaunching, setDuelLaunching] = useState(false);
  // Peça 3 sub-tarefa 6 — Evidência histórica (brief) lazy-loaded
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefData, setBriefData] = useState<any | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefFetched, setBriefFetched] = useState(false);
  async function loadBrief() {
    if (briefFetched || briefLoading || !campaign) return;
    setBriefLoading(true);
    setBriefError(null);
    try {
      const target = Number(diagnosis?.target_roas) || 8;
      const { data, error } = await supabase.functions.invoke("crm-campaign-brief", {
        body: {
          campaign_id: campaign.external_campaign_id,
          caps: { target_blended_roas: target },
        },
      });
      if (error) {
        let detail = error.message;
        const ctx = (error as any).context;
        if (ctx) {
          try {
            const b = await (ctx.clone ? ctx.clone() : ctx).json();
            detail = b?.detail || b?.error || detail;
          } catch { /* noop */ }
        }
        setBriefError(detail || "erro desconhecido");
      } else if (data?.ok === false) {
        setBriefError(data?.detail || data?.error || "falha ao construir");
      } else {
        setBriefData(data?.brief ?? null);
      }
    } catch (e: any) {
      setBriefError(e?.message ?? String(e));
    } finally {
      setBriefLoading(false);
      setBriefFetched(true);
    }
  }
  // Intervenção cirúrgica (Etapa 3): prescrição on-demand + aprovação por ação.
  // Painel de prescrição partilhado pelo cirúrgico (Etapa 3) e pela escala (Etapa 4).
  const [surgicalOpen, setSurgicalOpen] = useState(false);
  const [surgicalLoading, setSurgicalLoading] = useState(false);
  const [surgicalError, setSurgicalError] = useState<string | null>(null);
  const [surgicalData, setSurgicalData] = useState<SurgicalPrescription | null>(null);
  const [selectedActions, setSelectedActions] = useState<Set<number>>(new Set());
  const [applyingSurgical, setApplyingSurgical] = useState(false);
  const [prescKind, setPrescKind] = useState<PrescriptionKind>("surgical");
  // Montagem Assistida (Camada 4 PARTE 2) — Sheet a tela cheia.
  const [assemblyOpen, setAssemblyOpen] = useState(false);
  const [assemblyFlow, setAssemblyFlow] = useState<"redesign" | "from_scratch">("redesign");
  // Quando preenchido, o painel CARREGA esta assembly em vez de recomputar.
  const [reviewAssemblyId, setReviewAssemblyId] = useState<string | null>(null);
  // Estúdio de Desenho de Campanha (Camada 5 PARTE 2)
  const [designStudioOpen, setDesignStudioOpen] = useState(false);
  // Preparar publicação no Meta (Elo de Publicação — FASE 1)
  const [metaPublishOpen, setMetaPublishOpen] = useState(false);

  // 1) Campanha
  const { data: campaign, isLoading: loadingCampaign, error: campaignError } =
    useQuery({
      queryKey: ["crm-campaign-view", id],
      enabled: !!id,
      queryFn: async () => {
        const { data, error } = await (supabase as any)
          .schema("crm")
          .from("meta_campaign_snapshot")
          .select("*")
          .eq("external_campaign_id", id)
          .maybeSingle();
        if (error) throw error;
        return data as CampaignSnap | null;
      },
    });

  // 2) Insights — período selecionado (Ontem / 7d / 30d)
  const periodFromStr = format(period.from, "yyyy-MM-dd");
  const periodToStr = format(period.to, "yyyy-MM-dd");
  const { data: insights } = useQuery({
    queryKey: ["crm-campaign-view-insights", id, periodFromStr, periodToStr],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_insights_daily")
        .select(
          "date_start, spend_cents, ctr, impressions, clicks, purchases_count, purchases_value_cents, roas, currency",
        )
        .eq("external_campaign_id", id)
        .gte("date_start", periodFromStr)
        .lte("date_start", periodToStr);
      if (error) throw error;
      return (data ?? []) as InsightRow[];
    },
  });



  // 2b) Insights por ADSET — mesma janela do PeriodSelector da campanha mãe.
  // Uma só query por campanha (índice idx_adset_insights_campaign_date) e
  // agregamos no cliente por external_adset_id (ver adsetMetricsMap abaixo).
  const { data: adsetInsights } = useQuery({
    queryKey: ["crm-campaign-view-adset-insights", id, periodFromStr, periodToStr],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_adset_insights_daily")
        .select(
          "external_adset_id, date_start, spend_cents, impressions, reach, clicks, purchases_count, purchases_value_cents, currency",
        )
        .eq("external_campaign_id", id)
        .gte("date_start", periodFromStr)
        .lte("date_start", periodToStr);
      if (error) throw error;
      return (data ?? []) as AdsetInsightRow[];
    },
  });

  // 2c) Insights por ANÚNCIO — idêntico ao adset (índice idx_ad_insights_campaign_date).
  const { data: adInsights } = useQuery({
    queryKey: ["crm-campaign-view-ad-insights", id, periodFromStr, periodToStr],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_ad_insights_daily")
        .select(
          "external_ad_id, date_start, spend_cents, impressions, reach, clicks, purchases_count, purchases_value_cents, currency",
        )
        .eq("external_campaign_id", id)
        .gte("date_start", periodFromStr)
        .lte("date_start", periodToStr);
      if (error) throw error;
      return (data ?? []) as AdInsightRow[];
    },
  });


  // 3) Adsets — incluímos connection_id/ad_account_id p/ poder chamar entity-action
  const { data: adsets } = useQuery({
    queryKey: ["crm-campaign-view-adsets", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_adset_snapshot")
        .select(
          "external_adset_id, name, status, effective_status, optimization_goal, billing_event, daily_budget_cents, lifetime_budget_cents, currency, targeting, connection_id, ad_account_id",
        )
        .eq("external_campaign_id", id);
      if (error) throw error;
      return (data ?? []) as AdsetSnap[];
    },
  });

  // 4) Ads — idem
  const { data: ads } = useQuery({
    queryKey: ["crm-campaign-view-ads", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_ad_snapshot")
        .select(
          "external_ad_id, external_adset_id, name, status, effective_status, meta_creative_id, connection_id, ad_account_id",
        )
        .eq("external_campaign_id", id);
      if (error) throw error;
      return (data ?? []) as AdSnap[];
    },
  });

  // 5) Criativos sincronizados que correspondem aos ads (join client-side por meta_creative_id)
  const creativeIds = useMemo(
    () =>
      Array.from(
        new Set((ads ?? []).map((a) => a.meta_creative_id).filter(Boolean) as string[]),
      ),
    [ads],
  );
  const { data: creatives } = useQuery({
    queryKey: ["crm-campaign-view-creatives", creativeIds.sort().join(",")],
    enabled: creativeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_creatives")
        .select(
          "id, meta_creative_id, name, type, file_url, file_mime_type, headline, body, cta_type, link_url, analysis_jsonb",
        )
        .in("meta_creative_id", creativeIds);
      if (error) throw error;
      return (data ?? []) as CreativeRow[];
    },
  });

  // 6) Diagnóstico IA — último entry
  const { data: diagnosis } = useQuery({
    queryKey: ["crm-campaign-view-diagnosis", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("campaign_diagnosis_360")
        .select("target_roas, source_campaign_class, projected_baseline_roas, diagnosis_jsonb, created_at")
        .eq("external_campaign_id", id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as DiagnosisRow | null;
    },
  });

  // 7) Histórico — mudanças (últimas 30)
  const { data: changes } = useQuery({
    queryKey: ["crm-campaign-view-changes", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_changes")
        .select("id, change_type, before_jsonb, after_jsonb, reason_text, triggered_by, applied_by_user_id, applied_at")
        .eq("external_campaign_id", id)
        .order("applied_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as ChangeRow[];
    },
  });

  // 8) Histórico — ações nível campanha (últimas 30)
  const { data: actions } = useQuery({
    queryKey: ["crm-campaign-view-actions", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_entity_actions_log")
        .select("id, action, prev_status, new_status, success, error_message, performed_by, performed_at")
        .eq("entity_type", "campaign")
        .eq("external_id", id)
        .order("performed_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as ActionRow[];
    },
  });

  // 9) Lookup de atores (profiles, public schema)
  const actorIds = useMemo(() => {
    const s = new Set<string>();
    (changes ?? []).forEach((c) => c.applied_by_user_id && s.add(c.applied_by_user_id));
    (actions ?? []).forEach((a) => a.performed_by && s.add(a.performed_by));
    return [...s];
  }, [changes, actions]);
  const { data: profiles } = useQuery({
    queryKey: ["crm-campaign-view-profiles", actorIds.sort().join(",")],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });
  const profileMap = useMemo(() => {
    const m = new Map<string, ProfileRow>();
    (profiles ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  // Timeline combinada (change + action), desc, top 30
  const timeline = useMemo(() => {
    type T = {
      key: string; ts: string; type: "change" | "action"; success: boolean;
      actorId: string | null; title: string; subtitle: string; trigger?: string | null;
    };
    const items: T[] = [];
    for (const c of changes ?? []) {
      const label = changeTypeMeta[c.change_type] ?? c.change_type;
      items.push({
        key: `c-${c.id}`, ts: c.applied_at, type: "change", success: true,
        actorId: c.applied_by_user_id, trigger: c.triggered_by,
        title: `${label} alterado`,
        subtitle: c.reason_text ?? "",
      });
    }
    for (const a of actions ?? []) {
      items.push({
        key: `a-${a.id}`, ts: a.performed_at, type: "action", success: a.success,
        actorId: a.performed_by,
        title: actionMeta[a.action] ?? a.action,
        subtitle: a.success
          ? [a.prev_status, a.new_status].filter(Boolean).join(" → ")
          : (a.error_message ?? "falhou"),
      });
    }
    items.sort((x, y) => new Date(y.ts).getTime() - new Date(x.ts).getTime());
    return items.slice(0, 30);
  }, [changes, actions]);

  // ── Derivados ──────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const rows = insights ?? [];
    const spend = rows.reduce((s, r) => s + (r.spend_cents ?? 0), 0);
    const revenue = rows.reduce((s, r) => s + (r.purchases_value_cents ?? 0), 0);
    const conversions = rows.reduce((s, r) => s + (r.purchases_count ?? 0), 0);
    const roas = spend > 0 ? revenue / spend : null;
    const currency = rows.find((r) => r.currency)?.currency ?? displayCurrency;
    return { spend, revenue, conversions, roas, currency };
  }, [insights, displayCurrency]);

  // Agregação por entidade (mesma lógica do `metrics` da mãe, replicada um
  // nível abaixo). Divisões protegidas: numerador/denominador inválido → null
  // (renderiza "—") em vez de 0/NaN, para distinguir "sem dados" de "zero real".
  function aggregateRows<T extends {
    spend_cents: number | null; impressions: number | null; reach: number | null;
    clicks: number | null; purchases_count: number | null;
    purchases_value_cents: number | null; currency: string | null;
  }>(rows: T[]): EntityMetrics {
    const spend = rows.reduce((s, r) => s + (r.spend_cents ?? 0), 0);
    const impressions = rows.reduce((s, r) => s + (r.impressions ?? 0), 0);
    const reach = rows.reduce((s, r) => s + (r.reach ?? 0), 0);
    const clicks = rows.reduce((s, r) => s + (r.clicks ?? 0), 0);
    const purchases = rows.reduce((s, r) => s + (r.purchases_count ?? 0), 0);
    const revenue = rows.reduce((s, r) => s + (r.purchases_value_cents ?? 0), 0);
    return {
      spend, impressions, reach, clicks, purchases, revenue,
      cpc: clicks > 0 ? spend / clicks : null,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
      ctr: impressions > 0 ? clicks / impressions : null,
      frequency: reach > 0 ? impressions / reach : null,
      roas: spend > 0 ? revenue / spend : null,
      currency: rows.find((r) => r.currency)?.currency ?? null,
    };
  }
  const adsetMetricsMap = useMemo(() => {
    const m = new Map<string, EntityMetrics>();
    const byId = new Map<string, AdsetInsightRow[]>();
    for (const r of adsetInsights ?? []) {
      const k = r.external_adset_id;
      const arr = byId.get(k) ?? [];
      arr.push(r);
      byId.set(k, arr);
    }
    for (const [k, arr] of byId) m.set(k, aggregateRows(arr));
    return m;
  }, [adsetInsights]);
  const adMetricsMap = useMemo(() => {
    const m = new Map<string, EntityMetrics>();
    const byId = new Map<string, AdInsightRow[]>();
    for (const r of adInsights ?? []) {
      const k = r.external_ad_id;
      const arr = byId.get(k) ?? [];
      arr.push(r);
      byId.set(k, arr);
    }
    for (const [k, arr] of byId) m.set(k, aggregateRows(arr));
    return m;
  }, [adInsights]);


  const targeting = useMemo(() => aggregateTargeting(adsets ?? []), [adsets]);

  const creativeByMetaId = useMemo(() => {
    const m = new Map<string, CreativeRow>();
    (creatives ?? []).forEach((c) => {
      if (c.meta_creative_id) m.set(c.meta_creative_id, c);
    });
    return m;
  }, [creatives]);

  // ── Camada 2: Validação de mensagem dos criativos ──────────────────────────
  type MessageValidationRow = {
    creative_id: string;
    semaforo: "coerente" | "atencao" | "contradiz";
    aproveita_gatilhos: boolean;
    explicacao: string | null;
    sugestao_copy: string | null;
    validated_at: string;
    analysis_model: string | null;
  };

  const creativeIdList = useMemo(
    () => (creatives ?? []).map((c) => c.id).sort(),
    [creatives],
  );
  const eventIdForValidation = campaign?.linked_event_id ?? null;
  const companyIdForValidation = campaign?.company_id ?? null;

  const { data: messageValidations } = useQuery({
    queryKey: ["crm-campaign-view-msg-validation", eventIdForValidation, creativeIdList.join(",")],
    enabled: !!eventIdForValidation && creativeIdList.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("creative_message_validation")
        .select("creative_id, semaforo, aproveita_gatilhos, explicacao, sugestao_copy, validated_at, analysis_model")
        .eq("event_id", eventIdForValidation)
        .in("creative_id", creativeIdList);
      if (error) throw error;
      return (data ?? []) as MessageValidationRow[];
    },
  });

  const validationByCreativeId = useMemo(() => {
    const m = new Map<string, MessageValidationRow>();
    (messageValidations ?? []).forEach((v) => m.set(v.creative_id, v));
    return m;
  }, [messageValidations]);

  const [validatingMessages, setValidatingMessages] = useState(false);

  async function runValidateMessages() {
    if (!eventIdForValidation || !companyIdForValidation || creativeIdList.length === 0) return;
    setValidatingMessages(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-validate-creative-messages", {
        body: {
          company_id: companyIdForValidation,
          event_id: eventIdForValidation,
          creative_ids: creativeIdList,
        },
      });
      if (error) throw error;
      const errCount = (data?.results ?? []).filter((r: any) => r.error).length;
      const okCount = (data?.results ?? []).filter((r: any) => !r.error).length;
      if (errCount > 0) {
        toast.warning(`Validação concluída: ${okCount} OK, ${errCount} com erro.`);
      } else {
        toast.success(`Mensagens validadas (${okCount}).`);
      }
      await qc.invalidateQueries({ queryKey: ["crm-campaign-view-msg-validation"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao validar mensagens");
    } finally {
      setValidatingMessages(false);
    }
  }


  // ── ABO vs CBO detection ─────────────────────────────────────────────────
  // Precedência: ABO ganha. Razão: no Meta, ABO = budget vive nos adsets;
  // a campanha pode reter um daily/lifetime stale ao nível da campanha que
  // NÃO reflete o orçamento real. Se os adsets têm budget próprio é ABO.
  //   adsetsHaveBudget > 0  → ABO
  //   senão campaignHasBudget → CBO
  //   senão unknown
  const budgetSummary = useMemo(() => {
    const list = adsets ?? [];
    const sumDaily = list.reduce((s, a) => s + (a.daily_budget_cents ?? 0), 0);
    const sumLifetime = list.reduce((s, a) => s + (a.lifetime_budget_cents ?? 0), 0);
    const campaignHasBudget =
      (campaign?.daily_budget_cents ?? 0) > 0 ||
      (campaign?.lifetime_budget_cents ?? 0) > 0;
    const adsetsHaveBudget = sumDaily > 0 || sumLifetime > 0;
    const mode: "CBO" | "ABO" | "unknown" = adsetsHaveBudget
      ? "ABO"
      : campaignHasBudget
        ? "CBO"
        : "unknown";
    return {
      mode,
      daily_cents:
        mode === "ABO" ? sumDaily || null : campaign?.daily_budget_cents ?? null,
      lifetime_cents:
        mode === "ABO" ? sumLifetime || null : campaign?.lifetime_budget_cents ?? null,
      adsetCount: list.length,
    };
  }, [campaign, adsets]);

  // ── Toggle Adset / Ad (reutiliza a edge fn crm-meta-entity-action) ───────
  async function runEntityToggle(opts: {
    entity_type: "adset" | "ad";
    external_id: string;
    connection_id: string;
    ad_account_id?: string;
    target: "ACTIVE" | "PAUSED";
    label: string;
  }) {
    // ATIVAR passa pelo guard de confirmação (gasta). PAUSAR mantém o caminho directo.
    if (opts.target === "ACTIVE") {
      const result = await confirmMetaAction(
        [{
          connection_id: opts.connection_id,
          entity_type: opts.entity_type,
          external_id: opts.external_id,
          ad_account_id: opts.ad_account_id,
          action: "activate",
          label: opts.label,
          triggered_by: "user_manual",
        }],
        { title: `Ativar ${opts.entity_type}`, description: `${opts.label} vai começar a gastar.` },
      );
      if (result.ok > 0) {
        qc.invalidateQueries({
          queryKey: [opts.entity_type === "adset" ? "crm-campaign-view-adsets" : "crm-campaign-view-ads", id],
        });
      }
      return;
    }

    const setter = opts.entity_type === "adset" ? setAdsetToggling : setAdToggling;
    setter(opts.external_id);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-entity-action", {
        body: {
          connection_id: opts.connection_id,
          entity_type: opts.entity_type,
          external_id: opts.external_id,
          action: "pause",
          ad_account_id: opts.ad_account_id,
          triggered_by: "user_manual",
        },
      });
      if (error) {
        let detail = error.message;
        const ctx = (error as any).context;
        if (ctx) {
          try {
            const b = await (ctx.clone ? ctx.clone() : ctx).json();
            detail = b?.detail || b?.error || detail;
          } catch {}
        }
        throw new Error(detail);
      }
      if ((data as any)?.ok === false) throw new Error((data as any)?.detail ?? "Falha");
      toast.success(`${opts.label} pausado`);
      qc.invalidateQueries({
        queryKey: [opts.entity_type === "adset" ? "crm-campaign-view-adsets" : "crm-campaign-view-ads", id],
      });
    } catch (e: any) {
      toast.error("Falha a alterar status no Meta", { description: e?.message ?? String(e) });
    } finally {
      setter(null);
    }
  }


  // ── Ações (duplicação leve do toggle da lista; ver Campaigns.tsx) ───────────
  async function runToggle(target: "ACTIVE" | "PAUSED", reasonText?: string) {
    if (!campaign) return;
    // ATIVAR campanha → passa pelo guard de confirmação (vai gastar).
    if (target === "ACTIVE") {
      const r = await confirmMetaAction(
        [{
          connection_id: (campaign as any).connection_id,
          entity_type: "campaign",
          external_id: campaign.external_campaign_id,
          ad_account_id: (campaign as any).ad_account_id,
          action: "activate",
          label: `Campanha «${campaign.name}»`,
          triggered_by: "user_manual",
          reason_text: reasonText ?? null,
        }],
        { title: "Ativar campanha", description: "A campanha vai começar a gastar imediatamente." },
      );
      if (r.ok > 0) qc.invalidateQueries({ queryKey: ["crm-campaign-view", id] });
      return;
    }

    setToggling(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-entity-action", {
        body: {
          connection_id: (campaign as any).connection_id,
          entity_type: "campaign",
          external_id: campaign.external_campaign_id,
          action: "pause",
          ad_account_id: (campaign as any).ad_account_id,
          ...(reasonText ? { reason_text: reasonText, triggered_by: "user_manual" } : {}),
        },
      });
      if (error) {
        let detail = error.message;
        const ctx = (error as any).context;
        if (ctx) {
          try {
            const b = await (ctx.clone ? ctx.clone() : ctx).json();
            detail = b?.detail || b?.error || detail;
          } catch {}
        }
        throw new Error(detail);
      }
      if ((data as any)?.ok === false) throw new Error((data as any)?.detail ?? "Falha");
      toast.success(`Campanha "${campaign.name}" pausada`);
      qc.invalidateQueries({ queryKey: ["crm-campaign-view", id] });
    } catch (e: any) {
      toast.error("Falha a alterar status no Meta", { description: e?.message ?? String(e) });
    } finally {
      setToggling(false);
    }
  }

  // ── Diagnóstico on-demand (mesmo padrão da DiagnosisTest) ──────────────────
  // Corre crm-campaign-diagnosis e refaz a query do diagnóstico no fim.
  async function runDiagnose() {
    if (!campaign) return;
    setDiagnosing(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-campaign-diagnosis", {
        body: {
          company_id: (campaign as any).company_id,
          external_campaign_id: campaign.external_campaign_id,
          target_roas: diagnosis?.target_roas ?? 8.0,
        },
      });
      if (error) {
        let detail = error.message;
        const ctx = (error as any).context;
        if (ctx) {
          try {
            const b = await (ctx.clone ? ctx.clone() : ctx).json();
            detail = b?.detail || b?.error || detail;
          } catch {}
        }
        throw new Error(detail);
      }
      if ((data as any)?.ok === false) {
        throw new Error((data as any)?.detail ?? (data as any)?.error ?? "Falha no diagnóstico");
      }
      toast.success("Diagnóstico atualizado");
      setSelectedAlt(null);
      await qc.invalidateQueries({ queryKey: ["crm-campaign-view-diagnosis", id] });
    } catch (e: any) {
      toast.error("Falha ao diagnosticar", { description: e?.message ?? String(e) });
    } finally {
      setDiagnosing(false);
    }
  }

  // DR-2026-06-27d — dispara duelo Gemini-Pro × GPT-5 e navega para /audience/duels/:duel_id
  async function launchDuel() {
    if (!campaign || !diagnosis) return;
    setDuelLaunching(true);
    try {
      const target = Number(diagnosis?.target_roas) || 8;
      const { data, error } = await supabase.functions.invoke("crm-audience-duel", {
        body: {
          campaign_id: campaign.external_campaign_id,
          caps: { target_blended_roas: target },
        },
      });
      if (error) {
        let detail = error.message;
        const ctx = (error as any).context;
        if (ctx) {
          try {
            const b = await (ctx.clone ? ctx.clone() : ctx).json();
            detail = b?.detail || b?.error || detail;
          } catch {}
        }
        throw new Error(detail);
      }
      const duelId = (data as any)?.duel_id;
      if (!duelId) throw new Error("Resposta sem duel_id");
      toast.success("Duelo iniciado");
      navigate(`/audience/duels/${duelId}`);
    } catch (e: any) {
      toast.error("Falha a iniciar duelo", { description: e?.message ?? String(e) });
    } finally {
      setDuelLaunching(false);
    }
  }

  function goRedesign() {
    if (!campaign) return;
    navigate(`/audience/strategies/redesign/${campaign.external_campaign_id}`);
  }

  function goNewDesign() {
    if (!campaign) return;
    // Fase 4 (cenário C): navega para o from-scratch unificado com o contexto da
    // campanha diagnosticada. A StrategyNewDesign antiga fica como fallback até
    // ao deprecate na Peça 2 (herança seletiva de criativos).
    const params = new URLSearchParams();
    const evId = (campaign as any).linked_event_id;
    if (evId) params.set("event_id", String(evId));
    if (campaign.external_campaign_id) {
      params.set("reference_campaign_id", String(campaign.external_campaign_id));
    }
    const tr = Number((diagnosis as any)?.target_roas) || 8;
    if (Number.isFinite(tr) && tr > 0) params.set("target_roas", String(tr));
    const connId = (campaign as any).connection_id;
    if (connId) params.set("connection_id", String(connId));
    params.set("source", "campaign_view");
    navigate(`/audience/campaigns/new?${params.toString()}`);
  }

  // ── Gerar prescrição (cirúrgico OU escala — mesma vista, função conforme kind) ──
  function runSurgical() { return runPrescription("surgical"); }
  function runScale() { return runPrescription("scale"); }
  async function runPrescription(kind: PrescriptionKind) {
    if (!campaign) return;
    setPrescKind(kind);
    setSurgicalOpen(true);
    setSurgicalLoading(true);
    setSurgicalError(null);
    try {
      const fn = kind === "scale" ? "crm-meta-campaign-scale" : "crm-meta-campaign-surgical";
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { campaign_id: campaign.external_campaign_id, period_days: 30 },
      });
      if (error) {
        let detail = error.message;
        const ctx = (error as any).context;
        if (ctx) {
          try {
            const b = await (ctx.clone ? ctx.clone() : ctx).json();
            detail = b?.message || b?.detail || b?.error || detail;
          } catch {}
        }
        throw new Error(detail);
      }
      if ((data as any)?.ok === false || (data as any)?.error) {
        throw new Error((data as any)?.message ?? (data as any)?.detail ?? (data as any)?.error ?? "Falha");
      }
      const presc = data as SurgicalPrescription;
      setSurgicalData(presc);
      // Seleção por defeito: executáveis, não bloqueadas, marcadas pela engine.
      const def = new Set<number>();
      for (const a of presc.proposed_actions) {
        if (a.executable && !a.blocked && a.selected_by_default) def.add(a.action_index);
      }
      setSelectedActions(def);
    } catch (e: any) {
      setSurgicalError(e?.message ?? String(e));
      setSurgicalData(null);
    } finally {
      setSurgicalLoading(false);
    }
  }

  // ── Aplicar selecionadas: lote agora passa pelo guard de confirmação ────────
  // Build dos pending actions → ConfirmMetaActionDialog faz dry_run em batch
  // → utilizador vê o resumo completo (pausas + deltas de verba) → confirma.
  async function applySurgical() {
    if (!surgicalData) return;
    const toApply = surgicalData.proposed_actions.filter(
      (a) => a.executable && !a.blocked && a.entity_action && selectedActions.has(a.action_index),
    );
    if (toApply.length === 0) {
      toast.error("Nenhuma ação selecionada");
      return;
    }
    const pending: PendingMetaAction[] = toApply.map((a) => ({
      connection_id: a.connection_id,
      entity_type: a.entity_type as "campaign" | "adset" | "ad",
      external_id: a.external_id,
      ad_account_id: a.ad_account_id,
      action: a.entity_action!.action as "pause" | "activate" | "update",
      updates: a.entity_action!.updates,
      label: a.entity_name ?? a.external_id,
      diagnosis_id: surgicalData.diagnosis_id,
      applied_action_index: a.action_index,
      triggered_by: "ai_suggestion",
      reason_text: a.rationale,
      measure_impact_requested: true,
    }));
    setApplyingSurgical(true);
    try {
      const r = await confirmMetaAction(pending, {
        title: prescKind === "scale" ? "Aplicar plano de escala" : "Aplicar ações cirúrgicas",
        description: `${pending.length} acção(ões) — revê deltas e bloqueios antes de aplicar no Meta.`,
      });
      if (r.fail > 0) toast.error(`${r.fail} ação(ões) falharam`);
      if (r.ok > 0 || !r.aborted) {
        await qc.invalidateQueries({ queryKey: ["crm-campaign-view-adsets", id] });
        await qc.invalidateQueries({ queryKey: ["crm-campaign-view-ads", id] });
        await qc.invalidateQueries({ queryKey: ["crm-campaign-view-diagnosis", id] });
        if (r.ok > 0) await runPrescription(prescKind);
      }
    } finally {
      setApplyingSurgical(false);
    }
  }

  // ── Estados ──────────────────────────────────────────────────────────────
  if (loadingCampaign) {
    return (
      <div className="space-y-6 max-w-6xl">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (campaignError || !campaign) {
    return (
      <Card className="p-6 text-sm text-destructive max-w-6xl">
        Campanha não encontrada.
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/audience/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao dashboard
          </Button>
        </div>
      </Card>
    );
  }

  const cur = metrics.currency;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/audience/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Campanhas
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight">{campaign.name}</h1>
            <Badge variant="outline" className={cn("border", statusColor(campaign.effective_status ?? campaign.status))}>
              {campaign.effective_status ?? campaign.status ?? "—"}
            </Badge>
            {campaign.objective && (
              <Badge variant="outline" className="border-border text-muted-foreground">
                {campaign.objective}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {(() => {
            const eff = campaign.effective_status ?? campaign.status ?? null;
            const isActive = eff === "ACTIVE";
            const isPaused = eff === "PAUSED";
            return (
              <div className="flex items-center gap-1.5">
                {(isActive || isPaused) && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={toggling}
                    onClick={() => {
                      if (isActive) {
                        if (!confirm(`Pausar campanha "${campaign.name}" no Meta? Pode reactivar depois.`)) return;
                        runToggle("PAUSED");
                      } else {
                        setReactivateOpen(true);
                      }
                    }}
                    className={cn(
                      "h-7 px-2 text-[11px]",
                      isActive
                        ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                        : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10",
                    )}
                  >
                    {toggling ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isActive ? (
                      <><Pause className="h-3 w-3 mr-1" />Pausar</>
                    ) : (
                      <><Play className="h-3 w-3 mr-1" />Activar</>
                    )}
                  </Button>
                )}
                <EditCampaignPopover
                  c={campaign as unknown as CampaignRow}
                  budgetMode={budgetSummary.mode}
                  onSaved={() => qc.invalidateQueries({ queryKey: ["crm-campaign-view", id] })}
                />

              </div>
            );
          })()}
          <div className="text-xs text-muted-foreground text-right">
            {dateFmt(campaign.start_time)} — {campaign.stop_time ? dateFmt(campaign.stop_time) : "sem fim"}
          </div>
        </div>
      </div>

      {/* Métricas chave (período selecionável) */}
      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Métricas chave ·{" "}
            {period.mode === "yesterday"
              ? "ontem"
              : period.mode === "7d"
                ? "últimos 7 dias"
                : "últimos 30 dias"}
          </h2>
          <PeriodSelector
            mode={period.mode}
            onChange={(m) => setPeriod(periodFromMode(m))}
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard icon={TrendingUp} label="ROAS" value={metrics.roas == null ? "—" : `${metrics.roas.toFixed(2)}x`} />
          <MetricCard icon={Wallet} label="Gasto" value={eur(metrics.spend, cur)} />
          <MetricCard icon={ShoppingCart} label="Receita" value={eur(metrics.revenue, cur)} />
          <MetricCard icon={Users} label="Conversões" value={intFmt(metrics.conversions)} />
        </div>
        {(insights ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground mt-2">Sem dados de insights no período selecionado.</p>
        )}
      </div>

      {/* Diagnóstico & Decisão — tela de decisão adaptativa (opção C) */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" /> Diagnóstico &amp; Decisão
          </h2>
          <div className="flex items-center gap-3 flex-wrap">
            {/* DR-2026-06-27d — toggle Modo duelo */}
            <TooltipProvider delayDuration={150}>
              <div className="flex items-center gap-2">
                <Switch
                  id="duel-mode"
                  checked={duelMode}
                  onCheckedChange={setDuelMode}
                />
                <label htmlFor="duel-mode" className="text-[11px] text-muted-foreground cursor-pointer select-none">
                  Modo duelo
                </label>
              </div>
              {duelMode && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={!diagnosis || duelLaunching}
                        onClick={launchDuel}
                        className="h-7 px-2 text-[11px] bg-cyan-500 hover:bg-cyan-600 text-white"
                      >
                        {duelLaunching
                          ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          : <Sparkles className="h-3 w-3 mr-1" />}
                        Gerar duelo (Gemini-Pro × GPT-5)
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!diagnosis && (
                    <TooltipContent>Faz primeiro o diagnóstico 360</TooltipContent>
                  )}
                </Tooltip>
              )}
            </TooltipProvider>
            <Button
              size="sm"
              variant="outline"
              disabled={diagnosing}
              onClick={runDiagnose}
              className="h-7 px-2 text-[11px]"
            >
              {diagnosing
                ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                : <RefreshCw className="h-3 w-3 mr-1" />}
              {diagnosis ? "Re-diagnosticar" : "Diagnosticar agora"}
            </Button>
          </div>
        </div>

        {!diagnosis ? (
          <p className="text-sm text-muted-foreground">
            Sem diagnóstico para esta campanha. Corre o diagnóstico para ver a recomendação e as
            ações disponíveis.
          </p>
        ) : (() => {
          const dj = diagnosis.diagnosis_jsonb ?? {};
          const cls = diagnosis.source_campaign_class ?? "";
          const cm = classMeta[cls];
          // recommended_posture vem do espelho do diagnóstico; fallback deriva da classe
          // (compat com diagnósticos antigos). Nomes batem com POSTURE_BY_CLASS.
          const classPosture: Record<string, string> = {
            saudavel_subindo: "manter_escalar",
            saudavel_caindo: "intervencao_cirurgica",
            fraca: "redesign",
            morta: "novo_desenho",
            indeterminada: "recolher_mais_dados",
            em_maturacao: "aguardar_maturacao",
          };
          const recommended = (dj.recommended_posture as string | undefined) ?? classPosture[cls];
          const trendBand = dj?.levels?.campaign?.trajectory?.trend_band as string | undefined;
          const reason = dj?.levels?.campaign?.classification?.classification_reason as string | undefined;
          const warning = dj.operational_warning as { message?: string; is_winddown?: boolean } | undefined;
          const matGate = dj.maturation_gate as
            | { applies?: boolean; is_immature?: boolean; threshold?: number; conversion_adsets_count?: number }
            | undefined;

          // Renderiza um cartão de postura (recomendado ou alternativa).
          const renderCard = (pk: string, isRec: boolean) => {
            const m = postureMeta[pk];
            if (!m) return null;
            const ac = postureAccent[m.accent] ?? postureAccent.slate;
            const Icon = m.icon;
            const isSelected = !isRec && selectedAlt === pk;
            return (
              <button
                type="button"
                key={pk}
                onClick={isRec ? undefined : () => setSelectedAlt(isSelected ? null : pk)}
                className={cn(
                  "text-left rounded-lg border p-4 transition-colors",
                  isRec || isSelected ? ac.card : "border-border hover:border-muted-foreground/40",
                  isRec ? "cursor-default" : "cursor-pointer",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={cn("h-4 w-4 shrink-0", ac.icon)} />
                  <span className="font-semibold text-sm">{m.label}</span>
                  {isRec && (
                    <Badge variant="outline" className={cn("ml-auto border text-[10px] gap-0.5", ac.badge)}>
                      <Star className="h-3 w-3" /> Recomendado
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{m.tagline}</p>
                {isRec && (
                  <div className="mt-3">
                    {cls === "fraca" || cls === "morta" ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        {cls === "fraca" ? (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              className={cn("h-7 px-2 text-[11px] flex-1", ac.btn)}
                              onClick={goRedesign}
                            >
                              <Wand2 className="h-3 w-3 mr-1" /> Redesenhar
                              <Badge variant="outline" className={cn("ml-2 border text-[10px] gap-0.5", ac.badge)}>
                                <Star className="h-3 w-3" /> Recomendado
                              </Badge>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn("h-7 px-2 text-[11px] flex-1", ac.btn)}
                              onClick={goNewDesign}
                            >
                              <Sparkles className="h-3 w-3 mr-1" /> Começar do zero
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              className={cn("h-7 px-2 text-[11px] flex-1", ac.btn)}
                              onClick={goNewDesign}
                            >
                              <Sparkles className="h-3 w-3 mr-1" /> Começar do zero
                              <Badge variant="outline" className={cn("ml-2 border text-[10px] gap-0.5", ac.badge)}>
                                <Star className="h-3 w-3" /> Recomendado
                              </Badge>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn("h-7 px-2 text-[11px] flex-1", ac.btn)}
                              onClick={goRedesign}
                            >
                              <Wand2 className="h-3 w-3 mr-1" /> Redesenhar
                            </Button>
                          </>
                        )}
                      </div>
                    ) : m.kind === "redesign" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn("h-7 px-2 text-[11px]", ac.btn)}
                        onClick={goRedesign}
                      >
                        <Wand2 className="h-3 w-3 mr-1" /> Redesenhar
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    ) : m.kind === "surgical" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn("h-7 px-2 text-[11px]", ac.btn)}
                        onClick={runSurgical}
                      >
                        <Scissors className="h-3 w-3 mr-1" /> Ver ações propostas
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    ) : m.kind === "scale" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn("h-7 px-2 text-[11px]", ac.btn)}
                        onClick={runScale}
                      >
                        <Rocket className="h-3 w-3 mr-1" /> Ver ações de escala
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    ) : m.kind === "new_design" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn("h-7 px-2 text-[11px]", ac.btn)}
                        onClick={goNewDesign}
                      >
                        <Sparkles className="h-3 w-3 mr-1" /> Desenhar do zero
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    ) : m.kind === "coming_soon" ? (
                      <Button size="sm" variant="outline" disabled className="h-7 px-2 text-[11px]">
                        Em breve
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">
                        Sem fluxo de geração — ver métricas acima.
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          };

          return (
            <>
              {/* Resumo do diagnóstico */}
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="outline" className={cn("border text-sm px-3 py-1", cm?.color ?? "border-border")}>
                  {cm?.label ?? cls ?? "—"}
                </Badge>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">Tendência:</span>
                  <TrendIcon band={trendBand} />
                  <strong>{trendBand ?? "—"}</strong>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Baseline: </span>
                  <strong>{diagnosis.projected_baseline_roas != null ? `${Number(diagnosis.projected_baseline_roas).toFixed(2)}x` : "—"}</strong>
                  {diagnosis.target_roas != null && (
                    <span className="text-muted-foreground"> · Target: <strong className="text-foreground">{Number(diagnosis.target_roas).toFixed(2)}x</strong></span>
                  )}
                </div>
              </div>

              {reason && (
                <div className="rounded-lg border border-border p-3 text-sm">
                  <span className="text-muted-foreground">Razão: </span>{reason}
                </div>
              )}

              {matGate?.applies && matGate?.is_immature && (
                <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-sky-200">
                  Campanha em aprendizagem: {matGate.conversion_adsets_count ?? 0} adset(s) de conversão,
                  nenhum atingiu {matGate.threshold ?? 50} eventos de otimização em 7 dias. Aguardar
                  maturação e re-diagnosticar.
                </div>
              )}

              {warning?.message && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-200">
                    {warning.message}
                    {warning.is_winddown && <span className="ml-1 font-medium">(wind-down)</span>}
                  </div>
                </div>
              )}

              {/* Ação recomendada — destacada */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Ação recomendada
                </div>
                {recommended && postureMeta[recommended] ? (
                  renderCard(recommended, true)
                ) : (
                  <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                    Postura recomendada: <strong className="text-foreground">{recommended ?? "—"}</strong>
                  </div>
                )}
              </div>

              {/* Alternativas — lado a lado, escolha-se a AÇÃO (não a classe) */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Outras ações
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {POSTURE_ORDER.filter((p) => p !== recommended).map((p) => renderCard(p, false))}
                </div>
              </div>

              {/* Aviso (não bloqueia) quando se escolhe uma alternativa à recomendação */}
              {selectedAlt && selectedAlt !== recommended && (() => {
                const m = postureMeta[selectedAlt];
                const recLabel = recommended ? (postureMeta[recommended]?.label ?? recommended) : "—";
                return (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                    <div className="flex items-start gap-2 text-sm text-amber-200">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                      <div>
                        Escolheste <strong>{m?.label ?? selectedAlt}</strong>, diferente da ação
                        recomendada (<strong>{recLabel}</strong>). Podes prosseguir à mesma.
                      </div>
                    </div>
                    <div>
                      {m?.kind === "redesign" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px] border-amber-500/50 text-amber-200 hover:bg-amber-500/20"
                          onClick={goRedesign}
                        >
                          <Wand2 className="h-3 w-3 mr-1" /> Redesenhar mesmo assim
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      ) : m?.kind === "surgical" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px] border-amber-500/50 text-amber-200 hover:bg-amber-500/20"
                          onClick={runSurgical}
                        >
                          <Scissors className="h-3 w-3 mr-1" /> Ver ações propostas
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      ) : m?.kind === "scale" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px] border-amber-500/50 text-amber-200 hover:bg-amber-500/20"
                          onClick={runScale}
                        >
                          <Rocket className="h-3 w-3 mr-1" /> Ver ações de escala
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      ) : m?.kind === "new_design" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px] border-amber-500/50 text-amber-200 hover:bg-amber-500/20"
                          onClick={goNewDesign}
                        >
                          <Sparkles className="h-3 w-3 mr-1" /> Desenhar do zero
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      ) : m?.kind === "coming_soon" ? (
                        <Button size="sm" variant="outline" disabled className="h-7 px-2 text-[11px]">
                          Em breve (Etapas 4-5)
                        </Button>
                      ) : (
                        <span className="text-[11px] text-amber-200/80 italic">
                          Esta ação não tem fluxo de geração.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                Última análise: {relTime(diagnosis.created_at)}
              </div>
            </>
          );
        })()}

        {diagnosis && (
          <Accordion
            type="single"
            collapsible
            className="border-t border-border pt-2"
            onValueChange={(v) => { if (v === "brief") void loadBrief(); }}
          >
            <AccordionItem value="brief" className="border-none">
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-2">
                <span className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  Evidência histórica (o que o motor vê)
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <p className="text-[11px] text-muted-foreground mb-3">
                  Esta é a evidência objetiva que o motor de estratégias usa para informar
                  as propostas. São dados reais desta campanha/conta.
                </p>
                {briefLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar evidência…
                  </div>
                )}
                {!briefLoading && briefError && (
                  <div className="text-[11px] text-amber-300/80">
                    Não foi possível carregar a evidência: {briefError}
                  </div>
                )}
                {!briefLoading && !briefError && briefData && (() => {
                  const b: any = briefData;
                  const ranking = Array.isArray(b?.audience_ranking?.items) ? b.audience_ranking.items.slice(0, 6) : [];
                  const saturating = Array.isArray(b?.adset_saturation) ? b.adset_saturation.filter((a: any) => a?.saturating) : [];
                  const winners = Array.isArray(b?.winners_packet) ? b.winners_packet.filter((w: any) => w?.label === "winner").slice(0, 6) : [];
                  const fatigued = Array.isArray(b?.winners_packet) ? b.winners_packet.filter((w: any) => w?.fatigue?.fatigued) : [];
                  const gaps = b?.format_gaps ?? null;
                  const via = b?.viability ?? null;
                  const fmtRoas = (x: any) => (x == null ? "—" : `${Number(x).toFixed(2)}x`);
                  const fmtPct = (x: any) => (x == null ? "—" : `${(Number(x) * 100).toFixed(2)}%`);
                  const fmtEur = (x: any) => (x == null ? "—" : `${Number(x).toFixed(2)}€`);
                  const sevColor = (s: string) =>
                    s === "unrealistic" ? "bg-red-500/20 text-red-300 border-red-500/40"
                    : s === "aggressive" ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : s === "stretch" ? "bg-yellow-500/15 text-yellow-300 border-yellow-500/30"
                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";

                  return (
                    <div className="space-y-5">
                      {ranking.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs font-semibold">Audiências por desempenho</div>
                          {b?.audience_ranking?.note && (
                            <div className="text-[10px] text-muted-foreground">{b.audience_ranking.note}</div>
                          )}
                          <div className="space-y-1">
                            {ranking.map((it: any, i: number) => (
                              <div key={i} className="flex items-center justify-between gap-2 text-[11px] bg-muted/30 rounded px-2 py-1">
                                <span className="truncate flex-1" title={it?.name}>{it?.name ?? "—"}</span>
                                <Badge variant="outline" className="text-[10px] font-mono">{fmtRoas(it?.roas)}</Badge>
                                <span className="text-muted-foreground tabular-nums">{it?.purchases_count ?? 0} compras</span>
                                <span className="text-muted-foreground tabular-nums">{fmtEur(it?.spend_eur)}</span>
                                {it?.label && <span className="text-[10px] text-muted-foreground italic">{it.label}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <div className="text-xs font-semibold">Adsets a saturar</div>
                        {saturating.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground italic">Nenhum adset em saturação.</div>
                        ) : (
                          <div className="space-y-1">
                            {saturating.map((a: any, i: number) => (
                              <div key={i} className="flex items-center justify-between gap-2 text-[11px] bg-muted/30 rounded px-2 py-1">
                                <span className="truncate flex-1" title={a?.name}>{a?.name ?? "—"}</span>
                                <span className="text-muted-foreground tabular-nums">freq {Number(a?.frequency_b ?? 0).toFixed(2)}</span>
                                <span className="text-muted-foreground tabular-nums">CTR {fmtPct(a?.ctr_b)}</span>
                                <span className="text-muted-foreground tabular-nums">CPM {fmtEur(a?.cpm_b_eur)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {winners.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs font-semibold">Criativos vencedores</div>
                          <div className="space-y-1">
                            {winners.map((w: any, i: number) => (
                              <div key={i} className="flex items-center justify-between gap-2 text-[11px] bg-muted/30 rounded px-2 py-1">
                                <span className="truncate flex-1" title={w?.ad_name}>{w?.ad_name ?? "—"}</span>
                                {w?.library?.type && <Badge variant="outline" className="text-[10px]">{w.library.type}</Badge>}
                                <Badge variant="outline" className="text-[10px] font-mono">{fmtRoas(w?.performance?.roas)}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <div className="text-xs font-semibold">Criativos fatigados</div>
                        {fatigued.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground italic">Sem fadiga detetada.</div>
                        ) : (
                          <div className="space-y-1">
                            {fatigued.map((w: any, i: number) => (
                              <div key={i} className="flex items-center justify-between gap-2 text-[11px] bg-muted/30 rounded px-2 py-1">
                                <span className="truncate flex-1" title={w?.ad_name}>{w?.ad_name ?? "—"}</span>
                                <span className="text-muted-foreground tabular-nums">7d {fmtRoas(w?.fatigue?.roas_7d)}</span>
                                <span className="text-muted-foreground tabular-nums">vs prev {fmtRoas(w?.fatigue?.roas_prev7d)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {gaps && (Array.isArray(gaps.types_missing) || Array.isArray(gaps.types_underrepresented) || gaps.winners_by_type) && (
                        <div className="space-y-1.5">
                          <div className="text-xs font-semibold">Lacunas de formato</div>
                          <div className="flex flex-wrap gap-1.5 text-[11px]">
                            {Array.isArray(gaps.types_missing) && gaps.types_missing.length > 0 && (
                              <>
                                <span className="text-muted-foreground">Em falta:</span>
                                {gaps.types_missing.map((t: string) => (
                                  <Badge key={`m-${t}`} variant="outline" className="text-[10px] border-amber-500/40 text-amber-300">{t}</Badge>
                                ))}
                              </>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-[11px]">
                            {Array.isArray(gaps.types_underrepresented) && gaps.types_underrepresented.length > 0 && (
                              <>
                                <span className="text-muted-foreground">Sub-representados:</span>
                                {gaps.types_underrepresented.map((t: string) => (
                                  <Badge key={`u-${t}`} variant="outline" className="text-[10px]">{t}</Badge>
                                ))}
                              </>
                            )}
                          </div>
                          {gaps.winners_by_type && Object.keys(gaps.winners_by_type).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                              <span className="text-muted-foreground">Vencedores por tipo:</span>
                              {Object.entries(gaps.winners_by_type).map(([k, v]) => (
                                <Badge key={`w-${k}`} variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-300">
                                  {k}: {String(v)}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {via && (
                        <div className="space-y-1.5">
                          <div className="text-xs font-semibold">Viabilidade</div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="text-muted-foreground">ROAS gap:</span>
                            <span className="font-mono tabular-nums">{fmtRoas(via.roas_gap)}</span>
                            {via.gap_severity && (
                              <Badge variant="outline" className={cn("text-[10px]", sevColor(String(via.gap_severity)))}>
                                {via.gap_severity}
                              </Badge>
                            )}
                            <span className="text-muted-foreground">spend/dia necessário:</span>
                            <span className="font-mono tabular-nums">{fmtEur(via.daily_spend_needed_eur)}</span>
                            <span className="text-muted-foreground">piso estatístico:</span>
                            <Badge variant="outline" className={cn("text-[10px]", via.meets_statistical_floor ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300")}>
                              {via.meets_statistical_floor ? "ok" : "não atinge"}
                            </Badge>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </Card>

      {/* Vista de ações propostas — partilhada: cirúrgico (Etapa 3) e escala (Etapa 4) */}
      {surgicalOpen && (
        <Card className={cn("p-5 space-y-4", prescKind === "scale" ? "border-emerald-500/40" : "border-amber-500/40")}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              {prescKind === "scale" ? (
                <><Rocket className="h-4 w-4 text-emerald-400" /> Manter e escalar — ações propostas</>
              ) : (
                <><Scissors className="h-4 w-4 text-amber-400" /> Intervenção cirúrgica — ações propostas</>
              )}
            </h2>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={surgicalLoading}
                onClick={runSurgical}
                className="h-7 px-2 text-[11px]"
              >
                {surgicalLoading
                  ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  : <RefreshCw className="h-3 w-3 mr-1" />}
                Recalcular
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSurgicalOpen(false)}
                className="h-7 px-2 text-[11px] text-muted-foreground"
              >
                Fechar
              </Button>
            </div>
          </div>

          {surgicalLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> A calcular ações…
            </div>
          ) : surgicalError ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              {surgicalError === "no_diagnosis" || /diagn/i.test(surgicalError)
                ? "Faz primeiro um diagnóstico desta campanha."
                : surgicalError}
            </div>
          ) : !surgicalData ? null : (() => {
            const s = surgicalData.summary;
            const cur = s.currency ?? displayCurrency;
            const executable = surgicalData.proposed_actions.filter((a) => a.executable && !a.blocked);
            const selectedCount = executable.filter((a) => selectedActions.has(a.action_index)).length;
            return (
              <>
                {/* Resumo */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="border-border">
                    Modo: <strong className="ml-1">{surgicalData.budget_mode}</strong>
                  </Badge>
                  <Badge variant="outline" className={cn("border-border", prescKind === "scale" && "border-emerald-500/40 text-emerald-300 bg-emerald-500/10")}>
                    Total/dia: {eur(s.total_daily_before_cents, cur)} → <strong className="ml-1">{eur(s.total_daily_after_cents, cur)}</strong>
                  </Badge>
                  {prescKind === "scale" ? (
                    <>
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
                        Aumento: +{eur(s.total_increase_cents ?? 0, cur)}/dia
                      </Badge>
                      <Badge variant="outline" className="border-border">
                        Elegíveis: {s.eligible_count ?? 0}
                      </Badge>
                      {(s.cooldown_count ?? 0) > 0 && (
                        <Badge variant="outline" className="border-border">
                          {s.cooldown_count} em cooldown
                        </Badge>
                      )}
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className="border-border">
                        Pool libertado: {eur(s.pool_freed_cents ?? 0, cur)}
                      </Badge>
                      <Badge variant="outline" className="border-border">
                        Realocado: {eur(s.pool_reallocated_cents ?? 0, cur)}
                      </Badge>
                      <Badge variant="outline" className="border-border">
                        Não alocado: {eur(s.pool_unallocated_cents ?? 0, cur)}
                      </Badge>
                    </>
                  )}
                  <Badge variant="outline" className="border-border">
                    Cap: {s.cap_eur == null ? "sem limite" : `${formatMoney(s.cap_eur, cur)}/dia`}
                  </Badge>
                  {s.learning_adsets_count > 0 && (
                    <Badge variant="outline" className="border-sky-500/40 text-sky-300 bg-sky-500/10">
                      {s.learning_adsets_count} adset(s) em learning
                    </Badge>
                  )}
                </div>

                {surgicalData.budget_mode !== "ABO" && (
                  <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                    {prescKind === "scale"
                      ? (surgicalData.budget_mode === "CBO"
                        ? "Campanha CBO: só se escala o budget da campanha quando é prospecção pura (sem retargeting nem adsets em learning). Caso contrário, só recomendação."
                        : "Modo de verba indeterminado: sem campo de verba acionável — define orçamentos antes de escalar.")
                      : (surgicalData.budget_mode === "CBO"
                        ? "Campanha CBO: a verba é gerida ao nível da campanha. Pausar adsets concentra automaticamente a verba nos restantes; não há realocação por adset."
                        : "Modo de verba indeterminado: só pausas e recomendações (sem ajustes de verba por adset).")}
                  </div>
                )}

                {/* Grupos de ações */}
                {SURGICAL_GROUP_ORDER.map((groupKey) => {
                  const groupActions = surgicalData.proposed_actions.filter((a) => a.group === groupKey);
                  if (groupActions.length === 0) return null;
                  const gm = SURGICAL_GROUP_META[groupKey];
                  const GIcon = gm.icon;
                  return (
                    <div key={groupKey} className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        <GIcon className="h-3.5 w-3.5" /> {gm.label} ({groupActions.length})
                      </div>
                      <div className="space-y-2">
                        {groupActions.map((a) => {
                          const selectable = a.executable && !a.blocked;
                          const checked = selectedActions.has(a.action_index);
                          return (
                            <div
                              key={a.action_index}
                              className={cn(
                                "rounded-lg border p-3 flex items-start gap-3",
                                a.blocked ? "border-border opacity-60" : "border-border",
                              )}
                            >
                              {selectable ? (
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => {
                                    setSelectedActions((prev) => {
                                      const next = new Set(prev);
                                      if (v) next.add(a.action_index); else next.delete(a.action_index);
                                      return next;
                                    });
                                  }}
                                  className="mt-0.5"
                                />
                              ) : (
                                <span className="w-4 shrink-0" />
                              )}
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {a.verdict && (
                                    <Badge variant="outline" className={cn("border text-[9px]", verdictBadge[a.verdict] ?? "border-border")}>
                                      {a.verdict}
                                    </Badge>
                                  )}
                                  {a.audience_type && (
                                    <Badge variant="outline" className="border-border text-[9px] text-muted-foreground">
                                      {a.audience_type}
                                    </Badge>
                                  )}
                                  <span className="text-sm font-medium truncate">
                                    {a.entity_name ?? a.external_id ?? "—"}
                                  </span>
                                  {a.current_value_cents != null && a.proposed_value_cents != null &&
                                    a.current_value_cents !== a.proposed_value_cents && (
                                    <span className="text-xs tabular-nums text-muted-foreground">
                                      {eur(a.current_value_cents, cur)} → <strong className="text-foreground">{eur(a.proposed_value_cents, cur)}</strong>/dia
                                    </span>
                                  )}
                                  {a.blocked && (
                                    <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[9px]">
                                      bloqueada
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">{a.rationale}</p>
                                {a.blocked && a.blocked_reason && (
                                  <p className="text-[11px] text-amber-300/80">Motivo: {a.blocked_reason}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {surgicalData.proposed_actions.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {prescKind === "scale"
                      ? "Sem ações de escala — nenhum adset de prospecção elegível (winning, fora de learning, ROAS >= 3.5x, fora de cooldown) agora."
                      : "Sem ações propostas — a campanha não tem adsets/ads que justifiquem intervenção agora."}
                  </p>
                )}

                {/* Aplicar */}
                <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    {selectedCount} de {executable.length} ação(ões) executável(eis) selecionada(s).
                  </span>
                  <Button
                    size="sm"
                    disabled={applyingSurgical || selectedCount === 0}
                    onClick={applySurgical}
                    className="h-8"
                  >
                    {applyingSurgical
                      ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> A aplicar…</>
                      : <>Aplicar selecionadas ({selectedCount})</>}
                  </Button>
                </div>
              </>
            );
          })()}
        </Card>
      )}

      {/* Configuração — detecção ABO/CBO */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-lg font-semibold">Configuração</h2>
          {budgetSummary.mode !== "unknown" && (
            <Badge
              variant="outline"
              className={cn(
                "border text-[10px]",
                budgetSummary.mode === "CBO"
                  ? "border-cyan-500/40 text-cyan-400 bg-cyan-500/10"
                  : "border-indigo-500/40 text-indigo-400 bg-indigo-500/10",
              )}
              title={
                budgetSummary.mode === "CBO"
                  ? "Campaign Budget Optimization — orçamento ao nível da campanha"
                  : "Adset Budget Optimization — orçamento ao nível dos adsets"
              }
            >
              Orçamento: {budgetSummary.mode}
              {budgetSummary.mode === "ABO" && ` (${budgetSummary.adsetCount} adsets)`}
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <ConfigRow label="Estratégia de licitação" value={campaign.bid_strategy} />
          <ConfigRow
            label={
              budgetSummary.mode === "ABO"
                ? `Orçamento diário (soma ${budgetSummary.adsetCount} adsets)`
                : "Orçamento diário"
            }
            value={eur(budgetSummary.daily_cents, cur)}
          />
          <ConfigRow
            label={
              budgetSummary.mode === "ABO"
                ? `Orçamento total (soma ${budgetSummary.adsetCount} adsets)`
                : "Orçamento total"
            }
            value={eur(budgetSummary.lifetime_cents, cur)}
          />
          <ConfigRow label="Tipo de compra" value={campaign.buying_type} />
          <ConfigRow label="Início" value={dateFmt(campaign.start_time)} />
          <ConfigRow label="Fim" value={campaign.stop_time ? dateFmt(campaign.stop_time) : "—"} />
        </div>
      </Card>

      {/* Targeting agregado */}
      <Card className="p-5 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Target className="h-4 w-4" /> Targeting agregado
          <span className="text-xs font-normal text-muted-foreground">({(adsets ?? []).length} adsets)</span>
        </h2>

        <PillRow icon={MapPin} label="Países" items={targeting.countries} />
        <PillRow
          icon={MapPin}
          label="Cidades"
          items={targeting.cities.map((c) => (c.radius ? `${c.name} (${c.radius}${c.unit ?? "km"})` : c.name))}
        />
        <div className="text-sm">
          <span className="text-muted-foreground">Faixa etária: </span>
          <strong>
            {targeting.ageMin ?? "?"}–{targeting.ageMax ?? "?"}
          </strong>
        </div>
        <PillRow icon={Users} label="Audiências incluídas" items={targeting.included} />
        <PillRow icon={UserMinus} label="Audiências excluídas" items={targeting.excluded} destructive />
      </Card>

      {/* Adsets — detalhados, com ações */}
      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-3">Adsets ({(adsets ?? []).length})</h2>
        {(adsets ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem adsets sincronizados.</p>
        ) : (
          <Accordion type="multiple" className="w-full">
            {(adsets ?? []).map((a) => {
              const t = aggregateTargeting([a]);
              const eff = a.effective_status ?? a.status ?? null;
              const isActive = eff === "ACTIVE";
              const isPaused = eff === "PAUSED";
              const adsetCur = a.currency ?? cur;
              const busy = adsetToggling === a.external_adset_id;
              return (
                <AccordionItem key={a.external_adset_id} value={a.external_adset_id}>
                  <AccordionTrigger>
                    <div className="flex items-center gap-2 text-left flex-1 pr-3">
                      <Badge variant="outline" className={cn("border text-[10px]", statusColor(eff))}>
                        {eff ?? "—"}
                      </Badge>
                      <span className="font-medium flex-1 truncate">{a.name ?? a.external_adset_id}</span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {eur(a.daily_budget_cents, adsetCur)} / dia
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                        <ConfigRow label="Objetivo de otimização" value={a.optimization_goal} />
                        <ConfigRow label="Evento de faturação" value={a.billing_event} />
                        <ConfigRow label="Orçamento diário" value={eur(a.daily_budget_cents, adsetCur)} />
                        <ConfigRow label="Orçamento total" value={eur(a.lifetime_budget_cents, adsetCur)} />
                      </div>
                      <Separator />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <PillRow icon={MapPin} label="Países" items={t.countries} small />
                        <PillRow icon={MapPin} label="Cidades" items={t.cities.map((c) => c.radius ? `${c.name} (${c.radius}${c.unit ?? "km"})` : c.name)} small />
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">Faixa etária: </span>
                        <strong>{t.ageMin ?? "?"}–{t.ageMax ?? "?"}</strong>
                      </div>
                      <PillRow icon={Users} label="Audiências incluídas" items={t.included} small />
                      <PillRow icon={UserMinus} label="Audiências excluídas" items={t.excluded} destructive small />

                      <Separator />
                      <div className="flex items-center gap-2 flex-wrap">
                        {(isActive || isPaused) && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              const target = isActive ? "PAUSED" : "ACTIVE";
                              if (isActive && !confirm(`Pausar adset "${a.name ?? a.external_adset_id}" no Meta?`)) return;
                              runEntityToggle({
                                entity_type: "adset",
                                external_id: a.external_adset_id,
                                connection_id: a.connection_id,
                                ad_account_id: a.ad_account_id,
                                target,
                                label: `Adset "${a.name ?? a.external_adset_id}"`,
                              });
                            }}
                            className={cn(
                              "h-7 px-2 text-[11px]",
                              isActive
                                ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                                : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10",
                            )}
                          >
                            {busy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : isActive ? (
                              <><Pause className="h-3 w-3 mr-1" /> Pausar</>
                            ) : (
                              <><Play className="h-3 w-3 mr-1" /> Ativar</>
                            )}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => setEditAdsetBudget(a)}
                        >
                          <Pencil className="h-3 w-3 mr-1" /> Editar verba
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </Card>

      {/* Ads — criativo, link, pausar/ativar */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold">Anúncios ({(ads ?? []).length})</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!eventIdForValidation || validatingMessages || creativeIdList.length === 0}
                    onClick={runValidateMessages}
                    className="h-8 text-xs"
                  >
                    {validatingMessages ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <MessageSquareWarning className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Validar mensagens
                  </Button>
                </span>
              </TooltipTrigger>
              {!eventIdForValidation && (
                <TooltipContent>associe um evento para validar mensagens</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
        {(ads ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem anúncios sincronizados.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(ads ?? []).map((ad) => {
              const cr = ad.meta_creative_id ? creativeByMetaId.get(ad.meta_creative_id) : undefined;
              const kind = cr ? classifyCreative(cr.file_url, cr.type, cr.file_mime_type) : null;
              const verdict = cr?.analysis_jsonb?.verdict as string | undefined;
              const vMeta = verdict ? verdictLabel[verdict] : undefined;
              const eff = ad.effective_status ?? ad.status ?? null;
              const isActive = eff === "ACTIVE";
              const isPaused = eff === "PAUSED";
              const busy = adToggling === ad.external_ad_id;
              const adsManagerUrl = metaAdsManagerUrl(ad.ad_account_id);
              return (
                <Card key={ad.external_ad_id} className="overflow-hidden">
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    {cr && (kind === "image" || kind === "thumbnail") ? (
                      <img src={cr.file_url} alt={cr.name} className="w-full h-full object-cover" />
                    ) : cr && kind === "video" ? (
                      <video src={cr.file_url} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <ImageIcon className="h-6 w-6" />
                        <span className="text-[10px]">{cr ? "sem preview" : "criativo não sincronizado"}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium line-clamp-2">{ad.name ?? "(sem nome)"}</div>
                      <Badge variant="outline" className={cn("border text-[9px] shrink-0", statusColor(eff))}>
                        {eff ?? "—"}
                      </Badge>
                    </div>

                    {cr?.headline && (
                      <p className="text-xs text-muted-foreground line-clamp-2" title={cr.headline}>
                        {cr.headline}
                      </p>
                    )}
                    {cr?.cta_type && (
                      <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                        {cr.cta_type}
                      </Badge>
                    )}

                    {/* Link de destino — somente leitura nesta sprint.
                        TODO[link-edit]: editar link do ad requer criar novo
                        adcreative na Meta (clone do existente com link
                        substituído) + PATCH ao ad com creative.creative_id.
                        Os criativos são imutáveis depois de associados a ads,
                        por isso fica fora deste passo. */}
                    {cr?.link_url ? (
                      <a
                        href={cr.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 break-all"
                        title={cr.link_url}
                      >
                        <Link2 className="h-3 w-3 shrink-0" />
                        <span className="line-clamp-1">{cr.link_url}</span>
                      </a>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/60 inline-flex items-center gap-1">
                        <Link2 className="h-3 w-3" /> sem link sincronizado
                      </span>
                    )}

                    {vMeta && (
                      <Badge variant="outline" className={cn("border text-[10px] gap-1", vMeta.color)}>
                        <Sparkles className="h-3 w-3" /> {vMeta.label}
                        {typeof cr?.analysis_jsonb?.scores?.overall === "number" && (
                          <span>· {cr.analysis_jsonb.scores.overall}/100</span>
                        )}
                      </Badge>
                    )}

                    {/* Camada 2 — semáforo de validação de mensagem */}
                    {cr && eventIdForValidation && (() => {
                      const val = validationByCreativeId.get(cr.id);
                      if (!val) {
                        return (
                          <Badge variant="outline" className="border text-[10px] gap-1 border-muted-foreground/30 text-muted-foreground">
                            <ShieldQuestion className="h-3 w-3" /> Mensagem por validar
                          </Badge>
                        );
                      }
                      const sem = val.semaforo;
                      const meta =
                        sem === "coerente"
                          ? { icon: CheckCircle2, label: "Mensagem coerente", color: "border-emerald-500/40 text-emerald-400" }
                          : sem === "atencao"
                          ? { icon: AlertCircle, label: "Mensagem com atenção", color: "border-amber-500/40 text-amber-400" }
                          : { icon: XCircle, label: "Mensagem contradiz", color: "border-rose-500/40 text-rose-400" };
                      const Icon = meta.icon;
                      const opportunity = sem === "coerente" && !val.aproveita_gatilhos;
                      return (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="inline-flex items-center gap-1 flex-wrap">
                                <Badge variant="outline" className={cn("border text-[10px] gap-1 cursor-help", meta.color)}>
                                  <Icon className="h-3 w-3" /> {meta.label}
                                </Badge>
                                {opportunity && (
                                  <Badge variant="outline" className="border text-[10px] gap-1 border-orange-400/40 text-orange-300 cursor-help">
                                    <span className="h-1.5 w-1.5 rounded-full bg-orange-400" /> Oportunidade
                                  </Badge>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs space-y-1 text-xs">
                              {val.explicacao && <p>{val.explicacao}</p>}
                              {val.sugestao_copy && (
                                <div className="border-t border-border/40 pt-1">
                                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Sugestão (editável, não aplicada)</p>
                                  <p className="italic">{val.sugestao_copy}</p>
                                </div>
                              )}
                              <p className="text-[10px] text-muted-foreground pt-1">
                                Validado {formatDistanceToNow(new Date(val.validated_at), { locale: pt, addSuffix: true })}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })()}

                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {(isActive || isPaused) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            const target = isActive ? "PAUSED" : "ACTIVE";
                            if (isActive && !confirm(`Pausar anúncio "${ad.name ?? ad.external_ad_id}" no Meta?`)) return;
                            runEntityToggle({
                              entity_type: "ad",
                              external_id: ad.external_ad_id,
                              connection_id: ad.connection_id,
                              ad_account_id: ad.ad_account_id,
                              target,
                              label: `Anúncio "${ad.name ?? ad.external_ad_id}"`,
                            });
                          }}
                          className={cn(
                            "h-6 px-2 text-[10px]",
                            isActive
                              ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                              : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10",
                          )}
                        >
                          {busy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isActive ? (
                            <><Pause className="h-3 w-3 mr-0.5" /> Pausar</>
                          ) : (
                            <><Play className="h-3 w-3 mr-0.5" /> Ativar</>
                          )}
                        </Button>
                      )}
                      {cr && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-cyan-400 hover:text-cyan-300"
                          onClick={() => navigate(`/audience/creatives/${cr.id}`)}
                        >
                          <Eye className="h-3 w-3 mr-0.5" /> Análise
                        </Button>
                      )}
                      {adsManagerUrl && (
                        <a
                          href={adsManagerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                          title="Abrir no Meta Ads Manager"
                        >
                          <ExternalLink className="h-3 w-3 mr-0.5" /> Ads Manager
                        </a>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Card>


      {/* Gatilhos Estratégicos do Evento */}
      <StrategicTriggersCard
        eventId={campaign.linked_event_id ?? null}
        companyId={campaign.company_id ?? null}
      />

      {/* Montagem Assistida (Camada 4) — passo dedicado, abre em tela cheia */}
      {campaign.linked_event_id && (
        <MontagemAssistidaCard
          eventId={campaign.linked_event_id}
          companyId={campaign.company_id ?? null}
          creativeIdListLen={creativeIdList.length}
          onMontar={(flow) => { setReviewAssemblyId(null); setAssemblyFlow(flow); setAssemblyOpen(true); }}
          onReview={(assemblyId) => { setReviewAssemblyId(assemblyId); setAssemblyFlow("from_scratch"); setAssemblyOpen(true); }}
        />
      )}

      <AssistedAssemblyPanel
        open={assemblyOpen}
        onOpenChange={(o) => { setAssemblyOpen(o); if (!o) setReviewAssemblyId(null); }}
        eventId={campaign.linked_event_id ?? null}
        companyId={campaign.company_id ?? null}
        flow={assemblyFlow}
        sourceCampaignId={null}
        creativeIds={creativeIdList}
        initialAssemblyId={reviewAssemblyId}
      />

      {/* Estúdio de Desenho de Campanha (Camada 5 PARTE 2) */}
      {campaign.linked_event_id && (
        <DesignStudioEntry
          eventId={campaign.linked_event_id}
          companyId={campaign.company_id ?? null}
          onOpen={() => setDesignStudioOpen(true)}
          designStudioOpen={designStudioOpen}
          onOpenChange={setDesignStudioOpen}
          onOpenMetaPublish={() => setMetaPublishOpen(true)}
          metaPublishOpen={metaPublishOpen}
          onMetaPublishOpenChange={setMetaPublishOpen}
        />
      )}

      {/* Histórico */}
      <Card className="p-5">

        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <History className="h-4 w-4" /> Histórico
        </h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem alterações registadas para esta campanha.</p>
        ) : (
          <ol className="relative border-l border-border/60 ml-2 space-y-4">
            {timeline.map((it) => (
              <li key={it.key} className="ml-4">
                <span
                  className={cn(
                    "absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                    it.type === "change"
                      ? "bg-cyan-500/20 border-cyan-500/50"
                      : it.success
                        ? "bg-emerald-500/20 border-emerald-500/50"
                        : "bg-red-500/20 border-red-500/50",
                  )}
                />
                <div className="flex items-start gap-2">
                  {it.type === "change" ? (
                    <Settings2 className="h-3.5 w-3.5 text-cyan-400 mt-0.5 shrink-0" />
                  ) : it.title.includes("pausada") ? (
                    <Pause className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                  ) : (
                    <Play className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      {it.title}
                      {it.trigger && (
                        <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
                          {triggerMeta[it.trigger] ?? it.trigger}
                        </Badge>
                      )}
                      {!it.success && (
                        <Badge variant="outline" className="text-[9px] border-red-500/40 text-red-400">falhou</Badge>
                      )}
                    </div>
                    {it.subtitle && <div className="text-xs text-muted-foreground mt-0.5">{it.subtitle}</div>}
                    <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                      {relTime(it.ts)} · {actorLabel(it.actorId, profileMap)}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <ReactivateCampaignDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        campaignName={campaign.name}
        onConfirm={(reason) => runToggle("ACTIVE", reason)}
      />

      {editAdsetBudget && (
        <EditAdsetBudgetDialog
          open={!!editAdsetBudget}
          onOpenChange={(v) => { if (!v) setEditAdsetBudget(null); }}
          adset={editAdsetBudget}
          connectionId={editAdsetBudget.connection_id}
          adAccountId={editAdsetBudget.ad_account_id ?? null}
          onSaved={() => qc.invalidateQueries({ queryKey: ["crm-campaign-view-adsets", id] })}
        />
      )}
    </div>
  );
}

// ── Subcomponentes ───────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
    </Card>
  );
}

function ConfigRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/50 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value || "—"}</span>
    </div>
  );
}

function PillRow({
  icon: Icon,
  label,
  items,
  destructive,
  small,
}: {
  icon: any;
  label: string;
  items: string[];
  destructive?: boolean;
  small?: boolean;
}) {
  return (
    <div className={small ? "text-xs" : "text-sm"}>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      {items.length === 0 ? (
        <span className="text-muted-foreground/60">—</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <Badge
              key={`${it}-${i}`}
              variant="secondary"
              className={destructive ? "bg-red-500/10 text-red-400 border-red-500/30 border" : ""}
            >
              {it}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Card da Montagem Assistida — resolve a assembly mais recente do evento
//    e expõe o botão "Rever Síntese / Aprovar criativos" quando existe.
function MontagemAssistidaCard({
  eventId,
  companyId,
  creativeIdListLen,
  onMontar,
  onReview,
}: {
  eventId: string;
  companyId: string | null;
  creativeIdListLen: number;
  onMontar: (flow: "redesign" | "from_scratch") => void;
  onReview: (assemblyId: string) => void;
}) {
  const { data: latestAssembly, isLoading } = useQuery({
    queryKey: ["crm-latest-assembly-card", eventId, companyId],
    enabled: !!eventId && !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("assisted_assembly")
        .select("id, generated_at")
        .eq("event_id", eventId)
        .eq("company_id", companyId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; generated_at: string } | null;
    },
  });

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" /> Montagem Assistida
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Agrupa criativos por gatilho e propõe proporções de investimento. Os pesos vêm do motor (determinístico); a explicação por adset é gerada pelo modelo e só cita esses números.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {latestAssembly?.id ? (
            <Button
              size="sm"
              variant="default"
              onClick={() => onReview(latestAssembly.id)}
              title={`Carrega a Síntese mais recente (${new Date(latestAssembly.generated_at).toLocaleString("pt-PT")})`}
            >
              <Sparkles className="h-4 w-4 mr-1" /> Rever Síntese / Aprovar criativos
            </Button>
          ) : (
            !isLoading && (
              <Button size="sm" variant="default" disabled title="Sem Síntese montada para este evento">
                <Sparkles className="h-4 w-4 mr-1" /> Rever Síntese / Aprovar criativos
              </Button>
            )
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onMontar("redesign")}
            disabled={creativeIdListLen === 0}
          >
            <Wand2 className="h-4 w-4 mr-1" /> Montar como redesenho
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onMontar("from_scratch")}
            disabled={creativeIdListLen === 0}
          >
            <Sparkles className="h-4 w-4 mr-1" /> Montar do zero
          </Button>
        </div>
      </div>
    </Card>
  );
}


// ── Estúdio de Desenho de Campanha — wrapper que resolve o assemblyId mais recente
function DesignStudioEntry({
  eventId,
  companyId,
  onOpen,
  designStudioOpen,
  onOpenChange,
  onOpenMetaPublish,
  metaPublishOpen,
  onMetaPublishOpenChange,
}: {
  eventId: string;
  companyId: string | null;
  onOpen: () => void;
  designStudioOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenMetaPublish: () => void;
  metaPublishOpen: boolean;
  onMetaPublishOpenChange: (open: boolean) => void;
}) {
  const { data: latestAssemblyId, isLoading } = useQuery({
    queryKey: ["crm-latest-assembly", eventId, companyId],
    enabled: !!eventId && !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm").from("assisted_assembly")
        .select("id")
        .eq("event_id", eventId)
        .eq("company_id", companyId)
        .order("generated_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return ((data ?? [])[0]?.id as string | undefined) ?? null;
    },
  });

  const { data: latestDesignId } = useQuery({
    queryKey: ["crm-latest-design", eventId, companyId],
    enabled: !!eventId && !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm").from("campaign_design")
        .select("id")
        .eq("event_id", eventId)
        .eq("company_id", companyId)
        .order("generated_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return ((data ?? [])[0]?.id as string | undefined) ?? null;
    },
  });

  const disabled = isLoading || !latestAssemblyId;
  const tip = !latestAssemblyId ? "Cria primeiro uma montagem assistida" : undefined;
  const publishDisabled = !latestDesignId;
  const publishTip = !latestDesignId ? "Gera primeiro um desenho de campanha" : undefined;

  return (
    <>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Estúdio de Desenho de Campanha
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Veste a montagem com textos por adset (auto-classificados). Editas à mão e o semáforo é re-validado pelo servidor — nunca pelo cliente.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {tip ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button size="sm" variant="outline" disabled><Wand2 className="h-4 w-4 mr-1" /> Desenhar campanha</Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">{tip}</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button size="sm" variant="outline" onClick={onOpen} disabled={disabled}>
                <Wand2 className="h-4 w-4 mr-1" /> Desenhar campanha
              </Button>
            )}
            {publishTip ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button size="sm" disabled>Preparar publicação</Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">{publishTip}</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button size="sm" onClick={onOpenMetaPublish} disabled={publishDisabled}>
                Preparar publicação
              </Button>
            )}
          </div>
        </div>
      </Card>
      <CampaignDesignStudio
        open={designStudioOpen}
        onOpenChange={onOpenChange}
        companyId={companyId}
        assemblyId={latestAssemblyId ?? null}
      />
      <MetaPublishPanel
        open={metaPublishOpen}
        onOpenChange={onMetaPublishOpenChange}
        companyId={companyId}
        designId={latestDesignId ?? null}
      />
    </>
  );
}


