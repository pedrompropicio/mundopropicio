import { it } from "vitest";
import { buildPartnerStatementDoc } from "@/lib/partner-statement-doc";
import { buildStatementPdf } from "@/lib/export-partner-statement-doc";
it("probe2", () => {
  const doc = buildPartnerStatementDoc({
    eventName: "X", eventDate: "2026-10-10", recipientName: "A",
    participants: [{ name: "A", percentage: 100 }],
    revenues: [{ origin: "Bilheteira", net: 500000 }],
    expenseLines: [{ categoryId: null, description: "Produção", base: 300000, ivaRate: 23 }],
    categories: [], usesGrossExpenses: true,
  });
  const pages = (buildStatementPdf(doc) as any).internal.pages as string[];
  const t = pages.join("\n");
  const i = t.indexOf("475");
  console.log(JSON.stringify(t.slice(i - 60, i + 40)));
  const j = t.indexOf("RECEITAS");
  console.log(JSON.stringify(t.slice(j - 40, j + 40)));
});
