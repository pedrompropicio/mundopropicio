import { parseSealSnapshot } from "@/lib/settlement-seal";

export const TREASURY_STAGES = new Set(["planeamento", "em_curso", "em_fecho", "fechado"]);
export const TREASURY_NOTES = [
  "Durante a importação, a Tesouraria lê-se como diagnóstico",
  "O comprometido e o pendente são sempre o estado actual; o período só filtra o caixa realizado.",
  "A linha 5 (sócios externos por liquidar) é sempre ao vivo, mesmo nos eventos selados.",
  "O total da empresa soma os eventos elegíveis; Comuns aparece à parte, sem distribuição por linha de negócio.",
] as const;

export interface TreasuryAmounts {
  result: number;
  committed: number;
  retained: number;
  realized: number;
  partnersDue: number;
  pending: number;
}
export interface TreasuryColumns {
  withoutPending: number[];
  withPending: number[];
}
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function treasuryNumber(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") || value === "" || !Number.isFinite(Number(value))) {
    throw new Error("Valor financeiro indisponível na Tesouraria.");
  }
  return Number(value);
}
export const emptyTreasuryAmounts = (): TreasuryAmounts => ({ result: 0, committed: 0, retained: 0, realized: 0, partnersDue: 0, pending: 0 });

/** Linhas com sinal; pendentes entram exclusivamente no timing da segunda coluna. */
export function treasuryColumns(amounts: TreasuryAmounts): TreasuryColumns {
  Object.values(amounts).forEach(treasuryNumber);
  const first = [amounts.result, amounts.committed, -amounts.retained, -amounts.realized, -amounts.partnersDue].map(cents);
  const second = [...first];
  second[1] = cents(amounts.committed + amounts.pending);
  return {
    withoutPending: [...first, cents(first.reduce((a, b) => a + b, 0))],
    withPending: [...second, cents(second.reduce((a, b) => a + b, 0))],
  };
}

export interface TreasuryEvent {
  id: string;
  name: string;
  parent_event_id: string | null;
  business_line_id?: string | null;
}
export interface TreasuryCashRow {
  level: "event" | "common";
  event_id: string | null;
  master_event_id: string | null;
  committed: number;
  realized: number;
  pending: number;
}
export interface TreasuryEventResult {
  result: number;
  source: "selado" | "base corrente";
  partnersDue: number;
  housePct: number;
}
export interface TreasuryNode {
  id: string;
  name: string;
  amounts: TreasuryAmounts;
  children: TreasuryNode[];
  source?: TreasuryEventResult["source"];
  housePct?: number;
  /** O motor apura o Master inteiro: os subs detalham apenas as linhas 2–4 e 8. */
  cashDetail?: boolean;
}
export interface TreasuryBridge {
  company: TreasuryNode;
  common: TreasuryNode;
}
export const TREASURY_ROW_LABELS = [
  "1. Resultado do evento", "2. ± Timing", "3. − Retido na bilheteira",
  "4. − Caixa cedido ao pool", "5. − Sócios externos por liquidar", "6. Disponibilidade real",
] as const;
export function treasuryDisplayRows(node: TreasuryNode) {
  const columns = treasuryColumns(node.amounts);
  return TREASURY_ROW_LABELS.map((label, index) => ({
    label,
    withoutPending: node.cashDetail && [0, 4, 5].includes(index) ? null : columns.withoutPending[index],
    withPending: node.cashDetail && [0, 4, 5].includes(index) ? null : columns.withPending[index],
  }));
}
function sumAmounts(nodes: TreasuryNode[]): TreasuryAmounts {
  const total = emptyTreasuryAmounts();
  for (const node of nodes) for (const key of Object.keys(total) as (keyof TreasuryAmounts)[]) total[key] = cents(total[key] + node.amounts[key]);
  return total;
}

/** O resultado e os sócios do bundle já incluem os subs: somá-los outra vez duplicaria o Master. */
export function buildTreasuryBridge(input: {
  events: TreasuryEvent[];
  stages: Record<string, string>;
  businessLines: { id: string; name: string }[];
  cash: TreasuryCashRow[];
  retained: Record<string, number>;
  results: Record<string, TreasuryEventResult>;
}): TreasuryBridge {
  const eventById = new Map(input.events.map((event) => [event.id, event]));
  for (const row of input.cash) {
    if (row.level !== "event") continue;
    const event = row.event_id ? eventById.get(row.event_id) : undefined;
    if (!event || row.master_event_id !== (event.parent_event_id ?? event.id)) {
      throw new Error("Hierarquia do caixa divergente dos eventos. Atualize a Tesouraria.");
    }
  }
  const cashFor = (eventId: string | null): TreasuryAmounts => {
    const out = emptyTreasuryAmounts();
    for (const row of input.cash.filter((r) => eventId === null ? r.level === "common" : r.level === "event" && r.event_id === eventId)) {
      out.committed = cents(out.committed + treasuryNumber(row.committed));
      out.realized = cents(out.realized + treasuryNumber(row.realized));
      out.pending = cents(out.pending + treasuryNumber(row.pending));
    }
    if (eventId !== null) out.retained = treasuryNumber(input.retained[eventId] ?? 0);
    return out;
  };
  const masters = input.events.filter((e) => !e.parent_event_id && TREASURY_STAGES.has(input.stages[e.id]));
  const groups = new Map<string, TreasuryNode>();
  for (const master of masters) {
    const result = input.results[master.id];
    if (!result) throw new Error(`Resultado indisponível: ${master.name}`);
    treasuryNumber(result.result); treasuryNumber(result.partnersDue); treasuryNumber(result.housePct);
    const memberIds = new Set(input.cash.filter((row) => row.level === "event" && row.master_event_id === master.id).map((row) => row.event_id));
    const children: TreasuryNode[] = input.events.filter((e) => e.id !== master.id && (e.parent_event_id === master.id || memberIds.has(e.id))).map((e) => ({
      id: e.id, name: e.name, amounts: cashFor(e.id), children: [], cashDetail: true,
    }));
    const amounts = sumAmounts([{ id: master.id, name: master.name, amounts: cashFor(master.id), children: [] }, ...children]);
    amounts.result = result.result;
    amounts.partnersDue = result.partnersDue;
    const node: TreasuryNode = { id: master.id, name: master.name, amounts, children, source: result.source, housePct: result.housePct };
    const line = input.businessLines.find((l) => l.id === master.business_line_id);
    if (master.business_line_id && !line) throw new Error(`Linha de negócio indisponível: ${master.name}`);
    const key = line?.id ?? "no-business-line";
    if (!groups.has(key)) groups.set(key, { id: key, name: line?.name ?? "Sem linha", amounts: emptyTreasuryAmounts(), children: [] });
    groups.get(key)!.children.push(node);
  }
  const lines = [...groups.values()].sort((a, b) => {
    if (a.id === "no-business-line") return 1;
    if (b.id === "no-business-line") return -1;
    return input.businessLines.findIndex((l) => l.id === a.id) - input.businessLines.findIndex((l) => l.id === b.id);
  });
  for (const line of lines) line.amounts = sumAmounts(line.children);
  return {
    company: { id: "company", name: "Empresa", amounts: sumAmounts(lines), children: lines },
    common: { id: "common", name: "Comuns", amounts: cashFor(null), children: [], cashDetail: true },
  };
}

/** Leitura preguiçosa: um selo utilizável nunca chama o motor para a linha 1. */
export function resolveTreasuryResult(stage: string, seals: { parent_id: string | null; is_sealed: boolean; sealed_snapshot: unknown }[], current: () => number): Pick<TreasuryEventResult, "result" | "source"> {
  if (stage === "fechado") {
    const snapshots = seals.filter((s) => s.is_sealed && !s.parent_id).map((s) => parseSealSnapshot(s.sealed_snapshot))
      .filter((s) => s && s.basis && ["realized", "committed"].includes(s.basis.expenseSource)
        && typeof s.basis.includeOverhead === "boolean" && typeof s.eventNetResult === "number" && Number.isFinite(s.eventNetResult));
    if (snapshots.length) {
      const result = snapshots[0]!.eventNetResult;
      if (snapshots.some((s) => s!.eventNetResult !== result)) throw new Error("Selos com resultados divergentes.");
      return { result, source: "selado" };
    }
  }
  return { result: treasuryNumber(current()), source: "base corrente" };
}

export interface TreasuryPeriod { from: string | null; to: string | null }
export function treasuryPeriod(params: URLSearchParams): TreasuryPeriod {
  const read = (key: string) => {
    const value = params.get(key);
    if (!value) return null;
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Período inválido.");
    return value;
  };
  const period = { from: read("de"), to: read("ate") };
  if (period.from && period.to && period.from > period.to) throw new Error("A data inicial deve ser anterior à data final.");
  return period;
}
export const treasuryDateLabel = (iso: string | null) => iso ? iso.split("-").reverse().join("/") : "sem limite";
export const treasuryPeriodLabel = (period: TreasuryPeriod, periodMode = !!(period.from || period.to)) => periodMode
  ? `Período: ${treasuryDateLabel(period.from)} a ${treasuryDateLabel(period.to)}` : "Tempo real";
