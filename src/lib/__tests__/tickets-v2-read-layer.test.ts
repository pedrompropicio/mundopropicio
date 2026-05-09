/**
 * Suite de testes para a camada de leitura unificada (Fase 2.3).
 */
import { describe, it, expect, vi } from "vitest";
import { fetchEventLotsUnified } from "@/lib/tickets-v2-read";
import {
  fixtureP1_FestivalCombo,
  fixtureP2_SessoesMultiplas,
  fixtureP4_Simples,
  ALL_FIXTURES,
  type FixtureBundle,
} from "./tickets-v2-fixtures";

function makeMockClient(f: FixtureBundle, useV2: boolean) {
  const eventId = "ev-test";
  const companyId = "co-test";

  const tableHandlers: Record<string, () => any[]> = {
    events: () => [{ id: eventId, company_id: companyId }],
    companies: () => [{ feature_tickets_v2: useV2 }],
    event_ticket_zones: () => f.zones.map((z) => ({ id: z.id })),
    event_ticket_lots: () =>
      f.legacyLots.map((l) => ({
        id: l.id,
        name: l.name,
        zone_id: l.zone_id,
        quantity: l.quantity,
        lot_kind: null,
        is_combo: l.is_combo,
        consumes_zone_ids: l.consumes_zone_ids,
        applies_to_days: l.applies_to_days,
        ticket_type_id: l.ticket_type_id,
      })),
    event_ticket_types: () =>
      f.ticketTypes.map((t) => ({
        id: t.id,
        kind: t.kind,
        parent_ticket_type_id: t.parent_ticket_type_id,
        variant_kind: t.variant_kind,
        variant_label: t.variant_label,
        sales_channel: t.sales_channel,
      })),
    event_ticket_type_zones: () =>
      f.ticketTypeZones.map((j) => ({
        ticket_type_id: j.ticket_type_id,
        zone_id: j.zone_id,
        display_order: j.display_order,
      })),
  };

  const makeQuery = (table: string) => {
    const rows = () => tableHandlers[table]?.() ?? [];
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      order: () => chain,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: any) => resolve({ data: rows(), error: null }),
    };
    return chain;
  };

  return { from: vi.fn((table: string) => makeQuery(table)) } as any;
}

describe("Tickets V2 · Camada de leitura unificada · equivalência por padrão", () => {
  for (const factory of ALL_FIXTURES) {
    const f = factory();

    it(`${f.patternName} · output legacy e v2 têm mesmos lots e quantidades`, async () => {
      const legacy = await fetchEventLotsUnified("ev-test", makeMockClient(f, false));
      const v2 = await fetchEventLotsUnified("ev-test", makeMockClient(f, true));

      expect(v2.length).toBe(legacy.length);
      const sumQty = (xs: any[]) => xs.reduce((s, l) => s + l.quantity, 0);
      expect(sumQty(v2)).toBe(sumQty(legacy));
      expect([...new Set(v2.map((l) => l.id))].sort()).toEqual(
        [...new Set(legacy.map((l) => l.id))].sort()
      );
    });

    it(`${f.patternName} · is_combo é coerente entre caminhos`, async () => {
      const legacy = await fetchEventLotsUnified("ev-test", makeMockClient(f, false));
      const v2 = await fetchEventLotsUnified("ev-test", makeMockClient(f, true));
      const lc = new Set(legacy.filter((l) => l.is_combo).map((l) => l.id));
      const vc = new Set(v2.filter((l) => l.is_combo).map((l) => l.id));
      expect([...vc].sort()).toEqual([...lc].sort());
    });

    it(`${f.patternName} · consumes_zone_ids são equivalentes (sets iguais)`, async () => {
      const legacy = await fetchEventLotsUnified("ev-test", makeMockClient(f, false));
      const v2 = await fetchEventLotsUnified("ev-test", makeMockClient(f, true));

      for (const lLegacy of legacy) {
        const lV2 = v2.find((x) => x.id === lLegacy.id);
        expect(lV2).toBeDefined();
        if (!lV2) continue;
        const legacyZones = lLegacy.consumes_zone_ids.length > 0
          ? lLegacy.consumes_zone_ids
          : [lLegacy.zone_id];
        const v2Zones = lV2.consumes_zone_ids.length > 0
          ? lV2.consumes_zone_ids
          : [lV2.zone_id];
        expect([...v2Zones].sort()).toEqual([...legacyZones].sort());
      }
    });
  }
});

describe("Tickets V2 · Camada de leitura · metadata de variante", () => {
  it("P1 · v2 expõe variant_kind/variant_label para o lote Revolut", async () => {
    const f = fixtureP1_FestivalCombo();
    const lots = await fetchEventLotsUnified("ev-test", makeMockClient(f, true));
    const r = lots.find((l) => l.id === "lot-passe-revolut-1");
    expect(r).toBeDefined();
    expect(r?.variant_kind).toBe("channel");
    expect(r?.variant_label).toBe("Revolut");
    expect(r?.sales_channel).toBe("partner:revolut");
    expect(r?.parent_ticket_type_id).toBe("tt-passe-relvado");
  });

  it("P1 · legacy NÃO expõe metadata de variante (todos null)", async () => {
    const f = fixtureP1_FestivalCombo();
    const lots = await fetchEventLotsUnified("ev-test", makeMockClient(f, false));
    for (const l of lots) {
      expect(l.variant_kind).toBeNull();
      expect(l.variant_label).toBeNull();
      expect(l.parent_ticket_type_id).toBeNull();
      expect(l.sales_channel).toBeNull();
    }
  });

  it("P2 · sem variantes — todos os lots têm variant_kind=null em v2", async () => {
    const f = fixtureP2_SessoesMultiplas();
    const lots = await fetchEventLotsUnified("ev-test", makeMockClient(f, true));
    for (const l of lots) {
      expect(l.variant_kind).toBeNull();
      expect(l.parent_ticket_type_id).toBeNull();
    }
  });
});

describe("Tickets V2 · Camada de leitura · resilência", () => {
  it("Evento inexistente devolve array vazio", async () => {
    const client = {
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      })),
    } as any;
    expect(await fetchEventLotsUnified("ev-fake", client)).toEqual([]);
  });

  it("Evento sem zonas devolve array vazio", async () => {
    const handlers: Record<string, () => any[]> = {
      events: () => [{ id: "ev-x", company_id: "co-x" }],
      companies: () => [{ feature_tickets_v2: false }],
      event_ticket_zones: () => [],
    };
    const client = {
      from: vi.fn((table: string) => {
        const rows = () => handlers[table]?.() ?? [];
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          is: () => chain,
          maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
          then: (resolve: any) => resolve({ data: rows(), error: null }),
        };
        return chain;
      }),
    } as any;
    expect(await fetchEventLotsUnified("ev-x", client)).toEqual([]);
  });

  it("V2 com lot sem ticket_type_id (legado órfão) ignora-o no path v2", async () => {
    const f = fixtureP4_Simples();
    const fOrphan: FixtureBundle = {
      ...f,
      legacyLots: f.legacyLots.map((l) => ({ ...l, ticket_type_id: "" })),
    };
    expect(await fetchEventLotsUnified("ev-test", makeMockClient(fOrphan, true))).toEqual([]);
  });
});

describe("Tickets V2 · Camada de leitura · pendente Fase 2.4+", () => {
  it.todo("Cap físico da zona é sempre dominante (combinação com combo-capacity)");
  it.todo("Cap do tipo-pai engloba variantes (Σ ≤ cap pai)");
  it.todo("UI pode pedir 'só pai' (exclui variantes) ou 'só variante X'");
  it.todo("Variante de canal soma corretamente no relatório por canal");
  it.todo("Hook useEventAttendance migrado para usar wrapper");
  it.todo("combo-capacity recebe lots via wrapper");
  it.todo("Fallback graceful quando flag muda durante runtime");
});
