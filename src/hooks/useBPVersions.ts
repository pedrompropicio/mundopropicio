import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getAuditUser } from "@/lib/audit";
import { toast } from "sonner";

export type BPVersionState = "draft" | "active" | "superseded" | "archived" | "working_draft";

export interface BPVersionRow {
  id: string;
  version_number: number;
  state: BPVersionState;
  scenario_label: string | null;
  scenario_assumptions: Record<string, any> | null;
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
      // Invalidate diff so banner "alterações pendentes" reflects new snapshot
      qc.invalidateQueries({ queryKey: ["event_forecasts", vars.eventId, "active-version-diff"] });
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

/** Archive a non-active version (cascades to splits). */
export function useArchiveBPVersion(eventId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (versionId: string) => {
      const { error } = await supabase.rpc("archive_bp_version" as any, {
        _version_id: versionId,
        _performed_by: user?.id ?? null,
        _performed_by_label: getAuditUser(user),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: versionsKey(eventId) });
      toast.success("Versão arquivada");
    },
    onError: (err: any) => toast.error(err?.message ?? "Falha ao arquivar"),
  });
}

/** Unarchive (restores to draft or superseded). */
export function useUnarchiveBPVersion(eventId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (versionId: string) => {
      const { error } = await supabase.rpc("unarchive_bp_version" as any, {
        _version_id: versionId,
        _performed_by: user?.id ?? null,
        _performed_by_label: getAuditUser(user),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: versionsKey(eventId) });
      toast.success("Versão desarquivada");
    },
    onError: (err: any) => toast.error(err?.message ?? "Falha ao desarquivar"),
  });
}

/** Revert event BP to a previous version (cascades Master→Splits). */
export function useRevertBPVersion(eventId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ versionId, force }: { versionId: string; force?: boolean }) => {
      const { data, error } = await supabase.rpc("revert_to_bp_version" as any, {
        _version_id: versionId,
        _force: force ?? false,
        _performed_by: user?.id ?? null,
        _performed_by_label: getAuditUser(user),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: versionsKey(eventId) });
      qc.invalidateQueries({ queryKey: ["event-forecasts"] });
      qc.invalidateQueries({ queryKey: ["forecasts"] });
      qc.invalidateQueries({ queryKey: ["event_forecasts"] });
      toast.success("BP revertido para a versão selecionada");
    },
    // No onError toast — handled inline so callers can detect "blocked" errors
  });
}

/** Count active forecasts in an event with linked transactions (for revert safety). */
export function useBPLinkedTxCount(eventId: string | undefined | null) {
  return useQuery({
    queryKey: ["bp-linked-tx-count", eventId ?? ""],
    enabled: Boolean(eventId),
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("bp_version_linked_tx_count" as any, {
        _event_id: eventId,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
}

/** Action to apply to each surviving scenario after a sibling is promoted. */
export type OtherScenarioAction = "keep" | "archive" | "discard";

export interface OtherScenarioDecision {
  version_id: string;
  action: OtherScenarioAction;
}

/** Promote a scenario draft to a new active version (cascades to splits). */
export function usePromoteScenario(eventId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      versionId,
      description,
      force,
      otherScenariosActions,
    }: {
      versionId: string;
      description?: string | null;
      force?: boolean;
      otherScenariosActions?: OtherScenarioDecision[];
    }) => {
      const { data, error } = await supabase.rpc("promote_scenario_to_active" as any, {
        _scenario_version_id: versionId,
        _description: description ?? null,
        _performed_by: user?.id ?? null,
        _performed_by_label: getAuditUser(user),
        _force: force ?? false,
        _other_scenarios_actions: (otherScenariosActions ?? []) as any,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: versionsKey(eventId) });
      qc.invalidateQueries({ queryKey: ["event-forecasts"] });
      qc.invalidateQueries({ queryKey: ["forecasts"] });
      qc.invalidateQueries({ queryKey: ["event_forecasts"] });
      toast.success("Cenário promovido — agora é a versão ativa");
    },
    onError: (err: any) => {
      const msg = err?.message ?? "Falha ao promover cenário";
      // Blocks are explicit (P0001) — caller may also display inline; still toast it
      toast.error(msg);
    },
  });
}

/** Toggle the `is_pinned_scenario` flag on a scenario (server enforces max 4 per event). */
export function useToggleScenarioPin(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ versionId, pinned }: { versionId: string; pinned: boolean }) => {
      const { error } = await supabase
        .from("bp_versions" as any)
        .update({ is_pinned_scenario: pinned } as any)
        .eq("id", versionId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: versionsKey(eventId) });
      toast.success(vars.pinned ? "Cenário fixado" : "Cenário desafixado");
    },
    onError: (err: any) => {
      const msg = err?.message ?? "";
      if (msg.includes("Máximo de 4")) {
        toast.error("Máximo de 4 cenários fixados por evento atingido");
      } else {
        toast.error(msg || "Falha ao alterar fixação");
      }
    },
  });
}

/** Permanently discard a draft version (cascades to split drafts). */
export function useDiscardBPVersionDraft(eventId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (versionId: string) => {
      const { error } = await supabase.rpc("discard_bp_version_draft" as any, {
        _version_id: versionId,
        _performed_by: user?.id ?? null,
        _performed_by_label: getAuditUser(user),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: versionsKey(eventId) });
      toast.success("Rascunho descartado");
    },
    onError: (err: any) => toast.error(err?.message ?? "Falha ao descartar"),
  });
}

// ─── Orphan transactions audit ──────────────────────────────────────────────

export type OrphanMatchReason =
  | "strong_match"
  | "category_match"
  | "weak_match"
  | "no_match"
  | "no_candidate";

export interface OrphanTransactionRow {
  transaction_id: string;
  tx_description: string | null;
  tx_amount: number;
  tx_date: string;
  tx_category_id: string | null;
  tx_category_name: string | null;
  tx_status: string | null;
  best_forecast_id: string | null;
  best_forecast_description: string | null;
  best_forecast_amount: number | null;
  match_score: number;
  match_reason: OrphanMatchReason;
}

const orphansKey = (eventId: string) => ["bp-orphan-transactions", eventId];

/** Lists transactions in the event with no link to any active forecast. */
export function useOrphanTransactions(eventId: string | undefined | null) {
  return useQuery({
    queryKey: orphansKey(eventId ?? ""),
    enabled: Boolean(eventId),
    queryFn: async (): Promise<OrphanTransactionRow[]> => {
      const { data, error } = await supabase.rpc(
        "list_orphan_transactions_for_event" as any,
        { _event_id: eventId }
      );
      if (error) throw error;
      return (data ?? []) as OrphanTransactionRow[];
    },
  });
}

export interface RelinkPair {
  transaction_id: string;
  forecast_id: string;
}

export interface RelinkResult {
  relinked_count: number;
  skipped_count: number;
  details: Array<{ transaction_id?: string; forecast_id?: string; reason: string }>;
}

/** Apply auto-relink for selected pairs. */
export function useRelinkOrphanTransactions(eventId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (pairs: RelinkPair[]): Promise<RelinkResult> => {
      const { data, error } = await supabase.rpc(
        "relink_orphan_transactions" as any,
        {
          _event_id: eventId,
          _pairs: pairs as any,
          _performed_by: user?.id ?? null,
          _performed_by_label: getAuditUser(user),
        }
      );
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        relinked_count: row?.relinked_count ?? 0,
        skipped_count: row?.skipped_count ?? 0,
        details: row?.details ?? [],
      } as RelinkResult;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: orphansKey(eventId) });
      qc.invalidateQueries({ queryKey: versionsKey(eventId) });
      qc.invalidateQueries({ queryKey: ["event-forecasts"] });
      qc.invalidateQueries({ queryKey: ["forecasts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      if (res.relinked_count > 0) {
        toast.success(
          `${res.relinked_count} transação(ões) revinculada(s)${
            res.skipped_count > 0 ? ` · ${res.skipped_count} ignorada(s)` : ""
          }`
        );
      } else {
        toast.message("Nenhuma transação foi revinculada");
      }
    },
    onError: (err: any) => toast.error(err?.message ?? "Falha ao revincular"),
  });
}

// ─── Working-draft scenarios (sandbox editável paralela à Ativa) ───────────

/** Cria um cenário working_draft clonando linhas da Ativa (cascateia em turnês). */
export function useCreateScenarioDraft(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      scenarioLabel: string;
      description?: string | null;
      scenarioAssumptions?: Record<string, any> | null;
    }) => {
      const { data, error } = await supabase.rpc("create_scenario_draft" as any, {
        _event_id: eventId,
        _scenario_label: input.scenarioLabel,
        _scenario_assumptions: (input.scenarioAssumptions ?? null) as any,
        _description: input.description ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: versionsKey(eventId) });
      qc.invalidateQueries({ queryKey: ["event-forecasts"] });
      qc.invalidateQueries({ queryKey: ["forecasts"] });
      toast.success(`Cenário "${vars.scenarioLabel}" criado e pronto para editar`);
    },
    onError: (err: any) => toast.error(err?.message ?? "Falha ao criar cenário"),
  });
}

/** Apaga um cenário working_draft (e cascade nos Splits). */
export function useDiscardScenarioDraft(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) => {
      const { error } = await supabase.rpc("discard_scenario_draft" as any, {
        _version_id: versionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: versionsKey(eventId) });
      qc.invalidateQueries({ queryKey: ["event-forecasts"] });
      qc.invalidateQueries({ queryKey: ["forecasts"] });
      toast.success("Cenário descartado");
    },
    onError: (err: any) => toast.error(err?.message ?? "Falha ao descartar cenário"),
  });
}

/** Promove um cenário working_draft a Ativa (cascade Master→Splits). */
export function usePromoteScenarioDraft(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      scenarioVersionId: string;
      newActiveLabel?: string | null;
      newActiveDescription?: string | null;
    }) => {
      const { data, error } = await supabase.rpc(
        "promote_scenario_draft_to_active" as any,
        {
          _scenario_version_id: input.scenarioVersionId,
          _new_active_label: input.newActiveLabel ?? null,
          _new_active_description: input.newActiveDescription ?? null,
        }
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: versionsKey(eventId) });
      qc.invalidateQueries({ queryKey: ["event-forecasts"] });
      qc.invalidateQueries({ queryKey: ["forecasts"] });
      qc.invalidateQueries({ queryKey: ["event_forecasts"] });
      toast.success("Cenário promovido — agora é a versão Ativa");
    },
    onError: (err: any) => toast.error(err?.message ?? "Falha ao promover cenário"),
  });
}
