type TicketSaleBatchRow = {
  financial_account_id?: string | null;
  source?: string | null;
  import_batch_id?: string | null;
  created_at?: string | null;
};

/**
 * Re-importações substitutivas (ex.: Fever) podem deixar batches antigos visíveis
 * em queries genéricas. Para fontes com import_batch_id, mantém apenas o batch
 * mais recente por conta financeira; vendas manuais/legadas continuam intactas.
 */
export function keepLatestImportBatchRows<T extends TicketSaleBatchRow>(rows: T[], source: string): T[] {
  const latestByAccount = new Map<string, { batchId: string; createdAt: string }>();
  let hasAnyBatchForSource = false;

  for (const row of rows) {
    if (row.source !== source || !row.import_batch_id) continue;
    hasAnyBatchForSource = true;
    const accountKey = row.financial_account_id ?? "__no_account__";
    const createdAt = String(row.created_at || "");
    const current = latestByAccount.get(accountKey);
    if (!current || createdAt > current.createdAt) {
      latestByAccount.set(accountKey, { batchId: row.import_batch_id, createdAt });
    }
  }

  return rows.filter((row) => {
    if (row.source !== source) return true;
    if (!row.import_batch_id) return !hasAnyBatchForSource;
    const latest = latestByAccount.get(row.financial_account_id ?? "__no_account__");
    return !latest || row.import_batch_id === latest.batchId;
  });
}

export const keepLatestFeverImportRows = <T extends TicketSaleBatchRow>(rows: T[]) =>
  keepLatestImportBatchRows(rows, "fever_import");