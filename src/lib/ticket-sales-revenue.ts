/**
 * Helper para calcular receita de bilheteira a partir de registos de ticket_sales.
 *
 * Usa o campo `total_value` (valor exato preservado da importação) quando disponível,
 * caso contrário usa `quantity * unit_price` (compatibilidade retroativa).
 *
 * Isto evita perdas de cêntimos por arredondamento do `unit_price` em lotes
 * com preços com dízimas (ex: 2 644,80 / 82 = 32,253658…).
 */
export interface TicketSaleLike {
  quantity: number | string | null | undefined;
  unit_price: number | string | null | undefined;
  total_value?: number | string | null | undefined;
}

export function ticketSaleRevenue(s: TicketSaleLike): number {
  const tv = s.total_value;
  if (tv !== null && tv !== undefined && tv !== "") {
    const n = Number(tv);
    if (!Number.isNaN(n)) return n;
  }
  return Number(s.quantity || 0) * Number(s.unit_price || 0);
}

export function sumTicketSalesRevenue(sales: TicketSaleLike[]): number {
  return sales.reduce((acc, s) => acc + ticketSaleRevenue(s), 0);
}
