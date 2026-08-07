import { isHeicFile, normalizeImageFile, HEIC_ACCEPT } from "@/lib/image-upload";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, X, Loader2, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOperacaoMediaUrl } from "@/lib/operacao-media";
import { toast } from "sonner";



export interface CapturedMedia {
  file_url: string;
  thumbnail_url: string | null;
  file_type: "photo" | "video";
}

interface Props {
  companyId: string;
  eventId: string;
  registroId: string;
  onChange: (media: CapturedMedia[]) => void;
  value: CapturedMedia[];
  onBusyChange?: (busy: boolean) => void;
}

async function videoFirstFrameDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);
    video.onloadeddata = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      } catch { resolve(null); }
    };
    video.onerror = () => resolve(null);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function MediaCapture({ companyId, eventId, registroId, onChange, value, onBusyChange }: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);


  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Check session antes de tentar uploadar
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Sessão expirada", {
        description: "Faz login novamente e tenta de novo.",
      });
      return;
    }

    setUploading(true);
    onBusyChange?.(true);
    const next: CapturedMedia[] = [...value];
    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");
        const ext = file.name.split(".").pop()?.toLowerCase() || (isVideo ? "mp4" : "jpg");
        const id = crypto.randomUUID();
        const path = `${companyId}/${eventId}/${registroId}/${id}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("operacao-media")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          console.error("Storage upload failed:", upErr, {
            path,
            type: file.type,
            size: file.size,
            userId: session.user.id,
            hasSession: !!session,
          });
          toast.error("Erro ao enviar foto", {
            description: upErr.message || "Verifica permissões e tenta de novo.",
          });
          continue;
        }

        let thumbPath: string | null = null;
        if (isVideo) {
          const dataUrl = await videoFirstFrameDataUrl(file);
          if (dataUrl) {
            thumbPath = `${companyId}/${eventId}/${registroId}/${id}_thumb.jpg`;
            await supabase.storage
              .from("operacao-media")
              .upload(thumbPath, dataUrlToBlob(dataUrl), { contentType: "image/jpeg", upsert: false });
          }
        }
        next.push({
          file_url: path,
          thumbnail_url: thumbPath,
          file_type: isVideo ? "video" : "photo",
        });
      }
      onChange(next);
    } finally {
      setUploading(false);
      onBusyChange?.(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
          Câmera
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => galleryInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ImagePlus className="h-4 w-4 mr-2" />}
          Galeria
        </Button>
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {value.map((m, i) => (
            <MediaThumb
              key={m.file_url}
              media={m}
              onRemove={() => onChange(value.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaThumb({ media, onRemove }: { media: CapturedMedia; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const path = media.thumbnail_url ?? media.file_url;
    resolveOperacaoMediaUrl({ path, registroId: media.file_url.split("/")[2] }).then((signedUrl) => {
      if (!cancelled && signedUrl) setUrl(signedUrl);
    });
    return () => { cancelled = true; };
  }, [media.file_url, media.thumbnail_url]);
  return (
    <div className="relative aspect-square rounded overflow-hidden bg-muted">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full animate-pulse" />
      )}
      {media.file_type === "video" && (
        <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1 rounded">VÍDEO</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-0.5"
        aria-label="Remover"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
