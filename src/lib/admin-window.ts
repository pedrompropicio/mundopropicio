/**
 * #264 — Janela administrativa (trava real na base).
 * A regra vive em public.enforce_admin_window_event(); este ficheiro só
 * espelha o necessário para o ecrã (pré-preencher, explicar, pedir excepção).
 */
import { supabase } from "@/integrations/supabase/client";

/** 10.1, 10.2, 10.3 e 10.12 nunca podem ser custo do evento da janela. */
export function isAdminWindowLockedCode(code: string | null | undefined): boolean {
  return /^10\.(1|2|3|12)(\.|$)/.test(String(code ?? "").trim());
}

export interface AdminWindowEvent {
  event_id: string;
  event_name: string;
  admin_window_start: string;
  admin_window_end: string | null;
}

/** Evento que absorve para (empresa, data do documento), ou null. */
export async function fetchAdminWindowEvent(
  companyId: string | null | undefined,
  date: string | null | undefined,
): Promise<AdminWindowEvent | null> {
  if (!companyId || !date) return null;
  const { data, error } = await (supabase as any).rpc("admin_window_event_lookup", {
    p_company_id: companyId,
    p_date: date,
  });
  if (error) {
    console.warn("[admin-window] lookup falhou:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row?.event_id ? (row as AdminWindowEvent) : null;
}

/**
 * Excepção autorizada: grava pela RPC (a justificação só vive dentro da
 * transacção da base). Sem transactionId → INSERT de `row`; com → UPDATE das
 * chaves event_id/forecast_id/category_id/date.
 */
export async function writeWithAdminCostOverride(
  reason: string,
  row: Record<string, unknown>,
  transactionId?: string | null,
): Promise<string> {
  const { data, error } = await (supabase as any).rpc("admin_cost_override_write", {
    p_reason: reason,
    p_row: row,
    p_transaction_id: transactionId ?? null,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Insert de UMA transação com o mesmo encadeamento do supabase-js
 * (`.select("id").single()`). Com justificação, passa pela RPC da excepção.
 */
export function makeTxInsert(getReason: () => string | null) {
  return (row: Record<string, unknown>) => ({
    select: (_cols: string) => ({
      single: async (): Promise<{ data: { id: string } | null; error: any }> => {
        const reason = getReason();
        if (!reason) {
          const r = await supabase.from("transactions").insert(row as any).select("id").single();
          return { data: (r.data as any) ?? null, error: r.error };
        }
        try {
          const id = await writeWithAdminCostOverride(reason, row);
          return { data: { id }, error: null };
        } catch (e: any) {
          return { data: null, error: e };
        }
      },
    }),
  });
}
