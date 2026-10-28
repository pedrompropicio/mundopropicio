import { describe, expect, it } from "vitest";
import {
  assembleFinancialPosition, assembleStructure, classifyStructure, gateStatus, partnerDirection, grossOf,
  type EventInput,
} from "../../supabase/functions/_shared/financial-position/assemble";
import { parseFinancialPositionP5 } from "@/lib/financial-position-p5";

const CO = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const E1 = "11111111-1111-4111-8111-111111111111";
const E2 = "22222222-2222-4222-8222-222222222222";
const S1 = "33333333-3333-4333-8333-333333333333";
const S2 = "44444444-4444-4444-8444-444444444444";

const base = (over: any = {}) => ({
  meta: { company_id: CO, year: 2026, reference_date: "2026-10-27", version: "p4-v1", balances_visible: true },
  posicao: { caixa: 1000, cartoes: 10 },
  retido: { total_visiveis: 200, total_ocultas: 50 },
  a_pagar: { total: 300, transitorias: { total: 40 } },
  a_receber: { total: 20, transitorias: { total: 5 } },
  alertas: { bp_sem_transacao: { total: 120, n: 2 } },
  acerto_informativo: { fora_do_total: true, contas: [] },
  ...over,
});
const eng = (residual: number, net: number, partners: number) => ({
  eventNetResult: net, partnersPaidTotal: partners, house: { residual, declared: residual - 3, ivaDeductible: 3 }, checksOk: true, errors: [],
});
const ev = (o: Partial<EventInput>): EventInput => ({ event_id: E1, nome: "E", estagio: "em_fecho", so_bp: false, engine: eng(60, 100, 40), partners: [], ...o });
const run = (events: EventInput[], over: any = {}, structure: any[] = []) =>
  assembleFinancialPosition({ base: base(over), events, structure, paidContracts: {}, generatedAt: "2026-10-27T18:00:00Z" });
const P0 = { valor: 0, linhas: 0, origem: "transactions 1.3.05 (participação Cloudscape)" };

describe("P5 estrutura", () => {
  it("exclui transferências internas, IVA entregue, IRC e financeiro", () => {
    expect(classifyStructure({ code: "10.3", ebitda_class: null })).toEqual({ included: false, motivo: "transferencia_interna" });
    expect(classifyStructure({ code: "10.5.01", ebitda_class: null })).toEqual({ included: false, motivo: "iva_entregue" });
    expect(classifyStructure({ code: "10.5.03", ebitda_class: "imposto_rendimento" })).toEqual({ included: false, motivo: "imposto_rendimento" });
    expect(classifyStructure({ code: "10.2.02", ebitda_class: "financeiro" })).toEqual({ included: false, motivo: "financeiro" });
    expect(classifyStructure({ code: "10.4.01", ebitda_class: null })).toEqual({ included: true, alerta: null });
  });
  it("sem categoria e 2.x/3.x entram com alerta", () => {
    expect(classifyStructure({ code: null, ebitda_class: null })).toEqual({ included: true, alerta: "sem_categoria" });
    expect(classifyStructure({ code: "3.1.05", ebitda_class: null })).toEqual({ included: true, alerta: "possivel_custo_evento_sem_evento" });
  });
  it("IVA inteiro 23 dá bruto ×1,23 e por pagar só approved/pending", () => {
    expect(grossOf(100, 23)).toBeCloseTo(123, 6);
    const s = assembleStructure([
      { code: "10.4.01", name: "Ordenados", ebitda_class: null, amount: 100, iva_rate: 23, paid_amount: 0, status: "pending" },
      { code: "10.4.01", name: "Ordenados", ebitda_class: null, amount: 100, iva_rate: 0, paid_amount: 100, status: "paid" },
      { code: "10.3", name: "TI", ebitda_class: null, amount: 999, iva_rate: 0, paid_amount: 999, status: "paid" },
    ]);
    expect(s.bruto).toBe(223);
    expect(s.por_pagar).toBe(123);
    expect(s.por_pagar_n).toBe(1);
    expect(s.excluidas[0]).toMatchObject({ code: "10.3", bruto: 999 });
  });
});

describe("P5 sócios — regra de sinal", () => {
  it("base negativa → a receber |base| sem IVA", () => {
    expect(partnerDirection({ transferBase: -50, transferTotal: -50 })).toEqual({ sentido: "a_receber", valor: 50 });
  });
  it("base positiva com IVA → por liquidar pelo total c/IVA, abatendo contratos pagos", () => {
    expect(partnerDirection({ transferBase: 100, transferTotal: 123 })).toEqual({ sentido: "por_liquidar", valor: 123 });
    expect(partnerDirection({ transferBase: 100, transferTotal: 123 }, 23)).toEqual({ sentido: "por_liquidar", valor: 100 });
  });
  it("sócio pt-BR sem IVA na transferência: total = base", () => {
    expect(partnerDirection({ transferBase: 80, transferTotal: 80 })).toEqual({ sentido: "por_liquidar", valor: 80 });
  });
  it("alerta nos fechados por liquidar sem contrato pago", () => {
    const out = run([ev({ estagio: "fechado", partners: [{ supplier_id: S1, nome: "EIN", transferBase: 10, transferVat: 0, transferTotal: 10, transferWithVat: false }] })]);
    expect(out.socios.alertas).toEqual([{ event_id: E1, supplier_id: S1, alerta: "acerto_possivelmente_pago_fora_do_sistema" }]);
  });
});

describe("P5 eventos e Saldo Geral", () => {
  it("evento sem participantes: resultado MP = residual do motor", () => {
    const out = run([ev({ engine: eng(100, 100, 0) })]);
    expect(out.eventos[0].resultado_mp).toBe(100);
    expect(out.socios.linhas).toEqual([]);
  });
  it("resultado negativo (loss_pct) passa sem clamp", () => {
    const out = run([ev({ engine: eng(-30, -100, -70) })]);
    expect(out.eventos[0].resultado_mp).toBe(-30);
    expect(out.resultado_mp_ano).toEqual({ sem_estrutura: -30, com_estrutura: -30, participacoes: { cloudscape: P0 }, total_mp: -30 });
  });
  it("Histórico só BP, marcado e fora dos totais", () => {
    const out = run([ev({ estagio: "historico", engine: eng(999, 999, 0), partners: [{ supplier_id: S1, nome: "H", transferBase: -999, transferVat: 0, transferTotal: -999, transferWithVat: false }] }), ev({ event_id: E2, engine: eng(10, 10, 0) })]);
    expect(out.eventos[0]).toMatchObject({ historico: true, so_bp: true, fora_dos_totais: true });
    expect(out.resultado_mp_ano?.sem_estrutura).toBe(10);
    expect(out.socios.a_receber_total).toBe(0);
    expect(out.projecao_em_curso.eventos).toEqual([]);
  });
  it("em_curso com sócio a receber é só projeção; fixture Madrid/Ivete mantém 138.846,44 nos totais", () => {
    const madrid = ev({ nome: "Henry & Klauss – Madrid", estagio: "em_curso", engine: eng(-116573.83, -388579.45, -272005.61),
      partners: [{ supplier_id: S1, nome: "HENRY VARGAS", transferBase: -376816.12, transferVat: 0, transferTotal: -376816.12, transferWithVat: false }] });
    const ivete = ev({ event_id: E2, nome: "Ivete Clareou", engine: eng(100, 200, 100),
      partners: [{ supplier_id: S2, nome: "Sócio Ivete", transferBase: -138846.44, transferVat: 0, transferTotal: -138846.44, transferWithVat: false }] });
    const out = run([madrid, ivete]);
    expect(out.meta.version).toBe("p5-v3");
    expect(out.eventos[0]).toMatchObject({ fora_dos_totais: true, motivo_fora: "em_curso_projecao", resultado_mp: -116573.83 });
    expect(out.socios.a_receber_total).toBe(138846.44);
    expect(out.socios.linhas.map((l) => l.event_id)).toEqual([E2]);
    expect(out.projecao_em_curso).toMatchObject({ resultado_mp_total: -116573.83, socios_a_receber_total: 376816.12, socios_por_liquidar_total: 0 });
    expect(out.projecao_em_curso.eventos[0]).toMatchObject({ event_id: E1, estagio: "em_curso", resultado_evento: -388579.45, partes_socios_total: -272005.61 });
    expect(out.projecao_em_curso.socios_linhas.map((l) => l.event_id)).toEqual([E1]);
    expect(out.resultado_mp_ano).toEqual({ sem_estrutura: 100, com_estrutura: 100, participacoes: { cloudscape: P0 }, total_mp: 100 });
    expect(out.saldo_geral.ativos.a_receber_socios.valor).toBe(138846.44);
    expect(out.saldo_geral).toEqual(run([ivete]).saldo_geral);
    expect(parseFinancialPositionP5(out).projecao_em_curso.socios_a_receber_total).toBe(376816.12);
  });
  it.each(["em_fecho", "fechado"])("%s entra no resultado e nos totais de sócios", (estagio) => {
    const out = run([ev({ estagio, engine: eng(42, 100, 58), partners: [{ supplier_id: S1, nome: "S", transferBase: 10, transferVat: 0, transferTotal: 10, transferWithVat: false }] })]);
    expect(out.resultado_mp_ano?.sem_estrutura).toBe(42);
    expect(out.socios.por_liquidar_total).toBe(10);
    expect(out.saldo_geral.passivos.socios_por_liquidar.valor).toBe(10);
    expect(out.projecao_em_curso.eventos).toEqual([]);
  });
  it("planeamento também fica na projeção, incluindo sócio por liquidar", () => {
    const out = run([ev({ estagio: "planeamento", engine: eng(42, 100, 58), partners: [{ supplier_id: S1, nome: "S", transferBase: 10, transferVat: 0, transferTotal: 10, transferWithVat: false }] })]);
    expect(out.resultado_mp_ano?.sem_estrutura).toBe(0);
    expect(out.socios.por_liquidar_total).toBe(0);
    expect(out.saldo_geral.passivos.socios_por_liquidar.valor).toBe(0);
    expect(out.projecao_em_curso.socios_por_liquidar_total).toBe(10);
    expect(parseFinancialPositionP5(out).eventos[0].motivo_fora).toBe("em_curso_projecao");
  });
  it("projeção com erro não soma projeções parciais", () => {
    const out = run([ev({ estagio: "em_curso", engine: null, error: "timeout" })]);
    expect(out.projecao_em_curso.resultado_mp_total).toBeNull();
    expect(out.projecao_em_curso.socios_a_receber_total).toBeNull();
    expect(out.saldo_geral).toBeNull();
  });
  it("cidade-filha: só o master entra (uma linha por evento raiz da RPC)", () => {
    const out = run([ev({ event_id: E1 })]);
    expect(out.eventos.map((e) => e.event_id)).toEqual([E1]);
  });
  it("BP sem transação não é somado duas vezes; transitórias fora", () => {
    const out = run([ev({ partners: [
      { supplier_id: S1, nome: "A", transferBase: -15, transferVat: 0, transferTotal: -15, transferWithVat: false },
      { supplier_id: S2, nome: "B", transferBase: 100, transferVat: 23, transferTotal: 123, transferWithVat: true },
    ] })]);
    const sg = out.saldo_geral;
    expect(sg).not.toBeNull();
    expect(sg.ativos.total).toBe(1000 + 10 + 200 + 50 + 20 + 15);
    expect(sg.passivos.total).toBe(300 + 0 + 123);
    expect(sg.passivos.a_pagar.dos_quais_bp_sem_transacao.valor).toBe(120);
    expect(sg.posicao_hoje).toBe(1295 - 423);
    expect(parseFinancialPositionP5(out)).toBeTruthy();
  });
  it("estrutura por pagar entra nos passivos e no resultado com estrutura", () => {
    const out = run([ev({ engine: eng(500, 500, 0) })], {}, [
      { code: "10.4.01", name: "O", ebitda_class: null, amount: 100, iva_rate: 0, paid_amount: 40, status: "approved" },
    ]);
    expect(out.resultado_mp_ano).toEqual({ sem_estrutura: 500, com_estrutura: 400, participacoes: { cloudscape: P0 }, total_mp: 400 });
    expect(out.saldo_geral?.passivos.estrutura_por_pagar.valor).toBe(60);
  });
  it("sem saldos visíveis → saldo_geral null", () => {
    const out = run([ev({})], { meta: { company_id: CO, year: 2026, reference_date: "2026-10-27", version: "p4-v1", balances_visible: false }, posicao: { caixa: null, cartoes: null } });
    expect(out.saldo_geral).toBeNull();
    expect(parseFinancialPositionP5(out).meta.saldos_visiveis).toBe(false);
  });
  it("evento com erro/timeout → incompleto, sem somar parcial", () => {
    const out = run([ev({}), ev({ event_id: E2, engine: null, error: "timeout" })]);
    expect(out.meta.incompleto).toBe(true);
    expect(out.meta.eventos_com_erro).toEqual([{ event_id: E2, nome: "E", motivo: "timeout" }]);
    expect(out.resultado_mp_ano).toBeNull();
    expect(out.saldo_geral).toBeNull();
    expect(out.socios.por_liquidar_total).toBeNull();
  });
});

describe("P5 gate e contrato", () => {
  it("erros da RPC mapeiam para 401/403", () => {
    expect(gateStatus("not_authenticated")).toEqual({ error: "not_authenticated", status: 401 });
    expect(gateStatus("company_forbidden")).toEqual({ error: "company_forbidden", status: 403 });
    expect(gateStatus("financial_position_permission_denied")).toEqual({ error: "financial_position_permission_denied", status: 403 });
    expect(gateStatus("outra")).toBeNull();
  });
  it("schema recusa versão errada e saldo com permissão negada", () => {
    const out: any = run([ev({})]);
    expect(() => parseFinancialPositionP5({ ...out, meta: { ...out.meta, version: "p5-v0" } })).toThrow();
    expect(() => parseFinancialPositionP5({ ...out, meta: { ...out.meta, version: "p5-v2" } })).toThrow();
    expect(() => parseFinancialPositionP5({ ...out, meta: { ...out.meta, saldos_visiveis: false } })).toThrow();
  });
  it("schema recusa projeção ausente ou linhas de sócio de projeção nos totais", () => {
    const out = run([ev({ estagio: "em_curso", partners: [{ supplier_id: S1, nome: "S", transferBase: -50, transferVat: 0, transferTotal: -50, transferWithVat: false }] })]);
    expect(() => parseFinancialPositionP5({ ...out, projecao_em_curso: undefined })).toThrow();
    expect(() => parseFinancialPositionP5({ ...out, socios: { ...out.socios, linhas: out.projecao_em_curso.socios_linhas } })).toThrow();
    expect(() => parseFinancialPositionP5({ ...out, eventos: out.eventos.map((e) => ({ ...e, fora_dos_totais: false })) })).toThrow();
  });
});
