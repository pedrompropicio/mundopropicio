import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
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
import { formatCurrency } from "@/lib/mock-data";
import { ensureInvoiceGroup, isGroupableInvoiceRef } from "@/lib/invoice-group";

interface SiblingLike {
  id: string;
  description?: string | null;
  amount: number | string;
  iva_rate?: number | null;
}

interface Props {
  supplierId: string | null;
  invoiceRef: string | null;
  siblings: SiblingLike[];
  /** Estilo compacto para usar ao lado do badge na listagem. */
  compact?: boolean;
  onGrouped?: () => void;
}


/**
 * Fecha o elo entre a DETEÇÃO (mesmo fornecedor + mesmo nº fatura/ATCUD)
 * e o GRUPO DE FATURA formal (`transactions.invoice_group_id`), que é o que
 * a Lista de Pagamento usa para pagar com uma transferência única.
 */
export default function InvoiceGroupAction({ supplierId, invoiceRef, siblings, compact, onGrouped }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  if (!supplierId || !invoiceRef || siblings.length < 2) return null;

  const totalBase = siblings.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalWithIva = siblings.reduce(
    (s, i) => s + Number(i.amount || 0) * (1 + (Number(i.iva_rate ?? 23) || 0) / 100),
    0,
  );
  const groupable = isGroupableInvoiceRef(invoiceRef);

  async function handleGroup() {
    setSaving(true);
    try {
      const res = await ensureInvoiceGroup(supplierId!, invoiceRef!);
      if (!res.groupId) {
        toast({
          title: "Não foi possível agrupar",
          description: "Estas transações já pertencem a grupos diferentes — verifica manualmente.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Fatura agrupada",
          description: `${invoiceRef} — ${res.total} itens no grupo de fatura.`,
        });
        qc.invalidateQueries({ queryKey: ["transactions"] });
        qc.invalidateQueries({ queryKey: ["invoice-group"] });
        qc.invalidateQueries({ queryKey: ["payment-list-items"] });
        onGrouped?.();
      }
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? "Falha ao agrupar a fatura.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Agrupar estas transações como uma única fatura"
        className={
          compact
            ? "inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
            : "inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
        }
      >
        <Link2 className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Agrupar fatura
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Agrupar fatura {invoiceRef}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  {siblings.length} transações do mesmo fornecedor partilham este nº de fatura/ATCUD e ainda não
                  formam um grupo de fatura. Ao agrupar, a Lista de Pagamento passa a tratá-las como
                  <strong> Fatura Agrupada</strong> e paga com uma transferência única.
                </p>
                <div className="space-y-0.5 rounded-md border p-2 text-xs">
                  {siblings.map((s) => (
                    <div key={s.id} className="flex justify-between gap-3">
                      <span className="truncate">{s.description ?? "—"}</span>
                      <span className="font-mono shrink-0">{formatCurrency(Number(s.amount || 0))}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between gap-3 border-t pt-1 font-semibold">
                    <span>Soma das bases</span>
                    <span className="font-mono">{formatCurrency(totalBase)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Total c/ IVA a transferir</span>
                    <span className="font-mono">{formatCurrency(totalWithIva)}</span>
                  </div>
                </div>
                {!groupable && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Atenção: “{invoiceRef}” parece uma referência genérica (ex.: proforma). Confirma que é mesmo a
                    mesma fatura antes de agrupar.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleGroup();
              }}
              disabled={saving}
            >
              {saving ? "A agrupar…" : "Agrupar fatura"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
