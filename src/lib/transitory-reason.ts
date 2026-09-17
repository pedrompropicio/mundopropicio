/**
 * D-ERP80 — a transitória diz porquê.
 *
 * `transactions.transitory_reason` é obrigatório em toda a transitória (CHECK
 * `transactions_transitory_reason_required`) e limpa-se sozinho quando
 * `is_transitory` passa a false (trigger `trg_force_transitory_capital`).
 *
 * `partner_advance` NÃO aparece no selector manual: só nasce pela conversão em
 * Extra do Sócio (ou pela criação com o toggle 🧳).
 */
export type TransitoryReason =
  | "partner_advance"
  | "repasse"
  | "caucao"
  | "emprestimo_socio"
  | "carga_cartao"
  | "aporte_socio"
  | "entrada_a_repassar";

export const TRANSITORY_REASON_LABELS: Record<TransitoryReason, string> = {
  partner_advance: "Extra do Sócio",
  repasse: "Repasse a terceiro",
  caucao: "Caução / garantia",
  emprestimo_socio: "Empréstimo ao sócio",
  carga_cartao: "Carga de cartão",
  aporte_socio: "Aporte do sócio",
  entrada_a_repassar: "Entrada a repassar",
};

/** Motivos escolhíveis à mão nos modais (sem Extra do Sócio). */
export const MANUAL_TRANSITORY_REASONS: TransitoryReason[] = [
  "caucao",
  "repasse",
  "entrada_a_repassar",
  "emprestimo_socio",
  "aporte_socio",
  "carga_cartao",
];

export const MANUAL_TRANSITORY_REASON_OPTIONS = MANUAL_TRANSITORY_REASONS.map((value) => ({
  value,
  label: TRANSITORY_REASON_LABELS[value],
}));

export function transitoryReasonLabel(reason?: string | null): string | null {
  if (!reason) return null;
  return TRANSITORY_REASON_LABELS[reason as TransitoryReason] ?? reason;
}
