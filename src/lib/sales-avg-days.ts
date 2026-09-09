/**
 * Denominador honesto das médias diárias do BI de Vendas.
 *
 * A média diária não pode dividir pelos dias da JANELA escolhida (chip de
 * 7/14/30/90) quando o evento só começou a vender lá dentro: um evento
 * lançado há 9 dias parecia dez vezes mais fraco num chip de 90.
 *
 * Regra: divide-se pelos dias decorridos desde o PRIMEIRO DIA COM VENDA
 * dentro do período (ou o início do período, o que for mais tarde) até ao
 * fim do período, inclusive. Dias com zero vendas depois do arranque CONTAM
 * — o evento estava à venda e não vendeu, e isso é informação.
 *
 * Um evento que já vendia antes do período mantém a janela inteira.
 */

const diffDays = (fromISO: string, toISO: string) => {
  const [y1, m1, d1] = fromISO.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = toISO.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

/**
 * @param firstSaleDate primeiro dia com venda de toda a vida do evento (ISO) ou null
 * @param periodStart   início do período (ISO)
 * @param periodEnd     fim do período (ISO, inclusive)
 * @param windowDays    dias de calendário da janela (fallback)
 */
export function salesAvgDays(
  firstSaleDate: string | null | undefined,
  periodStart: string,
  periodEnd: string,
  windowDays: number,
): number {
  const window = Math.max(1, Math.round(windowDays));
  if (!firstSaleDate) return window;
  const from = firstSaleDate.slice(0, 10) > periodStart ? firstSaleDate.slice(0, 10) : periodStart;
  if (from > periodEnd) return window;
  const n = diffDays(from, periodEnd) + 1;
  return Math.min(window, Math.max(1, n));
}

/** "em 9 dias de venda" — legenda do denominador usado. */
export function salesAvgDaysLabel(n: number): string {
  return `em ${n} ${n === 1 ? "dia" : "dias"} de venda`;
}
