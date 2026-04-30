// Lógica de absorção de custos corporativos (Group 10) por evento ativo.
//
// Regra (Fase 3):
//  - Categoria L3 do Group 10 com `allocate_to_active_event = true` é candidata a absorção.
//  - Transação dessa categoria é absorvida pelo evento que tenha:
//      * `absorbs_admin_costs = true`
//      * `admin_window_start <= data <= admin_window_end` (datas locais YYYY-MM-DD)
//      * NÃO seja Split (parent_event_id IS NULL)
//  - Quando há múltiplos eventos elegíveis, escolhe-se o mais próximo da data
//    (menor distância em dias até `event.date`).
//  - Transação absorvida deixa de aparecer no DRE Empresarial e passa a contar
//    no DRE do evento absorvedor.

export interface AbsorbingEvent {
  id: string;
  date: string; // YYYY-MM-DD
  parent_event_id: string | null;
  absorbs_admin_costs: boolean | null;
  admin_window_start: string | null;
  admin_window_end: string | null;
}

export interface AllocatableCategory {
  id: string;
  code: string;
  allocate_to_active_event: boolean | null;
}

export interface AllocatableTransaction {
  id: string;
  category_id: string | null;
  event_id: string | null;
  date: string | null;
  payment_date: string | null;
}

/**
 * Constrói um índice das categorias corporativas (Group 10) com flag de absorção ativa.
 */
export function buildAllocatableCategorySet(categories: AllocatableCategory[]): Set<string> {
  return new Set(
    categories
      .filter((c) => c.code?.startsWith("10") && c.allocate_to_active_event === true)
      .map((c) => c.id)
  );
}

/**
 * Devolve a lista de eventos absorvedores válidos (Master/Single, com flag e janela).
 */
export function getAbsorbingEvents(events: AbsorbingEvent[]): AbsorbingEvent[] {
  return events.filter(
    (e) =>
      e.absorbs_admin_costs === true &&
      !e.parent_event_id &&
      !!e.admin_window_start &&
      !!e.admin_window_end
  );
}

function dayDistance(a: string, b: string): number {
  // Comparação em dias (YYYY-MM-DD), evitando timezones.
  const da = Date.parse(a + "T00:00:00Z");
  const db = Date.parse(b + "T00:00:00Z");
  if (isNaN(da) || isNaN(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(da - db) / 86400000;
}

/**
 * Para uma transação corporativa absorvível, devolve o id do evento absorvedor
 * (ou null se nenhum elegível).
 */
export function findAbsorbingEventId(
  tx: AllocatableTransaction,
  allocatableCatIds: Set<string>,
  absorbingEvents: AbsorbingEvent[]
): string | null {
  if (!tx.category_id || !allocatableCatIds.has(tx.category_id)) return null;
  const refDate = tx.payment_date || tx.date;
  if (!refDate) return null;

  // Eventos cuja janela contém a data
  const eligible = absorbingEvents.filter(
    (e) =>
      e.admin_window_start! <= refDate &&
      refDate <= e.admin_window_end!
  );
  if (eligible.length === 0) return null;
  if (eligible.length === 1) return eligible[0].id;

  // Desempate: evento mais próximo da data da transação
  let best = eligible[0];
  let bestDist = dayDistance(best.date, refDate);
  for (let i = 1; i < eligible.length; i++) {
    const d = dayDistance(eligible[i].date, refDate);
    if (d < bestDist) {
      best = eligible[i];
      bestDist = d;
    }
  }
  return best.id;
}

/**
 * Mapeia transações → eventId absorvedor. Útil para uso em massa.
 */
export function buildAbsorptionMap(
  transactions: AllocatableTransaction[],
  categories: AllocatableCategory[],
  events: AbsorbingEvent[]
): Map<string, string> {
  const allocatableCatIds = buildAllocatableCategorySet(categories);
  const absorbingEvents = getAbsorbingEvents(events);
  const map = new Map<string, string>();
  for (const tx of transactions) {
    const eid = findAbsorbingEventId(tx, allocatableCatIds, absorbingEvents);
    if (eid) map.set(tx.id, eid);
  }
  return map;
}
