/**
 * #214, 2.ª ronda — elasticidade por virada e projecção ao ritmo de 7 dias.
 * Funções puras, sem React nem supabase. Datas são strings ISO YYYY-MM-DD,
 * contadas por dia de calendário, sem fuso.
 */

export interface DailyQty {
  sale_date: string;
  qty: number | null;
}

const toUTC = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const diffDaysISO = (fromISO: string, toISO: string) => Math.round((toUTC(toISO) - toUTC(fromISO)) / 86400000);
export const addDaysISO = (iso: string, n: number) => new Date(toUTC(iso) + n * 86400000).toISOString().slice(0, 10);

const sumBetween = (series: DailyQty[], fromISO: string, toISO: string) =>
  series.reduce((s, p) => {
    const d = p.sale_date.slice(0, 10);
    return d >= fromISO && d <= toISO ? s + Number(p.qty || 0) : s;
  }, 0);

export const ELASTICITY_WINDOW = 14;

export interface TurnElasticity {
  /** bilhetes/dia do dia −14 ao −1 (÷ 14 dias de calendário). */
  antesDia: number;
  /** bilhetes/dia do dia 0 ao +13 (÷ dias decorridos, até 14). */
  depoisDia: number;
  /** variação % depois vs antes; null quando antes = 0. */
  variacaoPct: number | null;
  /** dias usados na janela depois (14 ou menos). */
  diasDepois: number;
  /** true quando ainda não passaram 14 dias desde a virada. */
  janelaIncompleta: boolean;
}

/**
 * @param series    série diária da zona (dias sem venda podem faltar = 0)
 * @param turnDate  dia da virada (dia 0)
 * @param lastDate  último dia com dados da série (limite da janela depois)
 */
export function turnElasticity(series: DailyQty[], turnDate: string, lastDate: string): TurnElasticity {
  const W = ELASTICITY_WINDOW;
  const antes = sumBetween(series, addDaysISO(turnDate, -W), addDaysISO(turnDate, -1)) / W;
  const elapsed = diffDaysISO(turnDate, lastDate) + 1;
  const diasDepois = Math.max(1, Math.min(W, elapsed));
  const depois = sumBetween(series, turnDate, addDaysISO(turnDate, diasDepois - 1)) / diasDepois;
  return {
    antesDia: antes,
    depoisDia: depois,
    variacaoPct: antes > 0 ? ((depois - antes) / antes) * 100 : null,
    diasDepois,
    janelaIncompleta: diasDepois < W,
  };
}

export interface ZoneProjection {
  /** bilhetes/dia nos últimos 7 dias de calendário até lastDate. */
  ritmo: number;
  parada: boolean;
  /** dias até esgotar o libertado; null sem libertado ou ritmo 0. */
  esgotaDias: number | null;
  esgotaData: string | null;
  /** projecção até ao dia do evento (limitada ao libertado); null se passou/sem data. */
  ateEvento: number | null;
  /** dias do fromDate até ao evento; null se passou/sem data. */
  diasAteEvento: number | null;
}

/**
 * @param series    série diária da zona
 * @param lastDate  última sale_date da série (fim da janela de 7 dias)
 * @param vendido   bilhetes já vendidos na zona
 * @param released  lotação libertada (null = sem leitura)
 * @param eventDate data do evento (null = sem data)
 * @param fromDate  hoje (base para "esgota em" e "dias até ao evento")
 */
export function zoneProjection(opts: {
  series: DailyQty[];
  lastDate: string;
  vendido: number;
  released: number | null;
  eventDate: string | null;
  fromDate: string;
}): ZoneProjection {
  const { series, lastDate, vendido, released, eventDate, fromDate } = opts;
  const ritmo = sumBetween(series, addDaysISO(lastDate, -6), lastDate) / 7;
  const parada = ritmo <= 0;
  const diasAteEvento = eventDate && eventDate >= fromDate ? diffDaysISO(fromDate, eventDate) : null;

  let esgotaDias: number | null = null;
  if (released !== null && !parada) esgotaDias = Math.ceil(Math.max(0, released - vendido) / ritmo);
  const esgotaData = esgotaDias !== null ? addDaysISO(fromDate, esgotaDias) : null;

  let ateEvento: number | null = null;
  if (diasAteEvento !== null) {
    const proj = vendido + Math.max(0, ritmo) * diasAteEvento;
    ateEvento = released !== null ? Math.min(Math.max(released, vendido), proj) : proj;
  }
  return { ritmo, parada, esgotaDias, esgotaData, ateEvento, diasAteEvento };
}
