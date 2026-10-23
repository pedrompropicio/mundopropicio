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

// ───────────── Issue #346 — ligar adiantamento livre a um contrato existente ─────────────

export type AttachProblem = "saldo_negativo" | "saldo_abaixo_do_pago" | "saldo_em_lista" | "sem_mae_saldo" | "cidade_fora_do_contrato";

export const ATTACH_PROBLEM_TEXT: Record<AttachProblem, string> = {
  saldo_negativo: "O adiantamento é maior do que o saldo do contrato nessa cidade.",
  saldo_abaixo_do_pago: "O saldo da cidade ficaria abaixo do que já foi pago.",
  saldo_em_lista: "O saldo deste contrato está numa lista de pagamento. Retire-o da lista primeiro.",
  sem_mae_saldo: "Este contrato já não tem saldo ao artista.",
  cidade_fora_do_contrato: "A cidade do adiantamento não faz parte deste contrato.",
};

export interface AttachCityState { event_id: string; balance: number; paid: number }

/**
 * Prévia pura de `attach_cache_advance_to_contract`: por cidade do adiantamento, saldo do contrato
 * antes → depois; adiantamentos do contrato antes → depois; e as recusas que a RPC faria.
 */
export function previewAttachAdvance(args: {
  advanceByCity: Record<string, number>;
  cities: AttachCityState[];
  contractAdvances: number;
  hasArtistMother: boolean;
  motherAmount: number;
  motherPaid: number;
  inPaymentList: boolean;
}) {
  const problems: AttachProblem[] = [];
  const add = (p: AttachProblem) => { if (!problems.includes(p)) problems.push(p); };
  if (!args.hasArtistMother) add("sem_mae_saldo");
  if (args.inPaymentList) add("saldo_em_lista");
  let total = 0;
  const rows = Object.entries(args.advanceByCity).map(([event_id, amt]) => {
    total += c(amt);
    const city = args.cities.find((x) => x.event_id === event_id);
    if (!city) { add("cidade_fora_do_contrato"); return { event_id, amount: amt, before: 0, after: e(-c(amt)) }; }
    const after = e(c(city.balance) - c(amt));
    if (after < 0) add("saldo_negativo");
    else if (c(after) < c(city.paid)) add("saldo_abaixo_do_pago");
    return { event_id, amount: amt, before: city.balance, after };
  });
  if (args.hasArtistMother && c(args.motherAmount) - total < c(args.motherPaid) && !problems.includes("saldo_negativo")) add("saldo_abaixo_do_pago");
  return {
    cities: rows,
    amount: e(total),
    advancesBefore: args.contractAdvances,
    advancesAfter: e(c(args.contractAdvances) + total),
    problems,
  };
}

/** Fornecedor do adiantamento ≠ beneficiário do contrato → exige confirmação explícita. */
export function needsBeneficiaryConfirmation(advanceSupplierId: string | null | undefined, beneficiaryId: string | null | undefined) {
  return (advanceSupplierId ?? null) !== (beneficiaryId ?? null);
}

export interface CityCapRow {
  event_id: string; name: string; cap: number; otherQuotas: number; freeAdvances: number;
  /** Espaço livre antes deste contrato: teto − quotas ativas − adiantamentos livres por marcar. */
  room: number; newQuota: number; total: number; exceeds: boolean;
}

/**
 * Aviso do modal "Novo contrato": por cidade, quotas dos contratos ativos + adiantamentos livres
 * não marcados + quota deste contrato contra o teto (espelha `teto_cidade_excedido`).
 */
export function cityCapCheck(args: {
  cities: { event_id: string; name: string; cap: number }[];
  otherQuotasByCity: Record<string, number>;
  freeNotChosenByCity: Record<string, number>;
  newQuotaByCity: Record<string, number>;
}): { rows: CityCapRow[]; exceeding: CityCapRow[] } {
  const rows = args.cities.map((city) => {
    const otherQuotas = args.otherQuotasByCity[city.event_id] ?? 0;
    const freeAdvances = args.freeNotChosenByCity[city.event_id] ?? 0;
    const newQuota = args.newQuotaByCity[city.event_id] ?? 0;
    const total = e(c(otherQuotas) + c(freeAdvances) + c(newQuota));
    return {
      event_id: city.event_id, name: city.name, cap: city.cap, otherQuotas, freeAdvances,
      room: e(c(city.cap) - c(otherQuotas) - c(freeAdvances)), newQuota, total,
      exceeds: c(total) > c(city.cap),
    };
  });
  return { rows, exceeding: rows.filter((r) => r.exceeds) };
}

Object.assign(CACHE_ERROR_MESSAGES, {
  ...ATTACH_PROBLEM_TEXT,
  beneficiario_diferente: "O fornecedor do adiantamento é diferente do beneficiário do contrato. Marque a confirmação para continuar.",
  adiantamento_ja_associado: "Este adiantamento já pertence a outro contrato.",
  adiantamento_estornado: "Este adiantamento foi estornado e não pode ser ligado.",
  adiantamento_invalido: "Só se podem ligar adiantamentos livres deste cachê (mesmo artista e turnê/evento).",
  adiantamento_inexistente: "O adiantamento já não existe. Atualize a página.",
  contrato_cancelado: "Este contrato foi cancelado.",
  contrato_inexistente: "O contrato já não existe. Atualize a página.",
  empresa_diferente: "O adiantamento é de outra empresa.",
  teto_cidade_excedido: "Uma cidade passaria do seu teto de cachê por causa de um adiantamento livre. Ligue o adiantamento a um contrato existente ou marque-o neste contrato.",
});
