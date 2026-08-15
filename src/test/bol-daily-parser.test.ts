import { describe, it, expect } from "vitest";
import { parseBolDiario } from "../../supabase/functions/_shared/bol-daily-parser";

// Harness do "Mapa Diário de Vendas por Sessão" (Deive Leonardo, Coliseu de
// Lisboa, 14|08|2026 23:12): 54 dias de 22/06/2026 a 14/08/2026,
// TOTAL 267 bilhetes / 11.634,00 €.
//
// Reproduz o fluxo de tokens do unpdf: SEM quebras de linha úteis (tudo num
// só fluxo), datas por ordem decrescente, montantes pt com espaço de milhar,
// e a palavra "TOTAL" também presente no CABEÇALHO.

/** Formato pt do PDF: espaço nos milhares ("3 600,00 €"). */
const fmt = (n: number) => {
  const [int, dec] = n.toFixed(2).split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${dec} €`;
};

function buildDump() {
  const days: { dmy: string; qty: number; value: number }[] = [];
  const start = new Date(Date.UTC(2026, 5, 22)); // 22/06/2026
  for (let i = 0; i < 54; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const dmy = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
    days.push({ dmy, qty: 0, value: 0 });
  }
  // 267 bilhetes distribuídos; 14/08 (último dia) = 7 bilhetes / 365,00 € (real)
  let remaining = 267 - 7;
  for (let i = 0; i < 53; i++) {
    const q = i === 0 ? remaining - 52 * 4 : 4; // primeiro dia absorve o resto
    days[i].qty = q;
    remaining -= q;
  }
  days[53].qty = 7;
  days[53].value = 365;
  // valores: 40 €/bilhete, com o remanescente somado ao primeiro dia
  let valueLeft = 11634 - 365;
  for (let i = 0; i < 53; i++) {
    const v = i === 0 ? valueLeft - 52 * 4 * 40 : 4 * 40;
    days[i].value = v;
    valueLeft -= v;
  }

  const desc = [...days].reverse();
  const body = desc
    .map((d) => `${d.dmy} ${d.qty} 0,00 € 0,00 € ${fmt(d.value)} 0,00 € 0,00 € 0,00 € ${fmt(d.value)}`)
    .join(" ");

  return {
    days,
    text:
      "Mapa Diário de Vendas por Sessão " +
      "Data Bilhetes Vendas Inteiras Bilheteira Local Ponto de Venda Internet " +
      "Vendas Desconto Bilheteira Local Ponto de Venda Internet TOTAL " +
      body +
      " TOTAL 267 0,00 € 705,00 € 7 805,00 € 0,00 € 0,00 € 3 124,00 € 11 634,00 € " +
      "DEIVE LEONARDO, O DESPERTAR | TOUR MUNDIAL Coliseu de Lisboa Todas as sessões (Em Venda) " +
      "Mapa Diário de Vendas por Sessão 14|08|2026 23:12 GMT Standard Time Pág. 1 de 1 www.bol.pt",
  };
}

describe("parseBolDiario", () => {
  const { text, days } = buildDump();
  const res = parseBolDiario(text);

  it("lê os 54 dias e a linha TOTAL (não o TOTAL do cabeçalho)", () => {
    expect(res.debug.daysParsed).toBe(54);
    expect(res.debug.hasTotalRow).toBe(true);
    expect(res.totalRow!.quantity).toBe(267);
    expect(res.totalRow!.totalValue).toBeCloseTo(11634, 2);
  });

  it("ordena por data ascendente (22/06 → 14/08)", () => {
    expect(res.debug.firstDate).toBe("2026-06-22");
    expect(res.debug.lastDate).toBe("2026-08-14");
    expect(res.rows[0].date).toBe("2026-06-22");
  });

  it("soma dos dias bate com a linha TOTAL, sem warnings", () => {
    expect(res.totals.quantity).toBe(267);
    expect(res.totals.totalValue).toBeCloseTo(11634, 2);
    expect(res.warnings).toEqual([]);
  });

  it("lê o último dia real (14/08: 7 bilhetes / 365,00 €)", () => {
    const last = res.rows[res.rows.length - 1];
    expect(last.quantity).toBe(7);
    expect(last.totalValue).toBeCloseTo(365, 2);
    expect(last.channels.length).toBe(6);
  });

  it("reconhece montantes com espaço de milhar", () => {
    const big = days.find((d) => d.value >= 1000);
    if (big) {
      const row = res.rows.find((r) => Math.abs(r.totalValue - big.value) < 0.01);
      expect(row).toBeTruthy();
    }
  });

  it("extrai cabeçalho/rodapé", () => {
    expect(res.header.sessionsLabel).toMatch(/Todas as sess/i);
    expect(res.header.venue).toMatch(/Coliseu/);
    expect(res.header.generatedAt).toMatch(/14\|08\|2026/);
  });
});
