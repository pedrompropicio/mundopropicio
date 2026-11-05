import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { createTreasuryQueue, loadTreasuryEvent, loadTreasuryRetained } from "@/hooks/useTreasuryBridge";
import { supabase } from "@/integrations/supabase/client";
import { FINANCIAL_POSITION_PERMISSION } from "@/lib/financial-position";
import { stageMapFromRows } from "@/lib/event-stage";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { buildTreasuryBridge, TREASURY_STAGES, treasuryNumber, type TreasuryCashRow, type TreasuryEvent, type TreasuryNode } from "@/lib/treasury-bridge";

const db = supabase as unknown as Parameters<typeof loadTreasuryEvent>[0];
async function read<T>(request: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await request;
  if (error) throw error;
  if (data === null) throw new Error("Leitura indisponível na Tesouraria.");
  return data;
}

/** Leitura independente da DRE: o motor e todas as regras da ponte pertencem ao D2-a-r. */
export function useEventTreasuryBridge(eventIds: string[], enabled: boolean) {
  const { user, loading: authLoading, hasPermission, permissions } = useAuth();
  const { companyId, isLoading, isError } = useCompany();
  const run = useMemo(() => createTreasuryQueue(), []);
  const ids = [...new Set(eventIds)].sort();
  const allowed = enabled && !authLoading && !!user && !!companyId && !isLoading && !isError
    && hasPermission(FINANCIAL_POSITION_PERMISSION);
  const query = useQuery({
    queryKey: ["event-treasury-bridge", companyId, user?.id, permissions, ids],
    enabled: allowed && ids.length > 0,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, TreasuryNode>> => {
      const [events, stageRows, businessLines, retained, cashRows] = await Promise.all([
        run(() => read<TreasuryEvent[]>(fetchAllPagedQuery(db.from("events").select("*").eq("company_id", companyId)))),
        run(() => read<{ event_id: string; stage: string }[]>(db.rpc("event_stage_list", {}))),
        run(() => read<{ id: string; name: string }[]>(fetchAllPagedQuery(db.from("business_lines").select("id, name").eq("company_id", companyId)))),
        run(() => loadTreasuryRetained(db, companyId!)),
        run(() => read<TreasuryCashRow[]>(db.rpc("get_event_cash_position", {
          p_company_id: companyId, p_date_from: null, p_date_to: null,
        }))),
      ]);
      const stages = stageMapFromRows(stageRows);
      const masterIds = new Set(ids.map((id) => {
        const event = events.find((e) => e.id === id);
        if (!event) throw new Error("Evento indisponível na Tesouraria.");
        const masterId = event.parent_event_id ?? id;
        if (!stages[masterId]) throw new Error("Estágio indisponível na Tesouraria.");
        return masterId;
      }));
      const masters = events.filter((e) => masterIds.has(e.id) && !e.parent_event_id && TREASURY_STAGES.has(stages[e.id]));
      const results = await Promise.all(masters.map((e) => run(async () => [e.id, await loadTreasuryEvent(db, companyId!, e.id, stages[e.id])] as const)));
      const cash = cashRows.map((row) => {
        if (!["event", "common"].includes(row.level) || (row.level === "event" && !row.event_id)) throw new Error("Posição no pool inválida.");
        return { ...row, committed: treasuryNumber(row.committed), realized: treasuryNumber(row.realized), pending: treasuryNumber(row.pending) };
      });
      const bridge = buildTreasuryBridge({ events, businessLines, cash, retained,
        stages: Object.fromEntries(masters.map((e) => [e.id, stages[e.id]])), results: Object.fromEntries(results) });
      return Object.fromEntries(bridge.company.children.flatMap((line) => line.children.flatMap((node) => [node, ...node.children])).map((node) => [node.id, node]));
    },
  });
  return {
    nodes: allowed && !query.error ? query.data : undefined,
    loading: enabled && allowed && ids.length > 0 && query.isPending,
    error: enabled ? isError ? new Error("Não foi possível identificar a empresa.")
      : !authLoading && !isLoading && !allowed ? new Error("Sem acesso à ponte da Tesouraria.") : query.error : null,
  };
}
