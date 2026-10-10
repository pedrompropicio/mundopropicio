import { describe, it, expect } from "vitest";
import { computePartnerRebill } from "../partner-rebill-vat";

// Caso real Plenitude/FEBRACIS (5 tx, só 437,75 a 23%)
const plenitude = [
  { amount: 2200, iva_rate: 0 },
  { amount: 17320.08, iva_rate: 0 },
  { amount: 289.37, iva_rate: 0 },
  { amount: 437.75, iva_rate: 23 },
  { amount: 18000, iva_rate: 0 },
];

describe("computePartnerRebill", () => {
  it("sócio PT refatura com IVA por custo", () => {
    const r = computePartnerRebill(plenitude, "PT", "PT");
    expect(r.regime).toBe("pt_refatura");
    expect(r.base).toBe(38247.2);
    expect(r.ivaFaturado).toBe(100.68);
    expect(r.aDevolver).toBe(38347.88);
  });
  it("sócio BR com serviço em PT autoliquida e devolve só a base", () => {
    const r = computePartnerRebill([{ amount: 1000, iva_rate: 23 }], "BR", "PT");
    expect(r.regime).toBe("autoliquidacao");
    expect(r.ivaAutoliquidado).toBe(230);
    expect(r.ivaFaturado).toBe(0);
    expect(r.aDevolver).toBe(1000);
  });
  it("sócio BR com serviço fora de PT fica fora do campo", () => {
    const r = computePartnerRebill([{ amount: 1000, iva_rate: 23 }], "BR", "ES");
    expect(r.regime).toBe("fora_do_campo");
    expect(r.ivaAutoliquidado).toBe(0);
    expect(r.aDevolver).toBe(1000);
  });
  it("país inválido ou vazio cai em PT", () => {
    expect(computePartnerRebill([{ amount: 10, iva_rate: 23 }], "", null).regime).toBe("pt_refatura");
  });
});
