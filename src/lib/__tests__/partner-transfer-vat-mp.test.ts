import { describe, expect, it } from "vitest";
import {
  partnerMpTransfersAdvanced,
  partnerTransferIvaBase,
  isMpTransferCategoryCode,
  type RevenueHeldRow,
} from "../partner-disbursement";
import {
  buildPartnerStatementDoc,
  FORBIDDEN_DOC_TERMS,
  statementTerms,
  type PartnerStatementDocInput,
} from "../partner-statement-doc";
import { buildStatementWorkbook } from "../export-partner-statement-doc";
import { calcIvaAmount } from "../iva";

/**
 * (IVA repasse) O IVA 23% do repasse incide sobre
 * max(0, base a transferir + transferências MP já feitas nas contas de acerto).
 * Números Live (26/10/2026): EIN · Anitta EDA 2026.
 */
const EIN = "ein";
const acc = (over: Partial<RevenueHeldRow>): RevenueHeldRow => ({
  id: Math.random().toString(36),
  partnerId: EIN,
  source: "settlement_account",
  accountName: "Acerto EIN · Anitta EDA 2026",
  description: "—",
  amount: 0,
  date: "2026-09-01",
  eventId: "fdfb39fe-45f2-43f5-9ec9-7cb536360ae1",
  ...over,
});
const einRows: RevenueHeldRow[] = [
  acc({ description: "Repasse Ticketline por conta do acerto com a EIN", amount: 905000, isMpTransfer: isMpTransferCategoryCode("10.3") }),
  acc({ description: "Patrocínio Câmara Municipal de Oeiras", amount: 50000, isMpTransfer: isMpTransferCategoryCode("1.2.01") }),
  acc({ description: "Bengaleiro", amount: 138.82, isMpTransfer: isMpTransferCategoryCode("1.3.03") }),
];

const docBase: PartnerStatementDocInput = {
  eventName: "Anitta - EDA 2026",
  eventDate: "2026-08-31",
  recipientName: "EIN",
  participants: [
    { name: "EIN", percentage: 50 },
    { name: "MUNDO PROPÍCIO", percentage: 50, isHouse: true },
  ],
  categories: [],
  revenues: [{ origin: "Bilheteira", description: "Sessão 1", net: 1000 }],
  expenseLines: [],
  resultOverride: 760576.69,
  recipientShareOverride: 0,
  transferBaseOverride: 179892.22,
};

describe("(IVA repasse) categoria 10.3", () => {
  it("aceita 10.3 e 10.3.*, recusa outras", () => {
    expect(isMpTransferCategoryCode("10.3")).toBe(true);
    expect(isMpTransferCategoryCode("10.3.01")).toBe(true);
    expect(isMpTransferCategoryCode("10.30")).toBe(false);
    expect(isMpTransferCategoryCode("1.2.01")).toBe(false);
    expect(isMpTransferCategoryCode(null)).toBe(false);
  });
});

describe("(IVA repasse) Anitta / EIN", () => {
  it("1. base 179.892,22 + adiantado MP 905.000,00", () => {
    const mp = partnerMpTransfersAdvanced(einRows, EIN);
    expect(mp).toBe(905000);
    const ivaBase = partnerTransferIvaBase(179892.22, mp);
    expect(ivaBase).toBe(1084892.22);
    const vat = calcIvaAmount(ivaBase, 23);
    expect(vat).toBe(249525.21);
    const doc = buildPartnerStatementDoc({ ...docBase, transferWithVat: true, mpTransfersAdvanced: mp });
    expect(doc.transferBase).toBe(179892.22);
    expect(doc.transferVatBase).toBe(1084892.22);
    expect(doc.transferVat).toBe(249525.21);
    expect(doc.transferTotal).toBe(429417.43);
    expect(doc.invoicedTotal).toBe(1334417.43);
  });

  it("2. Oeiras (50.000,00) e bengaleiro (138,82) não entram", () => {
    const sem = einRows.filter((r) => r.amount !== 905000);
    expect(partnerMpTransfersAdvanced(sem, EIN)).toBe(0);
    // operações de terceiros / encontro de contas também não contam
    const outros = [
      acc({ source: "third_party", amount: 1000, isMpTransfer: true }),
      acc({ source: "compensation", amount: 2000, isMpTransfer: true }),
      acc({ partnerId: "outro", amount: 3000, isMpTransfer: true }),
    ];
    expect(partnerMpTransfersAdvanced(outros, EIN)).toBe(0);
  });

  it("3. sem transfer_with_vat: igual ao atual", () => {
    const doc = buildPartnerStatementDoc({ ...docBase, transferWithVat: false, mpTransfersAdvanced: 905000 });
    expect(doc.transferVat).toBe(0);
    expect(doc.transferTotal).toBe(179892.22);
    expect(doc.invoicedTotal).toBe(0);
  });

  it("4. base negativa com adiantado 905.000", () => {
    expect(partnerTransferIvaBase(-100000, 905000)).toBe(805000);
    expect(partnerTransferIvaBase(-905000, 905000)).toBe(0);
    expect(partnerTransferIvaBase(-1000000, 905000)).toBe(0);
    const doc = buildPartnerStatementDoc({
      ...docBase,
      transferBaseOverride: -100000,
      transferWithVat: true,
      mpTransfersAdvanced: 905000,
    });
    expect(doc.transferVatBase).toBe(805000);
    expect(doc.transferVat).toBe(185150);
    expect(doc.transferTotal).toBe(85150);
  });

  it("5. sócio sem contas de acerto: base = max(0, base)", () => {
    expect(partnerMpTransfersAdvanced([], EIN)).toBe(0);
    expect(partnerTransferIvaBase(179892.22, 0)).toBe(179892.22);
    expect(partnerTransferIvaBase(-10, 0)).toBe(0);
    const doc = buildPartnerStatementDoc({ ...docBase, transferWithVat: true });
    expect(doc.transferVat).toBe(calcIvaAmount(179892.22, 23));
  });

  it("6. paridade sem IVA: números e linhas iguais com ou sem o novo campo", async () => {
    const a = buildPartnerStatementDoc({ ...docBase, transferWithVat: false });
    const b = buildPartnerStatementDoc({ ...docBase, transferWithVat: false, mpTransfersAdvanced: 905000 });
    for (const k of ["result", "transferBase", "transferVat", "transferTotal"] as const) {
      expect((b as any)[k]).toBe((a as any)[k]);
    }
    const textOf = async (d: typeof a) => {
      const wb = await buildStatementWorkbook(d);
      const out: string[] = [];
      wb.eachSheet((ws) => ws.eachRow((r) => out.push(JSON.stringify(r.values))));
      return out.join("\n");
    };
    expect(await textOf(b)).toBe(await textOf(a));
  });

  it("7. estanque: nenhum termo proibido nas duas línguas", async () => {
    for (const locale of ["pt-PT", "pt-BR"] as const) {
      const doc = buildPartnerStatementDoc({ ...docBase, locale, transferWithVat: true, mpTransfersAdvanced: 905000 });
      const t = statementTerms(locale);
      const wb = await buildStatementWorkbook(doc);
      const parts: string[] = [t.mpTransfersLine, t.vatBaseLine, t.invoicedTotalLine, t.vatOnTransfer];
      wb.eachSheet((ws) => ws.eachRow((r) => parts.push(JSON.stringify(r.values))));
      const all = parts.join("\n").toLowerCase();
      expect(all).toContain("total faturado");
      expect(all).toContain("base do iva");
      for (const w of FORBIDDEN_DOC_TERMS) expect(all).not.toContain(w.toLowerCase());
    }
  });

  it("o resultado e a parte do sócio não dependem do IVA do repasse", () => {
    const a = buildPartnerStatementDoc({ ...docBase, recipientShareOverride: 418598.65 });
    const b = buildPartnerStatementDoc({
      ...docBase,
      recipientShareOverride: 418598.65,
      transferWithVat: true,
      mpTransfersAdvanced: 905000,
    });
    expect(b.result).toBe(a.result);
    expect(b.result).toBe(760576.69);
    expect(b.recipientShare).toBe(418598.65);
    expect(b.recipientShare).toBe(a.recipientShare);
  });
});
