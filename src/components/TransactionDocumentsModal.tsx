import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, Upload, FileText, Trash2, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  transactionId: string;
  transactionDescription: string;
  onClose: () => void;
}

export function TransactionDocumentsModal({ transactionId, transactionDescription, onClose }: Props) {
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["transaction_documents", transactionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("*")
        .eq("transaction_id", transactionId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: { id: string; file_url: string }) => {
      // Extract path from URL
      const url = new URL(doc.file_url);
      const pathParts = url.pathname.split("/storage/v1/object/public/transaction-documents/");
      if (pathParts[1]) {
        await supabase.storage.from("transaction-documents").remove([pathParts[1]]);
      }
      const { error } = await supabase.from("transaction_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction_documents", transactionId] });
      toast({ title: "Documento removido" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "Máximo 10MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `${transactionId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("transaction-documents")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("transaction-documents")
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase.from("transaction_documents").insert({
        transaction_id: transactionId,
        name: file.name,
        file_url: urlData.publicUrl,
        doc_type: getDocType(file.name),
        uploaded_by: user?.email ?? "sistema",
      });
      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ["transaction_documents", transactionId] });
      toast({ title: "Documento anexado com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao enviar ficheiro", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Documentos</h2>
            <p className="text-xs text-muted-foreground truncate max-w-[300px]">{transactionDescription}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Upload */}
        <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-6 transition-colors hover:border-primary/50 hover:bg-primary/5 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {uploading ? "A enviar…" : "Clique para anexar documento (max 10MB)"}
          </span>
          <input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" />
        </label>

        {/* Documents list */}
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-4">A carregar…</p>
        ) : documents.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">Nenhum documento anexado.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 rounded-lg bg-secondary/50 px-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {doc.uploaded_by} · {new Date(doc.uploaded_at).toLocaleDateString("pt-PT")}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    title="Abrir"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={() => {
                      if (confirm("Remover este documento?")) {
                        deleteMutation.mutate({ id: doc.id, file_url: doc.file_url });
                      }
                    }}
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
