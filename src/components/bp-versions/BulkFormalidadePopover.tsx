import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { FORMALIDADE_OPTIONS, type FormalidadeState } from "./FormalidadeBadge";

interface Props {
  forecastIds: string[];
  eventId: string;
  /** Optional className override for the trigger button */
  className?: string;
}

/**
 * Botão + popover para alterar a formalidade de múltiplas linhas do BP de uma vez.
 * Usa as mesmas 5 opções do FormalidadeBadge individual. Cada update é feito num
 * único UPDATE … WHERE id = ANY(...) por questão de performance e atomicidade.
 * O trigger `trg_log_formalidade_change` regista cada linha no audit log normalmente.
 */
export function BulkFormalidadePopover({ forecastIds, eventId, className }: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const count = forecastIds.length;

  const updateMutation = useMutation({
    mutationFn: async (next: FormalidadeState) => {
      const { error } = await supabase
        .from("event_forecasts")
        .update({ formalidade: next as any })
        .in("id", forecastIds);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["formalidade-audit", eventId] });
      toast({
        title: "Formalidade atualizada",
        description: `${count} linha(s) marcada(s) como ${
          FORMALIDADE_OPTIONS.find((o) => o.value === next)?.label ?? next
        }.`,
      });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao atualizar",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (count === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent-foreground bg-accent hover:bg-accent/80 transition-colors disabled:opacity-50",
            className,
          )}
          disabled={updateMutation.isPending}
          title="Alterar a formalidade das linhas selecionadas"
        >
          <Tag className="h-3.5 w-3.5" />
          {updateMutation.isPending ? "A aplicar…" : `Mudar Formalidade (${count})`}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="end">
        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Aplicar a {count} linha(s)
        </div>
        <div className="space-y-0.5">
          {FORMALIDADE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate(opt.value)}
              className={cn(
                "w-full flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                "hover:bg-accent disabled:opacity-50",
              )}
            >
              <span aria-hidden className="text-base leading-none mt-0.5">
                {opt.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{opt.label}</div>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  {opt.description}
                </p>
              </div>
            </button>
          ))}
        </div>
        <div className="border-t mt-1 pt-1.5 px-2 pb-1">
          <p className="text-[9px] text-muted-foreground italic">
            Cada mudança é registada no histórico de auditoria.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
