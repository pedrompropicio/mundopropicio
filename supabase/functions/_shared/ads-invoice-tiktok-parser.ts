// Parser das faturas TikTok Ads (TikTok Information Technologies UK Limited, Autopay,
// autoliquidação). D-ERP248. Irmão dos parsers Meta/Google: reaproveita extractPdfLines.
//
// Estrutura esperada (a validar contra o 1.º PDF real — dry_run mostra tudo antes de gravar):
//   cabeçalho: "Invoice No." / "Invoice number" <n>, "Invoice Date" <data>,
//     "Billing Period" <início> - <fim>, "Total Amount"/"Total" <valor> EUR.
//   detalhe de consumo: uma linha por campanha com o ID da campanha (16–19 dígitos),
//     o nome e o valor consumido.
// O total TEM de fechar com a soma das linhas ao cêntimo — senão o ingest recusa gravar.
import { extractPdfLines, type TextLine } from "./ads-invoice-parser.ts";

export interface TiktokInvoiceHeader {
  invoiceNumber: string | null;
  issueDate: string | null;
  billingPeriod: string | null; // YYYY-MM-01
  periodStart: string | null;
  periodEnd: string | null;
  totalAmount: number | null;
}
export interface TiktokInvoiceParsedLine {
  lineNo: number;
  rawDescription: string;
  campaignName: string | null;
  externalCampaignId: string | null;
  amount: number;
  isAdjustment: boolean;
}
export interface TiktokInvoiceParseResult {
  header: TiktokInvoiceHeader;
  lines: TiktokInvoiceParsedLine[];
  linesSum: number;
  warnings: string[];
  debug: Record<string, unknown>;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  fev: "02", abr: "04", mai: "05", ago: "08", set: "09", out: "10", dez: "12",
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** "1,234.56" | "1.234,56" | "€1234.56" | "-12.30" → número. */
export function parseMoneyAny(s: string): number | null {
  const m = String(s).replace(/[€\s]|EUR/gi, "").match(/^-?[\d.,]*\d$/);
  if (!m) return null;
  let t = m[0];
  const lastDot = t.lastIndexOf("."), lastComma = t.lastIndexOf(",");
  if (lastComma > lastDot) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "2026-10-31" | "31/10/2026" | "Oct 31, 2026" | "31 Oct 2026" → ISO. */
export function parseDateAny(s: string): string | null {
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}`;
  m = s.match(/(\d{1,2}) ([A-Za-z]{3})[a-z]*\.? (\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  return null;
}

const text = (l: TextLine) => l.tokens.map((t) => t.text).join(" ").replace(/\s+/g, " ").trim();
const MONEY_TAIL = /(-?[€]?\s?[\d.,]*\d[.,]\d{2})\s*(?:EUR|€)?\s*$/i;

export function parseTiktokInvoiceText(rows: string[]): TiktokInvoiceParseResult {
  const warnings: string[] = [];
  const h: TiktokInvoiceHeader = { invoiceNumber: null, issueDate: null, billingPeriod: null, periodStart: null, periodEnd: null, totalAmount: null };
  const lines: TiktokInvoiceParsedLine[] = [];
  let n = 0;
  for (const raw of rows) {
    const t = raw.trim();
    if (!t) continue;
    let m;
    if (!h.invoiceNumber && (m = t.match(/Invoice\s*(?:No\.?|Number|#)\s*:?\s*([A-Z0-9-]{6,})/i))) { h.invoiceNumber = m[1]; continue; }
    if (!h.issueDate && /Invoice\s*Date/i.test(t)) { h.issueDate = parseDateAny(t); continue; }
    if (!h.periodStart && /(Billing|Service)\s*Period/i.test(t)) {
      const parts = t.split(/\s[-–~]\s|\sto\s/i);
      h.periodStart = parseDateAny(parts[0] ?? "") ?? parseDateAny(t);
      h.periodEnd = parts[1] ? parseDateAny(parts[1]) : null;
      continue;
    }
    if (/^(Total(\s*Amount)?(\s*Due)?|Amount\s*Due)\b/i.test(t) && (m = t.match(MONEY_TAIL))) {
      const v = parseMoneyAny(m[1]); if (v !== null) h.totalAmount = v; continue;
    }
    if (/^(Subtotal|VAT|Tax|IVA)\b/i.test(t)) continue;
    const id = t.match(/\b(\d{16,19})\b/);
    const money = t.match(MONEY_TAIL);
    if (id && money) {
      const amount = parseMoneyAny(money[1]);
      if (amount === null) continue;
      const name = t.replace(id[0], "").replace(money[0], "").replace(/\s+/g, " ").trim() || null;
      lines.push({ lineNo: ++n, rawDescription: t, campaignName: name, externalCampaignId: id[1], amount: round2(amount), isAdjustment: false });
      continue;
    }
    if (/(credit|coupon|promotion|adjustment|refund)/i.test(t) && money) {
      const amount = parseMoneyAny(money[1]);
      if (amount !== null && amount !== 0) {
        lines.push({ lineNo: ++n, rawDescription: t, campaignName: null, externalCampaignId: null, amount: round2(-Math.abs(amount)), isAdjustment: true });
      }
    }
  }
  if (h.periodStart) h.billingPeriod = `${h.periodStart.slice(0, 7)}-01`;
  else if (h.issueDate) { h.billingPeriod = `${h.issueDate.slice(0, 7)}-01`; warnings.push("período não encontrado: usado o mês da data da fatura"); }
  if (!lines.length) warnings.push("nenhuma linha de campanha (ID 16–19 dígitos + valor) encontrada");
  const linesSum = round2(lines.reduce((a, l) => a + l.amount, 0));
  return { header: h, lines, linesSum, warnings, debug: { rows: rows.length } };
}

export async function parseTiktokInvoice(bytes: Uint8Array): Promise<TiktokInvoiceParseResult> {
  const pdfLines = await extractPdfLines(bytes);
  return parseTiktokInvoiceText(pdfLines.map(text));
}
