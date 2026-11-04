import { calcIvaAmount, roundCents } from "@/lib/iva";

/** #257: apenas recolhe a decisão; o valor usa a taxa da própria transação. */
export function showVatNonRecoverable({ type, ivaRate, hasIva, noIva }: {
  type: string;
  ivaRate: number | string | null | undefined;
  hasIva: boolean;
  noIva: boolean;
}): boolean {
  return hasIva && !noIva && type === "expense" && Number(ivaRate) > 0;
}

/** Sem marcação aplicável, preserva a identidade e os bytes do payload legado. */
export function withVatNonRecoverable<T extends { type: string; iva_rate?: number | string | null }>(
  payload: T,
  checked: boolean,
): T | (T & { vat_non_recoverable: true }) {
  return checked && payload.type === "expense" && Number(payload.iva_rate) > 0
    ? { ...payload, vat_non_recoverable: true }
    : payload;
}
type VatCostRow = {
  type: string;
  amount: number | string;
  iva_rate?: number | string | null;
  vat_non_recoverable?: boolean;
};

function hasVatNonRecoverableCost(row: VatCostRow): boolean {
  return row.type === "expense" && row.vat_non_recoverable === true && Number(row.iva_rate) > 0;
}

/** #257 / D-ERP347: custo calculado pela taxa da própria transação. */
export function vatNonRecoverableCost(row: VatCostRow): number {
  return hasVatNonRecoverableCost(row) ? calcIvaAmount(Number(row.amount), Number(row.iva_rate)) : 0;
}

/** Projeção só de leitura: preserva a base armazenada e retira este IVA do dedutível. */
export function withVatNonRecoverableCost<T extends VatCostRow>(rows: T[]): T[] {
  if (!rows.some(hasVatNonRecoverableCost)) return rows;
  return rows.map(row => hasVatNonRecoverableCost(row)
    ? { ...row, amount: roundCents(Number(row.amount) + vatNonRecoverableCost(row)), iva_rate: 0 }
    : row);
}

export function vatNonRecoverableEdit({ original, checked, ...visibility }: {
  original: boolean | null | undefined;
  checked: boolean;
  type: string;
  ivaRate: number | string | null | undefined;
  hasIva: boolean;
  noIva: boolean;
}): { next: boolean; dirty: boolean } {
  const next = showVatNonRecoverable(visibility) && checked;
  return { next, dirty: next !== !!original };
}
