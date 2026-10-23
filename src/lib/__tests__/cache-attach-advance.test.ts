import { describe, it, expect } from "vitest";
import {
  previewAttachAdvance, needsBeneficiaryConfirmation, cityCapCheck, previewContract, remainingToContract, cacheErrorMessage,
} from "@/lib/cache-contracts";

// Caso real (Live, 23/10/2026): Turnê Simone Mendes 2026.
const L = "95051bc2", P = "56e431e8";
const CITIES = [
  { event_id: L, name: "SM Lisboa", cap: 68926.15, is_absorber: false },
  { event_id: P, name: "SM Porto", cap: 86494.04, is_absorber: true },
];
const TOTAL_CAP = 155420.19;
const K1_QUOTAS = { [L]: 37696.02, [P]: 47303.98 };
const BASE = {
  advanceByCity: { [L]: 10000 },
  cities: [{ event_id: L, balance: 28272.01, paid: 0 }, { event_id: P, balance: 35477.99, paid: 0 }],
  contractAdvances: 0, hasArtistMother: true, motherAmount: 63750, motherPaid: 0, inPaymentList: false,
};

describe("#346 ligar adiantamento — prévia", () => {
  it("Lisboa 28.272,01 → 18.272,01 e adiantamentos 0 → 10.000 ao ligar ao contrato 1", () => {
    const p = previewAttachAdvance(BASE);
    expect(p.cities).toEqual([{ event_id: L, amount: 10000, before: 28272.01, after: 18272.01 }]);
    expect(p.advancesBefore).toBe(0);
    expect(p.advancesAfter).toBe(10000);
    expect(p.problems).toEqual([]);
  });
  it("recusa saldo negativo", () => {
    expect(previewAttachAdvance({ ...BASE, advanceByCity: { [L]: 28272.02 } }).problems).toContain("saldo_negativo");
  });
  it("recusa ficar abaixo do já pago", () => {
    const p = previewAttachAdvance({ ...BASE, cities: [{ event_id: L, balance: 28272.01, paid: 20000 }, BASE.cities[1]] });
    expect(p.problems).toContain("saldo_abaixo_do_pago");
  });
  it("recusa saldo em lista de pagamento não rejeitada", () => {
    expect(previewAttachAdvance({ ...BASE, inPaymentList: true }).problems).toContain("saldo_em_lista");
  });
  it("exige confirmação quando o fornecedor difere do beneficiário (SIMONE MENDES × HENZA MUSIC)", () => {
    expect(needsBeneficiaryConfirmation("henza", "simone")).toBe(true);
    expect(needsBeneficiaryConfirmation("simone", "simone")).toBe(false);
  });
});

describe("#346 aviso de teto no Novo contrato", () => {
  const newQuota = (gross: number) =>
    Object.fromEntries(previewContract({ cities: CITIES, gross, withholdingRate: null, advancesByCity: {} }).cities.map((c) => [c.event_id, c.quota]));

  it("60.420,19 com o adiantamento livre em Lisboa → 74.491,32 > 68.926,15; espaço livre 21.230,13", () => {
    const r = cityCapCheck({ cities: CITIES, otherQuotasByCity: K1_QUOTAS, freeNotChosenByCity: { [L]: 10000 }, newQuotaByCity: newQuota(60420.19) });
    const lis = r.rows.find((x) => x.event_id === L)!;
    expect(lis.newQuota).toBe(26795.3);
    expect(lis.total).toBe(74491.32);
    expect(lis.room).toBe(21230.13);
    expect(r.exceeding.map((x) => x.event_id)).toEqual([L]);
  });
  it("depois de ligado: restante 70.420,19 e o aviso desaparece", () => {
    const remaining = remainingToContract({ totalCap: TOTAL_CAP, otherContractsGross: 85000, freeAdvancesNotChosen: 0 });
    expect(remaining).toBe(70420.19);
    const r = cityCapCheck({ cities: CITIES, otherQuotasByCity: K1_QUOTAS, freeNotChosenByCity: {}, newQuotaByCity: newQuota(remaining) });
    expect(r.exceeding).toEqual([]);
  });
  it("antes de ligar, o restante é 60.420,19", () => {
    expect(remainingToContract({ totalCap: TOTAL_CAP, otherContractsGross: 85000, freeAdvancesNotChosen: 10000 })).toBe(60420.19);
  });
});

describe("#346 mensagens de erro da RPC", () => {
  it.each([
    ["beneficiario_diferente: beneficiário X ≠ Y", "O fornecedor do adiantamento é diferente do beneficiário do contrato. Marque a confirmação para continuar."],
    ["saldo_em_lista: x", "O saldo deste contrato está numa lista de pagamento. Retire-o da lista primeiro."],
    ["contrato_cancelado", "Este contrato foi cancelado."],
    ["teto_cidade_excedido: SM Lisboa ficaria com 74491.32", "Uma cidade passaria do seu teto de cachê por causa de um adiantamento livre. Ligue o adiantamento a um contrato existente ou marque-o neste contrato."],
  ])("%s", (raw, msg) => {
    expect(cacheErrorMessage({ message: raw })).toBe(msg);
  });
});
