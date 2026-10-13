import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateEventFinancials } from "@/lib/invalidate-event-financials";

/**
 * Para gravações diretas (sem useMutation): chamar no fim de cada gravação bem-sucedida,
 * para os cartões do evento não dependerem só do Realtime (D-ERP266).
 */
export function useInvalidateEventFinancials() {
  const qc = useQueryClient();
  return useCallback((eventIds?: (string | null | undefined)[]) => invalidateEventFinancials(qc, eventIds), [qc]);
}
