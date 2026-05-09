/**
 * Suite de testes para os 5 padrões de bilheteria.
 * - Snapshot tests: cada padrão produz números esperados exactos.
 * - Property tests: invariantes que devem segurar para qualquer setup aleatório.
 *
 * Esta suite valida o comportamento ACTUAL (legacy: computeEventAttendance).
 * Quando a Fase 2.3 introduzir a camada de leitura unificada, os mesmos
 * fixtures serão usados para confirmar que o novo modelo produz IDÊNTICOS
 * resultados (ver tickets-v2-read-layer.test.ts).
 */
import { describe, it, expect } from "vitest";
import { computeEventAttendance } from "@/lib/event-attendance-calc";
import {
  ALL_FIXTURES,
  fixtureP1_FestivalCombo,
  fixtureP2_SessoesMultiplas,
  fixtureP3_FasesCronologicas,
  fixtureP4_Simples,
  fixtureP5_MasterSplit,
  generateRandomEvent,
} from "./tickets-v2-fixtures";

describe("Tickets V2 · Snapshots por padrão (5 padrões)", () => {
  it("P1 · Festival 2 dias com combo + variante Revolut", () => {
    const f = fixtureP1_FestivalCombo();
    const r = computeEventAttendance({
      numDays: f.numDays, zones: f.zones, lots: f.attendanceLots,
      movements: f.movements, courtesies: f.courtesies,
    });
    expect(r.totalsByDay[0]).toBe(f.expected.totalsByDay[0]);
    expect(r.totalsByDay[1]).toBe(f.expected.totalsByDay[1]);
    expect(r.grandTotalDayPeople).toBe(f.expected.grandTotalDayPeople);
    expect(r.ticketRevenue).toBe(f.expected.ticketRevenue);
    expect(r.ticketsSold).toBe(f.expected.ticketsSold);
  });

  it("P2 · Sessões múltiplas no mesmo dia", () => {
    const f = fixtureP2_SessoesMultiplas();
    const r = computeEventAttendance({
      numDays: f.numDays, zones: f.zones, lots: f.attendanceLots, movements: f.movements,
    });
    expect(r.totalsByDay[0]).toBe(f.expected.totalsByDay[0]);
    expect(r.grandTotalDayPeople).toBe(f.expected.grandTotalDayPeople);
    expect(r.ticketRevenue).toBe(f.expected.ticketRevenue);
    expect(r.ticketsSold).toBe(f.expected.ticketsSold);
  });

  it("P3 · Lotes em fases cronológicas, 1 zona, 1 dia", () => {
    const f = fixtureP3_FasesCronologicas();
    const r = computeEventAttendance({
      numDays: f.numDays, zones: f.zones, lots: f.attendanceLots, movements: f.movements,
    });
    expect(r.totalsByDay[0]).toBe(f.expected.totalsByDay[0]);
    expect(r.ticketRevenue).toBe(f.expected.ticketRevenue);
    expect(r.ticketsSold).toBe(f.expected.ticketsSold);
  });

  it("P4 · Evento simples 1 dia 1 zona", () => {
    const f = fixtureP4_Simples();
    const r = computeEventAttendance({
      numDays: f.numDays, zones: f.zones, lots: f.attendanceLots, movements: f.movements,
    });
    expect(r.totalsByDay[0]).toBe(f.expected.totalsByDay[0]);
    expect(r.ticketRevenue).toBe(f.expected.ticketRevenue);
    expect(r.ticketsSold).toBe(f.expected.ticketsSold);
  });

  it("P5 · Master/Split tour — cidade-split standalone", () => {
    const f = fixtureP5_MasterSplit();
    const r = computeEventAttendance({
      numDays: f.numDays, zones: f.zones, lots: f.attendanceLots, movements: f.movements,
    });
    expect(r.totalsByDay[0]).toBe(f.expected.totalsByDay[0]);
    expect(r.ticketRevenue).toBe(f.expected.ticketRevenue);
    expect(r.ticketsSold).toBe(f.expected.ticketsSold);
  });

  it("ALL_FIXTURES · todos os padrões consistentes", () => {
    for (const factory of ALL_FIXTURES) {
      const f = factory();
      const r = computeEventAttendance({
        numDays: f.numDays, zones: f.zones, lots: f.attendanceLots,
        movements: f.movements, courtesies: f.courtesies,
      });
      expect(r.ticketsSold, `${f.patternName} · ticketsSold`).toBe(f.expected.ticketsSold);
      expect(r.ticketRevenue, `${f.patternName} · ticketRevenue`).toBe(f.expected.ticketRevenue);
      expect(r.grandTotalDayPeople, `${f.patternName} · grandTotal`).toBe(f.expected.grandTotalDayPeople);
    }
  });
});

describe("Tickets V2 · Property tests (invariantes universais)", () => {
  const SEEDS = Array.from({ length: 100 }, (_, i) => 1000 + i * 37);

  it("INV1 · ticketsSold = soma de qty dos movimentos", () => {
    for (const seed of SEEDS) {
      const f = generateRandomEvent({ seed });
      const r = computeEventAttendance({
        numDays: f.numDays, zones: f.zones, lots: f.attendanceLots, movements: f.movements,
      });
      const expectedSum = f.movements.reduce((s, m) => s + (m.qty || 0), 0);
      expect(r.ticketsSold, `seed=${seed}`).toBe(expectedSum);
    }
  });

  it("INV2 · ticketRevenue = soma de qty × price (combo NÃO multiplica por dia)", () => {
    for (const seed of SEEDS) {
      const f = generateRandomEvent({ seed });
      const r = computeEventAttendance({
        numDays: f.numDays, zones: f.zones, lots: f.attendanceLots, movements: f.movements,
      });
      const lotById = new Map(f.attendanceLots.map((l) => [l.id, l]));
      const expectedRev = f.movements.reduce((s, m) => {
        const p = lotById.get(m.lot_id ?? "")?.price ?? 0;
        return s + m.qty * p;
      }, 0);
      expect(r.ticketRevenue, `seed=${seed}`).toBe(expectedRev);
    }
  });

  it("INV3 · grandTotalDayPeople = soma de totalsByDay", () => {
    for (const seed of SEEDS) {
      const f = generateRandomEvent({ seed });
      const r = computeEventAttendance({
        numDays: f.numDays, zones: f.zones, lots: f.attendanceLots, movements: f.movements,
      });
      const sumByDay = Object.values(r.totalsByDay).reduce((s, n) => s + n, 0);
      expect(r.grandTotalDayPeople, `seed=${seed}`).toBe(sumByDay);
    }
  });

  it("INV4 · combo soma N×qty ao público total (N=numDays)", () => {
    for (const seed of SEEDS) {
      const f = generateRandomEvent({ seed, numDays: 3, comboProbability: 1 });
      const r = computeEventAttendance({
        numDays: f.numDays, zones: f.zones, lots: f.attendanceLots, movements: f.movements,
      });
      const totalQty = f.movements.reduce((s, m) => s + m.qty, 0);
      expect(r.grandTotalDayPeople, `seed=${seed}`).toBe(totalQty * f.numDays);
    }
  });

  it("INV5 · simples só conta no dia da sua zona (não multiplica)", () => {
    for (const seed of SEEDS) {
      const f = generateRandomEvent({ seed, comboProbability: 0 });
      const r = computeEventAttendance({
        numDays: f.numDays, zones: f.zones, lots: f.attendanceLots, movements: f.movements,
      });
      const totalQty = f.movements.reduce((s, m) => s + m.qty, 0);
      expect(r.grandTotalDayPeople, `seed=${seed}`).toBe(totalQty);
    }
  });

  it("INV6 · não há receita negativa nem qty negativa", () => {
    for (const seed of SEEDS) {
      const f = generateRandomEvent({ seed });
      const r = computeEventAttendance({
        numDays: f.numDays, zones: f.zones, lots: f.attendanceLots, movements: f.movements,
      });
      expect(r.ticketRevenue, `seed=${seed}`).toBeGreaterThanOrEqual(0);
      expect(r.ticketsSold, `seed=${seed}`).toBeGreaterThanOrEqual(0);
      expect(r.grandTotalDayPeople, `seed=${seed}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("INV7 · totalsByZone soma == grandTotal", () => {
    for (const seed of SEEDS) {
      const f = generateRandomEvent({ seed });
      const r = computeEventAttendance({
        numDays: f.numDays, zones: f.zones, lots: f.attendanceLots, movements: f.movements,
      });
      const sumByZone = Object.values(r.totalsByZone).reduce((s, n) => s + n, 0);
      expect(sumByZone, `seed=${seed}`).toBe(r.grandTotalDayPeople);
    }
  });

  it("INV8 · idempotência — chamar 2× produz mesmo resultado", () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const f = generateRandomEvent({ seed });
      const input = {
        numDays: f.numDays, zones: f.zones, lots: f.attendanceLots, movements: f.movements,
      };
      const r1 = computeEventAttendance(input);
      const r2 = computeEventAttendance(input);
      expect(r2.ticketRevenue, `seed=${seed}`).toBe(r1.ticketRevenue);
      expect(r2.ticketsSold, `seed=${seed}`).toBe(r1.ticketsSold);
      expect(r2.grandTotalDayPeople, `seed=${seed}`).toBe(r1.grandTotalDayPeople);
    }
  });
});

describe("Tickets V2 · Edge cases", () => {
  it("Edge1 · evento sem movimentos → tudo zero", () => {
    const f = fixtureP4_Simples();
    const r = computeEventAttendance({
      numDays: f.numDays, zones: f.zones, lots: f.attendanceLots, movements: [],
    });
    expect(r.ticketsSold).toBe(0);
    expect(r.ticketRevenue).toBe(0);
    expect(r.grandTotalDayPeople).toBe(0);
  });

  it("Edge2 · evento com movimento qty=0 não impacta totais", () => {
    const f = fixtureP4_Simples();
    const r = computeEventAttendance({
      numDays: f.numDays, zones: f.zones, lots: f.attendanceLots,
      movements: [{ zone_id: f.zones[0].id, lot_id: f.attendanceLots[0].id, qty: 0 }],
    });
    expect(r.ticketsSold).toBe(0);
    expect(r.grandTotalDayPeople).toBe(0);
  });

  it("Edge3 · movimento com lot_id desconhecido cai como simples preço 0", () => {
    const f = fixtureP4_Simples();
    const r = computeEventAttendance({
      numDays: f.numDays, zones: f.zones, lots: f.attendanceLots,
      movements: [{ zone_id: f.zones[0].id, lot_id: "lot-INEXISTENTE", qty: 100 }],
    });
    expect(r.ticketsSold).toBe(100);
    expect(r.ticketRevenue).toBe(0);
  });

  it("Edge4 · combo 1 dia comporta-se como simples", () => {
    const r = computeEventAttendance({
      numDays: 1,
      zones: [{ id: "z", name: "X", day_index: 0 }],
      lots: [{ id: "L", zone_id: "z", kind: "combo", price: 50 }],
      movements: [{ zone_id: "z", lot_id: "L", qty: 100 }],
    });
    expect(r.totalsByDay[0]).toBe(100);
    expect(r.grandTotalDayPeople).toBe(100);
    expect(r.ticketRevenue).toBe(5000);
  });

  it("Edge5 · valores grandes não perdem precisão", () => {
    const r = computeEventAttendance({
      numDays: 2,
      zones: [
        { id: "zd0", name: "D0", day_index: 0 },
        { id: "zd1", name: "D1", day_index: 1 },
      ],
      lots: [
        { id: "L1", zone_id: "zd0", kind: "combo", price: 99 },
        { id: "L2", zone_id: "zd0", kind: "simple", price: 49 },
      ],
      movements: [
        { zone_id: "zd0", lot_id: "L1", qty: 100_000 },
        { zone_id: "zd0", lot_id: "L2", qty: 50_000 },
      ],
    });
    expect(r.ticketsSold).toBe(150_000);
    expect(r.ticketRevenue).toBe(100_000 * 99 + 50_000 * 49);
    expect(r.grandTotalDayPeople).toBe(100_000 * 2 + 50_000);
  });
});
