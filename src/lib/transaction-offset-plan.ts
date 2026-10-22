/**
 * #335 — Função pura da prévia do "Encontro de contas" (Fase 3a, classe R1).
 *
 * Não chama RPC nem Supabase; não conhece UI. Recebe o movimento de dinheiro
 * (linha bancária) e os documentos seleccionados, e devolve a repartição
 * dinheiro/compensação por documento mais os itens prontos para o contrato
 * do núcleo (`transaction_offset_execute`): exactamente um de
 * transaction_id | forecast_id, mode 'settle' | 'offset', cash_order e
 * expected_open_cents. O cliente NUNCA envia amount/paid_amount/iva_rate.
 *
 * Aritmética SÓ em cêntimos inteiros (nunca floats).
 */

// ---------------------------------------------------------------------------
// Códigos de erro do núcleo -> mensagens pt-PT
// ---------------------------------------------------------------------------

export const OFFSET_ERROR_CODES = [
  "encontro_desativado",
  "encontro_em_conflito",
  "preview_changed",
  "request_changed",
  "request_actor_mismatch",
  "permission_denied",
  "both_signs_required",
  "too_few_items",
  "too_many_items",
  "unsupported_debt",
  "camarim_leg_unsupported",
  "document_precision_unsupported",
  "cash_account_inconsistent",
  "no_open_debt",
  "invalid_document",
  "document_not_available",
  "forecast_not_available",
  "forecast_shared_no_creation",
  "forecast_link_denied",
  "event_closed",
  "sealed_settlement",
  "account_not_allowed",
  "reverse_entire_group",
  "managed_operation_required",
  "already_reversed",
  "group_not_found",
  "invalid_group_state",
  "reason_required",
  "installation_order",
  "document_values_not_editable",
  "invalid_movement",
  "amount_mismatch",
] as const;

export type OffsetErrorCode = (typeof OFFSET_ERROR_CODES)[number];

export const OFFSET_ERROR_MESSAGES: Record<OffsetErrorCode, string> = {
  encontro_desativado: "Encontros de contas estão temporariamente desativados.",
  encontro_em_conflito:
    "Outro utilizador está a alterar estes documentos. Recarregue a prévia e tente de novo.",
  preview_changed: "A dívida de um documento mudou desde a prévia. Recarregue.",
  request_changed: "Erro interno no pedido. Recomece a operação.",
  request_actor_mismatch: "Erro interno no pedido. Recomece a operação.",
  permission_denied: "Não tem permissão para esta operação.",
  both_signs_required: "Escolha pelo menos uma receita e uma despesa.",
  too_few_items: "Escolha pelo menos dois documentos.",
  too_many_items: "Máximo de 50 documentos por encontro.",
  unsupported_debt: "Este documento ainda não é suportado no encontro de contas.",
  camarim_leg_unsupported: "Este documento ainda não é suportado no encontro de contas.",
  document_precision_unsupported:
    "Este documento ainda não é suportado no encontro de contas.",
  cash_account_inconsistent:
    "A conta das pernas deste documento é inconsistente; corrija antes.",
  no_open_debt: "Este documento já não tem dívida em aberto.",
  invalid_document: "Documento inválido para o encontro de contas.",
  document_not_available: "Este documento já não está disponível. Recarregue a prévia.",
  forecast_not_available:
    "Esta linha do BP já não está disponível. Recarregue a prévia.",
  forecast_shared_no_creation:
    "Esta linha do BP é partilhada; não é possível criar pagamento por encontro.",
  forecast_link_denied: "Não é possível vincular esta linha do BP ao encontro.",
  event_closed: "O evento deste documento está fechado.",
  sealed_settlement: "O acerto deste evento está selado.",
  account_not_allowed: "Esta conta não pode ser usada no encontro de contas.",
  reverse_entire_group: "Esta perna faz parte de um encontro; estorne o encontro inteiro.",
  managed_operation_required:
    "Esta perna faz parte de um encontro; estorne o encontro inteiro.",
  already_reversed: "Este encontro já foi estornado.",
  group_not_found: "Encontro não encontrado.",
  invalid_group_state: "O estado deste encontro não permite a operação.",
  reason_required: "Indique o motivo.",
  installation_order: "Erro interno de instalação. Contacte o suporte.",
  document_values_not_editable: "Os valores deste documento não podem ser alterados.",
  invalid_movement: "O movimento tem de ter valor superior a zero.",
  amount_mismatch: "O total dos documentos não corresponde ao movimento.",
};

/** Mensagem pt-PT para um código do núcleo; código desconhecido -> genérica com o código. */
export function offsetErrorMessage(code: string): string {
  return (
    (OFFSET_ERROR_MESSAGES as Record<string, string>)[code] ??
    `Erro inesperado (${code}). Recomece a operação.`
  );
}

// ---------------------------------------------------------------------------
// Conversões euros <-> cêntimos (sem floats na aritmética do plano)
// ---------------------------------------------------------------------------

/** Converte euros (number) em cêntimos inteiros, arredondando ao cêntimo. */
export function eurosToCents(euros: number): number {
  if (!Number.isFinite(euros)) {
    throw new Error("eurosToCents: valor não finito");
  }
  return Math.round(euros * 100 + (euros >= 0 ? 1e-9 : -1e-9));
}

/** Converte cêntimos inteiros em euros (number), só para apresentação. */
export function centsToEuros(cents: number): number {
  if (!Number.isInteger(cents)) {
    throw new Error("centsToEuros: cêntimos têm de ser inteiros");
  }
  return cents / 100;
}

/**
 * Interpreta um montante textual pt-PT ("1.234,56", "1234,56", também "1234.56")
 * e devolve cêntimos inteiros. Devolve null quando o valor não é representável
 * com exactamente 2 casas decimais (ex.: "10,005", "abc").
 */
export function parseEuroAmount(text: string): number | null {
  if (typeof text !== "string") return null;
  let t = text.trim().replace(/[€\s]/g, "");
  if (t === "") return null;
  if (t.includes(",")) {
    // pt-PT: '.' milhar, ',' decimal
    t = t.replace(/\./g, "").replace(",", ".");
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  const negative = t.startsWith("-");
  const [intPart, decPart = ""] = negative ? t.slice(1).split(".") : t.split(".");
  const cents =
    parseInt(intPart, 10) * 100 + parseInt((decPart + "00").slice(0, 2), 10);
  return negative ? -cents : cents;
}

/** Formata cêntimos em pt-PT: 123456 -> "1.234,56 €"; 1 -> "0,01 €". */
export function formatEurCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error("formatEurCents: cêntimos têm de ser inteiros");
  }
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100);
  const decPart = abs % 100;
  const grouped = String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped},${String(decPart).padStart(2, "0")} €`;
}

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

export type OffsetMovementDirection = "in" | "out";
export type OffsetDocumentSign = "income" | "expense";
export type OffsetDocumentKind = "transaction" | "forecast";

export interface OffsetMovementInput {
  /** Valor absoluto do movimento (linha bancária), em cêntimos inteiros > 0. */
  amount_cents: number;
  /** 'in' = entrada de dinheiro (liquida receitas); 'out' = saída (liquida despesas). */
  direction: OffsetMovementDirection;
}

export interface OffsetDocumentInput {
  id: string;
  kind: OffsetDocumentKind;
  /** 'income' = receita (a receber); 'expense' = despesa (a pagar). */
  sign: OffsetDocumentSign;
  /** Dívida em aberto na prévia, em cêntimos inteiros > 0. */
  open_cents: number;
  /** Valor da dívida que o cliente viu na prévia; se diferir de open_cents -> preview_changed. */
  expected_open_cents?: number;
  /** Moeda; só EUR é suportado na 1.ª versão. Omissão = EUR. */
  currency?: string;
  /** Montante original em texto; se presente, tem de ter exactamente 2 casas e bater com open_cents. */
  open_amount_raw?: string;
  // Elegibilidade (1.ª versão: só dívidas simples)
  has_installments?: boolean;
  has_credit?: boolean;
  has_withholding?: boolean;
  has_fx?: boolean;
  leg_type?: "normal" | "camarim" | "reimbursement" | "card" | "aporte" | "shared_cost" | "transitory";
  event_closed?: boolean;
  settlement_sealed?: boolean;
  available?: boolean;
  shared_forecast?: boolean;
  link_denied?: boolean;
}

// ---------------------------------------------------------------------------
// Saídas
// ---------------------------------------------------------------------------

export interface OffsetPlanItem {
  document_id: string;
  kind: OffsetDocumentKind;
  sign: OffsetDocumentSign;
  /** 'settle' = mesmo sinal do movimento (recebe dinheiro); 'offset' = sinal oposto (só compensação). */
  mode: "settle" | "offset";
  open_cents: number;
  cash_cents: number;
  offset_cents: number;
  /** Posição na afectação do dinheiro (1-based) para itens 'settle'; null para 'offset'. */
  cash_order: number | null;
  expected_open_cents: number;
}

export interface OffsetContractItem {
  transaction_id?: string;
  forecast_id?: string;
  mode: "settle" | "offset";
  cash_order: number | null;
  expected_open_cents: number;
}

export interface OffsetPlanError {
  code: OffsetErrorCode;
  message: string;
  document_id?: string;
}

export interface OffsetPlanTotals {
  movement_cents: number;
  same_sign_open_cents: number;
  opposite_sign_open_cents: number;
  /** (soma mesmo sinal − soma sinal oposto) − movimento; tem de ser 0 para ok. */
  difference_cents: number;
  cash_cents: number;
  offset_settle_cents: number;
  offset_opposite_cents: number;
}

export interface OffsetPlanResult {
  ok: boolean;
  errors: OffsetPlanError[];
  warnings: string[];
  items: OffsetPlanItem[];
  /** Itens prontos para o contrato do núcleo; nunca amount/paid_amount/iva_rate. */
  contract_items: OffsetContractItem[];
  totals: OffsetPlanTotals | null;
}

export const OFFSET_PLAN_MIN_ITEMS = 2;
export const OFFSET_PLAN_MAX_ITEMS = 50;

// ---------------------------------------------------------------------------
// Função pura
// ---------------------------------------------------------------------------

/**
 * Constrói o plano de um encontro de contas.
 *
 * @param movement  valor absoluto e direcção do movimento de dinheiro, em cêntimos.
 * @param documents documentos seleccionados (receitas e despesas), com dívida em aberto.
 * @param cashOrder ids na ordem de afectação do dinheiro entre os itens 'settle';
 *                  ids omitidos entram no fim, pela ordem de `documents`.
 */
export function buildOffsetPlan(
  movement: OffsetMovementInput,
  documents: OffsetDocumentInput[],
  cashOrder?: string[],
): OffsetPlanResult {
  const empty = (errors: OffsetPlanError[]): OffsetPlanResult => ({
    ok: false,
    errors,
    warnings: [],
    items: [],
    contract_items: [],
    totals: null,
  });
  const err = (code: OffsetErrorCode, document_id?: string): OffsetPlanError => ({
    code,
    message: offsetErrorMessage(code),
    ...(document_id !== undefined ? { document_id } : {}),
  });

  // Movimento
  if (
    !movement ||
    !Number.isInteger(movement.amount_cents) ||
    movement.amount_cents <= 0 ||
    (movement.direction !== "in" && movement.direction !== "out")
  ) {
    return empty([err("invalid_movement")]);
  }

  // Limites de contagem
  if (documents.length < OFFSET_PLAN_MIN_ITEMS) return empty([err("too_few_items")]);
  if (documents.length > OFFSET_PLAN_MAX_ITEMS) return empty([err("too_many_items")]);

  // Ids duplicados
  const seen = new Set<string>();
  for (const d of documents) {
    if (seen.has(d.id)) return empty([err("invalid_document", d.id)]);
    seen.add(d.id);
  }

  // Os dois sinais são obrigatórios
  const hasIncome = documents.some((d) => d.sign === "income");
  const hasExpense = documents.some((d) => d.sign === "expense");
  if (!hasIncome || !hasExpense) return empty([err("both_signs_required")]);

  // Elegibilidade espelhada (recolhe todos os motivos)
  const errors: OffsetPlanError[] = [];
  for (const d of documents) {
    if (d.expected_open_cents !== undefined && d.expected_open_cents !== d.open_cents) {
      errors.push(err("preview_changed", d.id));
    }
    if (d.available === false) {
      errors.push(err(d.kind === "forecast" ? "forecast_not_available" : "document_not_available", d.id));
    }
    if (!Number.isInteger(d.open_cents)) {
      errors.push(err("invalid_document", d.id));
    } else if (d.open_cents <= 0) {
      errors.push(err("no_open_debt", d.id));
    }
    if (d.currency !== undefined && d.currency !== "EUR") {
      errors.push(err("unsupported_debt", d.id));
    }
    if (d.open_amount_raw !== undefined) {
      const parsed = parseEuroAmount(d.open_amount_raw);
      if (parsed === null) {
        errors.push(err("document_precision_unsupported", d.id));
      } else if (Number.isInteger(d.open_cents) && parsed !== d.open_cents) {
        errors.push(err("invalid_document", d.id));
      }
    }
    if (d.has_installments || d.has_credit || d.has_withholding || d.has_fx) {
      errors.push(err("unsupported_debt", d.id));
    }
    if (d.leg_type !== undefined && d.leg_type !== "normal") {
      errors.push(err(d.leg_type === "camarim" ? "camarim_leg_unsupported" : "unsupported_debt", d.id));
    }
    if (d.event_closed) errors.push(err("event_closed", d.id));
    if (d.settlement_sealed) errors.push(err("sealed_settlement", d.id));
    if (d.kind === "forecast" && d.shared_forecast) {
      errors.push(err("forecast_shared_no_creation", d.id));
    }
    if (d.link_denied) errors.push(err("forecast_link_denied", d.id));
  }
  if (errors.length > 0) return empty(errors);

  // Igualdade exacta: (mesmo sinal − sinal oposto) = valor absoluto do movimento
  const settleSign: OffsetDocumentSign = movement.direction === "in" ? "income" : "expense";
  const sameSum = documents
    .filter((d) => d.sign === settleSign)
    .reduce((acc, d) => acc + d.open_cents, 0);
  const oppositeSum = documents
    .filter((d) => d.sign !== settleSign)
    .reduce((acc, d) => acc + d.open_cents, 0);
  const difference = sameSum - oppositeSum - movement.amount_cents;
  if (difference !== 0) {
    const message =
      difference < 0
        ? `Faltam ${formatEurCents(-difference)}`
        : `Excedem ${formatEurCents(difference)}; corrija a transação ou o BP`;
    return empty([{ code: "amount_mismatch", message }]);
  }

  // Ordem de afectação do dinheiro entre os itens 'settle'
  const settleDocs = documents.filter((d) => d.sign === settleSign);
  const rank = new Map<string, number>();
  cashOrder?.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i);
  });
  const orderedSettle = [...settleDocs].sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return documents.indexOf(a) - documents.indexOf(b);
  });

  // Alocação do dinheiro
  let remaining = movement.amount_cents;
  const cashById = new Map<string, number>();
  orderedSettle.forEach((d, i) => {
    const cash = Math.min(d.open_cents, remaining);
    remaining -= cash;
    cashById.set(d.id, cash);
    rank.set(d.id, i + 1); // cash_order final, 1-based
  });

  const items: OffsetPlanItem[] = documents.map((d) => {
    const isSettle = d.sign === settleSign;
    const cash = isSettle ? (cashById.get(d.id) ?? 0) : 0;
    return {
      document_id: d.id,
      kind: d.kind,
      sign: d.sign,
      mode: isSettle ? ("settle" as const) : ("offset" as const),
      open_cents: d.open_cents,
      cash_cents: cash,
      offset_cents: d.open_cents - cash,
      cash_order: isSettle ? (rank.get(d.id) ?? null) : null,
      expected_open_cents: d.open_cents,
    };
  });

  const offsetSettle = items
    .filter((it) => it.mode === "settle")
    .reduce((acc, it) => acc + it.offset_cents, 0);
  const offsetOpposite = items
    .filter((it) => it.mode === "offset")
    .reduce((acc, it) => acc + it.offset_cents, 0);

  const warnings: string[] = [];
  if (remaining !== 0 || offsetSettle !== offsetOpposite) {
    // Inalcançável pela igualdade exacta acima; defesa contra regressões.
    warnings.push("A compensação dos dois lados não fecha; recuse a operação.");
    return empty([err("amount_mismatch")]);
  }

  const contract_items: OffsetContractItem[] = items.map((it) => ({
    ...(it.kind === "transaction" ? { transaction_id: it.document_id } : { forecast_id: it.document_id }),
    mode: it.mode,
    cash_order: it.cash_order,
    expected_open_cents: it.expected_open_cents,
  }));

  return {
    ok: true,
    errors: [],
    warnings,
    items,
    contract_items,
    totals: {
      movement_cents: movement.amount_cents,
      same_sign_open_cents: sameSum,
      opposite_sign_open_cents: oppositeSum,
      difference_cents: difference,
      cash_cents: movement.amount_cents,
      offset_settle_cents: offsetSettle,
      offset_opposite_cents: offsetOpposite,
    },
  };
}
