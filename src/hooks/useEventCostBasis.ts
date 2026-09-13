import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { normalizePartnerCalcBasis, usesGrossExpenseAmounts } from "@/lib/partner-calc-basis";

/**
 * CRITÉRIO DE CUSTO ÚNICO POR EVENTO — GRAVADO NA BASE DE DADOS.
 *
 * D25 (e2): o critério deixou de viver no localStorage de cada browser. Vive em
 * `events.cost_expense_source` ('realized' | 'committed', default 'committed')
 * e `events.cost_include_overhead' (boolean, default true). Assim o card da
 * capa, o Fecho, o Encontro de Contas, o painel Apuramentos, os PDFs e o Portal
 * do Sócio mostram o MESMO número em qualquer computador.
 *
 * `withVat` continua a vir de `events.partner_calc_basis` (critério contratual)
 * — é derivado, não é preferência de ecrã, e o toggle NUNCA o reescreve.
 *
 * Escrita gated por `manage_bp` (ou admin/manager); erro aparece em toast.
 */

export type CostExpenseSource = "realized" | "committed";

export interface EventCostBasisState {
  withVat: boolean;
  includeOverhead: boolean;
  expenseSource: CostExpenseSource;
}

export interface EventCostBasis extends EventCostBasisState {
  /** Derivado de `partner_calc_basis` — sem efeito, mantido para compatibilidade dos consumidores. */
  setWithVat: (v: boolean) => void;
  setIncludeOverhead: (v: boolean) => void;
  setExpenseSource: (v: CostExpenseSource) => void;
  /** false ⇒ os seletores devem ficar desativados. */
  canEditBasis: boolean;
  isSaving: boolean;
}

interface CostBasisRow {
  cost_expense_source: CostExpenseSource;
  cost_include_overhead: boolean;
  partner_calc_basis: string | null;
}

export const eventCostBasisQueryKey = (eventId: string) => ["event-cost-basis", eventId];

/**
 * @param eventId    Evento (ou master, no caso do Fecho da turnê).
 * @param partnerCalcBasis `events.partner_calc_basis`, quando o consumidor já o tem
 *                         em mão (evita esperar pela query).
 */
export function useEventCostBasis(eventId: string, partnerCalcBasis?: string | null): EventCostBasis {
  const { isAdmin, isManager, hasPermission } = useAuth();
  const canEditBasis = !!(isAdmin || isManager || hasPermission("manage_bp"));
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: eventCostBasisQueryKey(eventId),
    enabled: !!eventId,
    queryFn: async (): Promise<CostBasisRow | null> => {
      const { data, error } = await supabase
        .from("events")
        .select("cost_expense_source, cost_include_overhead, partner_calc_basis")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as CostBasisRow | null;
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<Pick<CostBasisRow, "cost_expense_source" | "cost_include_overhead">>) => {
      const { error } = await supabase.from("events").update(patch as any).eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventCostBasisQueryKey(eventId) });
    },
    onError: (err: any) =>
      toast({
        title: "Não foi possível guardar o critério",
        description: err?.message ?? "Erro",
        variant: "destructive",
      }),
  });

  const guardedSave = useCallback(
    (patch: Partial<Pick<CostBasisRow, "cost_expense_source" | "cost_include_overhead">>) => {
      if (!canEditBasis) {
        toast({
          title: "Sem permissão",
          description: "Só quem edita o Business Plan pode mudar o critério de custo do evento.",
          variant: "destructive",
        });
        return;
      }
      save.mutate(patch);
    },
    [canEditBasis, save],
  );

  const basisSource = partnerCalcBasis !== undefined ? partnerCalcBasis : data?.partner_calc_basis;
  const withVat = usesGrossExpenseAmounts(normalizePartnerCalcBasis(basisSource));

  return {
    withVat,
    includeOverhead: data?.cost_include_overhead ?? true,
    expenseSource: (data?.cost_expense_source ?? "committed") as CostExpenseSource,
    setWithVat: () => {
      /* derivado de partner_calc_basis — não é editável aqui */
    },
    setIncludeOverhead: useCallback((v: boolean) => guardedSave({ cost_include_overhead: v }), [guardedSave]),
    setExpenseSource: useCallback(
      (v: CostExpenseSource) => guardedSave({ cost_expense_source: v }),
      [guardedSave],
    ),
    canEditBasis,
    isSaving: save.isPending,
  };
}
