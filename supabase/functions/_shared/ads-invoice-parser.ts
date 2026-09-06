// Parser das faturas de tráfego pago da Meta (Meta Platforms Ireland).
//
// A extração de texto do unpdf/pdf.js não garante colunas alinhadas por
// espaços, por isso reconstruímos as linhas visuais a partir das POSIÇÕES
// (x, y) dos itens de texto: agrupamos por y (linha visual) e ordenamos por x.
// Depois cada linha visual é um array de tokens com x conhecido.
//
// Layout real (fatura 252466632):
//   Line#   Description - Advertising Services      Campaign Label   Total
//     1     Coupons: goodwill/bugs                                   -2.28
//     4     Instagram - [Sold Out] ... - Lisboa 2026 -               10.86
//           02/04/2026                              <- continuação
//
// Casos cobertos:
//  - descrição que quebra para a linha seguinte (sem número nem valor);
//  - rodapé bancário colado à última linha de detalhe da página;
//  - indentação variável do número de linha.

export interface AdsInvoiceHeader {
  invoiceNumber: string | null;
  issueDate: string | null;     // YYYY-MM-DD
  billingPeriod: string | null; // YYYY-MM-01
  totalAmount: number | null;
}

export interface AdsInvoiceParsedLine {
  lineNo: number;
  rawDescription: string;
  placement: string | null;
  campaignName: string;
  amount: number;
  isAdjustment: boolean;
}

export interface AdsInvoiceParseResult {
  header: AdsInvoiceHeader;
  lines: AdsInvoiceParsedLine[];
  linesSum: number;
  warnings: string[];
  debug: Record<string, unknown>;
}

const MONEY = /^-?[\d,]+\.\d{2}$/;
const LINE_NO = /^\d{1,3}$/;

/** Tokens/expressões que marcam ruído de cabeçalho/rodapé — nunca continuação. */
const NOISE = [
  "INVOICE", "Page:", "BILL TO", "ATTN", "VAT", "Line#", "Meta Platforms",
  "Merrion", "Dublin", "Ireland", "www.", "Remit", "Bank", "Account", "Sort",
  "SWIFT", "Acct", "Payment", "Subtotal", "Freight", "Customer to account",
  "Advertiser", "PO Number",
];

/** Marcas onde o rodapé bancário se cola à descrição. */
const FOOTER_CUTS = ["54878017", "BOFAIE3X", "Invoice #:"];

const PLACEMENTS: Array<[string, string]> = [
  ["Instagram - ", "instagram"],
  ["Facebook - ", "facebook"],
  ["Audience Network - ", "audience_network"],
  ["Messenger - ", "messenger"],
];

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

export interface TextToken { text: string; x: number }
export interface TextLine { y: number; page: number; tokens: TextToken[] }

function norm(s: string): string {
  return s.replace(/[\u00a0\u2009\u202f]/g, " ").replace(/\s+/g, " ").trim();
}

function parseMoney(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function isNoise(text: string): boolean {
  const t = text.toUpperCase();
  return NOISE.some((n) => t.includes(n.toUpperCase()));
}

/** Extrai linhas visuais de um PDF com posições, via unpdf/pdf.js. */
export async function extractPdfLines(bytes: Uint8Array): Promise<TextLine[]> {
  // @ts-ignore — especificador remoto Deno (mesmo build já em produção no bol-report-parser)
  const { getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
  const pdf = await getDocumentProxy(bytes);
  const out: TextLine[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const buckets = new Map<number, TextToken[]>();
    for (const item of content.items as any[]) {
      const text = String(item?.str ?? "");
      if (!text.trim()) continue;
      const tr = item.transform as number[];
      const x = tr?.[4] ?? 0;
      const y = tr?.[5] ?? 0;
      // tolerância de 2pt no y — junta itens da mesma linha visual
      let key = Math.round(y);
      for (const k of buckets.keys()) {
        if (Math.abs(k - key) <= 2) { key = k; break; }
      }
      const arr = buckets.get(key) ?? [];
      arr.push({ text, x });
      buckets.set(key, arr);
    }
    const ys = Array.from(buckets.keys()).sort((a, b) => b - a); // topo → fundo
    for (const y of ys) {
      const tokens = (buckets.get(y) ?? []).sort((a, b) => a.x - b.x);
      out.push({ y, page: p, tokens });
    }
  }
  return out;
}

function lineText(line: TextLine): string {
  return norm(line.tokens.map((t) => t.text).join(" "));
}

function cutFooter(desc: string): string {
  let cut = desc;
  for (const marker of FOOTER_CUTS) {
    const i = cut.indexOf(marker);
    if (i >= 0) cut = cut.slice(0, i);
  }
  return norm(cut);
}

function splitPlacement(desc: string): { placement: string | null; campaignName: string } {
  for (const [prefix, code] of PLACEMENTS) {
    if (desc.startsWith(prefix)) {
      return { placement: code, campaignName: norm(desc.slice(prefix.length)) };
    }
  }
  return { placement: null, campaignName: desc };
}

function parseHeader(lines: TextLine[]): AdsInvoiceHeader {
  const flat = lines.map(lineText).join("\n");
  const invoiceNumber = flat.match(/Invoice\s*#:\s*(\d+)/i)?.[1] ?? null;
  const issueRaw = flat.match(/Invoice\s*Date:\s*(\d{1,2})-([A-Za-z]{3})-(\d{4})/i);
  const issueDate = issueRaw
    ? `${issueRaw[3]}-${MONTHS[issueRaw[2].toLowerCase()] ?? "01"}-${issueRaw[1].padStart(2, "0")}`
    : null;
  const periodRaw = flat.match(/Billing\s*Period:\s*([A-Za-z]{3})-(\d{2})/i);
  const billingPeriod = periodRaw
    ? `20${periodRaw[2]}-${MONTHS[periodRaw[1].toLowerCase()] ?? "01"}-01`
    : null;
  const totalRaw = flat.match(/Invoice\s*Total:\s*(?:€|EUR)?\s*(-?[\d,]+\.\d{2})/i);
  const totalAmount = totalRaw ? parseMoney(totalRaw[1]) : null;
  return { invoiceNumber, issueDate, billingPeriod, totalAmount };
}

export function parseMetaInvoiceLines(lines: TextLine[]): AdsInvoiceParseResult {
  const warnings: string[] = [];
  const header = parseHeader(lines);
  const parsed: AdsInvoiceParsedLine[] = [];
  const seen = new Set<number>();
  let current: { lineNo: number; parts: string[]; amount: number } | null = null;

  const flush = () => {
    if (!current) return;
    const raw = cutFooter(current.parts.join(" "));
    const { placement, campaignName } = splitPlacement(raw);
    const isAdjustment = /^(Coupons:|Location fee:)/i.test(campaignName);
    parsed.push({
      lineNo: current.lineNo,
      rawDescription: raw,
      placement,
      campaignName,
      amount: current.amount,
      isAdjustment,
    });

    current = null;
  };

  for (const line of lines) {
    const tokens = line.tokens;
    if (!tokens.length) continue;
    const text = lineText(line);
    const first = tokens[0].text.trim();
    const last = tokens[tokens.length - 1].text.trim();

    const isDetailStart =
      LINE_NO.test(first) && tokens[0].x < 200 && MONEY.test(last) && tokens.length >= 3;

    if (isDetailStart) {
      const lineNo = Number(first);
      const amount = parseMoney(last);
      const desc = norm(tokens.slice(1, -1).map((t) => t.text).join(" "));
      if (!desc) { warnings.push(`linha ${lineNo} sem descrição`); }
      flush();
      if (seen.has(lineNo)) warnings.push(`número de linha repetido: ${lineNo}`);
      seen.add(lineNo);
      current = { lineNo, parts: [desc], amount };
      continue;
    }

    // possível continuação: sem número, sem valor no fim, sem ruído
    if (current && !MONEY.test(last) && !LINE_NO.test(first) && !isNoise(text) && text.length > 0) {
      current.parts.push(text);
      continue;
    }

    // qualquer outra coisa fecha a linha em curso
    if (isNoise(text) || MONEY.test(last)) flush();
  }
  flush();

  parsed.sort((a, b) => a.lineNo - b.lineNo);
  const linesSum = Math.round(parsed.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  if (header.totalAmount !== null && Math.abs(header.totalAmount - linesSum) > 0.005) {
    warnings.push(`soma das linhas (${linesSum}) difere do total da fatura (${header.totalAmount})`);
  }
  return {
    header,
    lines: parsed,
    linesSum,
    warnings,
    debug: { visualLines: lines.length, detailLines: parsed.length },
  };
}

export async function parseMetaInvoice(bytes: Uint8Array): Promise<AdsInvoiceParseResult> {
  const lines = await extractPdfLines(bytes);
  return parseMetaInvoiceLines(lines);
}
