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
 * com prefixo `<company_id>/line-documents/<line_id>/`, MAIS uma réplica em
 * `transaction_documents` por cada transação ligada à linha — mesmo `file_url`,
 * sem duplicar o ficheiro no storage. Sem a réplica o documento é invisível para
 * a contabilidade. As réplicas usam o prefixo `bank://` para o resolvedor de
 * buckets saber que o ficheiro vive em `bank-statements`.
 *
 * Transações da linha (as três origens contam): `matched_transaction_id`,
 * `created_transaction_id` e a tabela-ponte `bank_line_transactions`.
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
import { BookOpen, FileText, Loader2, Trash2, Upload } from "lucide-react";

interface Props {
  line: { id: string; description?: string | null; booking_date?: string | null; amount?: number | string | null } | null;
  onClose: () => void;
}

/** Ids das transações ligadas à linha, das três origens, deduplicados. */
async function fetchLinkedTxIds(lineId: string): Promise<string[]> {
  const ids = new Set<string>();

  const { data: line } = await (supabase as any)
    .from("bank_statement_lines")
    .select("matched_transaction_id, created_transaction_id")
    .eq("id", lineId)
    .maybeSingle();
  if (line?.matched_transaction_id) ids.add(line.matched_transaction_id);
  if (line?.created_transaction_id) ids.add(line.created_transaction_id);

  const { data: bridge } = await (supabase as any)
    .from("bank_line_transactions")
    .select("transaction_id")
    .eq("line_id", lineId);
  for (const b of bridge ?? []) if (b.transaction_id) ids.add(b.transaction_id);

  return Array.from(ids);
}

export default function BankLineDocumentsDialog({ line, onClose }: Props) {
  const queryClient = useQueryClient();
  const { user, isAdmin, isManager } = useAuth();
  const canDelete = isAdmin || isManager;
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Default LIGADO: o caso típico de um anexo de movimento do banco é a fatura.
  const [isAccounting, setIsAccounting] = useState(true);

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

  const invalidate = (txIds: string[] = []) => {
    queryClient.invalidateQueries({ queryKey: ["bank_line_documents", line?.id] });
    queryClient.invalidateQueries({ queryKey: ["bank_line_documents_counts"] });
    for (const txId of txIds) {
      queryClient.invalidateQueries({ queryKey: ["transaction_documents", txId] });
      queryClient.invalidateQueries({ queryKey: ["transaction_documents_summary", txId] });
      queryClient.invalidateQueries({ queryKey: ["accountant-tx-docs", txId] });
    }
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
    let txIds: string[] = [];
    try {
      const ext = file.name.split(".").pop() ?? "pdf";
      const { error: upErr, path } = await uploadToCompanyBucket(
        "bank-statements",
        `line-documents/${line.id}/${Date.now()}.${ext}`,
        file,
        { contentType: file.type || "application/pdf" },
      );
      if (upErr) throw upErr;

      const uploadedBy = user?.email ?? "sistema";

      const { error: dbErr } = await supabase.from("bank_line_documents").insert({
        line_id: line.id,
        name: file.name,
        file_url: path,
        doc_type: ext.toLowerCase(),
        uploaded_by: uploadedBy,
      } as any);
      if (dbErr) throw dbErr;

      // Réplicas nas transações ligadas — mesmo ficheiro, prefixo bank://.
      txIds = await fetchLinkedTxIds(line.id);
      if (txIds.length > 0) {
        const { error: repErr } = await supabase.from("transaction_documents").insert(
          txIds.map((txId) => ({
            transaction_id: txId,
            name: file.name,
            file_url: `bank://${path}`,
            doc_type: ext.toLowerCase(),
            uploaded_by: uploadedBy,
            is_accounting: isAccounting,
            // Réplicas de linhas do banco nunca ficam visíveis ao sócio do evento.
            partner_visible: false,
          })) as any,
        );
        if (repErr) throw repErr;
      }

      invalidate(txIds);
      toast({
        title: "Documento anexado ao movimento do banco",
        description:
          txIds.length > 0
            ? `Replicado em ${txIds.length} transação(ões) para a contabilidade.`
            : "Sem transações ligadas a esta linha — ficou apenas no movimento.",
      });
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
      const txIds = line ? await fetchLinkedTxIds(line.id) : [];

      // 1) réplicas nas transações (identificadas pelo mesmo ficheiro)
      const { error: repErr } = await supabase
        .from("transaction_documents")
        .delete()
        .eq("file_url", `bank://${doc.file_url}`);
      if (repErr) throw repErr;

      // 2) registo da linha
      const { error } = await supabase.from("bank_line_documents").delete().eq("id", doc.id);
      if (error) throw error;

      // 3) ficheiro no storage (único)
      await removeFromCompanyBucket("bank-statements", [doc.file_url]);
      invalidate(txIds);
      toast({ title: "Documento removido", description: "As réplicas nas transações também foram removidas." });
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={!!line} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Documentos do movimento do banco</DialogTitle>
        </DialogHeader>
        {line && (
          <div className="space-y-3 overflow-hidden text-sm">
            <p className="break-words text-xs text-muted-foreground">
              {line.booking_date ? `${formatDate(line.booking_date)} · ` : ""}
              {line.description}
              {line.amount != null ? ` · ${formatCurrency(Number(line.amount))}` : ""}
            </p>

            <div className="flex flex-wrap items-center gap-3">
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

              <label className="flex cursor-pointer select-none items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={isAccounting}
                  onChange={(e) => setIsAccounting(e.target.checked)}
                  className="rounded border-border"
                />
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                <span>Documento contábil (fatura, recibo, nota fiscal)</span>
              </label>
            </div>

            {isLoading ? (
              <p className="text-xs text-muted-foreground">A carregar…</p>
            ) : docs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem documentos anexados a esta linha.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {docs.map((d: any) => (
                  <li key={d.id} className="flex items-start gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => handleOpen(d)}
                        className="block w-full truncate text-left font-medium hover:underline"
                        title={d.name}
                      >
                        {d.name}
                      </button>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-muted-foreground">
                        <Badge variant="outline" className="shrink-0 text-[10px]">{formatDate(d.uploaded_at)}</Badge>
                        <span className="min-w-0 truncate">{d.uploaded_by}</span>
                      </div>
                    </div>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(d)}
                        disabled={deletingId === d.id}
                        className="mt-0.5 shrink-0 rounded p-1 text-destructive hover:bg-destructive/10"
                        title="Remover documento (e réplicas nas transações)"
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
