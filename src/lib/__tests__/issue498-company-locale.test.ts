import { companyHasIva } from "../company-locale";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatMoney,
  formatNumber,
  resolveCompanyLocale,
  type CompanyLocale,
  type CompanyLocaleInput,
} from "../company-locale";
import { formatInCurrency, formatMoney as legacyMoney } from "../currency";
import { formatCurrency as legacyBP } from "../mock-data";
import { calcTotalWithIva, getDefaultIvaRateForCountry } from "../iva";
import { useCompany, type Company } from "@/hooks/useCompany";
import { useCompanyLocale } from "@/hooks/useCompanyLocale";
import fixture from "./fixtures/issue498-pt.json";

vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));

function available(company: CompanyLocaleInput): CompanyLocale {
  const ctx = resolveCompanyLocale(company);
  if (ctx.status !== "available") throw new Error(ctx.message);
  return ctx;
}

const pt = available({ country: "PT", currency: "EUR" });
const br = available({ country: "BR", currency: "BRL" });

describe("#498 — contexto puro da empresa", () => {
  it("fixa o contrato PT/EUR completo", () => {
    expect(pt).toEqual({
      status: "available", currency: "EUR", locale: "pt-PT", symbol: "€",
      labels: {
        taxId: "NIF", invoice: "Fatura", bankAccount: "IBAN", budget: "Orçamento (€)",
        invoiceRef: "Nº Fatura", invoiceRefPlaceholder: "Ex: FT 002/5944",
        invoiceRefHelp: "Transações com o mesmo nº de fatura serão agrupadas automaticamente",
      },
      capabilities: { iva: true, sepa: true, irsWithholding: true }, ivaPolicy: "pt",
    });
  });

  it("fixa o contrato BR/BRL completo", () => {
    expect(br).toEqual({
      status: "available", currency: "BRL", locale: "pt-BR", symbol: "R$",
      labels: {
        taxId: "CNPJ", invoice: "Nota fiscal", bankAccount: "Conta bancária", budget: "Orçamento (R$)",
        invoiceRef: "Nota Fiscal/Doc", invoiceRefPlaceholder: "Ex: NF 12345",
        invoiceRefHelp: "Transações com o mesmo nº de documento serão agrupadas automaticamente",
      },
      capabilities: { iva: false, sepa: false, irsWithholding: false }, ivaPolicy: "none",
    });
  });

  it.each([["PT", true], ["ES", true], ["BR", false]] as const)(
    "resolve a capability IRS de %s independentemente da moeda", (country, expected) => {
      for (const currency of ["EUR", "BRL", "USD", "GBP"]) {
        expect(available({ country, currency }).capabilities.irsWithholding).toBe(expected);
      }
    },
  );

  it.each([undefined, null, "", " "])("mantém o legado EUR com país ausente: %s", (country) => {
    expect(resolveCompanyLocale({ country, currency: "EUR" })).toEqual(pt);
  });

  it.each([
    {}, { country: "PT" }, { country: "BR" }, { currency: "BRL" }, { currency: "USD" },
    { country: null, currency: null }, { country: "BR", currency: null },
    { country: "BR", currency: "" }, { country: "BR", currency: " " },
    { country: "PT", currency: "INVALID" }, { country: "BR", currency: "INVALID" },
    { country: "INVALID", currency: "EUR" }, { country: "ZZ", currency: "BRL" },
    { country: "FR", currency: "EUR" }, { country: " ", currency: "BRL" },
  ])("expõe unavailable, sem moeda/defaults, para %j", (company) => {
    expect(resolveCompanyLocale(company)).toEqual({ status: "unavailable", message: "configuração da empresa incompleta" });
  });

  it("normaliza códigos e espaços sem inferir moeda pelo país", () => {
    expect(resolveCompanyLocale({ country: " br ", currency: " brl " })).toEqual(br);
    const context = available({ country: "BR", currency: "EUR" });
    expect(context.currency).toBe("EUR");
    expect(context.locale).toBe("pt-BR");
    expect(context.symbol).toBe("€");
    expect(context.labels.budget).toBe("Orçamento (€)");
    expect(context.ivaPolicy).toBe("none");
    const other = available({ country: "PT", currency: "BRL" });
    expect(other.currency).toBe("BRL");
    expect(other.locale).toBe("pt-PT");
    expect(other.capabilities.sepa).toBe(false);
  });

  it("preserva as moedas suportadas sem FX nem alteração dos valores", () => {
    for (const currency of ["EUR", "BRL", "USD", "GBP"]) {
      const ctx = available({ country: "BR", currency });
      expect(ctx.currency).toBe(currency);
      expect(formatMoney(1000, ctx)).toBe(legacyMoney(1000, currency, { locale: "pt-BR" }));
    }
  });

  it("mantém a política existente PT/ES, cuja taxa continua a vir da cidade", () => {
    const es = available({ country: "ES", currency: "EUR" });
    expect(es).toEqual(pt);
    expect(calcTotalWithIva(1000, getDefaultIvaRateForCountry("Espanha"))).toBe(1210);
    expect(getDefaultIvaRateForCountry("Portugal")).toBe(23);
  });
});

describe("#498 — formatação explícita, sem conversão", () => {
  it.each(fixture.money)("PT igual byte a byte ao BP legado em $amount", (row) => {
    expect(formatMoney(row.amount, pt)).toBe(legacyBP(row.amount));
    expect(formatMoney(row.amount, pt, { fromCents: true })).toBe(legacyBP(row.amount / 100));
    expect(formatNumber(row.amount, pt)).toBe(legacyBP(row.amount).slice(0, -2));
    const precise = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(row.amount);
    expect(formatMoney(row.amount, pt, { maximumFractionDigits: 4 })).toBe(`${precise}\u00a0${pt.symbol}`);
    expect(formatNumber(row.amount, pt, { maximumFractionDigits: 4 })).toBe(precise);
  });

  it.each([
    [1230, "1.230,00"], [0, "0,00"], [-1234567.5, "-1.234.567,50"],
  ])("PT agrupa milhares como o BP em %s", (amount, expected) => {
    expect(formatMoney(Number(amount), pt)).toBe(`${expected}\u00a0${pt.symbol}`);
    expect(formatNumber(Number(amount), pt)).toBe(expected);
  });

  it("BR mantém o Intl pt-BR em 1.230", () => {
    expect(formatMoney(1230, br)).toBe("R$\u00a01.230,00");
  });

  it("BR: 1.000 BRL e taxa zero mantêm total = base", () => {
    expect(br.ivaPolicy).toBe("none");
    expect(br.capabilities.iva).toBe(false);
    expect(calcTotalWithIva(1000, 0)).toBe(1000);
    expect(formatMoney(1000, br)).toBe("R$\u00a01.000,00");
    expect(formatMoney(1000, br)).toBe(new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(1000));
    expect(formatNumber(1000, br)).toBe("1.000,00");
    expect(formatNumber(-1234.5678, br, { maximumFractionDigits: 4 })).toBe("-1.234,5678");
  });

  it("PT: base 1.000 com 23% produz 1.230 e preserva os bytes actuais", () => {
    expect(calcTotalWithIva(1000, 23)).toBe(1230);
    expect(formatMoney(calcTotalWithIva(1000, 23), pt)).toBe("1.230,00\u00a0€");
  });

  it.each([null, undefined, NaN])("preserva o marcador de valor ausente: %s", (amount) => {
    expect(formatMoney(amount, pt)).toBe("—");
    expect(formatNumber(amount, br)).toBe("—");
  });

  it("preserva o zero do BP e permite precisão explícita sem símbolo", () => {
    expect(formatMoney(-0, pt)).toBe(legacyBP(-0));
    expect(formatNumber(-0, pt)).toBe("0,00");
    expect(formatNumber(123456, br, { fromCents: true })).toBe("1.234,56");
    expect(formatNumber(1000, br, { maximumFractionDigits: 0 })).toBe("1.000");
  });

  it("permite conservar o agrupamento Intl nos editores PT existentes", () => {
    expect(formatMoney(1230, pt, { grouping: "locale" })).toBe(legacyMoney(1230, "EUR"));
    expect(formatNumber(1230, pt, { grouping: "locale" })).toBe("1230,00");
  });

  it("permite locale explícito no helper legado e mantém os defaults", () => {
    expect(formatInCurrency(1000, "EUR")).toBe("1000,00\u00a0€");
    expect(formatInCurrency(1000, "EUR", "pt-BR")).toBe(legacyMoney(1000, "EUR", { locale: "pt-BR" }));
  });

  it("recusa um contexto indisponível mesmo na fronteira JS, antes de qualquer fallback EUR", () => {
    const unavailable = resolveCompanyLocale({ country: "BR" });
    expect(() => formatMoney(1000, unavailable as CompanyLocale)).toThrow("configuração da empresa incompleta");
    expect(() => formatNumber(1000, unavailable as CompanyLocale)).toThrow("configuração da empresa incompleta");
  });
});

function company(id: string, country: string, currency: string): Company {
  return {
    id, country, currency, legal_name: id, display_name: id, slug: id,
    tax_id: null, timezone: "UTC", logo_url: null, favicon_url: null, theme_config: null,
    address: null, contact_email: null, status: "active",
  };
}

function setCompany(value: Company | null, overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  vi.mocked(useCompany).mockReturnValue({
    company: value, companyId: value?.id ?? null, isLoading: false, isError: false,
    error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides,
  });
}

describe("#498 — hook sobre useCompany, sem consultas próprias", () => {
  beforeEach(() => vi.clearAllMocks());

  it("acompanha a troca PT → BR → PT e mudanças de configuração da mesma empresa", () => {
    setCompany(company("pt", "PT", "EUR"));
    const { result, rerender } = renderHook(() => useCompanyLocale());
    expect(result.current).toMatchObject({ ...pt, companyId: "pt" });
    setCompany(company("br", "BR", "BRL"));
    rerender();
    expect(result.current).toMatchObject({ ...br, companyId: "br" });
    setCompany(company("br", "BR", ""));
    rerender();
    expect(result.current.status).toBe("unavailable");
    expect(result.current).not.toHaveProperty("currency");
    setCompany(company("pt", "PT", "EUR"));
    rerender();
    expect(result.current).toMatchObject({ ...pt, companyId: "pt" });
  });

  it("expõe ausência, carregamento e erro sem reutilizar configuração anterior", () => {
    setCompany(null);
    const { result, rerender } = renderHook(() => useCompanyLocale());
    expect(result.current).toMatchObject({ status: "unavailable", companyId: null });
    setCompany(company("pt", "PT", "EUR"), { isLoading: true });
    rerender();
    expect(result.current).toMatchObject({ status: "unavailable", isLoading: true });
    expect(result.current).not.toHaveProperty("currency");
    const error = new Error("fixture failure");
    setCompany(company("pt", "PT", "EUR"), { isError: true, error });
    rerender();
    expect(result.current).toMatchObject({ status: "unavailable", isError: true, error });
    expect(result.current).not.toHaveProperty("currency");
  });
});


describe("#498 P1l-1 — companyHasIva", () => {
  it.each([["PT", true], ["ES", true], ["BR", false]] as const)(
    "%s usa a capability IVA independentemente da moeda", (country, expected) => {
      for (const currency of ["EUR", "BRL", "USD", "GBP"]) {
        expect(companyHasIva(resolveCompanyLocale({ country, currency }))).toBe(expected);
      }
    },
  );

  it("unavailable preserva a apresentação PT", () => {
    expect(companyHasIva(resolveCompanyLocale({}))).toBe(true);
    expect(companyHasIva(resolveCompanyLocale({ country: "BR", currency: "" }))).toBe(true);
  });

  it("a capability é a fonte da decisão, sem reavaliar país ou ivaPolicy", () => {
    expect(companyHasIva({ ...br, capabilities: { ...br.capabilities, iva: true } })).toBe(true);
    expect(companyHasIva({ ...pt, capabilities: { ...pt.capabilities, iva: false } })).toBe(false);
  });
});
