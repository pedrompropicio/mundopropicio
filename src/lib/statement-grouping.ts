/**
 * Consolidação de movimentos do banco no Extrato da Conta.
 *
 * Função PURA, no molde de `src/lib/refund-grouping.ts`: recebe o `lines` já
 * calculado (plano, canónico, com `runningBalance` e `signedAmount`) mais um
 * índice `txId → grupo`, e devolve uma lista heterogénea de render items
 * preservando a ordem canónica.
 *
 * REGRA ABSOLUTA: isto NÃO substitui o `lines`. O `lines` continua a ser a
 * fonte do `runningBalance`, do `closingBalance`, dos totais e das duas
 * exportações. Aqui só se decide o que se DESENHA.
 *
 * Um grupo representa UM movimento do banco (um lote SEPA, ou uma linha do
 * extrato conciliada manualmente com N transações). Não toca a DB, não faz I/O.
 */

export interface StatementGroup {
  /** Id estável do grupo (id da linha do banco, ou do export SEPA no recurso). */
  groupId: string;
  /** `bank` = confirmado pelo extrato importado; `sepa` = recurso pelo lote. */
  source: "bank" | "sepa";
  /** `booking_date` da linha do banco (só na fonte `bank`). */
  bankDate: string | null;
  /** Descrição da linha do banco, ou "Lote SEPA · <msg_id>" no recurso. */
  description: string;
  /** Valor com sinal da linha do banco, quando existe. */
  bankAmount: number | null;
  /** Todas as transações do grupo, independentemente de filtros. */
  txIds: string[];
}

export type StatementRenderItem<T> =
  | {
      kind: "tx";
      line: T;
      /** Saldo acumulado DEPOIS desta linha, na ordem CONSOLIDADA. */
      runningBalance: number;
    }
  | {
      kind: "group-header";
      groupId: string;
      source: "bank" | "sepa";
      /** Data a mostrar: a do banco quando existe, senão a máxima das filhas. */
      date: string;
      description: string;
      /** Soma dos `signedAmount` das filhas visíveis. */
      total: number;
      bankAmount: number | null;
      /** total − bankAmount (retenção na fonte nos lotes SEPA). 0 se não houver linha do banco. */
      divergence: number;
      /** Saldo acumulado DEPOIS do grupo, na ordem CONSOLIDADA. */
      runningBalance: number;
      childCount: number;
      totalChildCount: number;
      /** Evento único, ou `Vários (N)`, ou `—`. */
      eventLabel: string;
      childIds: string[];
      children: T[];
    }
  | { kind: "group-child"; line: T; groupId: string };

export interface StatementGroupOptions<T> {
  getId: (line: T) => string;
  /** Valor com sinal da linha (entrada positiva, saída negativa). */
  getAmount: (line: T) => number;
  getDate: (line: T) => string;
  getEventName: (line: T) => string | null;
  /** Saldo antes da primeira unidade. O acumulado da consolidação parte daqui. */
  openingBalance: number;
  /** Índice txId → groupId. Ids ausentes são linhas soltas. */
  byTx: Map<string, string>;
  groups: Map<string, StatementGroup>;
}

/** Linha pseudo dos ajustes de caixa: fica sempre em último, seja qual for a data. */
const CASH_ADJUSTMENTS_ID = "__cash_adjustments__";

export function groupStatementLines<T>(
  lines: T[],
  opts: StatementGroupOptions<T>,
): StatementRenderItem<T>[] {
  const { getId, getAmount, getDate, getEventName, openingBalance, byTx, groups } = opts;

  const groupIdFor = (line: T): string | null => {
    const gid = byTx.get(getId(line));
    if (!gid) return null;
    const g = groups.get(gid);
    // Um movimento que cobre uma transação só NÃO forma grupo.
    if (!g || g.txIds.length <= 1) return null;
    return gid;
  };

  // Filhas visíveis por grupo, pela ordem canónica.
  const childrenByGroup = new Map<string, T[]>();
  for (const line of lines) {
    const gid = groupIdFor(line);
    if (!gid) continue;
    const arr = childrenByGroup.get(gid) ?? [];
    arr.push(line);
    childrenByGroup.set(gid, arr);
  }

  // ---- 1. Unidades: uma transação solta OU um grupo com as suas filhas -----
  // O saldo NÃO pode ser herdado do `lines` plano: ao consolidar, as filhas são
  // puxadas para junto do cabeçalho e as linhas soltas que estavam intercaladas
  // passam a ser desenhadas numa posição que já não corresponde ao ponto da
  // sequência onde o seu saldo plano foi calculado. Por isso o saldo mostrado é
  // recalculado sobre a ordem consolidada.
  type Unit =
    | { kind: "tx"; line: T; date: string; delta: number; last: boolean }
    | { kind: "group"; gid: string; children: T[]; date: string; delta: number; last: boolean };

  const units: Unit[] = [];
  const emitted = new Set<string>();

  for (const line of lines) {
    const gid = groupIdFor(line);
    if (!gid) {
      const id = getId(line);
      units.push({
        kind: "tx",
        line,
        date: getDate(line),
        delta: getAmount(line),
        last: id === CASH_ADJUSTMENTS_ID,
      });
      continue;
    }
    if (emitted.has(gid)) continue;
    emitted.add(gid);
    const children = childrenByGroup.get(gid) ?? [];
    if (children.length === 0) continue;
    const group = groups.get(gid)!;
    const maxChildDate = children.reduce((mx, c) => {
      const d = getDate(c);
      return d > mx ? d : mx;
    }, "");
    units.push({
      kind: "group",
      gid,
      children,
      // O que o banco diz manda; no recurso `sepa` não há data do banco.
      date: (group.source === "bank" ? group.bankDate : null) || maxChildDate,
      delta: children.reduce((s, c) => s + getAmount(c), 0),
      last: false,
    });
  }

  // Ordenação ESTÁVEL por data da unidade, com os ajustes de caixa no fim.
  const ordered = units
    .map((u, i) => ({ u, i }))
    .sort((a, b) => {
      if (a.u.last !== b.u.last) return a.u.last ? 1 : -1;
      const d = a.u.date.localeCompare(b.u.date);
      return d !== 0 ? d : a.i - b.i;
    })
    .map((x) => x.u);

  // ---- 2. Acumular sobre a ordem consolidada ------------------------------
  const out: StatementRenderItem<T>[] = [];
  let balance = openingBalance;

  for (const unit of ordered) {
    balance += unit.delta;
    if (unit.kind === "tx") {
      out.push({ kind: "tx", line: unit.line, runningBalance: balance });
      continue;
    }

    const group = groups.get(unit.gid)!;
    const eventNames = Array.from(
      new Set(unit.children.map((c) => getEventName(c)).filter(Boolean) as string[]),
    );

    out.push({
      kind: "group-header",
      groupId: unit.gid,
      source: group.source,
      date: unit.date,
      description: group.description,
      total: unit.delta,
      bankAmount: group.bankAmount,
      divergence: group.bankAmount == null ? 0 : unit.delta - group.bankAmount,
      runningBalance: balance,
      childCount: unit.children.length,
      totalChildCount: Math.max(group.txIds.length, unit.children.length),
      eventLabel:
        eventNames.length === 0
          ? "—"
          : eventNames.length === 1
            ? eventNames[0]
            : `Vários (${eventNames.length})`,
      childIds: unit.children.map(getId),
      children: unit.children,
    });
    // 3. As filhas continuam sem saldo: um saldo intra-grupo não existe no banco.
    for (const child of unit.children) {
      out.push({ kind: "group-child", line: child, groupId: unit.gid });
    }
  }

  return out;
}

