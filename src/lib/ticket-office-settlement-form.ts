/**
 * #271 — forma de liquidação de um fecho de bilheteira, derivada no servidor por
 * get_ticket_office_settlements_overview (D-ERP197). A derivação é grosseira:
 * o ecrã mostra sempre as notas do fecho a seguir. D-ERP232: + "apuramento" e
 * correcção manual em forma_liquidacao_manual (a derivada nunca se perde).
 */
export type SettlementForm = "transferencia" | "encontro_de_contas" | "compensado" | "por_liquidar" | "apuramento";

export const SETTLEMENT_FORM_LABELS: Record<SettlementForm, string> = {
  transferencia: "Transferência própria para a conta da empresa",
  encontro_de_contas: "Encontro de contas na conta-corrente com a bilheteira (sem transferência própria)",
  compensado: "Compensado — líquido zero, as deduções igualam o bruto",
  por_liquidar: "Por liquidar — sem transferência nem encontro de contas registado",
  apuramento: "Incluído no Apuramento Ticketline",
};

export function settlementFormLabel(f?: string | null, statementNumber?: string | null): string {
  if (f === "apuramento" && statementNumber) return `Incluído no Apuramento Ticketline nº ${statementNumber}`;
  return SETTLEMENT_FORM_LABELS[f as SettlementForm] ?? (f || "—");
}

export const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  confirmed: "Confirmado",
  reversed: "Estornado",
};
