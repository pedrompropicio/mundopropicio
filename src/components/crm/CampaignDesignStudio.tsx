// deploy bump: força redeploy edge crm-meta-upload-creative v6 (2026-06-24)
// CampaignDesignStudio
// Camada 5 (PARTE 2) — UI do Estúdio de Desenho de Campanha.
// Abre em Sheet a tela cheia. Lê / cria desenho via crm-campaign-design-generate,
// permite escolher e editar variações de texto por adset, re-valida texto editado
// chamando crm-validate-design-text. Auto-guarda rascunho em crm.campaign_design.
//
// PRINCÍPIO INVIOLÁVEL (P0):
//   - O semáforo de texto editado NUNCA é decidido no cliente — vem sempre da
//     edge function crm-validate-design-text.
//   - Os pesos (peso_pct) vêm da Camada 4 e NÃO são tocados aqui.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Loader2, RefreshCw, Replace, Sparkles, Wand2, AlertTriangle, Info, Maximize2, Plus, Search, Upload, X, Lightbulb, Trash2, Users, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { labelCta } from "@/lib/meta-labels";
import { toast } from "sonner";
import { evaluatePiece, evaluateAdset, recommendForArchetype } from "@/lib/crm/creativeQuality";

export interface CampaignDesignStudioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  assemblyId: string | null;
}

const TRIGGER_TYPE_ACCENT: Record<string, { chip: string; label: string }> = {
  escassez: { chip: "bg-amber-500/10 text-amber-300 border-amber-500/40", label: "Escassez" },
  antecipacao: { chip: "bg-sky-500/10 text-sky-300 border-sky-500/40", label: "Antecipação" },
  narrativa: { chip: "bg-purple-500/10 text-purple-300 border-purple-500/40", label: "Narrativa" },
  calendario: { chip: "bg-slate-500/10 text-slate-300 border-slate-500/40", label: "Calendário" },
  contagem_regressiva: { chip: "bg-slate-500/10 text-slate-300 border-slate-500/40", label: "Contagem" },
  generico: { chip: "bg-zinc-500/10 text-zinc-300 border-zinc-500/40", label: "Genérico" },
};
const triggerAccent = (tipo: string) => TRIGGER_TYPE_ACCENT[tipo] ?? TRIGGER_TYPE_ACCENT.generico;

const CTA_OPTIONS = [
  "SHOP_NOW", "LEARN_MORE", "GET_OFFER", "BOOK_TRAVEL",
  "SIGN_UP", "SUBSCRIBE", "CONTACT_US", "GET_TICKETS",
];

type Variacao = {
  headline: string;
  corpo: string;
  cta: string;
  semaforo: "coerente" | "atencao" | "contradiz" | "por_revalidar";
  aproveita_gatilhos: boolean;
  explicacao_validacao: string;
  escolhida: boolean;
};

type Peca = {
  creative_id: string;
  incluida: boolean;
  motivo_escolha: string;
};

type AdsetAudience = {
  audience_id_meta: string;
  name: string;
  subtype: string | null;
  tamanho: number | null;
};

type Adset = {
  trigger_id: string | null;
  trigger_nome: string;
  trigger_tipo: string;
  peso_pct: number;
  pecas: Peca[];
  variacoes_texto: Variacao[];
  audiencias?: AdsetAudience[];
};

type AvailableAudience = {
  id: string;
  audience_id_meta: string;
  name: string;
  total_records_meta: number | null;
  enabled: boolean;
  filters: any;
};

function audienceSubtype(a: AvailableAudience): string | null {
  return (a?.filters?.subtype as string | undefined) ?? null;
}
function audienceDeliveryCode(a: AvailableAudience): string | null {
  const c = a?.filters?.delivery_status?.code;
  return c == null ? null : String(c);
}
function formatAudienceSize(n: number | null | undefined): string {
  if (n == null || n < 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
const SUBTYPE_LABEL: Record<string, string> = {
  WEBSITE: "Pixel",
  LOOKALIKE: "Lookalike",
  IG_BUSINESS: "Instagram",
  ENGAGEMENT: "Facebook",
  CUSTOM: "Lista",
};

type CreativeMini = {
  id: string;
  name: string | null;
  type: string | null;
  file_url: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  file_mime_type: string | null;
  headline: string | null;
  body: string | null;
  cta_type: string | null;
  text_snippets: string[];
  updated_at: string | null;
};

// Cache-busting: força browser a buscar nova versão quando a peça é re-hospedada.
function withCacheBust(url: string | null | undefined, version: string | null | undefined): string | null {
  if (!url) return null;
  const v = version ? new Date(version).getTime() : Date.now();
  return url.includes("?") ? `${url}&v=${v}` : `${url}?v=${v}`;
}

// ─── Deteção determinística de texto temporal queimado na peça ───
const TEMPORAL_KEYWORDS = [
  "ultimas horas", "ultima hora", "ultimas vagas", "hoje", "amanha",
  "termina", "acaba", "acaba hoje", "ultimos dias", "ultimo dia",
  "so ate", "ate dia", "resta", "restam", "ultima chance",
  "agora", "ja", "nao percas tempo", "contagem", "encerra",
];
const MONTH_NAMES = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MONTH_ABBR_RE = /\b\d{1,2}\s*(de\s*)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/i;
const DATE_NUM_RE = /\b\d{1,2}\/\d{1,2}\b/;

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function detectTemporalSnippets(snippets: string[]): string[] {
  const hits: string[] = [];
  for (const raw of snippets ?? []) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const n = normalize(raw);
    const matched =
      TEMPORAL_KEYWORDS.some((k) => n.includes(k)) ||
      MONTH_NAMES.some((m) => n.includes(m)) ||
      MONTH_ABBR_RE.test(n) ||
      DATE_NUM_RE.test(n);
    if (matched) hits.push(raw.trim());
  }
  return hits;
}

function extractSnippets(analysis: any): string[] {
  const arr = analysis?.detected?.text_content_snippets;
  return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
}

// ─── Deteção robusta do tipo efectivo de media ───
// A BD pode ter type/file_mime_type inconsistentes com o ficheiro real.
// A extensão do file_url tem prioridade sobre mime/type.
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".m4v", ".avi"];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"];

function urlPathname(fileUrl: string): string {
  const noFragment = fileUrl.split("#")[0];
  const noQuery = noFragment.split("?")[0];
  return noQuery.toLowerCase();
}

function getEffectiveMediaType(
  fileUrl: string | null | undefined,
  mimeType: string | null | undefined,
  type: string | null | undefined,
): { kind: "image" | "video" | "unknown"; label: string } {
  const path = (fileUrl ?? "").split("?")[0].split("#")[0].toLowerCase();
  if (VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return { kind: "video", label: "vídeo" };
  }
  if (IMAGE_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return { kind: "image", label: "imagem" };
  }
  const m = (mimeType ?? "").toLowerCase();
  if (m.startsWith("video/")) return { kind: "video", label: "vídeo" };
  if (m.startsWith("image/")) return { kind: "image", label: "imagem" };
  const t = (type ?? "").toLowerCase();
  if (t.includes("video")) return { kind: "video", label: "vídeo" };
  if (t.includes("image")) return { kind: "image", label: "imagem" };
  return { kind: "unknown", label: type ?? mimeType ?? "—" };
}


function SemaforoBadge({ s }: { s: Variacao["semaforo"] }) {
  if (s === "coerente") return <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/40">🟢 Coerente</Badge>;
  if (s === "atencao") return <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/40">🟡 Atenção</Badge>;
  if (s === "contradiz") return <Badge className="bg-red-500/10 text-red-300 border-red-500/40">🔴 Contradiz</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">⚪ Por revalidar</Badge>;
}

export function CampaignDesignStudio({ open, onOpenChange, companyId, assemblyId }: CampaignDesignStudioProps) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [designId, setDesignId] = useState<string | null>(null);
  const [adsets, setAdsets] = useState<Adset[]>([]);
  const [estado, setEstado] = useState<"rascunho" | "finalizado">("rascunho");
  const [creativesById, setCreativesById] = useState<Map<string, CreativeMini>>(new Map());
  // Pool curado de criativos do evento (RPC crm.assembly_creative_pool)
  type PoolCreative = { id: string; name: string | null; file_url: string | null; type: string | null; file_mime_type: string | null };
  const [poolCreatives, setPoolCreatives] = useState<PoolCreative[]>([]);
  // ticketing_url do evento — usado como link_url do criativo carregado (para entrar no pool por link).
  const [eventTicketingUrl, setEventTicketingUrl] = useState<string | null>(null);

  // Audiências Meta disponíveis (custom audiences sincronizadas)
  const [availableAudiences, setAvailableAudiences] = useState<AvailableAudience[]>([]);
  const [audiencesTruncated, setAudiencesTruncated] = useState(false);
  const [audienceDialog, setAudienceDialog] = useState<{ open: boolean; adsetIdx: number | null }>({ open: false, adsetIdx: null });



  // Upload "Carregar novo criativo" (dentro do estúdio)
  type UploadState =
    | { state: "idle" }
    | { state: "uploading"; pct: number; phase: string }
    | { state: "metapush" }
    | { state: "ok"; creativeId: string; kind: "image" | "video"; metaId: string | null }
    | { state: "err"; msg: string; creativeId?: string };
  const [uploadDialog, setUploadDialog] = useState<{ open: boolean; adsetIdx: number | null }>({ open: false, adsetIdx: null });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [uploadMeta, setUploadMeta] = useState<{ width: number; height: number; duration: number | null; type: "image" | "video" } | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadLinkOverride, setUploadLinkOverride] = useState("");
  const [uploadStatus, setUploadStatus] = useState<UploadState>({ state: "idle" });
  const uploadFileInputRef = useRef<HTMLInputElement>(null);

  // Apagar criativo do pool (definitivo)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDeleteCreative() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleting(true);
    try {
      // Buscar bucket+path (pode não vir no pool)
      const { data: row, error: selErr } = await (supabase as any)
        .schema("crm").from("meta_creatives")
        .select("storage_bucket,storage_path")
        .eq("id", id)
        .maybeSingle();
      if (selErr) throw selErr;

      const bucket = (row as any)?.storage_bucket as string | null;
      const path = (row as any)?.storage_path as string | null;
      if (bucket && path) {
        const { error: rmErr } = await supabase.storage.from(bucket).remove([path]);
        if (rmErr) console.warn("[design-studio] storage remove failed", rmErr);
      }

      const { error: delErr } = await (supabase as any)
        .schema("crm").from("meta_creatives").delete().eq("id", id);
      if (delErr) throw delErr;

      // Remover do estado local
      setPoolCreatives((prev) => prev.filter((c) => c.id !== id));
      setCreativesById((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setAdsets((prev) =>
        prev.map((a) => ({
          ...a,
          pecas: (a.pecas ?? []).filter((p) => p.creative_id !== id),
        })),
      );
      toast.success("Criativo apagado");
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(`Falha a apagar: ${e?.message ?? String(e)}`);
    } finally {
      setDeleting(false);
    }
  }



  // Validação por variação
  const [validatingKey, setValidatingKey] = useState<string | null>(null);


  // Auto-save (debounce)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const skipNextAutosave = useRef(true);

  // ───────── Reset on close
  useEffect(() => {
    if (!open) {
      setDesignId(null); setAdsets([]); setEstado("rascunho");
      setError(null); setSaveState("idle"); skipNextAutosave.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    }
  }, [open]);

  // ───────── Load on open
  useEffect(() => {
    if (!open || !assemblyId || !companyId) return;
    void loadLatestDesign();
  }, [open, assemblyId, companyId]);

  // Carrega POOL CURADO do evento (via RPC crm.assembly_creative_pool)
  useEffect(() => {
    if (!open || !assemblyId) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .schema("crm").rpc("assembly_creative_pool", { p_assembly_id: assemblyId });
      if (error) { console.warn("[design-studio] fetch pool failed", error); return; }
      setPoolCreatives((data ?? []) as PoolCreative[]);
    })();
  }, [open, assemblyId]);

  // Deriva ticketing_url do evento (assembly → event_id → events.ticketing_url) para usar
  // como link_url default ao carregar criativos novos a partir do Estúdio.
  useEffect(() => {
    if (!open || !assemblyId) { setEventTicketingUrl(null); return; }
    (async () => {
      const { data: aa } = await (supabase as any)
        .schema("crm").from("assisted_assembly")
        .select("event_id").eq("id", assemblyId).maybeSingle();
      const eventId = (aa as any)?.event_id ?? null;
      if (!eventId) { setEventTicketingUrl(null); return; }
      const { data: ev } = await supabase
        .from("events").select("ticketing_url").eq("id", eventId).maybeSingle();
      const url = (ev as any)?.ticketing_url ?? null;
      setEventTicketingUrl(typeof url === "string" && url.trim() ? url.trim() : null);
    })();
  }, [open, assemblyId]);

  // Carregar Custom Audiences disponíveis para a empresa
  useEffect(() => {
    if (!open || !companyId) { setAvailableAudiences([]); setAudiencesTruncated(false); return; }
    (async () => {
      const { data, error } = await (supabase as any)
        .from("meta_custom_audiences")
        .select("id,audience_id_meta,name,total_records_meta,enabled,filters")
        .eq("company_id", companyId)
        .eq("enabled", true)
        .order("total_records_meta", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) {
        console.warn("[design-studio] fetch audiences failed", error);
        toast.error(`Falha a carregar audiências: ${error.message ?? String(error)}`);
        setAvailableAudiences([]); setAudiencesTruncated(false);
        return;
      }
      const rows = (data ?? []) as AvailableAudience[];
      setAvailableAudiences(rows);
      setAudiencesTruncated(rows.length >= 1000);
    })();
  }, [open, companyId]);



  async function fetchCreativeMeta(ids: string[]) {
    if (ids.length === 0) return new Map<string, CreativeMini>();
    const { data, error } = await (supabase as any)
      .schema("crm").from("meta_creatives")
      .select("id, name, type, file_url, width, height, duration_seconds, file_mime_type, headline, body, cta_type, analysis_jsonb, updated_at")
      .in("id", ids);
    if (error) {
      console.warn("[design-studio] fetch creatives failed", error);
      return new Map<string, CreativeMini>();
    }
    const m = new Map<string, CreativeMini>();
    (data ?? []).forEach((r: any) =>
      m.set(r.id, {
        id: r.id,
        name: r.name,
        type: r.type,
        file_url: r.file_url,
        width: r.width,
        height: r.height,
        duration_seconds: r.duration_seconds,
        file_mime_type: r.file_mime_type,
        headline: r.headline,
        body: r.body,
        cta_type: r.cta_type,
        text_snippets: extractSnippets(r.analysis_jsonb),
        updated_at: r.updated_at ?? null,
      }),
    );
    return m;
  }

  async function loadLatestDesign() {
    if (!assemblyId) return;
    setLoading(true);
    setError(null);
    skipNextAutosave.current = true;
    try {
      const { data, error } = await (supabase as any)
        .schema("crm").from("campaign_design")
        .select("id, adsets, estado, generated_at")
        .eq("assembly_id", assemblyId)
        .order("generated_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0];
      if (row) {
        setDesignId(row.id);
        const ads: Adset[] = Array.isArray(row.adsets) ? row.adsets : [];
        setAdsets(ads);
        setEstado(row.estado === "finalizado" ? "finalizado" : "rascunho");
        const ids = Array.from(new Set(ads.flatMap((a) => (a.pecas ?? []).map((p) => p.creative_id))));
        setCreativesById(await fetchCreativeMeta(ids));
      } else {
        setDesignId(null);
        setAdsets([]);
      }
      setSaveState("idle");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runGenerate() {
    if (!companyId || !assemblyId) return;
    setGenerating(true);
    setError(null);
    skipNextAutosave.current = true;
    try {
      const { data, error } = await supabase.functions.invoke("crm-campaign-design-generate", {
        body: { company_id: companyId, assembly_id: assemblyId },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const d = data as any;
      setDesignId(d.design_id);
      const ads: Adset[] = Array.isArray(d.adsets) ? d.adsets : [];
      setAdsets(ads);
      setEstado("rascunho");
      const ids = Array.from(new Set(ads.flatMap((a) => (a.pecas ?? []).map((p) => p.creative_id))));
      setCreativesById(await fetchCreativeMeta(ids));
      setSaveState("idle");
      toast.success("Desenho gerado", { description: `${d.contagem?.adsets ?? 0} adsets · ${d.contagem?.variacoes_total ?? 0} variações` });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(msg);
      toast.error("Falha a gerar desenho", { description: msg });
    } finally {
      setGenerating(false);
    }
  }

  // ───────── Auto-save (debounce 800ms)
  useEffect(() => {
    if (!designId) return;
    if (skipNextAutosave.current) { skipNextAutosave.current = false; return; }
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void persistDraft(); }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsets]);

  async function persistDraft() {
    if (!designId) return;
    setSaveState("saving");
    const { error } = await (supabase as any)
      .schema("crm").from("campaign_design")
      .update({ adsets })
      .eq("id", designId);
    if (error) {
      console.warn("[design-studio] autosave failed", error);
      toast.error("Falha a guardar", { description: error.message });
      setSaveState("dirty");
      return;
    }
    setSaveState("saved");
  }

  // ───────── Mutações
  function updateAdset(idx: number, fn: (a: Adset) => Adset) {
    setAdsets((prev) => prev.map((a, i) => (i === idx ? fn(a) : a)));
  }

  function escolherVariacao(adsetIdx: number, varIdx: number) {
    updateAdset(adsetIdx, (a) => ({
      ...a,
      variacoes_texto: a.variacoes_texto.map((v, j) => ({ ...v, escolhida: j === varIdx })),
    }));
  }

  // Troca o creative_id de uma peça por outro da empresa.
  // Mantém incluida=true e marca motivo_escolha de forma honesta.
  // Auto-save existente (useEffect [adsets]) persiste em crm.campaign_design.
  async function substituirPeca(adsetIdx: number, oldCreativeId: string, newCreativeId: string) {
    if (oldCreativeId === newCreativeId) return;
    updateAdset(adsetIdx, (a) => ({
      ...a,
      pecas: (a.pecas ?? []).map((p) =>
        p.creative_id === oldCreativeId
          ? { ...p, creative_id: newCreativeId, incluida: true, motivo_escolha: "Substituído manualmente pelo gestor" }
          : p
      ),
    }));
    // Garante metadata do novo criativo no cache do lightbox
    if (!creativesById.has(newCreativeId)) {
      const meta = await fetchCreativeMeta([newCreativeId]);
      setCreativesById((prev) => {
        const m = new Map(prev);
        meta.forEach((v, k) => m.set(k, v));
        return m;
      });
    }
  }

  // Adiciona uma nova peça ao adset com um criativo escolhido do pool.
  // Dispara o auto-save existente (useEffect [adsets]) → persiste em crm.campaign_design.
  async function adicionarPeca(adsetIdx: number, newCreativeId: string) {
    let alreadyInAdset = false;
    updateAdset(adsetIdx, (a) => {
      const pecas = a.pecas ?? [];
      if (pecas.some((p) => p.creative_id === newCreativeId)) {
        alreadyInAdset = true;
        return a;
      }
      return {
        ...a,
        pecas: [...pecas, { creative_id: newCreativeId, incluida: true, motivo_escolha: "Adicionado manualmente pelo gestor" }],
      };
    });
    if (alreadyInAdset) return;
    if (!creativesById.has(newCreativeId)) {
      const meta = await fetchCreativeMeta([newCreativeId]);
      setCreativesById((prev) => {
        const m = new Map(prev);
        meta.forEach((v, k) => m.set(k, v));
        return m;
      });
    }
  }

  // ───────── Upload "Carregar novo criativo" — dentro do Estúdio
  const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime";
  const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

  async function readUploadMediaMeta(file: File): Promise<{ width: number; height: number; duration: number | null; type: "image" | "video" }> {
    const isVideo = file.type.startsWith("video/");
    const url = URL.createObjectURL(file);
    try {
      if (isVideo) {
        return await new Promise((resolve, reject) => {
          const v = document.createElement("video");
          v.preload = "metadata";
          v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration, type: "video" });
          v.onerror = () => reject(new Error("Falha a ler vídeo"));
          v.src = url;
        });
      }
      return await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve({ width: i.naturalWidth, height: i.naturalHeight, duration: null, type: "image" });
        i.onerror = () => reject(new Error("Falha a ler imagem"));
        i.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  function openUploadDialog(adsetIdx: number) {
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    setUploadFile(null);
    setUploadPreviewUrl(null);
    setUploadMeta(null);
    setUploadName("");
    setUploadLinkOverride(eventTicketingUrl ?? "");
    setUploadStatus({ state: "idle" });
    setUploadDialog({ open: true, adsetIdx });
  }

  function closeUploadDialog() {
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    setUploadDialog({ open: false, adsetIdx: null });
    setUploadFile(null);
    setUploadPreviewUrl(null);
    setUploadMeta(null);
    setUploadStatus({ state: "idle" });
  }

  async function handleUploadFileChosen(f: File) {
    if (f.size > UPLOAD_MAX_BYTES) { toast.error("Ficheiro demasiado grande (máx 50MB)"); return; }
    if (!UPLOAD_ACCEPT.split(",").includes(f.type)) { toast.error(`Tipo não suportado: ${f.type}`); return; }
    try {
      const m = await readUploadMediaMeta(f);
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
      setUploadFile(f);
      setUploadPreviewUrl(URL.createObjectURL(f));
      setUploadMeta(m);
      if (!uploadName) setUploadName(f.name.replace(/\.[^.]+$/, ""));
    } catch (e: any) {
      toast.error("Falha a ler metadados", { description: e?.message });
    }
  }

  async function submitUpload() {
    if (!uploadFile || !uploadMeta || !companyId) { toast.error("Ficheiro ou empresa em falta"); return; }
    if (!uploadName.trim()) { toast.error("Nome obrigatório"); return; }
    const adsetIdx = uploadDialog.adsetIdx;
    if (adsetIdx == null) { toast.error("Adset desconhecido"); return; }
    const linkFinal = (uploadLinkOverride.trim() || eventTicketingUrl || "").trim() || null;

    setUploadStatus({ state: "uploading", pct: 10, phase: "A enviar ficheiro…" });
    try {
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${companyId}/${Date.now()}_${safeName}`;

      setUploadStatus({ state: "uploading", pct: 30, phase: "A enviar ficheiro…" });
      const { error: upErr } = await supabase.storage
        .from("crm-meta-creatives")
        .upload(path, uploadFile, { contentType: uploadFile.type, upsert: false });
      if (upErr) throw new Error((upErr as any)?.message ?? "Falha no upload");

      const { data: pub } = supabase.storage.from("crm-meta-creatives").getPublicUrl(path);
      const fileUrl = pub.publicUrl;

      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) throw new Error("Sem utilizador autenticado");

      setUploadStatus({ state: "uploading", pct: 70, phase: "A registar criativo…" });
      const { data: inserted, error: insErr } = await (supabase as any)
        .schema("crm").from("meta_creatives")
        .insert({
          company_id: companyId,
          name: uploadName.trim(),
          type: uploadMeta.type,
          storage_bucket: "crm-meta-creatives",
          storage_path: path,
          file_url: fileUrl,
          file_size_bytes: uploadFile.size,
          file_mime_type: uploadFile.type,
          width: uploadMeta.width,
          height: uploadMeta.height,
          duration_seconds: uploadMeta.duration,
          link_url: linkFinal,
          created_by: userId,
        })
        .select("id, name, file_url, type, file_mime_type")
        .single();
      if (insErr) throw new Error(insErr.message);

      // Optimista: adiciona ao adset, ao cache e ao pool já, sem esperar pelo Meta.
      const newId = (inserted as any).id as string;
      await adicionarPeca(adsetIdx, newId);
      setCreativesById((prev) => {
        const m = new Map(prev);
        m.set(newId, {
          id: newId,
          name: (inserted as any).name ?? uploadName.trim(),
          type: uploadMeta.type,
          file_url: fileUrl,
          width: uploadMeta.width,
          height: uploadMeta.height,
          duration_seconds: uploadMeta.duration,
          file_mime_type: uploadFile.type,
          headline: null, body: null, cta_type: null,
          text_snippets: [], updated_at: new Date().toISOString(),
        });
        return m;
      });
      setPoolCreatives((prev) =>
        prev.some((p) => p.id === newId) ? prev : [
          { id: newId, name: (inserted as any).name ?? uploadName.trim(), file_url: fileUrl, type: uploadMeta.type, file_mime_type: uploadFile.type },
          ...prev,
        ]
      );

      // Push para o Meta (não bloqueia).
      setUploadStatus({ state: "metapush" });
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        const { data: pushRes, error: pushErr } = await supabase.functions.invoke(
          "crm-meta-upload-creative-v2",
          {
            body: { company_id: companyId, creative_id: newId },
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
          },
        );
        if (pushRes?.ok === true) {
          const metaId = pushRes.type === "image" ? pushRes.meta_image_hash : pushRes.meta_video_id;
          setUploadStatus({ state: "ok", creativeId: newId, kind: pushRes.type, metaId });
          toast.success(pushRes.type === "video" ? "No Meta — vídeo em processamento" : "No Meta (pronto)");
        } else {
          const err = pushRes?.error || pushErr?.message || "falhou";
          const detail = pushRes?.detail || pushRes?.fb_error?.message || "";
          const msg = detail ? `Push falhou: ${err} — ${detail}` : `Push falhou: ${err}`;
          setUploadStatus({ state: "err", msg, creativeId: newId });
          toast.warning("Criativo guardado, mas falhou push para Meta", { description: msg });
        }
      } catch (e: any) {
        const msg = `Push falhou: ${e?.message ?? String(e)}`;
        setUploadStatus({ state: "err", msg, creativeId: newId });
        toast.warning("Criativo guardado, mas falhou push para Meta", { description: msg });
      }

    } catch (e: any) {
      console.error("[design-studio] upload failed", e);
      setUploadStatus({ state: "err", msg: e?.message ?? String(e) });
      toast.error("Falha ao carregar criativo", { description: e?.message ?? String(e) });
    }
  }

  async function retryUploadMetaPush(creativeIdToRetry: string) {
    setUploadStatus({ state: "metapush" });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const { data: pushRes, error: pushErr } = await supabase.functions.invoke(
        "crm-meta-upload-creative-v2",
        {
          body: { company_id: companyId, creative_id: creativeIdToRetry, force: true },
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        },
      );
      if (pushRes?.ok === true) {
        const metaId = pushRes.type === "image" ? pushRes.meta_image_hash : pushRes.meta_video_id;
        setUploadStatus({ state: "ok", creativeId: creativeIdToRetry, kind: pushRes.type, metaId });
        toast.success("Push para Meta concluído");
      } else {
        const err = pushRes?.error || pushErr?.message || "falhou";
        const detail = pushRes?.detail || pushRes?.fb_error?.message || "";
        const msg = detail ? `Push falhou: ${err} — ${detail}` : `Push falhou: ${err}`;
        setUploadStatus({ state: "err", msg, creativeId: creativeIdToRetry });
        toast.warning(msg);
      }
    } catch (e: any) {
      const msg = `Push falhou: ${e?.message ?? String(e)}`;
      setUploadStatus({ state: "err", msg, creativeId: creativeIdToRetry });
      toast.warning(msg);
    }
  }



  function editarCampo(adsetIdx: number, varIdx: number, campo: "headline" | "corpo" | "cta", valor: string) {
    updateAdset(adsetIdx, (a) => ({
      ...a,
      variacoes_texto: a.variacoes_texto.map((v, j) =>
        j === varIdx ? { ...v, [campo]: valor, semaforo: "por_revalidar" as const } : v
      ),
    }));
  }

  async function validarVariacao(adsetIdx: number, varIdx: number) {
    if (!companyId || !assemblyId) return;
    const v = adsets[adsetIdx]?.variacoes_texto?.[varIdx];
    if (!v) return;
    const key = `${adsetIdx}:${varIdx}`;
    setValidatingKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("crm-validate-design-text", {
        body: { company_id: companyId, assembly_id: assemblyId, headline: v.headline, corpo: v.corpo, cta: v.cta },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const d = data as any;
      updateAdset(adsetIdx, (a) => ({
        ...a,
        variacoes_texto: a.variacoes_texto.map((vv, j) =>
          j === varIdx
            ? {
                ...vv,
                semaforo: ["coerente", "atencao", "contradiz"].includes(d.semaforo) ? d.semaforo : "atencao",
                aproveita_gatilhos: !!d.aproveita_gatilhos,
                explicacao_validacao: typeof d.explicacao === "string" ? d.explicacao : "",
              }
            : vv
        ),
      }));
    } catch (e: any) {
      toast.error("Falha a validar", { description: e?.message ?? String(e) });
    } finally {
      setValidatingKey(null);
    }
  }

  async function finalizar() {
    if (!designId) return;
    const { error } = await (supabase as any)
      .schema("crm").from("campaign_design")
      .update({ estado: "finalizado" })
      .eq("id", designId);
    if (error) {
      toast.error("Falha a finalizar", { description: error.message });
      return;
    }
    setEstado("finalizado");
    toast.success("Desenho finalizado", { description: "Marcador interno — não publica em lado nenhum." });
  }



  const totalVariacoes = useMemo(
    () => adsets.reduce((acc, a) => acc + (a.variacoes_texto?.length ?? 0), 0),
    [adsets]
  );

  // Derivado dos próprios adsets do desenho: a campanha tem gatilho temporal
  // se algum adset escolhido for de tipo 'calendario' ou 'contagem_regressiva'.
  const campanhaTemGatilhoTemporal = useMemo(
    () => adsets.some((a) => a.trigger_tipo === "calendario" || a.trigger_tipo === "contagem_regressiva"),
    [adsets]
  );

  // Lightbox
  const [lightboxCreativeId, setLightboxCreativeId] = useState<string | null>(null);
  const lightboxCreative = lightboxCreativeId ? creativesById.get(lightboxCreativeId) ?? null : null;
  const lightboxTemporalHits = lightboxCreative ? detectTemporalSnippets(lightboxCreative.text_snippets) : [];
  const lightboxMediaType = (() => {
    if (!lightboxCreative) return { kind: "unknown", label: "—" } as const;
    return getEffectiveMediaType(lightboxCreative.file_url, lightboxCreative.file_mime_type, lightboxCreative.type);
  })();
  const lightboxIsImage = lightboxMediaType.kind === "image";
  const lightboxIsVideo = lightboxMediaType.kind === "video";

  // Seletor de criativos (Substituir e Adicionar) num Dialog grande com grelha.
  // Pool curado por evento + busca + filtro Todos/Imagem/Vídeo. Clicar escolhe e fecha.
  type SelectorState = {
    open: boolean;
    title: string;
    disabledIds: Set<string>;
    onPick: (creativeId: string) => void;
  };
  const [selector, setSelector] = useState<SelectorState>({
    open: false, title: "Escolher criativo", disabledIds: new Set(), onPick: () => {},
  });
  const [selectorQ, setSelectorQ] = useState("");
  const [selectorFilter, setSelectorFilter] = useState<"all" | "image" | "video">("all");

  function openSelector(opts: { title: string; disabledIds: Set<string>; onPick: (cid: string) => void }) {
    setSelectorQ("");
    setSelectorFilter("all");
    setSelector({ open: true, title: opts.title, disabledIds: opts.disabledIds, onPick: opts.onPick });
  }

  const selectorItems = useMemo(() => {
    const qn = selectorQ.trim().toLowerCase();
    return poolCreatives.filter((cc) => {
      if (qn && !((cc.name ?? "").toLowerCase().includes(qn))) return false;
      if (selectorFilter !== "all") {
        const k = getEffectiveMediaType(cc.file_url, cc.file_mime_type, cc.type).kind;
        if (k !== selectorFilter) return false;
      }
      return true;
    });
  }, [selectorQ, selectorFilter, poolCreatives]);

  function CreativeSelectorDialog() {
    return (
      <Dialog open={selector.open} onOpenChange={(o) => setSelector((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-3xl p-0 gap-0 flex flex-col max-h-[85vh]">
          <DialogHeader className="px-5 py-4 border-b">
            <DialogTitle className="text-base">{selector.title}</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-3 border-b space-y-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={selectorQ}
                onChange={(e) => setSelectorQ(e.target.value)}
                placeholder="Buscar por nome…"
                className="h-9 pl-9 text-sm"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              {(["all", "image", "video"] as const).map((f) => (
                <Button
                  key={f}
                  type="button"
                  size="sm"
                  variant={selectorFilter === f ? "default" : "outline"}
                  className="h-8 px-3 text-xs"
                  onClick={() => setSelectorFilter(f)}
                >
                  {f === "all" ? "Todos" : f === "image" ? "Imagem" : "Vídeo"}
                </Button>
              ))}
              <div className="ml-auto text-xs text-muted-foreground self-center">
                {selectorItems.length} criativo{selectorItems.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {selectorItems.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Sem criativos no pool.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {selectorItems.map((cc) => {
                  const inUse = selector.disabledIds.has(cc.id);
                  const kind = getEffectiveMediaType(cc.file_url, cc.file_mime_type, cc.type).kind;
                   return (
                     <div
                       key={cc.id}
                       className={cn(
                         "group relative text-left rounded-lg border bg-card/40 overflow-hidden transition hover:border-primary/60 hover:bg-card/70 focus-within:ring-2 focus-within:ring-primary/40",
                         inUse && "opacity-40 hover:border-border hover:bg-card/40",
                       )}
                     >
                       <button
                         type="button"
                         disabled={inUse}
                         onClick={() => {
                           selector.onPick(cc.id);
                           setSelector((s) => ({ ...s, open: false }));
                         }}
                         className={cn(
                           "block w-full text-left focus:outline-none",
                           inUse && "cursor-not-allowed",
                         )}
                       >
                         <div className="relative w-full aspect-square bg-muted">
                           {cc.file_url ? (
                             kind === "video" ? (
                               <video
                                 src={`${cc.file_url}#t=0.1`}
                                 muted
                                 playsInline
                                 preload="metadata"
                                 className="w-full h-full object-cover pointer-events-none"
                               />
                             ) : (
                               <img src={cc.file_url} alt="" className="w-full h-full object-cover" />
                             )
                           ) : null}
                           {inUse && (
                             <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                               <Badge variant="outline" className="bg-background/80 text-[10px]">em uso</Badge>
                             </div>
                           )}
                         </div>
                         <div className="px-2 py-1.5 text-xs truncate" title={cc.name ?? cc.id}>
                           {cc.name ?? cc.id.slice(0, 8)}
                         </div>
                       </button>
                       <button
                         type="button"
                         title="Apagar criativo"
                         aria-label="Apagar criativo"
                         onClick={(e) => {
                           e.stopPropagation();
                           setDeleteTarget({ id: cc.id, name: cc.name ?? cc.id.slice(0, 8) });
                         }}
                         className="absolute top-1.5 right-1.5 rounded-md bg-background/80 hover:bg-destructive hover:text-destructive-foreground text-muted-foreground p-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                       >
                         <Trash2 className="h-3.5 w-3.5" />
                       </button>
                     </div>
                   );
                 })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-full p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-primary" /> Estúdio de Desenho de Campanha
              </SheetTitle>
              <SheetDescription>
                Veste cada adset com texto e escolha de peça. Variações são auto-classificadas pelo motor; ao editar à mão, o semáforo é re-validado pelo servidor.
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              {saveState === "saving" && (
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> A guardar…</span>
              )}
              {saveState === "saved" && (
                <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Guardado</span>
              )}
              {saveState === "dirty" && (
                <span className="text-xs text-muted-foreground">Alterações por guardar</span>
              )}
              <Badge variant={estado === "finalizado" ? "default" : "outline"}>
                {estado === "finalizado" ? "Finalizado" : "Rascunho"}
              </Badge>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar desenho…</div>
          )}

          {!loading && !designId && (
            <Card className="p-6">
              <div className="flex flex-col items-start gap-3">
                <h3 className="text-base font-semibold">Sem desenho ainda para esta montagem</h3>
                <p className="text-sm text-muted-foreground max-w-prose">
                  Vamos pedir ao motor para escrever 2-3 variações de texto por adset (com auto-classificação de semáforo). Pode demorar alguns segundos.
                </p>
                <Button onClick={runGenerate} disabled={generating || !assemblyId || !companyId}>
                  {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                  Gerar desenho
                </Button>
                {error && <p className="text-sm text-red-400">{error}</p>}
              </div>
            </Card>
          )}

          {!loading && designId && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-muted-foreground">
                  {adsets.length} adsets · {totalVariacoes} variações
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={runGenerate} disabled={generating}>
                    {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                    Re-pedir ao LLM (regenera tudo)
                  </Button>
                  <Button size="sm" onClick={finalizar} disabled={estado === "finalizado"}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Finalizar desenho
                  </Button>
                </div>
              </div>

              {adsets.map((adset, ai) => {
                const acc = triggerAccent(adset.trigger_tipo);
                return (
                  <Card key={ai} className="p-5 space-y-4">
                    {/* Cabeçalho do adset */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold">{adset.trigger_nome}</h3>
                          <Badge variant="outline" className={cn("border", acc.chip)}>{acc.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Investimento sugerido: <span className="font-medium text-foreground">{adset.peso_pct}%</span></p>
                      </div>
                    </div>

                    {/* Orientação determinística por arquétipo + cobertura do adset */}
                    {(() => {
                      const rec = recommendForArchetype(adset.trigger_tipo);
                      const pecasInputs = (adset.pecas ?? []).map((pp) => {
                        const c = creativesById.get(pp.creative_id);
                        return {
                          type: c?.type ?? null,
                          width: c?.width ?? null,
                          height: c?.height ?? null,
                          duration_seconds: c?.duration_seconds ?? null,
                          file_mime_type: c?.file_mime_type ?? null,
                        };
                      });
                      const av = evaluateAdset(pecasInputs, adset.trigger_tipo);
                      const cobLabel = av.cobertura_formato === "completa" ? "4:5 + 9:16 ✓"
                        : av.cobertura_formato === "so_feed" ? "Falta 9:16"
                        : av.cobertura_formato === "so_vertical" ? "Falta 4:5"
                        : "Sem peças";
                      const cobClass = av.cobertura_formato === "completa"
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/40"
                        : "bg-amber-500/10 text-amber-300 border-amber-500/40";
                      const adqLabel = av.adequacao_funil === "alinhado" ? "Alinhado ao funil"
                        : av.adequacao_funil === "sugere_estatico" ? "Sugere estático"
                        : av.adequacao_funil === "sugere_video" ? "Sugere vídeo"
                        : "Neutro";
                      const adqClass = av.adequacao_funil === "alinhado"
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/40"
                        : av.adequacao_funil === "neutro"
                        ? "bg-zinc-500/10 text-zinc-300 border-zinc-500/40"
                        : "bg-amber-500/10 text-amber-300 border-amber-500/40";
                      return (
                        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <Lightbulb className="h-4 w-4 text-amber-300 mt-0.5 shrink-0" />
                            <div className="text-xs leading-relaxed">
                              <span className="font-medium text-foreground">Orientação: </span>
                              <span className="text-muted-foreground">{rec.texto} </span>
                              <span className="text-foreground">Formato: {rec.formato}.</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className={cn("border text-[10px]", cobClass)}>{cobLabel}</Badge>
                            <Badge variant="outline" className={cn("border text-[10px]", adqClass)}>{adqLabel}</Badge>
                            {(() => {
                              const nPecas = (adset.pecas ?? []).filter((pp) => pp.incluida === true).length;
                              const nVar = (adset.variacoes_texto ?? []).filter((v) => v.semaforo === "coerente").length;
                              const nAds = nPecas * nVar;
                              let qtdClass = "bg-zinc-500/10 text-zinc-300 border-zinc-500/40";
                              let qtdHint = "Sem peças incluídas";
                              if (nPecas === 1) {
                                qtdClass = "bg-amber-500/10 text-amber-300 border-amber-500/40";
                                qtdHint = "Cobertura incompleta — falta o outro formato (ideal: 4:5 feed + 9:16 story/reel).";
                              } else if (nPecas >= 2 && nPecas <= 4) {
                                qtdClass = "bg-emerald-500/10 text-emerald-300 border-emerald-500/40";
                                qtdHint = "Quantidade saudável (2 a 4 peças por adset).";
                              } else if (nPecas > 4) {
                                qtdClass = "bg-amber-500/10 text-amber-300 border-amber-500/40";
                                qtdHint = "Muitas peças — considera reduzir para 2-4 (cada peça × variações multiplica o nº de anúncios).";
                              }
                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="outline" className={cn("border text-[10px] cursor-help", qtdClass)}>
                                        {nPecas} {nPecas === 1 ? "peça" : "peças"} × {nVar} {nVar === 1 ? "variação" : "variações"} ≈ {nAds} {nAds === 1 ? "anúncio" : "anúncios"}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                                      {qtdHint}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })()}
                            {av.avisos.length > 0 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="border bg-amber-500/10 text-amber-300 border-amber-500/40 text-[10px] gap-1 cursor-help">
                                      <AlertTriangle className="h-3 w-3" /> {av.avisos.length} {av.avisos.length === 1 ? "aviso" : "avisos"}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs">
                                    <ul className="text-xs space-y-1 list-disc pl-4">
                                      {av.avisos.map((a, i) => <li key={i}>{a}</li>)}
                                    </ul>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>

                        </div>
                      );
                    })()}

                    {/* Audiências atribuídas */}
                    {(() => {
                      const auds = adset.audiencias ?? [];
                      const removeAud = (audMetaId: string) => {
                        setAdsets((prev) => prev.map((a, idx) => idx === ai
                          ? { ...a, audiencias: (a.audiencias ?? []).filter((x) => x.audience_id_meta !== audMetaId) }
                          : a));
                      };
                      return (
                        <div className="rounded-md border border-border bg-card/40 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              Audiências ({auds.length})
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setAudienceDialog({ open: true, adsetIdx: ai })}
                            >
                              <Plus className="h-3 w-3 mr-1" /> Adicionar audiência
                            </Button>
                          </div>
                          {auds.length === 0 ? (
                            <div className="flex items-start gap-2 text-[11px] text-amber-300">
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              <span>Sem audiência — usará público amplo (broad).</span>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {auds.map((a) => {
                                const subLabel = a.subtype ? (SUBTYPE_LABEL[a.subtype] ?? a.subtype) : null;
                                return (
                                  <Badge
                                    key={a.audience_id_meta}
                                    variant="outline"
                                    className="border bg-primary/5 text-foreground text-[10px] gap-1 pl-2 pr-1 py-0.5"
                                  >
                                    <span className="truncate max-w-[220px]" title={a.name}>{a.name}</span>
                                    {subLabel && <span className="text-muted-foreground">· {subLabel}</span>}
                                    <span className="text-muted-foreground">· {formatAudienceSize(a.tamanho)}</span>
                                    <button
                                      type="button"
                                      onClick={() => removeAud(a.audience_id_meta)}
                                      className="ml-0.5 rounded hover:bg-muted/60 p-0.5"
                                      aria-label="Remover audiência"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Peças */}

                    {(() => {
                      const usedInThisAdset = new Set((adset.pecas ?? []).map((pp) => pp.creative_id));
                      return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Peças</h4>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px] gap-1"
                            title="Adicionar criativo do pool curado do evento"
                            onClick={() => openSelector({
                              title: "Adicionar criativo",
                              disabledIds: usedInThisAdset,
                              onPick: (cid) => adicionarPeca(ai, cid),
                            })}
                          >
                            <Plus className="h-3 w-3" />
                            Adicionar criativo
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px] gap-1"
                            title="Carregar criativo novo do disco e adicionar a este adset"
                            onClick={() => openUploadDialog(ai)}
                          >
                            <Upload className="h-3 w-3" />
                            Carregar novo
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {(adset.pecas ?? []).map((p) => {
                          const c = creativesById.get(p.creative_id);
                          const mediaKind = getEffectiveMediaType(c?.file_url, c?.file_mime_type, c?.type).kind;
                          const isImage = mediaKind === "image";
                          const isVideo = mediaKind === "video";
                          const temporalHits = c ? detectTemporalSnippets(c.text_snippets) : [];
                          const warn = temporalHits.length > 0 && !campanhaTemGatilhoTemporal;
                          return (
                            <div
                              key={p.creative_id}
                              className={cn(
                                "group relative border rounded-lg p-2 w-[180px] bg-card/40 transition hover:bg-card/70 hover:border-primary/50",
                                warn && "border-amber-500/60",
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => setLightboxCreativeId(p.creative_id)}
                                className="w-full text-left focus:outline-none focus:ring-2 focus:ring-primary/40 rounded"
                                title="Ampliar peça"
                              >
                                <div className="relative">
                                  {isImage && c?.file_url ? (
                                    <img src={withCacheBust(c.file_url, c.updated_at) ?? undefined} alt={c.name ?? ""} className="w-full h-24 object-cover rounded mb-2" />
                                  ) : isVideo && c?.file_url ? (
                                    <video
                                      src={`${withCacheBust(c.file_url, c.updated_at)}#t=0.1`}
                                      muted
                                      playsInline
                                      preload="metadata"
                                      className="w-full h-24 object-cover rounded mb-2 pointer-events-none"
                                    />
                                  ) : (
                                    <div className="w-full h-24 rounded mb-2 bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                                      {(c?.type ?? "?").toString()}
                                    </div>
                                  )}
                                  <Maximize2 className="h-3.5 w-3.5 absolute top-1 right-1 text-white/90 drop-shadow opacity-0 group-hover:opacity-100 transition" />
                                </div>
                                <div className="text-xs font-medium truncate" title={c?.name ?? p.creative_id}>{c?.name ?? p.creative_id.slice(0, 8)}</div>
                                {(() => {
                                  if (!c) return null;
                                  const ev = evaluatePiece({
                                    type: c.type,
                                    width: c.width,
                                    height: c.height,
                                    duration_seconds: c.duration_seconds,
                                    file_mime_type: c.file_mime_type,
                                  });
                                  const placementBadge = ev.placement === "vertical" ? "9:16" : ev.placement === "feed" ? "Feed" : "—";
                                  const placementClass = ev.placement === "vertical"
                                    ? "bg-purple-500/10 text-purple-300 border-purple-500/40"
                                    : ev.placement === "feed"
                                    ? "bg-sky-500/10 text-sky-300 border-sky-500/40"
                                    : "bg-zinc-500/10 text-zinc-300 border-zinc-500/40";
                                  const avisos = ev.badges.filter((b) => b.nivel === "aviso");
                                  return (
                                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                                      <Badge variant="outline" className={cn("border text-[10px]", placementClass)}>{placementBadge}</Badge>
                                      {avisos.length === 0 ? (
                                        <Badge variant="outline" className="border bg-emerald-500/10 text-emerald-300 border-emerald-500/40 text-[10px]">ok</Badge>
                                      ) : (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Badge variant="outline" className="border bg-amber-500/10 text-amber-300 border-amber-500/40 text-[10px] gap-1 cursor-help">
                                                <AlertTriangle className="h-3 w-3" /> {avisos.length}
                                              </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom" className="max-w-xs">
                                              <ul className="text-xs space-y-1 list-disc pl-4">
                                                {avisos.map((b) => <li key={b.codigo}>{b.dica ?? b.label}</li>)}
                                              </ul>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                    </div>
                                  );
                                })()}
                                {warn && (
                                  <Badge className="mt-1 bg-amber-500/15 text-amber-300 border-amber-500/40 text-[10px] gap-1">
                                    <AlertTriangle className="h-3 w-3" /> texto temporal na imagem
                                  </Badge>
                                )}
                                {p.motivo_escolha && (
                                  <div className="text-[11px] text-muted-foreground mt-1 line-clamp-3">{p.motivo_escolha}</div>
                                )}
                              </button>
                              <div className="mt-2 flex justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[11px] gap-1"
                                  title="Substituir por outro criativo do pool"
                                  onClick={() => openSelector({
                                    title: `Substituir "${c?.name ?? p.creative_id.slice(0, 8)}"`,
                                    disabledIds: usedInThisAdset,
                                    onPick: (cid) => substituirPeca(ai, p.creative_id, cid),
                                  })}
                                >
                                  <Replace className="h-3 w-3" />
                                  Substituir
                                </Button>

                              </div>
                            </div>
                          );
                        })}
                        {(adset.pecas ?? []).length === 0 && (
                          <span className="text-xs text-muted-foreground">(sem peças)</span>
                        )}
                      </div>
                    </div>
                      );
                    })()}


                    <Separator />

                    {/* Variações de texto */}
                    <div>
                      <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Variações de texto</h4>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {(adset.variacoes_texto ?? []).map((v, vi) => {
                          const key = `${ai}:${vi}`;
                          const isEditing = v.escolhida;
                          return (
                            <Card key={vi} className={cn(
                              "p-3 space-y-2",
                              v.escolhida && "ring-2 ring-primary",
                            )}>
                              <div className="flex items-center justify-between gap-2">
                                <SemaforoBadge s={v.semaforo} />
                                {v.semaforo === "por_revalidar" && (
                                  <span className="text-[11px] text-amber-400 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> editado — valida para ver o semáforo
                                  </span>
                                )}
                              </div>

                              {isEditing ? (
                                <>
                                  <div className="space-y-1">
                                    <label className="text-[11px] text-muted-foreground">Headline</label>
                                    <Input value={v.headline} onChange={(e) => editarCampo(ai, vi, "headline", e.target.value)} />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[11px] text-muted-foreground">Corpo</label>
                                    <Textarea rows={4} value={v.corpo} onChange={(e) => editarCampo(ai, vi, "corpo", e.target.value)} />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[11px] text-muted-foreground">CTA</label>
                                    <Select value={v.cta} onValueChange={(val) => editarCampo(ai, vi, "cta", val)}>
                                      <SelectTrigger><SelectValue>{labelCta(v.cta)}</SelectValue></SelectTrigger>
                                      <SelectContent>
                                        {CTA_OPTIONS.includes(v.cta) ? null : (
                                          <SelectItem value={v.cta}>{labelCta(v.cta)}</SelectItem>
                                        )}
                                        {CTA_OPTIONS.map((o) => <SelectItem key={o} value={o}>{labelCta(o)}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="text-sm font-medium">{v.headline || <span className="text-muted-foreground italic">(sem headline)</span>}</div>
                                  <div className="text-xs text-muted-foreground whitespace-pre-wrap">{v.corpo || "(sem corpo)"}</div>
                                  <div className="text-[11px] text-muted-foreground">CTA: {labelCta(v.cta)}</div>
                                </>
                              )}

                              {v.explicacao_validacao && v.semaforo !== "por_revalidar" && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="text-[11px] text-muted-foreground flex items-start gap-1 cursor-help">
                                        <Info className="h-3 w-3 mt-0.5 shrink-0" />
                                        <span className="line-clamp-2">{v.explicacao_validacao}</span>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs"><p className="text-xs">{v.explicacao_validacao}</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              <div className="flex gap-2 pt-1">
                                {!v.escolhida ? (
                                  <Button size="sm" variant="outline" onClick={() => escolherVariacao(ai, vi)}>Escolher esta</Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant={v.semaforo === "por_revalidar" ? "default" : "outline"}
                                    onClick={() => validarVariacao(ai, vi)}
                                    disabled={validatingKey === key}
                                  >
                                    {validatingKey === key
                                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> A validar…</>
                                      : "Validar"}
                                  </Button>
                                )}
                              </div>
                            </Card>
                          );
                        })}
                        {(adset.variacoes_texto ?? []).length === 0 && (
                          <span className="text-xs text-muted-foreground">(sem variações)</span>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}

              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          )}
        </div>
      </SheetContent>

      {/* Lightbox da peça */}
      <Dialog open={!!lightboxCreativeId} onOpenChange={(o) => { if (!o) setLightboxCreativeId(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate">
              {lightboxCreative?.name ?? lightboxCreativeId?.slice(0, 8) ?? "Peça"}
            </DialogTitle>
          </DialogHeader>

          {lightboxCreative && (
            <div className="space-y-4">
              {lightboxTemporalHits.length > 0 && !campanhaTemGatilhoTemporal && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200 flex gap-2 items-start">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    Esta peça mostra texto temporal (ex.: «{lightboxTemporalHits.slice(0, 3).join("», «")}»).
                    A campanha não tem gatilho de calendário/contagem ativo — pode não ser reutilizável.
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center bg-black/40 rounded-md overflow-hidden h-[60vh]">
                {lightboxIsImage && lightboxCreative.file_url ? (
                  <img
                    src={withCacheBust(lightboxCreative.file_url, lightboxCreative.updated_at) ?? undefined}
                    alt={lightboxCreative.name ?? ""}
                    className="w-full h-full object-contain"
                  />
                ) : lightboxIsVideo && lightboxCreative.file_url ? (
                  <video
                    controls
                    playsInline
                    src={withCacheBust(lightboxCreative.file_url, lightboxCreative.updated_at) ?? undefined}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="p-12 text-sm text-muted-foreground">
                    Sem pré-visualização disponível ({lightboxMediaType.label})
                  </div>
                )}
              </div>

              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div><span className="text-foreground">Tipo:</span> {lightboxMediaType.label}{lightboxCreative.file_mime_type ? ` · ${lightboxCreative.file_mime_type}` : ""}</div>
                <div><span className="text-foreground">Dimensões:</span> {lightboxCreative.width && lightboxCreative.height ? `${lightboxCreative.width}×${lightboxCreative.height}` : "—"}</div>
                {lightboxIsVideo && (
                  <div><span className="text-foreground">Duração:</span> {lightboxCreative.duration_seconds ? `${lightboxCreative.duration_seconds}s` : "—"}</div>
                )}
                {lightboxCreative.cta_type && (
                  <div><span className="text-foreground">CTA original:</span> {lightboxCreative.cta_type}</div>
                )}
              </div>

              {(lightboxCreative.headline || lightboxCreative.body) && (
                <div className="space-y-1 border-t pt-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Texto original da peça</div>
                  {lightboxCreative.headline && <div className="text-sm font-medium">{lightboxCreative.headline}</div>}
                  {lightboxCreative.body && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{lightboxCreative.body}</div>}
                </div>
              )}

              {lightboxCreative.text_snippets.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Texto detetado na peça</div>
                  <div className="flex flex-wrap gap-1.5">
                    {lightboxCreative.text_snippets.map((s, i) => {
                      const isTemporal = detectTemporalSnippets([s]).length > 0;
                      return (
                        <Badge
                          key={i}
                          variant="outline"
                          className={cn(
                            "text-[11px]",
                            isTemporal && "border-amber-500/50 text-amber-300 bg-amber-500/10",
                          )}
                        >
                          {s}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Seletor de criativos (Adicionar / Substituir) */}
      <CreativeSelectorDialog />

      {/* Confirmação para apagar criativo definitivamente */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader className="min-w-0">
            <AlertDialogTitle className="break-words min-w-0">Apagar definitivamente «{deleteTarget?.name}»?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Esta ação remove o ficheiro e o registo. Não pode ser desfeita.</p>
                {(() => {
                  if (!deleteTarget) return null;
                  const usedIn = adsets.filter((a) => (a.pecas ?? []).some((p) => p.creative_id === deleteTarget.id)).length;
                  if (usedIn === 0) return null;
                  return (
                    <p className="text-amber-400 flex items-start gap-1">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>Este criativo está em uso em {usedIn} adset{usedIn === 1 ? "" : "s"} e será removido deles.</span>
                    </p>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); void confirmDeleteCreative(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload de criativo novo dentro do Estúdio */}
      <Dialog
        open={uploadDialog.open}
        onOpenChange={(o) => {
          if (!o) closeUploadDialog();
        }}
      >
        <DialogContent className="max-w-xl w-full max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4" /> Carregar novo criativo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!uploadFile ? (
              <div
                onClick={() => uploadFileInputRef.current?.click()}
                className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition"
              >
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Clica para escolher</p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP, GIF, MP4, MOV · máx 50MB</p>
                <input
                  ref={uploadFileInputRef}
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadFileChosen(f);
                    e.target.value = "";
                  }}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative rounded-lg overflow-hidden bg-muted">
                  {uploadMeta?.type === "video" ? (
                    <video src={uploadPreviewUrl ?? undefined} controls className="w-full max-h-64 object-contain" />
                  ) : (
                    <img src={uploadPreviewUrl ?? undefined} alt="" className="w-full max-h-64 object-contain" />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground min-w-0">
                  <div className="truncate min-w-0 flex-1">
                    {uploadFile.name} · {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                    {uploadMeta && <> · {uploadMeta.width}×{uploadMeta.height}{uploadMeta.duration ? ` · ${uploadMeta.duration.toFixed(1)}s` : ""}</>}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    disabled={uploadStatus.state === "uploading" || uploadStatus.state === "metapush"}
                    onClick={() => {
                      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
                      setUploadFile(null); setUploadPreviewUrl(null); setUploadMeta(null);
                    }}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Remover
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="up-name">Nome *</Label>
              <Input
                id="up-name"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                disabled={uploadStatus.state === "uploading" || uploadStatus.state === "metapush"}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="up-link" className="flex items-center justify-between">
                <span>Link do anúncio</span>
                {eventTicketingUrl
                  ? <span className="text-[10px] text-emerald-400">derivado do evento</span>
                  : <span className="text-[10px] text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> sem ticketing_url — pode não entrar no pool</span>}
              </Label>
              <Input
                id="up-link"
                type="url"
                placeholder="https://…"
                value={uploadLinkOverride}
                onChange={(e) => setUploadLinkOverride(e.target.value)}
                disabled={uploadStatus.state === "uploading" || uploadStatus.state === "metapush"}
              />
            </div>

            {/* Estados */}
            {uploadStatus.state === "uploading" && (
              <div className="space-y-1">
                <Progress value={uploadStatus.pct} />
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> {uploadStatus.phase}
                </p>
              </div>
            )}
            {uploadStatus.state === "metapush" && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> A carregar no Meta…
              </p>
            )}
            {uploadStatus.state === "ok" && (
              <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {uploadStatus.kind === "video" ? "Vídeo no Meta (em processamento)" : "Imagem no Meta (pronta)"}
                {uploadStatus.metaId && <span className="font-mono opacity-70 truncate">· {uploadStatus.metaId}</span>}
              </div>
            )}
            {uploadStatus.state === "err" && (
              <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300 space-y-1">
                <div className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Push para Meta falhou: {uploadStatus.msg}</div>
                {uploadStatus.creativeId && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => retryUploadMetaPush(uploadStatus.creativeId!)}>
                    Tentar novamente
                  </Button>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={closeUploadDialog}>
                {uploadStatus.state === "ok" ? "Fechar" : "Cancelar"}
              </Button>
              {uploadStatus.state !== "ok" && (
                <Button
                  onClick={submitUpload}
                  disabled={!uploadFile || !uploadName.trim() || uploadStatus.state === "uploading" || uploadStatus.state === "metapush"}
                >
                  {(uploadStatus.state === "uploading" || uploadStatus.state === "metapush") && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                  Carregar e adicionar
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SearchableAudienceDialog
        open={audienceDialog.open}
        onOpenChange={(v) => setAudienceDialog((prev) => ({ ...prev, open: v }))}
        audiences={availableAudiences}
        truncated={audiencesTruncated}
        alreadySelected={
          audienceDialog.adsetIdx != null
            ? new Set((adsets[audienceDialog.adsetIdx]?.audiencias ?? []).map((a) => a.audience_id_meta))
            : new Set()
        }
        onPick={(a) => {
          const idx = audienceDialog.adsetIdx;
          if (idx == null) return;
          setAdsets((prev) => prev.map((ad, i) => {
            if (i !== idx) return ad;
            const cur = ad.audiencias ?? [];
            if (cur.some((x) => x.audience_id_meta === a.audience_id_meta)) return ad;
            const entry: AdsetAudience = {
              audience_id_meta: a.audience_id_meta,
              name: a.name,
              subtype: audienceSubtype(a),
              tamanho: a.total_records_meta ?? null,
            };
            return { ...ad, audiencias: [...cur, entry] };
          }));
        }}
      />

    </Sheet>

  );
}
