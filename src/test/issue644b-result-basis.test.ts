// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  EVENT_RESULT_BASIS_FIELDS, EventResultBasisInputSchema, EventResultClosureActiveSchema,
  EventResultClosureLogSchema, EventResultClosureSealSchema, EventResultClosureSchema,
  parseEventResultClosure, resolveEventResultBasis,
  type EventResultBasisField, type EventResultClosureRow, type EventResultSealInput,
} from "@/lib/event-result-basis";
import { resolveEventResultBasis as sharedResolve } from "@shared/settlement/event-result-basis.ts";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const COMPANY = uuid(1), EVENT = uuid(2), CLOSURE = uuid(3), AUTHOR = uuid(4), SETTLEMENT = uuid(5);
const NOW = "2026-11-05T12:00:00.000000+00:00";
const HASH = "a".repeat(64);
function closure(overrides: Partial<EventResultClosureRow> = {}): EventResultClosureRow {
  return {
    id: CLOSURE, company_id: COMPANY, event_id: EVENT, closure_root_event_id: EVENT, root_closure_id: CLOSURE,
    revision: 1, closed_at: NOW, closed_by: AUTHOR, captured_at: NOW, captured_by: AUTHOR,
    capture_kind: "close_event", schema_version: 1, criterion_version: 1, criterion_sha256: HASH,
    basis_status: "recorded", budget_mode_resolved: "with_bp", budget_mode_source: "company",
    expense_source: "committed", expense_source_original: "committed", cost_include_overhead: false,
    partner_calc_basis: "net_result", result_revenue_vat_basis: "net", result_expense_vat_basis: "net",
    revenue_policy: "real_then_bp_by_bucket", revenue_policy_version: 1, revenue_include_overhead: false,
    final_bp_version_id: null, perimeter_kind: "event", result_origin: "canonical_current_inputs",
    field_evidence: Object.fromEntries(EVENT_RESULT_BASIS_FIELDS.map(f => [f, { source: "synthetic_server_input", revision: 1 }])),
    unknown_fields: [], provenance: { criterion: { version: 1, sha256: HASH }, source_ids: [uuid(10)] },
    previous_closure_id: null, confirmation_receipt_id: null, ...overrides,
  };
}
function legacy(unknown: EventResultBasisField[], overrides: Partial<EventResultClosureRow> = {}): EventResultClosureRow {
  return { ...closure(), capture_kind: "legacy_reconstruction", basis_status: unknown.length ? "unknown" : "reconstructed",
    ...Object.fromEntries(unknown.map(f => [f, null])), unknown_fields: unknown, ...overrides };
}
function seal(row = closure({ result_origin: "seal_snapshot" })): EventResultSealInput {
  return {
    reference: { closure_id: row.id, company_id: row.company_id, event_id: row.event_id, settlement_id: SETTLEMENT,
      sealed_at: "2026-11-05T11:59:00Z", seal_schema_version: 1, seal_sha256: HASH,
      bp_version_id: uuid(20), node_basis_evidence: { contract_revision_id: uuid(21) } },
    snapshot: { version: 1, settlement_id: SETTLEMENT, check1: 0, check2: 0,
      basis: { expenseSource: "realized", includeOverhead: true }, eventNetResult: 150, partnersPaidTotal: 0,
      nodes: [{ id: SETTLEMENT, name: "Synthetic root", parentId: null, parentQuota: null,
        parentSharePct: null, parentQuotaBasis: null, resultNet: 150, resultGross: 150, moneyNet: 150,
        participants: [{ id: uuid(30), name: "Synthetic house", kind: "house", mode: "settles",
          effectivePct: 100, share: 150, shareNet: 150, settlementAmount: 150 }] }],
    },
  };
}
const input = (row: EventResultClosureRow | null = closure(), seals: EventResultSealInput[] = []) => ({
  company_id: COMPANY, event_id: EVENT, closure: row, seals,
});

describe("#644b B2 — contract versions and complete revision", () => {
  it("exports the identical pure resolver through the client shim", () => {
    expect(resolveEventResultBasis).toBe(sharedResolve);
  });
  it("reads v1 without losing any column, provenance, original source or explicit false", () => {
    const row = closure({ final_bp_version_id: uuid(40), revision: 7, previous_closure_id: uuid(41) });
    expect(parseEventResultClosure(row)).toEqual(row);
    const result = resolveEventResultBasis(input(row));
    expect(result.closure).toEqual(row);
    expect(result.basis_status).toBe("recorded");
    expect(result.unknown_fields).toEqual([]);
    expect(result.fields.cost_include_overhead).toEqual({ status: "known", value: false,
      source: "closure_revision", evidence: row.field_evidence.cost_include_overhead });
    expect(result.fields.revenue_include_overhead.value).toBe(false);
    expect(result.fields.criterion_sha256.value).toBe(HASH);
  });
  it.each(["schema_version", "criterion_version", "revenue_policy_version"] as const)("refuses an unsupported %s", field => {
    for (const unsupported of [0, 2, -1, "1"]) {
      expect(() => resolveEventResultBasis({ ...input(), closure: { ...closure(), [field]: unsupported } }))
        .toThrow(`unsupported_${field}`);
    }
  });
  it("does not mistake an unknown historical version for an accepted version", () => {
    const row = legacy(["criterion_version", "revenue_policy_version"]);
    const result = resolveEventResultBasis(input(row));
    expect(result.fields.criterion_version).toEqual({ status: "unknown", value: null, source: "unknown", evidence: null });
    expect(result.fields.revenue_policy_version.status).toBe("unknown");
  });
  it.each(["seal_schema_version", "version"])("refuses an unsupported seal %s", field => {
    const row = closure({ result_origin: "seal_snapshot" });
    const s = seal(row);
    const bad = field === "version" ? { ...s, snapshot: { ...s.snapshot, version: 2 } }
      : { ...s, reference: { ...s.reference, seal_schema_version: 2 } };
    expect(() => resolveEventResultBasis({ ...input(row), seals: [bad] })).toThrow(`unsupported_${field === "version" ? "seal_snapshot_version" : field}`);
  });
});

describe("#644b B2 — seal, recorded basis, unknown (Q2/Q4)", () => {
  it("gives the v1 seal precedence for only its two provable fields", () => {
    const row = closure({ result_origin: "seal_snapshot" });
    const result = resolveEventResultBasis(input(row, [seal(row)]));
    expect(result.fields.expense_source).toMatchObject({ status: "known", value: "realized", source: "seal_snapshot" });
    expect(result.fields.cost_include_overhead).toMatchObject({ status: "known", value: true, source: "seal_snapshot" });
    expect(result.fields.expense_source_original).toMatchObject({ value: "committed", source: "closure_revision" });
    expect(result.fields.partner_calc_basis.source).toBe("closure_revision");
    expect(result.fields.revenue_policy.source).toBe("closure_revision");
    expect(result.origin).toBe("seal_snapshot");
    expect(result.fields.expense_source.evidence).toEqual({ seals: [{ settlement_id: SETTLEMENT,
      sealed_at: "2026-11-05T11:59:00Z", seal_sha256: HASH, seal_schema_version: 1, bp_version_id: uuid(20) }] });
    expect(result.seals).toEqual([seal(row).reference]);
    expect(result.closure.expense_source).toBe("committed");
    expect(result).not.toHaveProperty("eventNetResult");
  });
  it("retains every unproven v1 historical field as unknown even when a result was sealed", () => {
    const missing: EventResultBasisField[] = ["criterion_version", "criterion_sha256", "closed_by", "budget_mode_resolved",
      "budget_mode_source", "expense_source", "expense_source_original", "cost_include_overhead", "partner_calc_basis",
      "result_revenue_vat_basis", "result_expense_vat_basis", "revenue_policy", "revenue_policy_version", "revenue_include_overhead"];
    const row = legacy(missing, { result_origin: "seal_snapshot" });
    const result = resolveEventResultBasis(input(row, [seal(row)]));
    expect(result.fields.expense_source).toMatchObject({ value: "realized", source: "seal_snapshot" });
    expect(result.fields.cost_include_overhead.status).toBe("known");
    expect(result.unknown_fields).toEqual(missing.filter(f => f !== "expense_source" && f !== "cost_include_overhead"));
    expect(result.fields.budget_mode_resolved.value).toBeNull();
    expect(result.fields.partner_calc_basis.value).toBeNull();
    expect(result.basis_status).toBe("unknown");
    expect(result.closure.unknown_fields).toEqual(missing);
  });
  it.each(EVENT_RESULT_BASIS_FIELDS)("preserves the absence of proof for %s independently", field => {
    const row = legacy([field]);
    const result = resolveEventResultBasis(input(row));
    expect(result.unknown_fields).toEqual([field]);
    expect(result.fields[field]).toEqual({ status: "unknown", value: null, source: "unknown", evidence: null });
    for (const other of EVENT_RESULT_BASIS_FIELDS.filter(f => f !== field)) {
      expect(result.fields[other]).toMatchObject({ status: "known", value: row[other], source: "closure_revision" });
    }
  });
  it("returns all fields as unknown for a closed legacy event without a revision", () => {
    const result = resolveEventResultBasis(input(null));
    expect(result.origin).toBe("unknown");
    expect(result.basis_status).toBe("unknown");
    expect(result.closure).toBeNull();
    expect(result.unknown_fields).toEqual(EVENT_RESULT_BASIS_FIELDS);
    expect(Object.values(result.fields).every(f => f.status === "unknown" && f.value === null)).toBe(true);
  });
  it("uses canonical_current_inputs without a seal, without claiming a frozen amount", () => {
    const result = resolveEventResultBasis(input());
    expect(result.origin).toBe("canonical_current_inputs");
    expect(result.fields.result_origin.source).toBe("closure_revision");
    expect(result.seals).toEqual([]);
    expect(result).not.toHaveProperty("amount");
    expect(result).not.toHaveProperty("amount_immutable");
  });
  it.each(["events", "company_defaults", "localStorage", "phase", "browser_date"])("rejects %s as a fallback input", source => {
    expect(() => resolveEventResultBasis({ ...input(legacy(["expense_source"])), [source]: { expense_source: "committed" } }))
      .toThrow();
  });
});

describe("#644b B2 — modes, VAT and revision identity", () => {
  it.each(["realized", "committed"] as const)("preserves with_bp / %s without consulting event phase", source => {
    const result = resolveEventResultBasis(input(closure({ expense_source: source })));
    expect(result.fields.expense_source.value).toBe(source);
    expect(result.fields.revenue_policy.value).toBe("real_then_bp_by_bucket");
  });
  it("preserves without_bp / realized / real_only and the original stored source", () => {
    const result = resolveEventResultBasis(input(closure({ budget_mode_resolved: "without_bp",
      budget_mode_source: "event", expense_source: "realized", expense_source_original: "committed", revenue_policy: "real_only" })));
    expect(result.fields.expense_source.value).toBe("realized");
    expect(result.fields.expense_source_original.value).toBe("committed");
    expect(result.fields.budget_mode_source.value).toBe("event");
    expect(result.fields.revenue_policy.value).toBe("real_only");
  });
  it("does not infer historical expense/revenue criteria from a known without_bp mode", () => {
    const result = resolveEventResultBasis(input(legacy(["expense_source", "revenue_policy"], { budget_mode_resolved: "without_bp" })));
    expect(result.fields.expense_source.status).toBe("unknown");
    expect(result.fields.revenue_policy.status).toBe("unknown");
  });
  it.each(["event", "company", "platform_default"] as const)("retains mode provenance %s", source => {
    expect(resolveEventResultBasis(input(closure({ budget_mode_source: source }))).fields.budget_mode_source.value).toBe(source);
  });
  it.each([
    ["net_result", "net"], ["net_result_gross_expenses", "gross"], ["gross_revenue", "excluded"],
  ] as const)("preserves the explicit VAT pair %s/%s", (basis, vat) => {
    const result = resolveEventResultBasis(input(closure({ partner_calc_basis: basis, result_expense_vat_basis: vat })));
    expect(result.fields.partner_calc_basis.value).toBe(basis);
    expect(result.fields.result_expense_vat_basis.value).toBe(vat);
    expect(result.fields.result_revenue_vat_basis.value).toBe("net");
  });
  it("does not derive an absent VAT field from partner_calc_basis", () => {
    expect(resolveEventResultBasis(input(legacy(["result_expense_vat_basis"]))).fields.result_expense_vat_basis.status).toBe("unknown");
  });
  it("retains family operation and city-specific mode rather than inheriting a root criterion", () => {
    const root = uuid(50), operation = uuid(51);
    const row = closure({ closure_root_event_id: root, root_closure_id: operation, perimeter_kind: "city",
      budget_mode_resolved: "without_bp", expense_source: "realized", revenue_policy: "real_only" });
    const result = resolveEventResultBasis(input(row));
    expect(result.closure).toMatchObject({ event_id: EVENT, closure_root_event_id: root, root_closure_id: operation, perimeter_kind: "city" });
    expect(result.fields.budget_mode_resolved.value).toBe("without_bp");
    expect(parseEventResultClosure(closure({ perimeter_kind: "family" })).perimeter_kind).toBe("family");
  });
  it("reads a reconstructed/confirmed revision without rewriting its historical authorship", () => {
    const row = closure({ capture_kind: "legacy_confirmation", basis_status: "reconstructed", closed_by: uuid(60),
      captured_by: AUTHOR, previous_closure_id: uuid(61), confirmation_receipt_id: uuid(62), captured_at: "2026-11-06T12:00:00Z" });
    expect(resolveEventResultBasis(input(row)).closure).toEqual(row);
    expect(resolveEventResultBasis(input(legacy([]))).basis_status).toBe("reconstructed");
  });
});

describe("#644b B2 — refuses invalid input instead of defaulting", () => {
  it.each([null, undefined, [], {}, "revision"])("refuses an absent or malformed input (%s)", raw => {
    expect(() => resolveEventResultBasis(raw)).toThrow();
  });
  it.each([
    { revision: 0 }, { revision: 1.5 }, { revision: 2147483648 }, { revision: "1" },
    { id: "bad-id" }, { closed_at: "2026-02-30T12:00:00Z" }, { captured_at: "infinity" },
    { cost_include_overhead: "false" }, { expense_source: "forecast" }, { expense_source: "auto" },
    { budget_mode_resolved: "default" }, { budget_mode_source: "master" }, { criterion_sha256: "abc" },
    { revenue_include_overhead: true }, { result_revenue_vat_basis: "gross" },
    { partner_calc_basis: "net_result", result_expense_vat_basis: "gross" },
    { budget_mode_resolved: "without_bp" }, { revenue_policy: "real_only" },
    { basis_status: "unknown" }, { expense_source: null }, { unknown_fields: ["expense_source"] },
    { unknown_fields: ["not_a_field"] }, { field_evidence: {} }, { field_evidence: { ...closure().field_evidence, expense_source: {} } },
    { field_evidence: { ...closure().field_evidence, expense_source: [] } },
    { field_evidence: { ...closure().field_evidence, expense_source: "not evidence" } },
    { field_evidence: { ...closure().field_evidence, expense_source: { invalid: undefined } } },
    { provenance: [] }, { provenance: { bad: Number.NaN } },
    { captured_by: uuid(70) }, { confirmation_receipt_id: uuid(71) }, { previous_closure_id: CLOSURE },
    { perimeter_kind: "city" }, { root_closure_id: uuid(72) },
    { capture_kind: "legacy_reconstruction" }, { capture_kind: "legacy_confirmation" },
    { arbitrary_extra_column: true },
  ])("refuses invalid revision columns %#", overrides => {
    expect(() => resolveEventResultBasis({ ...input(), closure: { ...closure(), ...overrides } })).toThrow();
  });
  it("requires every column, including explicit nullable columns", () => {
    for (const field of Object.keys(closure())) {
      const row = { ...closure() };
      delete row[field];
      expect(() => parseEventResultClosure(row), field).toThrow();
    }
  });
  it("rejects duplicate unknown fields, even when all values are null", () => {
    const row = legacy(["expense_source"]);
    expect(() => resolveEventResultBasis(input({ ...row, unknown_fields: ["expense_source", "expense_source"] }))).toThrow("unknown_fields_mismatch");
  });
  it.each(["company_id", "event_id"] as const)("rejects another %s revision", field => {
    expect(() => resolveEventResultBasis({ ...input(), [field]: uuid(80) })).toThrow("closure_scope_mismatch");
  });
  it("never falls through a missing declared seal or unexpected seal to current inputs", () => {
    expect(() => resolveEventResultBasis(input(closure({ result_origin: "seal_snapshot" })))).toThrow("seal_origin_mismatch");
    expect(() => resolveEventResultBasis(input(closure(), [seal()]))).toThrow("seal_origin_mismatch");
    expect(() => resolveEventResultBasis(input(null, [seal()]))).toThrow("seal_requires_closure_revision");
  });
  it.each(["closure_id", "company_id", "event_id", "settlement_id"] as const)("rejects a seal with mismatched %s", field => {
    const row = closure({ result_origin: "seal_snapshot" });
    const s = seal(row);
    s.reference[field] = uuid(81);
    expect(() => resolveEventResultBasis(input(row, [s]))).toThrow("seal_scope_mismatch");
  });
  it("refuses a seal taken after the closure", () => {
    const row = closure({ result_origin: "seal_snapshot" });
    const s = seal(row);
    s.reference.sealed_at = "2026-11-05T12:00:01Z";
    expect(() => resolveEventResultBasis(input(row, [s]))).toThrow("seal_after_closure");
  });
  it("preserves microsecond order and compares timezones by instant", () => {
    const row = closure({ result_origin: "seal_snapshot", closed_at: "2026-11-05T12:00:00.000001Z" });
    const s = seal(row);
    s.reference.sealed_at = "2026-11-05T12:00:00.000002Z";
    expect(() => resolveEventResultBasis(input(row, [s]))).toThrow("seal_after_closure");
    s.reference.sealed_at = "2026-11-05T13:00:00.000001+01:00";
    expect(resolveEventResultBasis(input(row, [s])).origin).toBe("seal_snapshot");
    s.reference.sealed_at = "2026-11-05T13:00:00.000002+0100";
    expect(() => resolveEventResultBasis(input(row, [s]))).toThrow("seal_after_closure");
    s.reference.sealed_at = "2026-11-05T13:00:00.000001+0100";
    expect(resolveEventResultBasis(input(row, [s])).origin).toBe("seal_snapshot");
    s.reference.sealed_at = "2026-11-05T12:00:00Z";
    expect(resolveEventResultBasis(input(row, [s])).origin).toBe("seal_snapshot");
  });
  it("refuses a seal whose effective source contradicts the recorded without_bp mode", () => {
    const row = closure({ result_origin: "seal_snapshot", budget_mode_resolved: "without_bp",
      expense_source: "realized", revenue_policy: "real_only" });
    const s = seal(row);
    s.snapshot.basis.expenseSource = "committed";
    expect(() => resolveEventResultBasis(input(row, [s]))).toThrow("without_bp_requires_realized");
  });
  it("refuses duplicate references and incompatible seals rather than choosing array order", () => {
    const row = closure({ result_origin: "seal_snapshot" });
    expect(() => resolveEventResultBasis(input(row, [seal(row), seal(row)]))).toThrow("duplicate_seal_reference");
    const other = seal(row);
    other.reference.settlement_id = uuid(90);
    other.snapshot.settlement_id = uuid(90);
    other.snapshot.nodes[0].id = uuid(90);
    expect(resolveEventResultBasis(input(row, [seal(row), other])).seals).toHaveLength(2);
    for (const change of [
      { ...other.snapshot, eventNetResult: 151 },
      { ...other.snapshot, basis: { expenseSource: "committed" as const, includeOverhead: true } },
      { ...other.snapshot, basis: { expenseSource: "realized" as const, includeOverhead: false } },
    ]) {
      const refs = [seal(row), { ...other, snapshot: change }];
      expect(() => resolveEventResultBasis(input(row, refs))).toThrow("conflicting_seal_snapshots");
      expect(() => resolveEventResultBasis(input(row, refs.reverse()))).toThrow("conflicting_seal_snapshots");
    }
  });
  it("validates the v1 subtree and finite amounts instead of using the permissive legacy parser", () => {
    const row = closure({ result_origin: "seal_snapshot" });
    const s = seal(row);
    const node = s.snapshot.nodes[0];
    for (const snapshot of [
      { ...s.snapshot, basis: {} }, { ...s.snapshot, nodes: [] }, { ...s.snapshot, eventNetResult: Infinity },
      { ...s.snapshot, nodes: [node, node] }, { ...s.snapshot, nodes: [{ ...node, id: uuid(91) }] },
      { ...s.snapshot, nodes: [node, { ...node, id: uuid(92), parentId: uuid(93) }] },
      { ...s.snapshot, nodes: [{ ...node, parentId: SETTLEMENT }] },
    ]) {
      expect(() => resolveEventResultBasis({ ...input(row), seals: [{ ...s, snapshot }] })).toThrow();
    }
  });
  it("accepts connected subtrees, but rejects conflicting overlapping ancestry", () => {
    const row = closure({ result_origin: "seal_snapshot" });
    const root = seal(row), child = seal(row), childId = uuid(94);
    const childNode = { ...root.snapshot.nodes[0], id: childId, parentId: SETTLEMENT };
    root.snapshot.nodes.push(childNode);
    child.reference.settlement_id = childId;
    child.snapshot.settlement_id = childId;
    child.snapshot.nodes = [childNode];
    expect(resolveEventResultBasis(input(row, [root, child])).origin).toBe("seal_snapshot");
    child.snapshot.nodes = [{ ...childNode, parentId: uuid(95) }];
    expect(() => resolveEventResultBasis(input(row, [root, child]))).toThrow("conflicting_seal_subtrees");
  });
});

describe("#644b B2 — mirror auxiliary columns and purity", () => {
  it("validates the seal reference, active link and lifecycle log without consulting storage", () => {
    const reference = seal().reference;
    expect(EventResultClosureSealSchema.parse(reference)).toEqual(reference);
    expect(() => EventResultClosureSealSchema.parse({ ...reference, seal_sha256: "broken" })).toThrow();
    const active = { company_id: COMPANY, event_id: EVENT, closure_id: CLOSURE, activation_receipt_id: uuid(100) };
    expect(EventResultClosureActiveSchema.parse(active)).toEqual(active);
    const log = { id: uuid(101), closure_id: CLOSURE, company_id: COMPANY, event_id: EVENT,
      action: "closed", occurred_at: NOW, performed_by: AUTHOR, reason: "Synthetic close", evidence: {}, replacement_closure_id: null };
    for (const action of ["closed", "reopened", "legacy_reopened", "reconstructed"]) {
      expect(EventResultClosureLogSchema.parse({ ...log, action }).action).toBe(action);
    }
    expect(EventResultClosureLogSchema.parse({ ...log, action: "confirmed", replacement_closure_id: uuid(102) }).action).toBe("confirmed");
    expect(() => EventResultClosureLogSchema.parse({ ...log, action: "confirmed" })).toThrow();
    expect(() => EventResultClosureLogSchema.parse({ ...log, action: "confirmed", replacement_closure_id: CLOSURE })).toThrow();
    expect(() => EventResultClosureLogSchema.parse({ ...log, replacement_closure_id: uuid(102) })).toThrow();
    expect(() => EventResultClosureLogSchema.parse({ ...log, reason: "  " })).toThrow();
  });
  it("is deterministic and does not mutate frozen input or share mutable input references", () => {
    const row = closure({ result_origin: "seal_snapshot" });
    const raw = input(row, [seal(row)]);
    const before = structuredClone(raw);
    function freeze(value: unknown) {
      if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    }
    freeze(raw);
    const result = resolveEventResultBasis(raw);
    expect(resolveEventResultBasis(raw)).toEqual(result);
    expect(raw).toEqual(before);
    result.closure.provenance.source_ids = [];
    expect(raw.closure.provenance).toEqual(before.closure.provenance);
    expect(EventResultBasisInputSchema.safeParse(raw).success).toBe(true);
    expect(EventResultClosureSchema.safeParse(raw.closure).success).toBe(true);
  });
});
