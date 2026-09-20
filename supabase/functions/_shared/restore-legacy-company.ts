// Backups legacy (v2, pré multi-tenant) não trazem `company_id` nas linhas.
// O upsert sob service_role entra sem company_id, `current_company_id()` é NULL
// e o NOT NULL rejeita. Caminho 1 da Issue #96: o pedido passa a exigir
// `target_company_id` e cada linha sem company_id recebe-o antes da carga.

/** Erro de pedido (400) — legacy sem `target_company_id`. */
export const LEGACY_TARGET_COMPANY_ERROR = "backup legacy exige target_company_id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * A tabela tem coluna `company_id`? Sem leitura de dados (`limit 0`); o erro
 * 42703 do PostgREST diz que a coluna não existe.
 */
export async function tableHasCompanyId(admin: any, table: string): Promise<boolean> {
  const { error } = await admin.from(table).select("company_id").limit(0);
  if (!error) return true;
  const msg = `${error.code ?? ""} ${error.message ?? ""}`;
  if (/42703|company_id/.test(msg)) return false;
  // Qualquer outro erro (permissões, tabela inexistente) — não estampar.
  return false;
}

/**
 * Estampa `company_id = targetCompanyId` nas linhas que não o trazem.
 * Devolve quantas linhas foram estampadas.
 */
export function stampCompanyId(rows: any[], targetCompanyId: string): number {
  let n = 0;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    if (r.company_id == null) {
      r.company_id = targetCompanyId;
      n++;
    }
  }
  return n;
}

/**
 * Estampa em bloco, só nas tabelas que têm a coluna.
 * `rowsByTable` é mutado no lugar.
 */
export async function stampLegacyCompanyId(
  admin: any,
  rowsByTable: Record<string, any[]>,
  targetCompanyId: string,
): Promise<Record<string, number>> {
  const stamped: Record<string, number> = {};
  for (const [table, rows] of Object.entries(rowsByTable)) {
    if (!rows?.length) continue;
    if (!(await tableHasCompanyId(admin, table))) continue;
    const n = stampCompanyId(rows, targetCompanyId);
    if (n > 0) stamped[table] = n;
  }
  return stamped;
}
