import { describe, expect, it } from "vitest";
import { turnElasticity, zoneProjection, addDaysISO } from "@/lib/zone-price-elasticity";
import { zoneSelloutPill } from "@/lib/zone-sellout-pill";

const days = (start: string, n: number, qty: number) =>
  Array.from({ length: n }, (_, i) => ({ sale_date: addDaysISO(start, i), qty }));

describe("turnElasticity", () => {
  it("virada com queda: 10/dia antes, 5/dia depois → −50%", () => {
    const s = [...days("2026-01-01", 14, 10), ...days("2026-01-15", 14, 5)];
    const r = turnElasticity(s, "2026-01-15", "2026-02-10");
    expect(r.antesDia).toBe(10);
    expect(r.depoisDia).toBe(5);
    expect(r.variacaoPct).toBe(-50);
    expect(r.diasDepois).toBe(14);
    expect(r.janelaIncompleta).toBe(false);
  });

  it("virada com subida e dias sem venda contam como zero (÷14)", () => {
    // antes: 7 dias com 4 → 28/14 = 2; depois: 14 dias com 3 → 3
    const s = [...days("2026-01-08", 7, 4), ...days("2026-01-15", 14, 3)];
    const r = turnElasticity(s, "2026-01-15", "2026-03-01");
    expect(r.antesDia).toBe(2);
    expect(r.depoisDia).toBe(3);
    expect(r.variacaoPct).toBe(50);
  });

  it("menos de 14 dias depois usa os dias decorridos", () => {
    const s = [...days("2026-01-01", 14, 10), ...days("2026-01-15", 5, 8)];
    const r = turnElasticity(s, "2026-01-15", "2026-01-19");
    expect(r.diasDepois).toBe(5);
    expect(r.janelaIncompleta).toBe(true);
    expect(r.depoisDia).toBe(8);
    expect(r.variacaoPct).toBe(-20);
  });

  it("antes = 0 → variação null", () => {
    const s = days("2026-01-15", 14, 6);
    const r = turnElasticity(s, "2026-01-15", "2026-02-01");
    expect(r.antesDia).toBe(0);
    expect(r.variacaoPct).toBeNull();
  });
});

describe("zoneProjection", () => {
  it("esgota antes do evento; até ao evento limitado ao libertado", () => {
    const r = zoneProjection({
      series: days("2026-01-04", 7, 10),
      lastDate: "2026-01-10",
      vendido: 800,
      released: 1000,
      eventDate: "2026-03-01",
      fromDate: "2026-01-10",
    });
    expect(r.ritmo).toBe(10);
    expect(r.esgotaDias).toBe(20);
    expect(r.esgotaData).toBe("2026-01-30");
    expect(r.ateEvento).toBe(1000);
  });

  it("não chega: projecção abaixo do libertado", () => {
    const r = zoneProjection({
      series: days("2026-01-04", 7, 1),
      lastDate: "2026-01-10",
      vendido: 100,
      released: 1000,
      eventDate: "2026-01-20",
      fromDate: "2026-01-10",
    });
    expect(r.esgotaDias).toBe(900);
    expect(r.ateEvento).toBe(110);
    expect(zoneSelloutPill({ porVender: 900, ritmo: r.ritmo, esgota: r.esgotaDias, daysLeft: r.diasAteEvento })
      .label).toBe("não chega lá");
  });

  it("ritmo 0 → parada, sem esgota; sem libertado sem limite; evento passado → null", () => {
    const r = zoneProjection({
      series: days("2025-12-01", 7, 5),
      lastDate: "2026-01-10",
      vendido: 50,
      released: null,
      eventDate: "2026-01-20",
      fromDate: "2026-01-10",
    });
    expect(r.parada).toBe(true);
    expect(r.esgotaDias).toBeNull();
    expect(r.ateEvento).toBe(50);
    const p = zoneProjection({
      series: days("2026-01-04", 7, 5),
      lastDate: "2026-01-10",
      vendido: 50,
      released: null,
      eventDate: "2026-01-01",
      fromDate: "2026-01-10",
    });
    expect(p.ateEvento).toBeNull();
  });
});
