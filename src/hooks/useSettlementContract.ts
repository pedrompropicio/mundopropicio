/** #415 E2b. Prepared reader/writer, intentionally unused until the consumers are released. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { invalidateEventFinancials } from "@/lib/invalidate-event-financials";
import { fetchAllPaged } from "@/lib/supabase-paging";
import { contractRecord, resolveSettlementContract, type ContractExpenseSource, type SettlementContractNode } from "@/lib/settlement-contract";
import type { PartnerCalcBasis } from "@/lib/partner-calc-basis";

export const SETTLEMENT_CONTRACT_SELECT = "id,company_id,event_id,parent_id,parent_share_basis,is_sealed,contract_expense_source,contract_include_overhead,contract_revision,contract_initialized_at,contract_initialized_by";
export const SETTLEMENT_OVERHEAD_SELECT = "id,company_id,event_id,settlement_id,participant_kind,mode,supports_overhead";
export interface SettlementOverheadRow {
  id: string; company_id: string; event_id: string; settlement_id: string;
  participant_kind: "house" | "partner"; mode: "settles" | "nominal"; supports_overhead: boolean;
}
export interface SettlementContractReceipt {
  ok: true; request_key: string; settlement_id: string; participant_id: string | null;
  revision: number; expense_source: ContractExpenseSource; include_overhead: boolean;
  supports_overhead: boolean | null; changed_by: string;
}
export function parseSettlementContractReceipt(raw: unknown): SettlementContractReceipt {
  const r = contractRecord(raw, ["ok", "request_key", "settlement_id", "participant_id", "revision", "expense_source", "include_overhead", "supports_overhead", "changed_by"]);
  if (r.ok !== true || typeof r.request_key !== "string" || !r.request_key || typeof r.settlement_id !== "string" || !r.settlement_id
    || (r.participant_id !== null && (typeof r.participant_id !== "string" || !r.participant_id))
    || !Number.isSafeInteger(r.revision) || (r.revision as number) < 1
    || !["realized", "committed"].includes(r.expense_source as string) || typeof r.include_overhead !== "boolean"
    || (r.supports_overhead !== null && typeof r.supports_overhead !== "boolean") || typeof r.changed_by !== "string" || !r.changed_by) throw new Error("Invalid settlement contract receipt");
  return r as unknown as SettlementContractReceipt;
}
export type SettlementContractCommand =
  | { operation: "initialize"; expenseSource: ContractExpenseSource | null; includeOverhead: boolean | null; reason: string; requestKey: string }
  | { operation: "set"; expenseSource: ContractExpenseSource | null; includeOverhead: boolean | null; expectedRevision: number; reason: string; requestKey: string }
  | { operation: "participant"; participantId: string; supportsOverhead: boolean; expectedRevision: number; reason: string; requestKey: string };

/** g4 is supplied by the caller's existing event reader; no visual cost fields are read here. */
export function useSettlementContract(eventId: string, settlementId: string, partnerCalcBasis: PartnerCalcBasis | null) {
  const { user, role, permissions, loading: authLoading, isAdmin, isManager } = useAuth();
  const { companyId, isLoading: companyLoading } = useCompany();
  const qc = useQueryClient();
  const enabled = !!user && !!companyId && !!eventId && !!settlementId && !authLoading && !companyLoading;
  const canEdit = enabled && (isAdmin || isManager);
  const query = useQuery({
    // efc- participates in the central event-financial invalidation policy.
    queryKey: ["efc-settlement-contract", companyId, user?.id, role, permissions, eventId, settlementId, partnerCalcBasis],
    enabled,
    retry: false,
    queryFn: async () => {
      const limit = 20000;
      const [rawNodes, rawParticipants] = await Promise.all([
        fetchAllPaged<unknown>((from, to) => supabase.from("event_settlements").select(SETTLEMENT_CONTRACT_SELECT)
          .eq("company_id", companyId!).eq("event_id", eventId).order("id").range(from, to), { maxRows: limit }),
        fetchAllPaged<unknown>((from, to) => supabase.from("event_settlement_participants").select(SETTLEMENT_OVERHEAD_SELECT)
          .eq("company_id", companyId!).eq("event_id", eventId).order("id").range(from, to), { maxRows: limit }),
      ]);
      if (rawNodes.length >= limit || rawParticipants.length >= limit) throw new Error("Incomplete settlement contract read");
      const contracts = resolveSettlementContract(rawNodes.map((row) => ({ ...(row as Omit<SettlementContractNode, "partner_calc_basis">), partner_calc_basis: partnerCalcBasis })));
      const ids = new Set(contracts.map((c) => c.settlementId));
      const participants = rawParticipants.map((raw) => {
        const p = contractRecord(raw, ["id", "company_id", "event_id", "settlement_id", "participant_kind", "mode", "supports_overhead"]);
        if (typeof p.id !== "string" || !p.id || p.company_id !== companyId || p.event_id !== eventId
          || typeof p.settlement_id !== "string" || !ids.has(p.settlement_id)
          || !["house", "partner"].includes(p.participant_kind as string) || !["settles", "nominal"].includes(p.mode as string)
          || typeof p.supports_overhead !== "boolean" || ((p.participant_kind === "house" || p.mode === "nominal") && !p.supports_overhead)) throw new Error("Invalid settlement overhead participant");
        return p as unknown as SettlementOverheadRow;
      });
      if (new Set(participants.map((p) => p.id)).size !== participants.length) throw new Error("Duplicate settlement participant");
      const nodes = rawNodes as { company_id: string; event_id: string }[];
      if (nodes.some((n) => n.company_id !== companyId || n.event_id !== eventId)) throw new Error("Contract outside active company/event");
      const contract = contracts.find((c) => c.settlementId === settlementId);
      if (!contract || contracts.some((c) => c.state === "invalid")) throw new Error("Invalid settlement contract tree");
      return { contracts, contract, participants };
    },
  });
  const command = useMutation({
    mutationFn: async (input: SettlementContractCommand) => {
      if (!canEdit) throw new Error("Sem permissão para alterar contrato");
      const common = { p_reason: input.reason, p_request_key: input.requestKey };
      const name = input.operation === "initialize" ? "initialize_settlement_contract"
        : input.operation === "set" ? "set_settlement_contract" : "set_settlement_participant_overhead";
      const args = input.operation === "participant"
        ? { ...common, p_participant_id: input.participantId, p_supports_overhead: input.supportsOverhead, p_expected_revision: input.expectedRevision }
        : { ...common, p_settlement_id: settlementId, p_expense_source: input.expenseSource, p_include_overhead: input.includeOverhead,
          ...(input.operation === "set" ? { p_expected_revision: input.expectedRevision } : {}) };
      if (input.operation === "participant" && !query.data?.participants.some((p) => p.id === input.participantId && p.settlement_id === settlementId)) throw new Error("Participant outside selected settlement");
      // Local RPC contract until a separately approved catalog refresh generates types.ts.
      const { data, error } = await supabase.rpc(name as never, args as never);
      if (error) throw error;
      const receipt = parseSettlementContractReceipt(data);
      if (receipt.revision !== (input.operation === "initialize" ? 1 : input.expectedRevision + 1)
        || receipt.settlement_id !== settlementId || receipt.request_key !== input.requestKey || receipt.changed_by !== user!.id
        || receipt.participant_id !== (input.operation === "participant" ? input.participantId : null)
        || receipt.supports_overhead !== (input.operation === "participant" ? input.supportsOverhead : null)) throw new Error("Settlement contract receipt mismatch");
      return receipt;
    },
    onSuccess: () => invalidateEventFinancials(qc, [eventId]),
  });
  return { ...query, canEdit, command };
}
