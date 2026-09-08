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
}

interface Props {
  suggestion: InvoiceGroupSuggestion | null;
  onClose: () => void;
  onGrouped?: () => void;
}

/**
 * Diálogo mostrado quando existem N transações do mesmo fornecedor com o mesmo
 * nº de fatura mas com DOCUMENTOS ANEXOS DIFERENTES. Nada é agrupado sem
 * resposta explícita (incidente 2026-09: três talões de combustível distintos
 * agrupados como uma fatura só).
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
                <strong>{suggestion?.invoiceRef}</strong> mas com documentos anexos diferentes. É mesmo a
                mesma fatura?
              </p>
              <p className="text-xs text-muted-foreground">
                Se forem talões/faturas diferentes, corrige o nº de fatura em cada linha — nada será agrupado.
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
