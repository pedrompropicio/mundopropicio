import { useInRouterContext, useSearchParams } from "react-router-dom";

export type AccountingType = "all" | "contabil" | "gerencial";

/** #235: sem conta mantém-se contábil; a marca pertence à conta, não ao documento. */
export function accountingTypeOf(
  t: { account_id?: string | null },
  nonAccountingIds: readonly string[],
): Exclude<AccountingType, "all"> {
  return t.account_id != null && nonAccountingIds.includes(t.account_id) ? "gerencial" : "contabil";
}

/** Tipo partilhável pelo URL; fora do Router mantém todas as transações. */
export function useReportAccountingType(): {
  accountingType: AccountingType;
  setAccountingType: (value: AccountingType) => void;
} {
  const inRouter = useInRouterContext();
  if (!inRouter) return { accountingType: "all", setAccountingType: () => {} };

  // A presença do Router é estável durante a montagem, como em useReportRegime.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [params, setParams] = useSearchParams();
  const tipo = params.get("tipo");
  const accountingType: AccountingType = tipo === "contabil" || tipo === "gerencial" ? tipo : "all";
  const setAccountingType = (value: AccountingType) => {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete("tipo");
    else next.set("tipo", value);
    setParams(next, { replace: true });
  };
  return { accountingType, setAccountingType };
}
