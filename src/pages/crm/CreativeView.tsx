import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Trash2,
  Sparkles,
  ExternalLink,
  X,
  Image as ImageIcon,
  Video,
  RefreshCw,
  ShieldCheck,
  Eye,
  Palette,
  MessageSquare,
  Award,
  AlertCircle,
  Lightbulb,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { classifyCreative, metaAdsManagerUrl } from "@/lib/creative-media";

const CTA_OPTIONS = [
  { v: "GET_TICKETS", l: "Comprar Bilhetes" },
  { v: "SHOP_NOW", l: "Comprar Agora" },
  { v: "LEARN_MORE", l: "Saber Mais" },
  { v: "SIGN_UP", l: "Inscrever-se" },
  { v: "BOOK_TRAVEL", l: "Reservar" },
  { v: "DOWNLOAD", l: "Descarregar" },
  { v: "WATCH_MORE", l: "Ver Mais" },
];

function ctaLabel(v: string | null): string {
  return CTA_OPTIONS.find((o) => o.v === v)?.l ?? v ?? "—";
}

export default function CrmCreativeView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editHeadline, setEditHeadline] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCta, setEditCta] = useState("GET_TICKETS");
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-creative", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_creatives")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // ad_account_id da conexão ativa — usado só para o link "Abrir no Ads Manager"
  // (nível-conta; o Ads Manager não tem deep-link fiável por creative_id).
  const { data: adAccountId } = useQuery({
    queryKey: ["crm-active-ad-account"],
    queryFn: async () => {
      const { data: c, error } = await (supabase as any)
        .schema("crm")
        .from("ad_platform_connections")
        .select("selected_ad_account_id")
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return (c?.selected_ad_account_id as string | null) ?? null;
    },
  });

  useEffect(() => {
    if (data && editOpen) {
      setEditName(data.name ?? "");
      setEditDescription(data.description ?? "");
      setEditHeadline(data.headline ?? "");
      setEditBody(data.body ?? "");
      setEditCta(data.cta_type ?? "GET_TICKETS");
      setEditLinkUrl(data.link_url ?? "");
      setEditTags(data.tags ?? []);
    }
  }, [data, editOpen]);

  const handleSaveEdit = async () => {
    if (!id || !editName.trim()) return;
    setActionLoading(true);
    try {
      const { error } = await (supabase as any)
        .schema("crm")
        .from("meta_creatives")
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
          headline: editHeadline.trim() || null,
          body: editBody.trim() || null,
          cta_type: editCta,
          link_url: editLinkUrl.trim() || null,
          tags: editTags.length ? editTags : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      toast.success("Criativo atualizado");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["crm-creative", id] });
      qc.invalidateQueries({ queryKey: ["crm-creatives-list"] });
    } catch (e: any) {
      toast.error("Falha a guardar", { description: e?.message ?? String(e) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !data) return;
    setActionLoading(true);
    try {
      const { error: delErr } = await (supabase as any)
        .schema("crm")
        .from("meta_creatives")
        .delete()
        .eq("id", id);
      if (delErr) throw delErr;
      if (data.storage_path) {
        await supabase.storage
          .from(data.storage_bucket || "crm-meta-creatives")
          .remove([data.storage_path]);
      }
      toast.success("Criativo eliminado");
      qc.invalidateQueries({ queryKey: ["crm-creatives-list"] });
      navigate("/audience/creatives");
    } catch (e: any) {
      toast.error("Falha ao eliminar", { description: e?.message ?? String(e) });
      setActionLoading(false);
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || editTags.includes(t)) return;
    setEditTags([...editTags, t]);
    setTagInput("");
  };

  const handleAnalyze = async () => {
    if (!id || !data) return;
    if (data.type !== "image" && data.type !== "video") {
      toast.error("Tipo de criativo não suportado para análise IA.");
      return;
    }
    setIsAnalyzing(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke(
        "crm-meta-creative-analyze",
        { body: { creative_id: id } }
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
      toast.success("Análise concluída");
      qc.invalidateQueries({ queryKey: ["crm-creative", id] });
    } catch (e: any) {
      toast.error("Falha na análise", { description: e?.message ?? String(e) });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Card className="p-6 text-sm text-destructive">
        Criativo não encontrado.
      </Card>
    );
  }

  const isVideo = data.type === "video";
  const kind = classifyCreative(data.file_url, data.type, data.file_mime_type);
  const adsManagerHref = metaAdsManagerUrl(adAccountId);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/audience/creatives")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Criativos
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">{data.name}</h1>
            <Badge
              variant="outline"
              className={
                isVideo
                  ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                  : "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
              }
            >
              {isVideo ? <Video className="h-3 w-3 mr-1" /> : <ImageIcon className="h-3 w-3 mr-1" />}
              {isVideo ? "Vídeo" : "Imagem"}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Apagar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Preview */}
        <Card className="p-4 space-y-3">
          <div className="rounded-lg overflow-hidden bg-muted">
            {kind === "video" ? (
              <video src={data.file_url} controls className="w-full max-h-[500px] object-contain" />
            ) : kind === "thumbnail" ? (
              <div className="relative">
                <img
                  src={data.file_url}
                  alt={data.name}
                  className="w-full max-h-[500px] object-contain"
                />
                <Badge
                  variant="outline"
                  className="absolute top-2 left-2 bg-purple-500/20 text-purple-100 border-purple-400/40 backdrop-blur"
                >
                  <Video className="h-3 w-3 mr-1" /> Vídeo
                </Badge>
              </div>
            ) : kind === "image" ? (
              <img
                src={data.file_url}
                alt={data.name}
                className="w-full max-h-[500px] object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
                <div className="text-xs text-muted-foreground">Sem preview disponível</div>
              </div>
            )}
          </div>
          {kind === "thumbnail" && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1.5">
              <p className="text-[11px] leading-snug text-muted-foreground">
                Este criativo é um vídeo. O Meta fornece apenas a thumbnail — o vídeo
                reproduz-se no Ads Manager.
              </p>
              {adsManagerHref && (
                <a
                  href={adsManagerHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Pesquisa pelo nome do criativo no Ads Manager"
                  className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir no Ads Manager
                </a>
              )}
            </div>
          )}
          <div className="text-xs text-muted-foreground space-y-0.5">
            {data.width && data.height && (
              <div>
                Dimensões: <strong>{data.width}×{data.height}</strong>
              </div>
            )}
            {data.file_size_bytes && (
              <div>
                Tamanho: <strong>{(data.file_size_bytes / 1024 / 1024).toFixed(2)} MB</strong>
              </div>
            )}
            {data.duration_seconds && (
              <div>
                Duração: <strong>{data.duration_seconds.toFixed(1)}s</strong>
              </div>
            )}
            {data.file_mime_type && (
              <div>
                Tipo: <strong>{data.file_mime_type}</strong>
              </div>
            )}
          </div>
        </Card>

        {/* Info cards */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-lg font-semibold mb-3">Texto do anúncio</h2>
            <div className="space-y-3">
              {data.headline && (
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Headline</div>
                  <div className="text-base font-medium">{data.headline}</div>
                </div>
              )}
              {data.body && (
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Body</div>
                  <p className="text-sm">{data.body}</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 border">
                  {ctaLabel(data.cta_type)}
                </Badge>
              </div>
              {data.link_url && (
                <a
                  href={data.link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-cyan-400 hover:underline truncate"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{data.display_link || data.link_url}</span>
                </a>
              )}
            </div>
          </Card>

          {data.tags && data.tags.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold mb-2">Tags</h2>
              <div className="flex flex-wrap gap-1.5">
                {data.tags.map((t: string) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5 border-cyan-500/30 bg-cyan-500/[0.03]">
            <div className="flex items-start justify-between gap-2 mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-400" /> Análise IA
              </h2>
              {data.analyzed_at && (
                <Button variant="ghost" size="sm" onClick={handleAnalyze} disabled={isAnalyzing}>
                  {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                  Re-analisar
                </Button>
              )}
            </div>

            {isAnalyzing && (
              <div className="py-8 flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
                <p>A analisar criativo… (15–30s)</p>
              </div>
            )}

            {!isAnalyzing && !data.analyzed_at && (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  {isVideo
                    ? "A IA vai avaliar hook, pacing, CTA, áudio, transcrição e alinhamento com o copy. Recebe scores 0–100, issues e sugestões."
                    : "A IA vai avaliar Meta compliance, qualidade visual, clareza da mensagem, presença de CTA e branding. Recebe score 0–100, issues e sugestões concretas."}
                </p>
                <Button
                  onClick={handleAnalyze}
                  className="bg-cyan-500 hover:bg-cyan-600 text-white"
                >
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Analisar com IA
                </Button>
              </>
            )}

            {!isAnalyzing && data.analyzed_at && data.analysis_jsonb && (
              <AnalysisRender analysis={data.analysis_jsonb} analyzedAt={data.analyzed_at} model={data.analysis_model} type={data.type} />
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold mb-2">Estratégias usando este criativo</h2>
            <p className="text-xs text-muted-foreground">
              Nenhuma estratégia associada ainda.
            </p>
          </Card>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar criativo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex justify-between">
                <span>Headline</span>
                <span className="text-[10px] text-muted-foreground">{editHeadline.length}/40</span>
              </Label>
              <Input
                value={editHeadline}
                maxLength={40}
                onChange={(e) => setEditHeadline(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex justify-between">
                <span>Body</span>
                <span className="text-[10px] text-muted-foreground">{editBody.length}/125</span>
              </Label>
              <Textarea
                value={editBody}
                maxLength={125}
                onChange={(e) => setEditBody(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>CTA</Label>
              <Select value={editCta} onValueChange={setEditCta}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CTA_OPTIONS.map((o) => (
                    <SelectItem key={o.v} value={o.v}>
                      {o.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Link URL</Label>
              <Input
                type="url"
                value={editLinkUrl}
                onChange={(e) => setEditLinkUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Escreve e Enter"
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  Adicionar
                </Button>
              </div>
              {editTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {editTags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1">
                      {t}
                      <button
                        onClick={() => setEditTags(editTags.filter((x) => x !== t))}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={actionLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={actionLoading || !editName.trim()}
            >
              {actionLoading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar criativo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o criativo e o ficheiro associado de forma permanente. Não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={actionLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apagar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function scoreColor(score: number): string {
  // analysis renderer helpers
  if (score >= 80) return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
  if (score >= 60) return "text-amber-400 border-amber-500/40 bg-amber-500/10";
  if (score >= 40) return "text-orange-400 border-orange-500/40 bg-orange-500/10";
  return "text-red-400 border-red-500/40 bg-red-500/10";
}

const verdictMeta: Record<string, { label: string; color: string; icon: any }> = {
  ready: { label: "Pronto para usar", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/40", icon: CheckCircle2 },
  needs_minor_changes: { label: "Pequenos ajustes", color: "text-amber-400 bg-amber-500/10 border-amber-500/40", icon: AlertCircle },
  needs_major_changes: { label: "Grandes mudanças", color: "text-orange-400 bg-orange-500/10 border-orange-500/40", icon: AlertCircle },
  reject: { label: "Não usar", color: "text-red-400 bg-red-500/10 border-red-500/40", icon: XCircle },
};

const severityColor: Record<string, string> = {
  high: "border-red-500/40 bg-red-500/10 text-red-400",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  low: "border-blue-500/40 bg-blue-500/10 text-blue-400",
};

function AnalysisRender({ analysis, analyzedAt, model, type }: { analysis: any; analyzedAt: string; model: string | null; type: string }) {
  const scores = analysis?.scores ?? {};
  const detected = analysis?.detected ?? {};
  const issues: any[] = analysis?.issues ?? [];
  const suggestions: any[] = analysis?.suggestions ?? [];
  const alignment = analysis?.alignment_with_copy ?? {};
  const verdict = analysis?.verdict ?? "needs_minor_changes";
  const vMeta = verdictMeta[verdict] ?? verdictMeta.needs_minor_changes;
  const VIcon = vMeta.icon;
  const isVideo = type === "video";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge className={cn("text-sm px-3 py-1.5 border", vMeta.color)}>
          <VIcon className="h-4 w-4 mr-1.5" /> {vMeta.label}
        </Badge>
        <div className={cn("rounded-full px-3 py-1.5 text-lg font-bold border", scoreColor(scores.overall ?? 0))}>
          {scores.overall ?? "—"} / 100
        </div>
      </div>

      {analysis.verdict_reason && (
        <p className="text-sm text-muted-foreground italic">{analysis.verdict_reason}</p>
      )}

      {isVideo ? (
        <VideoAnalysisBody scores={scores} detected={detected} />
      ) : (
        <ImageAnalysisBody scores={scores} detected={detected} />
      )}

      {issues.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> Problemas ({issues.length})
          </div>
          {issues.map((iss, i) => (
            <div key={i} className={cn("rounded border p-2.5", severityColor[iss.severity] ?? severityColor.low)}>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="text-[9px] uppercase shrink-0 mt-0.5">{iss.severity}</Badge>
                <div className="text-xs min-w-0">
                  <div className="font-medium">{iss.title}</div>
                  <div className="text-muted-foreground mt-0.5">{iss.description}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5" /> Sugestões ({suggestions.length})
          </div>
          {suggestions.map((sug, i) => (
            <div key={i} className="rounded border border-border p-2.5 bg-muted/20">
              <div className="text-xs">
                <div className="font-medium flex items-center gap-1.5">
                  {i + 1}. {sug.title}
                  {sug.priority === "high" && <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-400 border-red-500/30">prioridade alta</Badge>}
                </div>
                <div className="text-muted-foreground mt-1">{sug.description}</div>
                {sug.impact && <div className="text-cyan-400 mt-1 text-[11px]"><strong>Impacto:</strong> {sug.impact}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {(alignment.headline_match != null || alignment.body_match != null) && (
        <div className="rounded-lg border border-border p-3 text-xs space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Alinhamento com o texto definido</div>
          <div className="grid grid-cols-2 gap-2">
            <div>Headline: <strong className={cn(scoreColor(alignment.headline_match ?? 0), "px-1.5 py-0.5 rounded")}>{alignment.headline_match}/100</strong></div>
            <div>Body: <strong className={cn(scoreColor(alignment.body_match ?? 0), "px-1.5 py-0.5 rounded")}>{alignment.body_match}/100</strong></div>
          </div>
          {alignment.notes && <p className="text-muted-foreground mt-1">{alignment.notes}</p>}
        </div>
      )}

      <div className="text-[10px] text-muted-foreground pt-2 border-t border-border">
        Analisado por {model ?? "IA"} em {new Date(analyzedAt).toLocaleString("pt-PT")}
      </div>
    </div>
  );
}

function ImageAnalysisBody({ scores, detected }: { scores: any; detected: any }) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <SubScore label="Meta Compliance" icon={ShieldCheck} score={scores.meta_compliance} />
        <SubScore label="Visual" icon={Eye} score={scores.visual_quality} />
        <SubScore label="Mensagem" icon={MessageSquare} score={scores.message_clarity} />
        <SubScore label="CTA" icon={Award} score={scores.cta_presence} />
        <SubScore label="Branding" icon={Palette} score={scores.branding} />
      </div>

      <div className="rounded-lg border border-border p-3 space-y-1.5 text-xs">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">O que a IA detetou</div>
        {detected.primary_message && <div><strong>Mensagem principal:</strong> {detected.primary_message}</div>}
        {detected.text_in_image_pct != null && (
          <div>
            <strong>Texto na imagem:</strong> ~{detected.text_in_image_pct}%
            {detected.text_in_image_pct > 20 && <span className="text-amber-400 ml-1">⚠️ acima do recomendado</span>}
          </div>
        )}
        {detected.text_content && <div><strong>Texto visível:</strong> "{detected.text_content}"</div>}
        {detected.has_cta != null && (
          <div>
            <strong>CTA na imagem:</strong> {detected.has_cta ? `✓ "${detected.cta_text ?? "sim"}"` : "✗ não detetado"}
          </div>
        )}
        {detected.brand_visibility && (
          <div><strong>Visibilidade da marca:</strong> {detected.brand_visibility}</div>
        )}
        {detected.event_type_detected && (
          <div><strong>Tipo de evento:</strong> {detected.event_type_detected}</div>
        )}
        {detected.composition_quality && (
          <div><strong>Composição:</strong> {detected.composition_quality}</div>
        )}
      </div>
    </>
  );
}

function VideoAnalysisBody({ scores, detected }: { scores: any; detected: any }) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const transcript: string = detected.voiceover_transcript ?? "";
  const longTranscript = transcript.length > 300;
  const transcriptDisplay = !longTranscript || transcriptOpen ? transcript : transcript.slice(0, 300) + "…";
  const artists: string[] = Array.isArray(detected.detected_artists) ? detected.detected_artists.filter(Boolean) : [];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <SubScore label="Hook" icon={Sparkles} score={scores.hook} />
        <SubScore label="Pacing" icon={RefreshCw} score={scores.pacing} />
        <SubScore label="CTA" icon={Award} score={scores.cta_clarity} />
        <SubScore label="Áudio" icon={MessageSquare} score={scores.audio_quality} />
        <SubScore label="Compliance" icon={ShieldCheck} score={scores.meta_compliance} />
        <SubScore label="Alinhamento" icon={Palette} score={scores.alignment_with_copy} />
      </div>

      {detected.hook_description && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/[0.05] p-3">
          <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-medium mb-1">Hook (primeiros 3s)</div>
          <p className="text-sm">{detected.hook_description}</p>
        </div>
      )}

      {transcript && (
        <div className="rounded-lg border border-border p-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Transcrição</div>
          <p className="text-xs whitespace-pre-wrap">{transcriptDisplay}</p>
          {longTranscript && (
            <button
              onClick={() => setTranscriptOpen((v) => !v)}
              className="text-[11px] text-cyan-400 hover:underline"
            >
              {transcriptOpen ? "Ver menos" : "Ver mais"}
            </button>
          )}
        </div>
      )}

      {(detected.has_music || detected.music_genre) && (
        <div className="rounded-lg border border-border p-3 text-xs">
          <strong>Música:</strong> {detected.music_genre || (detected.has_music ? "sim" : "—")}
          {detected.has_voiceover != null && (
            <span className="ml-3"><strong>Locução:</strong> {detected.has_voiceover ? "sim" : "não"}</span>
          )}
        </div>
      )}

      {artists.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Artistas detetados</div>
          <div className="flex flex-wrap gap-1.5">
            {artists.map((a) => (
              <Badge key={a} variant="secondary">{a}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {detected.cuts_count_estimate != null && (
          <div><div className="text-muted-foreground text-[10px]">Cortes</div><div className="font-bold">{detected.cuts_count_estimate}</div></div>
        )}
        {detected.text_on_screen_pct_estimate != null && (
          <div>
            <div className="text-muted-foreground text-[10px]">Texto on-screen</div>
            <div className="font-bold">~{detected.text_on_screen_pct_estimate}%
              {detected.text_on_screen_pct_estimate > 20 && <span className="text-amber-400 ml-1">⚠️</span>}
            </div>
          </div>
        )}
        {detected.cta_appears_at_second != null && (
          <div><div className="text-muted-foreground text-[10px]">CTA aparece</div><div className="font-bold">{detected.cta_appears_at_second}s</div></div>
        )}
        {detected.production_quality && (
          <div><div className="text-muted-foreground text-[10px]">Produção</div><div className="font-bold capitalize">{detected.production_quality}</div></div>
        )}
        {detected.detected_event_type && (
          <div><div className="text-muted-foreground text-[10px]">Tipo</div><div className="font-bold capitalize">{detected.detected_event_type}</div></div>
        )}
      </div>

      {Array.isArray(detected.text_content_snippets) && detected.text_content_snippets.length > 0 && (
        <div className="rounded-lg border border-border p-3 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Texto on-screen</div>
          <div className="flex flex-wrap gap-1.5">
            {detected.text_content_snippets.map((s: string, i: number) => (
              <Badge key={i} variant="outline" className="text-[10px]">"{s}"</Badge>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function SubScore({ label, icon: Icon, score }: { label: string; icon: any; score: number | undefined }) {
  return (
    <div className={cn("rounded border px-2 py-1.5 text-center", scoreColor(score ?? 0))}>
      <Icon className="h-3.5 w-3.5 mx-auto mb-0.5 opacity-70" />
      <div className="text-base font-bold leading-tight">{score ?? "—"}</div>
      <div className="text-[9px] uppercase tracking-wider opacity-70 leading-tight">{label}</div>
    </div>
  );
}
