// D-ERP277 — vídeos de uma edição: link (YouTube/Instagram/Vimeo) ou ficheiro enviado (provider "upload").
// Remover/substituir só tira a referência; o ficheiro fica no Storage.
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImageIcon, Link2, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentCompanyId } from "@/hooks/useCompany";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  detectVideoProvider, EDITION_BUCKET, editionPhotoPath, editionVideoPath, EditionVideo, toWebp,
  uploadWithProgress, validateVideoFile, VIDEO_ACCEPT, VIDEO_BUCKET,
} from "@/lib/newgang-media";

type Props = { videos: EditionVideo[]; year: number; brandKey: string; onSave: (v: EditionVideo[]) => void };

const move = <T,>(a: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= a.length) return a;
  const n = [...a];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
};

export function EditionVideos({ videos, year, brandKey, onSave }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const posterRef = useRef<HTMLInputElement>(null);
  const target = useRef<number | null>(null); // índice a substituir (null = novo)
  const posterTarget = useRef<number>(0);
  const [pct, setPct] = useState<number | null>(null);

  const sendVideo = async (file: File | undefined) => {
    if (!file) return;
    const bad = validateVideoFile(file);
    if (bad) return toast.error(bad);
    const idx = target.current;
    try {
      const companyId = await getCurrentCompanyId();
      if (!companyId) throw new Error("Sem empresa ativa.");
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) throw new Error("Sessão expirada — volta a entrar.");
      const path = editionVideoPath(companyId, brandKey, year, crypto.randomUUID(), file.type);
      setPct(0);
      await uploadWithProgress({
        baseUrl: import.meta.env.VITE_SUPABASE_URL, apiKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        accessToken: s.session.access_token, bucket: VIDEO_BUCKET, path, file, contentType: file.type, onProgress: setPct,
      });
      const url = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path).data.publicUrl;
      const title = file.name.replace(/\.[^.]+$/, "");
      if (idx == null) onSave([...videos, { provider: "upload", url, title, poster_url: null }]);
      else onSave(videos.map((v, k) => (k === idx ? { provider: "upload", url, title: v.title || title, poster_url: v.poster_url ?? null } : v)));
      toast.success("Vídeo enviado.");
    } catch (e) {
      toast.error(`Falha no envio do vídeo: ${(e as Error)?.message ?? e}`);
    } finally {
      setPct(null);
      target.current = null;
    }
  };

  const sendPoster = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("A capa tem de ser uma imagem.");
    const i = posterTarget.current;
    try {
      const companyId = await getCurrentCompanyId();
      if (!companyId) throw new Error("Sem empresa ativa.");
      const blob = await toWebp(file);
      const path = editionPhotoPath(companyId, brandKey, year, `poster-${crypto.randomUUID()}`);
      const { error } = await supabase.storage.from(EDITION_BUCKET).upload(path, blob, { contentType: "image/webp", upsert: false });
      if (error) throw error;
      const url = supabase.storage.from(EDITION_BUCKET).getPublicUrl(path).data.publicUrl;
      onSave(videos.map((v, k) => (k === i ? { ...v, poster_url: url } : v)));
    } catch (e) {
      toast.error(`Falha no upload da capa: ${(e as Error)?.message ?? e}`);
    }
  };

  const replaceWithLink = (i: number) => {
    const raw = prompt("Novo link (YouTube, Instagram ou Vimeo):");
    if (!raw) return;
    const provider = detectVideoProvider(raw);
    if (!provider) return toast.error("URL inválido: só YouTube, Instagram ou Vimeo.");
    onSave(videos.map((v, k) => (k === i ? { provider, url: raw.trim(), title: v.title ?? null } : v)));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Vídeos (o 1.º é o principal) — enviar até 500 MB, MP4/WebM/MOV</Label>
        <Button size="sm" variant="outline" disabled={pct != null} onClick={() => { target.current = null; fileRef.current?.click(); }}>
          <Upload className="h-4 w-4" /> Enviar vídeo
        </Button>
      </div>
      <input ref={fileRef} type="file" accept={VIDEO_ACCEPT} hidden onChange={(x) => { sendVideo(x.target.files?.[0]); x.target.value = ""; }} />
      <input ref={posterRef} type="file" accept="image/*" hidden onChange={(x) => { sendPoster(x.target.files?.[0]); x.target.value = ""; }} />
      {pct != null && <div className="space-y-1"><Progress value={pct} /><p className="text-xs text-muted-foreground">A enviar… {pct}%</p></div>}

      {videos.map((v, i) => (
        <div key={`${v.url}-${i}`} className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm">
          <Badge variant={i === 0 ? "default" : "outline"}>{v.provider === "upload" ? "ficheiro" : v.provider}</Badge>
          {v.provider === "upload" && (v.poster_url
            ? <img src={v.poster_url} alt="Capa" className="h-10 w-16 rounded object-cover" />
            : <span className="text-xs text-muted-foreground">sem capa (usa a da edição)</span>)}
          <Input className="min-w-[160px] flex-1" defaultValue={v.title ?? ""} placeholder="Título"
            onBlur={(x) => { const t = x.target.value.trim() || null; if (t !== (v.title ?? null)) onSave(videos.map((w, k) => (k === i ? { ...w, title: t } : w))); }} />
          <a href={v.url} target="_blank" rel="noreferrer" className="max-w-[180px] truncate text-xs underline">abrir</a>
          {v.provider === "upload" && (
            <>
              <Button size="icon" variant="ghost" aria-label="Capa" onClick={() => { posterTarget.current = i; posterRef.current?.click(); }}><ImageIcon className="h-3 w-3" /></Button>
              {v.poster_url && <Button size="icon" variant="ghost" aria-label="Tirar capa" onClick={() => onSave(videos.map((w, k) => (k === i ? { ...w, poster_url: null } : w)))}><X className="h-3 w-3" /></Button>}
            </>
          )}
          <Button size="icon" variant="ghost" aria-label="Substituir por ficheiro" disabled={pct != null} onClick={() => { target.current = i; fileRef.current?.click(); }}><RefreshCw className="h-3 w-3" /></Button>
          <Button size="icon" variant="ghost" aria-label="Substituir por link" onClick={() => replaceWithLink(i)}><Link2 className="h-3 w-3" /></Button>
          <Button size="icon" variant="ghost" aria-label="Subir" onClick={() => onSave(move(videos, i, -1))}><ArrowUp className="h-3 w-3" /></Button>
          <Button size="icon" variant="ghost" aria-label="Descer" onClick={() => onSave(move(videos, i, 1))}><ArrowDown className="h-3 w-3" /></Button>
          <Button size="icon" variant="ghost" aria-label="Remover vídeo" onClick={() => confirm("Remover este vídeo da edição? O ficheiro fica guardado.") && onSave(videos.filter((_, k) => k !== i))}><Trash2 className="h-3 w-3 text-destructive" /></Button>
        </div>
      ))}
    </div>
  );
}
