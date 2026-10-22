/**
 * #337 fase 3a — prévia do encontro de contas FORA do banco (porta Lançamento).
 *
 * Movimento de dinheiro opcional:
 *  - com dinheiro: conta + data + valor + direcção → reutiliza buildOffsetPlan;
 *  - sem dinheiro ("encontro puro"): receitas e despesas em aberto têm de ser iguais;
 *    todos os itens vão em modo 'offset' sem cash_order (regra do núcleo para amount=0).
 *
 * Contrato do núcleo (supabase/manual/20261021_issue335_offset_core.INERTE.sql,
 * transaction_offset_execute): p_movement = null | { account_id, date, amount } com
 * amount ≠ 0, 2 casas, sinal = direcção (positivo entra → liquida receitas; negativo sai
 * → liquida despesas) e movement.date = p_date. Função pura; sem Supabase.
 */
import {
  buildOffsetPlan,
  formatEurCents,
  offsetErrorMessage,
  OFFSET_PLAN_MAX_ITEMS,
  OFFSET_PLAN_MIN_ITEMS,
  type OffsetContractItem,
  type OffsetDocumentInput,
  type OffsetMovementDirection,
  type OffsetPlanItem,
  type OffsetPlanResult,
} from "./index";

export interface LaunchMoneyInput {
  account_id: string;
  /** YYYY-MM-DD (data local de Lisboa). */
  date: string;
  amount_cents: number;
  direction: OffsetMovementDirection;
}

export interface LaunchMovementPayload {
  account_id: string;
  date: string;
  amount: number;
}

/** p_movement exacto para o núcleo (null = sem movimento de dinheiro). */
export function buildLaunchMovement(money: LaunchMoneyInput | null): LaunchMovementPayload | null {
  if (!money) return null;
  const signed = money.direction === "in" ? money.amount_cents : -money.amount_cents;
  return { account_id: money.account_id, date: money.date, amount: signed / 100 };
}

/** Validação do passo "Dinheiro"; devolve mensagem pt-PT ou null. */
export function validateLaunchMoney(money: LaunchMoneyInput | null, today: string): string | null {
  if (!money) return null;
  if (!money.account_id) return "Escolha a conta do movimento de dinheiro.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(money.date ?? "")) return "Indique a data do movimento.";
  if (money.date > today) return "A data do movimento não pode ser futura.";
  if (!Number.isInteger(money.amount_cents) || money.amount_cents <= 0) return offsetErrorMessage("invalid_movement");
  if (money.direction !== "in" && money.direction !== "out") return offsetErrorMessage("invalid_movement");
  return null;
}

/** Prévia com movimento opcional. */
export function buildLaunchOffsetPlan(
  money: LaunchMoneyInput | null,
  documents: OffsetDocumentInput[],
  cashOrder?: string[],
): OffsetPlanResult {
  if (money) {
    return buildOffsetPlan({ amount_cents: money.amount_cents, direction: money.direction }, documents, cashOrder);
  }
  // Encontro puro: reutiliza as validações de buildOffsetPlan com um movimento fictício
  // e substitui apenas a igualdade (receitas = despesas).
  const fail = (code: Parameters<typeof offsetErrorMessage>[0], message?: string): OffsetPlanResult => ({
    ok: false,
    errors: [{ code: code as any, message: message ?? offsetErrorMessage(code) }],
    warnings: [],
    items: [],
    contract_items: [],
    totals: null,
  });
  if (documents.length < OFFSET_PLAN_MIN_ITEMS) return fail("too_few_items");
  if (documents.length > OFFSET_PLAN_MAX_ITEMS) return fail("too_many_items");
  const income = documents.filter((d) => d.sign === "income").reduce((a, d) => a + d.open_cents, 0);
  const expense = documents.filter((d) => d.sign === "expense").reduce((a, d) => a + d.open_cents, 0);
  // Validações de elegibilidade/sinais: plano auxiliar com movimento = diferença real (ou 1 cêntimo).
  const probe = buildOffsetPlan({ amount_cents: Math.max(1, Math.abs(income - expense)), direction: income >= expense ? "in" : "out" }, documents);
  if (!probe.ok && probe.errors.some((e) => e.code !== "amount_mismatch")) return probe;
  if (income !== expense) {
    const diff = income - expense;
    return fail(
      "amount_mismatch",
      diff > 0
        ? `Sem dinheiro, receitas e despesas têm de ser iguais: receitas excedem ${formatEurCents(diff)}`
        : `Sem dinheiro, receitas e despesas têm de ser iguais: despesas excedem ${formatEurCents(-diff)}`,
    );
  }
  const items: OffsetPlanItem[] = documents.map((d) => ({
    document_id: d.id,
    kind: d.kind,
    sign: d.sign,
    mode: "offset",
    open_cents: d.open_cents,
    cash_cents: 0,
    offset_cents: d.open_cents,
    cash_order: null,
    expected_open_cents: d.open_cents,
  }));
  const contract_items: OffsetContractItem[] = items.map((it) => ({
    ...(it.kind === "transaction" ? { transaction_id: it.document_id } : { forecast_id: it.document_id }),
    mode: "offset",
    cash_order: null,
    expected_open_cents: it.expected_open_cents,
  }));
  return {
    ok: true,
    errors: [],
    warnings: [],
    items,
    contract_items,
    totals: {
      movement_cents: 0,
      same_sign_open_cents: income,
      opposite_sign_open_cents: expense,
      difference_cents: 0,
      cash_cents: 0,
      offset_settle_cents: income,
      offset_opposite_cents: expense,
    },
  };
}
