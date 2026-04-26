import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getAuditUser } from "@/lib/audit";
import { toast } from "sonner";

export type BPVersionState = "draft" | "active" | "superseded" | "archived";

export interface BPVersionRow {
  id: string;
  version_number: number;
  state: BPVersionState;
  scenario_label: string | null;
  is_pinned_scenario: boolean;
  description: string | null;
  created_at: string;
  approved_at: string | null;
  superseded_at: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_by_label: string | null;
  cascaded_from_version_id: string | null;
  is_retroactive_snapshot: boolean;
  forecast_count: number;
}

const versionsKey = (eventId: string) => ["bp-versions", eventId];

/**
 * Lists all BP versions for an event (newest first), including scenarios.
 * Uses the SECURITY DEFINER RPC `list_bp_versions` to bypass RLS gracefully.
 */
export function useBPVersions(eventId: string | undefined | null) {
  return useQuery({
    queryKey: versionsKey(eventId ?? ""),
    enabled: Boolean(eventId),
    queryFn: async (): Promise<BPVersionRow[]> => {
      const { data, error } = await supabase.rpc("list_bp_versions" as any, {
        _event_id: eventId,
      });
      if (error) throw error;
      return (data ?? []) as BPVersionRow[];
    },
  });
}

export function useActiveBPVersion(eventId: string | undefined | null) {
  const { data: versions, ...rest } = useBPVersions(eventId);
  const active = (versions ?? []).find((v) => v.state === "active") ?? null;
  return { activeVersion: active, versions: versions ?? [], ...rest };
}

export interface FreezeBPVersionInput {
  eventId: string;
  description?: string | null;
  approveImmediately?: boolean;
  scenarioLabel?: string | null;
  scenarioAssumptions?: Record<string, any> | null;
  isPinnedScenario?: boolean;
}

/**
 * Freezes a new BP version (draft or active) for an event.
 * Cascade to splits is handled server-side by `create_bp_snapshot`.
 */
export function useFreezeBPVersion() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: FreezeBPVersionInput) => {
      const { data, error } = await supabase.rpc("create_bp_snapshot" as any, {
        _event_id: input.eventId,
        _description: input.description ?? null,
        _approve_immediately: input.approveImmediately ?? false,
        _scenario_label: input.scenarioLabel ?? null,
        _scenario_assumptions: (input.scenarioAssumptions ?? null) as any,
        _is_pinned_scenario: input.isPinnedScenario ?? false,
        _created_by: user?.id ?? null,
        _created_by_label: getAuditUser(user),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: versionsKey(vars.eventId) });
      toast.success(
        vars.scenarioLabel
          ? `Cenário "${vars.scenarioLabel}" criado`
          : vars.approveImmediately
            ? "Nova versão ativa criada"
            : "Rascunho de versão criado"
      );
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Falha ao congelar versão");
    },
  });
}
