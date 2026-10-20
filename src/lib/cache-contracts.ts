/**
 * Contratos de pagamento do cachê (revê DR-2026-09-03-D15, 20/10/2026).
 * Espelho PURO da regra da base (`_cache_create_contract` / `_cache_alloc`) — só para pré-visualizar.
 * A gravação é sempre feita pela RPC, que recalcula tudo no servidor.
 */
export const MAX_CACHE_CONTRACTS = 4;

const c = (n: number) => Math.round(n * 100);
const e = (cents: number) => cents / 100;

/** Reparte ao cêntimo na proporção dos pesos; a posição `absorber` absorve o arredondamento. */
export function allocateCents(total: number, weights: number[], absorber: number): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) throw new Error("pesos inválidos");
  let acc = 0;
  const out = weights.map((w, i) => {
    if (i === absorber) return 0;
    const v = c((total * w) / sum);
    acc += v;
    return v;
  });
  out[absorber] = c(total) - acc;
  return out.map(e);
}

export interface CacheCity { event_id: string; name: string; cap: number; is_absorber: boolean }

export interface ContractCityPreview {
  event_id: string;
  name: string;
  quota: number;
  withholding: number;
  advances: number;
  artistBalance: number;
}

export interface ContractPreview {
  gross: number;
  withholding: number;
  advances: number;
  artistBalance: number;
  cities: ContractCityPreview[];
  /** Cidades com saldo ao artista negativo (bloqueia). */
  negative: ContractCityPreview[];
}

export function previewContract(args: {
  cities: CacheCity[];
  gross: number;
  /** null = sem retenção. */
  withholdingRate: number | null;
  advancesByCity: Record<string, number>;
}): ContractPreview {
  const { cities, gross, withholdingRate, advancesByCity } = args;
  const absorber = Math.max(0, cities.findIndex((x) => x.is_absorber));
  const caps = cities.map((x) => x.cap);
  const quotas = allocateCents(gross, caps, absorber);
  const W = withholdingRate != null ? e(c((gross * withholdingRate) / 100)) : 0;
  const whs = withholdingRate != null ? allocateCents(W, caps, absorber) : cities.map(() => 0);
  const rows = cities.map((city, i) => {
    const adv = advancesByCity[city.event_id] ?? 0;
    return {
      event_id: city.event_id,
      name: city.name,
      quota: quotas[i],
      withholding: whs[i],
      advances: adv,
      artistBalance: e(c(quotas[i]) - c(whs[i]) - c(adv)),
    };
  });
  const advances = rows.reduce((s, r) => s + c(r.advances), 0);
  return {
    gross,
    withholding: W,
    advances: e(advances),
    artistBalance: e(c(gross) - c(W) - advances),
    cities: rows,
    negative: rows.filter((r) => r.artistBalance < 0),
  };
}

/** “Usar o restante por contratar”: cachê efetivo total − contratos ativos − adiantamentos livres não escolhidos. */
export function remainingToContract(args: {
  totalCap: number;
  otherContractsGross: number;
  freeAdvancesNotChosen: number;
}): number {
  return Math.max(0, e(c(args.totalCap) - c(args.otherContractsGross) - c(args.freeAdvancesNotChosen)));
}

/** Adiantamento depois do contrato: reparte pelas filhas do saldo (maior filha absorve). */
export function splitPostContractAdvance(amount: number, artistChildren: number[]): number[] {
  const order = artistChildren.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const absorber = order[0]?.i ?? 0;
  return allocateCents(amount, artistChildren, absorber);
}
