import { calcTotalWithIva, roundCents, snapToStandardRate, STANDARD_IVA_RATES, type IvaRate } from "@/lib/iva";

export type CardSessionStatus = "open" | "in_review" | "closed";

export const CARD_SESSION_STATUS_LABELS: Record<CardSessionStatus, string> = {
  open: "Aberta",
  in_review: "Em revisão",
  closed: "Fechada",
};

export const CARD_SESSION_STATUS_VARIANTS: Record<CardSessionStatus, string> = {
  open: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  in_review: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  closed: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function formatCurrency(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export const RECHARGE_CATEGORY_CODE = "10.3"; // transferência entre contas

/**
 * Semântica de IVA no módulo Cartões
 * ----------------------------------
 * O talão de cartão mostra sempre o TOTAL PAGO (c/IVA) — é isso que sai do
 * cartão. Na BD mantemos a convenção do sistema: `amount` = BASE sem IVA e
 * `iva_rate` = taxa. Os formulários pedem o Total e convertem aqui; todos os
 * totais de sessão (gasto, pendente, saldo) usam o valor C/IVA.
 */

/** Base (sem IVA) a partir do total do talão. */
export function cardBaseFromTotal(total: number | string, rate: number | string): number {
  const t = Number(total) || 0;
  const r = Number(rate) || 0;
  return roundCents(t / (1 + r / 100));
}

/** Total c/IVA a partir da base guardada na BD. */
export function cardTotalFromBase(base: number | string, rate: number | string): number {
  return calcTotalWithIva(Number(base) || 0, Number(rate) || 0);
}

/** Total c/IVA de um item/transação do cartão (amount é base). */
export function cardItemGross(row: { amount?: number | string | null; iva_rate?: number | string | null }): number {
  return cardTotalFromBase(Number(row?.amount ?? 0), Number(row?.iva_rate ?? 0));
}

/**
 * Infere a taxa a partir do total e do IVA € explícito do talão, com snap ao
 * conjunto de taxas do país do evento (padrão camarim).
 */
export function inferCardRateFromReceipt(
  total: number | string,
  ivaAmount: number | string | null | undefined,
  rates: IvaRate[] = STANDARD_IVA_RATES,
): IvaRate {
  const t = Number(total) || 0;
  const iva = Number(ivaAmount) || 0;
  const base = t - iva;
  if (!iva || base <= 0) return snapToStandardRate(0, rates);
  return snapToStandardRate((iva / base) * 100, rates);
}
