export type StandaloneInvoiceCurrency = "EUR" | "USD" | "BRL" | "GBP";

export const STANDALONE_INVOICE_CURRENCIES: StandaloneInvoiceCurrency[] = ["EUR", "USD", "BRL", "GBP"];

export const parseStandaloneAmount = (value: string): number | null => {
  const parsed = Number(value.replace(",", "."));
  return value.trim() === "" || !Number.isFinite(parsed) ? null : parsed;
};

export const calculateStandaloneEur = (original: string, rate: string): string => {
  const amount = parseStandaloneAmount(original);
  const fx = parseStandaloneAmount(rate);
  return amount == null || fx == null ? "" : (Math.round(amount * fx * 100) / 100).toFixed(2);
};

export const validateStandaloneMonetaryFields = (
  currency: StandaloneInvoiceCurrency,
  original: string,
  rate: string,
  totalEur: string,
): string | null => {
  const total = parseStandaloneAmount(totalEur);
  if (total == null || total < 0) return "Preenche o total em EUR com um valor válido.";
  if (currency === "EUR") return null;

  const amount = parseStandaloneAmount(original);
  const fx = parseStandaloneAmount(rate);
  if (amount == null || amount < 0 || fx == null || fx <= 0) {
    return "Preenche o valor original e o câmbio com valores válidos.";
  }
  return null;
};

export const isStandaloneInvoiceDuplicateError = (error: { code?: string; message?: string } | null | undefined) =>
  error?.code === "23505" || error?.message?.includes("uq_standalone_invoice_supplier_number") === true;
