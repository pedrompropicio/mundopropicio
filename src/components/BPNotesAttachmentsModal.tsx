/**
 * BP line — Observações + Documentos (uploads reais) + Links Externos.
 *
 * Coexists with attachment_refs (jsonb) which continues to be managed by the
 * sync Coala / import PL flows. This modal exposes all three concerns clearly:
 *
 *   1. Observações — event_forecasts.notes (texto livre)
 *   2. Documentos — uploads reais em event_forecast_attachments + bucket
 *      event-forecast-attachments (privado, isolado por company_id)
 *   3. Links externos — attachment_refs (Drive/Dropbox), gerido aqui mas
 *      preservando todo o comportamento existente (sync para transações)
 */
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadToCompanyBucket, signedCompanyUrl, removeFromCompanyBucket } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Link2,
  Upload,
  Trash2,
  ExternalLink,
  FileText,
  Plus,
  Loader2,
  StickyNote,
  Paperclip,
} from "lucide-react";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 10;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  forecast: {
    id: string;
    description: string;
    notes?: string | null;
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

function formatBytes(n: number): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function BPNotesAttachmentsModal({ open, onOpenChange, forecast }: Props) {
  const { user, isAdmin, isManager, role } = useAuth() as any;
  const canEdit = !!(isAdmin || isManager || role === "editor");
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [notes, setNotes] = useState(forecast.notes ?? "");
  const [newLink, setNewLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  const refs: Array<{ url: string }> = Array.isArray(forecast.attachment_refs)
    ? (forecast.attachment_refs as any[]).filter((r) => r && typeof r.url === "string")
    : [];

  const { data: uploads = [], isLoading: loadingUploads } = useQuery({
    queryKey: ["event_forecast_attachments", forecast.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecast_attachments" as any)
        .select("*")
        .eq("forecast_id", forecast.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: open,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["event_forecast_attachments", forecast.id] });
    qc.invalidateQueries({ queryKey: ["event_forecast_attachments_counts"] });
    qc.invalidateQueries({ queryKey: ["event_forecasts"] });
  };

  const saveNotes = async () => {
    if (!canEdit) return;
    setSavingNotes(true);
    try {
      const trimmed = notes.trim();
      const { error } = await supabase
        .from("event_forecasts")
        .update({ notes: trimmed || null } as any)
        .eq("id", forecast.id);
      if (error) throw error;
      toast({ title: "Observações guardadas" });
      refresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingNotes(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!canEdit) return;
    if (uploads.length >= MAX_FILES) {
      toast({
        title: "Limite atingido",
        description: `Cada linha do BP suporta no máximo ${MAX_FILES} anexos.`,
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
        "event-forecast-attachments",
        `${forecast.id}/${uid}_${safe}`,
        file,
        { contentType: file.type, upsert: false },
      );
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from("event_forecast_attachments" as any).insert({
        forecast_id: forecast.id,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: user?.email ?? "system",
      } as any);
      if (dbErr) {
        // rollback storage
        try {
          await removeFromCompanyBucket("event-forecast-attachments", [storagePath.replace(/^[^/]+\//, "")]);
        } catch {}
        throw dbErr;
      }

      toast({ title: "Documento anexado", description: file.name });
      refresh();
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeUpload = async (row: { id: string; storage_path: string }) => {
    if (!canEdit) return;
    try {
      // best-effort storage cleanup; strip the company_id prefix because
      // removeFromCompanyBucket re-adds it via withCompanyPath
      try {
        const rel = row.storage_path.split("/").slice(1).join("/");
        await removeFromCompanyBucket("event-forecast-attachments", [rel]);
      } catch {}
      const { error } = await supabase
        .from("event_forecast_attachments" as any)
        .delete()
        .eq("id", row.id);
      if (error) throw error;
      toast({ title: "Documento removido" });
      refresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const openUpload = async (storagePath: string) => {
    try {
      const rel = storagePath.split("/").slice(1).join("/");
      const { data, error } = await signedCompanyUrl("event-forecast-attachments", rel, 60 * 5);
      if (error || !data?.signedUrl) throw new Error(error?.message ?? "Sem URL");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const addLink = async () => {
    const trimmed = newLink.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast({ title: "URL inválido", description: "Deve começar por http:// ou https://", variant: "destructive" });
      return;
    }
    if (refs.some((r) => r.url === trimmed)) {
      toast({ title: "Link duplicado", variant: "destructive" });
      return;
    }
    try {
      const next = [...refs, { url: trimmed }];
      const { error } = await supabase
        .from("event_forecasts")
        .update({ attachment_refs: next as any } as any)
        .eq("id", forecast.id);
      if (error) throw error;
      setNewLink("");
      toast({ title: "Link adicionado" });
      refresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const removeLink = async (url: string) => {
    try {
      const next = refs.filter((r) => r.url !== url);
      const { error } = await supabase
        .from("event_forecasts")
        .update({ attachment_refs: next as any } as any)
        .eq("id", forecast.id);
      if (error) throw error;
      toast({ title: "Link removido" });
      refresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Observações e anexos</DialogTitle>
          <DialogDescription className="line-clamp-2">{forecast.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Observações */}
          <section>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3.5 w-3.5" /> Observações
            </h4>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas internas sobre esta linha (opcional)..."
              rows={3}
              disabled={!canEdit}
            />
            {canEdit && (
              <div className="mt-2 flex justify-end">
                <Button size="sm" onClick={saveNotes} disabled={savingNotes || notes === (forecast.notes ?? "")}>
                  {savingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Guardar observações
                </Button>
              </div>
            )}
          </section>

          {/* Documentos (uploads reais) */}
          <section>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" /> Documentos ({uploads.length}/{MAX_FILES})
            </h4>

            {canEdit && (
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
                  disabled={uploading || uploads.length >= MAX_FILES}
                  className="mb-2"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {uploading ? "A enviar…" : "Adicionar documento (máx. 25 MB)"}
                </Button>
              </>
            )}

            {loadingUploads ? (
              <p className="text-xs text-muted-foreground">A carregar…</p>
            ) : uploads.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">Sem documentos.</p>
            ) : (
              <ul className="space-y-1">
                {uploads.map((d: any) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-2 rounded-md border border-border/40 bg-secondary/20 px-2 py-1.5 text-xs"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-success" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate" title={d.file_name}>{d.file_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatBytes(Number(d.size_bytes) || 0)}
                        {d.uploaded_by ? ` · ${d.uploaded_by}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => openUpload(d.storage_path)}
                      className="rounded p-1 hover:bg-secondary"
                      title="Abrir"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                    {canEdit && (
                      <button
                        onClick={() => removeUpload(d)}
                        className="rounded p-1 text-destructive hover:bg-destructive/10"
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Links externos (attachment_refs) */}
          <section>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Link2 className="h-3.5 w-3.5" /> Links externos ({refs.length})
              <span className="ml-auto text-[10px] font-normal italic text-muted-foreground/70">
                Drive / Dropbox / outros
              </span>
            </h4>

            {canEdit && (
              <div className="mb-2 flex gap-2">
                <Input
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  className="text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (newLink.trim()) addLink();
                    }
                  }}
                />
                <Button size="sm" onClick={addLink} disabled={!newLink.trim()}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </Button>
              </div>
            )}

            {refs.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">Sem links externos.</p>
            ) : (
              <ul className="space-y-1">
                {refs.map((r) => (
                  <li
                    key={r.url}
                    className="flex items-center gap-2 rounded-md border border-border/40 bg-secondary/20 px-2 py-1.5 text-xs"
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="flex-1 truncate" title={r.url}>{fileNameFromUrl(r.url)}</span>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1 hover:bg-secondary"
                      title="Abrir em nova aba"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {canEdit && (
                      <button
                        onClick={() => removeLink(r.url)}
                        className="rounded p-1 text-destructive hover:bg-destructive/10"
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
