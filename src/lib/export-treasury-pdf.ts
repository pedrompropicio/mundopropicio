import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchExportBranding, drawPdfExportHeader } from "@/lib/export-header";
import { sanitizePdfText, sanitizePdfRows } from "@/lib/pdf-text";
import { formatMoney, type CompanyLocale } from "@/lib/company-locale";
import { treasuryDisplayRows } from "@/components/treasury/TreasuryBridgeView";
import { TREASURY_CURRENT_STATE, TREASURY_DIAGNOSTIC, TREASURY_LIVE_PARTNERS, type TreasuryNode } from "@/lib/treasury-bridge";

export async function exportTreasuryPdf(input: {
  companyId: string;
  periodLabel: string;
  locale: CompanyLocale;
  data: { company: TreasuryNode; common: TreasuryNode };
  retainedOutside: number;
}) {
  const branding = await fetchExportBranding(input.companyId);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const startY = drawPdfExportHeader(doc, {
    branding: { ...branding, displayName: sanitizePdfText(branding.displayName) },
    title: sanitizePdfText("Tesouraria · Onde está o dinheiro"),
    subtitles: [sanitizePdfText(input.periodLabel), "Empresa: eventos; Comuns apresentados em separado."],
  });
  const money = (v: number | null) => v === null ? "—" : formatMoney(v, input.locale);
  const body: string[][] = [
    [TREASURY_DIAGNOSTIC, "", ""], [TREASURY_CURRENT_STATE, "", ""], [TREASURY_LIVE_PARTNERS, "", ""],
    [`Retido fora dos eventos incluídos / sem atribuição: ${money(input.retainedOutside)}. Não distribuído pela ponte.`, "", ""],
  ];
  const append = (node: TreasuryNode, depth: number) => {
    body.push([`${"  ".repeat(depth)}${node.name}${node.origin ? ` · ${node.origin}` : ""}`, "", ""]);
    if (node.kind === "cash") body.push(["Movimentos de caixa e retido; resultado e sócios apenas no Master.", "", ""]);
    treasuryDisplayRows(node).forEach(row => body.push([row.label, money(row.without), money(row.with)]));
    if (node.participation !== undefined) body.push([`7. Participação: ${node.participation}% (informativa)`, "", ""]);
    body.push(["8. Pendentes (só na coluna com pendentes)", money(node.amounts.pending), ""]);
    node.children.forEach(child => append(child, depth + 1));
  };
  append(input.data.company, 0);
  append(input.data.common, 0);
  autoTable(doc, {
    startY, head: sanitizePdfRows([["Ponte / rubrica", "Sem pendentes", "Com pendentes"]]), body: sanitizePdfRows(body),
    styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [40, 40, 40] },
    columnStyles: { 0: { cellWidth: 100 }, 1: { halign: "right" }, 2: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });
  doc.save("tesouraria.pdf");
}
