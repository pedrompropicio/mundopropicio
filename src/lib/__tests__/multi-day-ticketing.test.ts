/**
 * Bateria de testes — Bilheteira multi-dia (Simples + Combo + cortesias)
 * + per capita A&B + cenários + casos limite + E2E.
 *
 * Cobre os 25 cenários definidos no ciclo "Bilheteira festival multi-dia":
 *  - Cálculo público por dia (Simples vs Combo, cortesias por cenário)
 *  - Receita de bilheteira (combo NÃO multiplica por dia)
 *  - Per capita A&B (denominador = público por dia + cortesias)
 *  - Configuração por zona (tipos permitidos)
 *  - 3 cenários (Real / BE / Forecast)
 *  - Casos limite (1 dia, zeros, valores grandes)
 *  - Consolidado de turnê (sem dupla contagem entre cidades)
 *
 * Os testes 16–19 (importador CSV/XLSX e regras de UI) ficam como `it.todo`
 * porque o importador genérico ainda não foi entregue.
 */
import { describe, it, expect } from "vitest";
import {
  computeEventAttendance,
  assertLotKindAllowed,
  type AttendanceInput,
  type AttendanceLot,
  type AttendanceZone,
  type AttendanceMovement,
} from "@/lib/event-attendance-calc";
import { computeTotals, type ABZoneInput, type ABFoodConfig } from "@/lib/event-ab-calc";

// ─────────────────────────────────────────────────────────────────────────
// Setup — Evento 2 dias × 3 zonas
// ─────────────────────────────────────────────────────────────────────────
const PISTA_D1 = "z-pista-d1";
const PISTA_D2 = "z-pista-d2";
const VIP = "z-vip";
const BACKSTAGE_D1 = "z-bs-d1";

/** Helper: monta zonas/lotes para o evento de 2 dias da especificação. */
function makeFestivalSetup(): {
  zones: AttendanceZone[];
  lots: Record<string, AttendanceLot>;
} {
  const zones: AttendanceZone[] = [
    { id: PISTA_D1, name: "Pista (Dia 1)", day_index: 0 },
    { id: PISTA_D2, name: "Pista (Dia 2)", day_index: 1 },
    { id: VIP, name: "VIP", day_index: null }, // só Combo, sem dia específico
    { id: BACKSTAGE_D1, name: "Backstage", day_index: 0 },
  ];
  const lots: Record<string, AttendanceLot> = {
    pista_simple_d1: { id: "lot-pista-s1", zone_id: PISTA_D1, kind: "simple", price: 25 },
    pista_simple_d2: { id: "lot-pista-s2", zone_id: PISTA_D2, kind: "simple", price: 25 },
    pista_combo: { id: "lot-pista-combo", zone_id: PISTA_D1, kind: "combo", price: 45 },
    vip_combo: { id: "lot-vip-combo", zone_id: VIP, kind: "combo", price: 90 },
    backstage_simple_d1: { id: "lot-bs-s1", zone_id: BACKSTAGE_D1, kind: "simple", price: 0 },
  };
  return { zones, lots };
}

const baseInput = (
  movements: AttendanceMovement[],
  courtesies: AttendanceInput["courtesies"] = [],
  numDays = 2,
): AttendanceInput => {
  const { zones, lots } = makeFestivalSetup();
  return {
    numDays,
    zones,
    lots: Object.values(lots),
    movements,
    courtesies,
  };
};

// ─────────────────────────────────────────────────────────────────────────
// 1–5 · Público por dia
// ─────────────────────────────────────────────────────────────────────────
describe("Bilheteira multi-dia · Público por dia", () => {
  it("Teste 1 — Apenas Simples (Pista D1=500, D2=400, BS D1=50, cortesias 30/20)", () => {
    const r = computeEventAttendance(
      baseInput(
        [
          { zone_id: PISTA_D1, lot_id: "lot-pista-s1", qty: 500 },
          { zone_id: PISTA_D2, lot_id: "lot-pista-s2", qty: 400 },
          { zone_id: BACKSTAGE_D1, lot_id: "lot-bs-s1", qty: 50 },
        ],
        [
          { day_index: 0, zone_id: PISTA_D1, qty: 30 },
          { day_index: 1, zone_id: PISTA_D2, qty: 20 },
        ],
      ),
    );
    expect(r.totalsByDay[0]).toBe(580);
    expect(r.totalsByDay[1]).toBe(420);
  });

  it("Teste 2 — Apenas Combos (Pista 300, VIP 100, cortesias 20/20) — combo conta nos 2 dias sem duplicar receita", () => {
    const r = computeEventAttendance(
      baseInput(
        [
          { zone_id: PISTA_D1, lot_id: "lot-pista-combo", qty: 300 },
          { zone_id: VIP, lot_id: "lot-vip-combo", qty: 100 },
        ],
        [
          { day_index: 0, zone_id: PISTA_D1, qty: 20 },
          { day_index: 1, zone_id: PISTA_D2, qty: 20 },
        ],
      ),
    );
    expect(r.totalsByDay[0]).toBe(420);
    expect(r.totalsByDay[1]).toBe(420);
    // receita: 300×45 + 100×90 = 13500 + 9000 = 22500 (uma única vez)
    expect(r.ticketRevenue).toBe(22500);
    expect(r.ticketsSold).toBe(400);
  });

  it("Teste 3 — Mix Simples+Combo (públicos 1850/1530 e total 3380)", () => {
    const r = computeEventAttendance(
      baseInput(
        [
          { zone_id: PISTA_D1, lot_id: "lot-pista-s1", qty: 1000 },
          { zone_id: PISTA_D2, lot_id: "lot-pista-s2", qty: 800 },
          { zone_id: PISTA_D1, lot_id: "lot-pista-combo", qty: 500 },
          { zone_id: VIP, lot_id: "lot-vip-combo", qty: 200 },
          { zone_id: BACKSTAGE_D1, lot_id: "lot-bs-s1", qty: 100 },
        ],
        [
          { day_index: 0, zone_id: PISTA_D1, qty: 50 },
          { day_index: 1, zone_id: PISTA_D2, qty: 30 },
        ],
      ),
    );
    expect(r.totalsByDay[0]).toBe(1850);
    expect(r.totalsByDay[1]).toBe(1530);
    expect(r.grandTotalDayPeople).toBe(3380);
  });

  it("Teste 4 — Sem cortesias (Pista S D1=200 + Combo 100 → 300/100, sem erros)", () => {
    const r = computeEventAttendance(
      baseInput([
        { zone_id: PISTA_D1, lot_id: "lot-pista-s1", qty: 200 },
        { zone_id: PISTA_D1, lot_id: "lot-pista-combo", qty: 100 },
      ]),
    );
    expect(r.totalsByDay[0]).toBe(300);
    expect(r.totalsByDay[1]).toBe(100);
  });

  it("Teste 5 — Zona com zero não corrompe outras", () => {
    const r = computeEventAttendance(
      baseInput([
        { zone_id: VIP, lot_id: "lot-vip-combo", qty: 0 },
        { zone_id: PISTA_D1, lot_id: "lot-pista-s1", qty: 500 },
        { zone_id: PISTA_D2, lot_id: "lot-pista-s2", qty: 400 },
      ]),
    );
    expect(r.totalsByDay[0]).toBe(500);
    expect(r.totalsByDay[1]).toBe(400);
    expect(r.totalsByZone[VIP]).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6–7 · Receita de bilheteira
// ─────────────────────────────────────────────────────────────────────────
describe("Bilheteira multi-dia · Receita", () => {
  it("Teste 6 — Combo NÃO duplica receita (Pista Combo 300×€50 + Simples D1 200×€25 = €20.000)", () => {
    const { zones } = makeFestivalSetup();
    const lots: AttendanceLot[] = [
      { id: "L-c", zone_id: PISTA_D1, kind: "combo", price: 50 },
      { id: "L-s", zone_id: PISTA_D1, kind: "simple", price: 25 },
    ];
    const r = computeEventAttendance({
      numDays: 2,
      zones,
      lots,
      movements: [
        { zone_id: PISTA_D1, lot_id: "L-c", qty: 300 },
        { zone_id: PISTA_D1, lot_id: "L-s", qty: 200 },
      ],
    });
    expect(r.ticketRevenue).toBe(20_000);
    // mas a Pista soma público nos 2 dias por causa do combo (300 + 200 D1 + 300 D2 = 800)
    expect(r.totalsByZone[PISTA_D1]).toBe(800);
  });

  it("Teste 7 — Cortesias não geram receita", () => {
    const r = computeEventAttendance(
      baseInput(
        [],
        [
          { day_index: 0, zone_id: PISTA_D1, qty: 100 },
          { day_index: 1, zone_id: PISTA_D2, qty: 80 },
        ],
      ),
    );
    expect(r.ticketRevenue).toBe(0);
    expect(r.totalsByDay[0]).toBe(100);
    expect(r.totalsByDay[1]).toBe(80);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 8–10 · Per capita A&B usa público por dia (incl. cortesias)
// ─────────────────────────────────────────────────────────────────────────
describe("A&B · per capita usa público por dia (não bilhetes vendidos)", () => {
  it("Teste 8 — Combo+cortesias: faturação A&B = (650+630)×15 = €19.200", () => {
    const att = computeEventAttendance(
      baseInput(
        [
          { zone_id: PISTA_D1, lot_id: "lot-pista-combo", qty: 500 },
          { zone_id: VIP, lot_id: "lot-vip-combo", qty: 100 },
        ],
        [
          { day_index: 0, zone_id: PISTA_D1, qty: 50 },
          { day_index: 1, zone_id: PISTA_D2, qty: 30 },
        ],
      ),
    );
    expect(att.totalsByDay[0]).toBe(650);
    expect(att.totalsByDay[1]).toBe(630);

    // Total participantes A&B = soma de todas as zonas em todos os dias
    const totalParticipantes = att.totalsByDay[0] + att.totalsByDay[1];
    const faturacaoAB = totalParticipantes * 15;
    expect(faturacaoAB).toBe(19_200);
  });

  it("Teste 9 — 500 combos num evento 2 dias × €15/pp = €15.000 (não €7.500)", () => {
    const att = computeEventAttendance(
      baseInput([{ zone_id: PISTA_D1, lot_id: "lot-pista-combo", qty: 500 }]),
    );
    const totalParticipantes = att.totalsByDay[0] + att.totalsByDay[1];
    expect(totalParticipantes).toBe(1000); // 500 × 2 dias
    expect(totalParticipantes * 15).toBe(15_000);
  });

  it("Teste 10 — Per capita por zona com open bar (VIP excluído de bebidas, repasse 35%)", () => {
    // Constrói os inputs A&B usando público acumulado por zona vindo do helper.
    const att = computeEventAttendance(
      baseInput(
        [
          { zone_id: PISTA_D1, lot_id: "lot-pista-combo", qty: 1000 },
          { zone_id: VIP, lot_id: "lot-vip-combo", qty: 200 },
        ],
        [
          { day_index: 0, zone_id: PISTA_D1, qty: 50 },
          { day_index: 1, zone_id: PISTA_D2, qty: 40 },
        ],
      ),
    );
    // Pista zone day 0 = 1050, day 1 = 1040 → total acumulado Pista = 2090
    // VIP = 200 × 2 = 400 (excluído por open_bar)
    // Pista é modelada em 2 zonas físicas (D1 e D2) para suportar Simples por dia.
    // Pista total acumulada = combos (entram em PISTA_D1 nos 2 dias) + simples + cortesias D1/D2.
    // = (1000+1000) na PISTA_D1 + 50 cortesias + 40 cortesias na PISTA_D2 = 2090
    const pistaZoneTotal =
      (att.totalsByZone[PISTA_D1] ?? 0) + (att.totalsByZone[PISTA_D2] ?? 0);
    const vipZoneTotal = att.totalsByZone[VIP];
    expect(pistaZoneTotal).toBe(2090);
    expect(vipZoneTotal).toBe(400);

    const totals = computeTotals(
      [
        {
          id: "ab-pista", zone_label: "Pista", participants: pistaZoneTotal,
          open_bar: false, open_food: false,
          per_capita_bebidas: 12, repasse_bebidas_pct: 35,
        },
        {
          id: "ab-vip", zone_label: "VIP", participants: vipZoneTotal,
          open_bar: true, open_food: false, // open bar → exclui de bebidas
          per_capita_bebidas: 0, repasse_bebidas_pct: 0,
        },
      ],
      { fee_alimentos: 0, repasse_alimentos_pct: 0, per_capita_alimentos: 0 },
    );
    // Faturação bebidas = 2090 × 12 = 25.080
    expect(totals.faturacaoBebidas).toBe(25_080);
    // Receita bebidas = 25.080 × 35% = 8.778
    expect(totals.receitaBebidas).toBeCloseTo(8_778, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 11–13 · Configuração por zona (tipos permitidos)
// ─────────────────────────────────────────────────────────────────────────
describe("Configuração por zona · tipos permitidos", () => {
  it("Teste 11 — Backstage só Simples → erro ao tentar Combo", () => {
    expect(() => assertLotKindAllowed("Backstage", ["simple"], "combo")).toThrow(
      /Backstage.*não permite.*combo/,
    );
    // Simples passa
    expect(() => assertLotKindAllowed("Backstage", ["simple"], "simple")).not.toThrow();
  });

  it("Teste 12 — VIP só Combo → 150 entram em ambos os dias", () => {
    expect(() => assertLotKindAllowed("VIP", ["combo"], "simple")).toThrow();
    const r = computeEventAttendance(
      baseInput([{ zone_id: VIP, lot_id: "lot-vip-combo", qty: 150 }]),
    );
    expect(r.cells.find((c) => c.day_index === 0 && c.zone_id === VIP)?.paying).toBe(150);
    expect(r.cells.find((c) => c.day_index === 1 && c.zone_id === VIP)?.paying).toBe(150);
  });

  it("Teste 13 — Desactivar combo remove imediatamente do cálculo", () => {
    const lotsAtivos: AttendanceLot[] = [
      { id: "L1", zone_id: PISTA_D1, kind: "combo", price: 0 },
    ];
    const lotsDesativados: AttendanceLot[] = []; // combo desactivado
    const movements: AttendanceMovement[] = [
      { zone_id: PISTA_D1, lot_id: "L1", qty: 100 },
    ];
    const { zones } = makeFestivalSetup();
    const ativo = computeEventAttendance({ numDays: 2, zones, lots: lotsAtivos, movements });
    const desativ = computeEventAttendance({ numDays: 2, zones, lots: lotsDesativados, movements });
    // sem o lote como 'combo' o movimento cai a 'simple' (default) → conta só no dia da zona
    expect(ativo.totalsByDay[0]).toBe(100);
    expect(ativo.totalsByDay[1]).toBe(100);
    expect(desativ.totalsByDay[0]).toBe(100);
    expect(desativ.totalsByDay[1]).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 14–15 · Cenários (Real / BE / Forecast)
// ─────────────────────────────────────────────────────────────────────────
describe("3 cenários — cortesias e combos isolados por cenário", () => {
  const movsBase: AttendanceMovement[] = [
    { zone_id: PISTA_D1, lot_id: "lot-pista-combo", qty: 0 }, // varia por cenário
  ];
  const setup = (comboQty: number, cortesiaD1: number) =>
    computeEventAttendance(
      baseInput(
        [{ zone_id: PISTA_D1, lot_id: "lot-pista-combo", qty: comboQty }],
        [{ day_index: 0, zone_id: PISTA_D1, qty: cortesiaD1 }],
      ),
    );

  it("Teste 14 — Cortesias diferentes por cenário não se contaminam", () => {
    const real = setup(100, 50);
    const be = setup(100, 30);
    const fc = setup(100, 80);
    expect(real.totalsByDay[0]).toBe(150);
    expect(be.totalsByDay[0]).toBe(130);
    expect(fc.totalsByDay[0]).toBe(180);
  });

  it("Teste 15 — Combos diferentes em cada cenário propagam aos 2 dias", () => {
    const real = setup(500, 0);
    const be = setup(400, 0);
    const fc = setup(700, 0);
    expect(real.totalsByDay[0]).toBe(500);
    expect(real.totalsByDay[1]).toBe(500);
    expect(be.totalsByDay[1]).toBe(400);
    expect(fc.totalsByDay[1]).toBe(700);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 16–18 · Importação CSV/XLSX (TODO — importador não entregue)
// ─────────────────────────────────────────────────────────────────────────
describe("Importação CSV/XLSX (Simples vs Combo)", () => {
  it.todo("Teste 16 — CSV com Simples + Combo abre ecrã de mapeamento");
  it.todo("Teste 17 — Tipos ambíguos forçam classificação manual");
  it.todo("Teste 18 — Substituir vs Acumular");
});

// ─────────────────────────────────────────────────────────────────────────
// 19 · UI — público/dia em destaque (smoke / TODO RTL)
// ─────────────────────────────────────────────────────────────────────────
describe("UI · público por dia em destaque", () => {
  it.todo("Teste 19 — Cards do Simulador, A&B e Dashboard mostram público/dia em destaque");
});

// ─────────────────────────────────────────────────────────────────────────
// 20 · Consolidado de turnê
// ─────────────────────────────────────────────────────────────────────────
describe("Turnê · consolidado de público por dia", () => {
  it("Teste 20 — Lisboa+Porto somam público/dia sem duplicar combos entre cidades", () => {
    const lisboa = computeEventAttendance(
      baseInput(
        [
          { zone_id: PISTA_D1, lot_id: "lot-pista-combo", qty: 500 },
          { zone_id: PISTA_D1, lot_id: "lot-pista-s1", qty: 300 },
          { zone_id: PISTA_D2, lot_id: "lot-pista-s2", qty: 200 },
        ],
        [
          { day_index: 0, zone_id: PISTA_D1, qty: 30 },
          { day_index: 1, zone_id: PISTA_D2, qty: 20 },
        ],
      ),
    );
    const porto = computeEventAttendance(
      baseInput(
        [
          { zone_id: PISTA_D1, lot_id: "lot-pista-combo", qty: 400 },
          { zone_id: PISTA_D1, lot_id: "lot-pista-s1", qty: 250 },
          { zone_id: PISTA_D2, lot_id: "lot-pista-s2", qty: 150 },
        ],
        [
          { day_index: 0, zone_id: PISTA_D1, qty: 20 },
          { day_index: 1, zone_id: PISTA_D2, qty: 15 },
        ],
      ),
    );
    expect(lisboa.totalsByDay[0]).toBe(830);
    expect(lisboa.totalsByDay[1]).toBe(720);
    expect(porto.totalsByDay[0]).toBe(670);
    expect(porto.totalsByDay[1]).toBe(565);

    const totalTour =
      lisboa.totalsByDay[0] + lisboa.totalsByDay[1] +
      porto.totalsByDay[0] + porto.totalsByDay[1];
    expect(totalTour).toBe(2_785);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 21–24 · Casos limite
// ─────────────────────────────────────────────────────────────────────────
describe("Casos limite", () => {
  it("Teste 21 — Evento de 1 dia: Combo comporta-se como Simples", () => {
    const r = computeEventAttendance(baseInput(
      [{ zone_id: PISTA_D1, lot_id: "lot-pista-combo", qty: 100 }],
      [],
      1,
    ));
    expect(r.totalsByDay[0]).toBe(100);
    expect(r.totalsByDay[1]).toBeUndefined();
    expect(r.grandTotalDayPeople).toBe(100);
  });

  it("Teste 22 — Zero bilhetes em todas as zonas → tudo zero, sem div/0", () => {
    const r = computeEventAttendance(baseInput([]));
    expect(r.totalsByDay[0]).toBe(0);
    expect(r.totalsByDay[1]).toBe(0);
    expect(r.ticketRevenue).toBe(0);
    // per capita c/ 0 participantes
    const totals = computeTotals(
      [
        {
          id: "z", zone_label: "Pista", participants: 0,
          open_bar: false, open_food: false,
          per_capita_bebidas: 12, repasse_bebidas_pct: 35,
        },
      ],
      { fee_alimentos: 0, repasse_alimentos_pct: 0, per_capita_alimentos: 6 },
    );
    expect(totals.faturacaoBebidas).toBe(0);
    expect(totals.receitaBebidas).toBe(0);
    expect(totals.margemPct).toBe(0);
  });

  it("Teste 23 — Apenas cortesias: público = cortesias, receita bilheteira = 0", () => {
    const att = computeEventAttendance(baseInput(
      [],
      [{ day_index: 0, zone_id: PISTA_D1, qty: 100 }],
    ));
    expect(att.totalsByDay[0]).toBe(100);
    expect(att.ticketRevenue).toBe(0);
    const totals = computeTotals(
      [{
        id: "z", zone_label: "Pista", participants: 100,
        open_bar: false, open_food: false,
        per_capita_bebidas: 12, repasse_bebidas_pct: 35,
      }],
      { fee_alimentos: 0, repasse_alimentos_pct: 0, per_capita_alimentos: 0 },
    );
    expect(totals.faturacaoBebidas).toBe(1200); // 100 × 12
  });

  it("Teste 24 — Valores grandes mantêm precisão", () => {
    const r = computeEventAttendance(baseInput(
      [
        { zone_id: PISTA_D1, lot_id: "lot-pista-combo", qty: 50_000 },
        { zone_id: PISTA_D1, lot_id: "lot-pista-s1", qty: 30_000 },
        { zone_id: PISTA_D2, lot_id: "lot-pista-s2", qty: 25_000 },
      ],
      [
        { day_index: 0, zone_id: PISTA_D1, qty: 500 },
        { day_index: 1, zone_id: PISTA_D2, qty: 500 },
      ],
    ));
    // Dia 1 = 50k (combo) + 30k (S D1) + 500 cortesias = 80.500
    // Dia 2 = 50k (combo) + 25k (S D2) + 500 cortesias = 75.500
    expect(r.totalsByDay[0]).toBe(80_500);
    expect(r.totalsByDay[1]).toBe(75_500);
    expect(r.grandTotalDayPeople).toBe(156_000);
    // receita: 50k × 45 + 30k × 25 + 25k × 25 = 2.250.000 + 750.000 + 625.000 = 3.625.000
    expect(r.ticketRevenue).toBe(3_625_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 25 · End-to-end: público + receita + A&B em cascata
// ─────────────────────────────────────────────────────────────────────────
describe("E2E — fluxo completo (público + receita + A&B)", () => {
  it("Teste 25 — 2 dias, Pista S D1=1000 / S D2=800 / Combo=600 / VIP Combo=150 (open bar) + cortesias 60/40", () => {
    // Setup com preços do enunciado
    const zones: AttendanceZone[] = [
      { id: PISTA_D1, name: "Pista (D1)", day_index: 0 },
      { id: PISTA_D2, name: "Pista (D2)", day_index: 1 },
      { id: VIP, name: "VIP", day_index: null },
    ];
    const lots: AttendanceLot[] = [
      { id: "L-s1", zone_id: PISTA_D1, kind: "simple", price: 25 },
      { id: "L-s2", zone_id: PISTA_D2, kind: "simple", price: 25 },
      { id: "L-c", zone_id: PISTA_D1, kind: "combo", price: 45 },
      { id: "L-vip", zone_id: VIP, kind: "combo", price: 90 },
    ];
    const att = computeEventAttendance({
      numDays: 2,
      zones,
      lots,
      movements: [
        { zone_id: PISTA_D1, lot_id: "L-s1", qty: 1000 },
        { zone_id: PISTA_D2, lot_id: "L-s2", qty: 800 },
        { zone_id: PISTA_D1, lot_id: "L-c", qty: 600 },
        { zone_id: VIP, lot_id: "L-vip", qty: 150 },
      ],
      courtesies: [
        { day_index: 0, zone_id: PISTA_D1, qty: 60 },
        { day_index: 1, zone_id: PISTA_D2, qty: 40 },
      ],
    });

    // ── Público
    expect(att.totalsByDay[0]).toBe(1810);
    expect(att.totalsByDay[1]).toBe(1590);

    // ── Receita bilheteira: 1000×25 + 800×25 + 600×45 + 150×90 = 85.500
    expect(att.ticketRevenue).toBe(85_500);

    // ── A&B Bebidas: VIP open_bar=true → excluído
    // Pista é 2 zonas físicas (D1 e D2). Total Pista acumulado:
    //   PISTA_D1 cells: D1 = 1000 (S) + 600 (combo) + 60 (cortesia) = 1660; D2 = 600 (combo) = 600
    //   PISTA_D2 cells: D1 = 0; D2 = 800 (S) + 40 (cortesia) = 840
    //   Σ Pista = 1660 + 600 + 840 = 3100
    const pistaTotal =
      (att.totalsByZone[PISTA_D1] ?? 0) + (att.totalsByZone[PISTA_D2] ?? 0);
    expect(pistaTotal).toBe(3100);

    const totals = computeTotals(
      [
        {
          id: "ab-pista", zone_label: "Pista", participants: pistaTotal,
          open_bar: false, open_food: false,
          per_capita_bebidas: 12, repasse_bebidas_pct: 35,
        },
        {
          id: "ab-vip", zone_label: "VIP",
          // VIP combo = 150 × 2 dias = 300 (entra em alimentos pois open_food=false)
          participants: att.totalsByZone[VIP],
          open_bar: true, open_food: false,
          per_capita_bebidas: 0, repasse_bebidas_pct: 0,
        },
      ],
      { fee_alimentos: 2000, repasse_alimentos_pct: 30, per_capita_alimentos: 6 },
    );

    // Bebidas: 3100 × 12 = 37.200; receita 35% = 13.020
    expect(totals.faturacaoBebidas).toBe(37_200);
    expect(totals.receitaBebidas).toBeCloseTo(13_020, 2);

    // Alimentos: VIP open_food=false → entra. Total elegível = 3100 + 300 = 3400
    expect(totals.participantesElegiveisAlimentos).toBe(3_400);
    // Faturação alimentos = 3400 × 6 = 20.400
    expect(totals.faturacaoAlimentos).toBe(20_400);
    // Receita alimentos = 2000 + 20.400 × 30% = 2000 + 6120 = 8120
    expect(totals.receitaAlimentos).toBeCloseTo(8_120, 2);
  });
});
