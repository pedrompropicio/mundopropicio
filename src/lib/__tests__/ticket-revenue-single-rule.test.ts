import { describe, expect, it } from "vitest";
import { ticketSaleRevenue, sumTicketSalesRevenue } from "@/lib/ticket-sales-revenue";
import { computeTicketRevenueAndOccupancy } from "@/lib/real-cache-calc";

// Regra única de receita de bilheteira: total_value da linha; fallback
// quantity × unit_price só quando total_value é NULL. Líquido = bruto da
// linha / (1 + iva_rate do lote/100), default 6. Ocupação/quantidade não mudam.

// Caso Deive Lisboa (b7e0407d-0b16-4c95-91a4-8c1d6b333c26): unit_price vem
// arredondado e acumula diferença; o total_value preserva o valor exacto.
const deiveSales = [
  // 2.644,80 / 82 = 32,253658… — unit_price arredondado perde cêntimos
  { zone_id: "Z1", lot_id: "L1", quantity: 82, unit_price: 32.25, total_value: 2644.8 },
  { zone_id: "Z1", lot_id: "L2", quantity: 500, unit_price: 40, total_value: 20000 },
  { zone_id: "Z1", lot_id: "L3", quantity: 300, unit_price: 62.46, total_value: 18740.2 },
];
const deiveLots = [
  { id: "L1", iva_rate: 6 },
  { id: "L2", iva_rate: 6 },
  { id: "L3", iva_rate: 6 },
];
const deiveZones = [{ id: "Z1", event_id: "E", total_capacity: 2000 }];

describe("regra única de receita de bilheteira", () => {
  it("linha usa total_value; fallback quantity × unit_price só com total_value NULL", () => {
    expect(ticketSaleRevenue({ quantity: 82, unit_price: 32.25, total_value: 2644.8 })).toBe(2644.8);
    expect(ticketSaleRevenue({ quantity: 82, unit_price: 32.25, total_value: null })).toBeCloseTo(2644.5, 2);
    expect(ticketSaleRevenue({ quantity: 82, unit_price: 32.25 })).toBeCloseTo(2644.5, 2);
    expect(ticketSaleRevenue({ quantity: 82, unit_price: 32.25, total_value: "" })).toBeCloseTo(2644.5, 2);
  });

  it("Deive Lisboa: bruto 41.385,00 e líquido 39.042,45 (card = fecho = cachê)", () => {
    const r = computeTicketRevenueAndOccupancy(deiveSales, deiveLots, deiveZones);
    expect(r.revenue.gross).toBeCloseTo(41385.0, 2);
    expect(r.revenue.net).toBeCloseTo(39042.45, 2);
    expect(r.quantity).toBe(882);
  });

  it("lote com IVA diferente de 6: líquido usa a taxa do lote", () => {
    const r = computeTicketRevenueAndOccupancy(
      [{ zone_id: "Z1", lot_id: "LX", quantity: 10, unit_price: 123, total_value: 1230 }],
      [{ id: "LX", iva_rate: 23 }],
      deiveZones,
    );
    expect(r.revenue.gross).toBeCloseTo(1230, 2);
    expect(r.revenue.net).toBeCloseTo(1000, 2);
  });

  it("multi-lote com fallback NULL misturado com total_value", () => {
    const r = computeTicketRevenueAndOccupancy(
      [
        { zone_id: "Z1", lot_id: "L1", quantity: 82, unit_price: 32.25, total_value: 2644.8 },
        { zone_id: "Z1", lot_id: "L2", quantity: 10, unit_price: 40, total_value: null },
      ],
      deiveLots,
      deiveZones,
    );
    expect(r.revenue.gross).toBeCloseTo(2644.8 + 400, 2);
    expect(r.revenue.net).toBeCloseTo((2644.8 + 400) / 1.06, 2);
  });

  it("invariante: cachê (computeTicketRevenueAndOccupancy) = soma linha a linha do helper", () => {
    const r = computeTicketRevenueAndOccupancy(deiveSales, deiveLots, deiveZones);
    expect(r.revenue.gross).toBeCloseTo(sumTicketSalesRevenue(deiveSales), 2);
  });

  it("ocupação e quantidade não mudam com a regra de receita", () => {
    const r = computeTicketRevenueAndOccupancy(deiveSales, deiveLots, deiveZones);
    expect(r.occupancyPct).toBeCloseTo((882 / 2000) * 100, 6);
  });
});
