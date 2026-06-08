import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { classifyCreative, metaAdsManagerUrl } from "@/lib/creative-media";
import { EditCampaignPopover, type CampaignRow } from "@/pages/crm/Campaigns";
import { ReactivateCampaignDialog } from "@/components/crm/ReactivateCampaignDialog";
import { PeriodSelector } from "@/components/crm/PeriodSelector";
import { EditAdsetBudgetDialog } from "@/components/crm/EditAdsetBudgetDialog";
import { periodFromMode, type PeriodState } from "@/lib/crm/period";

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
interface DiagnosisRow {
  target_roas: number | null;
  source_campaign_class: string | null;
  projected_baseline_roas: number | null;
  diagnosis_jsonb: any;
  created_at: string;
}
// ── Prescrição cirúrgica (output de crm-meta-campaign-surgical) ──────────────
interface SurgicalAction {
  action_index: number;
  group: "pause" | "reduce_budget" | "reallocate_increase" | "pause_ad" | "recommendation";
  executable: boolean;
  entity_type: "adset" | "ad" | "campaign";
  external_id: string | null;
  connection_id: string | null;
  ad_account_id: string | null;
  entity_name: string | null;
  verdict: string | null;
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
    pool_freed_cents: number;
    pool_reallocated_cents: number;
    pool_unallocated_cents: number;
    cap_eur: number | null;
    learning_adsets_count: number;
    currency: string;
    counts: Record<string, number>;
  };
  proposed_actions: SurgicalAction[];
}

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
const eur = (cents: number | null | undefined, currency = "EUR") =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(cents / 100);
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
// kind: "redesign" (fluxo activo p/ wizard) · "surgical" (motor cirúrgico, Etapa 3)
//       · "coming_soon" (Etapas 4-5, desativado) · "info" (só mensagem + métricas).
type PostureKind = "redesign" | "surgical" | "coming_soon" | "info";
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
    tagline: "Campanha saudável a subir — escalar gradualmente e monitorizar.",
    icon: Rocket, kind: "coming_soon", accent: "emerald",
  },
  intervencao_cirurgica: {
    label: "Intervenção cirúrgica",
    tagline: "Podar e realocar nos adsets/ads existentes, sem redesenhar (preserva o aprendizado).",
    icon: Stethoscope, kind: "surgical", accent: "amber",
  },
  novo_desenho: {
    label: "Novo desenho",
    tagline: "Campanha esgotada — recomeçar com um desenho novo.",
    icon: Sparkles, kind: "coming_soon", accent: "red",
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
  pause_ad: { label: "Pausar anúncios", icon: Pause, order: 3 },
  recommendation: { label: "Recomendações (informativas)", icon: Info, order: 4 },
};
const SURGICAL_GROUP_ORDER = ["pause", "reduce_budget", "reallocate_increase", "pause_ad", "recommendation"];
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [toggling, setToggling] = useState(false);
  const [adsetToggling, setAdsetToggling] = useState<string | null>(null);
  const [adToggling, setAdToggling] = useState<string | null>(null);
  const [editAdsetBudget, setEditAdsetBudget] = useState<AdsetSnap | null>(null);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodState>(periodFromMode("30d"));
  // Tela de decisão: diagnóstico on-demand + escolha de acção (postura).
  const [diagnosing, setDiagnosing] = useState(false);
  const [selectedAlt, setSelectedAlt] = useState<string | null>(null);
  // Intervenção cirúrgica (Etapa 3): prescrição on-demand + aprovação por ação.
  const [surgicalOpen, setSurgicalOpen] = useState(false);
  const [surgicalLoading, setSurgicalLoading] = useState(false);
  const [surgicalError, setSurgicalError] = useState<string | null>(null);
  const [surgicalData, setSurgicalData] = useState<SurgicalPrescription | null>(null);
  const [selectedActions, setSelectedActions] = useState<Set<number>>(new Set());
  const [applyingSurgical, setApplyingSurgical] = useState(false);

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
    const currency = rows.find((r) => r.currency)?.currency ?? "EUR";
    return { spend, revenue, conversions, roas, currency };
  }, [insights]);

  const targeting = useMemo(() => aggregateTargeting(adsets ?? []), [adsets]);

  const creativeByMetaId = useMemo(() => {
    const m = new Map<string, CreativeRow>();
    (creatives ?? []).forEach((c) => {
      if (c.meta_creative_id) m.set(c.meta_creative_id, c);
    });
    return m;
  }, [creatives]);

  // ── ABO vs CBO detection ─────────────────────────────────────────────────
  // CBO: orçamento ao nível da campanha. ABO: orçamento ao nível dos adsets.
  // Regra prática: se a campanha tem daily/lifetime_budget_cents → CBO; senão
  // se a soma dos adsets > 0 → ABO; caso contrário, unknown.
  const budgetSummary = useMemo(() => {
    const list = adsets ?? [];
    const sumDaily = list.reduce((s, a) => s + (a.daily_budget_cents ?? 0), 0);
    const sumLifetime = list.reduce((s, a) => s + (a.lifetime_budget_cents ?? 0), 0);
    const campaignHasBudget =
      (campaign?.daily_budget_cents ?? 0) > 0 ||
      (campaign?.lifetime_budget_cents ?? 0) > 0;
    const adsetsHaveBudget = sumDaily > 0 || sumLifetime > 0;
    const mode: "CBO" | "ABO" | "unknown" = campaignHasBudget
      ? "CBO"
      : adsetsHaveBudget
        ? "ABO"
        : "unknown";
    return {
      mode,
      daily_cents:
        mode === "CBO" ? campaign?.daily_budget_cents ?? null : sumDaily || null,
      lifetime_cents:
        mode === "CBO" ? campaign?.lifetime_budget_cents ?? null : sumLifetime || null,
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
    const setter = opts.entity_type === "adset" ? setAdsetToggling : setAdToggling;
    setter(opts.external_id);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-entity-action", {
        body: {
          connection_id: opts.connection_id,
          entity_type: opts.entity_type,
          external_id: opts.external_id,
          action: opts.target === "ACTIVE" ? "activate" : "pause",
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
      toast.success(
        opts.target === "ACTIVE"
          ? `${opts.label} ativado`
          : `${opts.label} pausado`,
      );
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
    setToggling(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-entity-action", {
        body: {
          connection_id: (campaign as any).connection_id,
          entity_type: "campaign",
          external_id: campaign.external_campaign_id,
          action: target === "ACTIVE" ? "activate" : "pause",
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
      toast.success(
        target === "ACTIVE"
          ? `Campanha "${campaign.name}" activada`
          : `Campanha "${campaign.name}" pausada`,
      );
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

  function goRedesign() {
    if (!campaign) return;
    navigate(`/audience/strategies/redesign/${campaign.external_campaign_id}`);
  }

  // ── Intervenção cirúrgica: gerar prescrição (crm-meta-campaign-surgical) ────
  async function runSurgical() {
    if (!campaign) return;
    setSurgicalOpen(true);
    setSurgicalLoading(true);
    setSurgicalError(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-campaign-surgical", {
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

  // ── Aplicar selecionadas: 1 chamada entity-action por ação (sequencial) ─────
  async function applySurgical() {
    if (!surgicalData) return;
    const toApply = surgicalData.proposed_actions.filter(
      (a) => a.executable && !a.blocked && a.entity_action && selectedActions.has(a.action_index),
    );
    if (toApply.length === 0) {
      toast.error("Nenhuma ação selecionada");
      return;
    }
    setApplyingSurgical(true);
    let okCount = 0;
    let failCount = 0;
    for (const a of toApply) {
      try {
        const { data, error } = await supabase.functions.invoke("crm-meta-entity-action", {
          body: {
            connection_id: a.connection_id,
            entity_type: a.entity_type,
            external_id: a.external_id,
            action: a.entity_action!.action,
            updates: a.entity_action!.updates,
            ad_account_id: a.ad_account_id,
            // Audit (Etapa 3): liga ao diagnóstico 360 e à ação proposta.
            diagnosis_id: surgicalData.diagnosis_id,
            applied_action_index: a.action_index,
            triggered_by: "ai_suggestion",
            reason_text: a.rationale,
            measure_impact_requested: true,
          },
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
        if ((data as any)?.ok === false) throw new Error((data as any)?.detail ?? "Falha");
        okCount++;
      } catch (e: any) {
        failCount++;
        toast.error(`Falha: ${a.entity_name ?? a.external_id}`, { description: e?.message ?? String(e) });
      }
    }
    if (okCount > 0) toast.success(`${okCount} ação(ões) aplicada(s) no Meta`);
    if (failCount > 0) toast.error(`${failCount} ação(ões) falharam`);
    setApplyingSurgical(false);
    // Refrescar snapshots/diagnóstico e re-correr a engine (estado fresco).
    await qc.invalidateQueries({ queryKey: ["crm-campaign-view-adsets", id] });
    await qc.invalidateQueries({ queryKey: ["crm-campaign-view-ads", id] });
    await qc.invalidateQueries({ queryKey: ["crm-campaign-view-diagnosis", id] });
    await runSurgical();
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
                    {m.kind === "redesign" ? (
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
      </Card>

      {/* Intervenção cirúrgica — vista de ações propostas (Etapa 3) */}
      {surgicalOpen && (
        <Card className="p-5 space-y-4 border-amber-500/40">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Scissors className="h-4 w-4 text-amber-400" /> Intervenção cirúrgica — ações propostas
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
            const cur = s.currency ?? "EUR";
            const executable = surgicalData.proposed_actions.filter((a) => a.executable && !a.blocked);
            const selectedCount = executable.filter((a) => selectedActions.has(a.action_index)).length;
            return (
              <>
                {/* Resumo */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="border-border">
                    Modo: <strong className="ml-1">{surgicalData.budget_mode}</strong>
                  </Badge>
                  <Badge variant="outline" className="border-border">
                    Total/dia: {eur(s.total_daily_before_cents, cur)} → <strong className="ml-1">{eur(s.total_daily_after_cents, cur)}</strong>
                  </Badge>
                  <Badge variant="outline" className="border-border">
                    Pool libertado: {eur(s.pool_freed_cents, cur)}
                  </Badge>
                  <Badge variant="outline" className="border-border">
                    Realocado: {eur(s.pool_reallocated_cents, cur)}
                  </Badge>
                  <Badge variant="outline" className="border-border">
                    Não alocado: {eur(s.pool_unallocated_cents, cur)}
                  </Badge>
                  <Badge variant="outline" className="border-border">
                    Cap: {s.cap_eur == null ? "sem limite" : `€${s.cap_eur}/dia`}
                  </Badge>
                  {s.learning_adsets_count > 0 && (
                    <Badge variant="outline" className="border-sky-500/40 text-sky-300 bg-sky-500/10">
                      {s.learning_adsets_count} adset(s) em learning
                    </Badge>
                  )}
                </div>

                {surgicalData.budget_mode !== "ABO" && (
                  <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                    {surgicalData.budget_mode === "CBO"
                      ? "Campanha CBO: a verba é gerida ao nível da campanha. Pausar adsets concentra automaticamente a verba nos restantes; não há realocação por adset."
                      : "Modo de verba indeterminado: só pausas e recomendações (sem ajustes de verba por adset)."}
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
                    Sem ações propostas — a campanha não tem adsets/ads que justifiquem intervenção agora.
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
        <h2 className="text-lg font-semibold mb-3">Anúncios ({(ads ?? []).length})</h2>
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
