import { isHeicFile, normalizeImageFile, HEIC_ACCEPT } from "@/lib/image-upload";
import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MARKETING_BUCKET } from "../constants";
import { randomId } from "../lib/slug";

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
  aspectRatio?: string; // e.g. "16/9", "2/3"
  hint?: string;
}

export function ImageUploader({ value, onChange, label, aspectRatio = "16/9", hint }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (picked: File) => {
    let file = picked;
    if (isHeicFile(picked)) {
      setUploading(true);
      try {
        file = await normalizeImageFile(picked);
      } catch (err: any) {
        toast.error(err.message);
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Ficheiro inválido — só imagens.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Imagem demasiado grande (máx. 10MB).");
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = `${randomId()}-${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from(MARKETING_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from(MARKETING_BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Imagem carregada.");
    } catch (err: any) {
      toast.error(`Falha no upload: ${err.message ?? err}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div
        className="relative overflow-hidden rounded-md border border-dashed border-border bg-muted/30"
        style={{ aspectRatio }}
      >
        {value ? (
          <img src={value} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Sem imagem
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,image/heic,image/heif,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-4 w-4" />
          {value ? "Substituir" : "Upload"}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
            disabled={uploading}
          >
            <X className="h-4 w-4" />
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}
