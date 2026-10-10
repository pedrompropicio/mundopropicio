/**
 * D-ERP246 (#85) — IVA do redébito de despesas pagas pelo sócio.
 * Defaults por confirmar pelo Pedro:
 *  • sócio PT → refatura à MP com IVA à taxa de cada custo subjacente (a MP deduz);
 *  • sócio fora de PT (BR/fora da UE) → fatura sem IVA (fora do campo); a MP
 *    autoliquida à taxa do custo SÓ quando o serviço é prestado em PT
 *    (padrão AMBEV/Meta). A autoliquidação não é paga ao sócio.
 * Base = amount (líquido, Core rule). O custo não se duplica (D-ERP3).
 */
export interface PaidByPartnerTx {
  amount: number;
  iva_rate: number | null;
}

export type RebillRegime = "pt_refatura" | "autoliquidacao" | "fora_do_campo";

export interface RebillResult {
  regime: RebillRegime;
  base: number;
  /** IVA faturado pelo sócio (só PT). */
  ivaFaturado: number;
  /** IVA autoliquidado pela MP (não pago ao sócio). */
  ivaAutoliquidado: number;
  /** Valor a devolver ao sócio = base + IVA faturado. */
  aDevolver: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function normCountry(c: string | null | undefined): string {
  const v = String(c ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : "PT";
}

export function computePartnerRebill(
  txs: PaidByPartnerTx[],
  partnerCountry: string | null | undefined,
  servicePlaceCountry: string | null | undefined,
): RebillResult {
  const pc = normCountry(partnerCountry);
  const sp = normCountry(servicePlaceCountry);
  let base = 0;
  let iva = 0;
  for (const t of txs) {
    const a = Number(t.amount) || 0;
    base += a;
    iva += (a * (Number(t.iva_rate) || 0)) / 100;
  }
  base = r2(base);
  iva = r2(iva);
  if (pc === "PT") {
    return { regime: "pt_refatura", base, ivaFaturado: iva, ivaAutoliquidado: 0, aDevolver: r2(base + iva) };
  }
  if (sp === "PT") {
    return { regime: "autoliquidacao", base, ivaFaturado: 0, ivaAutoliquidado: iva, aDevolver: base };
  }
  return { regime: "fora_do_campo", base, ivaFaturado: 0, ivaAutoliquidado: 0, aDevolver: base };
}

export const REBILL_REGIME_LABEL: Record<RebillRegime, string> = {
  pt_refatura: "Sócio PT — refatura com IVA",
  autoliquidacao: "Sócio fora de PT — autoliquidação pela MP",
  fora_do_campo: "Sócio fora de PT — fora do campo de IVA",
};
