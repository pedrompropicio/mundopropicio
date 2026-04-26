import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
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
import { Lock } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** IDs of forecast rows that are eligible (estimado/negociacao) to be moved to "Fechado". */
  eligibleForecastIds: string[];
  eventId: string;
  /** Optional context label to disambiguate trigger ("após gerar transação", "após aprovar"). */
  triggerLabel?: string;
}

/**
 * Confirmation dialog shown after generating transactions from BP lines (single
 * or bulk). Asks the user whether the affected lines should be moved to the
 * "Fechado" formalidade state. Per project rule "automações sempre com
 * validação do utilizador" — we never silently flip the formalidade.
 *
 * Lines already in `fechado`/`pago_parcial`/`pago_total` are filtered upstream;
 * this dialog only acts on `estimado`/`negociacao` rows.
 */
export function MarkAsFechadoDialog({
  open,
  onOpenChange,
  eligibleForecastIds,
  eventId,
  triggerLabel = "após gerar transações",
}: Props) {
  const queryClient = useQueryClient();
  const count = eligibleForecastIds.length;

  const markFechadoMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("event_forecasts")
        .update({ formalidade: "fechado" })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      toast({
        title: `${count} linha(s) marcada(s) como Fechado`,
        description: "Estado de formalidade atualizado.",
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao atualizar formalidade",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleConfirm = () => markFechadoMutation.mutate(eligibleForecastIds);
  const handleSkip = () => onOpenChange(false);

  if (count === 0) return null;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !markFechadoMutation.isPending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Marcar como "Fechado"?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              {count === 1
                ? `1 linha do BP foi atualizada ${triggerLabel}.`
                : `${count} linhas do BP foram atualizadas ${triggerLabel}.`}
            </span>
            <span className="block">
              Como agora o valor está comprometido, sugerimos passar
              {count === 1 ? " esta linha" : " essas linhas"} para o estado{" "}
              <strong className="text-primary">Fechado</strong> (valor blindado).
            </span>
            <span className="block text-xs text-muted-foreground italic">
              Apenas linhas em "Estimado" ou "Negociação" são afetadas. Pode sempre alterar manualmente
              o estado mais tarde.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={markFechadoMutation.isPending} onClick={handleSkip}>
            Manter como está
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={markFechadoMutation.isPending}>
            <Lock className="h-4 w-4 mr-1.5" />
            {markFechadoMutation.isPending
              ? "A atualizar…"
              : `Marcar como Fechado${count > 1 ? ` (${count})` : ""}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
