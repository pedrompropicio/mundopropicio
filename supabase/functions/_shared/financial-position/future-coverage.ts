/**
 * (P5b, D-ERP326) Cobertura de eventos futuros — montagem PURA.
 *
 * Fonte única do "a pagar": a_pagar.por_evento da RPC get_financial_position_base (0284).
 * Não há réplica da regra aqui: só se lê, soma e rotula. Vendas vêm de get_ticket_office_sales
 * (D-ERP15), caixa do evento de get_event_cash_position (+ movimento anterior à data de corte),
 * aportes de transações aporte_socio. Nunca se rateia a bilheteira por evento.
 */

import { forecastRoot, revenueCoverage } from "../ticketing/planning-forecast.ts";

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const nz = (v: unknown) => Number(v) || 0;

export const FUTURE_COVERAGE_NOTES = {
  bp_provisorio: "BP provisório: o BP ainda pode ser substituído; não é o custo final.",
  necessidade: "Inclui BP por lançar de eventos não iniciados; vendas retidas não entram.",
  duas_leituras: "com_sem_linha soma as faturas sem linha de BP ao BP por lançar; sem_linha_cobre_bp assume que essas faturas cobrem BP por lançar. Nenhuma é escolhida.",
  aporte_socios: "O sistema não regista que sócio aportou (#385).",
  aporte_mp: "Estimativa por resíduo; o pagador dos pagamentos sem conta é desconhecido (#384).",
  bilheteira: "Mínimo: a bilheteira não reparte por evento antes do fecho.",
  dinheiro_parado: "Movimento desde a data de corte (get_event_cash_position) + movimento anterior à data de corte, já no saldo inicial da conta.",
  caixa_mp_adiantado: "Caixa geral que já pagou despesas do evento (bicicleta).",
} as const;

export interface SalesAccountInput { account_id: string; name: string; rows: Array<{ event_id: string; revenue: number }> }
export interface CashRowInput { event_id: string | null; realized: number }
export interface PreCutoffRowInput { event_id: string; type: string; paid: number }
export interface AporteRowInput {
  event_id: string; payment_date: string | null; description: string | null; account_name: string | null;
  account_type: string | null; skip_balance_check: boolean | null; paid: number;
}
export interface FutureCoverageInput {
  base: any;
  /** event_id → root_id (árvore completa por parent_event_id). */
  rootOf: Record<string, string>;
  /** null = leitura falhou. */
  sales: SalesAccountInput[] | null;
  cash: CashRowInput[] | null;
  preCutoff: PreCutoffRowInput[] | null;
  aportes: AporteRowInput[] | null;
  error?: string | null;
}

const LIQUID = new Set(["bank", "cash", "prepaid_card"]);

export function futureEventSet(base: any) {
  const ref = String(base?.meta?.reference_date ?? "");
  const names = new Map<string, string>();
  for (const items of Object.values<any>(base?.eventos_por_estagio ?? {})) for (const it of items ?? []) names.set(it.event_id, it.name);
  return (base?.a_pagar?.por_evento ?? [])
    .filter((e: any) => (e.estagio === "planeamento" || e.estagio === "em_curso") && (e.first_day == null || String(e.first_day) >= ref))
    .map((e: any) => ({ ...e, nome: names.get(e.evento_id) ?? "" }));
}

function emptyBlock(motivo: string) {
  return {
    meta: { incompleto: true, motivo, nota_bp_provisorio: FUTURE_COVERAGE_NOTES.bp_provisorio, notas: FUTURE_COVERAGE_NOTES },
    eventos: null, bilheteiras: null, total: null,
  };
}

type PlanningCoverageBlock = {
  eventos: Array<ReturnType<typeof forecastRoot> & { event_id: string }>;
} & ReturnType<typeof revenueCoverage>;

export function assembleFutureCoverage(input: FutureCoverageInput) {
  if (input.error) return emptyBlock(input.error);
  if (!input.sales || !input.cash || !input.preCutoff || !input.aportes) return emptyBlock("leitura_falhou");
  const { base, rootOf } = input;
  const root = (id: string | null) => (id ? rootOf[id] ?? id : null);
  const future = futureEventSet(base);
  const futureIds = new Set<string>(future.map((e: any) => e.evento_id));
  const visible = base?.meta?.balances_visible === true;
  const retidoMap = new Map<string, number | null>();
  for (const a of [...(base?.retido?.visivel ?? []), ...(base?.retido?.ocultas ?? [])]) retidoMap.set(a.account_id, a.saldo == null ? null : nz(a.saldo));

  // Vendas por conta e por evento raiz.
  const salesByRoot = new Map<string, number>();
  const accountsOfRoot = new Map<string, Set<string>>();
  const single = new Map<string, boolean>();
  const bilheteiras = input.sales.map((acc) => {
    const byRoot = new Map<string, number>();
    for (const r of acc.rows) { const k = root(r.event_id); if (k) byRoot.set(k, (byRoot.get(k) ?? 0) + nz(r.revenue)); }
    const fut = [...byRoot].filter(([k, v]) => futureIds.has(k) && Math.abs(v) > 0.005);
    const others = [...byRoot].filter(([k, v]) => !futureIds.has(k) && Math.abs(v) > 0.005);
    single.set(acc.account_id, fut.length === 1 && others.length === 0);
    for (const [k, v] of fut) {
      salesByRoot.set(k, (salesByRoot.get(k) ?? 0) + v);
      accountsOfRoot.set(k, (accountsOfRoot.get(k) ?? new Set()).add(acc.account_id));
    }
    const vendas = fut.reduce((s, [, v]) => s + v, 0);
    const ret = visible && retidoMap.has(acc.account_id) ? retidoMap.get(acc.account_id) ?? null : null;
    return {
      account_id: acc.account_id, nome: acc.name,
      vendas_eventos_futuros: r2(vendas),
      retido_conta: ret == null ? null : r2(ret),
      saido_minimo: ret == null ? null : r2(Math.max(0, vendas - ret)),
      fonte: fut.length === 1 && others.length === 0 ? "unica" : "indeterminado",
      eventos: fut.map(([event_id, v]) => ({ event_id, vendas: r2(v) })),
      nota: FUTURE_COVERAGE_NOTES.bilheteira,
    };
  }).filter((b) => b.eventos.length > 0);

  const realizedByRoot = new Map<string, number>();
  for (const c of input.cash) { const k = root(c.event_id); if (k) realizedByRoot.set(k, (realizedByRoot.get(k) ?? 0) + nz(c.realized)); }
  const preByRoot = new Map<string, number>();
  for (const t of input.preCutoff) {
    const k = root(t.event_id); const s = t.type === "income" ? nz(t.paid) : t.type === "expense" ? -nz(t.paid) : 0;
    if (k) preByRoot.set(k, (preByRoot.get(k) ?? 0) + s);
  }
  const aportesByRoot = new Map<string, AporteRowInput[]>();
  for (const a of input.aportes) { const k = root(a.event_id); if (k) aportesByRoot.set(k, [...(aportesByRoot.get(k) ?? []), a]); }

  const eventos = future.map((e: any) => {
    const id = e.evento_id as string;
    const pagas = nz(e.despesas_pagas), lanc = nz(e.a_pagar_lancado), semLinha = nz(e.a_pagar_sem_linha), porLancar = nz(e.bp_por_lancar);
    const vendas = salesByRoot.get(id) ?? 0;
    const accs = [...(accountsOfRoot.get(id) ?? [])];
    const fonte = accs.length === 0 ? "sem_vendas" : accs.every((a) => single.get(a)) ? "unica" : "indeterminado";
    const porLancarCobre = Math.max(0, porLancar - semLinha);
    const custoA = pagas + lanc + porLancar, custoB = pagas + lanc + porLancarCobre;
    const desdeCorte = realizedByRoot.get(id) ?? 0, antesCorte = preByRoot.get(id) ?? 0;
    const bruto = desdeCorte + antesCorte;
    const parado = Math.max(0, bruto), adiantado = Math.max(0, -bruto);
    const ap = aportesByRoot.get(id) ?? [];
    const apTot = ap.reduce((s, a) => s + nz(a.paid), 0);
    const apLiq = ap.filter((a) => LIQUID.has(String(a.account_type)) && a.skip_balance_check === false).reduce((s, a) => s + nz(a.paid), 0);
    return {
      event_id: id, nome: e.nome, estagio: e.estagio, first_day: e.first_day ?? null,
      started: e.started === true, data_indeterminada: e.first_day == null,
      vendas_bruto: r2(vendas), fonte_vendas: fonte,
      bp_total: r2(nz(e.bp_total)), despesas_pagas: r2(pagas), a_pagar_lancado: r2(lanc),
      a_pagar_sem_linha: r2(semLinha), bp_por_lancar: r2(porLancar),
      custo_total_projetado: { com_sem_linha: r2(custoA), sem_linha_cobre_bp: r2(custoB) },
      cobertura: { com_sem_linha: r2(vendas - custoA), sem_linha_cobre_bp: r2(vendas - custoB) },
      aporte_socios: {
        total: r2(apTot), por_transferencia_conta_liquida: r2(apLiq), pago_direto_automatico: r2(apTot - apLiq),
        linhas: ap.map((a) => ({ data: a.payment_date, descricao: a.description ?? "", conta: a.account_name, valor: r2(a.paid) })),
      },
      aporte_mp_estimativa: r2(Math.max(0, pagas - apTot)),
      dinheiro_parado_bruto: { desde_corte: r2(desdeCorte), anterior_ao_corte: r2(antesCorte), total: r2(bruto) },
      dinheiro_parado: r2(parado), caixa_mp_adiantado: r2(adiantado),
      necessidade_financiamento: {
        com_sem_linha: r2(Math.max(0, lanc + porLancar - parado)),
        sem_linha_cobre_bp: r2(Math.max(0, lanc + porLancarCobre - parado)),
      },
    };
  });

  const sum = (f: (e: any) => number) => r2(eventos.reduce((s: number, e: any) => s + f(e), 0));
  const saidoNull = bilheteiras.some((b) => b.saido_minimo == null);
  const salesByEvent: Record<string, number> = {};
  for (const a of input.sales) for (const s of a.rows) salesByEvent[s.event_id] = (salesByEvent[s.event_id] ?? 0) + nz(s.revenue);
  const planning = future.map((e: any) => ({ event_id: e.evento_id,
    ...forecastRoot(e.planeamento ?? [], e.evento_id, salesByEvent, String(base.meta.reference_date), e.first_day ?? null) }));
  const currentNeed = { com_sem_linha: sum(e => e.necessidade_financiamento.com_sem_linha), sem_linha_cobre_bp: sum(e => e.necessidade_financiamento.sem_linha_cobre_bp) };
  const minimumOut = saidoNull ? null : r2(bilheteiras.reduce((s, b) => s + (b.saido_minimo ?? 0), 0));
  // Without an active forecast preserve the complete legacy JSON, not just its totals.
  const forecastBlock: { receita_prevista?: PlanningCoverageBlock } = planning.some(e => e.ativo) ? { receita_prevista: {
    eventos: planning.map(p => ({ ...p, receita_considerada: Math.max(p.receita_considerada, salesByRoot.get(p.event_id) ?? 0) })),
    ...revenueCoverage(currentNeed, planning.reduce((s, p) => s + Math.max(p.receita_considerada, salesByRoot.get(p.event_id) ?? 0), 0), minimumOut),
  } } : {};
  return {
    meta: { incompleto: false, motivo: null, nota_bp_provisorio: FUTURE_COVERAGE_NOTES.bp_provisorio, notas: FUTURE_COVERAGE_NOTES },
    eventos, bilheteiras, ...forecastBlock,
    total: {
      vendas_futuras: sum((e) => e.vendas_bruto), despesas_pagas_futuras: sum((e) => e.despesas_pagas),
      a_pagar_lancado_futuros: sum((e) => e.a_pagar_lancado), a_pagar_sem_linha_futuros: sum((e) => e.a_pagar_sem_linha),
      bp_por_lancar_futuros: sum((e) => e.bp_por_lancar),
      saido_minimo_total: saidoNull ? null : r2(bilheteiras.reduce((s, b) => s + (b.saido_minimo ?? 0), 0)),
      aporte_socios_total: sum((e) => e.aporte_socios.total), aporte_mp_estimativa_total: sum((e) => e.aporte_mp_estimativa),
      dinheiro_de_eventos_em_conta: sum((e) => e.dinheiro_parado), caixa_mp_adiantado_total: sum((e) => e.caixa_mp_adiantado),
      necessidade: {
        com_sem_linha: sum((e) => e.necessidade_financiamento.com_sem_linha),
        sem_linha_cobre_bp: sum((e) => e.necessidade_financiamento.sem_linha_cobre_bp),
      },
    },
  };
}

export type FutureCoverage = ReturnType<typeof assembleFutureCoverage> & { receita_prevista?: PlanningCoverageBlock };
