/**
 * Fixtures sintéticos dos 5 padrões de bilheteria observados no sistema.
 * Reutilizar em testes de cálculo, snapshot e property-based.
 *
 * Cada padrão produz um conjunto consistente de:
 *   - zonas (event_ticket_zones)
 *   - lotes legacy (event_ticket_lots com is_combo, consumes_zone_ids)
 *   - tipos novos (event_ticket_types)
 *   - junction (event_ticket_type_zones)
 *   - movimentos de venda (input para computeEventAttendance)
 *
 * Os números reflectem os dados reais (Coala 2026 / Henry&Klaus / Ivete) com
 * volumes reduzidos para clareza.
 *
 * Padrões cobertos:
 *  P1 — Festival multi-dia com combo + variantes de canal (Coala-like)
 *  P2 — Eventos com sessões múltiplas no mesmo dia (Henry&Klaus-like)
 *  P3 — Lotes em fases cronológicas, 1 zona, 1 dia (Ivete-like)
 *  P4 — Evento simples 1 dia 1 zona (Mundo Propício-like)
 *  P5 — Master/Split tour (turnê com cidade-master + city-splits)
 */
import type {
  AttendanceLot,
  AttendanceZone,
  AttendanceMovement,
  AttendanceCourtesy,
} from "@/lib/event-attendance-calc";

// ── Tipos auxiliares espelhando o novo modelo ─────────────────────────────

export interface FixtureTicketType {
  id: string;
  event_id: string;
  name: string;
  kind: "single_day" | "multi_day_pass" | "package" | "session_ticket" | "custom";
  entries_per_unit: number;
  parent_ticket_type_id: string | null;
  variant_kind: "channel" | "package" | "promo" | "companion" | null;
  variant_label: string | null;
  sales_channel: string | null;
}

export interface FixtureTicketTypeZone {
  ticket_type_id: string;
  zone_id: string;
  display_order: number;
}

export interface FixtureLegacyLot {
  id: string;
  zone_id: string;
  name: string;
  quantity: number;
  price: number;
  is_combo: boolean;
  consumes_zone_ids: string[] | null;
  applies_to_days: number;
  ticket_type_id: string;
}

export interface FixtureBundle {
  patternName: string;
  description: string;
  numDays: number;
  zones: AttendanceZone[];
  attendanceLots: AttendanceLot[];
  legacyLots: FixtureLegacyLot[];
  ticketTypes: FixtureTicketType[];
  ticketTypeZones: FixtureTicketTypeZone[];
  movements: AttendanceMovement[];
  courtesies?: AttendanceCourtesy[];
  expected: {
    totalsByDay: Record<number, number>;
    grandTotalDayPeople: number;
    ticketRevenue: number;
    ticketsSold: number;
  };
}

export function fixtureP1_FestivalCombo(): FixtureBundle {
  const eventId = "ev-p1";
  const zRelvadoSab = "z-relvado-sab";
  const zRelvadoDom = "z-relvado-dom";
  const zTendaSab = "z-tenda-sab";
  const zTendaDom = "z-tenda-dom";

  const zones: AttendanceZone[] = [
    { id: zRelvadoSab, name: "Relvado — Sábado", day_index: 0 },
    { id: zRelvadoDom, name: "Relvado — Domingo", day_index: 1 },
    { id: zTendaSab, name: "Tenda VIP — Sábado", day_index: 0 },
    { id: zTendaDom, name: "Tenda VIP — Domingo", day_index: 1 },
  ];

  const ticketTypes: FixtureTicketType[] = [
    { id: "tt-relvado-sab", event_id: eventId, name: "Diária Relvado Sábado",
      kind: "single_day", entries_per_unit: 1,
      parent_ticket_type_id: null, variant_kind: null, variant_label: null, sales_channel: null },
    { id: "tt-relvado-dom", event_id: eventId, name: "Diária Relvado Domingo",
      kind: "single_day", entries_per_unit: 1,
      parent_ticket_type_id: null, variant_kind: null, variant_label: null, sales_channel: null },
    { id: "tt-tenda-sab", event_id: eventId, name: "Diária Tenda VIP Sábado",
      kind: "single_day", entries_per_unit: 1,
      parent_ticket_type_id: null, variant_kind: null, variant_label: null, sales_channel: null },
    { id: "tt-tenda-dom", event_id: eventId, name: "Diária Tenda VIP Domingo",
      kind: "single_day", entries_per_unit: 1,
      parent_ticket_type_id: null, variant_kind: null, variant_label: null, sales_channel: null },
    { id: "tt-passe-relvado", event_id: eventId, name: "Passe Geral Relvado 2 dias",
      kind: "multi_day_pass", entries_per_unit: 1,
      parent_ticket_type_id: null, variant_kind: null, variant_label: null, sales_channel: null },
    { id: "tt-passe-relvado-revolut", event_id: eventId, name: "Passe Geral Relvado Revolut 2 dias",
      kind: "multi_day_pass", entries_per_unit: 1,
      parent_ticket_type_id: "tt-passe-relvado", variant_kind: "channel",
      variant_label: "Revolut", sales_channel: "partner:revolut" },
    { id: "tt-passe-tenda", event_id: eventId, name: "Passe VIP Tenda 2 dias",
      kind: "multi_day_pass", entries_per_unit: 1,
      parent_ticket_type_id: null, variant_kind: null, variant_label: null, sales_channel: null },
  ];

  const ticketTypeZones: FixtureTicketTypeZone[] = [
    { ticket_type_id: "tt-relvado-sab", zone_id: zRelvadoSab, display_order: 0 },
    { ticket_type_id: "tt-relvado-dom", zone_id: zRelvadoDom, display_order: 0 },
    { ticket_type_id: "tt-tenda-sab", zone_id: zTendaSab, display_order: 0 },
    { ticket_type_id: "tt-tenda-dom", zone_id: zTendaDom, display_order: 0 },
    { ticket_type_id: "tt-passe-relvado", zone_id: zRelvadoSab, display_order: 0 },
    { ticket_type_id: "tt-passe-relvado", zone_id: zRelvadoDom, display_order: 1 },
    { ticket_type_id: "tt-passe-relvado-revolut", zone_id: zRelvadoSab, display_order: 0 },
    { ticket_type_id: "tt-passe-relvado-revolut", zone_id: zRelvadoDom, display_order: 1 },
    { ticket_type_id: "tt-passe-tenda", zone_id: zTendaSab, display_order: 0 },
    { ticket_type_id: "tt-passe-tenda", zone_id: zTendaDom, display_order: 1 },
  ];

  const legacyLots: FixtureLegacyLot[] = [
    { id: "lot-relvado-sab-1", zone_id: zRelvadoSab, name: "Diária Relvado Sábado - lote 1",
      quantity: 800, price: 60, is_combo: false, consumes_zone_ids: null, applies_to_days: 1,
      ticket_type_id: "tt-relvado-sab" },
    { id: "lot-relvado-dom-1", zone_id: zRelvadoDom, name: "Diária Relvado Domingo - lote 1",
      quantity: 600, price: 60, is_combo: false, consumes_zone_ids: null, applies_to_days: 1,
      ticket_type_id: "tt-relvado-dom" },
    { id: "lot-tenda-sab-1", zone_id: zTendaSab, name: "Diária Tenda VIP Sábado - lote 1",
      quantity: 80, price: 135, is_combo: false, consumes_zone_ids: null, applies_to_days: 1,
      ticket_type_id: "tt-tenda-sab" },
    { id: "lot-passe-relvado-1", zone_id: zRelvadoSab, name: "Passe Geral Relvado 2 dias - lote 1",
      quantity: 1500, price: 95, is_combo: true,
      consumes_zone_ids: [zRelvadoSab, zRelvadoDom], applies_to_days: 2,
      ticket_type_id: "tt-passe-relvado" },
    { id: "lot-passe-revolut-1", zone_id: zRelvadoSab, name: "Passe Revolut Relvado 2 dias",
      quantity: 300, price: 80, is_combo: true,
      consumes_zone_ids: [zRelvadoSab, zRelvadoDom], applies_to_days: 2,
      ticket_type_id: "tt-passe-relvado-revolut" },
    { id: "lot-passe-tenda-1", zone_id: zTendaSab, name: "Passe VIP Tenda 2 dias - lote 1",
      quantity: 200, price: 220, is_combo: true,
      consumes_zone_ids: [zTendaSab, zTendaDom], applies_to_days: 2,
      ticket_type_id: "tt-passe-tenda" },
  ];

  const attendanceLots: AttendanceLot[] = legacyLots.map((l) => ({
    id: l.id, zone_id: l.zone_id,
    kind: l.is_combo && (l.consumes_zone_ids?.length ?? 0) >= 2 ? "combo" : "simple",
    price: l.price,
  }));

  const movements: AttendanceMovement[] = legacyLots.map((l) => ({
    zone_id: l.zone_id, lot_id: l.id, qty: l.quantity,
  }));

  return {
    patternName: "P1",
    description: "Festival 2 dias com combo + variante Revolut (Coala-like)",
    numDays: 2,
    zones, attendanceLots, legacyLots, ticketTypes, ticketTypeZones, movements,
    expected: {
      totalsByDay: { 0: 2880, 1: 2600 },
      grandTotalDayPeople: 5480,
      ticketRevenue: 305_300,
      ticketsSold: 3480,
    },
  };
}

export function fixtureP2_SessoesMultiplas(): FixtureBundle {
  const eventId = "ev-p2";
  const zPlateiaS1 = "z-plat-s1", zPlateiaS2 = "z-plat-s2", zPlateiaS3 = "z-plat-s3";
  const zTribunaS1 = "z-trib-s1", zTribunaS2 = "z-trib-s2", zTribunaS3 = "z-trib-s3";

  const zones: AttendanceZone[] = [
    { id: zPlateiaS1, name: "Plateia (Sessão 1)", day_index: 0 },
    { id: zPlateiaS2, name: "Plateia (Sessão 2)", day_index: 0 },
    { id: zPlateiaS3, name: "Plateia (Sessão 3)", day_index: 0 },
    { id: zTribunaS1, name: "Tribuna (Sessão 1)", day_index: 0 },
    { id: zTribunaS2, name: "Tribuna (Sessão 2)", day_index: 0 },
    { id: zTribunaS3, name: "Tribuna (Sessão 3)", day_index: 0 },
  ];

  const types = [
    ["tt-plat-s1", "Plateia (Sessão 1)", zPlateiaS1],
    ["tt-plat-s2", "Plateia (Sessão 2)", zPlateiaS2],
    ["tt-plat-s3", "Plateia (Sessão 3)", zPlateiaS3],
    ["tt-trib-s1", "Tribuna (Sessão 1)", zTribunaS1],
    ["tt-trib-s2", "Tribuna (Sessão 2)", zTribunaS2],
    ["tt-trib-s3", "Tribuna (Sessão 3)", zTribunaS3],
  ] as const;

  const ticketTypes: FixtureTicketType[] = types.map(([id, name]) => ({
    id, event_id: eventId, name, kind: "single_day", entries_per_unit: 1,
    parent_ticket_type_id: null, variant_kind: null, variant_label: null, sales_channel: null,
  }));

  const ticketTypeZones: FixtureTicketTypeZone[] = types.map(([id, , zid]) => ({
    ticket_type_id: id, zone_id: zid, display_order: 0,
  }));

  const lotData = [
    [zPlateiaS1, "tt-plat-s1", 200, 35],
    [zPlateiaS2, "tt-plat-s2", 180, 35],
    [zPlateiaS3, "tt-plat-s3", 160, 35],
    [zTribunaS1, "tt-trib-s1", 100, 28],
    [zTribunaS2, "tt-trib-s2", 90, 28],
    [zTribunaS3, "tt-trib-s3", 80, 28],
  ] as const;

  const legacyLots: FixtureLegacyLot[] = lotData.map(([zid, ttid, qty, price], i) => ({
    id: `lot-p2-${i}`, zone_id: zid as string,
    name: `Lote ${i + 1} | ${zid}`, quantity: qty as number, price: price as number,
    is_combo: false, consumes_zone_ids: null, applies_to_days: 1,
    ticket_type_id: ttid as string,
  }));

  const attendanceLots: AttendanceLot[] = legacyLots.map((l) => ({
    id: l.id, zone_id: l.zone_id, kind: "simple", price: l.price,
  }));

  const movements: AttendanceMovement[] = legacyLots.map((l) => ({
    zone_id: l.zone_id, lot_id: l.id, qty: l.quantity,
  }));

  return {
    patternName: "P2",
    description: "Sessões múltiplas no mesmo dia (Henry&Klaus-like)",
    numDays: 1, zones, attendanceLots, legacyLots, ticketTypes, ticketTypeZones, movements,
    expected: {
      totalsByDay: { 0: 810 },
      grandTotalDayPeople: 810,
      ticketRevenue: 26_460,
      ticketsSold: 810,
    },
  };
}

export function fixtureP3_FasesCronologicas(): FixtureBundle {
  const eventId = "ev-p3";
  const zPista = "z-pista-p3";

  const zones: AttendanceZone[] = [{ id: zPista, name: "Pista", day_index: 0 }];

  const ticketTypes: FixtureTicketType[] = [
    { id: "tt-pista", event_id: eventId, name: "Pista", kind: "single_day",
      entries_per_unit: 1, parent_ticket_type_id: null, variant_kind: null,
      variant_label: null, sales_channel: null },
  ];

  const ticketTypeZones: FixtureTicketTypeZone[] = [
    { ticket_type_id: "tt-pista", zone_id: zPista, display_order: 0 },
  ];

  const lotData = [
    ["Lote 1", 500, 40], ["Lote 2", 800, 50], ["Lote 3", 1000, 60],
    ["Lote 4", 700, 70], ["Lote 5 (último)", 200, 80],
  ] as const;

  const legacyLots: FixtureLegacyLot[] = lotData.map(([name, qty, price], i) => ({
    id: `lot-p3-${i}`, zone_id: zPista,
    name: `${name} | Pista`, quantity: qty as number, price: price as number,
    is_combo: false, consumes_zone_ids: null, applies_to_days: 1,
    ticket_type_id: "tt-pista",
  }));

  const attendanceLots: AttendanceLot[] = legacyLots.map((l) => ({
    id: l.id, zone_id: l.zone_id, kind: "simple", price: l.price,
  }));

  const movements: AttendanceMovement[] = legacyLots.map((l) => ({
    zone_id: l.zone_id, lot_id: l.id, qty: l.quantity,
  }));

  return {
    patternName: "P3",
    description: "Lotes em fases cronológicas, 1 zona, 1 dia (Ivete-like)",
    numDays: 1, zones, attendanceLots, legacyLots, ticketTypes, ticketTypeZones, movements,
    expected: {
      totalsByDay: { 0: 3200 },
      grandTotalDayPeople: 3200,
      ticketRevenue: 185_000,
      ticketsSold: 3200,
    },
  };
}

export function fixtureP4_Simples(): FixtureBundle {
  const eventId = "ev-p4";
  const zUnica = "z-unica-p4";

  const zones: AttendanceZone[] = [{ id: zUnica, name: "Geral", day_index: 0 }];

  const ticketTypes: FixtureTicketType[] = [
    { id: "tt-geral", event_id: eventId, name: "Geral", kind: "single_day",
      entries_per_unit: 1, parent_ticket_type_id: null, variant_kind: null,
      variant_label: null, sales_channel: null },
  ];

  const ticketTypeZones: FixtureTicketTypeZone[] = [
    { ticket_type_id: "tt-geral", zone_id: zUnica, display_order: 0 },
  ];

  const legacyLots: FixtureLegacyLot[] = [
    { id: "lot-p4-1", zone_id: zUnica, name: "Lote único | Geral",
      quantity: 250, price: 25, is_combo: false, consumes_zone_ids: null,
      applies_to_days: 1, ticket_type_id: "tt-geral" },
  ];

  const attendanceLots: AttendanceLot[] = [{ id: "lot-p4-1", zone_id: zUnica, kind: "simple", price: 25 }];
  const movements: AttendanceMovement[] = [{ zone_id: zUnica, lot_id: "lot-p4-1", qty: 250 }];

  return {
    patternName: "P4",
    description: "Evento simples 1 dia 1 zona (Mundo Propício pequeno)",
    numDays: 1, zones, attendanceLots, legacyLots, ticketTypes, ticketTypeZones, movements,
    expected: {
      totalsByDay: { 0: 250 },
      grandTotalDayPeople: 250,
      ticketRevenue: 6250,
      ticketsSold: 250,
    },
  };
}

export function fixtureP5_MasterSplit(): FixtureBundle {
  const eventId = "ev-p5-lisboa";
  const zPista = "z-p5-pista";

  const zones: AttendanceZone[] = [{ id: zPista, name: "Pista", day_index: 0 }];

  const ticketTypes: FixtureTicketType[] = [
    { id: "tt-p5", event_id: eventId, name: "Pista", kind: "single_day",
      entries_per_unit: 1, parent_ticket_type_id: null, variant_kind: null,
      variant_label: null, sales_channel: null },
  ];

  const ticketTypeZones: FixtureTicketTypeZone[] = [
    { ticket_type_id: "tt-p5", zone_id: zPista, display_order: 0 },
  ];

  const legacyLots: FixtureLegacyLot[] = [
    { id: "lot-p5-1", zone_id: zPista, name: "Lote 1 | Pista",
      quantity: 600, price: 45, is_combo: false, consumes_zone_ids: null,
      applies_to_days: 1, ticket_type_id: "tt-p5" },
    { id: "lot-p5-2", zone_id: zPista, name: "Lote 2 | Pista",
      quantity: 400, price: 55, is_combo: false, consumes_zone_ids: null,
      applies_to_days: 1, ticket_type_id: "tt-p5" },
  ];

  const attendanceLots: AttendanceLot[] = legacyLots.map((l) => ({
    id: l.id, zone_id: l.zone_id, kind: "simple", price: l.price,
  }));

  const movements: AttendanceMovement[] = legacyLots.map((l) => ({
    zone_id: l.zone_id, lot_id: l.id, qty: l.quantity,
  }));

  return {
    patternName: "P5",
    description: "Master/Split tour — cidade-split standalone",
    numDays: 1, zones, attendanceLots, legacyLots, ticketTypes, ticketTypeZones, movements,
    expected: {
      totalsByDay: { 0: 1000 },
      grandTotalDayPeople: 1000,
      ticketRevenue: 49_000,
      ticketsSold: 1000,
    },
  };
}

export const ALL_FIXTURES: Array<() => FixtureBundle> = [
  fixtureP1_FestivalCombo,
  fixtureP2_SessoesMultiplas,
  fixtureP3_FasesCronologicas,
  fixtureP4_Simples,
  fixtureP5_MasterSplit,
];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomEventConfig {
  seed: number;
  numDays?: number;
  numZonesPerDay?: number;
  numLots?: number;
  maxQtyPerLot?: number;
  comboProbability?: number;
}

export function generateRandomEvent(cfg: RandomEventConfig): FixtureBundle {
  const rng = mulberry32(cfg.seed);
  const numDays = cfg.numDays ?? Math.floor(rng() * 4) + 1;
  const numZonesPerDay = cfg.numZonesPerDay ?? Math.floor(rng() * 3) + 1;
  const numLots = cfg.numLots ?? Math.floor(rng() * 10) + 1;
  const maxQty = cfg.maxQtyPerLot ?? 500;
  const comboProb = cfg.comboProbability ?? 0.25;

  const zones: AttendanceZone[] = [];
  for (let d = 0; d < numDays; d++) {
    for (let z = 0; z < numZonesPerDay; z++) {
      zones.push({ id: `z-d${d}-${z}`, name: `Zona ${z + 1} (Dia ${d + 1})`, day_index: d });
    }
  }

  const attendanceLots: AttendanceLot[] = [];
  const movements: AttendanceMovement[] = [];
  for (let i = 0; i < numLots; i++) {
    const isCombo = numDays >= 2 && rng() < comboProb;
    const anchorZone = zones[Math.floor(rng() * zones.length)];
    const price = Math.floor(rng() * 100) + 10;
    const qty = Math.floor(rng() * maxQty);
    attendanceLots.push({
      id: `lot-r-${i}`, zone_id: anchorZone.id,
      kind: isCombo ? "combo" : "simple", price,
    });
    movements.push({ zone_id: anchorZone.id, lot_id: `lot-r-${i}`, qty });
  }

  return {
    patternName: `RANDOM-${cfg.seed}`,
    description: `Evento aleatório seed=${cfg.seed}`,
    numDays, zones, attendanceLots,
    legacyLots: [], ticketTypes: [], ticketTypeZones: [],
    movements,
    expected: { totalsByDay: {}, grandTotalDayPeople: 0, ticketRevenue: 0, ticketsSold: 0 },
  };
}
