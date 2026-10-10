import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { matchSepaBankExecutions, SEPA_RETURN_WINDOW_DAYS, type BeBankLine, type BeSepaExport, type BeTx } from "@/lib/sepa/bank-execution";

/**
 * #37 ponto 3 — sugestão do retorno do banco para as exportações SEPA.
 * Filtra por lista (payment_list_id) ou por transação (transaction_ids contém).
 * Leitura apenas; a confirmação grava em payment_list_bank_executions.
 */
export function useSepaBankExecution(filter: { listId?: string; transactionId?: string }) {
  const enabled = !!(filter.listId || filter.transactionId);
  return useQuery({
    queryKey: ["sepa-bank-execution", filter.listId ?? null, filter.transactionId ?? null],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from("payment_list_sepa_exports")
        .select("id, payment_list_id, exported_at, total_amount, transaction_ids")
        .order("exported_at", { ascending: true });
      if (filter.listId) q = q.eq("payment_list_id", filter.listId);
      if (filter.transactionId) q = q.contains("transaction_ids", [filter.transactionId]);
      const { data: exps, error } = await q.limit(200);
      if (error) throw error;
      let exports = (exps ?? []) as BeSepaExport[];
      // Para a vista da transação, mantém as exportações da mesma lista (concorrência pela linha do banco).
      if (filter.transactionId && exports.length > 0) {
        const listIds = Array.from(new Set(exports.map((e) => e.payment_list_id)));
        const { data: all, error: e2 } = await supabase
          .from("payment_list_sepa_exports")
          .select("id, payment_list_id, exported_at, total_amount, transaction_ids")
          .in("payment_list_id", listIds)
          .limit(200);
        if (e2) throw e2;
        exports = (all ?? []) as BeSepaExport[];
      }
      if (exports.length === 0) return { exports, results: [], txById: new Map<string, BeTx>(), coverageFrom: null, coverageTo: null };

      const [{ data: first }, { data: last }] = await Promise.all([
        supabase.from("bank_statement_lines").select("booking_date").order("booking_date", { ascending: true }).limit(1),
        supabase.from("bank_statement_lines").select("booking_date").order("booking_date", { ascending: false }).limit(1),
      ]);
      const coverageFrom = (first?.[0] as any)?.booking_date ?? null;
      const coverageTo = (last?.[0] as any)?.booking_date ?? null;

      const minDate = exports.map((e) => e.exported_at.slice(0, 10)).sort()[0];
      const maxD = new Date(`${exports.map((e) => e.exported_at.slice(0, 10)).sort().slice(-1)[0]}T00:00:00Z`);
      maxD.setUTCDate(maxD.getUTCDate() + SEPA_RETURN_WINDOW_DAYS);
      const { data: lines, error: le } = await fetchAllPagedQuery(
        supabase
          .from("bank_statement_lines")
          .select("id, booking_date, amount, description, matched_sepa_export_id, matched_transaction_id")
          .lt("amount", 0)
          .gte("booking_date", minDate)
          .lte("booking_date", maxD.toISOString().slice(0, 10))
          .order("id", { ascending: true }),
      );
      if (le) throw le;

      const txIds = Array.from(new Set(exports.flatMap((e) => e.transaction_ids ?? [])));
      const txById = new Map<string, BeTx & { description?: string | null }>();
      for (let i = 0; i < txIds.length; i += 100) {
        const { data: txs, error: te } = await supabase
          .from("transactions")
          .select("id, amount, iva_rate, paid_amount, description, suppliers(name)")
          .in("id", txIds.slice(i, i + 100))
          .limit(100);
        if (te) throw te;
        for (const t of (txs ?? []) as any[]) {
          const gross = Number(t.amount || 0) * (1 + Number(t.iva_rate || 0) / 100);
          txById.set(t.id, { id: t.id, amount: Number(t.paid_amount) > 0 ? Number(t.paid_amount) : gross, supplier_name: t.suppliers?.name ?? null, description: t.description });
        }
      }

      const { data: conf, error: ce } = await supabase
        .from("payment_list_bank_executions")
        .select("sepa_export_id, transaction_id, bank_statement_line_id")
        .in("sepa_export_id", exports.map((e) => e.id))
        .limit(1000);
      if (ce) throw ce;
      const confirmed = new Map<string, string>(((conf ?? []) as any[]).map((c) => [`${c.sepa_export_id}|${c.transaction_id}`, c.bank_statement_line_id]));

      const results = matchSepaBankExecutions({
        exports: exports.map((e) => ({ ...e, transaction_ids: e.transaction_ids ?? [] })),
        lines: (lines ?? []) as BeBankLine[],
        txById,
        coverageFrom,
        coverageTo,
        confirmed,
      });
      return { exports, results, txById, coverageFrom, coverageTo };
    },
  });
}
