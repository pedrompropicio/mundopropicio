// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { avaliarUnidades, cents, dataCivil } from "../../supabase/functions/_shared/ticketing/planning-forecast";
import { resolverPct, type ForecastZone, type PlanningForecastUnit, type TicketForecastEventInput } from "../../supabase/functions/_shared/ticketing/planning-forecast-contract";

const REF = "2026-11-06";
const zone = (iva_rate: number | null | undefined = 0): ForecastZone => ({ zone_id: "zone", total_capacity: null,
  lotes: [{ quantity: 10, price: 100, ...(iva_rate === undefined ? {} : { iva_rate }) }] });
const unit = (overrides: Partial<PlanningForecastUnit> = {}): PlanningForecastUnit => ({ unit_id: "unit", event_id: "event",
  sessao: null, data: "2026-11-07", zonas: [zone()], manual: null, vendido: { bruto: 100, liquido: 90 },
  pct: resolverPct(null, null), viragem_dias: null, indivisivel: false, ...overrides });
const evaluate = (overrides: Partial<PlanningForecastUnit> = {}, reference = REF) => avaliarUnidades([unit(overrides)], reference).unidades[0];

describe("#646 D2-d B — critérios 1/2: previsão local e percentagens", () => {
  it("corta cada zona proporcionalmente e calcula o IVA nos lotes cortados", () => {
    const zonas = [{ zone_id: "cut", total_capacity: 10,
      lotes: [{ quantity: 10, price: 106, iva_rate: 6 }, { quantity: 10, price: 123, iva_rate: 23 }] },
    { ...zone(), zone_id: "uncut", total_capacity: 0 }];
    expect(evaluate({ zonas, manual: { bruta: 99999, iva_rate: 0 } })).toMatchObject({
      fonte: "lotes", previsao: { bruto: 2145, liquido: 2000 }, considerada: { bruto: 2145, liquido: 2000 }, completo: true,
      cortes: [{ zone_id: "cut", fator: 0.5, bruto: 2290, limitado: 1145 }],
    });
  });
  it.each([null, 0])("preserva a capacidade ilimitada %s da fórmula antiga", capacity => {
    expect(evaluate({ zonas: [{ ...zone(), total_capacity: capacity }] }).previsao?.bruto).toBe(1000);
  });
  it("manual pertence só à unidade explicitamente fornecida e não se herda entre eventos/sessões", () => {
    const output = avaliarUnidades([unit({ unit_id: "parent", zonas: [], manual: { bruta: 500, iva_rate: 0 } }),
      unit({ unit_id: "child", event_id: "other", zonas: [] }),
      unit({ unit_id: "session", sessao: { date: "2026-11-07", start_time: null, sort_order: 0 }, zonas: [] })], REF);
    expect(output.considerada.bruto).toBe(700);
    expect(output.unidades.map(row => row.fonte)).toEqual(["manual", "sem_previsao", "sem_previsao"]);
    expect(output.unidades.slice(1).map(row => row.previsao)).toEqual([null, null]);
  });
  it("sem lotes elegíveis nem manual conta vendido e sem_previsao", () => {
    expect(evaluate({ zonas: [{ ...zone(), lotes: [{ quantity: 0, price: 20 }, { quantity: 5, price: -1 }] }] }))
      .toMatchObject({ motivo: "sem_previsao", fonte: "sem_previsao", previsao: null,
        considerada: { bruto: 100, liquido: 90 }, completo: true });
  });
  it("ausência comprovada e 100 explícito dão a mesma previsão, com origens distintas", () => {
    const absent = evaluate(), explicit = evaluate({ pct: { valor: 100, origem: "evento" } });
    expect(absent.considerada).toEqual(explicit.considerada);
    expect(absent).toMatchObject({ pct: 100, origem: "padrao" });
    expect(explicit).toMatchObject({ pct: 100, origem: "evento" });
  });
  it.each([0, 200])("0%% conserva só o vendido %s", bruto => {
    expect(evaluate({ pct: { valor: 0, origem: "evento" }, vendido: { bruto, liquido: bruto / 2 } }))
      .toMatchObject({ motivo: "percentagem_zero", considerada: { bruto, liquido: bruto / 2 }, completo: true });
  });
  it("erro de percentagem nunca é ausência e conserva vendido incompleto", () => {
    expect(evaluate({ pct: { erro: "rpc_failed" } })).toMatchObject({ pct: null, origem: null,
      motivo: "percentagem_erro", considerada: { bruto: 100, liquido: 90 }, completo: false, alertas: ["percentagem_erro"] });
  });
  it.each([NaN, Infinity, -1, 101])("percentagem inválida %s não entra na previsão", valor => {
    expect(evaluate({ pct: { valor, origem: "evento" } })).toMatchObject({ pct: null, completo: false, considerada: { bruto: 100 } });
  });
});

describe("#646 D2-d B — critério 3: data de cada unidade, Q2 e referência explícita", () => {
  it.each([
    ["2026-11-05", "data_passada", 100], ["2026-11-06", "hoje", 100], ["2026-11-07", "previsao", 1000],
  ])("%s => %s", (data, motivo, bruto) => {
    expect(evaluate({ data })).toMatchObject({ motivo, considerada: { bruto }, completo: true });
  });
  it.each([
    ["2026-11-06", 2, "previsao"], ["2026-11-07", 2, "viragem"], ["2026-11-08", 2, "viragem"],
    ["2026-11-08", null, "previsao"], ["2026-11-08", 0, "previsao"], ["2026-11-09", 0, "hoje"],
  ])("referência %s, N=%s => %s", (reference, viragem_dias, motivo) => {
    expect(evaluate({ data: "2026-11-09", viragem_dias }, reference).motivo).toBe(motivo);
  });
  it("turnê iniciada conserva as cidades futuras, incluindo outro ano", () => {
    const result = avaliarUnidades([unit({ unit_id: "past", data: "2026-11-01", viragem_dias: 2 }),
      unit({ unit_id: "future", data: "2026-11-10", viragem_dias: 2, pct: { valor: 50, origem: "evento" } }),
      unit({ unit_id: "next-year", data: "2027-01-01", viragem_dias: 2 })], REF);
    expect(result.unidades.map(row => [row.motivo, row.considerada.bruto])).toEqual([
      ["data_passada", 100], ["previsao", 500], ["previsao", 1000],
    ]);
    expect(result.considerada.bruto).toBe(1600);
  });
  it.each([null, "", "2026-02-29", "2026-13-01", "2026-11-31", "06/11/2026", "2026-11-07T00:00:00Z"])("data %s fica incompleta sem inferência", data => {
    expect(evaluate({ data })).toMatchObject({ data, motivo: "data_invalida", completo: false, considerada: { bruto: 100, liquido: 90 } });
  });
  it("uma data ausente fica incompleta mesmo com 0% e sem previsão", () => {
    expect(evaluate({ data: null, zonas: [], pct: { valor: 0, origem: "evento" } }).completo).toBe(false);
  });
  it("rejeita referência inválida e aceita ano bissexto válido", () => {
    expect(() => evaluate({}, "2026-02-29")).toThrow("planning_invalid_reference_date");
    expect(evaluate({ data: "2028-02-29" }, "2028-02-28").motivo).toBe("previsao");
  });
  it.each([
    ["2026-07-01T23:30:00Z", "2026-07-02"], ["2026-11-06T23:30:00Z", "2026-11-06"],
    ["2026-03-29T23:30:00Z", "2026-03-30"], ["2026-10-25T00:30:00Z", "2026-10-25"],
  ])("dataCivil em Lisboa usa Intl para %s", (instant, date) => {
    expect(dataCivil(new Date(instant), "Europe/Lisbon")).toBe(date);
  });
  it("dataCivil exige instante e fuso válidos", () => {
    expect(() => dataCivil(new Date(NaN), "Europe/Lisbon")).toThrow("planning_invalid_instant");
    expect(() => dataCivil(new Date(REF), "invalid/timezone")).toThrow();
    expect(() => dataCivil(new Date(REF), "")).toThrow("planning_invalid_timezone");
    expect(() => dataCivil(new Date(REF), undefined as unknown as string)).toThrow("planning_invalid_timezone");
    expect(dataCivil(new Date("2026-07-01T23:30:00Z"), "UTC")).toBe("2026-07-01");
  });
});

describe("#646 D2-d B — critérios 4/5: IVA, mesma alternativa e Q3", () => {
  it("IVA misto 6/23 não divide o bruto por uma taxa única e aplica % ao par", () => {
    expect(evaluate({ zonas: [{ ...zone(), lotes: [{ quantity: 2, price: 106, iva_rate: 6 },
      { quantity: 3, price: 123, iva_rate: 23 }] }], pct: { valor: 50, origem: "sessao" } }))
      .toMatchObject({ previsao: { bruto: 581, liquido: 500 }, considerada: { bruto: 290.5, liquido: 250 }, completo: true });
  });
  it("BR sem IVA exige 0 explícito", () => {
    expect(evaluate({ zonas: [zone(0)] })).toMatchObject({ previsao: { bruto: 1000, liquido: 1000 }, completo: true });
  });
  it.each([undefined, null])("lote sem IVA %s deixa só o líquido previsto incompleto", iva => {
    const zonas: ForecastZone[] = [{ ...zone(), lotes: [{ quantity: 10, price: 100, ...(iva === undefined ? {} : { iva_rate: iva }) }] }];
    expect(evaluate({ zonas })).toMatchObject({ previsao: { bruto: 1000, liquido: null },
      considerada: { bruto: 1000, liquido: null }, completo: false, alertas: ["iva_previsao_em_falta"] });
    expect(evaluate({ zonas, vendido: { bruto: 2000, liquido: 1500 } })).toMatchObject({
      motivo: "vendido", considerada: { bruto: 2000, liquido: 1500 }, completo: true, alertas: [] });
  });
  it.each([0, 1000])("0%% ou empate bruto escolhe o par vendido e não exige IVA previsto (vendido %s)", bruto => {
    expect(evaluate({ zonas: [zone(null)], pct: { valor: bruto === 0 ? 0 : 100, origem: "evento" }, vendido: { bruto, liquido: 7 } }))
      .toMatchObject({ considerada: { bruto, liquido: 7 }, completo: true });
  });
  it("se a previsão ganha em bruto usa o seu líquido, mesmo menor", () => {
    expect(evaluate({ zonas: [zone(23)], vendido: { bruto: 999, liquido: 999 } }))
      .toMatchObject({ considerada: { bruto: 1000, liquido: 813.01 }, motivo: "previsao" });
  });
  it("se o vendido ganha em bruto usa o seu líquido, mesmo menor", () => {
    expect(evaluate({ vendido: { bruto: 1100, liquido: 10 } }))
      .toMatchObject({ considerada: { bruto: 1100, liquido: 10 }, motivo: "vendido" });
  });
  it.each([[6, 100], [23, 86.18], [0, 106], [null, null]])("manual 106 com IVA %s => líquido %s", (iva_rate, liquido) => {
    const result = evaluate({ zonas: [], manual: { bruta: 106, iva_rate }, vendido: { bruto: 0, liquido: 0 } });
    expect(result).toMatchObject({ fonte: "manual", previsao: { bruto: 106, liquido },
      considerada: { bruto: 106, liquido }, completo: iva_rate !== null });
  });
  it("manual zero é explícito e não se torna ausência", () => {
    expect(evaluate({ zonas: [], manual: { bruta: 0, iva_rate: 0 } })).toMatchObject({ fonte: "manual", previsao: { bruto: 0, liquido: 0 } });
  });
  it("Q3 não reparte unidade indivisível nem usa o máximo previsto", () => {
    const result = avaliarUnidades([unit({ indivisivel: true }), unit({ unit_id: "other", zonas: [] })], REF);
    expect(result).toMatchObject({ completo: false, considerada: { bruto: 200, liquido: 180 } });
    expect(result.unidades[0]).toMatchObject({ motivo: "indivisivel", completo: false, alertas: ["indivisivel"],
      considerada: { bruto: 100, liquido: 90 } });
  });
});

describe("#646 D2-d B — critério 6: agregação sem arredondamentos intermédios", () => {
  const fractional = (unit_id: string, bruta: number) => unit({ unit_id, zonas: [], manual: { bruta, iva_rate: 0 }, vendido: { bruto: 0, liquido: 0 } });
  it("resíduo positivo vai para a maior parcela e reconcilia bruto e líquido", () => {
    const result = avaliarUnidades([fractional("small", 0.104), fractional("large", 0.204)], REF);
    expect(result.considerada).toEqual({ bruto: 0.31, liquido: 0.31 });
    expect(result.unidades.map(row => row.considerada)).toEqual([{ bruto: 0.1, liquido: 0.1 }, { bruto: 0.21, liquido: 0.21 }]);
  });
  it("resíduo negativo desempata pelo menor unit_id, independentemente da ordem", () => {
    for (const units of [[fractional("b", 0.106), fractional("a", 0.106)], [fractional("a", 0.106), fractional("b", 0.106)]]) {
      const result = avaliarUnidades(units, REF);
      expect(result.considerada.bruto).toBe(0.21);
      expect(result.unidades.find(row => row.unit_id === "a")?.considerada.bruto).toBe(0.1);
      expect(result.unidades.find(row => row.unit_id === "b")?.considerada.bruto).toBe(0.11);
    }
  });
  it("valores absolutos guiam o resíduo também com vendas assinadas", () => {
    const result = avaliarUnidades([unit({ unit_id: "negative", zonas: [], vendido: { bruto: -0.204, liquido: -0.204 } }),
      unit({ unit_id: "positive", zonas: [], vendido: { bruto: 0.106, liquido: 0.106 } })], REF);
    expect(result.considerada.bruto).toBe(-0.1);
    expect(result.unidades.map(row => row.considerada.bruto)).toEqual([-0.21, 0.11]);
  });
  it("reconcilia todas as colunas monetárias, conservando líquido desconhecido como null", () => {
    const result = avaliarUnidades(Array.from({ length: 17 }, (_, index) => unit({ unit_id: String(index),
      zonas: [{ ...zone(), lotes: [{ quantity: 3, price: 0.123, iva_rate: 23 }] }],
      pct: { valor: 73, origem: "evento" }, vendido: { bruto: 0.101, liquido: 0.081 } })), REF);
    for (const field of ["vendido", "previsao", "considerada"] as const) for (const part of ["bruto", "liquido"] as const) {
      expect(cents(result.unidades.reduce((sum, row) => sum + row[field]![part]!, 0))).toBe(result[field]![part]);
    }
    expect(result.considerada.bruto).toBe(cents(17 * 3 * 0.123 * 0.73));
    expect(result.considerada.liquido).toBe(cents(17 * (0.123 / 1.23) * 3 * 0.73));
    expect(avaliarUnidades([unit(), unit({ unit_id: "unknown", zonas: [zone(null)] })], REF)).toMatchObject({
      considerada: { bruto: 2000, liquido: null }, completo: false });
  });
  it("IDs repetidos dão erro em vez de somar duas vezes", () => {
    expect(() => avaliarUnidades([unit(), unit()], REF)).toThrow("planning_duplicate_unit");
  });
  it("entrada vazia dá zero completo, sem previsão, e não altera a entrada", () => {
    expect(avaliarUnidades([], REF)).toEqual({ unidades: [], vendido: { bruto: 0, liquido: 0 },
      previsao: null, considerada: { bruto: 0, liquido: 0 }, completo: true });
    const original = unit();
    const before = JSON.stringify(original);
    avaliarUnidades([original], REF);
    expect(JSON.stringify(original)).toBe(before);
  });
});

describe("#646 D2-d B — critério 7: Q1 por chave lógica exacta", () => {
  const event: TicketForecastEventInput = { event_id: "event", percentagem: 60, origem: "evento", receita_manual_iva_rate: null,
    sessions: [{ session_id: "physical-v2", session_date: "2026-11-07", session_start_time: null,
      session_sort_order: 2, percentagem: 25, origem: "sessao" }] };
  const key = { date: "2026-11-07", start_time: null, sort_order: 2 };
  it("hora null corresponde só a null, ignorando UUID físico", () => {
    expect(resolverPct(event, key)).toEqual({ valor: 25, origem: "sessao" });
    expect(resolverPct({ ...event, sessions: [{ ...event.sessions[0], session_id: "new-uuid" }] }, key))
      .toEqual({ valor: 25, origem: "sessao" });
  });
  it.each([{ ...key, start_time: "00:00:00" }, { ...key, sort_order: 3 }, { ...key, date: "2026-11-08" }, null])("chave nova %j herda apenas do evento", sessao => {
    expect(resolverPct(event, sessao)).toEqual({ valor: 60, origem: "evento" });
  });
  it("evento sem linha recebe padrão 100, incluindo sessão nova", () => {
    expect(resolverPct(undefined, null)).toEqual({ valor: 100, origem: "padrao" });
    expect(resolverPct(null, key)).toEqual({ valor: 100, origem: "padrao" });
  });
  it("chave ambígua não escolhe a primeira sessão", () => {
    expect(() => resolverPct({ ...event, sessions: [...event.sessions, { ...event.sessions[0], session_id: "other" }] }, key))
      .toThrow("ticket_forecast_session_ambiguous");
  });
});

it("#646 critério 9: SHA-256 conserva exactamente o bloco de exportações antigas medido no checkout", () => {
  // Dispatch: these exports are unchanged since main a839fbdd1. That historical object
  // is absent from the supplied shallow clone; the fixed digest pins its received text.
  const source = readFileSync("supabase/functions/_shared/ticketing/planning-forecast.ts");
  const original = source.subarray(source.length - 4937);
  expect(createHash("sha256").update(original).digest("hex"))
    .toBe("74dddba4bf3db797b1b48637eedf069bbf6de12ed7996e5341306a25d080dceb");
});
