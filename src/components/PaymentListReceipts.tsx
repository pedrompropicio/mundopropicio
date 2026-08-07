/**
 * Comprovativos ao nível da LISTA de pagamentos.
 *
 * Com o pagamento em lote (ficheiro SEPA Santander) o banco emite UM comprovativo
 * para o lote inteiro. Guardamos o PDF **uma única vez** no bucket
 * `transaction-documents` (path `<company_id>/payment-lists/<list_id>/<ts>.pdf`),
 * registamos em `payment_list_documents` e REPLICAMOS uma linha em
 * `transaction_documents` por transação paga pelo lote — todas a apontar para o
 * MESMO `file_url`. Assim a contabilidade encontra o comprovativo em qualquer
 * transação, pelo mecanismo de anexos já existente.
 *
 * Âmbito da replicação: as transações da exportação SEPA escolhida
 * (`payment_list_sepa_exports.transaction_ids`, default a mais recente). Sem
 * exportações registadas, fallback para todos os itens ativos da lista.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadToCompanyBucket } from "@/lib/storage";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/mock-data";
import { AlertTriangle, FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";

interface Props {
  listId: string;
  listTitle: string;
  /** ids das transações dos itens ativos da lista (fallback de replicação) */
  activeTransactionIds: string[];
}

export default function PaymentListReceipts({ listId, listTitle, activeTransactionIds }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [selectedExportId, setSelectedExportId] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: exports = [] } = useQuery({
    queryKey: ["payment_list_sepa_exports", listId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_list_sepa_exports")
        .select("*")
        .eq("payment_list_id", listId)
        .order("exported_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["payment_list_documents", listId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_list_documents")
        .select("*")
        .eq("payment_list_id", listId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const chosenExport = useMemo(() => {
    if (exports.length === 0) return null;
    return exports.find((e: any) => e.id === selectedExportId) ?? exports[0];
  }, [exports, selectedExportId]);

  const targetTxIds: string[] = useMemo(() => {
    const ids = (chosenExport?.transaction_ids as string[] | undefined) ?? [];
    return ids.length > 0 ? ids : activeTransactionIds;
  }, [chosenExport, activeTransactionIds]);

  const usingFallback = !chosenExport || (chosenExport.transaction_ids ?? []).length === 0;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "Máximo 10MB", variant: "destructive" });
      e.target.value = "";
      return;
    }
    if (targetTxIds.length === 0) {
      toast({ title: "Sem transações para replicar", description: "A lista não tem itens ativos.", variant: "destructive" });
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "pdf";
      const { error: upErr, path } = await uploadToCompanyBucket(
        "transaction-documents",
        `payment-lists/${listId}/${Date.now()}.${ext}`,
        file,
        { contentType: file.type || "application/pdf" },
      );
      if (upErr) throw upErr;

      const docName = `Comprovativo lote — ${listTitle}.${ext}`;
      const uploadedBy = user?.email ?? "sistema";

      const { data: listDoc, error: dbErr } = await supabase
        .from("payment_list_documents")
        .insert({
          payment_list_id: listId,
          name: docName,
          file_url: path,
          doc_type: "pdf",
          uploaded_by: uploadedBy,
          sepa_export_id: usingFallback ? null : chosenExport!.id,
        } as any)
        .select("*")
        .single();
      if (dbErr) throw dbErr;

      // Réplicas nas transações — mesmo file_url, sem duplicar o ficheiro no storage.
      // is_accounting = FALSE: o comprovativo do banco NÃO é documento fiscal e não
      // pode mascarar o relatório de pendências documentais (falta de fatura).
      const { error: repErr } = await supabase.from("transaction_documents").insert(
        targetTxIds.map((txId) => ({
          transaction_id: txId,
          name: docName,
          file_url: path,
          doc_type: "pdf",
          uploaded_by: uploadedBy,
          is_accounting: false,
        })) as any,
      );
      if (repErr) throw repErr;


      queryClient.invalidateQueries({ queryKey: ["payment_list_documents", listId] });
      queryClient.invalidateQueries({ queryKey: ["payment_list_sepa_exports", listId] });
      for (const txId of targetTxIds) {
        queryClient.invalidateQueries({ queryKey: ["transaction_documents", txId] });
        queryClient.invalidateQueries({ queryKey: ["transaction_documents_summary", txId] });
      }
      queryClient.invalidateQueries({ queryKey: ["transactions"] });

      toast({
        title: "Comprovativo anexado",
        description: `Replicado em ${targetTxIds.length} transação(ões).`,
      });
      void listDoc;
    } catch (err: any) {
      toast({ title: "Erro ao anexar comprovativo", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleOpen = async (doc: any) => {
    const { data, error } = await supabase.storage
      .from("transaction-documents")
      .createSignedUrl(doc.file_url, 3600);
    if (error || !data?.signedUrl) {
      toast({ title: "Erro ao abrir ficheiro", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (doc: any) => {
    setDeleting(true);
    try {
      // 1) réplicas nas transações (mesmo file_url)
      const { error: repErr } = await supabase
        .from("transaction_documents")
        .delete()
        .eq("file_url", doc.file_url);
      if (repErr) throw repErr;

      // 2) registo da lista
      const { error: dbErr } = await supabase.from("payment_list_documents").delete().eq("id", doc.id);
      if (dbErr) throw dbErr;

      // 3) ficheiro no storage (único)
      await supabase.storage.from("transaction-documents").remove([doc.file_url]);

      queryClient.invalidateQueries({ queryKey: ["payment_list_documents", listId] });
      queryClient.invalidateQueries({ queryKey: ["payment_list_sepa_exports", listId] });
      for (const txId of activeTransactionIds) {
        queryClient.invalidateQueries({ queryKey: ["transaction_documents", txId] });
        queryClient.invalidateQueries({ queryKey: ["transaction_documents_summary", txId] });
      }
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Comprovativo removido", description: "As réplicas nas transações também foram removidas." });
      setConfirmDelete(null);
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" /> Comprovativos
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
              Anexar comprovativo do lote
            </span>
          </Button>
        </label>
      </div>

      {exports.length > 1 && (
        <div className="mb-2">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Exportação SEPA a que o comprovativo diz respeito
          </label>
          <select
            value={chosenExport?.id ?? ""}
            onChange={(e) => setSelectedExportId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {exports.map((ex: any) => (
              <option key={ex.id} value={ex.id}>
                {formatDate(ex.exported_at)} — {ex.n_transactions} transf. • {formatCurrency(Number(ex.total_amount))} •{" "}
                {ex.file_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {usingFallback ? (
        <p className="mb-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          Sem exportação SEPA registada nesta lista — o comprovativo será replicado em todos os{" "}
          {activeTransactionIds.length} item(ns) ativo(s).
        </p>
      ) : (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Replicação para as {targetTxIds.length} transação(ões) da exportação de {formatDate(chosenExport!.exported_at)}.
        </p>
      )}

      {exports.length > 0 && (
        <div className="mb-3 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Exportações SEPA desta lista
          </p>
          {exports.map((ex: any) => {
            const receipt = docs.find((d: any) => d.sepa_export_id === ex.id);
            return (
              <div key={ex.id} className="flex flex-wrap items-center gap-2 rounded-md bg-background/60 px-2 py-1.5 text-[11px]">
                <span className="min-w-0 flex-1 truncate">
                  {formatDate(ex.exported_at)} — {ex.n_transactions} transf. • {formatCurrency(Number(ex.total_amount))}
                </span>
                {receipt ? (
                  <button
                    onClick={() => handleOpen(receipt)}
                    className="inline-flex items-center gap-1 rounded bg-success/15 px-1.5 py-0.5 font-medium text-success hover:underline"
                    title="Abrir comprovativo do banco"
                  >
                    <FileText className="h-3 w-3" /> com comprovativo
                  </button>
                ) : (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-500">
                    sem comprovativo
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}



      {isLoading ? (
        <p className="text-xs text-muted-foreground">A carregar…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem comprovativos anexados.</p>
      ) : (
        <ul className="space-y-1">
          {docs.map((d: any) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-md bg-background/60 px-2 py-1.5 text-xs">
              <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
              <button onClick={() => handleOpen(d)} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">
                {d.name}
              </button>
              <Badge variant="outline" className="text-[10px]">
                {formatDate(d.uploaded_at)}
              </Badge>
              <span className="text-muted-foreground">{d.uploaded_by}</span>
              <button
                onClick={() => setConfirmDelete(d)}
                className="rounded p-1 text-destructive hover:bg-destructive/10"
                title="Remover comprovativo (e réplicas nas transações)"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirmDelete && (
        <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <p className="mb-2">
            Remover <strong>{confirmDelete.name}</strong>? Isto apaga também as réplicas deste comprovativo em{" "}
            <strong>todas as transações</strong> onde foi replicado, e o ficheiro do armazenamento.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={() => handleDelete(confirmDelete)} disabled={deleting}>
              {deleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Remover
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
