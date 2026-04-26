import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
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
import { Lock, Undo2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** IDs of forecast rows that are eligible (estimado/negociacao) to be moved to "Fechado". */
  eligibleForecastIds: string[];
  eventId: string;
  /** Optional context label to disambiguate trigger ("após gerar transação", "após aprovar"). */
  triggerLabel?: string;
}

/** Janela durante a qual o botão "Desfazer" fica activo no toast. */
const UNDO_WINDOW_MS = 8000;

/**
 * Confirmation dialog shown after generating transactions from BP lines (single
 * or bulk). Asks the user whether the affected lines should be moved to the
 * "Fechado" formalidade state. Per project rule "automações sempre com
 * validação do utilizador" — we never silently flip the formalidade.
 *
 * Lines already in `fechado`/`pago_parcial`/`pago_total` are filtered upstream;
 * this dialog only acts on `estimado`/`negociacao` rows.
 *
 * Após confirmar, mostramos um toast com Desfazer (8s) que reverte cada linha
 * para o seu estado anterior (snapshot tirado antes do UPDATE). Como cada linha
 * pode ter um estado prévio diferente (estimado vs negociacao), o rollback é
 * agrupado por estado.
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
      if (ids.length === 0) return { previousStates: [] as Array<{ id: string; formalidade: string }> };
      // 1. Snapshot estados anteriores para suportar Desfazer.
      const { data: previousStates, error: snapshotError } = await supabase
        .from("event_forecasts")
        .select("id, formalidade")
        .in("id", ids);
      if (snapshotError) throw snapshotError;

      // 2. Marca a próxima escrita como auto-sugerida (lida pelo trigger de log).
      //    Se a RPC não existir/falhar, o UPDATE prossegue como manual.
      try {
        await supabase.rpc("set_config" as any, {
          parameter: "app.formalidade_auto_suggested",
          value: "true",
          is_local: true,
        });
      } catch {
        /* noop — log apenas perde a flag auto */
      }

      // 3. Aplicar UPDATE para "fechado".
      const { error } = await supabase
        .from("event_forecasts")
        .update({ formalidade: "fechado" })
        .in("id", ids);
      if (error) throw error;

      return { previousStates: previousStates ?? [] };
    },
    onSuccess: ({ previousStates }) => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });

      // Reverte agrupando por estado original (todos os "estimado" juntos, etc).
      const handleUndo = async () => {
        try {
          const groups = new Map<string, string[]>();
          for (const row of previousStates) {
            const prev = row.formalidade ?? "estimado";
            if (prev === "fechado") continue; // já estava fechado, nada a reverter
            const arr = groups.get(prev) ?? [];
            arr.push(row.id);
            groups.set(prev, arr);
          }

          for (const [prevState, rowIds] of groups) {
            const { error } = await supabase
              .from("event_forecasts")
              .update({ formalidade: prevState as any })
              .in("id", rowIds);
            if (error) throw error;
          }

          queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
          toast({
            title: "Alteração revertida",
            description: `${previousStates.length} linha(s) voltaram ao estado anterior.`,
          });
        } catch (err: any) {
          toast({
            title: "Erro ao desfazer",
            description: err.message,
            variant: "destructive",
          });
        }
      };

      const seconds = Math.round(UNDO_WINDOW_MS / 1000);
      toast({
        title: `${count} linha(s) marcada(s) como Fechado`,
        description: `Toque em Desfazer nos próximos ${seconds} segundos para reverter.`,
        duration: UNDO_WINDOW_MS,
        action: (
          <ToastAction altText="Desfazer" onClick={handleUndo}>
            <Undo2 className="h-3.5 w-3.5 mr-1" />
            Desfazer
          </ToastAction>
        ),
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
