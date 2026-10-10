/**
 * #293 — repartição de uma linha de campanha Meta por Master de turnê + cidades.
 *
 * Proporção SUGERIDA pelo gasto por conjunto (crm.meta_adset_insights_daily) no mês
 * da fatura, classificado pela geografia do nome do conjunto:
 *  - o nome cita exactamente UMA cidade da turnê → essa cidade;
 *  - cita várias ("Lisboa + Porto"), só o país ("Portugal") ou nenhuma → partilhado → Master.
 * O valor da linha do PDF (D-ERP31) é a base: soma das partes = valor ao cêntimo,
 * resto do arredondamento na maior parte. A sugestão é editável e confirmada por humano.
 */
export interface TourCity { id: string; name: string; city?: string | null }
export interface AdsetSpend { adset_name: string; spend: number }
export interface SplitPart { event_id: string; label: string; spend: number; amount: number; source: "sugestao" | "manual" }

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Nome da cidade usado na classificação: a cidade do evento, senão o sufixo do nome ("SM - Lisboa"). */
export function cityKey(c: TourCity): string {
  const raw = (c.city && c.city.trim()) || c.name.split(/[-–—·]/).pop()!.trim();
  return norm(raw);
}

/** Devolve o id da cidade do conjunto, ou null (partilhado → Master). */
export function classifyAdset(adsetName: string, cities: TourCity[]): string | null {
  const n = norm(adsetName);
  const hits = cities.filter((c) => {
    const k = cityKey(c);
    return k.length > 0 && new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(n);
  });
  return hits.length === 1 ? hits[0].id : null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Reparte `amount` por Master + cidades na proporção do gasto. Resto na maior parte. */
export function suggestTourSplit(
  amount: number,
  master: { id: string; name: string },
  cities: TourCity[],
  adsets: AdsetSpend[],
): SplitPart[] {
  const spendBy = new Map<string, number>([[master.id, 0], ...cities.map((c) => [c.id, 0] as [string, number])]);
  for (const a of adsets) {
    const target = classifyAdset(a.adset_name, cities) ?? master.id;
    spendBy.set(target, r2((spendBy.get(target) ?? 0) + Number(a.spend || 0)));
  }
  const totalSpend = Array.from(spendBy.values()).reduce((s, v) => s + v, 0);
  const label = (id: string) => (id === master.id ? `${master.name} (partilhado)` : cities.find((c) => c.id === id)!.name);
  const parts: SplitPart[] = Array.from(spendBy.entries()).map(([id, spend]) => ({
    event_id: id,
    label: label(id),
    spend,
    amount: totalSpend > 0 ? r2((amount * spend) / totalSpend) : id === master.id ? r2(amount) : 0,
    source: "sugestao",
  }));
  return fixResidual(parts, amount);
}

/** Acerta a soma ao cêntimo pondo o resto na maior parte. */
export function fixResidual<T extends { amount: number }>(parts: T[], amount: number): T[] {
  const sum = r2(parts.reduce((s, p) => s + p.amount, 0));
  const residual = r2(amount - sum);
  if (residual !== 0 && parts.length > 0) {
    let big = 0;
    parts.forEach((p, i) => { if (p.amount > parts[big].amount) big = i; });
    parts[big] = { ...parts[big], amount: r2(parts[big].amount + residual) };
  }
  return parts;
}

export function splitSumMatches(parts: { amount: number }[], amount: number): boolean {
  return Math.round(parts.reduce((s, p) => s + Number(p.amount || 0), 0) * 100) === Math.round(amount * 100);
}
