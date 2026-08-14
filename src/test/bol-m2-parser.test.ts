import { describe, it, expect } from "vitest";
import { parseBolM2 } from "../../supabase/functions/_shared/bol-report-parser";

// Dump real do PDF "Ocupação Sessões M2 - Tipo de Venda" (Deive Leonardo,
// Coliseu de Lisboa, 14/08/2026 23:12) — ordem de tokens do PyMuPDF.
const REAL_DUMP = `
Ocupação Sessões M2 - Tipo de Venda
Sector Lotação Disp. Ocupação Taxa Ocup. Vendas Inteiras Descontos Total Vendas Convites Permutas Reservas Geral Reservas Produção Bloqueados
Qt Qt Qt % Qt Valor Qt Valor Qt Valor Qt Qt Qt Qt Qt
Cadeiras Orquestra 90 9 81 90,0 60 3 600,00 € 17 816,00 € 77 4 416,00 € 0 0 4 0 0
1ª Plateia 468 338 130 27,8 42 2 100,00 € 28 1 120,00 € 70 3 220,00 € 0 50 0 10 0
2ª Plateia 476 381 95 20,0 21 840,00 € 16 512,00 € 37 1 352,00 € 0 10 0 20 28
Balcão Central Imp 229 188 41 17,9 21 735,00 € 12 336,00 € 33 1 071,00 € 0 0 0 0 8
Balcão Central Par 235 195 40 17,0 25 875,00 € 7 196,00 € 32 1 071,00 € 0 0 0 0 8
Balcão Imp Visib Reduzida 100 95 5 5,0 3 90,00 € 2 48,00 € 5 138,00 € 0 0 0 0 0
Balcão Par Visib Reduzida 100 87 13 13,0 9 270,00 € 4 96,00 € 13 366,00 € 0 0 0 0 0
Camarotes 1ª Frente Imp 6 pax 6 0 6 100,0 0 0 0 0 0 0 0 6 0 0 0
Camarotes 1ª Lado Par 5 pax 10 0 10 100,0 0 0 0 0 0 0 0 10 0 0 0
Camarotes 1ª Frente Par 6 pax 72 0 72 100,0 0 0 0 0 0 0 0 72 0 0 0
TOTAL 1786 1293 493 27,6 181 8 510,00 € 86 3 124,00 € 267 11 634,00 € 0 148 4 30 44
DEIVE LEONARDO, O DESPERTAR | TOUR MUNDIAL
Coliseu de Lisboa
Todas as sessões (Em Venda)
14|08|2026 23:12 GMT Standard Time
Pág. 1 de 2
www.bol.pt
`;

describe("parseBolM2", () => {
  const res = parseBolM2(REAL_DUMP);

  it("lê os 10 setores + linha TOTAL", () => {
    expect(res.rows.length).toBe(10);
    expect(res.totalRow).not.toBeNull();
  });

  it("bate com a linha TOTAL (267 bilhetes / 11.634,00 €)", () => {
    expect(res.totalRow!.totalQty).toBe(267);
    expect(res.totalRow!.totalValue).toBeCloseTo(11634, 2);
    expect(res.totals.qty).toBe(267);
    expect(res.totals.value).toBeCloseTo(11634, 2);
    expect(res.totals.capacity).toBe(1786);
    expect(res.warnings.filter((w) => /Diverg/i.test(w))).toHaveLength(0);
  });

  it("mapeia colunas do primeiro setor", () => {
    const r = res.rows[0];
    expect(r.sector).toBe("Cadeiras Orquestra");
    expect(r.capacity).toBe(90);
    expect(r.available).toBe(9);
    expect(r.occupied).toBe(81);
    expect(r.occupancyRate).toBeCloseTo(90, 1);
    expect(r.fullQty).toBe(60);
    expect(r.fullValue).toBeCloseTo(3600, 2);
    expect(r.discountQty).toBe(17);
    expect(r.discountValue).toBeCloseTo(816, 2);
    expect(r.totalQty).toBe(77);
    expect(r.totalValue).toBeCloseTo(4416, 2);
    expect(r.reservedGeneral).toBe(4);
    expect(r.blocked).toBe(0);
  });

  it("mantém nomes com números e setores sem vendas", () => {
    const camarote = res.rows.find((r) => /Frente Par 6 pax/.test(r.sector));
    expect(camarote).toBeDefined();
    expect(camarote!.capacity).toBe(72);
    expect(camarote!.totalQty).toBe(0);
    expect(camarote!.swaps).toBe(72);
  });

  it("colunas finais na ordem Convites/Permutas/Reservas Geral/Reservas Produção/Bloqueados", () => {
    const t = res.totalRow!;
    expect([t.invitations, t.swaps, t.reservedGeneral, t.reservedProduction, t.blocked]).toEqual([0, 148, 4, 30, 44]);
    const p2 = res.rows.find((r) => r.sector === "2ª Plateia")!;
    expect([p2.invitations, p2.swaps, p2.reservedGeneral, p2.reservedProduction, p2.blocked]).toEqual([0, 10, 0, 20, 28]);
  });

  it("extrai cabeçalho editorial", () => {
    expect(res.header.venue).toMatch(/Coliseu/);
    expect(res.header.sessionsLabel).toMatch(/Todas as sess/i);
    expect(res.header.generatedAt).toMatch(/14\|08\|2026 23:12/);
  });
});
