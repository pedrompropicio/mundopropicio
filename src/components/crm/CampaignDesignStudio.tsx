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
  const lightboxIsImage = (() => {
    if (!lightboxCreative) return false;
    const t = (lightboxCreative.type ?? "").toLowerCase();
    const m = (lightboxCreative.file_mime_type ?? "").toLowerCase();
    return t.includes("image") || m.startsWith("image/");
  })();
  const lightboxIsVideo = (() => {
    if (!lightboxCreative) return false;
    const t = (lightboxCreative.type ?? "").toLowerCase();
    const m = (lightboxCreative.file_mime_type ?? "").toLowerCase();
    return t.includes("video") || m.startsWith("video/");
  })();

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
    </Sheet>
  );
}
