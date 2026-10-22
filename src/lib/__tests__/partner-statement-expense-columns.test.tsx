import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DropdownMenu, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import {
  buildPartnerStatementDoc,
  type PartnerStatementDocInput,
} from "../partner-statement-doc";
import { buildStatementPdf, buildStatementWorkbook } from "../export-partner-statement-doc";
import { ExpenseColumnsMenuItems } from "@/components/FechoBasisSelector";

const input: PartnerStatementDocInput = {
  eventName: "Ivete Clareou 2026",
  eventDate: "2026-10-10",
  eventLocation: "Lisboa",
  recipientName: "SUPERSOUNDS",
  participants: [
    { name: "SUPERSOUNDS", percentage: 50 },
    { name: "MUNDO PROPÍCIO", percentage: 50, isHouse: true },
  ],
  revenues: [{ origin: "Bilheteira", description: "Sessão única", net: 500000 }],
  expenseLines: [
    { categoryId: null, description: "Produção", base: 300000, ivaRate: 23, attachments: 2 },
    { categoryId: null, description: "Som e luz", base: 100000, ivaRate: 6, attachments: 1 },
  ],
  categories: [],
  usesGrossExpenses: true,
  resultOverride: -271437.2,
  recipientShareOverride: -135718.6,
  transferBaseOverride: 139590.01,
};

/** Texto integral do workbook (todas as folhas, todas as células). */
async function workbookText(mode: "detailed" | "totalOnly" | undefined) {
  const doc = buildPartnerStatementDoc({ ...input, expenseColumns: mode });
  const wb = await buildStatementWorkbook(doc);
  const cells: string[] = [];
  wb.worksheets.forEach((ws) =>
    ws.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value ?? "")))),
  );
  return { doc, wb, text: cells.join(" | ") };
}

/** Texto integral do PDF (streams de conteúdo sem compressão do jsPDF). */
function pdfText(mode: "detailed" | "totalOnly" | undefined) {
  const doc = buildPartnerStatementDoc({ ...input, expenseColumns: mode });
  const pdf = buildStatementPdf(doc);
  const pages = (pdf as any).internal.pages as string[];
  return { doc, text: normalizePdf(pages.join("\n")) };
}

/** Desfaz os escapes do PDF (\( \)) e normaliza NBSP/símbolo do euro. */
function normalizePdf(s: string) {
  return s
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/ /g, " ")
    .replace(/€/g, "");
}

describe("(g18 · #342) documento do sócio — colunas das despesas", () => {
  it("omissão é 'detailed' e sai exactamente como hoje", async () => {
    const { doc, text } = await workbookText(undefined);
    expect(doc.expenseColumns).toBe("detailed");
    expect(text).toContain("Total c/IVA");
    expect(text).toContain("3. AS DESPESAS DO EVENTO (despesas c/IVA)");
    expect(text).toContain("B. Despesas por família e rubrica (c/IVA)");
    expect(text).toContain("artigo 18.º do CIVA");
    const pdf = pdfText(undefined);
    expect(pdf.text).toContain("Total c/IVA");
    expect(pdf.text).toContain("artigo 18.º do CIVA");
  });

  it("'totalOnly' no Excel: cabeçalhos 'Família/Valor' e 'Rubrica/Valor/Anexos', sem 'c/iva' em lado nenhum", async () => {
    const { doc, wb, text } = await workbookText("totalOnly");
    expect(doc.expenseColumns).toBe("totalOnly");
    expect(text.toLowerCase()).not.toContain("c/iva");
    expect(text).not.toContain("artigo 18.º");
    // Secção 3: "Família" e "Valor" (nunca "IVA" nem "Total c/IVA" como cabeçalhos).
    expect(text).toContain("3. AS DESPESAS DO EVENTO");
    expect(text).toContain("Família | Valor");
    expect(text).toContain("Rubrica | Valor | Anexos");
    // Títulos sem o rótulo da base.
    expect(text).toContain("4. O RESULTADO");
    expect(text).toContain("B. Despesas por família e rubrica");
    expect(text).not.toContain("(despesas");
    // O total pago (com IVA) continua a aparecer: 300.000×1,23 + 100.000×1,06.
    expect(doc.expenseTotal).toBeCloseTo(475000, 2);
    const resumo = wb.getWorksheet("Resumo")!;
    const totalRow = resumo.getRows(1, resumo.rowCount)!.find(
      (r) => String(r.getCell(1).value) === "Total das despesas",
    )!;
    expect(Number(totalRow.getCell(2).value)).toBeCloseTo(475000, 2);
    expect(String(totalRow.getCell(3).value ?? "")).toBe("");
  });

  it("'totalOnly' no PDF: sem 'c/iva' (qualquer capitalização), sem nota do IVA", () => {
    const { text } = pdfText("totalOnly");
    expect(text.toLowerCase()).not.toContain("c/iva");
    expect(text).not.toContain("artigo 18.º");
    expect(text).toContain("3. AS DESPESAS DO EVENTO");
    expect(text).toContain("4. O RESULTADO");
    expect(text).toContain("B. Despesas por família e rubrica");
    expect(text).not.toContain("Total c/IVA");
    // As receitas ficam como estão (s/IVA).
    expect(text).toContain("2. AS RECEITAS DO EVENTO (s/IVA)");
  });

  it("totais, resultado, parte do sócio e base a transferir iguais ao cêntimo entre os dois modos", async () => {
    const det = buildPartnerStatementDoc({ ...input, expenseColumns: "detailed" });
    const tot = buildPartnerStatementDoc({ ...input, expenseColumns: "totalOnly" });
    expect(tot.expenseBase).toBe(det.expenseBase);
    expect(tot.expenseIva).toBe(det.expenseIva);
    expect(tot.expenseTotal).toBe(det.expenseTotal);
    expect(tot.result).toBe(det.result);
    expect(tot.recipientShare).toBe(det.recipientShare);
    expect(tot.transferBase).toBe(det.transferBase);
    // E nos artefactos: o valor total das despesas é o mesmo no PDF dos dois modos.
    const fmt = (n: number) =>
      new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
    expect(pdfText("detailed").text).toContain(fmt(det.expenseTotal));
    expect(pdfText("totalOnly").text).toContain(fmt(tot.expenseTotal));
    const wbDet = await workbookText("detailed");
    const wbTot = await workbookText("totalOnly");
    expect(wbTot.doc.result).toBe(wbDet.doc.result);
  });

  it("base s/IVA: 'totalOnly' pedido sai sempre 'detailed'", async () => {
    const doc = buildPartnerStatementDoc({ ...input, usesGrossExpenses: false, expenseColumns: "totalOnly" });
    expect(doc.expenseColumns).toBe("detailed");
    const wb = await buildStatementWorkbook(doc);
    const cells: string[] = [];
    wb.worksheets.forEach((ws) =>
      ws.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value ?? "")))),
    );
    expect(cells.join(" | ")).toContain("Total c/IVA");
  });

  it("seletor desactivado com base s/IVA: opção 'Só total pago' bloqueada e razão visível", () => {
    render(
      <DropdownMenu open modal={false}>
        <DropdownMenuContent forceMount>
          <ExpenseColumnsMenuItems choice={{ mode: "detailed", onChange: () => {}, disabled: true }} />
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByText("Só disponível quando as despesas do documento incluem IVA.")).toBeTruthy();
    const totalOnlyItem = screen.getByText("Só total pago").closest("[role='menuitemradio']")!;
    expect(totalOnlyItem.getAttribute("aria-disabled")).toBe("true");
  });

  it("seletor activo com base c/IVA: escolha 'Só total pago' propaga", () => {
    let chosen: string | null = null;
    render(
      <DropdownMenu open modal={false}>
        <DropdownMenuContent forceMount>
          <ExpenseColumnsMenuItems choice={{ mode: "detailed", onChange: (m) => (chosen = m), disabled: false }} />
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.queryByText("Só disponível quando as despesas do documento incluem IVA.")).toBeNull();
    fireEvent.click(screen.getByText("Só total pago"));
    expect(chosen).toBe("totalOnly");
  });
});
