import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { computeTicketOfficeBalance, decomposeTicketOfficeRetained, type RetainedDecomposition } from "@/lib/ticket-office-balance";

export interface RetainedCompositionEvent { id: string; name: string; balance: number }
export interface RetainedComposition {
  accountId: string;
  globalBalance: number;
  decomposition: RetainedDecomposition<RetainedCompositionEvent> | null;
}

/** P6b: mesmas leituras do TicketOfficeBalancePanel, com o JWT do utilizador; fórmula só em ticket-office-balance.ts. */
export async function loadRetainedComposition(officeId: string): Promise<RetainedComposition> {
  const db = supabase as any;
  const [asg, sales, txns, adv, settled, statements] = await Promise.all([
    db.from("event_ticket_office_assignments").select("event_id, events(id, name, status)").eq("financial_account_id", officeId),
    db.rpc("get_ticket_office_sales", { p_account_id: officeId }),
    fetchAllPagedQuery(db.from("transactions")
      .select("account_id, type, amount, paid_amount, status, event_id, description, reversed_at, is_hidden, category_id")
      .eq("account_id", officeId)),
    db.from("event_ticket_office_advances").select("event_id, amount, transaction_id, settlement_id")
      .eq("financial_account_id", officeId).is("settlement_id", null),
    db.from("ticket_office_settlements").select("event_id").eq("financial_account_id", officeId),
    db.from("ticket_office_statements")
      .select("id, number, statement_date, document_total, status, ticket_office_statement_lines!ticket_office_statement_lines_statement_id_fkey(id, line_type, position, description, amount, event_id)")
      .eq("financial_account_id", officeId).order("statement_date", { ascending: false }),
  ]);
  for (const r of [asg, sales, txns, adv, settled, statements]) if (r.error) throw r.error;
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
    decomposition: decomposeTicketOfficeRetained({
      globalBalance: total, events, statements: statements.data || [],
      settledEventIds: (settled.data || []).map((r: any) => r.event_id).filter(Boolean),
    }),
  };
}

export function useRetainedComposition(accountIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["financial-position-retained-composition", [...accountIds].sort()],
    enabled: enabled && accountIds.length > 0,
    queryFn: () => Promise.all(accountIds.map(loadRetainedComposition)),
    staleTime: 0,
    retry: false,
  });
}
