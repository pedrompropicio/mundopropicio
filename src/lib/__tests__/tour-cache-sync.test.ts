import { describe, it, expect } from "vitest";
import { computeTourCityCacheAmount } from "@/lib/tour-cache-sync";

const AEREO = "c0000015-0000-0000-0000-000000000001";
const COMISSAO = "e033d7d7-4da6-4dc7-94c5-c9d2c5aff686";
const config = {
  id: "cfg", artist_name: "Simone Mendes", cache_type: "variable",
  cache_revenue_basis: "net", cache_deduction_basis: "net", percentage: 40,
  tiers: [
    { occupancy_threshold: 70, percentage: 40 },
    { occupancy_threshold: 85, percentage: 45 },
    { occupancy_threshold: 100, percentage: 50 },
  ],
};
const deductions = [{ cache_config_id: "cfg", category_id: AEREO }, { cache_config_id: "cfg", category_id: COMISSAO }];
const fc = (category_id: string, amount: number) => ({ type: "expense", status: "approved", version_id: null, category_id, amount, iva_rate: 0 });
const masterForecasts = [fc(AEREO, 41720.35)];

const city = (net: number, comissao: number, occ: number, citySettlement: any = null, cfg: any = config) =>
  computeTourCityCacheAmount({
    config: cfg, deductions, revenue: { gross: net * 1.06, net }, occupancyPct: occ,
    cityForecasts: [fc(COMISSAO, comissao)], cityExpenses: [],
    masterForecasts, masterExpenses: [], cityCount: 2, citySettlement,
  });

describe("#301 — linha de cachê da cidade = cachê real (Simone Mendes 2026)", () => {
  it("Lisboa 68.906,53", () => expect(city(197117.92, 3991.42, 69.47)).toBe(68906.53));
  it("Porto 86.449,66", () => expect(city(241820.75, 4836.42, 70.75)).toBe(86449.66));
  it("settlement da cidade ajustado ganha", () =>
    expect(city(197117.92, 3991.42, 69.47, { adjusted_amount: 50000 })).toBe(50000));
  it("config finalizada ganha ao calculado", () =>
    expect(city(197117.92, 3991.42, 69.47, null, { ...config, is_finalized: true, real_amount: 1234 })).toBe(1234));
});

import { masterDeductionFingerprint } from "@/lib/tour-cache-sync";
describe("#301 A — alteração no Master dispara o recálculo só em rubricas de dedução", () => {
  const OUTRA = "outra-rubrica";
  const cats = [AEREO, COMISSAO];
  const baseF = [{ id: "f1", ...fc(AEREO, 41720.35) }, { id: "f2", ...fc(OUTRA, 500) }];
  const baseT = [{ id: "t1", category_id: AEREO, amount: 1000, iva_rate: 0, status: "paid" }, { id: "t2", category_id: OUTRA, amount: 10, iva_rate: 0, status: "paid" }];
  const fp0 = masterDeductionFingerprint(baseF, baseT, cats);
  it("linha do BP do Master alterada na dedução muda a impressão", () =>
    expect(masterDeductionFingerprint([{ ...baseF[0], amount: 42000 }, baseF[1]], baseT, cats)).not.toBe(fp0));
  it("despesa nova na dedução muda", () =>
    expect(masterDeductionFingerprint(baseF, [...baseT, { id: "t3", category_id: COMISSAO, amount: 5, status: "approved" }], cats)).not.toBe(fp0));
  it("despesa estornada na dedução muda", () =>
    expect(masterDeductionFingerprint(baseF, [{ ...baseT[0], reversed_at: "2026-10-10" }, baseT[1]], cats)).not.toBe(fp0));
  it("alterações fora das deduções não mudam nada", () => {
    expect(masterDeductionFingerprint([baseF[0], { ...baseF[1], amount: 9999 }], baseT, cats)).toBe(fp0);
    expect(masterDeductionFingerprint(baseF, [...baseT, { id: "t9", category_id: OUTRA, amount: 1, status: "paid" }], cats)).toBe(fp0);
  });
});
