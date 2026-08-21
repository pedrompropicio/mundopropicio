// Comparação com o período anterior (Fase 2).
//
// Regra dura: só se mostra variação quando a janela anterior está COMPLETA.
// Sem histórico suficiente mostra-se "—" com a nota "sem histórico comparável"
// — nunca uma percentagem inventada a partir de um dia de dados (+6.000%).
import { format, subDays } from "date-fns";
import type { InsightRow } from "@/components/crm/dashboard/types";

/** Sentido semântico da variação: subir é bom, mau, ou neutro. */
export type DeltaDirection = "up-good" | "up-bad" | "neutral";

export interface PrevWindow {
  from: Date;
  to: Date;
  /** true ⇔ existe histórico que cobre a janela inteira. */
  complete: boolean;
}

/** Janela imediatamente anterior, de igual duração. */
export function previousWindow(from: Date, to: Date, dataStartISO: string | null): PrevWindow {
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const prevTo = subDays(from, 1);
  const prevFrom = subDays(prevTo, days - 1);
  const complete = !!dataStartISO && format(prevFrom, "yyyy-MM-dd") >= dataStartISO;
  return { from: prevFrom, to: prevTo, complete };
}

/** Primeira data com dados no conjunto carregado (yyyy-MM-dd) ou null. */
export function dataStartISO(rows: InsightRow[] | undefined): string | null {
  let min: string | null = null;
  for (const r of rows ?? []) {
    if (!r.date_start) continue;
    if (min === null || r.date_start < min) min = r.date_start;
  }
  return min;
}

/**
 * Variação relativa segura: devolve null quando a janela anterior não está
 * completa, quando a base é zero, ou quando algum dos valores não é finito.
 */
export function safeDelta(
  curr: number | null | undefined,
  prev: number | null | undefined,
  comparable: boolean,
): number | null {
  if (!comparable) return null;
  if (curr == null || prev == null) return null;
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null;
  if (prev === 0) return null;
  return (curr - prev) / prev;
}

export const NO_HISTORY_NOTE = "sem histórico comparável";
