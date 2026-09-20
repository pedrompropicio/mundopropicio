/**
 * RECEITA DO FECHAMENTO — núcleo único partilhado (#226, 20/09/2026).
 *
 * REGRA (Pedro, 20/09/2026), irmã da #220/#225 mas aplicada ao motor dos
 * fechamentos: por BUCKET de receita (bilheteira / A&B / patrocínio / outros,
 * pela rubrica), o REAL substitui o BP; sem real nesse bucket, as linhas de BP
 * de receita aprovadas desse bucket alimentam-no.
 *   • Nunca `max(real, previsto)`. Nunca soma.
 *   • Real de bilheteira = `ticket_sales` (com a anti-duplicação da rubrica
 *     1.1.01 que já existia); se não houver `ticket_sales`, as transações de
 *     1.1.01 são o real da bilheteira.
 *   • Real dos outros buckets = transações `income` válidas dessa classe
 *     (`isValidFechoTransaction`, aplicado por quem chama).
 *   • Linhas de BP elegíveis: `type='income'`, `status='approved'`,
 *     `version_id IS NULL` (na query), sem `is_transitory`,
 *     `exclude_from_result` nem `is_overhead`.
 *
 * Substitui a leitura absoluta do D24 ("o fecho nunca usa receita prevista"):
 * o BP só entra onde NÃO há real, nunca por cima dele.
 *
 * Consumidores: `computeEventSettlementTotals`, `statement-service`,
 * `PartnerSettlementTab`, `EventFecho`.
 */
import { calcTotalWithIva } from "./iva.ts";
import { isBilheteiraCategoryCode } from "./fecho-filters.ts";

export type RevenueBucketKey = "bilheteira" | "ab" | "patrocinio" | "outros";

export const REVENUE_BUCKET_KEYS: RevenueBucketKey[] = ["bilheteira", "ab", "patrocinio", "outros"];

/**
 * Réplica mínima de `classifyIncomeL1` (`src/lib/event-financial-card.ts`) — o
 * núcleo partilhado corre em Deno e não pode importar de `src/`.
 * Classifica pelo código EXACTO da subcategoria: `1.1.01` bilheteira,
 * `1.1.03` A&B, `1.2.*` patrocínio, resto outros.
 */
export function classifyIncomeBucket(code?: string | null): RevenueBucketKey {
  const c = (code ?? "").trim();
  if (isBilheteiraCategoryCode(c)) return "bilheteira";
  if (c === "1.1.03") return "ab";
  if (c.startsWith("1.2")) return "patrocinio";
  return "outros";
}

export interface SettlementRevenueLine {
  kind: "ticket" | "tx" | "bp";
  bucket: RevenueBucketKey;
  /** Nome da rubrica (vazio nas linhas de bilheteira — quem chama rotula). */
  origin: string;
  description: string;
  net: number;
  gross: number;
  event_settlement_id?: string | null;
}

export interface SettlementRevenueInput {
  /** Bilheteira real, já reduzida a { gross, net } linha a linha. */
  ticketSales?: Array<{ gross: number; net: number }>;
  /** Detalhe por lote para o documento do sócio (opcional). */
  ticketBreakdown?: Array<{ label: string; net: number }>;
  /** Transações `income` já filtradas por `isValidFechoTransaction`. */
  incomeTransactions?: any[];
  /** Linhas de BP (`event_forecasts`) — os filtros de elegibilidade são aqui. */
  incomeForecasts?: any[];
}

export interface SettlementRevenueResult {
  revenueNet: number;
  revenueGross: number;
  buckets: Record<RevenueBucketKey, { net: number; gross: number; source: "real" | "bp" }>;
  /** Linhas que compõem o total (documento do sócio). */
  lines: SettlementRevenueLine[];
  hasTicketSales: boolean;
  /** Buckets alimentados pelo BP (fallback aplicado). */
  bpBucketsUsed: RevenueBucketKey[];
  /** Linhas de BP que efectivamente entraram (perímetro / markedLines, D25 g3). */
  bpLinesUsed: any[];
  /** Transações de receita que contaram (sem as 1.1.01 duplicadas). */
  incomeTxUsed: any[];
  /** Transações de receita excluídas por duplicarem `ticket_sales`. */
  excludedTicketingTx: any[];
}

function isEligibleIncomeForecast(f: any): boolean {
  return (
    f?.type === "income" &&
    (f.status == null || f.status === "approved") &&
    !f.is_transitory &&
    !f.exclude_from_result &&
    !f.is_overhead
  );
}

const emptyBuckets = (): Record<RevenueBucketKey, { net: number; gross: number; source: "real" | "bp" }> => ({
  bilheteira: { net: 0, gross: 0, source: "real" },
  ab: { net: 0, gross: 0, source: "real" },
  patrocinio: { net: 0, gross: 0, source: "real" },
  outros: { net: 0, gross: 0, source: "real" },
});

export function computeSettlementRevenue(input: SettlementRevenueInput): SettlementRevenueResult {
  const ticketSales = input.ticketSales ?? [];
  const incomeTx = (input.incomeTransactions ?? []).filter((t: any) => t?.type === "income");
  const forecasts = (input.incomeForecasts ?? []).filter(isEligibleIncomeForecast);

  const hasTicketSales = ticketSales.length > 0;

  const buckets = emptyBuckets();
  const lines: SettlementRevenueLine[] = [];

  // ── Real ────────────────────────────────────────────────────────────────
  const excludedTicketingTx: any[] = [];
  const incomeTxUsed: any[] = [];
  const realTxByBucket: Record<RevenueBucketKey, any[]> = {
    bilheteira: [], ab: [], patrocinio: [], outros: [],
  };

  for (const t of incomeTx) {
    const bucket = classifyIncomeBucket(t?.account_categories?.code);
    if (hasTicketSales && bucket === "bilheteira") {
      excludedTicketingTx.push(t);
      continue;
    }
    realTxByBucket[bucket].push(t);
    incomeTxUsed.push(t);
  }

  if (hasTicketSales) {
    const net = ticketSales.reduce((s, t) => s + Number(t.net || 0), 0);
    const gross = ticketSales.reduce((s, t) => s + Number(t.gross || 0), 0);
    buckets.bilheteira = { net, gross, source: "real" };
    const breakdown = input.ticketBreakdown ?? [];
    if (breakdown.length) {
      for (const b of breakdown) {
        lines.push({ kind: "ticket", bucket: "bilheteira", origin: "", description: b.label, net: b.net, gross: b.net });
      }
    } else {
      lines.push({ kind: "ticket", bucket: "bilheteira", origin: "", description: "Bilheteira", net, gross });
    }
  }

  for (const bucket of REVENUE_BUCKET_KEYS) {
    const rows = realTxByBucket[bucket];
    if (!rows.length) continue;
    for (const t of rows) {
      const net = Number(t.amount || 0);
      buckets[bucket].net += net;
      buckets[bucket].gross += calcTotalWithIva(net, Number(t.iva_rate || 0));
      buckets[bucket].source = "real";
      lines.push({
        kind: "tx",
        bucket,
        origin: t.account_categories?.name || "Outras receitas",
        description: t.description || "—",
        net,
        gross: calcTotalWithIva(net, Number(t.iva_rate || 0)),
        event_settlement_id: t.event_settlement_id ?? null,
      });
    }
  }

  // ── Fallback BP: só nos buckets SEM real ────────────────────────────────
  const bucketHasReal: Record<RevenueBucketKey, boolean> = {
    bilheteira: hasTicketSales || realTxByBucket.bilheteira.length > 0,
    ab: realTxByBucket.ab.length > 0,
    patrocinio: realTxByBucket.patrocinio.length > 0,
    outros: realTxByBucket.outros.length > 0,
  };

  const bpBucketsUsed: RevenueBucketKey[] = [];
  const bpLinesUsed: any[] = [];
  for (const f of forecasts) {
    const bucket = classifyIncomeBucket(f?.account_categories?.code);
    if (bucketHasReal[bucket]) continue;
    const net = Number(f.amount || 0);
    buckets[bucket].net += net;
    buckets[bucket].gross += calcTotalWithIva(net, Number(f.iva_rate || 0));
    buckets[bucket].source = "bp";
    if (!bpBucketsUsed.includes(bucket)) bpBucketsUsed.push(bucket);
    bpLinesUsed.push(f);
    lines.push({
      kind: "bp",
      bucket,
      origin: f.account_categories?.name || "Receita prevista",
      description: f.description || "—",
      net,
      gross: calcTotalWithIva(net, Number(f.iva_rate || 0)),
      event_settlement_id: f.event_settlement_id ?? null,
    });
  }

  const revenueNet = REVENUE_BUCKET_KEYS.reduce((s, b) => s + buckets[b].net, 0);
  const revenueGross = REVENUE_BUCKET_KEYS.reduce((s, b) => s + buckets[b].gross, 0);

  return {
    revenueNet,
    revenueGross,
    buckets,
    lines,
    hasTicketSales,
    bpBucketsUsed,
    bpLinesUsed,
    incomeTxUsed,
    excludedTicketingTx,
  };
}
