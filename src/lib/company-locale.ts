import {
  formatMoney as formatCurrencyMoney,
  getCurrencyMeta,
  isSupportedCurrency,
  type CurrencyCode,
  type MoneyFormatOptions,
} from "./currency";

export interface CompanyLocaleInput {
  country?: string | null;
  currency?: string | null;
}

export interface CompanyLocale {
  status: "available";
  currency: CurrencyCode;
  locale: "pt-PT" | "pt-BR";
  symbol: string;
  labels: {
    taxId: string;
    invoice: string;
    invoiceRef: string;
    invoiceRefPlaceholder: string;
    invoiceRefHelp: string;
    bankAccount: string;
    budget: string;
    address: string;
    taxIdAny: string;
    accountingAccountHelp: string;
  };
  capabilities: { iva: boolean; sepa: boolean; irsWithholding: boolean };
  /** 'pt' preserves the existing event-city rules, including events in Spain. */
  ivaPolicy: "pt" | "none";
}

export interface CompanyLocaleUnavailable {
  status: "unavailable";
  message: "configuração da empresa incompleta";
}

export type CompanyLocaleResult = CompanyLocale | CompanyLocaleUnavailable;

export function companyHasIva(ctx: CompanyLocaleResult): boolean {
  return ctx.status !== "available" || ctx.capabilities.iva;
}

export type CompanyFormatOptions = Omit<MoneyFormatOptions, "locale"> & {
  /** Existing numeric editors may retain Intl's locale-specific grouping. */
  grouping?: "locale";
};

/**
 * Country selects presentation/policy; currency comes only from companies.currency.
 * The only legacy inference is a missing country with an explicit EUR currency.
 * Unsupported configurations expose no monetary defaults. No FX or writes here.
 */
export function resolveCompanyLocale(company: CompanyLocaleInput): CompanyLocaleResult {
  const currency = company.currency?.trim().toUpperCase();
  const configuredCountry = company.country?.trim().toUpperCase();
  const country = configuredCountry || (currency === "EUR" ? "PT" : undefined);

  if (!isSupportedCurrency(currency) || !country || !["PT", "ES", "BR"].includes(country)) {
    return { status: "unavailable", message: "configuração da empresa incompleta" };
  }

  const symbol = getCurrencyMeta(currency).symbol;
  if (country === "BR") {
    return {
      status: "available",
      currency,
      locale: "pt-BR",
      symbol,
      labels: {
        taxId: "CNPJ", invoice: "Nota fiscal", bankAccount: "Conta bancária", budget: `Orçamento (${symbol})`,
        invoiceRef: "Nota Fiscal/Doc", invoiceRefPlaceholder: "Ex: NF 12345",
        invoiceRefHelp: "Transações com o mesmo nº de documento serão agrupadas automaticamente",
        address: "Endereço", taxIdAny: "CNPJ/CPF",
        accountingAccountHelp: "Desligue para contas puramente gerenciais (ex.: pagamentos feitos fora do Brasil por um sócio). Os movimentos e documentos dessa conta deixam de entrar nas exportações para a contabilidade. Saldos e extratos não são afetados.",
      },
      capabilities: { iva: false, sepa: false, irsWithholding: false },
      ivaPolicy: "none",
    };
  }

  return {
    status: "available",
    currency,
    locale: "pt-PT",
    symbol,
    labels: {
      taxId: "NIF", invoice: "Fatura", bankAccount: "IBAN", budget: `Orçamento (${symbol})`,
      invoiceRef: "Nº Fatura", invoiceRefPlaceholder: "Ex: FT 002/5944",
      invoiceRefHelp: "Transações com o mesmo nº de fatura serão agrupadas automaticamente",
      address: "Morada", taxIdAny: "NIF",
      accountingAccountHelp: "Desligue para contas puramente gerenciais (ex.: pagamentos feitos fora de Portugal por um sócio). Os movimentos e documentos dessa conta deixam de entrar nas exportações para a contabilidade. Saldos e extratos não são afetados.",
    },
    capabilities: { iva: true, sepa: currency === "EUR", irsWithholding: true },
    ivaPolicy: "pt",
  };
}

/** Payment capability kept separate so the frozen PT locale object stays identical. */
export function companyPaymentMethods(ctx: CompanyLocaleResult): "pt" | "br" | "unavailable" {
  return ctx.status === "available" ? (ctx.locale === "pt-BR" ? "br" : "pt") : "unavailable";
}

/** Explicit company context; PT/EUR preserves the BP's legacy decimal format. */
export function formatMoney(
  amount: number | null | undefined,
  ctx: CompanyLocale,
  options: CompanyFormatOptions = {},
): string {
  if (ctx.status !== "available") throw new Error("configuração da empresa incompleta");
  if (ctx.locale === "pt-PT" && ctx.currency === "EUR" && options.grouping !== "locale") {
    const number = formatNumber(amount, ctx, options);
    return number === "—" ? number : `${number}\u00a0${ctx.symbol}`;
  }
  return formatCurrencyMoney(amount, ctx.currency, { ...options, locale: ctx.locale });
}

/** Numeric counterpart of the company money formatter, without a currency symbol. */
export function formatNumber(
  amount: number | null | undefined,
  ctx: CompanyLocale,
  options: CompanyFormatOptions = {},
): string {
  if (ctx.status !== "available") throw new Error("configuração da empresa incompleta");
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  const value = options.fromCents ? amount / 100 : amount;
  const legacyBP = ctx.locale === "pt-PT" && ctx.currency === "EUR" && options.grouping !== "locale";
  if (legacyBP && maximumFractionDigits === 2) {
    const [integer, decimal] = Math.abs(value).toFixed(2).split(".");
    return `${value < 0 ? "-" : ""}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimal}`;
  }
  return new Intl.NumberFormat(legacyBP ? "pt-BR" : ctx.locale, {
    minimumFractionDigits: Math.min(2, maximumFractionDigits),
    maximumFractionDigits,
  }).format(value);
}
