import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function compareHierarchicalCodes(a?: string | null, b?: string | null) {
  const safeA = a?.trim() ?? "";
  const safeB = b?.trim() ?? "";

  if (safeA === safeB) return 0;

  const partsA = safeA.split(".");
  const partsB = safeB.split(".");
  const maxLength = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLength; i++) {
    const partA = partsA[i] ?? "";
    const partB = partsB[i] ?? "";

    if (partA === partB) continue;
    if (!partA) return -1;
    if (!partB) return 1;

    const numA = Number(partA);
    const numB = Number(partB);
    const isNumA = !Number.isNaN(numA);
    const isNumB = !Number.isNaN(numB);

    if (isNumA && isNumB) {
      const diff = numA - numB;
      if (diff !== 0) return diff;
      continue;
    }

    if (isNumA !== isNumB) {
      return isNumA ? -1 : 1;
    }

    const textDiff = partA.localeCompare(partB, undefined, { numeric: true, sensitivity: "base" });
    if (textDiff !== 0) return textDiff;
  }

  return safeA.localeCompare(safeB, undefined, { numeric: true, sensitivity: "base" });
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
 */
export function calcWithIva(baseAmount: number, ivaRate: number): number {
  return Math.round(baseAmount * (1 + ivaRate / 100) * 100) / 100;
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

/**
 * Formata um timestamptz (ISO com hora) no fuso horário LOCAL do browser,
 * como "DD/MM/YYYY HH:MM". Usar SEMPRE em campos `timestamptz` (created_at,
 * updated_at, changed_at, etc.). NÃO usar formatDatePT/formatDatePTOptions
 * nesses campos — eles fazem slice da string UTC e produzem datas incoerentes
 * com a hora local (ex.: "12/06 22:02" quando o instante ainda não chegou).
 */
export function formatTimestampPT(value?: string | Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}
