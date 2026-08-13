/**
 * SSoT do matching Transações ↔ linhas do BP (event_forecasts).
 *
 * Regras (decisão 2026-08-13):
 * 1. Normalização insensível a acentos/caracteres especiais: NFD + remoção de
 *    diacríticos + lowercase + substituição de tudo o que não é alfanumérico por
 *    espaço. Assim "Diárias", "diarias" e "DIARIAS/Per-Diem" partilham o token
 *    "diarias".
 * 2. Categoria com UMA só linha BP → essa linha reclama TODAS as TXs da
 *    categoria (comportamento antigo, mantido).
 * 3. Categoria com VÁRIAS linhas → winner-takes-all por tokens; empates e
 *    scores 0 deixam a TX **órfã**.
 * 4. Regra de ouro: nenhuma TX com categoria pode ficar invisível. As órfãs
 *    aparecem no bucket sintético "Sem linha específica" da categoria
 *    (ver findCategoryOrphanTransactions).
 */

export function normalizeMatchText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeMatchText(value: string | null | undefined): string[] {
  return normalizeMatchText(value)
    .split(" ")
    .filter((w) => w.length >= 3);
}

/** Score de semelhança entre descrição da linha BP e da transação. 0 = sem match. */
export function scoreDescriptionMatch(
  forecastDesc: string | null | undefined,
  txDesc: string | null | undefined,
): number {
  const f = normalizeMatchText(forecastDesc);
  const t = normalizeMatchText(txDesc);
  if (!f && !t) return 0;
  if (f === t) return 1000; // exact match (já normalizado) ganha sempre
  if (!f || !t) return 0;
  const fTokens = new Set(tokenizeMatchText(forecastDesc));
  const tTokens = new Set(tokenizeMatchText(txDesc));
  if (fTokens.size === 0 || tTokens.size === 0) return 0;
  let shared = 0;
  for (const tok of tTokens) if (fTokens.has(tok)) shared += 1;
  if (shared === 0) return 0;
  const coverage = shared / fTokens.size;
  const lengthPenalty = Math.abs(f.length - t.length) / 10000;
  return shared * 100 + coverage * 10 - lengthPenalty;
}

/** Transações reclamadas por UMA linha do BP (união: back-link directo + categoria). */
export function findMatchingTransactionsForForecast(
  forecast: any,
  eventTransactions: any[],
  allForecasts: any[],
): any[] {
  if (!eventTransactions) return [];

  const directTx = forecast?.transaction_id
    ? eventTransactions.filter((t: any) => t.id === forecast.transaction_id)
    : [];

  const allowedEventIds = new Set(
    [forecast?.event_id, null, forecast?._master_event_id].filter((v) => v !== undefined),
  );
  const scoped = eventTransactions.filter((t: any) => allowedEventIds.has(t.event_id));

  const mergeWithDirect = (list: any[]) => {
    if (directTx.length === 0) return list;
    const ids = new Set(list.map((t: any) => t.id));
    return [...list, ...directTx.filter((t: any) => !ids.has(t.id))];
  };

  if (!forecast?.category_id) return directTx;

  const sameCat = scoped.filter(
    (t: any) => t.category_id === forecast.category_id && t.type === forecast.type,
  );
  const sameCatForecasts = (allForecasts ?? []).filter(
    (f: any) =>
      f.category_id === forecast.category_id &&
      f.type === forecast.type &&
      f.event_id === forecast.event_id,
  );
  if (sameCatForecasts.length <= 1) return mergeWithDirect(sameCat);

  const matched = sameCat.filter((t: any) => {
    const my = scoreDescriptionMatch(forecast.description, t.description);
    if (my <= 0) return false;
    const bestOther = sameCatForecasts.reduce((max: number, f: any) => {
      if (f.id === forecast.id) return max;
      const s = scoreDescriptionMatch(f.description, t.description);
      return s > max ? s : max;
    }, 0);
    return my > bestOther;
  });

  return mergeWithDirect(matched);
}

/**
 * Transações de uma categoria que NENHUMA linha BP reclama — nem por back-link
 * directo, nem por match de descrição (inclui empates e categorias sem BP).
 * Alimenta a linha sintética "Sem linha específica".
 */
export function findCategoryOrphanTransactions(params: {
  categoryId: string;
  type: string;
  eventId: string;
  masterEventId?: string | null;
  transactions: any[];
  allForecasts: any[];
}): any[] {
  const { categoryId, type, eventId, masterEventId, transactions, allForecasts } = params;
  if (!categoryId || !transactions?.length) return [];

  const allowedEventIds = new Set([eventId, null, masterEventId ?? undefined].filter((v) => v !== undefined));
  const sameCat = transactions.filter(
    (t: any) => t.category_id === categoryId && t.type === type && allowedEventIds.has(t.event_id),
  );
  if (sameCat.length === 0) return [];

  const forecastsInCat = (allForecasts ?? []).filter(
    (f: any) => f.category_id === categoryId && f.type === type && f.event_id === eventId,
  );

  const claimed = new Set<string>();
  // Back-links directos de QUALQUER linha (mesmo de outra categoria) contam como visíveis.
  for (const f of allForecasts ?? []) {
    if (f?.transaction_id) claimed.add(f.transaction_id);
  }
  for (const f of forecastsInCat) {
    for (const t of findMatchingTransactionsForForecast(f, transactions, allForecasts ?? [])) {
      claimed.add(t.id);
    }
  }

  return sameCat.filter((t: any) => !claimed.has(t.id));
}
