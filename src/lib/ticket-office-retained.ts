/**
 * Helper partilhado — "Retido na Bilheteira" por evento.
 *
 * Reutiliza EXATAMENTE a fórmula do `TicketOfficeBalancePanel`
 *   retido_evento = vendas (ticket_sales) − despesas diretas (tx expense com event_id) − adiantamentos pendentes
 *
 * Tratada como LIQUIDEZ CONDICIONADA: ainda não é caixa livre — depende de
 * regras de repasse bilheteira/sala (ver `withholds_revenue` em
 * `financial_accounts`). NÃO depende de `settlement_id`/`transfer_transaction_id`.
 *
 * Saída: Map<event_id, valor retido em €> apenas para eventos com posição
 * diferente de 0.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/paginated-select";

export interface TicketOfficeRetainedRow {
  eventId: string;
  retained: number;
}

export async function fetchTicketOfficeRetainedByEvent(
  companyId: string,
): Promise<Map<string, number>> {
  // 1. Contas de bilheteira da empresa
  const { data: offices, error: oErr } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("type", "ticket_office" as any);
  if (oErr) throw oErr;
  const officeIds = (offices ?? []).map((o: any) => o.id);
  if (officeIds.length === 0) return new Map();

  // 2. Assignments (eventos vinculados a cada bilheteira)
  const { data: assigns, error: aErr } = await supabase
    .from("event_ticket_office_assignments")
    .select("event_id, financial_account_id")
    .in("financial_account_id", officeIds);
  if (aErr) throw aErr;
  const eventIds = Array.from(new Set((assigns ?? []).map((a: any) => a.event_id)));
  if (eventIds.length === 0) return new Map();

  // 3. Vendas por evento (via zonas)
  const { data: zones, error: zErr } = await supabase
    .from("event_ticket_zones")
    .select("id, event_id")
    .in("event_id", eventIds);
  if (zErr) throw zErr;
  const zoneIds = (zones ?? []).map((z: any) => z.id);
  const zoneEventMap: Record<string, string> = Object.fromEntries(
    (zones ?? []).map((z: any) => [z.id, z.event_id]),
  );

  let sales: any[] = [];
  if (zoneIds.length > 0) {
    // Paginado para contornar limite implícito de 1000 linhas do PostgREST
    const CHUNK = 200;
    for (let i = 0; i < zoneIds.length; i += CHUNK) {
      const slice = zoneIds.slice(i, i + CHUNK);
      const rows = await fetchAllPaginated<any>(() =>
        supabase
          .from("ticket_sales")
          .select("zone_id, quantity, unit_price, financial_account_id")
          .in("zone_id", slice),
      );
      sales.push(...rows);
    }
  }

  // 4. Despesas diretas (tx em conta bilheteira com event_id)
  const { data: txs, error: tErr } = await supabase
    .from("transactions")
    .select("type, paid_amount, event_id, account_id")
    .in("account_id", officeIds);
  if (tErr) throw tErr;

  // 5. Adiantamentos pendentes (ainda sem settlement_id)
  const { data: advances, error: advErr } = await (supabase as any)
    .from("event_ticket_office_advances")
    .select("event_id, amount, financial_account_id, settlement_id")
    .in("financial_account_id", officeIds)
    .is("settlement_id", null);
  if (advErr) throw advErr;

  const map = new Map<string, { sales: number; directExpenses: number; advances: number }>();
  const ensure = (id: string) =>
    map.get(id) ?? map.set(id, { sales: 0, directExpenses: 0, advances: 0 }).get(id)!;

  for (const s of sales) {
    const evId = zoneEventMap[s.zone_id];
    if (!evId) continue;
    ensure(evId).sales += Number(s.quantity || 0) * Number(s.unit_price || 0);
  }
  for (const t of txs ?? []) {
    if (t.type === "expense" && t.event_id) {
      ensure(t.event_id).directExpenses += Number(t.paid_amount || 0);
    }
  }
  for (const a of advances ?? []) {
    if (!a.event_id) continue;
    ensure(a.event_id).advances += Number(a.amount || 0);
  }

  const out = new Map<string, number>();
  for (const [evId, v] of map.entries()) {
    const retained = Math.round((v.sales - v.directExpenses - v.advances) * 100) / 100;
    if (Math.abs(retained) > 0.005) out.set(evId, retained);
  }
  return out;
}
