import { useState } from "react";
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
import { ensureInvoiceGroup } from "@/lib/invoice-group";

export interface InvoiceGroupSuggestion {
  supplierId: string;
  supplierName?: string | null;
  invoiceRef: string;
  total: number;
  /** Porque é que o sistema não agrupa sozinho. */
  reason?: "conflict" | "no_documents";
}

interface Props {
  suggestion: InvoiceGroupSuggestion | null;
  onClose: () => void;
  onGrouped?: () => void;
}

/**
 * Diálogo mostrado quando existem N transações do mesmo fornecedor com o mesmo
 * nº de fatura mas SEM prova documental de serem a mesma fatura: documentos
 * anexos diferentes, ou nenhum documento (2026-09-14). Agrupar é sempre um ato
 * explícito — nada é agrupado sem resposta humana.
 */
export default function InvoiceGroupSuggestDialog({ suggestion, onClose, onGrouped }: Props) {
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    if (!suggestion) return;
    setSaving(true);
    try {
      const res = await ensureInvoiceGroup(suggestion.supplierId, suggestion.invoiceRef, { force: true });
      if (res.groupId) {
        toast({
          title: "Fatura agrupada",
          description: `${suggestion.invoiceRef} — ${res.total} itens no grupo de fatura.`,
        });
        onGrouped?.();
      } else {
        toast({
          title: "Não foi possível agrupar",
          description: "Estas transações já pertencem a grupos diferentes — verifica manualmente.",
          variant: "destructive",
        });
      }
      onClose();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? "Falha ao agrupar.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={!!suggestion} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>É mesmo a mesma fatura?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left text-sm">
              <p>
                Existem {suggestion?.total ?? 0} transações de{" "}
                <strong>{suggestion?.supplierName ?? "este fornecedor"}</strong> com o nº{" "}
                <strong>{suggestion?.invoiceRef}</strong>{" "}
                {suggestion?.reason === "no_documents"
                  ? "mas nenhuma tem documento anexo, por isso não há prova de que seja a mesma fatura."
                  : "mas com documentos anexos diferentes."}{" "}
                É mesmo a mesma fatura?
              </p>
              <p className="text-xs text-muted-foreground">
                Agrupar faz as linhas partilharem identidade, campos, eliminação e liquidação. Se forem
                talões/faturas diferentes, corrige o nº de fatura em cada linha — nada será agrupado.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Não, são faturas diferentes</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={saving}
          >
            {saving ? "A agrupar…" : "Sim, agrupar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
