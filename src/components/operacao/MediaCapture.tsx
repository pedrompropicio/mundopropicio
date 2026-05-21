import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, X, Loader2, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";


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

export function MediaCapture({ companyId, eventId, registroId, onChange, value }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
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
        if (upErr) { console.error(upErr); continue; }

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
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
        {uploading ? "A enviar..." : "Foto ou vídeo"}
      </Button>
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {value.map((m, i) => (
            <MediaThumb
              key={i}
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
  const path = media.thumbnail_url ?? media.file_url;
  if (!url) {
    supabase.storage.from("operacao-media").createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }
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
