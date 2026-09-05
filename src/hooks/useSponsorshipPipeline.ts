import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  SponsorshipActivityRow,
  SponsorshipPipelineRow,
  SponsorshipStage,
} from "@/lib/sponsorship-pipeline";
import { syncSponsorToBP } from "@/lib/sponsorship-bp-sync";
import { toast } from "@/hooks/use-toast";

export function useSponsorshipPipeline(eventId: string | null | undefined) {
  return useQuery({
    queryKey: ["sponsorship-pipeline", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sponsorship_pipeline" as never)
        .select("*")
        .eq("event_id", eventId!)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SponsorshipPipelineRow[];
    },
  });
}

export function useSponsorshipActivities(pipelineId: string | null | undefined) {
  return useQuery({
    queryKey: ["sponsorship-activities", pipelineId],
    enabled: !!pipelineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sponsorship_pipeline_activities" as never)
        .select("*")
        .eq("pipeline_id", pipelineId!)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SponsorshipActivityRow[];
    },
  });
}

export function useCreateSponsor(eventId: string, companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<SponsorshipPipelineRow> & { supplier_name: string }) => {
      if (!companyId) throw new Error("Empresa não identificada.");
      const { data, error } = await supabase
        .from("sponsorship_pipeline" as never)
        .insert({
          event_id: eventId,
          company_id: companyId,
          stage: "lead",
          currency: "EUR",
          iva_rate: 23,
          priority: "medium",
          auto_sync_bp: true,
          ...input,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as SponsorshipPipelineRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sponsorship-pipeline", eventId] });
      toast({ title: "Patrocinador adicionado" });
    },
    onError: (e: Error) =>
      toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateSponsor(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SponsorshipPipelineRow> }) => {
      const { data, error } = await supabase
        .from("sponsorship_pipeline" as never)
        .update(patch as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as SponsorshipPipelineRow;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["sponsorship-pipeline", eventId] });
      qc.invalidateQueries({ queryKey: ["sponsorship-activities", row.id] });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" }),
  });
}

/**
 * Mutation MANUAL: cria ou atualiza BP+TX a partir do card.
 * Disparada pelo botão "Gerar BP+TX" / "Atualizar BP+TX" no drawer.
 */
export function useSyncSponsorBP(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: SponsorshipPipelineRow) => {
      const result = await syncSponsorToBP(row);
      return result;
    },
    onSuccess: (result, row) => {
      qc.invalidateQueries({ queryKey: ["sponsorship-pipeline", eventId] });
      qc.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      if (result.skipped === true) {
        const reasons: Record<string, string> = {
          barter_pipeline_only: "Permutas ficam só no pipeline.",
          no_company: "Empresa não identificada.",
          zero_amount: "O valor confirmado tem de ser maior que zero.",
          stage_not_closed: "Só patrocínios fechados entram no BP.",
          half_linked: "Vínculo incompleto (só existe um dos lados). Corrige o vínculo antes de gerar.",
          "category_1.2.01_not_found": "Categoria 1.2.01 (Patrocínios) não existe nesta empresa.",
        };

        toast({
          title: "Não foi possível gerar BP/TX",
          description: reasons[result.reason] ?? result.reason,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: result.created ? "BP e transação criados" : "BP e transação atualizados",
        description: row.supplier_name,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao sincronizar", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteSponsor(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("sponsorship_pipeline" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sponsorship-pipeline", eventId] });
      toast({ title: "Patrocinador removido" });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao remover", description: e.message, variant: "destructive" }),
  });
}

export function useAddSponsorNote(pipelineId: string, companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      if (!companyId) throw new Error("Empresa não identificada.");
      const { error } = await supabase.from("sponsorship_pipeline_activities" as never).insert({
        pipeline_id: pipelineId,
        company_id: companyId,
        kind: "note",
        body,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sponsorship-activities", pipelineId] });
    },
    onError: (e: Error) =>
      toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useChangeStage(eventId: string) {
  const update = useUpdateSponsor(eventId);
  return async (
    id: string,
    stage: SponsorshipStage,
    extraPatch?: Partial<SponsorshipPipelineRow>,
  ) => {
    const patch: Partial<SponsorshipPipelineRow> = { stage, ...(extraPatch ?? {}) };
    return update.mutateAsync({ id, patch });
  };
}
