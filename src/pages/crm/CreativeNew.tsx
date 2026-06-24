import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, X, Loader2, Image as ImageIcon, Video } from "lucide-react";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime";
const MAX_BYTES = 50 * 1024 * 1024;

const CTA_OPTIONS = [
  { v: "GET_TICKETS", l: "Comprar Bilhetes" },
  { v: "SHOP_NOW", l: "Comprar Agora" },
  { v: "LEARN_MORE", l: "Saber Mais" },
  { v: "SIGN_UP", l: "Inscrever-se" },
  { v: "BOOK_TRAVEL", l: "Reservar" },
  { v: "DOWNLOAD", l: "Descarregar" },
  { v: "WATCH_MORE", l: "Ver Mais" },
];

interface MediaMeta {
  width: number;
  height: number;
  duration: number | null;
  type: "image" | "video";
}

async function readMediaMeta(file: File): Promise<MediaMeta> {
  const isVideo = file.type.startsWith("video/");
  const url = URL.createObjectURL(file);
  try {
    if (isVideo) {
      return await new Promise<MediaMeta>((resolve, reject) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () =>
          resolve({
            width: v.videoWidth,
            height: v.videoHeight,
            duration: v.duration,
            type: "video",
          });
        v.onerror = () => reject(new Error("Falha a ler vídeo"));
        v.src = url;
      });
    }
    return await new Promise<MediaMeta>((resolve, reject) => {
      const i = new Image();
      i.onload = () =>
        resolve({ width: i.naturalWidth, height: i.naturalHeight, duration: null, type: "image" });
      i.onerror = () => reject(new Error("Falha a ler imagem"));
      i.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

export default function CrmCreativeNew() {
  const navigate = useNavigate();
  const { companyId } = useCompany();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<MediaMeta | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("GET_TICKETS");
  const [linkUrl, setLinkUrl] = useState("");
  const [displayLink, setDisplayLink] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [metaPush, setMetaPush] = useState<
    | { state: "idle" }
    | { state: "uploading" }
    | { state: "ok"; kind: "image" | "video"; id: string }
    | { state: "err"; msg: string; creativeId: string }
  >({ state: "idle" });

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChosen = async (f: File) => {
    if (f.size > MAX_BYTES) {
      toast.error("Arquivo demasiado grande (máx 50MB)");
      return;
    }
    if (!ACCEPT.split(",").includes(f.type)) {
      toast.error(`Tipo de arquivo não suportado: ${f.type}`);
      return;
    }
    try {
      const m = await readMediaMeta(f);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setMeta(m);
      if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
    } catch (e: any) {
      toast.error("Falha a ler metadados", { description: e?.message });
    }
  };

  const handleRemoveFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setMeta(null);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setTagInput("");
  };

  const handleSubmit = async () => {
    if (!file || !meta || !companyId) {
      toast.error("Arquivo ou empresa em falta");
      return;
    }
    if (!name.trim()) {
      toast.error("Nome obrigatório");
      return;
    }

    setUploading(true);
    setProgress(10);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${companyId}/${Date.now()}_${safeName}`;

      setProgress(25);
      const { error: upErr } = await supabase.storage
        .from("crm-meta-creatives")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        const raw = (upErr as any)?.message ?? String(upErr);
        const status = (upErr as any)?.statusCode ?? (upErr as any)?.status;
        const lower = raw.toLowerCase();
        let friendly = raw;
        if (lower.includes("payload too large") || lower.includes("exceeded the maximum") || String(status) === "413") {
          friendly = `Ficheiro demasiado grande (máx ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB)`;
        } else if (lower.includes("mime type") || lower.includes("not allowed") || lower.includes("invalid_mime")) {
          friendly = `Formato não suportado (${file.type || "desconhecido"})`;
        } else if (lower.includes("bucket not found") || lower.includes("not found")) {
          friendly = "Bucket de criativos não existe neste ambiente — contacta o admin";
        } else if (lower.includes("row-level security") || lower.includes("permission") || lower.includes("unauthorized") || String(status) === "401" || String(status) === "403") {
          friendly = "Sem permissão para fazer upload — verifica a tua sessão e empresa ativa";
        } else if (lower.includes("duplicate") || lower.includes("already exists")) {
          friendly = "Já existe um ficheiro com esse nome — tenta novamente";
        }
        throw new Error(friendly);
      }

      setProgress(70);
      const { data: pub } = supabase.storage
        .from("crm-meta-creatives")
        .getPublicUrl(path);
      const fileUrl = pub.publicUrl;

      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) throw new Error("Sem utilizador autenticado");

      setProgress(85);
      const { data: inserted, error: insErr } = await (supabase as any)
        .schema("crm")
        .from("meta_creatives")
        .insert({
          company_id: companyId,
          name: name.trim(),
          description: description.trim() || null,
          type: meta.type,
          storage_bucket: "crm-meta-creatives",
          storage_path: path,
          file_url: fileUrl,
          file_size_bytes: file.size,
          file_mime_type: file.type,
          width: meta.width,
          height: meta.height,
          duration_seconds: meta.duration,
          headline: headline.trim() || null,
          body: body.trim() || null,
          cta_type: cta,
          link_url: linkUrl.trim() || null,
          display_link: displayLink.trim() || null,
          tags: tags.length ? tags : null,
          created_by: userId,
        })
        .select("id")
        .single();
      if (insErr) {
        const raw = insErr.message ?? String(insErr);
        const lower = raw.toLowerCase();
        let friendly = raw;
        if (lower.includes("relation") && lower.includes("does not exist")) {
          friendly = "Tabela de criativos não existe neste ambiente — contacta o admin";
        } else if (lower.includes("row-level security") || lower.includes("permission denied")) {
          friendly = "Sem permissão para gravar — verifica a tua empresa ativa";
        }
        throw new Error(friendly);
      }

      setProgress(100);
      toast.success("Criativo guardado");

      // Empurra para o Meta (não bloqueia — fica re-tentável).
      setMetaPush({ state: "uploading" });
      try {
        const { data: pushRes, error: pushErr } = await supabase.functions.invoke(
          "crm-meta-upload-creative",
          { body: { company_id: companyId, creative_id: inserted.id } },
        );
        if (pushErr) throw pushErr;
        if (pushRes?.ok) {
          if (pushRes.type === "image") {
            setMetaPush({ state: "ok", kind: "image", id: pushRes.meta_image_hash });
            toast.success("No Meta (pronto a publicar)");
          } else {
            setMetaPush({ state: "ok", kind: "video", id: pushRes.meta_video_id });
            toast.success("No Meta — vídeo em processamento");
          }
        } else {
          const msg = pushRes?.error || "falhou";
          setMetaPush({ state: "err", msg, creativeId: inserted.id });
          toast.warning("Criativo guardado, mas falhou push para Meta", { description: msg });
        }
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        setMetaPush({ state: "err", msg, creativeId: inserted.id });
        toast.warning("Criativo guardado, mas falhou push para Meta", { description: msg });
      }
    } catch (e: any) {
      console.error("[creative/new] failed:", e);
      toast.error("Falha a guardar criativo", { description: e?.message ?? String(e) });
      setUploading(false);
      setProgress(0);
    }
  };

  const retryMetaPush = async (creativeIdToRetry: string) => {
    setMetaPush({ state: "uploading" });
    try {
      const { data: pushRes, error: pushErr } = await supabase.functions.invoke(
        "crm-meta-upload-creative",
        { body: { company_id: companyId, creative_id: creativeIdToRetry, force: true } },
      );
      if (pushErr) throw pushErr;
      if (pushRes?.ok) {
        if (pushRes.type === "image") {
          setMetaPush({ state: "ok", kind: "image", id: pushRes.meta_image_hash });
        } else {
          setMetaPush({ state: "ok", kind: "video", id: pushRes.meta_video_id });
        }
        toast.success("Push para Meta concluído");
      } else {
        setMetaPush({ state: "err", msg: pushRes?.error || "falhou", creativeId: creativeIdToRetry });
      }
    } catch (e: any) {
      setMetaPush({ state: "err", msg: e?.message ?? String(e), creativeId: creativeIdToRetry });
    }
  };

  const canSubmit = !!file && !!name.trim() && !uploading;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Novo criativo</h1>
        <p className="text-sm text-muted-foreground">
          Faz upload de imagem ou vídeo e preenche o copy do anúncio.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload */}
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold">Arquivo</h2>
          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFileChosen(f);
              }}
              className={`flex flex-col items-center justify-center h-[300px] border-2 border-dashed rounded-lg cursor-pointer transition-all ${
                dragOver
                  ? "border-cyan-400 bg-cyan-500/5"
                  : "border-border hover:border-cyan-500/50 hover:bg-muted/30"
              }`}
            >
              <Upload className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Arrasta ou clica para escolher</p>
              <p className="text-xs text-muted-foreground mt-1">
                JPG, PNG, WEBP, GIF, MP4, MOV · máx 50MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileChosen(f);
                  e.target.value = "";
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden bg-muted">
                {meta?.type === "video" ? (
                  <video
                    src={previewUrl ?? undefined}
                    controls
                    className="w-full max-h-[400px] object-contain"
                  />
                ) : (
                  <img
                    src={previewUrl ?? undefined}
                    alt="Preview"
                    className="w-full max-h-[400px] object-contain"
                  />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 truncate">
                  {meta?.type === "video" ? (
                    <Video className="h-3.5 w-3.5" />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5" />
                  )}
                  <span className="truncate">{file.name}</span>
                  <span>· {(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  {meta && (
                    <span>
                      · {meta.width}×{meta.height}
                      {meta.duration ? ` · ${meta.duration.toFixed(1)}s` : ""}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveFile}
                  disabled={uploading}
                  className="shrink-0"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Remover
                </Button>
              </div>
            </div>
          )}
          {uploading && (
            <div className="space-y-1">
              <Progress value={progress} />
              <p className="text-[11px] text-muted-foreground">A enviar… {progress}%</p>
            </div>
          )}
        </Card>

        {/* Form */}
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold">Detalhes do anúncio</h2>

          <div className="space-y-1.5">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} disabled={uploading} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Descrição interna</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={uploading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="headline" className="flex justify-between">
              <span>Headline</span>
              <span className="text-[10px] text-muted-foreground">{headline.length}/40</span>
            </Label>
            <Input
              id="headline"
              value={headline}
              maxLength={40}
              onChange={(e) => setHeadline(e.target.value)}
              disabled={uploading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="body" className="flex justify-between">
              <span>Body</span>
              <span className="text-[10px] text-muted-foreground">{body.length}/125</span>
            </Label>
            <Textarea
              id="body"
              value={body}
              maxLength={125}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              disabled={uploading}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Call to action</Label>
            <Select value={cta} onValueChange={setCta} disabled={uploading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CTA_OPTIONS.map((o) => (
                  <SelectItem key={o.v} value={o.v}>
                    {o.l}{" "}
                    <span className="text-[10px] text-muted-foreground ml-1">({o.v})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="linkUrl">Link URL</Label>
            <Input
              id="linkUrl"
              type="url"
              placeholder="https://..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              disabled={uploading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="displayLink">Display link</Label>
            <Input
              id="displayLink"
              placeholder="ex: mpgestaoeventos.com"
              value={displayLink}
              onChange={(e) => setDisplayLink(e.target.value)}
              disabled={uploading}
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
                disabled={uploading}
              />
              <Button type="button" variant="outline" onClick={addTag} disabled={uploading}>
                Adicionar
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <button
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      disabled={uploading}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/audience/creatives")} disabled={uploading}>
          Cancelar
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="bg-cyan-500 hover:bg-cyan-600 text-white"
        >
          {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
          Salvar criativo
        </Button>
      </div>
    </div>
  );
}
