/** #89 — cálculo puro da curva histórica (ver simulator-prior-curve.ts). */
export const PRIOR_CURVE_MODE = "prior_editions" as const;
export const PRIOR_CURVE_WINDOW_DAYS = 180;

export interface PriorCurvePoint {
  days_before: number;
  cumulative_pct: number;
}

export function priorCurveFractionAt(
  curve: PriorCurvePoint[] | null | undefined,
  daysToEvent: number,
): number | null {
  if (!curve || curve.length === 0) return null;
  const d = Math.max(0, Math.round(daysToEvent));
  if (d > PRIOR_CURVE_WINDOW_DAYS) return null;
  const pt = curve.find((p) => Number(p.days_before) === d);
  const pct = Number(pt?.cumulative_pct ?? 0);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return Math.min(1, pct / 100);
}

/** Quantidade ADICIONAL até D0 pela curva histórica; null = usar a curva por defeito. */
export function projectWithPriorCurve(
  realQty: number,
  curve: PriorCurvePoint[] | null | undefined,
  daysToEvent: number,
): number | null {
  const frac = priorCurveFractionAt(curve, daysToEvent);
  if (frac === null || !(realQty > 0)) return null;
  return Math.max(0, Math.round(realQty / frac) - realQty);
}

