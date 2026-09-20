/**
 * Reconciliação de bilheteira — lógica pura (issues #128 e #155).
 *
 * A fórmula do saldo NÃO vive aqui: continua em `src/lib/ticket-office-balance.ts`
 * (D-ERP15) e em `public._ticket_office_balance_raw`. Este ficheiro só decompõe o
 * que já foi somado, para que os ecrãs mostrem uma conta que fecha à vista:
 *
 *   (vendas + receitas) − despesas − transferências − adiantamentos = saldo
 *
 * #128: a vista analítica da Auditoria de Bilheteiras agrupa por evento com esta
 * mesma decomposição (antes empurrava adiantamentos e transferências com evento
 * para uma lista genérica e calculava a linha do evento como vendas − despesas).
 * #155: os quatro tiles do painel de liquidez ignoram receitas e movimentos sem
 * evento; `ticketOfficeOtherMovements` devolve o resto que falta para o retido.
 */

export type TicketOfficeLineKind = "sale" | "income" | "expense" | "transfer" | "advance";

export interface TicketOfficeAnalyticalLineLike {
  /** Classe real do movimento. Sem `kind`, cai para `type` (compatibilidade). */
  kind?: TicketOfficeLineKind;
  type?: string;
  /** Positivo em entradas, negativo em saídas. */
  amount: number;
  eventId?: string | null;
  eventName?: string | null;
}

export interface TicketOfficeAnalyticalGroup<L extends TicketOfficeAnalyticalLineLike> {
  eventId?: string;
  eventName: string;
  sales: number;
  income: number;
  expenses: number;
  transfers: number;
  advances: number;
  /** (vendas + receitas) − despesas − transferências − adiantamentos */
  balance: number;
  lines: L[];
}

export interface TicketOfficeAnalyticalDecomposition<L extends TicketOfficeAnalyticalLineLike> {
  groups: TicketOfficeAnalyticalGroup<L>[];
  /** Movimentos sem evento associado (entram no saldo da bilheteira). */
  noEvent: TicketOfficeAnalyticalGroup<L> | null;
  /** Σ dos grupos + sem evento. Tem de bater com o saldo da fonte única. */
  total: number;
}

export const roundCents = (value: number) => Math.round(value * 100) / 100;

export function ticketOfficeLineKind(line: TicketOfficeAnalyticalLineLike): TicketOfficeLineKind {
  if (line.kind) return line.kind;
  const t = String(line.type || "");
  return (t === "sale" || t === "income" || t === "expense" || t === "transfer" || t === "advance"
    ? t
    : "expense") as TicketOfficeLineKind;
}

function emptyGroup<L extends TicketOfficeAnalyticalLineLike>(eventName: string, eventId?: string): TicketOfficeAnalyticalGroup<L> {
  return { eventId, eventName, sales: 0, income: 0, expenses: 0, transfers: 0, advances: 0, balance: 0, lines: [] };
}

function addLine<L extends TicketOfficeAnalyticalLineLike>(group: TicketOfficeAnalyticalGroup<L>, line: L) {
  const abs = Math.abs(Number(line.amount) || 0);
  switch (ticketOfficeLineKind(line)) {
    case "sale": group.sales += abs; break;
    case "income": group.income += abs; break;
    case "expense": group.expenses += abs; break;
    case "transfer": group.transfers += abs; break;
    case "advance": group.advances += abs; break;
  }
  group.lines.push(line);
}

function seal<L extends TicketOfficeAnalyticalLineLike>(g: TicketOfficeAnalyticalGroup<L>) {
  g.sales = roundCents(g.sales);
  g.income = roundCents(g.income);
  g.expenses = roundCents(g.expenses);
  g.transfers = roundCents(g.transfers);
  g.advances = roundCents(g.advances);
  g.balance = roundCents(g.sales + g.income - g.expenses - g.transfers - g.advances);
  return g;
}

/**
 * Agrupa as linhas analíticas por evento com a MESMA decomposição da vista
 * sintética. Linhas sem `eventId` vão para o grupo "sem evento" — contam no
 * total, como contam no saldo.
 */
export function decomposeTicketOfficeAnalytical<L extends TicketOfficeAnalyticalLineLike>(
  lines: L[],
  noEventLabel = "Sem evento associado",
): TicketOfficeAnalyticalDecomposition<L> {
  const byEvent = new Map<string, TicketOfficeAnalyticalGroup<L>>();
  let noEvent: TicketOfficeAnalyticalGroup<L> | null = null;

  lines.forEach((line) => {
    const eventId = line.eventId || undefined;
    if (!eventId) {
      if (!noEvent) noEvent = emptyGroup<L>(noEventLabel);
      addLine(noEvent, line);
      return;
    }
    let group = byEvent.get(eventId);
    if (!group) {
      group = emptyGroup<L>(line.eventName || eventId, eventId);
      byEvent.set(eventId, group);
    }
    addLine(group, line);
  });

  const groups = [...byEvent.values()].map(seal);
  if (noEvent) seal(noEvent);
  const total = roundCents(groups.reduce((s, g) => s + g.balance, 0) + (noEvent ? (noEvent as TicketOfficeAnalyticalGroup<L>).balance : 0));

  return { groups, noEvent, total };
}

/**
 * #155 — resto entre o retido (fonte única) e os quatro tiles do painel.
 * Inclui receitas lançadas como transação e movimentos sem evento associado.
 */
export function ticketOfficeOtherMovements(
  retained: number,
  tiles: { sales: number; expenses: number; transfers: number; advances: number },
): number {
  const fromTiles = tiles.sales - tiles.expenses - tiles.transfers - tiles.advances;
  return roundCents(retained - fromTiles);
}
