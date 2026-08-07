import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadToCompanyBucket } from "@/lib/storage";
import { X, Upload, FileText, Trash2, ExternalLink, BookOpen, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit, getAuditUser } from "@/lib/audit";
import { formatDatePT } from "@/lib/utils";
import ExternalLinkAttachment from "@/components/ExternalLinkAttachment";
import { useBackdropClose } from "@/lib/backdropClose";

/** Detect if a ref:// entry actually contains an http(s) URL (clickable external link). */
function isExternalLinkRef(fileUrl: string): boolean {
  return /^ref:\/\/https?:\/\//i.test(fileUrl);
}

interface Props {
  transactionId: string;
  transactionDescription: string;
  onClose: () => void;
}

/** Resolve a transaction_documents.file_url into { bucket, path }. Supports
 *  legacy public/sign URLs (transaction-documents bucket), bare paths, and
 *  the camarim:// prefix used by the Camarim integration. */
function resolveStorageRef(fileUrl: string): { bucket: string; path: string } {
  if (fileUrl?.startsWith("camarim://")) {
    return { bucket: "camarim-documents", path: fileUrl.replace(/^camarim:\/\//, "") };
  }
  // Default bucket is transaction-documents
  if (!fileUrl?.startsWith("http")) return { bucket: "transaction-documents", path: fileUrl };
  const marker = "/storage/v1/object/public/transaction-documents/";
  const idx = fileUrl.indexOf(marker);
  if (idx !== -1) return { bucket: "transaction-documents", path: fileUrl.substring(idx + marker.length) };
  const signedMarker = "/storage/v1/object/sign/transaction-documents/";
  const sIdx = fileUrl.indexOf(signedMarker);
  if (sIdx !== -1) {
    const pathWithQuery = fileUrl.substring(sIdx + signedMarker.length);
    return { bucket: "transaction-documents", path: pathWithQuery.split("?")[0] };
  }
  return { bucket: "transaction-documents", path: fileUrl };
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
/** Back-compat helper for delete flow (only deletes from transaction-documents) */
function extractStoragePath(fileUrl: string): string {
  return resolveStorageRef(fileUrl).path;
}

export function TransactionDocumentsModal({ transactionId, transactionDescription, onClose }: Props) {
  const [uploading, setUploading] = useState(false);
  const [isAccounting, setIsAccounting] = useState(true);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["transaction_documents", transactionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("*, transactions(company_id)")
        .eq("transaction_id", transactionId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: { id: string; file_url: string; name: string }) => {
      const storagePath = extractStoragePath(doc.file_url);
      // Use .select() so we can detect when RLS silently blocks the delete (0 rows returned)
      const { data: deleted, error: dbError } = await supabase
        .from("transaction_documents")
        .delete()
        .eq("id", doc.id)
        .select("id");
      if (dbError) throw dbError;
      if (!deleted || deleted.length === 0) {
        throw new Error("Sem permissão para remover este documento ou documento não encontrado.");
      }
      if (storagePath) {
        // Don't remove the underlying camarim file when deleting a transaction_documents
        // row that points to it — the dossier/receipt is shared with the camarim session.
        if (!doc.file_url?.startsWith("camarim://")) {
          await supabase.storage.from("transaction-documents").remove([storagePath]).catch((err) => {
            console.warn("Storage cleanup failed (non-blocking):", err);
          });
        }
      }
      await logAudit({
        entity_type: "transaction_document",
        entity_id: doc.id,
        action: "delete",
        changed_by: getAuditUser(user),
        old_data: { name: doc.name, file_url: doc.file_url },
        metadata: { transaction_id: transactionId, transaction_description: transactionDescription },
      });
    },
    onMutate: async (doc) => {
      // Optimistic update: remove from list immediately
      await queryClient.cancelQueries({ queryKey: ["transaction_documents", transactionId] });
      const previous = queryClient.getQueryData(["transaction_documents", transactionId]);
      queryClient.setQueryData(["transaction_documents", transactionId], (old: any[] | undefined) =>
        (old ?? []).filter((d: any) => d.id !== doc.id)
      );
      return { previous };
    },
    onSuccess: () => {
      toast({ title: "Documento removido" });
    },
    onError: (err: any, _doc, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(["transaction_documents", transactionId], context.previous);
      }
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction_documents", transactionId] });
      queryClient.invalidateQueries({ queryKey: ["transaction_documents_summary", transactionId] });
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0];
    if (!original) return;

    let file = original;
    if (isHeicFile(original)) {
      try {
        file = await normalizeImageFile(original);
      } catch (err: any) {
        toast({ title: "Foto HEIC não suportada", description: err.message, variant: "destructive" });
        e.target.value = "";
        return;
      }
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "Máximo 10MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();

      const { error: uploadError, path: filePath } = await uploadToCompanyBucket(
        "transaction-documents",
        `${transactionId}/${Date.now()}.${ext}`,
        file,
      );
      if (uploadError) throw uploadError;

      // Store just the path — signed URLs are generated on demand
      const { error: dbError } = await supabase.from("transaction_documents").insert({
        transaction_id: transactionId,
        name: file.name,
        file_url: filePath,
        doc_type: getDocType(file.name),
        uploaded_by: user?.email ?? "sistema",
        is_accounting: isAccounting,
      } as any);
      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ["transaction_documents", transactionId] });
      queryClient.invalidateQueries({ queryKey: ["transaction_documents_summary", transactionId] });
      toast({ title: "Documento anexado com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao enviar ficheiro", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleOpenDocument = async (doc: any) => {
    const fileUrl = doc.file_url as string;
    if (/^https?:\/\//i.test(fileUrl) && !fileUrl.includes("/storage/v1/object/")) {
      window.open(fileUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const { path } = resolveStorageRef(fileUrl);
    const isHtml = /\.html?(\?|$)/i.test(path);
    let blobUrl: string | null = null;

    try {
      let token = await getFreshAccessToken();

      let response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-attachment-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ kind: "transaction_document", documentId: doc.id, mode: "download" }),
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
            body: JSON.stringify({ kind: "transaction_document", documentId: doc.id, mode: "download" }),
          });
        }
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Ficheiro não disponível");
      }

      const blob = isHtml
        ? new Blob([await response.text()], { type: "text/html; charset=utf-8" })
        : await response.blob();
      blobUrl = URL.createObjectURL(blob);
    } catch (err: any) {
      toast({ title: "Erro ao abrir documento", description: err?.message ?? "URL não disponível", variant: "destructive" });
      return;
    }

    // For HTML dossiers, fetch the bytes and open as a blob URL with the correct
    // MIME type. This forces the browser to RENDER the page instead of letting
    // the OS open it as raw text in an editor (common on macOS Safari).
    if (isHtml) {
      try {
        const win = window.open(blobUrl, "_blank");
        // Revoke after a delay to allow the new tab to load
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        if (!win) {
          toast({ title: "Pop-up bloqueado", description: "Permite pop-ups para abrir o dossiê.", variant: "destructive" });
        }
        return;
      } catch (e: any) {
        toast({ title: "Erro ao abrir dossiê", description: e?.message ?? String(e), variant: "destructive" });
        return;
      }
    }
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  };

  // Three groups: external clickable links (ref://http...), pending textual refs, and uploaded files
  const externalLinks = documents.filter((d) => isExternalLinkRef(d.file_url));
  const refDocs = documents.filter((d) => d.file_url.startsWith("ref://") && !isExternalLinkRef(d.file_url));
  const realDocs = documents.filter((d) => !d.file_url.startsWith("ref://"));

  const toggleAccounting = async (doc: any) => {
    const newVal = !doc.is_accounting;
    await supabase.from("transaction_documents").update({ is_accounting: newVal } as any).eq("id", doc.id);
    queryClient.invalidateQueries({ queryKey: ["transaction_documents", transactionId] });
    queryClient.invalidateQueries({ queryKey: ["transaction_documents_summary", transactionId] });
    toast({ title: newVal ? "Marcado como contábil" : "Removida marcação contábil" });
  };

  const requestDelete = (doc: any) => {
    if (confirm("Remover este documento?")) {
      deleteMutation.mutate({ id: doc.id, file_url: doc.file_url, name: doc.name });
    }
  };

  const backdrop = useBackdropClose(onClose);

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 p-4 sm:flex sm:items-center sm:justify-center" {...backdrop}>
      <div className="glass mx-auto mt-6 w-full max-w-lg rounded-xl p-4 sm:mt-0 sm:p-6 space-y-4 max-h-[calc(100dvh-3rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-1.5">Documentos <HelpTooltip text={helpTexts.uploadDocuments} side="bottom" size={14} /></h2>
            <p className="text-xs text-muted-foreground truncate max-w-[300px]">{transactionDescription}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Pending textual references from import (no URL — needs upload) */}
        {refDocs.length > 0 && realDocs.length === 0 && externalLinks.length === 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <p className="font-semibold mb-0.5">📎 Referência pendente da importação:</p>
            {refDocs.map((d) => (
              <p key={d.id} className="font-mono">{d.file_url.replace("ref://", "")}</p>
            ))}
          </div>
        )}
        {refDocs.length > 0 && (realDocs.length > 0 || externalLinks.length > 0) && (
          <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
            <p className="font-semibold">✓ Referência da importação associada</p>
            {refDocs.map((d) => (
              <p key={d.id} className="font-mono text-muted-foreground">{d.file_url.replace("ref://", "")}</p>
            ))}
          </div>
        )}

        {/* Upload */}
        <div className="space-y-2">
          <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-6 transition-colors hover:border-primary/50 hover:bg-primary/5 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {uploading ? "A enviar…" : "Clique para anexar documento (max 10MB)"}
            </span>
            <input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" />
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAccounting}
                onChange={(e) => setIsAccounting(e.target.checked)}
                className="rounded border-border"
              />
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              <span>Documento contábil (fatura, recibo, nota fiscal)</span>
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="rounded-full p-0.5 text-muted-foreground hover:text-primary transition-colors" title="Quais documentos são contábeis?">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-72 text-xs space-y-1.5 p-3">
                <p className="font-semibold text-sm">📋 Documentos contábeis:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                  <li>Faturas (Portugal)</li>
                  <li>Notas fiscais (Brasil)</li>
                  <li>Recibos de pagamento</li>
                  <li>Notas de crédito / débito</li>
                  <li>Comprovativos de transferência</li>
                  <li>Recibos verdes</li>
                  <li>Extratos de comissões</li>
                </ul>
                <p className="font-semibold text-sm pt-1">🚫 NÃO marcar como contábil:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                  <li>Propostas / orçamentos</li>
                  <li>Contratos</li>
                  <li>Riders técnicos</li>
                  <li>Emails / correspondência</li>
                </ul>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Documents list (uploaded files + external links) */}
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-4">A carregar…</p>
        ) : realDocs.length === 0 && externalLinks.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">Nenhum documento anexado.</p>
        ) : (
          <div className="space-y-2">
            {externalLinks.map((doc: any) => (
              <ExternalLinkAttachment
                key={doc.id}
                doc={doc}
                uploadedAtFormatted={formatDatePT(doc.uploaded_at)}
                onToggleAccounting={() => toggleAccounting(doc)}
                onDelete={() => requestDelete(doc)}
              />
            ))}

            {realDocs.map((doc: any) => (
              <div key={doc.id} className="flex items-center gap-3 rounded-lg bg-secondary/50 px-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{doc.name}</p>
                    {doc.is_accounting && (
                      <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary" title="Documento contábil">
                        Contábil
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {doc.uploaded_by} · {formatDatePT(doc.uploaded_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleAccounting(doc)}
                    className={`rounded-lg p-1.5 transition-colors ${doc.is_accounting ? "text-primary hover:bg-primary/15" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                    title={doc.is_accounting ? "Remover marcação contábil" : "Marcar como contábil"}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleOpenDocument(doc)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    title="Abrir"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => requestDelete(doc)}
                    className="rounded-lg p-1.5 text-destructive hover:bg-destructive/15 transition-colors"
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getDocType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png"].includes(ext ?? "")) return "imagem";
  if (["doc", "docx"].includes(ext ?? "")) return "word";
  if (["xls", "xlsx"].includes(ext ?? "")) return "excel";
  return "outro";
}
