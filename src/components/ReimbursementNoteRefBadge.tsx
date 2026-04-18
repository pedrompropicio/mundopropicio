import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";
import { Wallet, Link2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LinkReimbursementNoteModal } from "@/components/LinkReimbursementNoteModal";

interface Props {
  transactionId: string;
  /** "badge" → pílula compacta para listagem; "banner" → faixa informativa para modais */
  variant?: "badge" | "banner";
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pending: "Pendente",
  approved: "Aprovada",
  paid: "Paga",
  cancelled: "Cancelada",
};

/**
 * Indicador visual de Reembolso. Três estados:
 *  - vinculado a nota → badge azul (info da nota)
 *  - marcado como reembolso SEM nota → badge âmbar de alerta + botão "Vincular Nota"
 *  - não é reembolso → não renderiza nada
 */
export function ReimbursementNoteRefBadge({ transactionId, variant = "badge" }: Props) {
  const queryClient = useQueryClient();
  const [showLinkModal, setShowLinkModal] = useState(false);

  const { data: link } = useQuery({
    queryKey: ["transaction_reimbursement_link", transactionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_note_items")
        .select("reimbursement_note_id, reimbursement_notes:reimbursement_note_id(id, code, status, employee_name)")
        .eq("transaction_id", transactionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  // Even if no link, check if transaction is flagged as reimbursement (orphan state)
  const { data: tx } = useQuery({
    queryKey: ["transaction_reimbursement_flag", transactionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("is_reimbursement, reimbursement_to, status")
        .eq("id", transactionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
    enabled: !link?.reimbursement_notes,
  });

  // Linked to a note → existing behaviour
  if (link?.reimbursement_notes) {
    const note: any = link.reimbursement_notes;
    const statusLabel = STATUS_LABELS[note.status] ?? note.status;

    if (variant === "banner") {
      return (
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground flex items-start gap-2">
          <Wallet className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium">
              Vinculada à Nota de Reembolso{" "}
              <RouterLink to="/reembolsos" className="text-primary hover:underline">
                {note.code}
              </RouterLink>{" "}
              <span className="text-muted-foreground">({statusLabel})</span>
            </div>
            <p className="text-muted-foreground mt-0.5">
              {note.employee_name ? `Colaborador: ${note.employee_name}. ` : ""}
              O pagamento é efetuado ao liquidar a nota — não é possível pagar esta transação isoladamente.
            </p>
          </div>
        </div>
      );
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary cursor-help">
            <Wallet className="h-3 w-3" />
            Reembolso {note.code}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs space-y-0.5">
          <p className="font-medium">Em Nota de Reembolso {note.code} ({statusLabel})</p>
          {note.employee_name && <p className="text-muted-foreground">Colaborador: {note.employee_name}</p>}
          <p className="text-muted-foreground">Pagamento centralizado ao liquidar a nota.</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Orphan: marked as reimbursement but not linked to any note
  if (tx?.is_reimbursement) {
    const isPaid = tx.status === "paid";

    const handleInvalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["transaction_reimbursement_link", transactionId] });
      queryClient.invalidateQueries({ queryKey: ["transaction_reimbursement_flag", transactionId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["reimbursement-notes"] });
    };

    if (variant === "banner") {
      return (
        <>
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-amber-600 dark:text-amber-400">
                Marcada como Reembolso, sem Nota vinculada
              </div>
              <p className="text-muted-foreground mt-0.5">
                {tx.reimbursement_to ? `Colaborador indicado: ${tx.reimbursement_to}. ` : ""}
                Vincule a uma Nota de Reembolso para centralizar o pagamento, ou desmarque como reembolso para tratar como despesa normal.
              </p>
              {!isPaid && (
                <button
                  type="button"
                  onClick={() => setShowLinkModal(true)}
                  className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 transition-colors"
                >
                  <Link2 className="h-3 w-3" /> Vincular ou Desmarcar
                </button>
              )}
            </div>
          </div>
          {showLinkModal && (
            <LinkReimbursementNoteModal
              transactionId={transactionId}
              defaultEmployeeName={tx.reimbursement_to || ""}
              onClose={() => { setShowLinkModal(false); handleInvalidate(); }}
            />
          )}
        </>
      );
    }

    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (!isPaid) setShowLinkModal(true); }}
              disabled={isPaid}
              className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              <AlertCircle className="h-3 w-3" />
              Reembolso (sem nota)
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs space-y-0.5">
            <p className="font-medium">Reembolso sem Nota vinculada</p>
            {tx.reimbursement_to && <p className="text-muted-foreground">Colaborador: {tx.reimbursement_to}</p>}
            <p className="text-muted-foreground">{isPaid ? "Transação já paga — sem ações disponíveis." : "Clique para vincular a uma Nota ou desmarcar como reembolso."}</p>
          </TooltipContent>
        </Tooltip>
        {showLinkModal && (
          <LinkReimbursementNoteModal
            transactionId={transactionId}
            defaultEmployeeName={tx.reimbursement_to || ""}
            onClose={() => { setShowLinkModal(false); handleInvalidate(); }}
          />
        )}
      </>
    );
  }

  return null;
}
