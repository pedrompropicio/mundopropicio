/**
 * Badge "Parte de terceiros" (D-ERP69) — linha marcada com uma conta de
 * circuito. Se a ponte `shared_cost_mirror` já tem espelho, diz que a posição
 * está lançada.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SharedCostBadge({ transactionId }: { transactionId: string }) {
  const { data: mirrored } = useQuery({
    queryKey: ["shared-cost-mirror", transactionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shared_cost_mirror" as any)
        .select("mirror_transaction_id")
        .eq("source_transaction_id", transactionId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-0.5 rounded border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-600 dark:text-teal-400 cursor-help">
          🤝 Parte de terceiros{mirrored ? " · posição lançada" : ""}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <p>
          Adiantamento por conta de terceiros: não é custo da MP, fica fora do resultado e não
          consome verba do BP.{" "}
          {mirrored
            ? "A contrapartida já está lançada na conta corrente do circuito."
            : "A contrapartida na conta do circuito é lançada quando esta linha for paga."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export default SharedCostBadge;
