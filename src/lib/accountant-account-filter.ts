/**
 * Exclusão de contas gerenciais na aba Documentos de /contabilidade.
 * #235 — a implementação vive num só sítio, partilhada com a edge function
 * generate-accountant-zip: supabase/functions/_shared/accountant-account-filter.ts.
 */
export {
  fetchNonAccountingAccountIds,
  nonAccountingOrFilter,
  normalizeAccountFilter,
  accountingOnlyIds,
} from "../../supabase/functions/_shared/accountant-account-filter";
