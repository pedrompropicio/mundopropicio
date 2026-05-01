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
      const row = data as unknown as SponsorshipPipelineRow;

      // Sincroniza com BP/Transação se já estiver fechado/permuta com auto_sync_bp ON.
      // Não bloqueia o fluxo em caso de falha — só faz log + toast.
      try {
        const result = await syncSponsorToBP(row);
        if (result.skipped === false && result.created) {
          toast({ title: "BP e transação criados", description: row.supplier_name });
        }
      } catch (e) {
        console.error("[sponsor-sync] failed", e);
        toast({
          title: "Falha ao sincronizar com BP",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
      }
      return row;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["sponsorship-pipeline", eventId] });
      qc.invalidateQueries({ queryKey: ["sponsorship-activities", row.id] });
      qc.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" }),
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
  return async (id: string, stage: SponsorshipStage, current?: { proposed_amount?: number; confirmed_amount?: number; is_barter?: boolean }) => {
    const patch: Partial<SponsorshipPipelineRow> = { stage };
    // Ao mover para "Fechado" (não permuta), promove o valor proposto para confirmado
    // se o confirmado ainda estiver a 0. Caso contrário, o card aparecia a 0€.
    if (stage === "closed" && !current?.is_barter) {
      const conf = Number(current?.confirmed_amount || 0);
      const prop = Number(current?.proposed_amount || 0);
      if (conf <= 0 && prop > 0) {
        (patch as Record<string, unknown>).confirmed_amount = prop;
      }
    }
    return update.mutateAsync({ id, patch });
  };
}
