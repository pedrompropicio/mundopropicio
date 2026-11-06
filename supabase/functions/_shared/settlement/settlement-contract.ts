/** #415 E2b: pure contract resolution and post-engine overhead adjustment. No I/O. */
import { roundCents } from "./iva.ts";
import { normalizePartnerCalcBasis, type PartnerCalcBasis } from "./partner-calc-basis.ts";

export type SettlementContractState = "uninitialized" | "ready" | "invalid";
export type ContractExpenseSource = "realized" | "committed";
export interface SettlementContractNode {
  id: string;
  company_id: string;
  event_id: string;
  parent_id: string | null;
  parent_share_basis: "net_result" | "net_result_gross_expenses" | null;
  partner_calc_basis: PartnerCalcBasis | null;
  is_sealed: boolean;
  contract_expense_source: ContractExpenseSource | null;
  contract_include_overhead: boolean | null;
  contract_revision: number;
  contract_initialized_at: string | null;
  contract_initialized_by: string | null;
}
export interface ContractFieldOrigin {
  kind: "own" | "inherited";
  settlementId: string;
  revision: number;
}
export interface ResolvedSettlementContract {
  settlementId: string;
  state: SettlementContractState;
  expenseSource: ContractExpenseSource | null;
  includeOverhead: boolean | null;
  expenseSourceOrigin: ContractFieldOrigin | null;
  includeOverheadOrigin: ContractFieldOrigin | null;
  revision: number;
  revisions: { settlementId: string; revision: number }[];
  basis: PartnerCalcBasis;
  basisOrigin: "partner_calc_basis" | "parent_share_basis";
  isSealed: boolean;
  initializedAt: string | null;
  initializedBy: string | null;
  errors: string[];
}

/** Shared strict wire checks: unknown/missing keys are errors, never defaults. */
export function contractRecord(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid contract object");
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).length !== keys.length || keys.some((k) => !Object.prototype.hasOwnProperty.call(value, k))) {
    throw new Error("Invalid contract fields");
  }
  return value;
}
const bases = ["net_result", "net_result_gross_expenses", "gross_revenue"];
export function parseSettlementContractNode(raw: unknown): SettlementContractNode {
  const r = contractRecord(raw, ["id", "company_id", "event_id", "parent_id", "parent_share_basis", "partner_calc_basis",
    "is_sealed", "contract_expense_source", "contract_include_overhead", "contract_revision",
    "contract_initialized_at", "contract_initialized_by"]);
  for (const k of ["id", "company_id", "event_id"]) if (typeof r[k] !== "string" || !r[k]) throw new Error(`Invalid ${k}`);
  for (const k of ["parent_id", "contract_initialized_by"]) {
    if (r[k] !== null && (typeof r[k] !== "string" || !r[k])) throw new Error(`Invalid ${k}`);
  }
  if (r.contract_initialized_at !== null && (typeof r.contract_initialized_at !== "string"
    || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(r.contract_initialized_at)
    || !Number.isFinite(Date.parse(r.contract_initialized_at)))) throw new Error("Invalid initialized timestamp");
  if (r.contract_expense_source !== null && !["realized", "committed"].includes(r.contract_expense_source as string)) throw new Error("Invalid expense source");
  if (r.contract_include_overhead !== null && typeof r.contract_include_overhead !== "boolean") throw new Error("Invalid overhead");
  if (typeof r.is_sealed !== "boolean" || !Number.isSafeInteger(r.contract_revision) || (r.contract_revision as number) < 0) throw new Error("Invalid revision/seal");
  if (r.partner_calc_basis !== null && !bases.includes(r.partner_calc_basis as string)) throw new Error("Invalid g4 basis");
  if (r.parent_share_basis !== null && !bases.slice(0, 2).includes(r.parent_share_basis as string)) throw new Error("Invalid parent basis");
  return r as unknown as SettlementContractNode;
}

/** Q3-A: each null field inherits independently, only from an initialized ancestor. */
export function resolveSettlementContract(rawNodes: readonly unknown[]): ResolvedSettlementContract[] {
  const nodes = rawNodes.map(parseSettlementContractNode);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (byId.size !== nodes.length) throw new Error("Duplicate settlement id");
  return nodes.map((node) => {
    const errors: string[] = [];
    if (nodes.filter((n) => n.company_id === node.company_id && n.event_id === node.event_id && n.parent_id === null).length > 1) errors.push("Multiple contract roots");
    const chain: SettlementContractNode[] = [];
    let cursor: SettlementContractNode | undefined = node;
    while (cursor) {
      if (chain.some((n) => n.id === cursor!.id)) { errors.push("Contract ancestry cycle"); break; }
      if (cursor.company_id !== node.company_id || cursor.event_id !== node.event_id) { errors.push("Contract ancestry outside perimeter"); break; }
      chain.push(cursor);
      const initialized = cursor.contract_initialized_at !== null;
      if (initialized !== (cursor.contract_initialized_by !== null)
        || (initialized && cursor.contract_revision < 1)
        || (!initialized && (cursor.contract_revision !== 0 || cursor.contract_expense_source !== null || cursor.contract_include_overhead !== null))) {
        errors.push(`Invalid initialization: ${cursor.id}`);
      }
      if (cursor.parent_id === null) {
        if (cursor.parent_share_basis !== null) errors.push("Root has parent basis");
        if (initialized && (cursor.contract_expense_source === null || cursor.contract_include_overhead === null)) errors.push("Initialized root missing decision");
        break;
      }
      if (cursor.parent_share_basis === null) errors.push("Child missing g4 basis");
      const parent = byId.get(cursor.parent_id);
      if (!parent) { errors.push("Missing contract ancestor"); break; }
      cursor = parent;
    }
    const sourceNode = chain.find((n) => n.contract_initialized_at !== null && n.contract_expense_source !== null);
    const overheadNode = chain.find((n) => n.contract_initialized_at !== null && n.contract_include_overhead !== null);
    const origin = (n: SettlementContractNode | undefined): ContractFieldOrigin | null => n ? {
      kind: n.id === node.id ? "own" : "inherited", settlementId: n.id, revision: n.contract_revision,
    } : null;
    return {
      settlementId: node.id,
      state: errors.length ? "invalid" : sourceNode && overheadNode ? "ready" : "uninitialized",
      expenseSource: sourceNode?.contract_expense_source ?? null,
      includeOverhead: overheadNode?.contract_include_overhead ?? null,
      expenseSourceOrigin: origin(sourceNode), includeOverheadOrigin: origin(overheadNode),
      revision: node.contract_revision,
      revisions: chain.map((n) => ({ settlementId: n.id, revision: n.contract_revision })),
      basis: normalizePartnerCalcBasis(node.parent_id === null ? node.partner_calc_basis : node.parent_share_basis),
      basisOrigin: node.parent_id === null ? "partner_calc_basis" : "parent_share_basis",
      isSealed: node.is_sealed, initializedAt: node.contract_initialized_at, initializedBy: node.contract_initialized_by, errors,
    };
  });
}

export interface OverheadParticipantInput {
  id: string;
  settlementId: string;
  kind: "house" | "partner";
  mode: "settles" | "nominal";
  supportsOverhead: boolean;
  includeOverhead: boolean;
  basis: PartnerCalcBasis;
  shareBase: number;
  /** Same canonical pipeline with eligible overhead removed along the ancestry, after VAT/addbacks. */
  withoutOverhead: { share: number; sourceLineIds: string[] } | null;
}
export interface OverheadParticipantResult {
  id: string;
  settlementId: string;
  supportsOverhead: boolean;
  shareBase: number;
  overheadRelief: number;
  shareFinal: number;
  sourceLineIds: string[];
}
export interface SettlementResidualBase {
  declaredBase: number;
  ivaDeductibleBase: number;
  nominalGapBase: number;
  houseOnlyRevenue: number;
  /** Existing signed terms (e.g. nonrecoverable VAT); never a balancing plug. */
  otherBase: number;
}
export interface OverheadAdjustment {
  participants: OverheadParticipantResult[];
  partnersPaidBase: number;
  partnersPaidFinal: number;
  houseResidualBase: number;
  houseResidualFinal: number;
  overheadAbsorbedByHouse: number;
  residualBase: SettlementResidualBase;
  c1: number;
  c2: number;
}

/** Apply each already-calculated counterfactual share once. No new expense/VAT/cascade engine. */
export function applySettlementOverhead(input: {
  eventNetResult: number;
  residualBase: SettlementResidualBase;
  participants: readonly OverheadParticipantInput[];
}): OverheadAdjustment {
  const finite = (n: number) => { if (!Number.isFinite(n)) throw new Error("Nonfinite overhead amount"); return n; };
  finite(input.eventNetResult);
  Object.values(input.residualBase).forEach(finite);
  if (new Set(input.participants.map((p) => p.id)).size !== input.participants.length) throw new Error("Duplicate overhead participant");
  const participants = input.participants.map((p): OverheadParticipantResult => {
    finite(p.shareBase);
    if (p.kind === "house" && !p.supportsOverhead) throw new Error("House must support overhead");
    const active = p.kind === "partner" && p.mode === "settles" && !p.supportsOverhead && p.includeOverhead && p.basis !== "gross_revenue";
    if (active && input.participants.filter((q) => q.settlementId === p.settlementId && q.mode === "settles").length < 2) throw new Error("Overhead exemption requires two settles");
    if (active && !p.withoutOverhead) throw new Error("Missing canonical overhead counterfactual");
    const sourceLineIds = active ? [...p.withoutOverhead!.sourceLineIds] : [];
    if (new Set(sourceLineIds).size !== sourceLineIds.length) throw new Error("Duplicate overhead lineage");
    const shareBase = roundCents(p.shareBase);
    const shareFinal = active ? roundCents(finite(p.withoutOverhead!.share)) : shareBase;
    const overheadRelief = roundCents(shareFinal - shareBase);
    if (overheadRelief !== 0 && !sourceLineIds.length) throw new Error("Overhead relief without provenance");
    return { id: p.id, settlementId: p.settlementId, supportsOverhead: p.supportsOverhead, shareBase, shareFinal, overheadRelief, sourceLineIds };
  });
  const external = (p: OverheadParticipantInput) => p.kind === "partner" && p.mode === "settles";
  const sum = (field: "shareBase" | "shareFinal" | "overheadRelief") => roundCents(participants.reduce((s, p, i) => s + (external(input.participants[i]) ? p[field] : 0), 0));
  const partnersPaidBase = sum("shareBase");
  const partnersPaidFinal = sum("shareFinal");
  const overheadAbsorbedByHouse = roundCents(-sum("overheadRelief"));
  const houseResidualBase = roundCents(input.eventNetResult - partnersPaidBase);
  const houseResidualFinal = roundCents(input.eventNetResult - partnersPaidFinal);
  const baseTerms = Object.values(input.residualBase).reduce((s, n) => s + n, 0);
  return { participants, partnersPaidBase, partnersPaidFinal, houseResidualBase, houseResidualFinal,
    overheadAbsorbedByHouse, residualBase: { ...input.residualBase },
    c1: roundCents(partnersPaidFinal + houseResidualFinal - input.eventNetResult),
    c2: roundCents(houseResidualFinal - (baseTerms + overheadAbsorbedByHouse)) };
}
