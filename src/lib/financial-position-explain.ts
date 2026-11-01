import { POSITION_STAGES, type FinancialPosition } from "@/lib/financial-position";
import type { FinancialPositionP5 } from "@/lib/financial-position-p5";
import { stageLabel } from "@/lib/event-stage";

/**
 * #391 — composição dos totais da Posição Financeira (só leitura).
 * Nunca recalcula o total: decompõe-no a partir dos campos devolvidos e diz se as parcelas reconciliam (±0,01).
 */
export const RECONCILE_TOLERANCE = 0.01;
export interface Part { label: string; value: number | null; sign?: 1 | -1 }
export interface Group { label: string; rows: Part[] }
export interface Breakdown {
  id: string; title: string; formula: string; total: number | null; parts: Part[];
  /** O total é max(0, Σ parcelas). */
  clampZero?: boolean; groups?: Group[]; guideAnchor?: string;
}
export interface Reconciliation { reconciled: boolean; sum: number | null; diff: number | null }

const r2 = (v: number) => Math.round(v * 100) / 100;

export function reconcile(b: Pick<Breakdown, "total" | "parts" | "clampZero">): Reconciliation {
  if (b.total === null || b.parts.some(p => p.value === null)) return { reconciled: false, sum: null, diff: null };
  let sum = b.parts.reduce((acc, p) => acc + (p.sign ?? 1) * (p.value as number), 0);
  if (b.clampZero) sum = Math.max(0, sum);
  sum = r2(sum);
  const diff = r2(b.total - sum);
  return { reconciled: Math.abs(diff) <= RECONCILE_TOLERANCE + 1e-9, sum, diff };
}

type Payable = FinancialPosition["a_pagar"]["por_estagio"]["em_curso"];
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
/** Estágio normalizado: estágio, sublinhas ou totais em falta valem 0 (nunca rebenta). */
export function safeStage(d: FinancialPosition, s: typeof POSITION_STAGES[number]): Payable {
  const p = d.a_pagar?.por_estagio?.[s] as Partial<Payable> | undefined;
  const sub = (p?.sublinhas ?? {}) as Partial<Payable["sublinhas"]>;
  return { total: num(p?.total), bp: num(p?.bp), bp_linhas: num(p?.bp_linhas), linhas_contrato_cache: num(p?.linhas_contrato_cache),
    sublinhas: { lancado: num(sub.lancado), confirmado: num(sub.confirmado), por_rever: num(sub.por_rever), ajustado: num(sub.ajustado), partner_paid_fora_do_total: num(sub.partner_paid_fora_do_total) },
    sem_bp: { total: num(p?.sem_bp?.total), n: num(p?.sem_bp?.n) }, so_transacoes: { total: num(p?.so_transacoes?.total), n: num(p?.so_transacoes?.n) } };
}
export const stageCommitment = (p: Payable) => r2(p.sublinhas.lancado + p.sem_bp.total + p.so_transacoes.total);
export const stageBpPending = (p: Payable) => r2(p.sublinhas.confirmado + p.sublinhas.ajustado + p.sublinhas.por_rever);

/** Compromisso em transações = Σ estágios (lançado + sem BP + só transações); saldo de BP por lançar = Σ (confirmado + ajustado + por rever). */
export function payableSplit(d: FinancialPosition) {
  let compromisso = 0, bpPorLancar = 0;
  for (const s of POSITION_STAGES) { const p = safeStage(d, s); compromisso += stageCommitment(p); bpPorLancar += stageBpPending(p); }
  return { compromisso: r2(compromisso), bpPorLancar: r2(bpPorLancar) };
}

export function explainCommitment(d: FinancialPosition): Breakdown {
  const parts: Part[] = [];
  for (const s of POSITION_STAGES) {
    const p = safeStage(d, s);
    parts.push({ label: `${stageLabel(s)} · lançado`, value: p.sublinhas.lancado }, { label: `${stageLabel(s)} · sem BP`, value: p.sem_bp.total }, { label: `${stageLabel(s)} · só transações`, value: p.so_transacoes.total });
  }
  return { id: "compromisso", title: "Compromisso em transações", formula: "Σ estágios: lançado + sem BP + só transações", total: payableSplit(d).compromisso, parts: parts.filter(p => p.value !== 0), guideAnchor: "a-pagar" };
}
export function explainBpPending(d: FinancialPosition): Breakdown {
  const parts: Part[] = [];
  for (const s of POSITION_STAGES) {
    const p = safeStage(d, s);
    parts.push({ label: `${stageLabel(s)} · confirmado`, value: p.sublinhas.confirmado }, { label: `${stageLabel(s)} · ajustado`, value: p.sublinhas.ajustado }, { label: `${stageLabel(s)} · por rever`, value: p.sublinhas.por_rever });
  }
  return { id: "bp-por-lancar", title: "Saldo de BP por lançar", formula: "Σ estágios: confirmado + ajustado + por rever", total: payableSplit(d).bpPorLancar, parts: parts.filter(p => p.value !== 0), guideAnchor: "a-pagar" };
}
export function explainPayableTotal(d: FinancialPosition): Breakdown {
  const s = payableSplit(d);
  return { id: "a-pagar", title: "A pagar", formula: "Compromisso em transações + saldo de BP por lançar (sem transitórias)", total: d.a_pagar.total,
    parts: [{ label: "Compromisso em transações", value: s.compromisso }, { label: "Saldo de BP por lançar", value: s.bpPorLancar }],
    groups: POSITION_STAGES.map(st => ({ label: stageLabel(st), rows: [{ label: "Total do estágio", value: safeStage(d, st).total }] })), guideAnchor: "a-pagar" };
}
export function explainStage(d: FinancialPosition, stage: typeof POSITION_STAGES[number]): Breakdown {
  const p = safeStage(d, stage);
  return { id: `a-pagar-${stage}`, title: `A pagar · ${stageLabel(stage)}`, formula: "Lançado + confirmado + ajustado + por rever + sem BP + só transações", total: p.total,
    parts: [{ label: "Lançado", value: p.sublinhas.lancado }, { label: "Confirmado", value: p.sublinhas.confirmado }, { label: "Ajustado", value: p.sublinhas.ajustado }, { label: "Por rever", value: p.sublinhas.por_rever }, { label: "Sem BP", value: p.sem_bp.total }, { label: "Só transações", value: p.so_transacoes.total }], guideAnchor: "a-pagar" };
}
export function explainReceivable(d: FinancialPosition): Breakdown {
  return { id: "a-receber", title: "A receber", formula: "Σ estágios (sem transitórias)", total: d.a_receber.total, parts: POSITION_STAGES.map(s => ({ label: stageLabel(s), value: num(d.a_receber?.por_estagio?.[s]?.total) })), guideAnchor: "regras" };
}
export function explainCash(d: FinancialPosition): Breakdown {
  return { id: "caixa", title: "Caixa e cartões", formula: "Σ saldos das contas de caixa + Σ cartões (nunca soma com o retido)", total: d.posicao.caixa_e_cartoes,
    parts: [...d.caixa.map(a => ({ label: a.name, value: a.saldo })), ...d.cartoes.map(a => ({ label: `Cartão · ${a.name}`, value: a.saldo }))], guideAnchor: "regras" };
}
export function explainRetained(d: FinancialPosition): Breakdown {
  return { id: "retido", title: "Retido visível", formula: "Σ saldos das bilheteiras visíveis (nunca soma com a caixa)", total: d.posicao.retido_visiveis,
    parts: d.retido.visivel.map(a => ({ label: a.name, value: a.saldo })), guideAnchor: "regras" };
}
export function explainCaches(c: NonNullable<FinancialPosition["a_pagar"]["caches"]>): Breakdown {
  return { id: "caches", title: "Cachês aprovados por pagar", formula: "Σ por artista + outros cachês sem contrato (informativo, já incluído no a pagar)", total: c.total,
    parts: [...c.por_artista.map(a => ({ label: a.artista ?? "Artista sem nome", value: a.total })), ...(c.sem_contrato.n > 0 || c.sem_contrato.total !== 0 ? [{ label: "Sem contrato", value: c.sem_contrato.total }] : [])], guideAnchor: "a-pagar" };
}

type Coverage = FinancialPositionP5["cobertura_futuros"];
type NeedKey = "com_sem_linha" | "sem_linha_cobre_bp";
const needTitle: Record<NeedKey, string> = { com_sem_linha: "com faturas sem linha", sem_linha_cobre_bp: "faturas sem linha cobrem BP" };

export function explainNeed(c: Coverage, key: NeedKey): Breakdown {
  const ev = c.eventos ?? [];
  return { id: `necessidade-${key}`, title: `Necessidade — ${needTitle[key]}`,
    formula: key === "com_sem_linha" ? "Por evento: max(0, a pagar lançado + BP por lançar − dinheiro do evento em conta)" : "Igual, mas as faturas sem linha saem do BP por lançar",
    total: c.total?.necessidade[key] ?? null, parts: ev.map(e => ({ label: e.nome, value: e.necessidade_financiamento[key] })),
    groups: [...ev.map(e => ({ label: e.nome, rows: [
      { label: "Despesas pagas", value: e.despesas_pagas }, { label: "A pagar lançado", value: e.a_pagar_lancado }, { label: "BP por lançar", value: e.bp_por_lancar },
      { label: "Aporte de sócios", value: e.aporte_socios.total }, { label: "Dinheiro do evento em conta", value: e.dinheiro_parado }, { label: "Necessidade de financiamento", value: e.necessidade_financiamento[key] },
    ] })), ...(c.bilheteiras ?? []).map(b => ({ label: `Bilheteira · ${b.nome}`, rows: [{ label: "Vendas de eventos futuros", value: b.vendas_eventos_futuros }, { label: "Retido em conta", value: b.retido_conta }, { label: "Saído mínimo", value: b.saido_minimo }] }))],
    guideAnchor: "necessidade" };
}

export interface RevenueRead { receita_considerada_total?: number; potencial_total?: number | null; necessidade_com_receita?: Partial<Record<NeedKey, number>> | null }
export function explainRevenue(c: Coverage, rev: RevenueRead) {
  const t = c.total;
  const considered: Breakdown = c.receita_prevista
    ? { id: "receita-considerada", title: "Receita considerada", formula: "Σ receita considerada por evento (cenário de receita)", total: rev.receita_considerada_total ?? null, parts: c.receita_prevista.eventos.map(e => ({ label: (c.eventos ?? []).find(x => x.event_id === e.event_id)?.nome ?? "Evento", value: e.receita_considerada })), guideAnchor: "necessidade" }
    : { id: "receita-considerada", title: "Receita considerada", formula: "Sem cenário de previsão: vendas futuras reais", total: rev.receita_considerada_total ?? null, parts: [{ label: "Vendas futuras", value: t?.vendas_futuras ?? null }], guideAnchor: "necessidade" };
  const potential: Breakdown = { id: "potencial", title: "Potencial após saído mínimo", formula: "max(0, receita considerada − saído mínimo)", total: rev.potencial_total ?? null, clampZero: true,
    parts: [{ label: "Receita considerada", value: rev.receita_considerada_total ?? null }, { label: "Saído mínimo das bilheteiras", value: t?.saido_minimo_total ?? null, sign: -1 }], guideAnchor: "necessidade" };
  const withRevenue = (key: NeedKey): Breakdown => ({ id: `com-receita-${key}`, title: `Com receita — ${needTitle[key]}`, formula: "max(0, necessidade − potencial)", total: rev.necessidade_com_receita?.[key] ?? null, clampZero: true,
    parts: [{ label: `Necessidade — ${needTitle[key]}`, value: t?.necessidade[key] ?? null }, { label: "Potencial", value: rev.potencial_total ?? null, sign: -1 }], guideAnchor: "necessidade" });
  return { considered, potential, withRevenue };
}
