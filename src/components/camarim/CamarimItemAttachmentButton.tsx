import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Paperclip, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEIC_ACCEPT, isHeicFile, normalizeImageFile } from "@/lib/image-upload";
import { uploadToCompanyBucket } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  itemId: string;
  /** When true, shows just the icon (compact mode for lists). */
  iconOnly?: boolean;
  className?: string;
  /** Sessão do item — necessária para o path do anexo (ativa o botão de anexar). */
  sessionId?: string;
  /** Quando false, esconde o botão de abrir (item ainda sem anexo). */
  hasAttachment?: boolean;
  onAttached?: () => void;
}



async function getFreshAccessToken() {
  let { data: sessionData } = await supabase.auth.getSession();
  const expiresAt = sessionData.session?.expires_at ? sessionData.session.expires_at * 1000 : 0;

  if (!sessionData.session?.access_token || expiresAt - Date.now() < 60_000) {
    const refreshed = await supabase.auth.refreshSession();
    sessionData = refreshed.data;
  }

  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Volta a iniciar sessão.");
  return token;
}

/**
 * Botão que abre numa nova aba a fatura/talão anexo do item de camarim.
 * Vai buscar o primeiro documento associado e gera um signed URL (1h).
 * Quando recebe `sessionId`, mostra também um botão de ANEXAR ficheiro a um
 * item já existente (HEIC de iPhone é convertido para JPEG antes do upload).
 */
export function CamarimItemAttachmentButton({ itemId, iconOnly, className, sessionId, onAttached }: Props) {
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const attach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!original || !sessionId) return;
    setUploading(true);
    try {
      let file = original;
      if (isHeicFile(original)) {
        toast({ title: "A converter foto…", description: "HEIC do iPhone → JPEG." });
        file = await normalizeImageFile(original);
      }
      const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase();
      const ext = /^[a-z0-9]{2,5}$/.test(rawExt) ? rawExt : "jpg";
      const { error: upErr, path } = await uploadToCompanyBucket(
        "camarim-documents",
        `${sessionId}/${itemId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
        file,
        { contentType: file.type || "application/octet-stream", upsert: true },
      );
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("camarim_item_documents" as any).insert({
        item_id: itemId,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        document_source: "upload",
        created_by: user?.id ?? null,
      } as any);
      if (insErr) {
        await supabase.storage.from("camarim-documents").remove([path]);
        throw insErr;
      }
      await supabase.from("camarim_items" as any).update({ has_document: true }).eq("id", itemId);
      toast({ title: "Anexo gravado" });
      onAttached?.();
    } catch (err: any) {
      console.error("[camarim attach] failed", err);
      toast({
        variant: "destructive",
        title: "Anexo não foi gravado",
        description: err?.message ?? "Falha desconhecida ao anexar o ficheiro.",
      });
    } finally {
      setUploading(false);
    }
  };


  const open = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setBusy(true);
    try {
      const { data: docs, error } = await supabase
        .from("camarim_item_documents" as any)
        .select("id,file_path,mime_type,file_name")
        .eq("item_id", itemId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const doc = (docs ?? [])[0] as any;
      if (!doc) {
        toast({ variant: "destructive", title: "Sem anexo", description: "Este item não tem fatura/talão anexo." });
        return;
      }
      let token = await getFreshAccessToken();

      let response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-attachment-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ kind: "camarim_item_document", documentId: doc.id, mode: "download" }),
      });
      if (response.status === 401) {
        const refreshed = await supabase.auth.refreshSession();
        token = refreshed.data.session?.access_token ?? "";
        if (token) {
          response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-attachment-url`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ kind: "camarim_item_document", documentId: doc.id, mode: "download" }),
          });
        }
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Não foi possível abrir o anexo.");
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err: any) {
      console.error(err);
      toast({ variant: "destructive", title: "Erro a abrir anexo", description: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-0.5">
      <Button
        type="button"
        size={iconOnly ? "icon" : "sm"}
        variant="ghost"
        onClick={open}
        disabled={busy}
        className={cn(iconOnly ? "h-7 w-7" : "h-7 px-2", className)}
        title="Abrir fatura/talão"
        aria-label="Abrir fatura/talão"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        {!iconOnly && <span className="ml-1.5 text-xs">Fatura</span>}
      </Button>
      {sessionId && (
        <>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              fileRef.current?.click();
            }}
            disabled={uploading}
            className="h-7 w-7"
            title="Anexar fatura/talão"
            aria-label="Anexar fatura/talão"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept={`image/*,application/pdf,${HEIC_ACCEPT}`}
            onChange={attach}
            onClick={(e) => e.stopPropagation()}
          />
        </>
      )}
    </span>
  );
}

