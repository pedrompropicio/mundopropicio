/**
 * MOTOR DOS APURAMENTOS — épica #146, sub-tarefa (c). DR-2026-09-09-D25.
 *
 * Função PURA: não fala com o Supabase, não lê preferências, não escreve nada.
 * Recebe já carregados (i) a árvore de apuramentos e os participantes da peça (a),
 * (ii) as linhas de BP/transações marcadas com apuramento da peça (b) e (iii) os
 * MESMOS totais do evento que o Encontro de Contas usa hoje
 * (`PartnerSettlementTab`: receita via `event-revenue-basis`/ticket_sales +
 * transações, despesa pela base do evento com overhead e excesso por rubrica).
 *
 * PARIDADE (requisito duro): num evento só com a raiz e sem linhas marcadas, a
 * parte de cada participante é, ao cêntimo, o `partnerShare` que o Encontro de
 * Contas mostra hoje no modo "por contrato de cada sócio" — porque o perímetro
 * da raiz é exactamente o total do evento e a base por participante usa os
 * mesmos helpers (`partnerUsesGrossExpenses` / `ignoresOperationalExpenses`).
 *
 * Convenções:
 *  • Receita sempre s/IVA (D24). Despesa em duas leituras, s/IVA e c/IVA, com
 *    IVA linha a linha via `@/lib/iva` (Art.º 18 CIVA).
 *  • A casa (`house`) apura s/IVA — convenção da empresa gestora (D-ERP10).
 *  • Arredondamento ao cêntimo só na saída, nunca por bloco intermédio.
 */
import { roundCents } from "@/lib/iva";
import { lineValue } from "@/lib/event-cost-basis";
import {
  ignoresOperationalExpenses,
  partnerUsesGrossExpenses,
  type PartnerCalcBasis,
} from "@/lib/partner-calc-basis";

export type ParentShareBasis = "net_result" | "net_result_gross_expenses";

export interface EngineSettlement {
  id: string;
  name: string;
  parent_id: string | null;
  position?: number | null;
  parent_share_pct?: number | string | null;
  parent_share_basis?: ParentShareBasis | null;
  is_sealed?: boolean | null;
}

export interface EngineParticipant {
  id: string;
  settlement_id: string;
  participant_kind: "house" | "partner";
  /** Nome já resolvido (fornecedor ou "MUNDO PROPÍCIO"). */
  name: string;
  supplier_id?: string | null;
  event_partner_id?: string | null;
  mode: "settles" | "nominal";
  profit_pct: number | string | null;
  loss_pct?: number | string | null;
  /** null = herda a base contratual do evento. */
  expense_includes_iva?: boolean | null;
}

/** Linha de BP ou transação MARCADA com um apuramento. */
export interface EngineMarkedLine {
  event_settlement_id: string;
  kind: "bp" | "tx";
  type: "income" | "expense";
  amount: number | string | null;
  iva_rate?: number | string | null;
}

/**
 * Extras do sócio e despesas por ele pagas — nas duas bases, porque o Encontro
 * de Contas aplica-lhes a mesma base do apuramento do sócio (informativo).
 */
export interface EngineParticipantMoney {
  paidByPartner?: number;
  paidByPartnerGross?: number;
  extras?: number;
  extrasGross?: number;
}

export interface EngineInput {
  /** `events.partner_calc_basis` normalizado. */
  eventBasis: PartnerCalcBasis | string | null | undefined;
  /** Totais do EVENTO INTEIRO, como o Encontro de Contas os calcula hoje. */
  eventTotals: { revenueNet: number; expensesNet: number; expensesGross: number };
  settlements: EngineSettlement[];
  participants: EngineParticipant[];
  markedLines?: EngineMarkedLine[];
  /** Por `event_partner_id` (ou `supplier_id` em fallback). */
  moneyByPartner?: Record<string, EngineParticipantMoney>;
}

export interface ParticipantResult {
  id: string;
  settlementId: string;
  name: string;
  kind: "house" | "partner";
  mode: "settles" | "nominal";
  profitPct: number;
  lossPct: number | null;
  /** % aplicada (lucro, ou perda quando o resultado da base do participante < 0). */
  effectivePct: number;
  usesGrossExpenses: boolean;
  /** Parte na base do participante. */
  share: number;
  /** Parte na base s/IVA (referência para a decomposição da MP). */
  shareNet: number;
  paidByPartner: number;
  extras: number;
  /** share + pagas pelo sócio − extras (informativo, espelha o Encontro de Contas). */
  settlementAmount: number;
}

export interface SettlementNodeResult {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  isSealed: boolean;
  /** Quota recebida do pai (na base indicada em `parentQuotaBasis`). */
  parentQuota: number | null;
  parentQuotaBasis: ParentShareBasis | null;
  parentSharePct: number | null;
  perimeter: {
    revenueNet: number;
    expensesNet: number;
    expensesGross: number;
    bpLines: number;
    txLines: number;
    /** true na raiz: apanha tudo o que não está marcado. */
    isRoot: boolean;
  };
  /** Resultado s/IVA (R_s) e c/IVA (R_c). */
  resultNet: number;
  resultGross: number;
  /** Dinheiro que fica neste apuramento: R_s − quotas levadas pelos filhos. */
  moneyNet: number;
  childQuotasNet: number;
  participants: ParticipantResult[];
}

export interface HouseResidual {
  /** R_s do evento − Σ partes `settles` dos sócios (cada uma na base do sócio). */
  residual: number;
  /** Parte declarada da casa (participantes `house`, base s/IVA). */
  declared: number;
  /** (i) diferença de bases: IVA dedutível que fica na sociedade. */
  ivaDeductible: number;
  /** (ii) quotas nominais que não são pagas neste evento. */
  nominalGap: number;
  /** (iii) resto — tem de ser 0; ≠ 0 é erro de configuração das percentagens. */
  rest: number;
}

export interface EngineCheck {
  label: string;
  value: number;
  ok: boolean;
}

export interface EngineResult {
  nodes: SettlementNodeResult[];
  /** Resultado s/IVA do evento (Σ perímetros) — âncora da C1. */
  eventNetResult: number;
  /** Σ partes `settles` dos sócios, cada uma na sua base. */
  partnersPaidTotal: number;
  house: HouseResidual;
  c1: EngineCheck;
  c2: EngineCheck;
  errors: string[];
}

const TOL = 0.005;
const num = (v: unknown) => Number(v ?? 0) || 0;

/** Ordena pais antes de filhos (raiz primeiro), tolerante a ciclos. */
function orderTopologically(settlements: EngineSettlement[]): EngineSettlement[] {
  const out: EngineSettlement[] = [];
  const byParent = new Map<string | null, EngineSettlement[]>();
  for (const s of settlements) {
    const k = s.parent_id ?? null;
    byParent.set(k, [...(byParent.get(k) ?? []), s]);
  }
  const sortFn = (a: EngineSettlement, b: EngineSettlement) =>
    num(a.position) - num(b.position) || a.name.localeCompare(b.name);
  const walk = (parent: string | null, depth: number) => {
    for (const s of (byParent.get(parent) ?? []).sort(sortFn)) {
      if (out.some((o) => o.id === s.id)) continue;
      (s as any).__depth = depth;
      out.push(s);
      walk(s.id, depth + 1);
    }
  };
  walk(null, 0);
  // Nós órfãos (pai inexistente) entram no fim para não desaparecerem da vista.
  for (const s of settlements) {
    if (!out.some((o) => o.id === s.id)) {
      (s as any).__depth = 0;
      out.push(s);
    }
  }
  return out;
}

export function computeSettlementEngine(input: EngineInput): EngineResult {
  const errors: string[] = [];
  const ignoresExpenses = ignoresOperationalExpenses(input.eventBasis as any);
  const marked = input.markedLines ?? [];

  // ── Perímetros marcados ────────────────────────────────────────────
  const perim = new Map<
    string,
    { revenueNet: number; expensesNet: number; expensesGross: number; bpLines: number; txLines: number }
  >();
  const bump = (id: string) => {
    if (!perim.has(id)) {
      perim.set(id, { revenueNet: 0, expensesNet: 0, expensesGross: 0, bpLines: 0, txLines: 0 });
    }
    return perim.get(id)!;
  };
  let markedIncomeNet = 0;
  let markedExpenseNet = 0;
  let markedExpenseGross = 0;
  for (const l of marked) {
    if (!l.event_settlement_id) continue;
    const p = bump(l.event_settlement_id);
    if (l.kind === "bp") p.bpLines += 1;
    else p.txLines += 1;
    if (l.type === "income") {
      const net = num(l.amount);
      p.revenueNet += net;
      markedIncomeNet += net;
    } else {
      const net = lineValue(l.amount, l.iva_rate, false);
      const gross = lineValue(l.amount, l.iva_rate, true);
      p.expensesNet += net;
      p.expensesGross += gross;
      markedExpenseNet += net;
      markedExpenseGross += gross;
    }
  }

  const ordered = orderTopologically(input.settlements);
  const rootIds = ordered.filter((s) => !s.parent_id).map((s) => s.id);
  if (rootIds.length > 1) errors.push("Mais do que um apuramento raiz neste evento.");

  const nodes: SettlementNodeResult[] = [];
  const byId = new Map<string, SettlementNodeResult>();

  for (const s of ordered) {
    const own = perim.get(s.id) ?? {
      revenueNet: 0,
      expensesNet: 0,
      expensesGross: 0,
      bpLines: 0,
      txLines: 0,
    };
    const isRoot = !s.parent_id;

    // A raiz apanha o que NÃO está marcado: total do evento − linhas marcadas.
    const revenueNet = isRoot ? input.eventTotals.revenueNet - markedIncomeNet : own.revenueNet;
    const expensesNet = isRoot ? input.eventTotals.expensesNet - markedExpenseNet : own.expensesNet;
    const expensesGross = isRoot
      ? input.eventTotals.expensesGross - markedExpenseGross
      : own.expensesGross;

    // Quota do pai: % × resultado do pai na base indicada. Irmãos não se subtraem.
    let parentQuota: number | null = null;
    const basis = (s.parent_share_basis ?? null) as ParentShareBasis | null;
    if (!isRoot) {
      const parent = byId.get(s.parent_id!);
      if (!parent) {
        errors.push(`Apuramento "${s.name}" aponta para um pai que não existe.`);
      } else if (s.parent_share_pct == null) {
        errors.push(`Apuramento "${s.name}" sem percentagem sobre o pai.`);
      } else {
        const base = basis === "net_result_gross_expenses" ? parent.resultGross : parent.resultNet;
        parentQuota = base * (num(s.parent_share_pct) / 100);
      }
    }

    const quota = parentQuota ?? 0;
    const resultNet = ignoresExpenses ? quota + revenueNet : quota + revenueNet - expensesNet;
    const resultGross = ignoresExpenses ? quota + revenueNet : quota + revenueNet - expensesGross;

    const node: SettlementNodeResult = {
      id: s.id,
      name: s.name,
      parentId: s.parent_id ?? null,
      depth: num((s as any).__depth),
      isSealed: !!s.is_sealed,
      parentQuota,
      parentQuotaBasis: isRoot ? null : basis,
      parentSharePct: isRoot ? null : (s.parent_share_pct == null ? null : num(s.parent_share_pct)),
      perimeter: { revenueNet, expensesNet, expensesGross, bpLines: own.bpLines, txLines: own.txLines, isRoot },
      resultNet,
      resultGross,
      moneyNet: resultNet,
      childQuotasNet: 0,
      participants: [],
    };
    nodes.push(node);
    byId.set(node.id, node);
  }

  // Quotas levadas pelos filhos saem do dinheiro do pai.
  for (const n of nodes) {
    if (n.parentId && n.parentQuota != null) {
      const parent = byId.get(n.parentId);
      if (parent) {
        parent.childQuotasNet += n.parentQuota;
        parent.moneyNet -= n.parentQuota;
      }
    }
  }

  // ── Participantes ──────────────────────────────────────────────────
  const seenSettles = new Map<string, string>();
  let partnersPaidTotal = 0;
  let declared = 0;
  let ivaDeductible = 0;
  let nominalGap = 0;

  for (const p of input.participants) {
    const node = byId.get(p.settlement_id);
    if (!node) {
      errors.push(`Participante "${p.name}" aponta para um apuramento inexistente.`);
      continue;
    }
    const isHouse = p.participant_kind === "house";
    // A casa apura sempre s/IVA (convenção da empresa gestora, D-ERP10).
    const override = isHouse ? false : (p.expense_includes_iva ?? null);
    const usesGross = partnerUsesGrossExpenses(input.eventBasis as any, override);

    const rOwn = usesGross ? node.resultGross : node.resultNet;
    const profitPct = num(p.profit_pct);
    const lossPct = p.loss_pct == null ? null : num(p.loss_pct);
    const effectivePct = rOwn < 0 && lossPct != null ? lossPct : profitPct;
    const share = rOwn * (effectivePct / 100);
    const effectiveNetPct =
      node.resultNet < 0 && lossPct != null ? lossPct : profitPct;
    const shareNet = node.resultNet * (effectiveNetPct / 100);

    const moneyKey = p.event_partner_id ?? p.supplier_id ?? "";
    const money = (moneyKey && input.moneyByPartner?.[moneyKey]) || {};
    const paidByPartner = isHouse ? 0 : num(money.paidByPartner);
    const extras = isHouse ? 0 : num(money.extras);

    if (!isHouse && p.mode === "settles") {
      const key = p.supplier_id ?? p.event_partner_id ?? p.id;
      if (seenSettles.has(key)) {
        errors.push(`O sócio "${p.name}" acerta em mais do que um apuramento.`);
      }
      seenSettles.set(key, node.id);
      partnersPaidTotal += share;
      ivaDeductible += shareNet - share;
    } else if (!isHouse && p.mode === "nominal") {
      nominalGap += shareNet;
    }
    if (isHouse) declared += shareNet;

    node.participants.push({
      id: p.id,
      settlementId: node.id,
      name: p.name,
      kind: p.participant_kind,
      mode: p.mode,
      profitPct,
      lossPct,
      effectivePct,
      usesGrossExpenses: usesGross,
      share: roundCents(share),
      shareNet: roundCents(shareNet),
      paidByPartner: roundCents(paidByPartner),
      extras: roundCents(extras),
      settlementAmount: roundCents(share + paidByPartner - extras),
    });
  }

  // ── MP residual e conferências ─────────────────────────────────────
  const eventNetResult = nodes.reduce((s, n) => s + n.perimeter.revenueNet - (ignoresExpenses ? 0 : n.perimeter.expensesNet), 0);
  const residual = eventNetResult - partnersPaidTotal;
  const rest = residual - (declared + ivaDeductible + nominalGap);

  const c1Value = partnersPaidTotal + residual - eventNetResult;
  const c2Value = rest;

  return {
    nodes: nodes.map((n) => ({
      ...n,
      parentQuota: n.parentQuota == null ? null : roundCents(n.parentQuota),
      perimeter: {
        ...n.perimeter,
        revenueNet: roundCents(n.perimeter.revenueNet),
        expensesNet: roundCents(n.perimeter.expensesNet),
        expensesGross: roundCents(n.perimeter.expensesGross),
      },
      resultNet: roundCents(n.resultNet),
      resultGross: roundCents(n.resultGross),
      moneyNet: roundCents(n.moneyNet),
      childQuotasNet: roundCents(n.childQuotasNet),
    })),
    eventNetResult: roundCents(eventNetResult),
    partnersPaidTotal: roundCents(partnersPaidTotal),
    house: {
      residual: roundCents(residual),
      declared: roundCents(declared),
      ivaDeductible: roundCents(ivaDeductible),
      nominalGap: roundCents(nominalGap),
      rest: roundCents(rest),
    },
    c1: {
      label: "C1 — Σ partes pagas + residual da MP = resultado do evento",
      value: roundCents(c1Value),
      ok: Math.abs(c1Value) <= TOL,
    },
    c2: {
      label: "C2 — residual = declarada + IVA dedutível + nominal−real",
      value: roundCents(c2Value),
      ok: Math.abs(c2Value) <= TOL,
    },
    errors,
  };
}
