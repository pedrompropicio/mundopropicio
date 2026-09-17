import * as XLSX from "xlsx";
import { applyPTNumberFormat } from "@/lib/excel-format";
import { formatDatePT } from "@/lib/utils";

/**
 * Conta corrente do sócio (#193) — SÓ LEITURA.
 *
 * Não é um encontro de contas financeiro: é o medidor da exposição fiscal.
 * O sócio único faz retiradas da empresa que se justificam por duas fontes
 * (folha de vencimentos e faturas no NIF da empresa pagas por ele). O que
 * sobrar a 31/12 fica exposto a enquadramento como distribuição de lucros.
 *
 * Regras fixadas (não alterar):
 * - A folha entra pelo BRUTO — já está gravada assim, apenas se soma.
 * - As faturas contam pelo `total_amount` integral (não existe campo de
 *   "parte paga pelo sócio").
 * - Levantamentos de numerário NÃO entram: não são retiradas do sócio.
 */

/** Conta "Conta Corrente · Pedro Neto" (restrita, is_accounting = false). */
export const PARTNER_ACCOUNT_ID = "29115958-27b0-4a5d-9888-4a983ce4d11d";

/** Sócio único (profiles.id) usado em `standalone_invoices.paid_by_partner_id`. */
export const PARTNER_PROFILE_ID = "d8e502f7-9ceb-4dae-bd73-7291832d0d6f";

export interface PartnerWithdrawal {
  id: string;
  date: string;
  description: string | null;
  amount: number;
}

export interface PartnerPayrollLine {
  id: string;
  date: string;
  description: string | null;
  amount: number;
}

export interface PartnerInvoiceLine {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  amount: number;
}

export interface PartnerCurrentAccountData {
  withdrawals: PartnerWithdrawal[];
  payroll: PartnerPayrollLine[];
  invoices: PartnerInvoiceLine[];
}

export interface PartnerCurrentAccountTotals {
  withdrawals: number;
  payroll: number;
  invoices: number;
  /** Retiradas − folha − faturas. Positivo = falta justificar. */
  unjustified: number;
  lastWithdrawalDate: string | null;
  lastPayrollDate: string | null;
}

const sum = (values: number[]) =>
  Math.round(values.reduce((acc, v) => acc + v, 0) * 100) / 100;

export function computePartnerTotals(data: PartnerCurrentAccountData): PartnerCurrentAccountTotals {
  const withdrawals = sum(data.withdrawals.map((w) => w.amount));
  const payroll = sum(data.payroll.map((p) => p.amount));
  const invoices = sum(data.invoices.map((i) => i.amount));
  const dates = (list: { date: string }[]) =>
    list.length === 0 ? null : list.map((l) => l.date).sort().slice(-1)[0];
  return {
    withdrawals,
    payroll,
    invoices,
    unjustified: Math.round((withdrawals - payroll - invoices) * 100) / 100,
    lastWithdrawalDate: dates(data.withdrawals),
    lastPayrollDate: dates(data.payroll),
  };
}

/** Exportação do ano escolhido — três folhas + resumo. */
export function exportPartnerCurrentAccountToExcel(
  year: number,
  data: PartnerCurrentAccountData,
  totals: PartnerCurrentAccountTotals,
) {
  const wb = XLSX.utils.book_new();

  const resumo = XLSX.utils.aoa_to_sheet([
    [`CONTA CORRENTE DO SÓCIO — ${year}`],
    ["Relatório de leitura. Não reflete o saldo da conta na página de Contas."],
    [],
    ["Parcela", "Movimentos", "Valor (€)"],
    ["Retiradas", data.withdrawals.length, totals.withdrawals],
    ["Folha de vencimentos (bruto)", data.payroll.length, totals.payroll],
    ["Faturas no NIF da empresa pagas pelo sócio", data.invoices.length, totals.invoices],
    ["Por justificar", "", totals.unjustified],
  ]);
  applyPTNumberFormat(resumo);
  XLSX.utils.book_append_sheet(wb, resumo, "Resumo");

  const wsW = XLSX.utils.aoa_to_sheet([
    ["Data", "Descrição", "Valor (€)"],
    ...data.withdrawals.map((w) => [formatDatePT(w.date), w.description ?? "", w.amount]),
  ]);
  applyPTNumberFormat(wsW);
  XLSX.utils.book_append_sheet(wb, wsW, "Retiradas");

  const wsP = XLSX.utils.aoa_to_sheet([
    ["Data", "Descrição", "Valor (€)"],
    ...data.payroll.map((p) => [formatDatePT(p.date), p.description ?? "", p.amount]),
  ]);
  applyPTNumberFormat(wsP);
  XLSX.utils.book_append_sheet(wb, wsP, "Folha");

  const wsI = XLSX.utils.aoa_to_sheet([
    ["Fornecedor", "Nº fatura", "Data", "Valor (€)"],
    ...data.invoices.map((i) => [
      i.supplier_name ?? "",
      i.invoice_number ?? "",
      i.invoice_date ? formatDatePT(i.invoice_date) : "",
      i.amount,
    ]),
  ]);
  applyPTNumberFormat(wsI);
  XLSX.utils.book_append_sheet(wb, wsI, "Faturas");

  XLSX.writeFile(wb, `Conta_Corrente_Socio_${year}.xlsx`);
}
