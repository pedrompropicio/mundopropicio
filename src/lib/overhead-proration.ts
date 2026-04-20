/**
 * Proração de Rateios de Overhead Master → Splits.
 *
 * Regra de negócio:
 * - Overhead lançado num evento Master de turnê é, por natureza, partilhado entre os splits.
 * - Critério default: divisão IGUAL entre N splits (assessoria, jurídico, equipa de escritório
 *   não escalam com receita; partilha equitativa é o critério mais previsível).
 * - O Master mantém a linha original (informativa para reporting consolidado).
 * - Cada Split passa a "ver" virtualmente a sua fatia (amount / N) com a flag
 *   `_overhead_via_master = true` para badge "via Master".
 * - Eventos sem splits (simples ou Master sem filhos): comportamento inalterado, a linha
 *   fica no próprio evento.
 *
 * Esta proração é VIRTUAL: não cria registos no DB. Apenas expande o array em memória
 * para os relatórios (DRE, BP, Acerto com Sócios, Análise de Resultados).
 */

export interface OverheadLike {
  id: string;
  event_id: string;
  amount: number | string;
  description?: string;
  category_id?: string | null;
  account_categories?: { code: string; name: string } | null;
  [key: string]: any;
}

export interface EventLike {
  id: string;
  parent_event_id?: string | null;
  [key: string]: any;
}

export interface ExpandedOverhead extends OverheadLike {
  /** True quando esta linha é uma fatia virtual derivada do Master. */
  _overhead_via_master?: boolean;
  /** ID do evento Master original (para rastreabilidade / badge / link). */
  _master_event_id?: string;
  /** Quota desta fatia (ex.: 1/3 quando há 3 splits). */
  _split_share?: number;
}

/**
 * Expande linhas de overhead lançadas em eventos Master para incluir uma fatia
 * virtual em cada split. Linhas em eventos sem splits ficam intactas.
 *
 * @returns Array com:
 *  - Todas as linhas originais preservadas (Master mantém o total para reporting consolidado)
 *  - + 1 linha virtual por split com `event_id` reescrito e `amount / N`
 */
export function expandOverheadToSplits(
  overheads: OverheadLike[],
  events: EventLike[],
): ExpandedOverhead[] {
  // Indexa splits por Master
  const splitsByMaster: Record<string, string[]> = {};
  for (const ev of events) {
    if (ev.parent_event_id) {
      if (!splitsByMaster[ev.parent_event_id]) splitsByMaster[ev.parent_event_id] = [];
      splitsByMaster[ev.parent_event_id].push(ev.id);
    }
  }

  const out: ExpandedOverhead[] = [];

  for (const oh of overheads) {
    out.push(oh as ExpandedOverhead);
    const splits = splitsByMaster[oh.event_id];
    if (!splits || splits.length === 0) continue;

    const share = Number(oh.amount) / splits.length;
    for (const splitId of splits) {
      out.push({
        ...oh,
        id: `${oh.id}::split::${splitId}`,
        event_id: splitId,
        amount: share,
        _overhead_via_master: true,
        _master_event_id: oh.event_id,
        _split_share: 1 / splits.length,
      });
    }
  }

  return out;
}
