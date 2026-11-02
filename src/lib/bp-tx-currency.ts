import { isSupportedCurrency } from "./currency";

type Numeric = number | string;
interface BpCurrencyOrigin {
  id: string;
  description?: string;
  amount: Numeric;
  currency?: string | null;
  original_amount?: Numeric | null;
  fx_rate?: Numeric | null;
  fx_rate_source?: string | null;
}

/** Transport only: never reconstruct an original or obtain a new fixing. */
export function bpTxCurrencyMetadata(line: BpCurrencyOrigin) {
  const fail = (field: string): never => {
    throw new Error(`Linha BP ${line.id} (${line.description ?? "sem descrição"}): ${field} inválido ou ausente. Corrija os metadados de moeda antes de gerar o lote.`);
  };
  const finite = (value: Numeric) =>
    (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value));

  if (!finite(line.amount)) fail("amount (EUR)");

  // Legacy amounts are canonical EUR (currency.ts). Missing currency is only
  // accepted for a line without foreign-currency metadata; unknown codes fail.
  if (line.currency == null &&
      (line.original_amount != null || line.fx_rate != null || line.fx_rate_source != null)) fail("currency");
  const currency = line.currency ?? "EUR";
  if (!isSupportedCurrency(currency)) fail("currency");
  if (line.original_amount == null) {
    if (currency !== "EUR") fail("original_amount");
  } else if (!finite(line.original_amount)) fail("original_amount");
  if (line.fx_rate == null) {
    if (currency !== "EUR") fail("fx_rate");
  } else if (!finite(line.fx_rate) || Number(line.fx_rate) <= 0) fail("fx_rate");
  // Source is nullable in the existing writer; do not infer "manual".
  if (line.fx_rate_source != null && typeof line.fx_rate_source !== "string") fail("fx_rate_source");
  return {
    currency,
    original_amount: line.original_amount ?? null,
    fx_rate: line.fx_rate ?? null,
    fx_rate_source: line.fx_rate_source ?? null,
  };
}
