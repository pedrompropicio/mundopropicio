import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrency } from "@/lib/mock-data";
import { applyPTNumberFormat } from "@/lib/excel-format";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("pt-PT");
}

function fmtVal(v: number): string {
  return v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function exportBankStatementToExcel(
  account: any,
  lines: any[],
  openingBalance: number,
  closingBalance: number,
  dateFrom: string,
  dateTo: string
) {
  const wb = XLSX.utils.book_new();

  const rows: any[][] = [
    [`EXTRATO BANCÁRIO — ${account.name}`],
    [`Período: ${dateFrom ? fmtDate(dateFrom) : "Início"} a ${dateTo ? fmtDate(dateTo) : "Atual"}`],
    [],
    ["Data", "Descrição", "Evento", "Entrada (€)", "Saída (€)", "Saldo (€)"],
    [dateFrom || "—", "SALDO INICIAL", "", "", "", openingBalance],
  ];

  lines.forEach((l: any) => {
    rows.push([
      l.date,
      l.description,
      l.events?.name ?? "",
      l.signedAmount > 0 ? l.signedAmount : "",
      l.signedAmount < 0 ? Math.abs(l.signedAmount) : "",
      l.runningBalance,
    ]);
  });

  const totalIncome = lines.filter((l: any) => l.signedAmount > 0).reduce((s: number, l: any) => s + l.signedAmount, 0);
  const totalExpense = lines.filter((l: any) => l.signedAmount < 0).reduce((s: number, l: any) => s + Math.abs(l.signedAmount), 0);
  rows.push([dateTo || "—", "SALDO FINAL", "", totalIncome, totalExpense, closingBalance]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 12 }, { wch: 35 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, "Extrato");
  XLSX.writeFile(wb, `Extrato_${account.name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportBankStatementToPDF(
  account: any,
  lines: any[],
  openingBalance: number,
  closingBalance: number,
  dateFrom: string,
  dateTo: string
) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const ml = 14;
  const mr = 14;
  const cw = pageWidth - ml - mr;
  let y = 14;

  const colW = [cw * 0.10, cw * 0.30, cw * 0.18, cw * 0.14, cw * 0.14, cw * 0.14];
  const colX = [ml];
  for (let i = 1; i < 6; i++) colX.push(colX[i - 1] + colW[i - 1]);

  function checkPage(needed: number) {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      y = 14;
      drawHeader();
    }
  }

  function drawHeader() {
    doc.setFillColor(30, 30, 40);
    doc.rect(ml, y, cw, 8, "F");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("Data", colX[0] + 2, y + 5.5);
    doc.text("Descrição", colX[1] + 2, y + 5.5);
    doc.text("Evento", colX[2] + 2, y + 5.5);
    doc.text("Entrada (€)", colX[3] + colW[3] - 2, y + 5.5, { align: "right" });
    doc.text("Saída (€)", colX[4] + colW[4] - 2, y + 5.5, { align: "right" });
    doc.text("Saldo (€)", colX[5] + colW[5] - 2, y + 5.5, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  // Logo
  try {
    doc.addImage(logoHorizontal, "PNG", ml, y, 60, 17);
    y += 22;
  } catch { y += 4; }

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Extrato Bancário", ml, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Conta: ${account.name}`, ml, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Período: ${dateFrom ? fmtDate(dateFrom) : "Início"} a ${dateTo ? fmtDate(dateTo) : "Atual"} — Gerado em ${new Date().toLocaleDateString("pt-PT")}`, ml, y);
  doc.setTextColor(0, 0, 0);
  y += 8;

  // Summary bar
  doc.setFillColor(245, 245, 250);
  doc.roundedRect(ml, y, cw, 16, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  const qw = cw / 4;
  const totalIncome = lines.filter((l: any) => l.signedAmount > 0).reduce((s: number, l: any) => s + l.signedAmount, 0);
  const totalExpense = lines.filter((l: any) => l.signedAmount < 0).reduce((s: number, l: any) => s + Math.abs(l.signedAmount), 0);

  doc.setTextColor(100, 100, 100);
  doc.text("Saldo Inicial", ml + 4, y + 5);
  doc.setFontSize(10);
  const obColor = openingBalance >= 0 ? [34, 139, 34] : [200, 50, 50];
  doc.setTextColor(obColor[0], obColor[1], obColor[2]);
  doc.text(fmtVal(openingBalance), ml + 4, y + 12);

  doc.setFontSize(8);
  doc.setTextColor(34, 139, 34);
  doc.text("Entradas", ml + qw + 4, y + 5);
  doc.setFontSize(10);
  doc.text(fmtVal(totalIncome), ml + qw + 4, y + 12);

  doc.setFontSize(8);
  doc.setTextColor(200, 120, 0);
  doc.text("Saídas", ml + qw * 2 + 4, y + 5);
  doc.setFontSize(10);
  doc.text(fmtVal(totalExpense), ml + qw * 2 + 4, y + 12);

  doc.setFontSize(8);
  const cbColor = closingBalance >= 0 ? [34, 139, 34] : [200, 50, 50];
  doc.setTextColor(cbColor[0], cbColor[1], cbColor[2]);
  doc.text("Saldo Final", ml + qw * 3 + 4, y + 5);
  doc.setFontSize(10);
  doc.text(fmtVal(closingBalance), ml + qw * 3 + 4, y + 12);

  doc.setTextColor(0, 0, 0);
  y += 20;

  // Table
  drawHeader();

  // Opening balance row
  doc.setFillColor(240, 240, 245);
  doc.rect(ml, y - 1, cw, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(dateFrom ? fmtDate(dateFrom) : "—", colX[0] + 2, y + 4);
  doc.text("SALDO INICIAL", colX[1] + 2, y + 4);
  doc.text(fmtVal(openingBalance), colX[5] + colW[5] - 2, y + 4, { align: "right" });
  y += 8;

  // Transaction rows
  lines.forEach((line: any) => {
    checkPage(8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(fmtDate(line.date), colX[0] + 2, y + 4);

    const desc = line.description.length > 40 ? line.description.substring(0, 40) + "…" : line.description;
    doc.text(desc, colX[1] + 2, y + 4);
    doc.text((line.events?.name ?? "").substring(0, 22), colX[2] + 2, y + 4);

    if (line.signedAmount > 0) {
      doc.setTextColor(34, 139, 34);
      doc.text(fmtVal(line.signedAmount), colX[3] + colW[3] - 2, y + 4, { align: "right" });
      doc.setTextColor(0, 0, 0);
      doc.text("—", colX[4] + colW[4] - 2, y + 4, { align: "right" });
    } else {
      doc.text("—", colX[3] + colW[3] - 2, y + 4, { align: "right" });
      doc.setTextColor(200, 120, 0);
      doc.text(fmtVal(Math.abs(line.signedAmount)), colX[4] + colW[4] - 2, y + 4, { align: "right" });
      doc.setTextColor(0, 0, 0);
    }

    const balColor = line.runningBalance >= 0 ? [34, 139, 34] : [200, 50, 50];
    doc.setTextColor(balColor[0], balColor[1], balColor[2]);
    doc.text(fmtVal(line.runningBalance), colX[5] + colW[5] - 2, y + 4, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 7;
  });

  // Closing balance row
  checkPage(10);
  doc.setFillColor(230, 240, 255);
  doc.rect(ml, y - 1, cw, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(dateTo ? fmtDate(dateTo) : "—", colX[0] + 2, y + 5);
  doc.text("SALDO FINAL", colX[1] + 2, y + 5);
  doc.setTextColor(34, 139, 34);
  doc.text(fmtVal(totalIncome), colX[3] + colW[3] - 2, y + 5, { align: "right" });
  doc.setTextColor(200, 120, 0);
  doc.text(fmtVal(totalExpense), colX[4] + colW[4] - 2, y + 5, { align: "right" });
  doc.setTextColor(cbColor[0], cbColor[1], cbColor[2]);
  doc.text(fmtVal(closingBalance), colX[5] + colW[5] - 2, y + 5, { align: "right" });

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Mundo Propício - Extrato Bancário", ml, pageHeight - 8);
    doc.text(`Página ${p}/${totalPages}`, pageWidth - mr, pageHeight - 8, { align: "right" });
  }

  doc.save(`Extrato_${account.name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
