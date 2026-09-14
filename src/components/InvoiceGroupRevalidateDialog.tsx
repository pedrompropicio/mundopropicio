import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { clearInvoiceGroupForTransaction, type InvoiceGroupRevalidation } from "@/lib/invoice-group";

interface Props {
  transactionId: string;
  revalidation: InvoiceGroupRevalidation | null;
  onClose: () => void;
  onUngrouped?: () => void;
}

/**
 * Revalidação do grupo de fatura quando aparece papel novo (2026-09-14).
 *
 * Anexar um documento a uma linha que pertence a um grupo obriga a reconfirmar:
 * se as irmãs têm documentos diferentes, o grupo é suspeito. Foi exatamente isto
 * que faltou no incidente das portagens da nota R-030/2026.
 */
export default function InvoiceGroupRevalidateDialog({
  transactionId,
  revalidation,
  onClose,
  onUngrouped,
}: Props) {
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const open = !!revalidation && revalidation.kind === "conflict";
  const verdict = revalidation?.auditVeredicto ?? null;

  async function handleUngroup() {
    setSaving(true);
    try {
      await clearInvoiceGroupForTransaction(transactionId);
      toast({
        title: "Linha desagrupada",
        description: "Esta transação deixou de partilhar a fatura com as outras linhas.",
      });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["invoice-group"] });
      qc.invalidateQueries({ queryKey: ["invoice-group-progress"] });
      onUngrouped?.();
      onClose();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? "Falha ao desagrupar.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Este documento não bate com as outras linhas da fatura</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left text-sm">
              <p>
                Esta transação está agrupada com {(revalidation?.siblingIds.length ?? 1) - 1} outra(s) linha(s)
                como sendo a mesma fatura, mas os documentos anexos são diferentes.
              </p>
              {verdict === "desagrupar" && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  A leitura dos documentos confirma números de fatura diferentes.
                </p>
              )}
              {verdict === "rever" && (
                <p className="text-xs text-muted-foreground">
                  A leitura dos documentos não foi conclusiva — confirma tu.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Enquanto estiverem agrupadas, partilham identidade e campos, e eliminar ou liquidar uma afeta as
                outras.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Manter agrupadas</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleUngroup();
            }}
            disabled={saving}
          >
            {saving ? "A desagrupar…" : "Desagrupar esta linha"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
