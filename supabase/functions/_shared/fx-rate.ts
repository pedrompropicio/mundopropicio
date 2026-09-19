// Câmbio de referência do BCE (#195).
//
// Regra das faturas avulsas: usa-se o câmbio de referência do BCE da DATA DA
// FATURA; se nessa data não houver fixing (fim de semana/feriado), vale o último
// dia útil anterior. O Frankfurter (dados do BCE, sem chave) já faz isso quando se
// pede uma data: devolve a taxa do último dia útil <= data e diz no campo `date`
// qual foi — é esse valor que devolvemos em `date_used`.
//
// Sem data → `/latest` (comportamento antigo) com fallback exchangerate.host.
// COM data NÃO há fallback: o exchangerate.host não tem histórico fiável, e é
// melhor falhar do que gravar um câmbio inventado.

export type FxCurrency = "BRL" | "USD" | "GBP" | "EUR";

export const FX_CURRENCIES: FxCurrency[] = ["BRL", "USD", "GBP", "EUR"];

export interface EcbRate {
  rate: number;
  source: string;
  date_used: string;
}

export function isFxCurrency(value: unknown): value is FxCurrency {
  return typeof value === "string" && (FX_CURRENCIES as string[]).includes(value.toUpperCase());
}

const today = () => new Date().toISOString().slice(0, 10);

async function frankfurter(from: FxCurrency, date?: string): Promise<EcbRate | null> {
  // https://www.frankfurter.app/docs — dados do BCE, sem chave.
  const path = date ?? "latest";
  try {
    const res = await fetch(`https://api.frankfurter.app/${path}?from=${from}&to=EUR`);
    if (!res.ok) return null;
    const json = await res.json();
    const rate = Number(json?.rates?.EUR);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    const dateUsed = typeof json?.date === "string" ? json.date : (date ?? today());
    return { rate, source: "frankfurter", date_used: dateUsed };
  } catch {
    return null;
  }
}

async function exchangerateHost(from: FxCurrency): Promise<EcbRate | null> {
  try {
    const res = await fetch(`https://api.exchangerate.host/latest?base=${from}&symbols=EUR`);
    if (!res.ok) return null;
    const json = await res.json();
    const rate = Number(json?.rates?.EUR);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return { rate, source: "exchangerate.host", date_used: today() };
  } catch {
    return null;
  }
}

/**
 * Taxa: 1 unidade de `from` = X EUR.
 * @throws Error quando a data é inválida/futura ou o upstream não responde.
 */
export async function getEcbRate(from: FxCurrency, date?: string): Promise<EcbRate> {
  const currency = from.toUpperCase() as FxCurrency;
  if (!FX_CURRENCIES.includes(currency)) {
    throw new Error(`Moeda não suportada: ${from}. Use BRL, USD, GBP ou EUR.`);
  }

  let day: string | undefined;
  if (date != null && String(date).trim() !== "") {
    day = String(date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Data inválida — use o formato AAAA-MM-DD.");
    if (Number.isNaN(Date.parse(`${day}T00:00:00Z`))) throw new Error("Data inválida — use o formato AAAA-MM-DD.");
    if (day > today()) throw new Error("Data no futuro — não existe câmbio de referência.");
  }

  if (currency === "EUR") return { rate: 1, source: "identity", date_used: day ?? today() };

  const primary = await frankfurter(currency, day);
  if (primary) return primary;

  if (day) {
    // Com data não há fallback (ver nota no topo).
    throw new Error(`Não foi possível obter o câmbio ${currency}→EUR do BCE para ${day}.`);
  }

  const fallback = await exchangerateHost(currency);
  if (fallback) return fallback;

  throw new Error(`Não foi possível obter o câmbio ${currency}→EUR.`);
}

/**
 * Série temporal do BCE (Frankfurter) para não fazer um pedido por dia.
 * Devolve só os DIAS DE FIXING existentes no intervalo: { 'AAAA-MM-DD': taxa }.
 * A regra "com data não há fallback" mantém-se — não há fonte alternativa aqui;
 * quem chama é que decide o dia de fixing a usar para cada dia de calendário.
 * @throws Error quando o upstream não responde ou devolve algo inválido.
 */
export async function getEcbSeries(
  from: FxCurrency,
  start: string,
  end: string,
): Promise<Record<string, number>> {
  const currency = from.toUpperCase() as FxCurrency;
  if (!FX_CURRENCIES.includes(currency)) {
    throw new Error(`Moeda não suportada: ${from}. Use BRL, USD, GBP ou EUR.`);
  }
  if (currency === "EUR") return {};
  for (const d of [start, end]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Data inválida — use o formato AAAA-MM-DD.");
  }

  const url = `https://api.frankfurter.app/${start}..${end}?from=${currency}&to=EUR`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    throw new Error(`BCE (frankfurter.app) devolveu ${res.status} para ${currency} ${start}..${end}.`);
  }
  const json = await res.json().catch(() => null);
  const rates = json?.rates;
  if (!rates || typeof rates !== "object") {
    throw new Error(`Resposta sem taxas do BCE para ${currency} ${start}..${end}.`);
  }
  const out: Record<string, number> = {};
  for (const [day, obj] of Object.entries(rates as Record<string, { EUR?: unknown }>)) {
    const rate = Number(obj?.EUR);
    if (Number.isFinite(rate) && rate > 0) out[day] = rate;
  }
  if (Object.keys(out).length === 0) {
    throw new Error(`Sem nenhum fixing do BCE para ${currency} entre ${start} e ${end}.`);
  }
  return out;
}
