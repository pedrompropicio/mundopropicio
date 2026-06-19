// Multi-currency helpers (phase 1: EUR + BRL + USD)
// The canonical "amount" stored in DB is always in EUR.
// `original_amount` + `fx_rate` are kept for traceability when currency != EUR.

export type CurrencyCode = "EUR" | "BRL" | "USD";

export const SUPPORTED_CURRENCIES: { code: CurrencyCode; label: string; symbol: string; locale: string }[] = [
  { code: "EUR", label: "Euro (€)", symbol: "€", locale: "pt-PT" },
  { code: "BRL", label: "Real (R$)", symbol: "R$", locale: "pt-BR" },
  { code: "USD", label: "Dólar ($)", symbol: "$", locale: "en-US" },
];

const CCY_MAP = Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c.code, c])) as Record<CurrencyCode, typeof SUPPORTED_CURRENCIES[number]>;

export function isSupportedCurrency(code: string | null | undefined): code is CurrencyCode {
  return code === "EUR" || code === "BRL" || code === "USD";
}

export function getCurrencyMeta(code: CurrencyCode) {
  return CCY_MAP[code];
}

/** Format a value in the given currency (e.g. R$ 5.000,00). */
export function formatInCurrency(value: number, code: CurrencyCode): string {
  const meta = CCY_MAP[code];
  return new Intl.NumberFormat(meta.locale, { style: "currency", currency: code }).format(value);
}

/**
 * Canonical money formatter for the whole app.
 *
 * Rule (MP CRM / MP Audience): the displayed currency must follow the
 * AD ACCOUNT (never hardcode "EUR"). Thin wrapper around Intl.NumberFormat
 * that derives a sensible locale from the currency code (BRL → pt-BR,
 * USD → en-US, default pt-PT) unless `opts.locale` overrides it.
 *
 * Does NOT convert values (no FX). `opts.fromCents` divides by 100 for fields
 * stored as cents (Meta insights' `spend_cents`, `purchases_value_cents`, …).
 *
 * Backward-compat: if `currency` is empty/undefined falls back to "EUR" so
 * old call sites without an ad-account context render exactly as before.
 */
export function formatMoney(
  value: number | null | undefined,
  currency: string | null | undefined,
  opts: { locale?: string; fromCents?: boolean; maximumFractionDigits?: number } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value as number)) return "—";
  const code = (currency && currency.trim()) || "EUR";
  const fallbackLocale =
    code === "BRL" ? "pt-BR" : code === "USD" ? "en-US" : "pt-PT";
  const locale = opts.locale ?? fallbackLocale;
  const amount = opts.fromCents ? (value as number) / 100 : (value as number);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: opts.maximumFractionDigits ?? 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

/** Convert an original amount to EUR using fx_rate (1 unit of currency = fx_rate EUR). */
export function convertToEur(originalAmount: number, fxRate: number): number {
  return Math.round(originalAmount * fxRate * 100) / 100;
}

/** Reverse: derive the original amount from EUR + fx_rate. */
export function eurToOriginal(eurAmount: number, fxRate: number): number {
  if (!fxRate || fxRate <= 0) return 0;
  return Math.round((eurAmount / fxRate) * 100) / 100;
}

/**
 * Fetch a suggested FX rate via the `fetch-fx-rate` edge function.
 * Returns rate as: 1 unit of `from` = X EUR. Returns null on failure.
 */
export async function fetchSuggestedFxRate(from: CurrencyCode, supabase: { functions: { invoke: (n: string, o: any) => Promise<any> } }): Promise<number | null> {
  if (from === "EUR") return 1;
  try {
    const { data, error } = await supabase.functions.invoke("fetch-fx-rate", { body: { from } });
    if (error) return null;
    const rate = Number(data?.rate);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}
