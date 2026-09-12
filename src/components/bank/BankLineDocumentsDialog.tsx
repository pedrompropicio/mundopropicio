/**
 * Documentos anexados a UMA linha do extrato bancário.
 *
 * Porque existe: um crédito único do banco pode cobrir N transações com eventos
 * diferentes (caso real: FT 11.1/101 da Ticketline, 135.986,96 €, uma parcela no
 * evento Anitta e outra fora). A fatura não pode ser anexada às transações
 * individuais por causa do rateio e da vista do sócio — vive no movimento do banco.
 *
 * Espelha o mecanismo de `payment_list_documents` (ver PaymentListReceipts):
 * registo em tabela própria + ficheiro num bucket privado, aqui `bank-statements`
 * com prefixo `<company_id>/line-documents/<line_id>/`. Sem réplicas em
 * `transaction_documents` — o anexo é da linha, não das transações.
 *
 * O anexo é independente da conciliação: funciona em matched, unmatched e ignored.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadToCompanyBucket, signedCompanyUrl, removeFromCompanyBucket } from "@/lib/storage";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, formatCurrency } from "@/lib/mock-data";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";

interface Props {
  line: { id: string; description?: string | null; booking_date?: string | null; amount?: number | string | null } | null;
  onClose: () => void;
}

export default function BankLineDocumentsDialog({ line, onClose }: Props) {
  const queryClient = useQueryClient();
  const { user, isAdmin, isManager } = useAuth();
  const canDelete = isAdmin || isManager;
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["bank_line_documents", line?.id],
    enabled: !!line?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_line_documents")
        .select("*")
        .eq("line_id", line!.id)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["bank_line_documents", line?.id] });
    queryClient.invalidateQueries({ queryKey: ["bank_line_documents_counts"] });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !line) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "Máximo 10MB", variant: "destructive" });
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "pdf";
      const { error: upErr, path } = await uploadToCompanyBucket(
        "bank-statements",
        `line-documents/${line.id}/${Date.now()}.${ext}`,
        file,
        { contentType: file.type || "application/pdf" },
      );
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from("bank_line_documents").insert({
        line_id: line.id,
        name: file.name,
        file_url: path,
        doc_type: ext.toLowerCase(),
        uploaded_by: user?.email ?? "sistema",
      } as any);
      if (dbErr) throw dbErr;

      invalidate();
      toast({ title: "Documento anexado ao movimento do banco" });
    } catch (err: any) {
      toast({ title: "Erro ao anexar", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleOpen = async (doc: any) => {
    // `file_url` já vem com o prefixo da empresa — o helper é idempotente.
    const { data, error } = await signedCompanyUrl("bank-statements", doc.file_url, 3600);
    if (error || !data?.signedUrl) {
      toast({ title: "Erro ao abrir ficheiro", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (doc: any) => {
    setDeletingId(doc.id);
    try {
      const { error } = await supabase.from("bank_line_documents").delete().eq("id", doc.id);
      if (error) throw error;
      await removeFromCompanyBucket("bank-statements", [doc.file_url]);
      invalidate();
      toast({ title: "Documento removido" });
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={!!line} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Documentos do movimento do banco</DialogTitle>
        </DialogHeader>
        {line && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              {line.booking_date ? `${formatDate(line.booking_date)} · ` : ""}
              {line.description}
              {line.amount != null ? ` · ${formatCurrency(Number(line.amount))}` : ""}
            </p>

            <label className="inline-flex">
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <Button asChild variant="outline" size="sm" disabled={uploading}>
                <span className="cursor-pointer">
                  {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                  Anexar documento
                </span>
              </Button>
            </label>

            {isLoading ? (
              <p className="text-xs text-muted-foreground">A carregar…</p>
            ) : docs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem documentos anexados a esta linha.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {docs.map((d: any) => (
                  <li key={d.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <button onClick={() => handleOpen(d)} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">
                      {d.name}
                    </button>
                    <Badge variant="outline" className="text-[10px]">{formatDate(d.uploaded_at)}</Badge>
                    <span className="hidden text-muted-foreground sm:inline">{d.uploaded_by}</span>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(d)}
                        disabled={deletingId === d.id}
                        className="rounded p-1 text-destructive hover:bg-destructive/10"
                        title="Remover documento"
                      >
                        {deletingId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
