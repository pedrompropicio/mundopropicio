/**
 * #218 (D-ERP228) — O BP é o custo do evento nos relatórios (DRE, DRE Empresarial,
 * Rentabilidade). Decisão do Pedro de 19/09/2026 (D-ERP3 aplicada aos relatórios).
 *
 * NÃO é uma segunda regra: o custo de cada evento é `computeEventCostOnBasis`
 * (a MESMA função da capa, do Fecho e do Encontro de Contas), no critério
 * GRAVADO no evento (`events.cost_expense_source`: committed = Σ BP aprovado +
 * excesso por rubrica, i.e. max(previsto, realizado) por rubrica; realized =
 * transações válidas). Aqui só se itemiza esse total por rubrica para o DRE
 * poder agrupar por L2/L3 — Σ das linhas = total da função (testado).
 *
 * Regras operacionais (escritas também em DECISIONS):
 *  • PERÍODO: uma linha de BP não tem data. O período de TODO o custo de um
 *    evento vindo do BP é a data do evento (`events.date`) — `bpLinePeriodDate`.
 *  • DUAS PORTAS: no modo BP, transações de despesa COM `event_id` ficam fora do
 *    ramo de transações (o custo delas já está dentro do BP do evento). Só as
 *    despesas sem evento (estrutura) vêm das transações — `transactionBranch`.
 *  • Base s/IVA (o DRE trabalha em base líquida; a coluna IVA é informativa).
 *  • Overhead (is_overhead) fica de fora (includeOverhead=false): os rateios são
 *    estrutura e já entram pelas transações sem evento / Vista Sócio.
 *  • Receita: NÃO muda (continua pelas transações/ticket_sales) — pendente.
 *  • Linha viva (`version_id IS NULL`) — viva vs congelada é DECISÃO PENDENTE.
 *
 * O modo "transactions" existe só para comparação no ecrã; nunca é gravado.
 */
import {
  computeEventCostOnBasis,
  computeOutsideBpExcessLines,
  isApprovedOperationalForecast,
  type EventCostMode,
} from "@/lib/event-cost-basis";
import { isValidFechoTransaction } from "@/lib/fecho-filters";

export type ReportCostSource = "bp" | "transactions";

export const REPORT_COST_SOURCE_LABEL: Record<ReportCostSource, string> = {
  bp: "BP (padrão)",
  transactions: "Transações (comparação)",
};

/** Período de uma linha de BP = data do evento (yyyy-MM-dd). */
export function bpLinePeriodDate(event: { date?: string | null } | null | undefined): string | null {
  const d = event?.date;
  return typeof d === "string" && d.length >= 10 ? d.slice(0, 10) : null;
}

/** Critério de custo gravado no evento (default committed, como o hook). */
export function eventCostMode(event: { cost_expense_source?: string | null } | null | undefined): EventCostMode {
  return event?.cost_expense_source === "realized" ? "realized" : "committed";
}

/**
 * Trava "nunca pelas duas portas": no modo BP, devolve só as transações SEM
 * evento (as de evento estão no BP). No modo transações devolve tudo.
 */
export function transactionBranch<T extends { event_id?: string | null }>(
  transactions: T[],
  source: ReportCostSource,
): T[] {
  if (source === "transactions") return transactions;
  return transactions.filter((t) => !t.event_id);
}

export interface ReportCostLine {
  event_id: string;
  category_id: string | null;
  /** base s/IVA */
  amount: number;
  iva_rate: number;
  type: "expense";
  _source: "bp" | "bp_excess" | "tx";
}

export interface EventCostLinesArgs {
  eventId: string;
  /** event_forecasts do evento (já no perímetro da raiz). */
  forecasts: any[];
  /** transactions do evento (já no perímetro da raiz), sem pré-filtro de estado. */
  transactions: any[];
  mode: EventCostMode;
}

/** Custo do evento itemizado por rubrica; Σ amount = computeEventCostOnBasis(...).total s/IVA. */
export function eventCostLines(args: EventCostLinesArgs): ReportCostLine[] {
  const { eventId, mode } = args;
  const fc = (args.forecasts ?? []).filter((f) => f.type === undefined || f.type === "expense");
  const tx = (args.transactions ?? []).filter((t) => t.type === undefined || t.type === "expense");

  if (mode === "realized") {
    return tx.filter(isValidFechoTransaction).map((t) => ({
      event_id: eventId,
      category_id: t.category_id ?? null,
      amount: Number(t.amount || 0),
      iva_rate: Number(t.iva_rate || 0),
      type: "expense" as const,
      _source: "tx" as const,
    }));
  }

  const operational = fc.filter(isApprovedOperationalForecast);
  const validTx = tx.filter(isValidFechoTransaction);
  const out: ReportCostLine[] = operational.map((f) => ({
    event_id: eventId,
    category_id: f.category_id ?? null,
    amount: Number(f.amount || 0),
    iva_rate: Number(f.iva_rate || 0),
    type: "expense" as const,
    _source: "bp" as const,
  }));
  for (const ex of computeOutsideBpExcessLines(operational, validTx)) {
    if (!(ex.net > 0)) continue;
    out.push({
      event_id: eventId,
      category_id: ex.categoryId,
      amount: ex.net,
      iva_rate: ex.gross > ex.net ? (ex.gross / ex.net - 1) * 100 : 0,
      type: "expense",
      _source: "bp_excess",
    });
  }
  return out;
}

/** Total s/IVA do custo do evento — atalho que chama a função única. */
export function eventCostTotal(args: Omit<EventCostLinesArgs, "eventId">): number {
  return computeEventCostOnBasis({
    forecasts: (args.forecasts ?? []).filter((f) => f.type === undefined || f.type === "expense"),
    transactions: (args.transactions ?? []).filter((t) => t.type === undefined || t.type === "expense"),
    mode: args.mode,
    withVat: false,
    includeOverhead: false,
  }).total;
}

/** Agrupa linhas por event_id (helper para os ecrãs). */
export function groupByEvent<T extends { event_id?: string | null }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.event_id) continue;
    const a = m.get(r.event_id);
    if (a) a.push(r);
    else m.set(r.event_id, [r]);
  }
  return m;
}
