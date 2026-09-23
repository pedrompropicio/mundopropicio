/**
 * Viradas de preço por zona (#214, peça 1).
 *
 * "Virada" = o preço em vigor numa zona mudou entre dois dias CONSECUTIVOS da
 * série (dias sem venda não existem na série e não contam como mudança).
 * Função pura, sem dependências — a mesma regra que a RPC
 * `get_event_zone_price_dynamics` aplica na base de dados.
 */
export interface PricePoint {
  sale_date: string;
  price: number | null;
}

export interface PriceTurn {
  sale_date: string;
  from: number;
  to: number;
}

export function detectPriceTurns(points: PricePoint[]): PriceTurn[] {
  const sorted = [...points]
    .filter((p) => p.price !== null && p.price !== undefined && Number.isFinite(Number(p.price)))
    .sort((a, b) => a.sale_date.localeCompare(b.sale_date));

  const turns: PriceTurn[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = Number(sorted[i - 1].price);
    const cur = Number(sorted[i].price);
    if (prev !== cur) turns.push({ sale_date: sorted[i].sale_date, from: prev, to: cur });
  }
  return turns;
}
