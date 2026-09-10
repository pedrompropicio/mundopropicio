// Parser das faturas do Google Ads (Google Ireland Limited), irmão do parser
// da Meta. Reaproveita a extração por posições (x, y) de `ads-invoice-parser.ts`
// — o layout do Google é tabular e as colunas só se distinguem pelo x.
//
// Estrutura verificada em três exemplares reais (5623212749, 5649390521,
// 5677864015):
//
//   Página 1 — cabeçalho: "Número da fatura: <n>", "Data da fatura",
//     "Resumo relativo ao período de <d> de <mês>. de <ano> - ...",
//     "Total em EUR  €  <valor>".
//   Página 2 — mídia: Descrição | Quantidade | Unidades | Valor (€).
//     A mesma campanha aparece em várias linhas (Impressões, Cliques).
//     Linhas "Atividade inválida - número da fatura original: <n>,
//     mês de serviço original: <mês>. de <ano>, Nome da campanha: <nome>"
//     são AJUSTES e nomeiam a campanha de origem.
//   Página 3 (quando existe) — blocos "Ajustes" (créditos promocionais) e
//     "Taxas" (custos operacionais regulatórios e tributos DST). Ambos ajustes.
//
// ARMADILHA: o período NÃO é o mês civil (a fatura de junho cobre 13–30 de
// junho). As datas leem-se sempre do documento.

import { extractPdfLines, type TextLine } from "./ads-invoice-parser.ts";

export type GoogleAdjustmentKind = "invalid_activity" | "promotion" | "fee";

export interface GoogleInvoiceHeader {
  invoiceNumber: string | null;
  issueDate: string | null;      // YYYY-MM-DD
  billingPeriod: string | null;  // YYYY-MM-01 (mês de serviço)
  periodStart: string | null;    // YYYY-MM-DD, lido do documento
  periodEnd: string | null;      // YYYY-MM-DD, lido do documento
  accountId: string | null;      // 220-004-3144
  totalAmount: number | null;
}

export interface GoogleInvoiceParsedLine {
  lineNo: number;
  rawDescription: string;
  campaignName: string | null;
  quantity: number | null;
  unit: string | null;
  amount: number;
  isAdjustment: boolean;
  adjustmentKind: GoogleAdjustmentKind | null;
  originalInvoiceNumber: string | null;
  promotionId: string | null;
}

export interface GoogleInvoiceParseResult {
  header: GoogleInvoiceHeader;
  lines: GoogleInvoiceParsedLine[];
  linesSum: number;
  warnings: string[];
  debug: Record<string, unknown>;
}

const MONTHS_PT: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

const MONEY = /^-?[\d.]*\d,\d{2}$/;

/** Cabeçalhos, rodapés e linhas de totais — nunca linhas de detalhe. */
const SKIP = [
  /^Fatura\b/i,
  /^Número da fatura/i,
  /^ID da conta/i,
  /^Conta:/i,
  /^Descrição/i,
  /^Valor$/i,
  /^\(€\)$/,
  /^Quantidade/i,
  /^Unidades/i,
  /^Subtotal em EUR/i,
  /^Valor em EUR/i,
  /^IVA \(/i,
  /^Total em EUR/i,
  /^Página \d+ de \d+$/i,
  /^Os números de fatura ou POs/i,
  /^\d{1,2} de [a-zç]+\.? de \d{4}\s*-\s*\d{1,2} de [a-zç]+\.? de \d{4}$/i,
];

function norm(s: string): string {
  return String(s ?? "").replace(/[\u00a0\u2009\u202f]/g, " ").replace(/\s+/g, " ").trim();
}

function lineText(line: TextLine): string {
  return norm(line.tokens.map((t) => t.text).join(" "));
}

/** "1.076,29" → 1076.29 ; "-0,02" → -0.02 */
export function parseEuroPt(s: string): number {
  return Number(String(s).replace(/\./g, "").replace(",", "."));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toIso(day: string, monthPt: string, year: string): string | null {
  const m = MONTHS_PT[monthPt.toLowerCase().replace(/\.$/, "").slice(0, 3)];
  if (!m) return null;
  return `${year}-${m}-${String(day).padStart(2, "0")}`;
}

function parseHeader(lines: TextLine[]): GoogleInvoiceHeader {
  const page1 = lines.filter((l) => l.page === 1).map(lineText).join(" ");
  const invoiceNumber = page1.match(/Número da fatura:?\s*(\d{6,})/i)?.[1] ?? null;

  const issue = page1.match(/Data da fatura\s+(\d{1,2}) de ([a-zç]+)\.? de (\d{4})/i);
  const issueDate = issue ? toIso(issue[1], issue[2], issue[3]) : null;

  const period = page1.match(
    /Resumo relativo ao período de (\d{1,2}) de ([a-zç]+)\.? de (\d{4})\s*-\s*(\d{1,2}) de ([a-zç]+)\.? de (\d{4})/i,
  );
  const periodStart = period ? toIso(period[1], period[2], period[3]) : null;
  const periodEnd = period ? toIso(period[4], period[5], period[6]) : null;
  // billing_period é sempre o primeiro dia do mês de serviço, mesmo quando o
  // período começa a meio do mês.
  const billingPeriod = periodStart ? `${periodStart.slice(0, 7)}-01` : null;

  const accountId = page1.match(/ID da conta\s+([\d-]{8,})/i)?.[1] ?? null;

  const total = page1.match(/Total em EUR\s*(-)?\s*€\s*(-?[\d.]*\d,\d{2})/i);
  const totalAmount = total ? round2(parseEuroPt(total[2]) * (total[1] ? -1 : 1)) : null;

  return { invoiceNumber, issueDate, billingPeriod, periodStart, periodEnd, accountId, totalAmount };
}

interface Buffer {
  parts: string[];
  amount: number | null;
  quantity: number | null;
  unit: string | null;
  continuations: number;
  section: Section;
}

type Section = "media" | "promotion" | "fee";

function classify(buf: Buffer, lineNo: number): GoogleInvoiceParsedLine {
  const raw = norm(buf.parts.join(" ")).replace(/\s*\.{3,}$/, "").trim();
  const amount = round2(buf.amount ?? 0);

  if (/^Atividade inválida/i.test(raw)) {
    const orig = raw.match(/número da fatura original:\s*(\d+)/i)?.[1] ?? null;
    const camp = raw.match(/Nome da campanha:\s*(.+)$/i)?.[1] ?? null;
    return {
      lineNo,
      rawDescription: raw,
      campaignName: camp ? norm(camp) : null,
      quantity: null,
      unit: null,
      amount,
      isAdjustment: true,
      adjustmentKind: "invalid_activity",
      originalInvoiceNumber: orig,
      promotionId: null,
    };
  }

  if (buf.section === "promotion" || buf.section === "fee") {
    return {
      lineNo,
      rawDescription: raw,
      campaignName: null,
      quantity: null,
      unit: null,
      amount,
      isAdjustment: true,
      adjustmentKind: buf.section === "promotion" ? "promotion" : "fee",
      originalInvoiceNumber: null,
      promotionId: raw.match(/ID da promoção:\s*(\S+)/i)?.[1] ?? null,
    };
  }

  return {
    lineNo,
    rawDescription: raw,
    campaignName: raw || null,
    quantity: buf.quantity,
    unit: buf.unit,
    amount,
    isAdjustment: false,
    adjustmentKind: null,
    originalInvoiceNumber: null,
    promotionId: null,
  };
}

export function parseGoogleInvoiceLines(lines: TextLine[]): GoogleInvoiceParseResult {
  const warnings: string[] = [];
  const header = parseHeader(lines);
  const out: GoogleInvoiceParsedLine[] = [];
  let section: Section = "media";
  let buf: Buffer | null = null;
  let lineNo = 0;

  const flush = () => {
    if (!buf) return;
    if (buf.amount === null) {
      warnings.push(`linha sem valor: "${norm(buf.parts.join(" ")).slice(0, 80)}"`);
      buf = null;
      return;
    }
    out.push(classify(buf, ++lineNo));
    buf = null;
  };

  for (const line of lines) {
    if (line.page === 1) continue; // página 1 é cabeçalho/resumo, nunca detalhe
    const text = lineText(line);
    if (!text) continue;

    if (/^Ajustes$/i.test(text)) { flush(); section = "promotion"; continue; }
    if (/^Taxas$/i.test(text)) { flush(); section = "fee"; continue; }
    if (SKIP.some((re) => re.test(text))) { flush(); continue; }

    const tokens = line.tokens;
    const last = tokens[tokens.length - 1].text.trim();
    const moneyOnly = tokens.length === 1 && MONEY.test(last);

    if (moneyOnly) {
      // valor de uma descrição que quebrou de linha (caso "Atividade inválida")
      if (!buf) { buf = { parts: [], amount: null, quantity: null, unit: null, continuations: 0, section }; }
      buf.amount = parseEuroPt(last);
      continue;
    }

    if (MONEY.test(last) && tokens.length >= 2) {
      // linha de detalhe completa
      flush();
      const body = tokens.slice(0, -1).map((t) => t.text.trim());
      let quantity: number | null = null;
      let unit: string | null = null;
      if (body.length >= 3 && /^[\d.]+$/.test(body[body.length - 2])) {
        unit = body[body.length - 1];
        quantity = Number(body[body.length - 2].replace(/\./g, ""));
        body.splice(body.length - 2, 2);
      }
      buf = {
        parts: [norm(body.join(" "))],
        amount: parseEuroPt(last),
        quantity,
        unit,
        continuations: 0,
        section,
      };
      flush();
      continue;
    }

    // linha de texto: começo ou continuação de descrição
    if (buf && buf.amount !== null && buf.continuations >= 1) flush();
    if (!buf) buf = { parts: [], amount: null, quantity: null, unit: null, continuations: 0, section };
    buf.parts.push(text);
    if (buf.amount !== null) buf.continuations++;
  }
  flush();

  const linesSum = round2(out.reduce((s, l) => s + l.amount, 0));
  if (header.totalAmount !== null && Math.abs(header.totalAmount - linesSum) > 0.005) {
    warnings.push(`soma das linhas (${linesSum}) difere do total da fatura (${header.totalAmount})`);
  }

  return {
    header,
    lines: out,
    linesSum,
    warnings,
    debug: { visualLines: lines.length, detailLines: out.length },
  };
}

export async function parseGoogleInvoice(bytes: Uint8Array): Promise<GoogleInvoiceParseResult> {
  const lines = await extractPdfLines(bytes);
  return parseGoogleInvoiceLines(lines);
}
