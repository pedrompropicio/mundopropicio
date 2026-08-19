import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usesGrossExpenseAmounts, normalizePartnerCalcBasis } from "@/lib/partner-calc-basis";

export type FechoExpenseSource = "realized" | "committed";

export interface FechoBasis {
  /** true = despesas c/IVA (bruto); false = base líquida. Escolha livre do utilizador. */
  withVat: boolean;
  setWithVat: (v: boolean) => void;
  /** Overhead entra no resultado do acerto (default ON = comportamento atual). */
  includeOverhead: boolean;
  setIncludeOverhead: (v: boolean) => void;
  /** Somar o excesso por rubrica (transações fora do BP) — só na base "comprometido". */
  includeOutsideBp: boolean;
  setIncludeOutsideBp: (v: boolean) => void;
  /** Base da despesa: transações realizadas ou BP comprometido. */
  expenseSource: FechoExpenseSource;
  setExpenseSource: (v: FechoExpenseSource) => void;
}

const key = (userId: string, eventId: string, field: string) => `fecho-basis-${userId}-${eventId}-${field}`;

function readBool(userId: string, eventId: string, field: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key(userId, eventId, field));
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {/* noop */}
  return fallback;
}

function writeBool(userId: string, eventId: string, field: string, value: boolean) {
  try { localStorage.setItem(key(userId, eventId, field), value ? "1" : "0"); } catch {/* noop */}
}

/**
 * Seletor de base do Fecho, persistido por user+evento.
 *
 * O valor inicial de `withVat` vem de `events.partner_calc_basis` — é o que
 * evita que um acerto abra com número diferente do que estava lá. O toggle é
 * de escolha livre e NUNCA escreve em `partner_calc_basis`.
 */
export function useFechoBasis(eventId: string, partnerCalcBasis?: string | null): FechoBasis {
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const initialWithVat = usesGrossExpenseAmounts(normalizePartnerCalcBasis(partnerCalcBasis));

  const [withVat, setWithVat] = useState<boolean>(initialWithVat);
  const [hydrated, setHydrated] = useState(false);
  const [includeOverhead, setIncludeOverhead] = useState<boolean>(
    () => readBool(userId, eventId, "overhead", true),
  );
  const [includeOutsideBp, setIncludeOutsideBp] = useState<boolean>(
    () => readBool(userId, eventId, "outsidebp", false),
  );
  const [expenseSource, setExpenseSource] = useState<FechoExpenseSource>(() => {
    try {
      const v = localStorage.getItem(key(userId, eventId, "expsource"));
      if (v === "committed" || v === "realized") return v;
    } catch {/* noop */}
    return "realized";
  });

  // partner_calc_basis chega por query → sincroniza uma única vez, e só se o
  // utilizador ainda não tiver escolha guardada para este evento.
  useEffect(() => {
    if (hydrated) return;
    setWithVat(readBool(userId, eventId, "vat", initialWithVat));
    setHydrated(true);
  }, [hydrated, userId, eventId, initialWithVat]);

  useEffect(() => { if (hydrated) writeBool(userId, eventId, "vat", withVat); }, [hydrated, userId, eventId, withVat]);
  useEffect(() => { writeBool(userId, eventId, "overhead", includeOverhead); }, [userId, eventId, includeOverhead]);
  useEffect(() => { writeBool(userId, eventId, "outsidebp", includeOutsideBp); }, [userId, eventId, includeOutsideBp]);
  useEffect(() => {
    try { localStorage.setItem(key(userId, eventId, "expsource"), expenseSource); } catch {/* noop */}
  }, [userId, eventId, expenseSource]);

  return {
    withVat, setWithVat,
    includeOverhead, setIncludeOverhead,
    includeOutsideBp, setIncludeOutsideBp,
    expenseSource, setExpenseSource,
  };
}

/** Resumo textual do critério — vai para o cabeçalho dos PDFs. */
export function describeFechoBasis(b: FechoBasis): string {
  const parts = [
    `Despesas ${b.withVat ? "c/IVA" : "s/IVA"}`,
    b.expenseSource === "committed" ? "base: BP comprometido" : "base: realizado",
    b.includeOverhead ? "com overhead" : "sem overhead",
  ];
  if (b.includeOutsideBp && b.expenseSource === "committed") parts.push("inclui fora do BP");
  return parts.join(" · ");
}
