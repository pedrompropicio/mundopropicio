/**
 * (g15) RELATÓRIO INTERNO DO ENCONTRO DE CONTAS — modelo puro.
 *
 * Vista de STAFF: pode nomear fechamentos e todos os sócios. É a peça de
 * conferência interna do fecho, não um documento de sócio — por isso aqui os
 * termos "fechamento" e os nomes dos participantes são permitidos.
 *
 * Este módulo NÃO calcula nada de novo: recebe os números das fontes únicas
 * (motor dos fechamentos, `event-cost-basis`, `partner-disbursement`) e apenas
 * ordena a cascata e prova que fecha. Se não fechar, devolve a diferença para
 * o gerador imprimir o aviso — nunca se ajusta um número para fechar.
 */

import { roundCents } from "./iva.ts";
import { partnerFinancingToReturn } from "./partner-disbursement.ts";

export interface InternalCascadeDeduction {
  name: string;
  mode: "settles" | "nominal";
  percentage: number;
  value: number;
  /**
   * (g15-c) Quando a posição é NOMINAL, a dedução na cascata continua a ser o
   * valor nominal (é o que sai do pool), mas o leitor tem de ver o número real
   * do fecho desse sócio. Esta nota é apresentação — vem já composta do motor.
   */
  realNote?: string;
}

/**
 * (g15-c) RESUMO GERAL (Mundo Propício) — visão do EVENTO INTEIRO, independente
 * do fechamento seleccionado. Todos os números vêm do motor
 * (`eventNetResult`, partes reais por participante, `house.residual`,
 * `house.declared`, `house.nominalGap`, `house.ivaDeductible`).
 */
export interface InternalOverviewPartnerRow {
  name: string;
  /** Nome do fechamento onde o sócio acerta. */
  settlesAt: string;
  /** Percentagem em cadeia, ex.: "20% de 30%". */
  pctLabel: string;
  /** Parte REAL do motor. */
  realShare: number;
}

export interface InternalOverviewNominalRow {
  name: string;
  nominalPctLabel: string;
  nominalValue: number;
  realPctLabel: string;
  realValue: number;
  realSettlesAt: string;
  diff: number;
}

export interface InternalOverview {
  /** Âncora C1 do motor: `eventNetResult`. */
  resultReal: number;
  revenueNet: number;
  expensesNet: number;
  vatNonRecoverableCost: number;
  exclusiveRevenuesTotal: number;
  thirdPartyTotal: number;
  addbackTotal: number;
  partners: InternalOverviewPartnerRow[];
  /** `partnersPaidTotal` do motor. */
  distributedTotal: number;
  /** `house.residual` do motor. */
  houseNet: number;
  /** Decomposição do residual: declarada, nominal−real, IVA dedutível, resto. */
  houseParts: Array<{ label: string; value: number }>;
  nominalRows: InternalOverviewNominalRow[];
  /** Valor da conferência C1 do motor. */
  c1: number;
}

/** Prova da secção 1: total distribuído + líquido da MP − resultado real. */
export function overviewMismatch(o: InternalOverview): number {
  return roundCents(roundCents(o.distributedTotal) + roundCents(o.houseNet) - roundCents(o.resultReal));
}

export interface InternalCascadeStep {
  /** Valor de partida deste passo. */
  baseValue: number;
  deductions: InternalCascadeDeduction[];
  /** Percentagem contratada do fechamento sobre o valor de partida. */
  quotaPct: number;
  quota: number;
}

export interface InternalItem {
  label: string;
  value: number;
  items?: Array<{ label: string; value: number }>;
}

export interface InternalRootTotals {
  revenueNet: number;
  expensesNet: number;
  expensesGross: number;
  /** true = o resultado da raiz apura sobre despesas c/IVA. */
  usesGrossExpenses: boolean;
}

export interface InternalDistributionRow {
  name: string;
  isHouse: boolean;
  mode: "settles" | "nominal";
  profitPct: number;
  lossPct: number | null;
  /** Rótulo da base efectiva (g10). */
  basisLabel: string;
  share: number;
  /** Onde acerta — nome do fechamento onde o participante liquida. */
  settlesAt: string;
}

export interface InternalPartnerBlock {
  name: string;
  /** "nominal" ⇒ a conta liquida-se noutro fechamento. */
  mode?: "settles" | "nominal";
  /** Nome do fechamento onde o participante acerta. */
  settlesAt?: string;
  profitPct: number;
  lossPct: number | null;
  partnerShare: number;
  disbursement: number;
  adjustmentsTotal: number;
  revenuesHeldTotal: number;
  extrasTotal: number;
  transferBase: number;
  transferWithVat: boolean;
  transferVat: number;
  transferTotal: number;
  /** Linhas de BP pagas pelo sócio, já com a rubrica de Nível 2 resolvida. */
  bpLines: Array<{ rubrica: string; description: string; cityLabel: string; hasTransaction: boolean; amount: number }>;
  bpTotal: number;
  paidExpenses: Array<{ description: string; cityLabel: string; category: string; date: string; amount: number }>;
  paidExpensesTotal: number;
  adjustments: Array<{ description: string; cityLabel: string; date: string; amount: number }>;
  revenuesHeld: Array<{ sourceLabel: string; accountName: string; description: string; date: string; amount: number }>;
  extras: Array<{ originLabel?: string; description: string; cityLabel: string; date: string; amount: number }>;
  transitoryItems: Array<{ description: string; category: string; date: string; sign: 1 | -1; amount: number }>;
  transitoryCredit: number;
}

export interface InternalHousePosition {
  resultRealNet: number;
  deductions: Array<{ name: string; basisLabel: string; value: number }>;
  positionReal: number;
  nominalShare: number;
  ivaDeductibleGain: number;
  vatNonRecoverableCost: number;
  vatNonRecoverableLines: Array<{ label: string; vat: number }>;
}

export interface InternalTicketRow {
  label: string;
  quantity: number;
  totalGross: number;
}

export interface InternalCategoryRow {
  l1Code: string;
  l1Name: string;
  l2Code: string;
  l2Name: string;
  l3Code?: string;
  l3Name?: string;
  base: number;
  iva: number;
  total: number;
}

export interface InternalReportInput {
  eventName: string;
  settlementName: string;
  /** Critério do evento (IVA · base · overhead) — `describeFechoBasis`. */
  criterion: string;
  generatedAt?: Date;
  /** (g15-c) Este relatório é o documento da Mundo Propício. */
  companyName?: string;
  /** (g15-c) Logótipo da empresa (data URL), igual ao documento do sócio. */
  logoDataUrl?: string | null;
  /** (g15-c) Resumo geral do evento inteiro — secção 1. */
  overview?: InternalOverview | null;
  rootTotals: InternalRootTotals;
  /** Vazio na raiz. Ordenado de cima para baixo. */
  cascadeSteps: InternalCascadeStep[];
  vatReturnedIn: number;
  exclusiveRevenues: Array<{ label: string; value: number }>;
  exclusiveRevenuesTotal: number;
  /** Despesas exclusivas do perímetro deste fechamento (na base do nó). */
  exclusiveExpensesTotal?: number;
  thirdPartyOperations: Array<{ label: string; value: number }>;
  thirdPartyTotal: number;
  addbacks: Array<{ label: string; value: number }>;
  addbackTotal: number;
  /** Resultado do fechamento vindo do motor — âncora da prova. */
  nodeResult: number;
  distribution: InternalDistributionRow[];
  partners: InternalPartnerBlock[];
  house: InternalHousePosition | null;
  ticketing: InternalTicketRow[];
  ticketingGroupLabel: string;
  expenseCategories: InternalCategoryRow[];
  /** Nível de detalhe do Anexo B (grupo ou folha do plano). */
  expenseCategoryLevel?: "l2" | "l3";
}

export type InternalCascadeLineKind = "start" | "deduction" | "quota" | "add" | "total" | "note";

export interface InternalCascadeLine {
  kind: InternalCascadeLineKind;
  label: string;
  /** Percentagem, quando aplicável. */
  pctLabel?: string;
  value: number;
  /** Itens do termo (receitas exclusivas, operações…). */
  items?: Array<{ label: string; value: number }>;
}

export interface InternalReport {
  title: string;
  /** Resultado do evento na base da raiz. */
  rootResult: number;
  rootExpenseForResult: number;
  rootExpenseIva: number;
  expenseBasisLabel: string;
  cascade: InternalCascadeLine[];
  /** Soma da cascata — tem de bater com `nodeResult`. */
  cascadeTotal: number;
  /** cascadeTotal − nodeResult; > 0,02 imprime aviso vermelho. */
  cascadeMismatch: number;
  hasCascade: boolean;
}

/**
 * (g15-b) Um documento não tem "tolerância": os totais impressos são os totais
 * do modelo, ao cêntimo. Este limite serve apenas para decidir se o aviso
 * vermelho aparece — e é ZERO à escala do cêntimo.
 */
const CLOSE_TOLERANCE = 0.004;

export function internalReportCloses(mismatch: number): boolean {
  return Math.abs(mismatch) <= CLOSE_TOLERANCE;
}

/**
 * (g15-b) APRESENTAÇÃO DE LINHAS ITEMIZADAS.
 *
 * Os totais vêm sempre do modelo (SSoT). As linhas são apresentação: se a soma
 * das linhas arredondadas a cêntimos divergir do total do modelo por
 * arredondamento, o residual é colocado na linha de maior valor absoluto (a
 * última em caso de empate). Cada linha é arredondada em *round-half-even*
 * (banker's rounding) para o erro não acumular sempre no mesmo sentido.
 *
 * O total NUNCA se altera — é o que o ecrã mostra.
 */
export function reconcileDisplayValues(values: number[], total: number): number[] {
  const halfEven = (v: number): number => {
    const cents = (Number(v) || 0) * 100;
    const floor = Math.floor(cents);
    const frac = cents - floor;
    let n: number;
    if (Math.abs(frac - 0.5) < 1e-9) n = floor % 2 === 0 ? floor : floor + 1;
    else n = Math.round(cents);
    return n / 100;
  };
  const out = values.map(halfEven);
  if (out.length === 0) return out;
  const sum = roundCents(out.reduce((s, v) => s + v, 0));
  const residual = roundCents(roundCents(total) - sum);
  if (residual === 0) return out;
  let idx = 0;
  let best = -1;
  out.forEach((v, i) => {
    if (Math.abs(v) >= best) {
      best = Math.abs(v);
      idx = i;
    }
  });
  out[idx] = roundCents(out[idx] + residual);
  return out;
}

/** Aplica `reconcileDisplayValues` a uma lista de objectos, por campo numérico. */
export function reconcileDisplayField<T, K extends keyof T>(
  rows: T[],
  field: K,
  total: number,
): T[] {
  const fixed = reconcileDisplayValues(rows.map((r) => Number(r[field]) || 0), total);
  return rows.map((r, i) => ({ ...r, [field]: fixed[i] }) as T);
}

const pct = (v: number) => `${String(Math.round(Number(v || 0) * 10000) / 10000).replace(".", ",")}%`;

/**
 * Constrói a cascata da secção 2 e prova que fecha no resultado do fechamento.
 *
 * Na raiz (sem passos) a secção reduz-se a "resultado da raiz + operações de
 * terceiros + custos internos devolvidos" — as receitas exclusivas da raiz já
 * estão dentro do seu próprio perímetro e não se somam outra vez.
 */
export function buildInternalSettlementReport(input: InternalReportInput): InternalReport {
  const { rootTotals } = input;
  const expenseForResult = rootTotals.usesGrossExpenses ? rootTotals.expensesGross : rootTotals.expensesNet;
  const rootResult = roundCents(rootTotals.revenueNet - expenseForResult);
  const expenseBasisLabel = rootTotals.usesGrossExpenses ? "despesas c/IVA" : "despesas s/IVA";
  const hasCascade = input.cascadeSteps.length > 0;

  const lines: InternalCascadeLine[] = [
    {
      kind: "start",
      label: `Resultado do evento (${expenseBasisLabel})`,
      value: rootResult,
    },
  ];

  let running = rootResult;
  input.cascadeSteps.forEach((step, idx) => {
    if (idx > 0) {
      lines.push({ kind: "start", label: "Valor de partida", value: roundCents(step.baseValue) });
    }
    for (const d of step.deductions) {
      lines.push({
        kind: "deduction",
        label:
          d.mode === "nominal"
            ? `(-) ${d.name} — posição nominal`
            : `(-) ${d.name}`,
        pctLabel: pct(d.percentage),
        value: -Math.abs(roundCents(d.value)),
      });
      // (g15-c) A dedução é o nominal (é o que sai do pool); a nota mostra o
      // número real do fecho do sócio e para onde vai a diferença.
      if (d.mode === "nominal" && d.realNote) {
        lines.push({ kind: "note", label: d.realNote, value: 0 });
      }
    }
    lines.push({
      kind: "quota",
      label: idx === input.cascadeSteps.length - 1 ? "= Parte deste fechamento" : "= Parte do fechamento",
      pctLabel: pct(step.quotaPct),
      value: roundCents(step.quota),
    });
    running = roundCents(step.quota);
  });

  const adds: InternalCascadeLine[] = [];
  if (Math.abs(input.vatReturnedIn) > 0.004) {
    adds.push({ kind: "add", label: "(+) IVA dedutível recuperado", value: roundCents(input.vatReturnedIn) });
  }
  if (hasCascade && Math.abs(input.exclusiveRevenuesTotal) > 0.004) {
    adds.push({
      kind: "add",
      label: "(+) Receitas exclusivas deste fechamento",
      value: roundCents(input.exclusiveRevenuesTotal),
      items: input.exclusiveRevenues,
    });
  }
  if (hasCascade && Math.abs(input.exclusiveExpensesTotal ?? 0) > 0.004) {
    adds.push({
      kind: "add",
      label: "(-) Despesas exclusivas deste fechamento",
      value: -Math.abs(roundCents(input.exclusiveExpensesTotal ?? 0)),
    });
  }
  if (Math.abs(input.thirdPartyTotal) > 0.004) {
    adds.push({
      kind: "add",
      label: "(+) Operações de terceiros — resultado ficou com este fechamento",
      value: roundCents(input.thirdPartyTotal),
      items: input.thirdPartyOperations,
    });
  }
  if (Math.abs(input.addbackTotal) > 0.004) {
    adds.push({
      kind: "add",
      label: "(+) Custos internos devolvidos a este fechamento",
      value: roundCents(input.addbackTotal),
      items: input.addbacks,
    });
  }
  lines.push(...adds);

  const cascadeTotal = roundCents(running + adds.reduce((s, a) => s + a.value, 0));
  lines.push({ kind: "total", label: "= Resultado do fechamento", value: cascadeTotal });

  return {
    title: `Fecho do evento · ${input.eventName} · ${input.settlementName}`,
    rootResult,
    rootExpenseForResult: expenseForResult,
    rootExpenseIva: roundCents(rootTotals.expensesGross - rootTotals.expensesNet),
    expenseBasisLabel,
    cascade: lines,
    cascadeTotal,
    cascadeMismatch: roundCents(cascadeTotal - roundCents(input.nodeResult)),
    hasCascade,
  };
}

/** Linha g5 por extenso do bloco de um sócio (secção 4). */
export function partnerAccountLines(p: InternalPartnerBlock): Array<{ label: string; value: number; bold?: boolean }> {
  const rows: Array<{ label: string; value: number; bold?: boolean }> = [
    { label: "Parte no fechamento", value: roundCents(p.partnerShare) },
    { label: "(+) Desembolso do sócio", value: roundCents(p.disbursement) },
  ];
  if (Math.abs(p.adjustmentsTotal) > 0.004) {
    rows.push({ label: "(+/-) Ajustes ao desembolso", value: roundCents(p.adjustmentsTotal) });
  }
  if (Math.abs(p.revenuesHeldTotal) > 0.004) {
    rows.push({ label: "(-) Receitas em poder do sócio", value: -Math.abs(roundCents(p.revenuesHeldTotal)) });
  }
  if (Math.abs(p.extrasTotal) > 0.004) {
    rows.push({ label: "(-) Extras / adiantamentos", value: -Math.abs(roundCents(p.extrasTotal)) });
  }
  rows.push({ label: "= Base a transferir", value: roundCents(p.transferBase), bold: true });
  if (p.transferWithVat && p.transferVat) {
    rows.push({ label: "(+) IVA 23% do repasse", value: roundCents(p.transferVat) });
    rows.push({ label: "= Total", value: roundCents(p.transferTotal), bold: true });
  }
  return rows;
}

/**
 * Prova do bloco do sócio contra a base a transferir do modelo.
 *
 * (g15-b) Usa EXACTAMENTE a mesma cadeia de arredondamento do ecrã
 * (`partnerFinancingToReturn` → base a transferir), senão o documento acusava
 * um cêntimo de diferença que não existe.
 */
export function partnerBlockMismatch(p: InternalPartnerBlock): number {
  const financing = partnerFinancingToReturn(p.disbursement, p.adjustmentsTotal, p.revenuesHeldTotal);
  const detail = roundCents(p.partnerShare + financing - p.extrasTotal);
  return roundCents(detail - roundCents(p.transferBase));
}
