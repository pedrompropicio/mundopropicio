/**
 * Segmentos de patrocínio + verbas por segmento (DR-2026-09-05-D22).
 * Nada aqui altera cards, linhas de BP ou transações existentes.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface SponsorshipSegment {
  id: string;
  company_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface EventSponsorshipTarget {
  id: string;
  event_id: string;
  company_id: string;
  segment_id: string;
  amount: number;
  baseline_amount: number | null;
  notes: string | null;
}

export function useSponsorshipSegments(companyId?: string | null) {
  return useQuery({
    queryKey: ["sponsorship-segments", companyId ?? "current"],
    queryFn: async () => {
      let q = supabase
        .from("sponsorship_segments" as never)
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (companyId) q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SponsorshipSegment[];
    },
  });
}

export function useUpsertSponsorshipSegment(companyId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; is_active?: boolean; sort_order?: number }) => {
      if (input.id) {
        const { error } = await supabase
          .from("sponsorship_segments" as never)
          .update({
            name: input.name,
            ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
            ...(input.sort_order !== undefined ? { sort_order: input.sort_order } : {}),
          } as never)
          .eq("id", input.id);
        if (error) throw error;
        return;
      }
      if (!companyId) throw new Error("Empresa não identificada.");
      const { error } = await supabase.from("sponsorship_segments" as never).insert({
        company_id: companyId,
        name: input.name,
        sort_order: input.sort_order ?? 100,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sponsorship-segments"] });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useEventSponsorshipTargets(eventId: string | null | undefined, extraEventIds: string[] = []) {
  const ids = Array.from(new Set([eventId, ...extraEventIds])).filter(Boolean) as string[];
  return useQuery({
    queryKey: ["event-sponsorship-targets", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sponsorship_targets" as never)
        .select("*")
        .in("event_id", ids);
      if (error) throw error;
      return (data ?? []) as unknown as EventSponsorshipTarget[];
    },
  });
}

/** Cria ou actualiza a verba de um segmento. `baseline_amount` nunca é reescrito. */
export function useSaveSponsorshipTargets(eventId: string, companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { segment_id: string; amount: number; existingId?: string }[]) => {
      for (const r of rows) {
        if (r.existingId) {
          const { error } = await supabase
            .from("event_sponsorship_targets" as never)
            .update({ amount: r.amount } as never)
            .eq("id", r.existingId);
          if (error) throw error;
        } else {
          if (!companyId) throw new Error("Empresa não identificada.");
          if (!(r.amount > 0)) continue;
          const { error } = await supabase.from("event_sponsorship_targets" as never).insert({
            event_id: eventId,
            company_id: companyId,
            segment_id: r.segment_id,
            amount: r.amount,
          } as never);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-sponsorship-targets"] });
      qc.invalidateQueries({ queryKey: ["bp_income_sponsorship_synthetic"] });
      toast({ title: "Verbas guardadas" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

/** Encerra (ou reabre) a captação de patrocínios do evento. */
export function useCloseSponsorshipCapture(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (close: boolean) => {
      const { error } = await supabase
        .from("events")
        .update({ sponsorship_closed_at: close ? new Date().toISOString() : null } as never)
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bp_income_sponsorship_synthetic"] });
      qc.invalidateQueries({ queryKey: ["event"] });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
