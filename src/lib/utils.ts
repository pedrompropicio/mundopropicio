import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
// Vive no pacote partilhado (ERP + edge functions) — ver @shared/settlement.
import { compareHierarchicalCodes } from "@shared/settlement/hierarchical-codes.ts";
import { calcTotalWithIva } from "@shared/settlement/iva.ts";

export { compareHierarchicalCodes };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sortByHierarchicalCode<T>(items: T[], getCode: (item: T) => string | null | undefined) {
  return [...items].sort((a, b) => compareHierarchicalCodes(getCode(a), getCode(b)));
}

/**
 * Como compareHierarchicalCodes, mas força quaisquer codes do Grupo 0
 * (ex.: "0.0.99 A Classificar") para o fim da lista — para relatórios
 * em que a categoria "não-classificado" deve aparecer no final.
 */
export function compareReportCodesUnclassifiedLast(a?: string | null, b?: string | null) {
  const isUnclassified = (c?: string | null) => !!c && c.trim().startsWith("0.");
  const aU = isUnclassified(a);
  const bU = isUnclassified(b);
  if (aU && !bU) return 1;
  if (!aU && bU) return -1;
  return compareHierarchicalCodes(a, b);
}

/**
 * Calcula o valor total com IVA, arredondado ao cêntimo mais próximo
 * conforme Artigo 18.º do CIVA (Portugal).
 *
 * IMPORTANTE: arredonda o IVA primeiro e só depois soma à base, para
 * evitar erros de vírgula flutuante (ex.: 380.50 * 1.23 = 468.01499999…
 * que Math.round arredondaria para 468.01 em vez de 468.02).
 * Delega no SSoT em src/lib/iva.ts.
 */
export function calcWithIva(baseAmount: number, ivaRate: number): number {
  // (g17-d) Regra única de arredondamento: roundCents do pacote partilhado.
  return calcTotalWithIva(Number(baseAmount) || 0, Number(ivaRate) || 0);
}

/**
 * Verifica se o valor pago cobre o total com IVA,
 * Verifica se uma transação está totalmente paga,
 * com tolerância de 5 cêntimos para diferenças de arredondamento de IVA.
 */
export function isFullyPaid(paidAmount: number, baseAmount: number, ivaRate: number): boolean {
  const total = calcWithIva(baseAmount, ivaRate);
  return paidAmount >= total - 0.05;
}

/**
 * Formata uma data armazenada como YYYY-MM-DD (ou ISO com timestamp) no
 * formato pt-PT (DD/MM/YYYY) sem aplicar conversão de fuso horário.
 *
 * `new Date("2026-04-09").toLocaleDateString("pt-PT")` interpreta a string
 * como UTC midnight, o que provoca um desvio de 1 dia em fusos horários
 * negativos. Esta função extrai os componentes diretamente da string para
 * preservar a data civil original.
 */
export function formatDatePT(value?: string | Date | null): string {
  if (!value) return "";
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    return value.toLocaleDateString("pt-PT");
  }
  const datePart = String(value).slice(0, 10);
  const m = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("pt-PT");
  }
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Versão flexível de formatDatePT que aceita opções de formatação. Constrói a
 * data ao meio-dia local para evitar drift de fuso quando a entrada é apenas
 * YYYY-MM-DD.
 */
export function formatDatePTOptions(
  value?: string | Date | null,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" },
): string {
  if (!value) return "";
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    return value.toLocaleDateString("pt-PT", options);
  }
  const datePart = String(value).slice(0, 10);
  const m = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    return local.toLocaleDateString("pt-PT", options);
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("pt-PT", options);
}
