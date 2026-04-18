import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";
import { Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
 * Indicador visual de que uma transação está vinculada a uma Nota de Reembolso.
 * O pagamento é centralizado na nota — o botão "Pagar" individual fica desativado.
 */
export function ReimbursementNoteRefBadge({ transactionId, variant = "badge" }: Props) {
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

  if (!link?.reimbursement_notes) return null;
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
