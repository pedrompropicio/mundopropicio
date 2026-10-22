/**
 * #335 fase 3a — elegibilidade espelhada no cliente (função pura, sobre dados já lidos).
 * Espelha as recusas de supabase/manual/20261021_issue335_offset_core.INERTE.sql
 * (validação do documento). O servidor continua a ser a autoridade.
 * 1.ª versão (decisão do Pedro): só EUR e dívidas simples; o resto é recusado com motivo.
 * Documentos com conta inconsistente mantêm a recusa e recebem lista de verificação, sem alterar dados.
 */
import type { OffsetErrorCode } from "./index";
import { offsetErrorMessage } from "./index";

export interface OffsetEligibilitySnapshot {
  id: string;
  kind: "transaction" | "forecast";
  available?: boolean;
  /** Dívida em aberto em euros, tal como lida (gross − pago). */
  open_amount: number;
  currency?: string | null;
  /** Valor base com o número de casas que veio da BD. */
  amount?: number;
  has_installments?: boolean;
  has_credit?: boolean;
  has_withholding?: boolean;
  has_fx?: boolean;
  has_planned_payments?: boolean;
  /** Outros casos fora da 1.ª versão (cachê, acerto de sócio, parcela-filha, retido por terceiro…). */
  unsupported_other?: boolean;
  leg_type?: "normal" | "camarim" | "reimbursement" | "card" | "aporte" | "shared_cost" | "transitory";
  cash_account_inconsistent?: boolean;
  event_closed?: boolean;
  settlement_sealed?: boolean;
  // Só linhas de BP
  forecast_shared?: boolean;
  forecast_link_denied?: boolean;
}

export interface OffsetEligibilityResult {
  eligible: boolean;
  code: OffsetErrorCode | null;
  message: string | null;
  /** Lista de verificação mostrada na prévia (só para cash_account_inconsistent). */
  checklist: string[];
}

const CASH_ACCOUNT_CHECKLIST = [
  "Confirme a conta da transação.",
  "Confirme que cada pagamento em dinheiro está na mesma conta da transação.",
  "Confirme que as compensações antigas não têm conta.",
  "Corrija pela ficha da transação; o encontro não altera estes dados.",
];

function hasMoreThanTwoDecimals(v: number): boolean {
  return Math.abs(Math.round(v * 100) - v * 100) > 1e-6;
}

function refuse(code: OffsetErrorCode, checklist: string[] = []): OffsetEligibilityResult {
  return { eligible: false, code, message: offsetErrorMessage(code), checklist };
}

export function checkOffsetEligibility(d: OffsetEligibilitySnapshot): OffsetEligibilityResult {
  if (d.available === false)
    return refuse(d.kind === "forecast" ? "forecast_not_available" : "document_not_available");
  if (d.leg_type === "camarim") return refuse("camarim_leg_unsupported");
  if (d.cash_account_inconsistent) return refuse("cash_account_inconsistent", CASH_ACCOUNT_CHECKLIST);
  if (
    (d.currency ?? "EUR") !== "EUR" ||
    d.has_fx ||
    d.has_installments ||
    d.has_credit ||
    d.has_withholding ||
    d.has_planned_payments ||
    d.unsupported_other ||
    (d.leg_type !== undefined && d.leg_type !== "normal")
  )
    return refuse("unsupported_debt");
  if (
    !Number.isFinite(d.open_amount) ||
    hasMoreThanTwoDecimals(d.open_amount) ||
    (d.amount !== undefined && hasMoreThanTwoDecimals(d.amount))
  )
    return refuse("document_precision_unsupported");
  if (d.settlement_sealed) return refuse("sealed_settlement");
  if (d.event_closed) return refuse("event_closed");
  if (d.kind === "forecast") {
    if (d.forecast_shared) return refuse("forecast_shared_no_creation");
    if (d.forecast_link_denied) return refuse("forecast_link_denied");
  }
  if (Math.round(d.open_amount * 100) <= 0) return refuse("no_open_debt");
  return { eligible: true, code: null, message: null, checklist: [] };
}
