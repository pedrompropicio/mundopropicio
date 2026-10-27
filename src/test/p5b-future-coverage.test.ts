import { describe, expect, it } from "vitest";
import { assembleFutureCoverage, type FutureCoverageInput } from "../../supabase/functions/_shared/financial-position/future-coverage";
import { assembleFinancialPosition } from "../../supabase/functions/_shared/financial-position/assemble";
import { parseFinancialPositionP5, futureCoverageSchema } from "@/lib/financial-position-p5";

// P5b passo 2 (D-ERP326): fixtures equivalentes aos factos de Live de 27/10/2026 (sem credenciais).
const CO = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const MAD = "bf9ce2d8-754e-4485-8427-e2d486c39919", MAD_C = "bf9ce2d8-0000-4000-8000-000000000001";
const GHA = "be6dc629-0000-4000-8000-000000000000", GHA_C = "be6dc629-0000-4000-8000-000000000001";
const NEW = "407f43fc-0000-4000-8000-000000000000";
const PLAN = "50000000-0000-4000-8000-000000000000";
const PAST = "60000000-0000-4000-8000-000000000000"; // em_curso já iniciado (multi-data) → fora
const ANI = "70000000-0000-4000-8000-000000000000"; // em_fecho com vendas na Ticketline
const ECI = "a0000000-0000-4000-8000-000000000001", TKL = "a0000000-0000-4000-8000-000000000002", BOL = "a0000000-0000-4000-8000-000000000003";

const pe = (id: string, estagio: string, first_day: string | null, o: any = {}) => ({
  evento_id: id, estagio, first_day, started: first_day != null && first_day <= "2026-10-27",
  a_pagar_total: 0, a_pagar_lancado: 0, a_pagar_sem_linha: 0, bp_total: 0, bp_por_lancar: 0, despesas_pagas: 0, ...o,
});
const base = (over: any = {}) => ({
  meta: { company_id: CO, year: null, reference_date: "2026-10-27", version: "p4-v1", balances_visible: true },
  eventos_por_estagio: {
    em_curso: [{ event_id: MAD, name: "H&K Madrid" }, { event_id: GHA, name: "Ghanem 2027" }, { event_id: NEW, name: "Newgang 2027" }, { event_id: PAST, name: "Passado" }],
    planeamento: [{ event_id: PLAN, name: "Sem data" }], em_fecho: [{ event_id: ANI, name: "Anitta" }],
  },
  posicao: { caixa: 543778.17, cartoes: 10 },
  retido: {
    visivel: [{ account_id: ECI, name: "ECI", saldo: 296662.25 }],
    ocultas: [{ account_id: TKL, name: "Ticketline", saldo: 170842.41 }, { account_id: BOL, name: "BOL", saldo: 45085 }],
    total_visiveis: 296662.25, total_ocultas: 215927.41,
  },
  a_pagar: {
    total: 300, transitorias: { total: 0 },
    por_evento: [
      pe(MAD, "em_curso", "2026-11-21", { a_pagar_total: 184670.96, a_pagar_lancado: 184670.96, a_pagar_sem_linha: 162336.96, bp_total: 666560.59, bp_por_lancar: 265640.5, despesas_pagas: 378586.08 }),
      pe(GHA, "em_curso", "2027-02-11", { a_pagar_total: 60398.11, a_pagar_lancado: 60398.11, a_pagar_sem_linha: 4200, bp_total: 213746.5, bp_por_lancar: 143981.59, despesas_pagas: 15438.74 }),
      pe(NEW, "em_curso", "2027-07-01", { a_pagar_total: 25.87, a_pagar_lancado: 25.87, bp_total: 503964.7, bp_por_lancar: 485494.64, despesas_pagas: 18444.2 }),
      pe(PLAN, "planeamento", null),
      pe(PAST, "em_curso", "2026-01-10", { despesas_pagas: 999 }),
      pe(ANI, "em_fecho", "2026-05-01", { despesas_pagas: 5 }),
    ],
  },
  a_receber: { total: 20, transitorias: { total: 0 } },
  alertas: { bp_sem_transacao: { total: 0, n: 0 } }, acerto_informativo: { fora_do_total: true, contas: [] },
  ...over,
});
const input = (o: Partial<FutureCoverageInput> = {}): FutureCoverageInput => ({
  base: base(),
  rootOf: { [MAD_C]: MAD, [GHA_C]: GHA },
  sales: [
    { account_id: ECI, name: "ECI", rows: [{ event_id: MAD_C, revenue: 296662.25 }] },
    { account_id: TKL, name: "Ticketline", rows: [{ event_id: GHA_C, revenue: 279893 }, { event_id: ANI, revenue: 1000 }] },
    { account_id: BOL, name: "BOL", rows: [{ event_id: GHA, revenue: 45085 }] },
    { account_id: "a0000000-0000-4000-8000-000000000009", name: "Vazia", rows: [] },
  ],
  cash: [{ event_id: MAD, realized: -6724.5 }, { event_id: NEW, realized: -18444.2 }, { event_id: null, realized: 1234 }],
  preCutoff: [{ event_id: MAD, type: "income", paid: 99000 }],
  aportes: [
    { event_id: MAD, payment_date: "2026-08-27", description: "Aporte HK", account_name: "Santander", account_type: "bank", skip_balance_check: false, paid: 99000 },
    { event_id: MAD_C, payment_date: "2026-09-18", description: "HK Touring SL", account_name: "Santander", account_type: "bank", skip_balance_check: false, paid: 150000 },
    { event_id: MAD, payment_date: "2026-09-01", description: "Aporte automático — consórcio", account_name: "Pgto Mágicos Acerto Madrid", account_type: "other", skip_balance_check: true, paid: 104810.51 },
  ],
  ...o,
});
const ev = (c: any, id: string) => c.eventos.find((e: any) => e.event_id === id);

describe("P5b cobertura de eventos futuros", () => {
  it("Madrid: aportes, estimativa MP, dinheiro parado em 3 parcelas e duas leituras da necessidade", () => {
    const c: any = assembleFutureCoverage(input()); const m = ev(c, MAD);
    expect(m.aporte_socios).toMatchObject({ total: 353810.51, por_transferencia_conta_liquida: 249000, pago_direto_automatico: 104810.51 });
    expect(m.aporte_socios.linhas).toHaveLength(3);
    expect(m.aporte_mp_estimativa).toBe(24775.57);
    expect(m.dinheiro_parado_bruto).toEqual({ desde_corte: -6724.5, anterior_ao_corte: 99000, total: 92275.5 });
    expect(m.dinheiro_parado).toBe(92275.5); expect(m.caixa_mp_adiantado).toBe(0);
    expect(m.necessidade_financiamento).toEqual({ com_sem_linha: 358035.96, sem_linha_cobre_bp: 195699 });
    expect(m.vendas_bruto).toBe(296662.25); expect(m.fonte_vendas).toBe("unica");
    expect(m.custo_total_projetado.com_sem_linha).toBe(828897.54);
  });
  it("Ghanem: pool Ticketline mínimo 109.050,59 e evento indeterminado; BOL retido = vendas → 0; ECI única", () => {
    const c: any = assembleFutureCoverage(input());
    const b = Object.fromEntries(c.bilheteiras.map((x: any) => [x.nome, x]));
    expect(b.Ticketline).toMatchObject({ vendas_eventos_futuros: 279893, saido_minimo: 109050.59, fonte: "indeterminado" });
    expect(b.BOL).toMatchObject({ vendas_eventos_futuros: 45085, retido_conta: 45085, saido_minimo: 0 });
    expect(b.ECI).toMatchObject({ fonte: "unica", saido_minimo: 0 });
    expect(b.Vazia).toBeUndefined();
    expect(ev(c, GHA)).toMatchObject({ vendas_bruto: 324978, fonte_vendas: "indeterminado" });
    expect(c.total.saido_minimo_total).toBe(109050.59);
  });
  it("Newgang sem vendas: caixa MP adiantado 18.444,20, dinheiro parado 0, cobertura negativa", () => {
    const n = ev(assembleFutureCoverage(input()), NEW);
    expect(n).toMatchObject({ vendas_bruto: 0, fonte_vendas: "sem_vendas", dinheiro_parado: 0, caixa_mp_adiantado: 18444.2 });
    expect(n.necessidade_financiamento.com_sem_linha).toBe(485520.51);
    expect(n.cobertura.com_sem_linha).toBeLessThan(0);
  });
  it("conjunto: planeamento sem data entra marcado; em_curso já iniciado e em_fecho ficam fora", () => {
    const c: any = assembleFutureCoverage(input());
    expect(ev(c, PLAN)).toMatchObject({ data_indeterminada: true, first_day: null });
    expect(ev(c, PAST)).toBeUndefined(); expect(ev(c, ANI)).toBeUndefined();
    expect(c.total.caixa_mp_adiantado_total).toBe(18444.2);
    expect(c.total.dinheiro_de_eventos_em_conta).toBe(92275.5);
  });
  it("saldos invisíveis → retido e saído null", () => {
    const c: any = assembleFutureCoverage(input({ base: base({ meta: { ...base().meta, balances_visible: false } }) }));
    expect(c.bilheteiras.every((b: any) => b.retido_conta === null && b.saido_minimo === null)).toBe(true);
    expect(c.total.saido_minimo_total).toBeNull();
  });
  it("get_event_cash_position negado → bloco incompleto com campos null", () => {
    const c = assembleFutureCoverage(input({ cash: null }));
    expect(c).toMatchObject({ meta: { incompleto: true }, eventos: null, bilheteiras: null, total: null });
    expect(futureCoverageSchema.safeParse(c).success).toBe(true);
    expect(futureCoverageSchema.safeParse({ ...c, total: {} }).success).toBe(false);
  });
  it("p5-v3: Saldo Geral e totais iguais com e sem bloco (só a nota destinado a eventos); zod aceita só p5-v3", () => {
    const run = (futureCoverage?: any) => assembleFinancialPosition({ base: base({ meta: { ...base().meta, year: 2026 } }), events: [], structure: [], paidContracts: {}, generatedAt: "2026-10-27T20:00:00Z", futureCoverage });
    const fc = assembleFutureCoverage(input());
    const a: any = run(fc), b: any = run(assembleFutureCoverage(input({ cash: null })));
    expect(a.meta.version).toBe("p5-v3");
    const { notas: na, ...ra } = a.saldo_geral; const { notas: nb, ...rb } = b.saldo_geral;
    expect(ra).toEqual(rb); expect(a.socios).toEqual(b.socios); expect(a.resultado_mp_ano).toEqual(b.resultado_mp_ano);
    expect(na.filter((x: string) => !nb.includes(x))).toEqual(["Destinado a eventos futuros: 92275.50 € dentro do caixa (não altera o caixa)."]);
    expect(parseFinancialPositionP5(a).cobertura_futuros.total?.necessidade.sem_linha_cobre_bp).toBe(fc.total!.necessidade.sem_linha_cobre_bp);
    expect(() => parseFinancialPositionP5({ ...a, meta: { ...a.meta, version: "p5-v2" } })).toThrow();
    expect(() => parseFinancialPositionP5({ ...a, cobertura_futuros: undefined })).toThrow();
  });
});
