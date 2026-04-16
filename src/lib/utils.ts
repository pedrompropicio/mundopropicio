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
export function formatDatePT(value?: string | null): string {
  if (!value) return "";
  const datePart = String(value).slice(0, 10);
  const m = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("pt-PT");
  }
  return `${m[3]}/${m[2]}/${m[1]}`;
}
