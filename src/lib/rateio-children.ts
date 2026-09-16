/**
 * Filhas de rateio multi-evento — predicado ÚNICO do sistema.
 *
 * Ver `.lovable/memory/features/rateio-mae-filhas-agregacao.md` e D-ERP70.
 *
 * O rateio multi-evento cria:
 *   • uma transação-MÃE  — `event_id` NULL, tem `account_id`, é ela que move o saldo;
 *   • N transações-FILHAS — `event_id` preenchido, `account_id` NULL,
 *     `parent_transaction_id` a apontar para a mãe.
 * A mãe é a fatura inteira; as filhas são a decomposição dela por evento.
 *
 * REGRA (uma só):
 *   • agregação ao nível da EMPRESA  → conta a MÃE e exclui as FILHAS;
 *   • agregação ao nível do EVENTO   → conta as FILHAS (a mãe cai fora sozinha,
 *     porque filtra por `event_id` e a mãe não tem evento). Nada a fazer nesses.
 *
 * `installment_group_id` é o que distingue filha de rateio de PARCELA de pagamento.
 * Nas parcelas a "mãe" é a 1.ª prestação (não carrega o total): mãe + parcelas = total
 * da obrigação, logo somam-se todas e NÃO se excluem daqui (medido em Live 16/09/2026).
 */

/** Colunas mínimas que qualquer select de agregação de empresa tem que trazer. */
export const RATEIO_FILTER_COLUMNS = "parent_transaction_id, installment_group_id";

/** True quando a linha é filha de rateio multi-evento (e não uma parcela de pagamento). */
export function isRateioChild(t: any): boolean {
  return t?.parent_transaction_id != null && t?.installment_group_id == null;
}

/** Remove as filhas de rateio. Usar em TODA a agregação ao nível da empresa. */
export function excludeRateioChildren<T>(rows: T[]): T[] {
  return (rows ?? []).filter((t) => !isRateioChild(t));
}
