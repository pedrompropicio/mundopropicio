import { useInRouterContext, useSearchParams } from "react-router-dom";

export type Regime = "caixa" | "competencia";

export function regimeDate(
  t: { date: string; payment_date?: string | null; due_date?: string | null },
  regime: Regime,
): string {
  return regime === "competencia" ? t.date : t.payment_date ?? t.due_date ?? t.date;
}

/** Regime partilhável pelo URL; fora do Router mantém o padrão caixa. */
export function useReportRegime(): { regime: Regime; setRegime: (value: Regime) => void } {
  const inRouter = useInRouterContext();
  if (!inRouter) return { regime: "caixa", setRegime: () => {} };

  // A presença do Router é estável durante a montagem; useSearchParams exige-o.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [params, setParams] = useSearchParams();
  const regime: Regime = params.get("regime") === "competencia" ? "competencia" : "caixa";
  const setRegime = (value: Regime) => {
    const next = new URLSearchParams(params);
    if (value === "caixa") next.delete("regime");
    else next.set("regime", value);
    setParams(next, { replace: true });
  };
  return { regime, setRegime };
}
