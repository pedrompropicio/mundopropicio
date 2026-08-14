// Parser do "Mapa Diário de Vendas por Sessão" da BOL (produtores.bol.pt).
//
// Formato calibrado com exemplo real de 14/08/2026 (Deive Leonardo, Coliseu de Lisboa):
//
//   Data | Bilhetes | Vendas Inteiras (Bilheteira Local, Ponto de Venda, Internet)
//                   | Vendas Desconto (Bilheteira Local, Ponto de Venda, Internet) | TOTAL
//
// Uma linha por dia: `13/08/2026  8   365,00 €  ...  1 184,00 €`
//   - data DD/MM/YYYY
//   - quantidade inteira (bilhetes)
//   - 7 valores monetários (6 colunas de canal + TOTAL), formato pt: espaço (ou
//     espaço fino/NBSP) como separador de milhar e vírgula decimal.
// Linha final "TOTAL" com a soma (ex.: 267 bilhetes, 11 634,00 €).
// Rodapé com nome do evento, sala, "Todas as sessões (Em Venda)", data de geração e www.bol.pt.
// Pode ter 2+ páginas — o parser percorre o texto completo e ignora repetições de cabeçalho.

export interface BolDailyRow {
  /** YYYY-MM-DD */
  date: string;
  qty: number;
  /** TOTAL do dia (€) */
  total: number;
  /** 6 colunas de canal, quando presentes */
  channels: number[];
  rawLabel: string;
}

export interface BolParseResult {
  rows: BolDailyRow[];
  totalRow: { qty: number; total: number } | null;
  header: {
    eventName: string | null;
    venue: string | null;
    sessionsLabel: string | null;
    generatedAt: string | null;
    periodFrom: string | null;
    periodTo: string | null;
  };
  totals: { qty: number; total: number };
  warnings: string[];
  debug: Record<string, unknown>;
}

const MONEY_RE = /-?\d[\d\s\u00a0\u2009\u202f.]*,\d{2}/g;

/** "1 184,00" / "1.184,00" / "365,00" → number */
export function parsePtNumber(raw: string): number {
  const cleaned = raw
    .replace(/[\s\u00a0\u2009\u202f]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toIsoDate(ddmmyyyy: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy.trim());
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function normalizeText(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[\u00a0\u2009\u202f]/g, " ").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
}

/**
 * Parser tolerante: opera linha a linha sobre o texto extraído do PDF.
 * Só precisa de encontrar, em cada linha de dia, a data + a quantidade + os
 * valores monetários; o último valor monetário da linha é o TOTAL do dia.
 */
export function parseBolDailyMap(text: string): BolParseResult {
  const lines = normalizeText(text);
  const warnings: string[] = [];
  const rows: BolDailyRow[] = [];
  const seen = new Set<string>();
  let totalRow: { qty: number; total: number } | null = null;

  for (const line of lines) {
    const dateMatch = line.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    const monies = line.match(MONEY_RE) || [];

    // Linha TOTAL (sem data, com "TOTAL" e valores)
    if (!dateMatch && /\bTOTAL\b/i.test(line) && monies.length > 0) {
      const rest = line.replace(MONEY_RE, " ");
      const qtyM = rest.match(/\b(\d{1,7})\b/);
      const qty = qtyM ? parseInt(qtyM[1], 10) : 0;
      const total = parsePtNumber(monies[monies.length - 1]);
      if (!totalRow) totalRow = { qty, total };
      continue;
    }

    if (!dateMatch || monies.length === 0) continue;

    const iso = toIsoDate(dateMatch[1]);
    if (!iso) continue;

    // Quantidade = primeiro inteiro "solto" da linha depois de remover
    // a data e os valores monetários.
    const rest = line
      .replace(dateMatch[1], " ")
      .replace(MONEY_RE, " ");
    const qtyM = rest.match(/-?\b\d{1,7}\b/);
    const qty = qtyM ? parseInt(qtyM[0], 10) : 0;

    const values = monies.map(parsePtNumber);
    const total = values[values.length - 1];
    const channels = values.slice(0, Math.max(0, values.length - 1));

    if (seen.has(iso)) {
      warnings.push(`Dia ${iso} aparece mais de uma vez no relatório — mantida a primeira ocorrência.`);
      continue;
    }
    seen.add(iso);
    rows.push({ date: iso, qty, total, channels, rawLabel: line.slice(0, 200) });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  const totals = rows.reduce(
    (acc, r) => ({ qty: acc.qty + r.qty, total: Math.round((acc.total + r.total) * 100) / 100 }),
    { qty: 0, total: 0 },
  );

  // Validação contra a linha TOTAL do relatório
  if (totalRow) {
    if (totalRow.qty !== totals.qty) {
      warnings.push(`Divergência de bilhetes: linha TOTAL do relatório = ${totalRow.qty}, soma das linhas = ${totals.qty}.`);
    }
    if (Math.abs(totalRow.total - totals.total) > 0.02) {
      warnings.push(`Divergência de valor: linha TOTAL do relatório = ${totalRow.total}, soma das linhas = ${totals.total}.`);
    }
  } else {
    warnings.push("Linha TOTAL não encontrada no relatório — soma não validada.");
  }

  // Rodapé / cabeçalho editorial
  const joined = lines.join(" | ");
  const sessionsLabel = joined.match(/Todas as sess[õo]es[^|]*/i)?.[0]?.trim() || null;
  const generatedAt = joined.match(/\b\d{2}\/\d{2}\/\d{4}[ ,]+\d{2}[:h]\d{2}\b/)?.[0] || null;
  const venue = lines.find((l) => /^(Coliseu|Pavilh|Casino|Teatro|Altice|Sala|Multiusos|Europarque|Campo|Est[áa]dio|Cine)/i.test(l)) || null;
  const eventName = lines.find((l) => /[A-ZÁÂÃÀÉÊÍÓÔÕÚÇ]{4,}/.test(l) && /\|/.test(l) && !/\d{2}\/\d{2}\/\d{4}/.test(l))
    || lines.find((l) => /^[^a-z]{10,}$/.test(l) && !/TOTAL|BILHETES|VENDAS/i.test(l))
    || null;

  if (rows.length === 0) {
    warnings.push("Nenhuma linha diária reconhecida no PDF — layout inesperado.");
  }

  return {
    rows,
    totalRow,
    header: {
      eventName,
      venue,
      sessionsLabel,
      generatedAt,
      periodFrom: rows[0]?.date || null,
      periodTo: rows[rows.length - 1]?.date || null,
    },
    totals,
    warnings,
    debug: { lines: lines.length, daysParsed: rows.length, hasTotalRow: !!totalRow },
  };
}

/** Extrai texto de um PDF (Uint8Array) usando unpdf. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text ?? "");
}
