/**
 * Manage attachments (external links + native files) for a single BP forecast row.
 *
 * Two sources of truth are merged:
 *   - forecast.attachment_refs: array of { url } pointing to external URLs (Drive, etc).
 *   - transaction_documents: native uploads (storage paths) when forecast has transaction_id.
 *
 * Users can: add a new external link, upload a native file, or remove either.
 */
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadToCompanyBucket } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Link2, Upload, Trash2, ExternalLink, FileText, Plus, Loader2, Eye } from "lucide-react";
import { extractDriveFileId } from "@/lib/import-pl-xlsx";

/**
 * Build a Drive embed URL that works inside an iframe (preview mode).
 * Returns null for non-Drive links or if no file id can be extracted.
 */
function drivePreviewUrl(url: string): string | null {
  const id = extractDriveFileId(url);
  if (!id) return null;
  return `https://drive.google.com/file/d/${id}/preview`;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  forecast: {
    id: string;
    description: string;
    transaction_id: string | null;
    attachment_refs?: Array<{ url?: string }> | null;
  };
}

function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
    return decodeURIComponent(last).slice(0, 80);
  } catch {
    return url.slice(0, 60);
  }
}

function isDrive(url: string): boolean {
  return /drive\.google\.com|docs\.google\.com/i.test(url);
}

export default function BPAttachmentModal({ open, onOpenChange, forecast }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newLink, setNewLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refs: Array<{ url: string }> = Array.isArray(forecast.attachment_refs)
    ? (forecast.attachment_refs as any[]).filter((r) => r && typeof r.url === "string")
    : [];

  const { data: nativeDocs = [], isLoading: loadingDocs } = useQuery({
    queryKey: ["bp_attachments_native", forecast.transaction_id],
    queryFn: async () => {
      if (!forecast.transaction_id) return [];
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("id, name, file_url, uploaded_at")
        .eq("transaction_id", forecast.transaction_id)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((d: any) => !String(d.file_url ?? "").startsWith("ref://"));
    },
    enabled: open && !!forecast.transaction_id,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["event_forecasts"] });
    qc.invalidateQueries({ queryKey: ["bp_attachments_native", forecast.transaction_id] });
  };

  const addLinkMutation = useMutation({
    mutationFn: async (url: string) => {
      const trimmed = url.trim();
      if (!/^https?:\/\//i.test(trimmed)) {
        throw new Error("URL deve começar por http:// ou https://");
      }
      if (refs.some((r) => r.url === trimmed)) {
        throw new Error("Este link já está anexado");
      }
      const next = [...refs, { url: trimmed }];
      const { error } = await supabase
        .from("event_forecasts")
        .update({ attachment_refs: next as any } as any)
        .eq("id", forecast.id);
      if (error) throw error;

      // Also propagate to linked transaction as a "ref://" doc, when applicable.
      if (forecast.transaction_id) {
        await supabase.from("transaction_documents").insert({
          transaction_id: forecast.transaction_id,
          name: fileNameFromUrl(trimmed),
          file_url: `ref://${trimmed}`,
          doc_type: "outro",
          uploaded_by: user?.email ?? "system",
          is_accounting: true,
        } as any);
      }
    },
    onSuccess: () => {
      toast({ title: "Link adicionado" });
      setNewLink("");
      refresh();
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const removeLinkMutation = useMutation({
    mutationFn: async (url: string) => {
      const next = refs.filter((r) => r.url !== url);
      const { error } = await supabase
        .from("event_forecasts")
        .update({ attachment_refs: next as any } as any)
        .eq("id", forecast.id);
      if (error) throw error;

      if (forecast.transaction_id) {
        await supabase
          .from("transaction_documents")
          .delete()
          .eq("transaction_id", forecast.transaction_id)
          .eq("file_url", `ref://${url}`);
      }
    },
    onSuccess: () => {
      toast({ title: "Link removido" });
      refresh();
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const removeNativeMutation = useMutation({
    mutationFn: async (doc: { id: string; file_url: string }) => {
      // Storage cleanup: best-effort
      try {
        await supabase.storage.from("transaction-documents").remove([doc.file_url]);
      } catch {}
      const { error } = await supabase.from("transaction_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Ficheiro removido" });
      refresh();
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const handleUpload = async (file: File) => {
    if (!forecast.transaction_id) {
      toast({
        title: "Sem transação vinculada",
        description: "Esta linha do BP ainda não tem transação. Cria a transação primeiro para anexar ficheiros nativos.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const { error: upErr, path: storedPath } = await uploadToCompanyBucket(
        "transaction-documents",
        `${forecast.transaction_id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`,
        file,
        { contentType: file.type, upsert: false },
      );
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("transaction_documents").insert({
        transaction_id: forecast.transaction_id,
        name: file.name,
        file_url: storedPath,
        doc_type: "outro",
        uploaded_by: user?.email ?? "system",
        is_accounting: true,
      } as any);
      if (dbErr) throw dbErr;
      toast({ title: "Ficheiro anexado", description: file.name });
      refresh();
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openSignedUrl = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from("transaction-documents")
      .createSignedUrl(filePath, 60 * 5);
    if (error || !data?.signedUrl) {
      toast({ title: "Erro", description: error?.message ?? "Sem URL", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Anexos da linha do BP</DialogTitle>
          <DialogDescription className="line-clamp-2">{forecast.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* External links */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5" /> Links externos ({refs.length})
            </h4>

            <div className="flex gap-2 mb-2">
              <Input
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                placeholder="https://drive.google.com/file/d/..."
                className="text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (newLink.trim()) addLinkMutation.mutate(newLink);
                  }
                }}
              />
              <Button
                size="sm"
                onClick={() => addLinkMutation.mutate(newLink)}
                disabled={!newLink.trim() || addLinkMutation.isPending}
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>

            {refs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sem links externos.</p>
            ) : (
              <ul className="space-y-1">
                {refs.map((r) => (
                  <li
                    key={r.url}
                    className="flex items-center gap-2 rounded-md border border-border/40 bg-secondary/20 px-2 py-1.5 text-xs"
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="flex-1 truncate" title={r.url}>
                      {fileNameFromUrl(r.url)}
                    </span>
                    {isDrive(r.url) && extractDriveFileId(r.url) && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">Drive</span>
                    )}
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1 hover:bg-secondary"
                      title="Abrir em nova aba"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {drivePreviewUrl(r.url) && (
                      <button
                        onClick={() => setPreviewUrl(drivePreviewUrl(r.url))}
                        className="rounded p-1 hover:bg-secondary text-primary"
                        title="Pré-visualizar aqui"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => removeLinkMutation.mutate(r.url)}
                      disabled={removeLinkMutation.isPending}
                      className="rounded p-1 text-destructive hover:bg-destructive/10"
                      title="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Native attachments */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
              <FileText className="h-3.5 w-3.5" /> Ficheiros nativos ({nativeDocs.length})
            </h4>

            {!forecast.transaction_id ? (
              <p className="text-xs text-muted-foreground italic">
                Sem transação vinculada — cria a transação primeiro para anexar ficheiros.
              </p>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="mb-2"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {uploading ? "A enviar…" : "Carregar ficheiro"}
                </Button>

                {loadingDocs ? (
                  <p className="text-xs text-muted-foreground">A carregar…</p>
                ) : nativeDocs.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Sem ficheiros nativos.</p>
                ) : (
                  <ul className="space-y-1">
                    {nativeDocs.map((d: any) => (
                      <li
                        key={d.id}
                        className="flex items-center gap-2 rounded-md border border-border/40 bg-secondary/20 px-2 py-1.5 text-xs"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-success" />
                        <span className="flex-1 truncate" title={d.name}>
                          {d.name}
                        </span>
                        <button
                          onClick={() => openSignedUrl(d.file_url)}
                          className="rounded p-1 hover:bg-secondary"
                          title="Abrir"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => removeNativeMutation.mutate({ id: d.id, file_url: d.file_url })}
                          disabled={removeNativeMutation.isPending}
                          className="rounded p-1 text-destructive hover:bg-destructive/10"
                          title="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>
      </DialogContent>

      {/* Preview popup for Drive links — uses /preview embed which works in iframes */}
      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) setPreviewUrl(null); }}>
        <DialogContent className="max-w-3xl h-[70vh] p-0 gap-0 flex flex-col">
          <DialogHeader className="px-4 py-2 border-b border-border/40">
            <DialogTitle className="text-sm">Pré-visualização</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <iframe
              src={previewUrl}
              className="flex-1 w-full bg-background"
              allow="autoplay"
              title="Pré-visualização do anexo"
            />
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
