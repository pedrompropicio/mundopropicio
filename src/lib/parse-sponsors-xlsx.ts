/**
 * Parser da aba "Pipe" do BP Coala (e similares) para importação de patrocínios.
 *
 * Estrutura esperada (linha 2 = headers):
 *   Col A: Estado documental (texto livre)
 *   Col B: Nome do patrocinador
 *   Col C: Valor 2026 - Confirmados
 *   Col D: Valor 2026 - Pipe
 *   Col E: Valor 2026 - Propostas
 *   Col F: Valor 2025 (histórico)
 *   Col G: Estimativa
 *   Col H: Pipeline
 *
 * Decisões fixadas com utilizador (2026-04-30):
 *  - 1 linha BP por patrocinador (description = nome).
 *  - Bónus variáveis (Fever 600k/700k/...) ficam separados como no Excel.
 *  - Re-import idempotente por (event_id, supplier_name).
 *  - Permuta → forecast com is_transitory=true, sem transação.
 *  - Estado "Fatura emitida e recebida" / "fatura emitida e recebida" → tx paid (hoje).
 *  - Estado "Fatura enviada *DD/MM*" → tx pending, payment_date=null.
 *  - Estado "Somente Pós Evento" → tx pending, payment_date=event.date (último dia).
 *  - Estado vazio / "Aguardando" / "aguardando validação" → SÓ forecast, sem TX.
 *
 * O parser NÃO escreve no DB — devolve um plano que a UI/mutation aplica.
 */
import * as XLSX from "xlsx";

export type SponsorImportKind =
  | "paid" // fatura emitida e recebida → cria TX paga
  | "pending_invoiced" // fatura enviada → cria TX pendente
  | "pending_post_event" // pós-evento → cria TX pendente com payment_date=event.date
  | "barter" // permuta → forecast transitório, sem TX
  | "forecast_only"; // sem estado claro / aguardando → só forecast

export interface ParsedSponsorRow {
  /** Nome cru do patrocinador (col B). */
  supplierName: string;
  /** Texto cru da col A (pode ser null/vazio). */
  rawStatus: string | null;
  /** Valor confirmado 2026 (col C). */
  amountConfirmed: number | null;
  /** Valor pipe 2026 (col D). Usado como fallback do confirmado. */
  amountPipe: number | null;
  /** Valor escolhido para o BP/TX = confirmado || pipe. */
  effectiveAmount: number;
  /** Categoria de classificação derivada do estado. */
  kind: SponsorImportKind;
  /** Linha do Excel (1-indexed) para mensagens de erro. */
  rowIndex: number;
}

export interface SponsorsParseResult {
  rows: ParsedSponsorRow[];
  totals: {
    countTotal: number;
    countPaid: number;
    countPendingInvoiced: number;
    countPendingPostEvent: number;
    countBarter: number;
    countForecastOnly: number;
    sumPaid: number;
    sumPending: number;
    sumForecastOnly: number;
    sumBarter: number;
    sumGrand: number;
  };
  warnings: string[];
}

const SHEET_CANDIDATES = ["Pipe", "Patrocinios", "Patrocínios", "Sponsors"];

function normalizeText(v: any): string {
  if (v == null) return "";
  return String(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function parseAmount(v: any): number | null {
  if (v == null || v === "" || v === "-") return null;
  if (typeof v === "number" && isFinite(v)) return v;
  const s = String(v).replace(/[^\d,.\-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isFinite(n) && n !== 0 ? n : null;
}

function classifyStatus(rawStatus: string | null, supplierName: string, confirmedRaw: any, pipeRaw: any): SponsorImportKind {
  const s = normalizeText(rawStatus);
  const sup = normalizeText(supplierName);

  // Permuta: marcador pode aparecer no nome ou nas colunas de valor
  if (
    sup.includes("permuta") ||
    normalizeText(confirmedRaw) === "permuta" ||
    normalizeText(pipeRaw) === "permuta"
  ) {
    return "barter";
  }

  if (!s) return "forecast_only";

  if (s.includes("recebida") || s.includes("recebido")) return "paid";
  if (s.includes("pos evento") || s.includes("após evento") || s.includes("apos evento")) {
    return "pending_post_event";
  }
  if (s.includes("fatura enviada") || s.includes("fatura emitida")) return "pending_invoiced";
  if (s.includes("aguardando") || s.includes("aguarda")) return "forecast_only";

  return "forecast_only";
}

export function parseSponsorsXlsx(buf: ArrayBuffer): SponsorsParseResult {
  const wb = XLSX.read(buf, { type: "array" });

  // Encontrar a aba — case-insensitive, normalizada
  const wantedSet = new Set(SHEET_CANDIDATES.map((n) => normalizeText(n)));
  const sheetName = wb.SheetNames.find((n) => wantedSet.has(normalizeText(n)));
  if (!sheetName) {
    throw new Error(
      `Não encontrei a aba de patrocínios. ` +
        `Este ficheiro tem as abas: ${wb.SheetNames.join(", ")}. ` +
        `Parece ser o ficheiro de mapeamento contabilístico — para importar patrocínios carrega o BP original do Coala (que tem a aba "Pipe" com os patrocinadores).`
    );
  }

  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });

  const rows: ParsedSponsorRow[] = [];
  const warnings: string[] = [];

  // Linha 1 (índice 0) é título de bloco; linha 2 (índice 1) são headers.
  // Dados começam na linha 3 (índice 2). Paramos quando o nome (col B) ficar vazio
  // por > 2 linhas seguidas.
  let blanks = 0;
  for (let i = 2; i < matrix.length; i++) {
    const r = matrix[i] || [];
    const supplierRaw = r[1];
    const name = supplierRaw == null ? "" : String(supplierRaw).trim();
    if (!name) {
      blanks++;
      if (blanks > 2) break;
      continue;
    }
    blanks = 0;

    const confirmedRaw = r[2];
    const pipeRaw = r[3];
    const confirmed = parseAmount(confirmedRaw);
    const pipe = parseAmount(pipeRaw);
    const effective = confirmed ?? pipe ?? 0;

    const rawStatus = r[0] == null ? null : String(r[0]).trim() || null;
    const kind = classifyStatus(rawStatus, name, confirmedRaw, pipeRaw);

    // Skip totalmente se for forecast_only sem qualquer valor (linhas de "leads frias")
    if (kind === "forecast_only" && effective === 0) {
      continue;
    }
    if (kind !== "barter" && effective === 0) {
      warnings.push(`Linha ${i + 1}: "${name}" sem valor confirmado nem pipe — ignorada.`);
      continue;
    }

    rows.push({
      supplierName: name,
      rawStatus,
      amountConfirmed: confirmed,
      amountPipe: pipe,
      effectiveAmount: kind === "barter" ? 0 : effective,
      kind,
      rowIndex: i + 1,
    });
  }

  const totals = {
    countTotal: rows.length,
    countPaid: rows.filter((r) => r.kind === "paid").length,
    countPendingInvoiced: rows.filter((r) => r.kind === "pending_invoiced").length,
    countPendingPostEvent: rows.filter((r) => r.kind === "pending_post_event").length,
    countBarter: rows.filter((r) => r.kind === "barter").length,
    countForecastOnly: rows.filter((r) => r.kind === "forecast_only").length,
    sumPaid: rows.filter((r) => r.kind === "paid").reduce((s, r) => s + r.effectiveAmount, 0),
    sumPending: rows
      .filter((r) => r.kind === "pending_invoiced" || r.kind === "pending_post_event")
      .reduce((s, r) => s + r.effectiveAmount, 0),
    sumForecastOnly: rows.filter((r) => r.kind === "forecast_only").reduce((s, r) => s + r.effectiveAmount, 0),
    sumBarter: rows.filter((r) => r.kind === "barter").reduce((s, r) => s + r.effectiveAmount, 0),
    sumGrand: rows.reduce((s, r) => s + r.effectiveAmount, 0),
  };

  return { rows, totals, warnings };
}

export const SPONSOR_KIND_LABEL: Record<SponsorImportKind, string> = {
  paid: "Pago (fatura emitida e recebida)",
  pending_invoiced: "Pendente (fatura enviada)",
  pending_post_event: "Pendente (somente pós-evento)",
  barter: "Permuta (sem caixa)",
  forecast_only: "Só previsão (sem TX)",
};
