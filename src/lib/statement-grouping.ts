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
  | { kind: "tx"; line: T }
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
      /** Saldo acumulado DEPOIS do grupo = saldo da última filha na ordem canónica. */
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
  getRunningBalance: (line: T) => number;
  getDate: (line: T) => string;
  getEventName: (line: T) => string | null;
  /** Índice txId → groupId. Ids ausentes são linhas soltas. */
  byTx: Map<string, string>;
  groups: Map<string, StatementGroup>;
}

export function groupStatementLines<T>(
  lines: T[],
  opts: StatementGroupOptions<T>,
): StatementRenderItem<T>[] {
  const { getId, getAmount, getRunningBalance, getDate, getEventName, byTx, groups } = opts;

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

  const emitted = new Set<string>();
  const out: StatementRenderItem<T>[] = [];

  for (const line of lines) {
    const gid = groupIdFor(line);
    if (!gid) {
      out.push({ kind: "tx", line });
      continue;
    }
    if (emitted.has(gid)) continue;
    emitted.add(gid);

    const children = childrenByGroup.get(gid) ?? [];
    if (children.length === 0) continue;
    const group = groups.get(gid)!;

    const total = children.reduce((s, c) => s + getAmount(c), 0);
    // Saldo do grupo = saldo da ÚLTIMA filha na ordem canónica. As filhas não
    // mostram saldo: um saldo intra-grupo não existe no banco.
    const runningBalance = getRunningBalance(children[children.length - 1]);
    const maxChildDate = children.reduce((mx, c) => {
      const d = getDate(c);
      return d > mx ? d : mx;
    }, "");
    const eventNames = Array.from(
      new Set(children.map((c) => getEventName(c)).filter(Boolean) as string[]),
    );

    out.push({
      kind: "group-header",
      groupId: gid,
      source: group.source,
      date: group.bankDate || maxChildDate,
      description: group.description,
      total,
      bankAmount: group.bankAmount,
      divergence: group.bankAmount == null ? 0 : total - group.bankAmount,
      runningBalance,
      childCount: children.length,
      totalChildCount: Math.max(group.txIds.length, children.length),
      eventLabel:
        eventNames.length === 0
          ? "—"
          : eventNames.length === 1
            ? eventNames[0]
            : `Vários (${eventNames.length})`,
      childIds: children.map(getId),
      children,
    });
    for (const child of children) {
      out.push({ kind: "group-child", line: child, groupId: gid });
    }
  }

  return out;
}
