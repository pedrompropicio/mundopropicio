import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Paperclip, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  itemId: string;
  /** When true, shows just the icon (compact mode for lists). */
  iconOnly?: boolean;
  className?: string;
}

/**
 * Botão que abre numa nova aba a fatura/talão anexo do item de camarim.
 * Vai buscar o primeiro documento associado e gera um signed URL (1h).
 * Se o item não tiver anexo, fica desativado com tooltip.
 */
export function CamarimItemAttachmentButton({ itemId, iconOnly, className }: Props) {
  const [busy, setBusy] = useState(false);

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
      const { data: signed, error: signErr } = await supabase.functions.invoke("resolve-attachment-url", {
        body: { kind: "camarim_item_document", documentId: doc.id },
      });
      if (signErr || !(signed as any)?.signedUrl) throw signErr ?? new Error("Não foi possível gerar link.");
      window.open((signed as any).signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      console.error(err);
      toast({ variant: "destructive", title: "Erro a abrir anexo", description: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
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
  );
}
