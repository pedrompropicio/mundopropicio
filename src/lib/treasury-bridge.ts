import { parseSealSnapshot } from "@/lib/settlement-seal";

export const TREASURY_DIAGNOSTIC = "Durante a importação, a Tesouraria lê-se como diagnóstico";
export const TREASURY_CURRENT_STATE = "Só o caixa cedido ao pool (realizado) muda com o período. Comprometido e pendente são sempre o estado actual.";
export const TREASURY_LIVE_PARTNERS = "Sócios externos por liquidar: sempre ao vivo, incluindo eventos selados.";

export interface TreasuryAmounts {
  result: number;
  committed: number;
  retained: number;
  realized: number;
  partners: number;
  pending: number;
}
export interface TreasuryCashRow {
  level: "event" | "common";
  event_id: string | null;
  master_event_id: string | null;
  parent_event_id: string | null;
  event_name: string;
  committed: number;
  realized: number;
  pending: number;
}
export interface TreasuryMaster {
  id: string;
  name: string;
  businessLineId: string | null;
  result: number;
  partners: number;
  participation: number;
  origin: "selado" | "base corrente";
}
export interface TreasuryNode {
  id: string;
  name: string;
  amounts: TreasuryAmounts;
  children: TreasuryNode[];
  kind: "company" | "line" | "master" | "cash";
  participation?: number;
  origin?: TreasuryMaster["origin"];
}
export const emptyTreasuryAmounts = (): TreasuryAmounts => ({ result: 0, committed: 0, retained: 0, realized: 0, partners: 0, pending: 0 });
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
export function sumTreasuryAmounts(values: TreasuryAmounts[]): TreasuryAmounts {
  const out = emptyTreasuryAmounts();
  for (const key of Object.keys(out) as (keyof TreasuryAmounts)[]) {
    out[key] = values.reduce((sum, v) => sum + cents(v[key]), 0) / 100;
  }
  return out;
}

/** Signed rows 1–5; row 8 is informational and only enters row 2 in the pending column. */
export function treasuryColumns(a: TreasuryAmounts) {
  const column = (pending: boolean) => {
    const rows = [a.result, (cents(a.committed) + (pending ? cents(a.pending) : 0)) / 100, -a.retained, -a.realized, -a.partners];
    return { rows, available: rows.reduce((sum, value) => sum + cents(value), 0) / 100 };
  };
  return { withoutPending: column(false), withPending: column(true) };
}

/** The live engine is lazy: a usable closed-event snapshot never computes row 1 again. */
export function treasuryEventResult(stage: string, snapshots: unknown[], current: () => number): Pick<TreasuryMaster, "result" | "origin"> {
  if (stage === "fechado") {
    for (const raw of snapshots) {
      const s = parseSealSnapshot(raw);
      if (s?.basis && ["realized", "committed"].includes(s.basis.expenseSource)
        && typeof s.basis.includeOverhead === "boolean" && Number.isFinite(s.eventNetResult)) {
        return { result: s.eventNetResult, origin: "selado" };
      }
    }
  }
  const result = current();
  if (!Number.isFinite(result)) throw new Error("Resultado do evento inválido.");
  return { result, origin: "base corrente" };
}

/** Masters already contain the family result/partner account. Only cash and retained are rolled up here. */
export function buildTreasuryBridge(input: {
  masters: TreasuryMaster[];
  cash: TreasuryCashRow[];
  retained: Record<string, number>;
  events: { id: string; name: string; parent_event_id: string | null }[];
  businessLines: { id: string; name: string }[];
}) {
  const byId = new Map(input.events.map(e => [e.id, e]));
  const masters = input.masters.map((m): TreasuryNode => {
    const familyIds = new Set([m.id, ...input.events.filter(e => e.parent_event_id === m.id).map(e => e.id)]);
    const cash = input.cash.filter(r => r.level === "event" && (r.master_event_id === m.id || (r.event_id && familyIds.has(r.event_id))));
    cash.forEach(r => { if (r.event_id) familyIds.add(r.event_id); });
    const children = [...familyIds].map((id): TreasuryNode => {
      const rows = cash.filter(r => r.event_id === id);
      return {
        id, name: id === m.id ? `${m.name} · movimentos do Master` : (byId.get(id)?.name ?? rows[0]?.event_name ?? id),
        kind: "cash", children: [], amounts: sumTreasuryAmounts(rows.map(r => ({ ...emptyTreasuryAmounts(), committed: r.committed, realized: r.realized, pending: r.pending }))),
      };
    });
    children.forEach(child => { child.amounts.retained = input.retained[child.id] ?? 0; });
    return {
      id: m.id, name: m.name, kind: "master", children, origin: m.origin, participation: m.participation,
      amounts: { ...sumTreasuryAmounts(children.map(c => c.amounts)), result: m.result, partners: m.partners },
    };
  });
  const lines = [...input.businessLines, { id: "unassigned", name: "Sem linha" }].map((line): TreasuryNode => {
    const children = masters.filter(m => {
      const id = input.masters.find(source => source.id === m.id)!.businessLineId;
      return (id && input.businessLines.some(l => l.id === id) ? id : "unassigned") === line.id;
    });
    return { id: line.id, name: line.name, kind: "line", children, amounts: sumTreasuryAmounts(children.map(m => m.amounts)) };
  });
  const company: TreasuryNode = { id: "company", name: "Empresa · eventos", kind: "company", children: lines, amounts: sumTreasuryAmounts(lines.map(l => l.amounts)) };
  const common: TreasuryNode = {
    id: "common", name: "Comuns", kind: "cash", children: [],
    amounts: sumTreasuryAmounts(input.cash.filter(r => r.level === "common").map(r => ({ ...emptyTreasuryAmounts(), committed: r.committed, realized: r.realized, pending: r.pending }))),
  };
  return { company, common };
}
