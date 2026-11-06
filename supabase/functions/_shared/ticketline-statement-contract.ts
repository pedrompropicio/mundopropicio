/** Pure v2 document contract. No IO, activation, financial writes or legacy coercion.
 * Callers must resolve company/account ownership, account type, chain and admin
 * identity on the server. This module validates only the supplied evidence.
 */
export const TICKETLINE_STATEMENT_CONTRACT_VERSION = 2 as const;
export const TICKET_OFFICE_STATEMENTS_V2_FEATURE = "ticket-office-statements-v2";
export const TICKETLINE_STATEMENT_LINE_TYPES = [
  "event_sales", "ticketline_invoice", "venue_settlement", "advance", "carry_over", "opening_balance",
] as const;
export type TicketlineStatementLineType = typeof TICKETLINE_STATEMENT_LINE_TYPES[number];

export interface TicketOfficeStatementsV2Config {
  accounts: readonly {
    financial_account_id: string;
    enabled: boolean;
    contract_version: typeof TICKETLINE_STATEMENT_CONTRACT_VERSION;
  }[];
}

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const identity = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v === v.trim();
const absent = (v: unknown) => v === undefined || v === null;

/** All omissions, malformed entries, duplicates and read errors disable v2.
 * Config is company_features.config; feature is the already company-scoped row.
 * Audit/ownership checks belong to the future server configuration writer.
 */
export function isTicketOfficeStatementsV2Enabled(input: {
  feature?: unknown;
  config?: unknown;
  financialAccountId?: unknown;
  readError?: unknown;
}): boolean {
  try {
    if (!input || !absent(input.readError) || !identity(input.financialAccountId)
      || !record(input.feature) || input.feature.feature_key !== TICKET_OFFICE_STATEMENTS_V2_FEATURE
      || input.feature.enabled !== true || !record(input.config) || !Array.isArray(input.config.accounts)) return false;
    const ids = new Set<string>();
    let enabled = false;
    for (const account of input.config.accounts) {
      if (!record(account) || !identity(account.financial_account_id) || typeof account.enabled !== "boolean"
        || account.contract_version !== TICKETLINE_STATEMENT_CONTRACT_VERSION || ids.has(account.financial_account_id)) return false;
      ids.add(account.financial_account_id);
      if (account.financial_account_id === input.financialAccountId) enabled = account.enabled;
    }
    return enabled;
  } catch {
    return false;
  }
}

export class TicketlineStatementContractError extends Error {
  constructor(public readonly code: string, public readonly path: string) {
    super(`${code}: ${path}`);
    this.name = "TicketlineStatementContractError";
  }
}

function requireContract(condition: boolean, code: string, path: string): asserts condition {
  if (!condition) throw new TicketlineStatementContractError(code, path);
}

function cents(value: unknown, path: string): asserts value is number {
  requireContract(typeof value === "number" && Number.isSafeInteger(value), "invalid_cents", path);
}

function safeCents(value: bigint, path: string): number {
  const result = Number(value);
  cents(result, path);
  return result;
}

/** Decimal units -> integer cents, before persistence/coercion. No rounding,
 * tolerance or floating point multiplication; decimal text retains precision.
 * Numeric inputs cannot preserve lexical trailing zeroes; use text at ingress.
 */
export function parseTicketlineStatementAmountCents(value: unknown): number {
  requireContract(typeof value === "string" || (typeof value === "number" && Number.isFinite(value)),
    "invalid_decimal", "amount");
  const text = String(value);
  requireContract(/^-?\d+(?:\.\d{1,2})?$/.test(text), "invalid_decimal", "amount");
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return safeCents(negative ? -result : result, "amount");
}

interface LineBase {
  id: string;
  amount_cents: number;
  event_id?: string | null;
  quota_line_id?: string | null;
  ticket_office_settlement_id?: string | null;
  transaction_id?: string | null;
  invoice_group_id?: string | null;
  previous_statement_id?: string | null;
  adjusts_statement_id?: string | null;
  adjusts_line_id?: string | null;
  adjustment_reason?: string | null;
  /** Positive invoices/acertos require documentary evidence of that sign. */
  positive_sign_evidence?: string | null;
}

export interface TicketlineOpeningBalance {
  note: string;
  created_by: string;
  created_at: string;
  admin_approval: { approved: true; approved_by: string; approved_at: string };
}

export type TicketlineStatementLine = LineBase & (
  | { document_line_type: "event_sales"; event_id: string; event_gross_cents: number;
      event_retained_cents: number; declared_event_net_cents: number }
  | { document_line_type: "ticketline_invoice" | "venue_settlement" }
  | { document_line_type: "advance"; transaction_id: string }
  | { document_line_type: "carry_over"; previous_statement_id: string }
  | { document_line_type: "opening_balance"; opening: TicketlineOpeningBalance }
);

export interface TicketlineStatement {
  contract_version: typeof TICKETLINE_STATEMENT_CONTRACT_VERSION;
  id: string;
  financial_account_id: string;
  predecessor_statement_id: string | null;
  document_total_cents: number;
  lines: readonly TicketlineStatementLine[];
}

/** Authoritative chain/membership context supplied by the caller, never inferred
 * from a missing predecessor or an enabled feature. Persistent concurrency and
 * one-time opening enforcement remain server responsibilities in later runs.
 */
export interface TicketlineStatementContext {
  is_first_statement: boolean;
  confirmed_event_ids: readonly string[];
}

export interface TicketlineStatementReconciliation {
  contract_version: typeof TICKETLINE_STATEMENT_CONTRACT_VERSION;
  total_cents: number;
  event_quotas: { event_id: string; quota_line_id: string; amount_cents: number }[];
}

function noFields(line: Record<string, unknown>, fields: readonly string[], path: string) {
  for (const field of fields) requireContract(absent(line[field]), "forbidden_reference", `${path}.${field}`);
}

function timestamp(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

/** Validate a complete documentary proposal, returning only reconciled cents.
 * Unknown/legacy versions are rejected; this does not confirm a statement.
 */
export function validateTicketlineStatement(input: unknown, context: TicketlineStatementContext): TicketlineStatementReconciliation {
  requireContract(record(input), "invalid_statement", "statement");
  requireContract(input.contract_version === TICKETLINE_STATEMENT_CONTRACT_VERSION, "invalid_version", "contract_version");
  requireContract(identity(input.id) && identity(input.financial_account_id), "invalid_identity", "statement");
  requireContract(record(context) && typeof context.is_first_statement === "boolean"
    && Array.isArray(context.confirmed_event_ids) && context.confirmed_event_ids.every(identity), "invalid_context", "context");
  requireContract(context.is_first_statement ? input.predecessor_statement_id === null
    : identity(input.predecessor_statement_id) && input.predecessor_statement_id !== input.id,
  "invalid_predecessor", "predecessor_statement_id");
  cents(input.document_total_cents, "document_total_cents");
  requireContract(Array.isArray(input.lines) && input.lines.length > 0, "invalid_lines", "lines");

  const lines = new Map<string, Record<string, unknown>>();
  const events = new Set(context.confirmed_event_ids);
  const quotas = new Map<string, { event_id: string; amount: bigint; declared: number }>();
  const quotaDeductions = new Map<string, bigint>();
  let total = 0n;
  let openings = 0;
  let carries = 0;
  for (const [index, line] of input.lines.entries()) {
    const path = `lines[${index}]`;
    requireContract(record(line), "invalid_line", path);
    requireContract(identity(line.id) && !lines.has(line.id), "duplicate_or_invalid_line", `${path}.id`);
    lines.set(line.id, line);
    requireContract(TICKETLINE_STATEMENT_LINE_TYPES.includes(line.document_line_type as TicketlineStatementLineType), "invalid_line_type", path);
    cents(line.amount_cents, `${path}.amount_cents`);
    total += BigInt(line.amount_cents);
    for (const field of ["event_id", "quota_line_id", "ticket_office_settlement_id", "transaction_id", "invoice_group_id",
      "previous_statement_id", "adjusts_statement_id", "adjusts_line_id"]) {
      requireContract(absent(line[field]) || identity(line[field]), "invalid_reference", `${path}.${field}`);
    }
    requireContract(absent(line.pending_document) || line.pending_document === false, "pending_document", path);
    if (!absent(line.adjusts_statement_id) || !absent(line.adjusts_line_id)) {
      requireContract((line.document_line_type === "ticketline_invoice" || line.document_line_type === "venue_settlement")
        && identity(line.adjusts_statement_id) && line.adjusts_statement_id !== input.id
        && identity(line.adjusts_line_id) && identity(line.adjustment_reason) && absent(line.quota_line_id), "invalid_adjustment", path);
    }
    if (line.document_line_type !== "event_sales") {
      noFields(line, ["event_gross_cents", "event_retained_cents", "declared_event_net_cents"], path);
    }
    if (line.document_line_type !== "opening_balance") noFields(line, ["opening"], path);
    switch (line.document_line_type) {
      case "event_sales": {
        requireContract(identity(line.event_id) && !events.has(line.event_id), "duplicate_or_invalid_event", `${path}.event_id`);
        events.add(line.event_id);
        noFields(line, ["quota_line_id", "transaction_id", "invoice_group_id", "previous_statement_id"], path);
        cents(line.event_gross_cents, `${path}.event_gross_cents`);
        cents(line.event_retained_cents, `${path}.event_retained_cents`);
        cents(line.declared_event_net_cents, `${path}.declared_event_net_cents`);
        requireContract(line.event_gross_cents >= 0 && line.event_retained_cents >= 0
          && line.event_retained_cents <= line.event_gross_cents && line.amount_cents >= 0, "invalid_sign", path);
        requireContract(BigInt(line.amount_cents) === BigInt(line.event_gross_cents) - BigInt(line.event_retained_cents), "sales_mismatch", path);
        quotas.set(line.id, { event_id: line.event_id, amount: BigInt(line.amount_cents), declared: line.declared_event_net_cents });
        break;
      }
      case "ticketline_invoice":
      case "venue_settlement": {
        noFields(line, ["previous_statement_id", "ticket_office_settlement_id"], path);
        const transaction = identity(line.transaction_id);
        const group = identity(line.invoice_group_id);
        requireContract(line.document_line_type === "ticketline_invoice" ? transaction !== group : !(transaction && group), "invalid_invoice_source", path);
        requireContract(line.amount_cents <= 0 || identity(line.positive_sign_evidence), "invalid_sign", path);
        if (identity(line.quota_line_id)) {
          requireContract(identity(line.event_id), "invalid_quota_reference", path);
          quotaDeductions.set(line.quota_line_id, (quotaDeductions.get(line.quota_line_id) ?? 0n) + BigInt(line.amount_cents));
        }
        break;
      }
      case "advance":
        requireContract(line.amount_cents < 0, "invalid_sign", path);
        requireContract(identity(line.transaction_id), "invalid_advance_source", path);
        noFields(line, ["event_id", "quota_line_id", "ticket_office_settlement_id", "invoice_group_id", "previous_statement_id"], path);
        break;
      case "carry_over":
        requireContract(!context.is_first_statement && ++carries === 1
          && line.previous_statement_id === input.predecessor_statement_id, "invalid_carry_over", path);
        noFields(line, ["event_id", "quota_line_id", "ticket_office_settlement_id", "transaction_id", "invoice_group_id"], path);
        break;
      case "opening_balance": {
        requireContract(context.is_first_statement && ++openings === 1, "invalid_opening_position", path);
        noFields(line, ["event_id", "quota_line_id", "ticket_office_settlement_id", "transaction_id", "invoice_group_id", "previous_statement_id"], path);
        const opening = line.opening;
        requireContract(record(opening) && identity(opening.note) && identity(opening.created_by)
          && timestamp(opening.created_at) && record(opening.admin_approval) && opening.admin_approval.approved === true
          && identity(opening.admin_approval.approved_by) && timestamp(opening.admin_approval.approved_at), "invalid_opening_evidence", path);
        break;
      }
    }
  }
  // Resolve after collecting all lines: document order cannot affect quotas.
  for (const [id, line] of lines) {
    if (!identity(line.quota_line_id)) continue;
    const quota = quotas.get(line.quota_line_id);
    requireContract(!!quota && quota.event_id === line.event_id && line.quota_line_id !== id, "invalid_quota_reference", id);
  }
  const event_quotas = [...quotas].map(([id, quota]) => {
    const amount = quota.amount + (quotaDeductions.get(id) ?? 0n);
    requireContract(amount === BigInt(quota.declared), "quota_mismatch", id);
    return { event_id: quota.event_id, quota_line_id: id, amount_cents: safeCents(amount, id) };
  });
  const total_cents = safeCents(total, "total_cents");
  requireContract(total_cents === input.document_total_cents, "document_total_mismatch", "document_total_cents");
  return { contract_version: TICKETLINE_STATEMENT_CONTRACT_VERSION, total_cents, event_quotas };
}
