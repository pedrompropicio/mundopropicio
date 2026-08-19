/**
 * A&B — Anexos do evento (documentos de fecho do operador de bares).
 *
 * Replica exactamente o mecanismo dos anexos das linhas do BP
 * (event_forecast_attachments + bucket privado isolado por company_id +
 * abertura por signed URL). Não entra em nenhum cálculo, KPI ou sync com o BP.
 */
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  uploadToCompanyBucket,
  signedCompanyUrl,
  removeFromCompanyBucket,
} from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { toast } from "@/hooks/use-toast";
import {
  Paperclip,
  Upload,
  Trash2,
  Loader2,
  ChevronDown,
  FileText,
  AlertCircle,
} from "lucide-react";

const BUCKET = "event-ab-attachments" as const;
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 20;
const ACCEPT = ".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg";

interface AttachmentRow {
  id: string;
  event_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

function formatBytes(n?: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("pt-PT");
  } catch {
    return "—";
  }
};

/** Remove o prefixo company_id — os helpers de storage voltam a adicioná-lo. */
const relPath = (storagePath: string) => storagePath.split("/").slice(1).join("/");

export default function EventABAttachmentsSection({ eventId }: { eventId: string }) {
  const { user, isAdmin, isManager, role } = useAuth() as any;
  const canEdit = !!(isAdmin || isManager || role === "editor");
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AttachmentRow | null>(null);

  const {
    data: rows = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["event_ab_attachments", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ab_attachments" as any)
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AttachmentRow[];
    },
    enabled: !!eventId,
  });

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["event_ab_attachments", eventId] });

  const handleUpload = async (file: File) => {
    if (!canEdit) return;
    if (rows.length >= MAX_FILES) {
      toast({
        title: "Limite atingido",
        description: `O separador A&B suporta no máximo ${MAX_FILES} anexos por evento.`,
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({
        title: "Ficheiro demasiado grande",
        description: "Tamanho máximo: 25 MB.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const uid = crypto.randomUUID();
      const { error: upErr, path: storagePath } = await uploadToCompanyBucket(
        BUCKET,
        `${eventId}/${uid}_${safe}`,
        file,
        { contentType: file.type, upsert: false },
      );
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from("event_ab_attachments" as any).insert({
        event_id: eventId,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: user?.email ?? "system",
      } as any);
      if (dbErr) {
        try {
          await removeFromCompanyBucket(BUCKET, [relPath(storagePath)]);
        } catch {}
        throw dbErr;
      }

      toast({ title: "Documento anexado", description: file.name });
      refresh();
    } catch (e: any) {
      toast({
        title: "Erro no upload",
        description: e?.message ?? "Não foi possível anexar o ficheiro.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openFile = async (row: AttachmentRow) => {
    try {
      const { data, error } = await signedCompanyUrl(BUCKET, relPath(row.storage_path), 60 * 5);
      if (error || !data?.signedUrl) throw new Error(error?.message ?? "Sem URL para este ficheiro.");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({
        title: "Erro ao abrir",
        description: e?.message ?? "Ficheiro não disponível.",
        variant: "destructive",
      });
    }
  };

  const confirmDelete = async () => {
    const row = pendingDelete;
    setPendingDelete(null);
    if (!row || !canEdit) return;
    try {
      try {
        await removeFromCompanyBucket(BUCKET, [relPath(row.storage_path)]);
      } catch {}
      const { error } = await supabase
        .from("event_ab_attachments" as any)
        .delete()
        .eq("id", row.id);
      if (error) throw error;
      toast({ title: "Anexo removido", description: row.file_name });
      refresh();
    } catch (e: any) {
      toast({
        title: "Erro ao apagar",
        description: e?.message ?? "Não foi possível remover o anexo.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="flex-row items-center justify-between gap-2 cursor-pointer select-none">
            <CardTitle className="flex items-center gap-2 text-base">
              <Paperclip className="h-4 w-4" />
              Anexos
              <span className="text-xs font-normal text-muted-foreground">
                ({rows.length}/{MAX_FILES})
              </span>
            </CardTitle>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            />
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Documentos de fecho do operador de bares (PDF, XLSX, CSV, imagens). Armazenamento
              privado — os ficheiros abrem por link temporário.
            </p>

            {canEdit && (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-3.5 w-3.5" />
                  )}
                  {uploading ? "A carregar..." : "Carregar documento"}
                </Button>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar anexos...
              </div>
            ) : error ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Não foi possível carregar os anexos: {(error as any)?.message ?? "erro desconhecido"}
                </span>
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Sem anexos neste evento.
                {canEdit ? " Usa “Carregar documento” para adicionar o fecho do operador." : ""}
              </div>
            ) : (
              <ul className="divide-y rounded-md border">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 p-3">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => openFile(row)}
                        className="block max-w-full truncate text-left text-sm font-medium text-primary hover:underline"
                        title={row.file_name}
                      >
                        {row.file_name}
                      </button>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(row.size_bytes)} · {row.uploaded_by ?? "—"} ·{" "}
                        {fmtDate(row.created_at)}
                      </div>
                    </div>
                    {canEdit && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setPendingDelete(row)}
                        aria-label={`Apagar ${row.file_name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar anexo?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.file_name} será removido definitivamente do armazenamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
