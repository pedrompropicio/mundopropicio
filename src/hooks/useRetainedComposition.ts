import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { computeTicketOfficeBalance, decomposeTicketOfficeRetained, type RetainedDecomposition } from "@/lib/ticket-office-balance";
import { loadTicketOfficeStatements, type TicketOfficeStatementsRead, type TicketOfficeStatementsReadClient } from "@/hooks/useTicketOfficeStatements";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/contexts/AuthContext";

export interface RetainedCompositionEvent { id: string; name: string; balance: number }
export interface RetainedComposition {
  accountId: string;
  globalBalance: number;
  decomposition: RetainedDecomposition<RetainedCompositionEvent> | null;
  /** Absent in legacy output, preserving its serialized consumer contract. */
  statementsRead?: Exclude<TicketOfficeStatementsRead, { status: "legacy" }>;
}

/** P6b: mesmas leituras do TicketOfficeBalancePanel, com o JWT do utilizador; fórmula só em ticket-office-balance.ts. */
export async function loadRetainedComposition(officeId: string, options: {
  companyId?: string; client?: TicketOfficeStatementsReadClient;
} = {}): Promise<RetainedComposition> {
  const db = options.client ?? supabase as any;
  const [asg, sales, txns, adv, settled, statements] = await Promise.all([
    db.from("event_ticket_office_assignments").select("event_id, events(id, name, status)").eq("financial_account_id", officeId),
    db.rpc("get_ticket_office_sales", { p_account_id: officeId }),
    fetchAllPagedQuery(db.from("transactions")
      .select("account_id, type, amount, paid_amount, status, event_id, description, reversed_at, is_hidden, category_id")
      .eq("account_id", officeId)),
    db.from("event_ticket_office_advances").select("event_id, amount, transaction_id, settlement_id")
      .eq("financial_account_id", officeId).is("settlement_id", null),
    db.from("ticket_office_settlements").select("event_id").eq("financial_account_id", officeId),
    loadTicketOfficeStatements(officeId, { ...options, client: db }),
  ]);
  for (const r of [asg, sales, txns, adv, settled]) if (r.error) throw r.error;
  const assignments = (asg.data || []).filter((a: any) => a.events);
  const saleRows = (sales.data || []).map((r: any) => ({
    event_id: r.event_id, financial_account_id: officeId, quantity: Number(r.quantity || 0), unit_price: 0, total_value: Number(r.revenue || 0),
  }));
  const { total, byEvent } = computeTicketOfficeBalance({
    officeId, assignedEventIds: assignments.map((a: any) => a.event_id), sales: saleRows, transactions: txns.data || [], advances: adv.data || [],
  });
  const events: RetainedCompositionEvent[] = assignments.map((a: any) => ({ id: a.event_id as string, name: a.events.name as string, balance: byEvent[a.event_id] ?? 0 }));
  return {
    accountId: officeId,
    globalBalance: total,
    decomposition: statements.status === "v2_unavailable" ? null : decomposeTicketOfficeRetained({
      globalBalance: total, events, statements: statements.statements,
      settledEventIds: (settled.data || []).map((r: any) => r.event_id).filter(Boolean),
      ...(statements.status === "v2" ? { provenance: statements.provenance } : {}),
    }),
    ...(statements.status !== "legacy" ? { statementsRead: statements } : {}),
  };
}

export function useRetainedComposition(accountIds: string[], enabled: boolean) {
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["financial-position-retained-composition", companyId, user?.id, [...accountIds].sort()],
    enabled: enabled && !!companyId && !!user && accountIds.length > 0,
    queryFn: () => Promise.all(accountIds.map((id) => loadRetainedComposition(id, { companyId: companyId! }))),
    staleTime: 0,
    retry: false,
  });
}
