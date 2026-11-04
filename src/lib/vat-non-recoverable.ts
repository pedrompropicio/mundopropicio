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
