/**
 * Helper puro para escalar A&B de Break-Even / Forecast a partir do per-capita
 * efectivo do cenário Real do módulo A&B do evento.
 *
 * Motivação: `useEventABScenarios` pode devolver receitas A&B iguais nos 3
 * cenários (ex.: zonas com `participants_manual`, ou quando o solver não
 * preencheu participantes de uma zona). Nestes casos, o BE/Forecast voltam a
 * mostrar o valor Real congelado. O Simulador resolve isto recalculando A&B do
 * cenário como:
 *
 *   perCapita = receitaReal / públicoReal
 *   receitaCenário = públicoCenário × perCapita
 *
 * Mantém comportamento backward-compatible para o cenário Real (não escala).
 */

export interface ABRevenueLike {
  drinkRevenue: number;
  foodRevenue: number;
  totalRevenue: number;
  attendanceQty: number;
  attendanceCourtesyQty: number;
}

const safeNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const publicOf = (rev: { attendanceQty?: number; attendanceCourtesyQty?: number }): number =>
  Math.max(0, safeNum(rev.attendanceQty) + safeNum(rev.attendanceCourtesyQty));

/**
 * Devolve a receita A&B (drink/food) do cenário, escalada a partir do
 * per-capita do Real. Se não houver Real para escalar (público real = 0),
 * faz fallback aos valores recebidos no `rev` do cenário.
 */
export function scaleABFromReal<T extends ABRevenueLike>(
  rev: T,
  realRev: ABRevenueLike,
  realDrink: number,
  realFood: number,
): { drinkRevenue: number; foodRevenue: number; totalRevenue: number } {
  const realPub = publicOf(realRev);
  const scenPub = publicOf(rev);
  if (realPub <= 0) {
    return {
      drinkRevenue: safeNum(rev.drinkRevenue),
      foodRevenue: safeNum(rev.foodRevenue),
      totalRevenue: safeNum(rev.totalRevenue),
    };
  }
  const drinkPerPax = safeNum(realDrink) / realPub;
  const foodPerPax = safeNum(realFood) / realPub;
  const drink = scenPub * drinkPerPax;
  const food = scenPub * foodPerPax;
  return {
    drinkRevenue: drink,
    foodRevenue: food,
    totalRevenue:
      safeNum(rev.totalRevenue) - safeNum(rev.drinkRevenue) - safeNum(rev.foodRevenue) + drink + food,
  };
}

/**
 * Escala o custo A&B (modo exploração própria) pelo rácio público_cenário /
 * público_real. Em terceirização o custo da casa é 0 e mantém-se 0.
 */
export function scaleABCostFromReal(
  realCost: number,
  realRev: ABRevenueLike,
  scenRev: ABRevenueLike,
): number {
  const realPub = publicOf(realRev);
  const scenPub = publicOf(scenRev);
  if (realPub <= 0) return safeNum(realCost);
  return safeNum(realCost) * (scenPub / realPub);
}
