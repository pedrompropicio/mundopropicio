/**
 * master-forecast-allocation.ts
 *
 * Apropriação (rateio) do BP do Master nos sub-eventos, para APURAÇÃO DE
 * RESULTADO no modo Forecast dos cards Custos/Receitas do EventDetail.
 *
 * Distinta do rateio financeiro / overhead — esta é apenas uma visão de
 * card, não cria forecasts virtuais nem mexe em DRE/Sócios/Análise.
 *
 * Regra (1-7, validada com Simone Mendes 2026 em Live):
 *  1. Rateio BP Master ÷ N subs (N = count events.parent_event_id = master).
 *  2. Por categoria do BP Master que NÃO existe no BP do sub:
 *        quota = MAX(previsto_master[cat] ÷ N, Σ TX-filhas no sub nessa cat)
 *  3. Só modo Forecast (não Realized, não Committed).
 *  4. Receita Master (patrocínio) rateia igual.
 *  5. TX local exclusiva (TX_LOCAL_PURA ou PARCELA_LOCAL) em cat NÃO coberta
 *     pelo BP do sub soma POR CIMA, mesmo que a cat também tenha quota Master.
 *  6. Anti-duplicação: TX-filha conta UMA vez (dentro do MAX). Visão Global
 *     (sem sub) não aplica quota — chamar este helper só quando subId existe.
 *  7. CRITÉRIO ESTRITO de TX-filha de rateio Master:
 *        parent_transaction_id NOT NULL
 *        AND (parent.event_id IS NULL OR parent.event_id != child.event_id)
 *     Parcela local (parent.event_id = child.event_id) NÃO é filha — é local.
 *
 * Ver:
 *  - mem://features/master-split-rateio-source-of-truth
 *  - mem://features/event-financial-cards
 */

export type TxClass = "FILHA_RATEIO_MASTER" | "PARCELA_LOCAL" | "TX_LOCAL_PURA";

export interface SubTxForAllocation {
  category_id: string | null;
  amount: number | string;
  type: "expense" | "income";
  parent_transaction_id: string | null;
  /**
   * event_id da TX-mãe (parent). undefined/null quando não há parent OU
   * quando o parent é uma TX flutuante do Master (event_id = NULL na BD).
   * Para o critério estrito, NULL conta como "diferente do sub".
   */
  parent_event_id: string | null | undefined;
}

export interface MasterBpLine {
  category_id: string | null;
  amount: number | string;
  type: "expense" | "income";
}

export interface ComputeMasterForecastAllocationArgs {
  subId: string;
  N: number;
  bpMaster: MasterBpLine[];
  bpSubCats: Set<string>;
  subTxs: SubTxForAllocation[];
  kind: "expense" | "income";
}

export interface RateioCatEntry {
  quotaPrev: number;
  txFilhas: number;
  quota: number;
}

export interface ComputeMasterForecastAllocationResult {
  rateioMasterByCat: Map<string, RateioCatEntry>;
  rateioMasterSum: number;
  txLocalSum: number;
}

/** Critério estrito (regra 7). */
export function classifyTx(
  tx: Pick<SubTxForAllocation, "parent_transaction_id" | "parent_event_id">,
  subId: string,
): TxClass {
  if (!tx.parent_transaction_id) return "TX_LOCAL_PURA";
  const pev = tx.parent_event_id ?? null;
  if (pev === null || pev !== subId) return "FILHA_RATEIO_MASTER";
  return "PARCELA_LOCAL";
}

export function computeMasterForecastAllocation(
  args: ComputeMasterForecastAllocationArgs,
): ComputeMasterForecastAllocationResult {
  const empty: ComputeMasterForecastAllocationResult = {
    rateioMasterByCat: new Map(),
    rateioMasterSum: 0,
    txLocalSum: 0,
  };
  const { subId, N, bpMaster, bpSubCats, subTxs, kind } = args;
  if (!subId || N <= 0) return empty;

  // 1. Aggregate Master BP by cat (filtered to kind + cats NOT in sub BP)
  const masterByCat = new Map<string, number>();
  for (const line of bpMaster) {
    if (line.type !== kind) continue;
    if (!line.category_id) continue;
    if (bpSubCats.has(line.category_id)) continue;
    masterByCat.set(
      line.category_id,
      (masterByCat.get(line.category_id) ?? 0) + Number(line.amount || 0),
    );
  }

  // 2. Aggregate sub TXs by category, separating filhas vs local
  const filhasByCat = new Map<string, number>();
  const localByCat = new Map<string, number>();
  for (const tx of subTxs) {
    if (tx.type !== kind) continue;
    if (!tx.category_id) continue;
    const klass = classifyTx(tx, subId);
    const amt = Number(tx.amount || 0);
    if (klass === "FILHA_RATEIO_MASTER") {
      filhasByCat.set(tx.category_id, (filhasByCat.get(tx.category_id) ?? 0) + amt);
    } else {
      // TX_LOCAL_PURA ou PARCELA_LOCAL — somam em "local"
      localByCat.set(tx.category_id, (localByCat.get(tx.category_id) ?? 0) + amt);
    }
  }

  // 3. Compute quotas per Master cat
  const rateioMasterByCat = new Map<string, RateioCatEntry>();
  let rateioMasterSum = 0;
  for (const [cat, previsto] of masterByCat) {
    const quotaPrev = previsto / N;
    const txFilhas = filhasByCat.get(cat) ?? 0;
    const quota = Math.max(quotaPrev, txFilhas);
    rateioMasterByCat.set(cat, { quotaPrev, txFilhas, quota });
    rateioMasterSum += quota;
  }

  // 4. txLocalSum = TX local/parcela em cats NÃO em bpSubCats (regra 5: soma
  //    por cima mesmo em cats que têm quota Master)
  let txLocalSum = 0;
  for (const [cat, amt] of localByCat) {
    if (bpSubCats.has(cat)) continue;
    txLocalSum += amt;
  }

  return { rateioMasterByCat, rateioMasterSum, txLocalSum };
}
