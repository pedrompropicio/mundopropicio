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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Loader2, RefreshCw, Sparkles, Wand2, AlertTriangle, Info, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

type Adset = {
  trigger_id: string | null;
  trigger_nome: string;
  trigger_tipo: string;
  peso_pct: number;
  pecas: Peca[];
  variacoes_texto: Variacao[];
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
};

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

  // TEMP DIAG — REMOVER
  const [diagLoading, setDiagLoading] = useState(false);
  const [rehostLoading, setRehostLoading] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagResult, setDiagResult] = useState<string>("");
  async function runDiagImageResolution() {
    try {
      setDiagLoading(true);
      setDiagResult("");
      const creativeIds = Array.from(new Set(
        adsets.flatMap((a) => (a.pecas ?? []).map((p: any) => p.creative_id).filter(Boolean))
      ));
      if (creativeIds.length === 0) {
        toast.warning("nenhuma peça neste desenho");
        setDiagLoading(false);
        return;
      }
      const { data: rows, error: fetchErr } = await (supabase as any)
        .schema("crm").from("meta_creatives")
        .select("id, type, meta_image_hash")
        .in("id", creativeIds);
      if (fetchErr) throw fetchErr;
      const hashes = Array.from(new Set(
        (rows ?? [])
          .filter((r: any) => r.meta_image_hash && (r.type === "image" || !r.type))
          .map((r: any) => r.meta_image_hash as string)
      )).slice(0, 5);
      if (hashes.length === 0) {
        toast.warning("nenhuma peça com image_hash neste desenho");
        setDiagLoading(false);
        return;
      }
      const { data, error: invErr } = await supabase.functions.invoke("crm-diag-image-resolution", {
        body: {
          connection_id: "3c234235-0ac5-4afc-a06e-259bdea0ae7a",
          ad_account_id: "act_5094207367314169",
          image_hashes: hashes,
        },
      });
      const payload = { hashes_enviados: hashes, data, invErr: invErr ? String(invErr?.message ?? invErr) : null };
      setDiagResult(JSON.stringify(payload, null, 2));
      setDiagOpen(true);
    } catch (e: any) {
      setDiagResult(JSON.stringify({ erro: String(e?.message ?? e) }, null, 2));
      setDiagOpen(true);
    } finally {
      setDiagLoading(false);
    }
  }
  async function runRehostOne() {
    try {
      setRehostLoading(true);
      setDiagResult("");
      const { data, error: invErr } = await supabase.functions.invoke("crm-meta-rehost-images-targeted", {
        body: {
          connection_id: "3c234235-0ac5-4afc-a06e-259bdea0ae7a",
          ad_account_id: "act_5094207367314169",
          creative_ids: ["dde73511-23ba-47a3-96d5-820d28abdcef","9ff31e2c-5f1c-44f5-a232-d0132bdd822c","21b45363-f46d-47e5-98f8-3ececb10b8d1","30ef903b-35d6-455f-8248-7386a4c98df2","593c4b68-e4d6-4aef-aad7-1ffb225f1188","e80eee95-3283-44c4-9e9d-ec2cc0210cd8","1e6a1993-7b5a-4e3f-a1a9-e94479e7085d","087787b8-b26e-4c90-b06e-222bdecad272","d11f59ac-b96f-4a44-9b21-b1aaaa92e5a9","6e0ae146-526d-4539-a28f-c0701e5f06bb","f6042603-8858-410c-8af3-6ed21190f6bd","c1d98009-f426-48f7-953d-e39ff23c5e57","85de9a86-6535-48c9-8ffc-5936b5843f79","6a9b7f1f-5395-44ae-9a46-1e20418b2ebc","1c4c649e-c272-49a5-b68d-f150b5875610","cdf451ce-375a-40e7-8f00-ab364e16c38d","d6717743-47e4-4fb3-a01c-7577ec0b1e40","84205fd7-c6db-4e91-a665-a302d57b28d2","3530a62e-619d-45f3-bae5-8d77ba366a0e","c67f51b0-53cf-4cf4-a437-3f92a0158e39","ecdc730d-6e2b-4c1d-9936-7bb5ff4debda","83937c8f-a0fc-4e6b-a579-ff5b0414fa7e","003d61f6-c97d-4c1d-95b7-d5f8596c6dc3","637e787a-24ba-4559-92f3-bf1d581e9769","6f6c8056-d36d-4183-9993-63b35da38288","48212b83-5434-4be8-9523-10ab08d965fb","ee84b572-9fcc-4289-acda-a17c83b52dc8","10b4a257-c8b4-4730-bbaa-728766d8c440","1534fb5a-aa54-4d19-bed0-9fc35c15d2fe","b924e837-0bbd-4115-a9ac-4acc03671537","4a23c756-578a-4617-8df3-1c312f2d91d9","9da93d19-0176-40db-99e7-1edf7573560d","3bddfe2e-9ba8-4e41-b672-bb8ea8c370d8","036f79db-440b-4067-8c36-a09ba10cef2f","7c2859d3-2159-453d-8cc4-cd274f1167bb","943aa1f0-087f-4781-a8a5-1ab9b93a4a3c","5dbe03c1-5b75-4efe-8760-5af3fc86584a","aa65d165-09d2-4ace-a480-0a6d46fac6b6","434a458b-f327-4cca-b53b-00872331c844","688ba74b-a31a-43db-9631-7adc8c865627"],
        },
      });
      const payload = { data, invErr: invErr ? String(invErr?.message ?? invErr) : null };
      setDiagResult(JSON.stringify(payload, null, 2));
      setDiagOpen(true);
    } catch (e: any) {
      setDiagResult(JSON.stringify({ erro: String(e?.message ?? e) }, null, 2));
      setDiagOpen(true);
    } finally {
      setRehostLoading(false);
    }
  }
  // END TEMP DIAG

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

  async function fetchCreativeMeta(ids: string[]) {
    if (ids.length === 0) return new Map<string, CreativeMini>();
    const { data, error } = await (supabase as any)
      .schema("crm").from("meta_creatives")
      .select("id, name, type, file_url, width, height, duration_seconds, file_mime_type, headline, body, cta_type, analysis_jsonb")
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
                  {/* TEMP DIAG — REMOVER */}
                  <Button size="sm" variant="outline" onClick={runDiagImageResolution} disabled={diagLoading}>
                    {diagLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                    🔧 Diag resolução
                  </Button>
                  {/* END TEMP DIAG */}
                  {/* TEMP DIAG — REMOVER */}
                  <Button size="sm" variant="outline" onClick={runRehostOne} disabled={rehostLoading}>
                    {rehostLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                    🖼️ Re-host 40 (Ivete)
                  </Button>
                  {/* END TEMP DIAG */}
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

                    {/* Peças */}
                    <div>
                      <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Peças</h4>
                      <div className="flex flex-wrap gap-3">
                        {(adset.pecas ?? []).map((p) => {
                          const c = creativesById.get(p.creative_id);
                          const isImage = ((c?.type ?? "").toLowerCase().includes("image"))
                            || ((c?.file_mime_type ?? "").toLowerCase().startsWith("image/"));
                          const temporalHits = c ? detectTemporalSnippets(c.text_snippets) : [];
                          const warn = temporalHits.length > 0 && !campanhaTemGatilhoTemporal;
                          return (
                            <button
                              key={p.creative_id}
                              type="button"
                              onClick={() => setLightboxCreativeId(p.creative_id)}
                              className={cn(
                                "group text-left border rounded-lg p-2 w-[180px] bg-card/40 cursor-pointer transition hover:bg-card/70 hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/40",
                                warn && "border-amber-500/60",
                              )}
                              title="Ampliar peça"
                            >
                              <div className="relative">
                                {isImage && c?.file_url ? (
                                  <img src={c.file_url} alt={c.name ?? ""} className="w-full h-24 object-cover rounded mb-2" />
                                ) : (
                                  <div className="w-full h-24 rounded mb-2 bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                                    {(c?.type ?? "?").toString()}
                                  </div>
                                )}
                                <Maximize2 className="h-3.5 w-3.5 absolute top-1 right-1 text-white/90 drop-shadow opacity-0 group-hover:opacity-100 transition" />
                              </div>
                              <div className="text-xs font-medium truncate" title={c?.name ?? p.creative_id}>{c?.name ?? p.creative_id.slice(0, 8)}</div>
                              {warn && (
                                <Badge className="mt-1 bg-amber-500/15 text-amber-300 border-amber-500/40 text-[10px] gap-1">
                                  <AlertTriangle className="h-3 w-3" /> texto temporal na imagem
                                </Badge>
                              )}
                              {p.motivo_escolha && (
                                <div className="text-[11px] text-muted-foreground mt-1 line-clamp-3">{p.motivo_escolha}</div>
                              )}
                            </button>
                          );
                        })}
                        {(adset.pecas ?? []).length === 0 && (
                          <span className="text-xs text-muted-foreground">(sem peças)</span>
                        )}
                      </div>
                    </div>

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
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {CTA_OPTIONS.includes(v.cta) ? null : (
                                          <SelectItem value={v.cta}>{v.cta}</SelectItem>
                                        )}
                                        {CTA_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="text-sm font-medium">{v.headline || <span className="text-muted-foreground italic">(sem headline)</span>}</div>
                                  <div className="text-xs text-muted-foreground whitespace-pre-wrap">{v.corpo || "(sem corpo)"}</div>
                                  <div className="text-[11px] text-muted-foreground">CTA: {v.cta}</div>
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
                    src={lightboxCreative.file_url}
                    alt={lightboxCreative.name ?? ""}
                    className="w-full h-full object-contain"
                  />
                ) : lightboxIsVideo && lightboxCreative.file_url ? (
                  <video
                    controls
                    playsInline
                    src={lightboxCreative.file_url}
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

      {/* TEMP DIAG — REMOVER */}
      <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Diag resolução de imagem (temporário)</DialogTitle>
          </DialogHeader>
          <pre className="text-xs font-mono bg-muted/40 p-3 rounded max-h-[70vh] overflow-auto whitespace-pre-wrap break-all">
{diagResult}
          </pre>
        </DialogContent>
      </Dialog>
      {/* END TEMP DIAG */}
    </Sheet>
  );
}
