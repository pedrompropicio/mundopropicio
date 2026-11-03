/**
 * SELO DO FECHAMENTO — épica #146 (f), ponto 2. Funções PURAS.
 *
 * Selar congela o resultado do motor num snapshot jsonb guardado em
 * `event_settlements.sealed_snapshot` (escrito só pela RPC `seal_event_settlement`).
 * Quando um fechamento está selado, o Encontro de Contas, o PDF e o Portal do
 * Sócio LÊEM DO SNAPSHOT. Ao lado, e só para a equipa, mostra-se o valor ao vivo
 * e o desvio — que nunca entra no PDF nem no Portal.
 *
 * O snapshot cobre o fechamento e os que dependem dele (a peça é estanque, mas o
 * valor ao vivo de um dependente influencia a quota, por isso guarda-se a
 * sub-árvore inteira).
 */
import { contractRecord, type ResolvedSettlementContract, type SettlementResidualBase } from "./settlement-contract.ts";
import { roundCents } from "./iva.ts";
import type { EngineResult, SettlementNodeResult } from "./event-settlement-engine.ts";

export const SEAL_TOL = 0.005;

export interface SealSnapshotParticipant {
  id: string;
  name: string;
  kind: "house" | "partner";
  mode: "settles" | "nominal";
  effectivePct: number;
  share: number;
  shareNet: number;
  settlementAmount: number;
}

export interface SealSnapshotNode {
  id: string;
  name: string;
  parentId: string | null;
  parentQuota: number | null;
  parentSharePct: number | null;
  parentQuotaBasis: string | null;
  resultNet: number;
  resultGross: number;
  moneyNet: number;
  participants: SealSnapshotParticipant[];
}

export interface SealSnapshot {
  version: 1;
  settlement_id: string;
  check1: number;
  check2: number;
  basis: { expenseSource: string; includeOverhead: boolean };
  eventNetResult: number;
  partnersPaidTotal: number;
  nodes: SealSnapshotNode[];
}

const toNode = (n: SettlementNodeResult): SealSnapshotNode => ({
  id: n.id,
  name: n.name,
  parentId: n.parentId,
  parentQuota: n.parentQuota,
  parentSharePct: n.parentSharePct,
  parentQuotaBasis: n.parentQuotaBasis,
  resultNet: n.resultNet,
  resultGross: n.resultGross,
  moneyNet: n.moneyNet,
  participants: n.participants.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    mode: p.mode,
    effectivePct: p.effectivePct,
    share: p.share,
    shareNet: p.shareNet,
    settlementAmount: p.settlementAmount,
  })),
});

/** Ids do fechamento e de tudo o que dele depende. */
export function subtreeIds(result: EngineResult, settlementId: string): string[] {
  const out = [settlementId];
  let added = true;
  while (added) {
    added = false;
    for (const n of result.nodes) {
      if (n.parentId && out.includes(n.parentId) && !out.includes(n.id)) {
        out.push(n.id);
        added = true;
      }
    }
  }
  return out;
}

export function buildSealSnapshot(
  result: EngineResult,
  settlementId: string,
  basis: { expenseSource: string; includeOverhead: boolean },
): SealSnapshot {
  const ids = subtreeIds(result, settlementId);
  return {
    version: 1,
    settlement_id: settlementId,
    check1: Number(result.c1.value.toFixed(4)),
    check2: Number(result.c2.value.toFixed(4)),
    basis,
    eventNetResult: result.eventNetResult,
    partnersPaidTotal: result.partnersPaidTotal,
    nodes: result.nodes.filter((n) => ids.includes(n.id)).map(toNode),
  };
}

/** Selar exige as duas conferências do motor a zero (tolerância do motor). */
export function canSeal(result: EngineResult | null): { ok: boolean; reason?: string } {
  if (!result) return { ok: false, reason: "Sem cálculo disponível." };
  if (Math.abs(result.c1.value) > SEAL_TOL || Math.abs(result.c2.value) > SEAL_TOL) {
    return { ok: false, reason: "As duas conferências têm de estar a 0,00 € para selar." };
  }
  return { ok: true };
}

export interface SealDeviationRow {
  name: string;
  sealed: number;
  live: number;
  diff: number;
}

export interface SealDeviation {
  total: number;
  rows: SealDeviationRow[];
}

/** Desvio entre o snapshot e o valor ao vivo — VISTA DA EQUIPA apenas. */
export function sealDeviation(
  snapshot: AnySealSnapshot | null | undefined,
  result: EngineResult | null,
  settlementId: string,
): SealDeviation {
  if (!snapshot || !result) return { total: 0, rows: [] };
  const liveNodes = new Map(result.nodes.map((n) => [n.id, n]));
  const rows: SealDeviationRow[] = [];
  for (const sn of snapshot.nodes) {
    const live = liveNodes.get(sn.id);
    for (const sp of sn.participants) {
      const lp = live?.participants.find((p) => p.id === sp.id);
      const liveShare = lp ? lp.share : 0;
      const diff = Number((liveShare - sp.share).toFixed(2));
      if (diff !== 0) rows.push({ name: sp.name, sealed: sp.share, live: liveShare, diff });
    }
  }
  const nodeSealed = snapshot.nodes.find((n) => n.id === settlementId);
  const nodeLive = liveNodes.get(settlementId);
  const total = Number(((nodeLive?.resultNet ?? 0) - (nodeSealed?.resultNet ?? 0)).toFixed(2));
  return { total, rows };
}

/** Snapshot → nós, para os documentos lerem do selo em vez do valor ao vivo. */
export function parseSealSnapshot(raw: unknown): AnySealSnapshot | null {
  if (raw && typeof raw === "object" && (raw as { version?: unknown }).version === 2) return parseSealSnapshotV2(raw);
  if (!raw || typeof raw !== "object") return null;
  const s = raw as SealSnapshot;
  if (s.version !== 1 || !Array.isArray(s.nodes)) return null;
  return s;
}

/** V2 is additive. V1 stays historical and is never enriched using live configuration. */
export interface SealSnapshotParticipantV2 extends SealSnapshotParticipant {
  supportsOverhead: boolean;
  shareBase: number;
  overheadRelief: number;
  shareFinal: number;
  overheadSourceLineIds: string[];
}
export interface SealSnapshotNodeV2 extends Omit<SealSnapshotNode, "participants"> {
  contract: ResolvedSettlementContract;
  participants: SealSnapshotParticipantV2[];
  documentLineIds: string[];
}
export interface SealSnapshotV2 extends Omit<SealSnapshot, "version" | "nodes"> {
  version: 2;
  contextVersion: 1;
  /** Digest supplied by the context producer. Parsing validates format, not financial truth. */
  inputHash: string;
  nodes: SealSnapshotNodeV2[];
  residual: SettlementResidualBase & { overheadAbsorbedByHouse: number; residualFinal: number; rest: number };
}
export type AnySealSnapshot = SealSnapshot | SealSnapshotV2;
const v2fail = (): never => { throw new Error("Invalid settlement seal v2"); };
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const str = (s: unknown): s is string => typeof s === "string" && s.length > 0;
const uniqueStrings = (a: unknown): a is string[] => Array.isArray(a) && a.every(str) && new Set(a).size === a.length;
const revision = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
function validateV2Contract(raw: unknown, id: string): ResolvedSettlementContract {
  const c = contractRecord(raw, ["settlementId", "state", "expenseSource", "includeOverhead", "expenseSourceOrigin", "includeOverheadOrigin",
    "revision", "revisions", "basis", "basisOrigin", "isSealed", "initializedAt", "initializedBy", "errors"]);
  if (c.settlementId !== id || c.state !== "ready" || !["realized", "committed"].includes(c.expenseSource as string)
    || typeof c.includeOverhead !== "boolean" || typeof c.isSealed !== "boolean" || !revision(c.revision)
    || !["net_result", "net_result_gross_expenses", "gross_revenue"].includes(c.basis as string)
    || !["partner_calc_basis", "parent_share_basis"].includes(c.basisOrigin as string)
    || !Array.isArray(c.errors) || c.errors.length !== 0 || !Array.isArray(c.revisions) || !c.revisions.length) v2fail();
  const revisions = (c.revisions as unknown[]).map((r) => {
    const item = contractRecord(r, ["settlementId", "revision"]);
    if (!str(item.settlementId) || !revision(item.revision)) v2fail();
    return item as unknown as { settlementId: string; revision: number };
  });
  if (new Set(revisions.map((r) => r.settlementId)).size !== revisions.length || revisions[0].settlementId !== id || revisions[0].revision !== c.revision) v2fail();
  for (const origin of [c.expenseSourceOrigin, c.includeOverheadOrigin]) {
    const o = contractRecord(origin, ["kind", "settlementId", "revision"]);
    if (!str(o.settlementId) || !revision(o.revision) || (o.revision as number) < 1
      || o.kind !== (o.settlementId === id ? "own" : "inherited")
      || !revisions.some((r) => r.settlementId === o.settlementId && r.revision === o.revision)) v2fail();
  }
  if ((c.initializedAt === null) !== (c.initializedBy === null)) v2fail();
  if (c.initializedAt !== null && (!str(c.initializedAt) || !Number.isFinite(Date.parse(c.initializedAt)) || !str(c.initializedBy) || (c.revision as number) < 1)) v2fail();
  if (c.initializedAt === null && c.revision !== 0) v2fail();
  return c as unknown as ResolvedSettlementContract;
}

/** A malformed v2 never falls back to the permissive historical v1 parser. */
export function parseSealSnapshotV2(raw: unknown): SealSnapshotV2 | null {
  try {
    const s = contractRecord(raw, ["version", "contextVersion", "inputHash", "settlement_id", "check1", "check2", "basis",
      "eventNetResult", "partnersPaidTotal", "nodes", "residual"]);
    if (s.version !== 2 || s.contextVersion !== 1 || !str(s.settlement_id)
      || typeof s.inputHash !== "string" || !/^[a-f0-9]{64}$/.test(s.inputHash)
      || ![s.check1, s.check2, s.eventNetResult, s.partnersPaidTotal].every(finite)
      || !Array.isArray(s.nodes) || !s.nodes.length) v2fail();
    const b = contractRecord(s.basis, ["expenseSource", "includeOverhead"]);
    if (!["realized", "committed"].includes(b.expenseSource as string) || typeof b.includeOverhead !== "boolean") v2fail();
    const nodeIds = new Set<string>();
    const participantIds = new Set<string>();
    for (const node of s.nodes as unknown[]) {
      const n = contractRecord(node, ["id", "name", "parentId", "parentQuota", "parentSharePct", "parentQuotaBasis", "resultNet", "resultGross", "moneyNet", "participants", "contract", "documentLineIds"]);
      if (!str(n.id) || !str(n.name) || nodeIds.has(n.id) || (n.parentId !== null && !str(n.parentId))
        || (n.parentQuota !== null && !finite(n.parentQuota)) || (n.parentSharePct !== null && (!finite(n.parentSharePct) || n.parentSharePct < 0 || n.parentSharePct > 100))
        || (n.parentQuotaBasis !== null && !["net_result", "net_result_gross_expenses"].includes(n.parentQuotaBasis as string))
        || ![n.resultNet, n.resultGross, n.moneyNet].every(finite) || !Array.isArray(n.participants) || !uniqueStrings(n.documentLineIds)) v2fail();
      nodeIds.add(n.id as string);
      const contract = validateV2Contract(n.contract, n.id as string);
      if (contract.basisOrigin !== (n.parentId === null ? "partner_calc_basis" : "parent_share_basis")) v2fail();
      if (n.parentId === null ? contract.revisions.length !== 1 : contract.revisions[1]?.settlementId !== n.parentId) v2fail();
      const nodeParticipants = n.participants as unknown as SealSnapshotParticipantV2[];
      if (contract.includeOverhead && nodeParticipants.some((p) => p.supportsOverhead === false)
        && nodeParticipants.filter((p) => p.mode === "settles").length < 2) v2fail();
      for (const participant of n.participants as unknown[]) {
        const p = contractRecord(participant, ["id", "name", "kind", "mode", "effectivePct", "share", "shareNet", "settlementAmount", "supportsOverhead", "shareBase", "overheadRelief", "shareFinal", "overheadSourceLineIds"]);
        if (!str(p.id) || !str(p.name) || participantIds.has(p.id) || !["house", "partner"].includes(p.kind as string)
          || !["settles", "nominal"].includes(p.mode as string) || typeof p.supportsOverhead !== "boolean"
          || ![p.effectivePct, p.share, p.shareNet, p.settlementAmount, p.shareBase, p.overheadRelief, p.shareFinal].every(finite)
          || (p.effectivePct as number) < 0 || (p.effectivePct as number) > 100 || !uniqueStrings(p.overheadSourceLineIds)
          || p.share !== p.shareFinal || roundCents((p.shareFinal as number) - (p.shareBase as number)) !== p.overheadRelief) v2fail();
        const active = p.kind === "partner" && p.mode === "settles" && !p.supportsOverhead && contract.includeOverhead && contract.basis !== "gross_revenue";
        if ((p.kind === "house" || p.mode === "nominal") && !p.supportsOverhead) v2fail();
        if (!active && p.overheadRelief !== 0) v2fail();
        if (p.overheadRelief !== 0 && !(p.overheadSourceLineIds as string[]).length) v2fail();
        participantIds.add(p.id as string);
      }
    }
    if (!nodeIds.has(s.settlement_id as string)) v2fail();
    // Each included node must reach the selected root; the selected root may itself have an external parent.
    const nodes = s.nodes as unknown as SealSnapshotNodeV2[];
    for (const n of nodes) {
      const visited = new Set<string>();
      let cursor: SealSnapshotNodeV2 | undefined = n;
      while (cursor.id !== s.settlement_id) {
        if (visited.has(cursor.id)) v2fail();
        visited.add(cursor.id);
        cursor = nodes.find((candidate) => candidate.id === cursor!.parentId);
        if (!cursor) v2fail();
      }
    }
    for (const n of nodes) {
      const parent = nodes.find((p) => p.id === n.parentId);
      if (parent && JSON.stringify(n.contract.revisions.slice(1)) !== JSON.stringify(parent.contract.revisions)) v2fail();
    }
    const root = nodes.find((n) => n.id === s.settlement_id)!;
    if (root.parentId !== null && nodeIds.has(root.parentId)) v2fail();
    if (root.contract.expenseSource !== b.expenseSource || root.contract.includeOverhead !== b.includeOverhead) v2fail();
    const r = contractRecord(s.residual, ["declaredBase", "ivaDeductibleBase", "nominalGapBase", "houseOnlyRevenue", "otherBase", "overheadAbsorbedByHouse", "residualFinal", "rest"]);
    if (!Object.values(r).every(finite)) v2fail();
    const explained = [r.declaredBase,r.ivaDeductibleBase,r.nominalGapBase,r.houseOnlyRevenue,r.otherBase,r.overheadAbsorbedByHouse].reduce<number>((sum,n) => sum + (n as number),0);
    if (roundCents((r.residualFinal as number) - explained) !== r.rest || roundCents(r.rest as number) !== roundCents(s.check2 as number)
      || roundCents((s.partnersPaidTotal as number) + (r.residualFinal as number) - (s.eventNetResult as number)) !== roundCents(s.check1 as number)) v2fail();
    return s as unknown as SealSnapshotV2;
  } catch { return null; }
}

/** Construct a detached, validated snapshot; no I/O or server-attestation claim. */
export function buildSealSnapshotV2(snapshot: SealSnapshotV2): SealSnapshotV2 {
  const parsed = parseSealSnapshotV2(JSON.parse(JSON.stringify(snapshot)));
  if (!parsed) throw new Error("Invalid settlement seal v2");
  return parsed;
}
