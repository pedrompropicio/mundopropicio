import { isHeicFile, normalizeImageFile, HEIC_ACCEPT } from "@/lib/image-upload";
import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MARKETING_BUCKET } from "../constants";
import { randomId } from "../lib/slug";

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  label: string;
  hint?: string;
}

export function MultiImageUploader({ value, onChange, label, hint }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList) => {
    setUploading(true);
    const next: string[] = [...value];
    try {
      for (const picked of Array.from(files)) {
        let file = picked;
        if (isHeicFile(picked)) {
          try {
            file = await normalizeImageFile(picked);
          } catch (err: any) {
            toast.error(`${picked.name}: ${err.message}`);
            continue;
          }
        }
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name}: não é imagem.`);
          continue;
        }

        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name}: > 10MB.`);
          continue;
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const path = `${randomId()}-${Date.now()}-${safeName}`;
        const { error } = await supabase.storage
          .from(MARKETING_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
          toast.error(`${file.name}: ${error.message}`);
          continue;
        }
        const { data } = supabase.storage.from(MARKETING_BUCKET).getPublicUrl(path);
        next.push(data.publicUrl);
      }
      onChange(next);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (idx: number) => {
    const next = [...value];
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {value.map((url, idx) => (
          <div
            key={`${url}-${idx}`}
            className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted/30"
          >
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(idx)}
              className="absolute right-1 top-1 rounded bg-background/80 p-1 text-muted-foreground hover:text-destructive"
              title="Remover"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-600"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Upload className="h-5 w-5" />
          )}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,image/heic,image/heif,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) void handleFiles(e.target.files);
        }}
      />
    </div>
  );
}
