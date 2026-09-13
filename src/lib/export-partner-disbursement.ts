/**
 * (g5·F) Export de conferência — "Desembolso de <sócio> (Excel)".
 *
 * Folha única, linha a linha, para o sócio conferir o que o sistema conta como
 * desembolso dele, os ajustes manuais e as receitas do evento que já estão em
 * poder dele. Sem fórmulas e sem protecção de livro.
 */
import ExcelJS from "exceljs";
import { safeFileToken } from "@/lib/partner-statement-doc";
import {
  REVENUE_HELD_SOURCE_LABEL,
  type BpPaidLine,
  type PartnerAdjustment,
  type RevenueHeldRow,
} from "@/lib/partner-disbursement";

const MONEY = '#,##0.00\\ "€"';

export interface DisbursementExportInput {
  eventName: string;
  partnerName: string;
  /** Transações de despesa pagas pelo sócio. */
  paidExpenses: Array<{ description: string; amount: number; date: string; category: string; cityLabel: string }>;
  totalPaidByPartner: number;
  bpPaidLines: BpPaidLine[];
  totalBpPaidByPartner: number;
  totalDisbursement: number;
  adjustments: PartnerAdjustment[];
  totalAdjustments: number;
  revenuesHeld: RevenueHeldRow[];
  totalRevenuesHeld: number;
  financingToReturn: number;
}

export async function buildDisbursementWorkbook(input: DisbursementExportInput) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Desembolso");
  ws.columns = [{ width: 52 }, { width: 22 }, { width: 20 }, { width: 16 }, { width: 16 }];

  const title = (text: string) => {
    const row = ws.addRow([text]);
    row.font = { name: "Arial", size: 11, bold: true };
  };
  const money = (row: ExcelJS.Row, cols: number[]) => {
    row.font = { name: "Arial", size: 10 };
    cols.forEach((c) => {
      row.getCell(c).numFmt = MONEY;
      row.getCell(c).alignment = { horizontal: "right" };
    });
    return row;
  };

  title(`Desembolso de ${input.partnerName} — ${input.eventName}`);
  ws.addRow([]);

  title("1. Despesas do evento pagas pelo sócio (transações)");
  ws.addRow(["Descrição", "Rubrica", "Cidade", "Data", "Valor"]).font = { name: "Arial", size: 10, bold: true };
  for (const e of input.paidExpenses) {
    money(ws.addRow([e.description, e.category, e.cityLabel, e.date, e.amount]), [5]);
  }
  money(ws.addRow(["Subtotal", null, null, null, input.totalPaidByPartner]), [5]).font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  ws.addRow([]);

  title("2. Linhas do Business Plan facturadas em nome do sócio");
  ws.addRow(["Descrição", "Rubrica", "Cidade", "Tem transação", "Valor"]).font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  for (const l of input.bpPaidLines) {
    money(ws.addRow([l.description, l.category, l.cityLabel, l.hasTransaction ? "Sim" : "Não", l.amount]), [5]);
  }
  money(ws.addRow(["Subtotal", null, null, null, input.totalBpPaidByPartner]), [5]).font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  ws.addRow([]);

  money(ws.addRow(["DESEMBOLSO DO SÓCIO", null, null, null, input.totalDisbursement]), [5]).font = {
    name: "Arial",
    size: 11,
    bold: true,
  };
  ws.addRow([]);

  if (input.adjustments.length > 0) {
    title("3. Ajustes ao desembolso");
    ws.addRow(["Descrição", "Cidade", null, "Data", "Valor"]).font = { name: "Arial", size: 10, bold: true };
    for (const a of input.adjustments) {
      money(ws.addRow([a.description, a.cityLabel, null, a.date, a.amount]), [5]);
    }
    money(ws.addRow(["Subtotal", null, null, null, input.totalAdjustments]), [5]).font = {
      name: "Arial",
      size: 10,
      bold: true,
    };
    ws.addRow([]);
  }

  title("4. Receitas do evento em poder do sócio");
  ws.addRow(["Origem", "Conta / operação", "Descrição", "Data", "Valor"]).font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  for (const r of input.revenuesHeld) {
    money(
      ws.addRow([REVENUE_HELD_SOURCE_LABEL[r.source], r.accountName, r.description, r.date, r.amount]),
      [5],
    );
  }
  money(ws.addRow(["Subtotal", null, null, null, input.totalRevenuesHeld]), [5]).font = {
    name: "Arial",
    size: 10,
    bold: true,
  };
  ws.addRow([]);

  money(ws.addRow(["FINANCIAMENTO A DEVOLVER", null, null, null, input.financingToReturn]), [5]).font = {
    name: "Arial",
    size: 11,
    bold: true,
  };

  return wb;
}

export async function exportDisbursementExcel(input: DisbursementExportInput) {
  const wb = await buildDisbursementWorkbook(input);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Desembolso_${safeFileToken(input.eventName)}_${safeFileToken(input.partnerName)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
