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
import type { EngineResult, SettlementNodeResult } from "@/lib/event-settlement-engine";

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
  snapshot: SealSnapshot | null | undefined,
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
export function parseSealSnapshot(raw: unknown): SealSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as SealSnapshot;
  if (s.version !== 1 || !Array.isArray(s.nodes)) return null;
  return s;
}
