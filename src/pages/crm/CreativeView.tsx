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
            {isVideo ? (
              <video src={data.file_url} controls className="w-full max-h-[500px] object-contain" />
            ) : (
              <img
                src={data.file_url}
                alt={data.name}
                className="w-full max-h-[500px] object-contain"
              />
            )}
          </div>
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
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" /> Análise IA
            </h2>
            {!data.analyzed_at ? (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  Em breve poderás analisar este criativo com IA para receber score Meta compliance,
                  sugestões de melhoria e crítica de design.
                </p>
                <Button disabled className="bg-cyan-500/40 cursor-not-allowed">
                  <Sparkles className="h-4 w-4 mr-1.5" /> Analisar com IA (em breve)
                </Button>
              </>
            ) : (
              <p className="text-sm">
                Análise feita em {new Date(data.analyzed_at).toLocaleDateString("pt-PT")}
              </p>
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
