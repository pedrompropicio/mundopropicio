/**
 * Documentos genéricos por entidade (issue #67).
 *
 * Réplica do mecanismo dos anexos A&B (bucket privado isolado por company_id
 * + signed URL), mas sobre a tabela polimórfica `entity_documents`.
 * Não entra em cálculos, BP, fecho nem no portal do sócio.
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  FolderOpen,
  Upload,
  Trash2,
  Loader2,
  FileText,
  AlertCircle,
} from "lucide-react";

const BUCKET = "entity-documents" as const;
const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = ".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg,.jpeg";

export const DOCUMENT_TYPES = [
  { value: "fecho", label: "Fecho" },
  { value: "ata", label: "Ata de reunião" },
  { value: "contrato", label: "Contrato" },
  { value: "acerto_socio", label: "Acerto com sócio" },
  { value: "licenca", label: "Licença" },
  { value: "seguro", label: "Seguro" },
  { value: "outro", label: "Outro" },
] as const;

const typeLabel = (v: string) => DOCUMENT_TYPES.find((t) => t.value === v)?.label ?? v;

interface DocumentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  document_type: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  notes: string | null;
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

interface Props {
  entityType?: "event";
  entityId: string;
}

export default function EntityDocumentsSection({ entityType = "event", entityId }: Props) {
  const { user, isAdmin, isManager, role } = useAuth() as any;
  const canUpload = !!(isAdmin || isManager || role === "editor");
  const canDelete = !!(isAdmin || isManager);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [docType, setDocType] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DocumentRow | null>(null);
  const [uploaderNames, setUploaderNames] = useState<Record<string, string>>({});

  const {
    data: rows = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["entity_documents", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_documents" as any)
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as unknown as DocumentRow[];
      const ids = Array.from(new Set(list.map((r) => r.uploaded_by).filter(Boolean))) as string[];
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => {
          map[p.id] = p.full_name || p.email || "—";
        });
        setUploaderNames(map);
      }
      return list;
    },
    enabled: !!entityId,
  });

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["entity_documents", entityType, entityId] });

  const handleUpload = async (file: File) => {
    if (!canUpload) return;
    if (!docType) {
      toast({
        title: "Tipo de documento obrigatório",
        description: "Escolhe o tipo antes de carregar o ficheiro.",
        variant: "destructive",
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({
        title: "Ficheiro demasiado grande",
        description: "Tamanho máximo: 25 MB.",
        variant: "destructive",
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const uid = crypto.randomUUID();
      const { error: upErr, path: storagePath } = await uploadToCompanyBucket(
        BUCKET,
        `${entityType}/${entityId}/${uid}_${safe}`,
        file,
        { contentType: file.type, upsert: false },
      );
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from("entity_documents" as any).insert({
        entity_type: entityType,
        entity_id: entityId,
        document_type: docType,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || null,
        size_bytes: file.size,
        notes: notes.trim() || null,
        uploaded_by: user?.id ?? null,
      } as any);
      if (dbErr) {
        try {
          await removeFromCompanyBucket(BUCKET, [relPath(storagePath)]);
        } catch {}
        throw dbErr;
      }

      toast({ title: "Documento arquivado", description: file.name });
      setNotes("");
      setDocType("");
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

  const openFile = async (row: DocumentRow) => {
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
    if (!row || !canDelete) return;
    try {
      try {
        await removeFromCompanyBucket(BUCKET, [relPath(row.storage_path)]);
      } catch {}
      const { error } = await supabase
        .from("entity_documents" as any)
        .delete()
        .eq("id", row.id);
      if (error) throw error;
      toast({ title: "Documento removido", description: row.file_name });
      refresh();
    } catch (e: any) {
      toast({
        title: "Erro ao apagar",
        description: e?.message ?? "Não foi possível remover o documento.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderOpen className="h-4 w-4" />
          Documentos
          <span className="text-xs font-normal text-muted-foreground">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Documentos do evento — fechos, atas, contratos, acertos com sócios, licenças e seguros.
          Armazenamento privado: os ficheiros abrem por link temporário.
        </p>

        {canUpload && (
          <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[200px_1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de documento *</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher tipo" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notas (opcional)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: fecho MP/EIN"
              />
            </div>
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
                disabled={uploading || !docType}
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
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar documentos...
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Não foi possível carregar os documentos:{" "}
              {(error as any)?.message ?? "erro desconhecido"}
            </span>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            Ainda não há documentos arquivados neste evento.
            {canUpload
              ? " Escolhe o tipo e carrega o fecho, a ata ou o contrato para ficarem guardados aqui."
              : ""}
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 p-3">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openFile(row)}
                      className="max-w-full truncate text-left text-sm font-medium text-primary hover:underline"
                      title={row.file_name}
                    >
                      {row.file_name}
                    </button>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {typeLabel(row.document_type)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(row.size_bytes)} ·{" "}
                    {(row.uploaded_by && uploaderNames[row.uploaded_by]) || "—"} ·{" "}
                    {fmtDate(row.created_at)}
                  </div>
                  {row.notes && (
                    <div className="mt-0.5 text-xs italic text-muted-foreground">{row.notes}</div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openFile(row)}
                  className="shrink-0"
                >
                  Descarregar
                </Button>
                {canDelete && (
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

      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar documento?</AlertDialogTitle>
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
