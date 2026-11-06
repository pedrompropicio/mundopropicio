/** #644b B2: read-only contract of 0344. No loading, financial calculation or defaults.
 * A caller supplies one revision and its historical seal references, already read in
 * the same authorised operation. This checks the supplied identities, not database
 * ownership, ACLs, receipt existence or the digest against the original seal bytes.
 */
import { z } from "npm:zod@3";

export const EVENT_RESULT_SCHEMA_VERSION = 1;
export const EVENT_RESULT_CRITERION_VERSION = 1;
export const EVENT_RESULT_REVENUE_POLICY_VERSION = 1;

export type BasisJson = null | boolean | number | string | BasisJson[] | { [key: string]: BasisJson };
export type BasisEvidence = { [key: string]: BasisJson };
const json: z.ZodType<BasisJson> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json),
]));
const object = z.record(json);
const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const timestamp = z.string().datetime({ offset: true }).refine(v => Number.isFinite(Date.parse(v)), "invalid_timestamp");
const version = (name: string) => z.literal(1, { errorMap: () => ({ message: `unsupported_${name}` }) });

/** PostgreSQL timestamps retain microseconds; Date.parse alone would lose that order. */
function timestampAfter(left: string, right: string): boolean {
  const l = Date.parse(left), r = Date.parse(right);
  if (l !== r) return l > r;
  const tail = (value: string) => (/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/.exec(value)?.[1] ?? "").slice(3);
  const a = tail(left), b = tail(right), length = Math.max(a.length, b.length);
  return a.padEnd(length, "0") > b.padEnd(length, "0");
}

/** These are exactly the nullable, evidenced fields checked by validate_closure in 0344.
 * A missing BP reference means no final BP; it is not an unknown financial criterion.
 */
export const EVENT_RESULT_BASIS_FIELDS = [
  "criterion_version", "criterion_sha256", "closed_by", "budget_mode_resolved", "budget_mode_source",
  "expense_source", "expense_source_original", "cost_include_overhead", "partner_calc_basis",
  "result_revenue_vat_basis", "result_expense_vat_basis", "revenue_policy", "revenue_policy_version",
  "revenue_include_overhead", "result_origin",
] as const;
export type EventResultBasisField = typeof EVENT_RESULT_BASIS_FIELDS[number];

const basisShape = {
  criterion_version: version("criterion_version").nullable(),
  criterion_sha256: sha256.nullable(),
  closed_by: uuid.nullable(),
  budget_mode_resolved: z.enum(["with_bp", "without_bp"]).nullable(),
  budget_mode_source: z.enum(["event", "company", "platform_default"]).nullable(),
  expense_source: z.enum(["realized", "committed"]).nullable(),
  expense_source_original: z.enum(["realized", "committed"]).nullable(),
  cost_include_overhead: z.boolean().nullable(),
  partner_calc_basis: z.enum(["net_result", "net_result_gross_expenses", "gross_revenue"]).nullable(),
  result_revenue_vat_basis: z.literal("net").nullable(),
  result_expense_vat_basis: z.enum(["net", "gross", "excluded"]).nullable(),
  revenue_policy: z.enum(["real_then_bp_by_bucket", "real_only"]).nullable(),
  revenue_policy_version: version("revenue_policy_version").nullable(),
  revenue_include_overhead: z.literal(false).nullable(),
  result_origin: z.enum(["seal_snapshot", "canonical_current_inputs"]).nullable(),
};
const basisValuesSchema = z.object(basisShape).strict();
type BasisValues = Required<z.infer<typeof basisValuesSchema>>;
function issue(ctx: z.RefinementCtx, path: string[], message: string) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}
function checkCoherence(b: Partial<BasisValues>, ctx: z.RefinementCtx) {
  if (b.budget_mode_resolved === "without_bp" && b.expense_source != null && b.expense_source !== "realized") {
    issue(ctx, ["expense_source"], "without_bp_requires_realized");
  }
  if (b.budget_mode_resolved != null && b.revenue_policy != null &&
    b.revenue_policy !== (b.budget_mode_resolved === "without_bp" ? "real_only" : "real_then_bp_by_bucket")) {
    issue(ctx, ["revenue_policy"], "budget_mode_revenue_policy_mismatch");
  }
  if (b.partner_calc_basis != null && b.result_expense_vat_basis != null) {
    const expected = { net_result: "net", net_result_gross_expenses: "gross", gross_revenue: "excluded" };
    if (b.result_expense_vat_basis !== expected[b.partner_calc_basis]) {
      issue(ctx, ["result_expense_vat_basis"], "partner_calc_basis_vat_mismatch");
    }
  }
}

/** All columns of public.event_result_closures, with explicit nulls and no coercion. */
export const EventResultClosureSchema = z.object({
  id: uuid, company_id: uuid, event_id: uuid, closure_root_event_id: uuid, root_closure_id: uuid,
  revision: z.number().int().positive().max(2147483647), closed_at: timestamp,
  captured_at: timestamp, captured_by: uuid,
  capture_kind: z.enum(["close_event", "legacy_reconstruction", "legacy_confirmation"]),
  schema_version: version("schema_version"),
  basis_status: z.enum(["recorded", "reconstructed", "unknown"]),
  ...basisShape,
  final_bp_version_id: uuid.nullable(), perimeter_kind: z.enum(["event", "city", "family"]),
  field_evidence: object, unknown_fields: z.array(z.enum(EVENT_RESULT_BASIS_FIELDS)), provenance: object,
  previous_closure_id: uuid.nullable(), confirmation_receipt_id: uuid.nullable(),
}).strict().superRefine((row, ctx) => {
  const missing = EVENT_RESULT_BASIS_FIELDS.filter(f => row[f] === null);
  if (new Set(row.unknown_fields).size !== row.unknown_fields.length || missing.length !== row.unknown_fields.length ||
    missing.some(f => !row.unknown_fields.includes(f))) {
    issue(ctx, ["unknown_fields"], "unknown_fields_mismatch");
  }
  for (const field of EVENT_RESULT_BASIS_FIELDS) {
    const evidence = row.field_evidence[field];
    if (row[field] !== null && (evidence === null || typeof evidence !== "object" || Array.isArray(evidence) ||
      Object.keys(evidence).length === 0)) {
      issue(ctx, ["field_evidence", field], "field_evidence_missing");
    }
  }
  if ((row.basis_status === "unknown") !== (missing.length > 0)) {
    issue(ctx, ["basis_status"], "unknown_status_mismatch");
  }
  if (row.capture_kind === "close_event" && (row.basis_status !== "recorded" || row.closed_by === null ||
    row.captured_by !== row.closed_by || missing.length > 0 || row.confirmation_receipt_id !== null)) {
    issue(ctx, ["capture_kind"], "invalid_recorded_capture");
  }
  if (row.capture_kind === "legacy_reconstruction" && (row.basis_status === "recorded" || row.confirmation_receipt_id !== null)) {
    issue(ctx, ["capture_kind"], "invalid_legacy_reconstruction");
  }
  if (row.capture_kind === "legacy_confirmation" && (row.basis_status !== "reconstructed" ||
    row.previous_closure_id === null || row.confirmation_receipt_id === null || missing.length > 0)) {
    issue(ctx, ["capture_kind"], "invalid_legacy_confirmation");
  }
  const root = row.event_id === row.closure_root_event_id;
  if (root ? row.root_closure_id !== row.id || row.perimeter_kind === "city"
    : row.root_closure_id === row.id || row.perimeter_kind !== "city") {
    issue(ctx, ["perimeter_kind"], "root_shape_mismatch");
  }
  if (row.previous_closure_id === row.id) issue(ctx, ["previous_closure_id"], "previous_closure_is_self");
  checkCoherence(row, ctx);
});
export type EventResultClosureRow = Required<z.infer<typeof EventResultClosureSchema>>;

/** Historical references, not the current mutable settlement metadata. */
export const EventResultClosureSealSchema = z.object({
  closure_id: uuid, company_id: uuid, event_id: uuid, settlement_id: uuid, sealed_at: timestamp,
  seal_schema_version: version("seal_schema_version"), seal_sha256: sha256,
  bp_version_id: uuid.nullable(), node_basis_evidence: object,
}).strict();
export type EventResultClosureSealRow = Required<z.infer<typeof EventResultClosureSealSchema>>;

export const EventResultClosureLogSchema = z.object({
  id: uuid, closure_id: uuid, company_id: uuid, event_id: uuid,
  action: z.enum(["closed", "reopened", "legacy_reopened", "reconstructed", "confirmed"]),
  occurred_at: timestamp, performed_by: uuid, reason: z.string().refine(v => v.trim().length > 0),
  evidence: object, replacement_closure_id: uuid.nullable(),
}).strict().superRefine((row, ctx) => {
  if (row.action === "confirmed" ? row.replacement_closure_id === null || row.replacement_closure_id === row.closure_id
    : row.replacement_closure_id !== null) issue(ctx, ["replacement_closure_id"], "confirmation_replacement_mismatch");
});
export type EventResultClosureLogRow = Required<z.infer<typeof EventResultClosureLogSchema>>;
export const EventResultClosureActiveSchema = z.object({
  event_id: uuid, company_id: uuid, closure_id: uuid, activation_receipt_id: uuid,
}).strict();
export type EventResultClosureActiveRow = Required<z.infer<typeof EventResultClosureActiveSchema>>;

/** The v1 seal format is separate from the criterion/schema versions of the revision.
 * Validate the entire supplied v1, but extract only the two criteria it actually proves.
 * Participant VAT/overhead contracts are not event-result criteria.
 */
const amount = z.number().finite();
export const EventResultSealSnapshotSchema = z.object({
  version: version("seal_snapshot_version"), settlement_id: uuid, check1: amount, check2: amount,
  basis: z.object({ expenseSource: z.enum(["realized", "committed"]), includeOverhead: z.boolean() }).strict(),
  eventNetResult: amount, partnersPaidTotal: amount,
  nodes: z.array(z.object({
    id: uuid, name: z.string(), parentId: uuid.nullable(), parentQuota: amount.nullable(),
    parentSharePct: amount.nullable(), parentQuotaBasis: z.string().nullable(),
    resultNet: amount, resultGross: amount, moneyNet: amount,
    participants: z.array(z.object({
      id: uuid, name: z.string(), kind: z.enum(["house", "partner"]), mode: z.enum(["settles", "nominal"]),
      effectivePct: amount, share: amount, shareNet: amount, settlementAmount: amount,
    }).strict()),
  }).strict()).min(1),
}).strict().superRefine((seal, ctx) => {
  const nodes = new Map(seal.nodes.map(n => [n.id, n]));
  if (nodes.size !== seal.nodes.length || !nodes.has(seal.settlement_id)) {
    issue(ctx, ["nodes"], "seal_subtree_identity_mismatch");
  }
  for (const node of seal.nodes) {
    const seen = new Set<string>();
    let current: typeof node | undefined = node;
    while (current && current.id !== seal.settlement_id && !seen.has(current.id)) {
      seen.add(current.id);
      current = current.parentId === null ? undefined : nodes.get(current.parentId);
    }
    if (!current || seen.has(current.id) || (node.id === seal.settlement_id && node.parentId !== null && nodes.has(node.parentId))) {
      issue(ctx, ["nodes"], "seal_subtree_mismatch");
      break;
    }
  }
});
export const EventResultSealInputSchema = z.object({
  reference: EventResultClosureSealSchema, snapshot: EventResultSealSnapshotSchema,
}).strict();
export type EventResultSealInput = Required<z.infer<typeof EventResultSealInputSchema>>;

export const EventResultBasisInputSchema = z.object({
  company_id: uuid, event_id: uuid, closure: EventResultClosureSchema.nullable(),
  seals: z.array(EventResultSealInputSchema),
}).strict().superRefine((input, ctx) => {
  const row = input.closure;
  if (!row) {
    if (input.seals.length) issue(ctx, ["seals"], "seal_requires_closure_revision");
    return;
  }
  if (input.company_id !== row.company_id || input.event_id !== row.event_id) {
    issue(ctx, ["closure"], "closure_scope_mismatch");
  }
  if ((row.result_origin === "seal_snapshot") !== (input.seals.length > 0)) {
    issue(ctx, ["seals"], "seal_origin_mismatch");
  }
  const seen = new Set<string>();
  const first = input.seals[0]?.snapshot;
  const parents = new Map<string, string | null>();
  for (const { reference: ref, snapshot } of input.seals) {
    if (ref.company_id !== row.company_id || ref.event_id !== row.event_id || ref.closure_id !== row.id ||
      ref.settlement_id !== snapshot.settlement_id || ref.seal_schema_version !== snapshot.version) {
      issue(ctx, ["seals"], "seal_scope_mismatch");
    }
    if (timestampAfter(ref.sealed_at, row.closed_at)) issue(ctx, ["seals"], "seal_after_closure");
    if (seen.has(ref.settlement_id)) issue(ctx, ["seals"], "duplicate_seal_reference");
    seen.add(ref.settlement_id);
    if (first && (snapshot.basis.expenseSource !== first.basis.expenseSource ||
      snapshot.basis.includeOverhead !== first.basis.includeOverhead || snapshot.eventNetResult !== first.eventNetResult)) {
      issue(ctx, ["seals"], "conflicting_seal_snapshots");
    }
    for (const node of snapshot.nodes) {
      if (parents.has(node.id) && parents.get(node.id) !== node.parentId) issue(ctx, ["seals"], "conflicting_seal_subtrees");
      parents.set(node.id, node.parentId);
    }
  }
  if (first) checkCoherence({ ...row, expense_source: first.basis.expenseSource }, ctx);
});

export type ResolvedBasisField<T> =
  | { status: "known"; value: Exclude<T, null>; source: "seal_snapshot" | "closure_revision"; evidence: BasisEvidence }
  | { status: "unknown"; value: null; source: "unknown"; evidence: null };
export type ResolvedEventResultFields = { [K in EventResultBasisField]: ResolvedBasisField<BasisValues[K]> };
export interface ResolvedEventResultBasis {
  closure: EventResultClosureRow | null;
  basis_status: EventResultClosureRow["basis_status"];
  fields: ResolvedEventResultFields;
  unknown_fields: EventResultBasisField[];
  origin: "seal_snapshot" | "canonical_current_inputs" | "unknown";
  seals: EventResultClosureSealRow[];
}

export function parseEventResultClosure(raw: unknown): EventResultClosureRow {
  return EventResultClosureSchema.parse(raw) as EventResultClosureRow;
}

/** Seal -> evidenced revision -> unknown, independently for every field.
 * No current event/company/browser inputs are accepted. Unknown never means zero,
 * committed, with_bp or an inferred VAT rule. Without a seal the basis is immutable,
 * but canonical_current_inputs explicitly permits amounts to change with source data.
 * A missing/invalid declared seal fails instead of switching to recomputation.
 */
export function resolveEventResultBasis(raw: unknown): ResolvedEventResultBasis {
  const input = EventResultBasisInputSchema.parse(raw);
  const row = input.closure as EventResultClosureRow | null;
  const seal = input.seals[0]?.snapshot;
  const sealEvidence: BasisEvidence = { seals: input.seals.map(({ reference: ref }) => ({
    settlement_id: ref.settlement_id, sealed_at: ref.sealed_at, seal_sha256: ref.seal_sha256,
    seal_schema_version: ref.seal_schema_version, bp_version_id: ref.bp_version_id,
  })) };
  const fields = Object.fromEntries(EVENT_RESULT_BASIS_FIELDS.map(field => {
    if (seal && (field === "expense_source" || field === "cost_include_overhead")) {
      return [field, { status: "known", value: field === "expense_source" ? seal.basis.expenseSource : seal.basis.includeOverhead,
        source: "seal_snapshot", evidence: sealEvidence }];
    }
    if (row && row[field] !== null) return [field, {
      status: "known", value: row[field], source: "closure_revision", evidence: row.field_evidence[field],
    }];
    return [field, { status: "unknown", value: null, source: "unknown", evidence: null }];
  })) as ResolvedEventResultFields;
  return {
    closure: row, basis_status: row?.basis_status ?? "unknown", fields,
    unknown_fields: EVENT_RESULT_BASIS_FIELDS.filter(f => fields[f].status === "unknown"),
    origin: fields.result_origin.status === "known" ? fields.result_origin.value : "unknown",
    seals: input.seals.map(s => s.reference as EventResultClosureSealRow),
  };
}
