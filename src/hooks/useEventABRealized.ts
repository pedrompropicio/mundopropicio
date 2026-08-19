import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Realizado (fecho) do módulo A&B lido DAS TRANSAÇÕES do evento — sem dupla
 * entrada de dados. Não escreve nada; é uma vista de leitura.
 *
 * Identificação das transações A&B (união de critérios):
 *  (a) `payment_reference` com padrão de acerto de bares (ACERTO...BAR%),
 *      ex.: "ACERTO-BARES-ANITTA-2026";
 *  (b) receitas na categoria F&B (1.1.03) + despesas nas rubricas DERIVADAS
 *      das transações encontradas por (a) — no próprio evento e, em fallback,
 *      nas rubricas globalmente usadas em acertos de bares cujo nome de
 *      categoria seja inequivocamente A&B (bar/bebida/alimento/A&B/F&B).
 *      Isto evita arrastar rubricas genéricas (ex.: "Staff") para eventos que
 *      lançaram o fecho sem referência de acerto (caso Coala).
 *
 * Só conta realizado: status paid / partially_paid / approved.
 */

const AB_REF_PATTERN = "%ACERTO%BAR%";
const FNB_INCOME_CODE = "1.1.03";
const REALIZED_STATUSES = ["paid", "partially_paid", "approved"];

const AB_CATEGORY_KEYWORDS = ["bar", "bebida", "alimento", "a&b", "f&b", "open bar"];

function isAbCategoryName(name: string | null | undefined): boolean {
  const n = (name || "").toLowerCase();
  return AB_CATEGORY_KEYWORDS.some((k) => n.includes(k));
}

export interface ABRealizedLine {
  id: string;
  description: string;
  amount: number;
  categoryCode: string | null;
  categoryName: string | null;
  paymentReference: string | null;
}

export interface ABRealizedResult {
  hasData: boolean;
  receita: number;
  despesas: number;
  resultado: number;
  incomeLines: ABRealizedLine[];
  expenseLines: ABRealizedLine[];
  /** referências de acerto encontradas (para a nota de origem) */
  references: string[];
}

const EMPTY: ABRealizedResult = {
  hasData: false,
  receita: 0,
  despesas: 0,
  resultado: 0,
  incomeLines: [],
  expenseLines: [],
  references: [],
};

const SELECT =
  "id, type, description, amount, status, payment_reference, category_id, account_categories!transactions_category_id_fkey(code, name)";

const toLine = (t: any): ABRealizedLine => ({
  id: t.id,
  description: t.description || "(sem descrição)",
  amount: Number(t.amount || 0),
  categoryCode: t.account_categories?.code ?? null,
  categoryName: t.account_categories?.name ?? null,
  paymentReference: t.payment_reference ?? null,
});

export function useEventABRealized(eventId: string | undefined) {
  const { data = EMPTY, isLoading } = useQuery({
    queryKey: ["ab_realized_from_tx", eventId],
    enabled: !!eventId,
    queryFn: async (): Promise<ABRealizedResult> => {
      // (a) transações com referência de acerto de bares no evento
      const { data: refTx, error: refErr } = await supabase
        .from("transactions")
        .select(SELECT)
        .eq("event_id", eventId!)
        .in("status", REALIZED_STATUSES)
        .ilike("payment_reference", AB_REF_PATTERN);
      if (refErr) throw refErr;

      // rubricas de despesa derivadas do próprio evento
      const derivedCatIds = new Set<string>();
      for (const t of (refTx ?? []) as any[]) {
        if (t.type === "expense" && t.category_id) derivedCatIds.add(t.category_id);
      }

      // fallback global: rubricas usadas em acertos de bares de outros eventos,
      // filtradas por nome de categoria inequivocamente A&B
      if (derivedCatIds.size === 0) {
        const { data: globalTx, error: gErr } = await supabase
          .from("transactions")
          .select("category_id, type, account_categories!transactions_category_id_fkey(name)")
          .eq("type", "expense")
          .ilike("payment_reference", AB_REF_PATTERN)
          .limit(1000);
        if (gErr) throw gErr;
        for (const t of (globalTx ?? []) as any[]) {
          if (t.category_id && isAbCategoryName(t.account_categories?.name)) {
            derivedCatIds.add(t.category_id);
          }
        }
      }

      // (b) receitas F&B + despesas nas rubricas derivadas
      const { data: catTx, error: catErr } = await supabase
        .from("transactions")
        .select(SELECT)
        .eq("event_id", eventId!)
        .in("status", REALIZED_STATUSES)
        .not("category_id", "is", null);
      if (catErr) throw catErr;

      const byId = new Map<string, any>();
      for (const t of (refTx ?? []) as any[]) byId.set(t.id, t);
      for (const t of (catTx ?? []) as any[]) {
        if (byId.has(t.id)) continue;
        const code = t.account_categories?.code ?? "";
        if (t.type === "income" && code === FNB_INCOME_CODE) byId.set(t.id, t);
        else if (t.type === "expense" && derivedCatIds.has(t.category_id)) byId.set(t.id, t);
      }

      const all = Array.from(byId.values());
      if (all.length === 0) return EMPTY;

      const incomeLines = all
        .filter((t) => t.type === "income")
        .map(toLine)
        .sort((a, b) => b.amount - a.amount);
      const expenseLines = all
        .filter((t) => t.type === "expense")
        .map(toLine)
        .sort((a, b) => b.amount - a.amount);

      const receita = incomeLines.reduce((s, l) => s + l.amount, 0);
      const despesas = expenseLines.reduce((s, l) => s + l.amount, 0);
      const references = Array.from(
        new Set(all.map((t) => t.payment_reference).filter(Boolean) as string[]),
      );

      return {
        hasData: true,
        receita,
        despesas,
        resultado: receita - despesas,
        incomeLines,
        expenseLines,
        references,
      };
    },
  });

  return { ...data, isLoading };
}
