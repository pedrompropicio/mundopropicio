/**
 * #335 fase 3b — leitura dos grupos do encontro de contas (só leitura; ficha da transação
 * e detalhe do grupo). Tabelas: transaction_offset_groups / transaction_offset_items
 * (supabase/manual/20261021_issue335_offset_group_storage.INERTE.sql); RLS decide o que se vê.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "./load";
import { readOffsetControl } from "./rpc";

const db = supabase as any;

export const OFFSET_CONTROL_KEY = ["offset-control"] as const;
export const OFFSET_GROUPS_KEY = "offset-groups";

export interface OffsetGroupParticipation {
  group_id: string;
  operation_date: string;
  status: string;
  supplier_name: string | null;
  movement_amount: number;
  cash_amount: number;
  compensation_amount: number;
}

export interface OffsetGroupDetailItem {
  id: string;
  transaction_id: string;
  forecast_id: string | null;
  type: "income" | "expense";
  cash_order: number;
  gross_amount: number;
  prior_paid_amount: number;
  open_amount: number;
  cash_amount: number;
  compensation_amount: number;
  description: string | null;
  invoice_ref: string | null;
}

export interface OffsetGroupDetail {
  id: string;
  status: string;
  operation_date: string;
  movement_amount: number;
  supplier_name: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
  bank_line: { booking_date: string | null; description: string | null; amount: number } | null;
  items: OffsetGroupDetailItem[];
}

/** Controlo N0/N1/N2; leitura falhada = fechado. */
export function useOffsetControl() {
  return useQuery({
    queryKey: OFFSET_CONTROL_KEY,
    staleTime: 30_000,
    queryFn: () => readOffsetControl(db),
  });
}

/** Encontros em que uma transação participa. */
export async function fetchGroupsForTransaction(client: any, txId: string): Promise<OffsetGroupParticipation[]> {
  const items = await readAllPages<any>("itens do encontro", (from, to) =>
    client
      .from("transaction_offset_items")
      .select(
        "id, group_id, cash_amount, compensation_amount, transaction_offset_groups!inner(id, operation_date, status, movement_amount, suppliers(name))",
      )
      .eq("transaction_id", txId)
      .order("id", { ascending: true })
      .range(from, to),
  );
  return items.map((i) => ({
    group_id: i.group_id,
    operation_date: i.transaction_offset_groups?.operation_date,
    status: i.transaction_offset_groups?.status,
    supplier_name: i.transaction_offset_groups?.suppliers?.name ?? null,
    movement_amount: Number(i.transaction_offset_groups?.movement_amount ?? 0),
    cash_amount: Number(i.cash_amount),
    compensation_amount: Number(i.compensation_amount),
  }));
}

export function useOffsetGroupsForTransaction(txId: string | undefined) {
  return useQuery({
    queryKey: [OFFSET_GROUPS_KEY, "tx", txId],
    enabled: !!txId,
    queryFn: () => fetchGroupsForTransaction(db, txId!),
  });
}

export async function fetchGroupDetail(client: any, groupId: string): Promise<OffsetGroupDetail | null> {
  const { data: g, error } = await client
    .from("transaction_offset_groups")
    .select(
      "id, status, operation_date, movement_amount, reversed_at, reversal_reason, bank_line_id, suppliers(name), bank_statement_lines!transaction_offset_groups_bank_line_id_fkey(booking_date, description, amount)",
    )
    .eq("id", groupId)
    .maybeSingle();
  if (error) throw error;
  if (!g) return null;
  const items = await readAllPages<any>("itens do encontro", (from, to) =>
    client
      .from("transaction_offset_items")
      .select(
        "id, transaction_id, forecast_id, type, cash_order, gross_amount, prior_paid_amount, open_amount, cash_amount, compensation_amount, transactions(description, invoice_ref)",
      )
      .eq("group_id", groupId)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const line = g.bank_statement_lines;
  return {
    id: g.id,
    status: g.status,
    operation_date: g.operation_date,
    movement_amount: Number(g.movement_amount),
    supplier_name: g.suppliers?.name ?? null,
    reversed_at: g.reversed_at,
    reversal_reason: g.reversal_reason,
    bank_line: line ? { booking_date: line.booking_date, description: line.description, amount: Number(line.amount) } : null,
    items: items
      .map((i) => ({
        id: i.id,
        transaction_id: i.transaction_id,
        forecast_id: i.forecast_id,
        type: i.type,
        cash_order: i.cash_order,
        gross_amount: Number(i.gross_amount),
        prior_paid_amount: Number(i.prior_paid_amount),
        open_amount: Number(i.open_amount),
        cash_amount: Number(i.cash_amount),
        compensation_amount: Number(i.compensation_amount),
        description: i.transactions?.description ?? null,
        invoice_ref: i.transactions?.invoice_ref ?? null,
      }))
      .sort((a, b) => a.cash_order - b.cash_order),
  };
}

export function useOffsetGroupDetail(groupId: string | null) {
  return useQuery({
    queryKey: [OFFSET_GROUPS_KEY, "detail", groupId],
    enabled: !!groupId,
    queryFn: () => fetchGroupDetail(db, groupId!),
  });
}

export const OFFSET_GROUP_STATUS_LABEL: Record<string, string> = {
  preparing: "Em preparação",
  applied: "Aplicado",
  reversing: "Em estorno",
  reversed: "Estornado",
};
