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

/** Mensagens pt-PT dos códigos devolvidos pelas RPCs de pagamento do cachê. */
export const CACHE_ERROR_MESSAGES: Record<string, string> = {
  cache_nao_congelado: "Congele primeiro o cachê no modal; só depois pode criar o contrato de pagamento.",
  cache_ja_congelado: "O cachê já está congelado: lance o adiantamento dentro de um contrato.",
  sem_linha_cache: "Não há linha de cachê (2.1.01) no BP desta cidade. Crie-a no BP ou configure o cachê.",
  linha_cache_por_escolher: "Escolha a linha de cachê do artista nas cidades com várias linhas 2.1.01.",
  linha_cache_invalida: "A linha escolhida não é uma linha de cachê (2.1.01) ativa desta cidade.",
};

export function cacheErrorMessage(e: unknown): string {
  const raw = String((e as any)?.message ?? e ?? "");
  const m = raw.match(/^([a-z_]+):\s*(.*)$/s);
  if (!m) return raw;
  return CACHE_ERROR_MESSAGES[m[1]] ?? m[2];
}

export interface CacheStatusCity {
  event_id: string; name: string; forecast_id: string | null; cap: number | null; source: "config" | "bp"; frozen: boolean;
  candidates: { forecast_id: string; description: string | null; amount: number }[] | null;
}
export interface CacheStatus { root_event_id: string; in_closing: boolean; has_config: boolean; frozen: boolean; cities: CacheStatusCity[] }

/** Regras de interface: contrato só com o cachê configurado congelado; adiantamento livre só antes de congelar. */
export function cachePaymentGates(s: Pick<CacheStatus, "has_config" | "frozen" | "cities">) {
  const pending = s.cities.filter((c) => !c.forecast_id && (c.candidates?.length ?? 0) > 1);
  return {
    pending,
    canCreateContract: (!s.has_config || s.frozen) && pending.length === 0,
    canFreeAdvance: !(s.has_config && s.frozen) && pending.length === 0,
    needsFreeze: s.has_config && !s.frozen,
  };
}

/** Unidade de introdução de valores no painel: euros ou percentagem de uma base. */
export type AmountUnit = "eur" | "pct";

/** Arredonda a 2 casas (cêntimos). */
export const roundCents = (n: number) => e(c(n));

/**
 * Converte o que o utilizador escreveu para euros (o que se grava).
 * % é sobre `base` (cachê efetivo; adiantamento dentro de contrato: saldo disponível).
 * Devolve NaN quando inválido (vazio, negativo, % acima de 100).
 */
export function inputToEuros(input: string, unit: AmountUnit, base: number): number {
  const raw = String(input ?? "").trim().replace(",", ".");
  if (raw === "") return NaN;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0) return NaN;
  if (unit === "eur") return v;
  if (v > 100) return NaN;
  return roundCents((Math.max(0, base) * v) / 100);
}
