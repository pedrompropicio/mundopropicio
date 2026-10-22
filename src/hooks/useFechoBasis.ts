import { useCallback, useState } from "react";
import { useEventCostBasis, type CostExpenseSource, type EventCostBasis } from "@/hooks/useEventCostBasis";
import { useAuth } from "@/contexts/AuthContext";

export type FechoExpenseSource = CostExpenseSource;

/**
 * O critério do Fecho é exactamente o critério de custo do evento — gravado em
 * `events.cost_expense_source` / `events.cost_include_overhead` (D25 e2).
 * `withVat` é derivado de `events.partner_calc_basis` e não é editável aqui.
 */
export type FechoBasis = EventCostBasis;

export function useFechoBasis(eventId: string, partnerCalcBasis?: string | null): FechoBasis {
  return useEventCostBasis(eventId, partnerCalcBasis);
}


/** Resumo textual do critério — vai para o cabeçalho dos PDFs. */
export function describeFechoBasis(b: FechoBasis): string {
  const parts = [
    `Despesas ${b.withVat ? "c/IVA" : "s/IVA"}`,
    b.expenseSource === "committed" ? "base: previsto + excedido" : "base: realizado",
    b.includeOverhead ? "com overhead" : "sem overhead",
  ];
  return parts.join(" · ");
}

/**
 * (g18 · #342) Colunas das despesas no documento do sócio ("Prestação de
 * contas" PDF/Excel do Encontro de Contas): "detailed" (Valor · IVA · Total)
 * ou "totalOnly" (só o total pago). Preferência de ecrã — guardada por
 * utilizador + evento em localStorage (com try/catch); por omissão "detailed".
 * Só faz sentido com a base das despesas do documento em c/IVA; fora disso o
 * seletor fica desactivado e o documento sai sempre detalhado.
 */
export type ExpenseColumnsMode = "detailed" | "totalOnly";

const expenseColumnsKey = (userId: string, eventId: string) =>
  `fecho-expense-columns:${userId}:${eventId}`;

export function readExpenseColumnsMode(userId: string, eventId: string): ExpenseColumnsMode {
  try {
    return localStorage.getItem(expenseColumnsKey(userId, eventId)) === "totalOnly"
      ? "totalOnly"
      : "detailed";
  } catch {
    return "detailed";
  }
}

export function useExpenseColumnsMode(eventId: string): {
  mode: ExpenseColumnsMode;
  setMode: (m: ExpenseColumnsMode) => void;
} {
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const [mode, setModeState] = useState<ExpenseColumnsMode>(() =>
    readExpenseColumnsMode(userId, eventId),
  );
  const setMode = useCallback(
    (m: ExpenseColumnsMode) => {
      setModeState(m);
      try {
        localStorage.setItem(expenseColumnsKey(userId, eventId), m);
      } catch {
        /* sem persistência — a escolha vale só para esta sessão */
      }
    },
    [userId, eventId],
  );
  return { mode, setMode };
}
