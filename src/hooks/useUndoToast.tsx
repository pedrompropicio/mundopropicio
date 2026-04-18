import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { executeUndo } from "@/lib/undo";

interface ShowUndoToastOptions {
  message: string;
  description?: string;
  undoId: string;
  user: { id: string; name?: string };
  onUndone?: () => void;
  durationMs?: number;
}

/**
 * Shows a toast with an "Undo" action button.
 * Calls executeUndo on click and triggers onUndone for query invalidation.
 */
export function showUndoToast({
  message,
  description,
  undoId,
  user,
  onUndone,
  durationMs = 15000,
}: ShowUndoToastOptions) {
  const { dismiss } = toast({
    title: message,
    description: description ?? "Toque em Desfazer nos próximos 15 segundos.",
    duration: durationMs,
    action: (
      <ToastAction
        altText="Desfazer"
        onClick={async () => {
          try {
            await executeUndo(undoId, user);
            toast({ title: "Ação desfeita com sucesso" });
            onUndone?.();
          } catch (err: any) {
            toast({
              title: "Erro ao desfazer",
              description: err.message,
              variant: "destructive",
            });
          } finally {
            dismiss();
          }
        }}
      >
        Desfazer
      </ToastAction>
    ),
  });
}
