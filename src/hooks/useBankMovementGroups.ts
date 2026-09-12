/**
 * Ponte NOVA e ISOLADA entre o Extrato da Conta e o mundo da conciliação.
 *
 * O extrato passa a saber o que o BANCO agrupou num único movimento. Dependência
 * explícita e contida a este hook: `bank_statement_lines`, `bank_line_transactions`
 * e `payment_list_sepa_exports`. Se qualquer leitura falhar ou vier vazia, o hook
 * devolve índices vazios e o extrato continua a funcionar linha a linha.
 *
 * NÃO escreve nada. NÃO toca em transações, na conciliação nem no saldo.
 *
 * Precedência:
 *   1. linha do banco com `matched_sepa_export_id` → transações do lote, com
 *      fusão dos exports IRMÃOS (mesma `payment_list_id`, mesmo total ±0,01),
 *      porque a dupla geração é o MESMO acontecimento (igual ao `sepaSiblings`);
 *   2. linha do banco com ponte `bank_line_transactions` → as N transações;
 *   3. `matched_transaction_id` / `created_transaction_id` → UMA transação, não
 *      forma grupo (fica de fora do índice);
 *   4. recurso, só para transações sem linha do banco: `payment_list_sepa_exports`
 *      com a mesma fusão de irmãos.
 * A fonte do banco ganha sempre. Uma transação pertence a no máximo um grupo.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabase-paging";
import type { StatementGroup } from "@/lib/statement-grouping";

interface BankLine {
  id: string;
  booking_date: string | null;
  description: string | null;
  amount: number | null;
  status: string | null;
  matched_sepa_export_id: string | null;
  matched_transaction_id: string | null;
  created_transaction_id: string | null;
}

interface SepaExport {
  id: string;
  payment_list_id: string | null;
  msg_id: string | null;
  total_amount: number | null;
  transaction_ids: string[] | null;
}

export interface BankMovementIndex {
  /** txId → groupId. */
  byTx: Map<string, string>;
  groups: Map<string, StatementGroup>;
  /** true quando alguma das leituras novas falhou (o ecrã degrada para linha a linha). */
  degraded: boolean;
}

const EMPTY: BankMovementIndex = { byTx: new Map(), groups: new Map(), degraded: false };

export function useBankMovementGroups(accountId: string, enabled: boolean): BankMovementIndex {
  const linesQuery = useQuery({
    queryKey: ["stmt-groups-bank-lines", accountId],
    enabled: enabled && !!accountId,
    queryFn: async (): Promise<BankLine[]> =>
      await fetchAllPaged<BankLine>((from, to) =>
        supabase
          .from("bank_statement_lines")
          .select(
            "id, booking_date, description, amount, status, matched_sepa_export_id, matched_transaction_id, created_transaction_id",
          )
          .eq("financial_account_id", accountId)
          .eq("status", "matched")
          .order("id", { ascending: true })
          .range(from, to) as any,
      ),
  });

  const lineIds = useMemo(() => (linesQuery.data ?? []).map((l) => l.id), [linesQuery.data]);

  const bridgeQuery = useQuery({
    queryKey: ["stmt-groups-bridge", accountId, lineIds.length],
    enabled: enabled && lineIds.length > 0,
    queryFn: async () => {
      const out: { line_id: string; transaction_id: string }[] = [];
      for (let i = 0; i < lineIds.length; i += 200) {
        const { data, error } = await supabase
          .from("bank_line_transactions")
          .select("line_id, transaction_id")
          .in("line_id", lineIds.slice(i, i + 200));
        if (error) throw error;
        out.push(...((data ?? []) as any[]));
      }
      return out;
    },
  });

  const sepaQuery = useQuery({
    queryKey: ["stmt-groups-sepa-exports"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SepaExport[]> =>
      await fetchAllPaged<SepaExport>((from, to) =>
        supabase
          .from("payment_list_sepa_exports")
          .select("id, payment_list_id, msg_id, total_amount, transaction_ids")
          .order("id", { ascending: true })
          .range(from, to) as any,
      ),
  });

  return useMemo(() => {
    if (!enabled) return EMPTY;
    const degraded = !!(linesQuery.error || bridgeQuery.error || sepaQuery.error);
    const bankLines = linesQuery.data ?? [];
    const bridge = bridgeQuery.data ?? [];
    const exports_ = sepaQuery.data ?? [];
    if (bankLines.length === 0 && exports_.length === 0) return { ...EMPTY, degraded };

    /** Exports irmãos: mesma lista de pagamento e mesmo total (±0,01). */
    const siblingsOf = (e: SepaExport): SepaExport[] =>
      exports_.filter(
        (o) =>
          o.payment_list_id === e.payment_list_id &&
          Math.abs(Number(o.total_amount ?? 0) - Number(e.total_amount ?? 0)) <= 0.01,
      );
    const exportById = new Map(exports_.map((e) => [e.id, e]));

    const byTx = new Map<string, string>();
    const groups = new Map<string, StatementGroup>();

    const claim = (txIds: string[], group: StatementGroup) => {
      const own = txIds.filter((id) => id && !byTx.has(id));
      if (own.length === 0) return;
      groups.set(group.groupId, { ...group, txIds: own });
      own.forEach((id) => byTx.set(id, group.groupId));
    };

    const bridgeByLine = new Map<string, string[]>();
    bridge.forEach((r) => {
      const arr = bridgeByLine.get(r.line_id) ?? [];
      arr.push(r.transaction_id);
      bridgeByLine.set(r.line_id, arr);
    });

    // ---- Fonte primária: o que o banco confirmou --------------------------
    for (const l of bankLines) {
      const bankAmount = l.amount == null ? null : Number(l.amount);
      const base = {
        source: "bank" as const,
        bankDate: l.booking_date ? String(l.booking_date).slice(0, 10) : null,
        bankAmount,
      };
      if (l.matched_sepa_export_id) {
        const e = exportById.get(l.matched_sepa_export_id);
        if (e) {
          const ids = Array.from(
            new Set(siblingsOf(e).flatMap((s) => s.transaction_ids ?? [])),
          );
          claim(ids, {
            ...base,
            groupId: `bank:${l.id}`,
            description: l.description || `Lote SEPA · ${e.msg_id ?? "sem referência"}`,
          });
          continue;
        }
      }
      const bridged = bridgeByLine.get(l.id) ?? [];
      if (bridged.length > 1) {
        claim(Array.from(new Set(bridged)), {
          ...base,
          groupId: `bank:${l.id}`,
          description: l.description || "Movimento do banco",
        });
      }
      // matched_transaction_id / created_transaction_id: uma transação só, não
      // forma grupo — nada a indexar.
    }

    // ---- Recurso: lotes SEPA sem linha do banco conciliada ----------------
    const emittedSepa = new Set<string>();
    for (const e of exports_) {
      if (emittedSepa.has(e.id)) continue;
      const sibs = siblingsOf(e);
      sibs.forEach((s) => emittedSepa.add(s.id));
      const ids = Array.from(new Set(sibs.flatMap((s) => s.transaction_ids ?? [])));
      claim(ids, {
        groupId: `sepa:${e.id}`,
        source: "sepa",
        bankDate: null,
        bankAmount: null,
        description: `Lote SEPA · ${e.msg_id ?? "sem referência"}`,
      });
    }

    // Grupos que sobraram com 0 ou 1 transação própria não são grupos.
    for (const [gid, g] of groups) {
      if (g.txIds.length <= 1) {
        g.txIds.forEach((id) => byTx.delete(id));
        groups.delete(gid);
      }
    }

    return { byTx, groups, degraded };
  }, [enabled, linesQuery.data, linesQuery.error, bridgeQuery.data, bridgeQuery.error, sepaQuery.data, sepaQuery.error]);
}
