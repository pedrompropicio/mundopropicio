// Parser do "Mapa Diário de Vendas por Sessão" da BOL (produtores.bol.pt).
//
// Fonte secundária do sync (o M2 é cumulativo, este mapa dá a série diária).
// Implementação TOKEN-BASED (como o parseBolM2): NÃO assume quebras de linha,
// porque o unpdf devolve o PDF como um fluxo praticamente contínuo.
//
// Estrutura real (Deive Leonardo, Coliseu de Lisboa):
//   Cabeçalho: Data | Bilhetes | Vendas Inteiras (Bilheteira Local, Ponto de
//   Venda, Internet) | Vendas Desconto (idem) | TOTAL
//   -> a palavra "TOTAL" aparece TAMBÉM no cabeçalho (nunca usar a 1ª ocorrência).
//
//   Cada dia = data dd/mm/yyyy + 1 inteiro (bilhetes) + 7 montantes pt
//   (o 7º é o TOTAL do dia). Dias por ordem DECRESCENTE de data.
//   Linha final = "TOTAL" + inteiro + 7 montantes (7º = valor total geral).
//   Rodapé: nome do evento, sala, "Todas as sessões (Em Venda)", timestamp.

export interface BolDailyRow {
  /** YYYY-MM-DD */
  date: string;
  quantity: number;
  /** TOTAL do dia (€) */
  totalValue: number;
  /** as 6 colunas de canal que antecedem o total */
  channels: number[];
}

export interface BolDailyParseResult {
  rows: BolDailyRow[];
  totalRow: { quantity: number; totalValue: number } | null;
  header: {
    eventName: string | null;
    venue: string | null;
    sessionsLabel: string | null;
    generatedAt: string | null;
    periodFrom: string | null;
    periodTo: string | null;
  };
  totals: { quantity: number; totalValue: number };
  warnings: string[];
  debug: Record<string, unknown>;
}

/** " 3 600,00 €" / "1.184,00 €" / "0,00 €" */
const MONEY_RE = /-?[\d.\s\u00a0\u2009\u202f]*\d,\d{2}\s*€?/;
const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** "1 184,00" / "1.184,00" / "365,00" → number */
export function parsePtNumber(raw: string): number {
  const cleaned = raw
    .replace(/€/g, "")
    .replace(/[\s\u00a0\u2009\u202f]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalize(text: string): string {
  return text
    .replace(/[\u00a0\u2009\u202f]/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Divide o fluxo em tokens semânticos: datas, montantes, inteiros e palavras.
 * Os montantes são reconhecidos primeiro (podem conter espaços de milhar), o
 * que evita que "3 600,00 €" se parta em "3" + "600,00".
 */
type Tok =
  | { k: "date"; iso: string }
  | { k: "money"; v: number }
  | { k: "int"; v: number }
  | { k: "word"; v: string };

function tokenize(flat: string): Tok[] {
  const toks: Tok[] = [];
  let rest = flat;
  const guard = /^(\d{2}\/\d{2}\/\d{4})|^(-?\d[\d.\s]*\d,\d{2}\s*€?|-?\d,\d{2}\s*€?)|^(\d+)|^(\S+)/;
  while (rest.length > 0) {
    rest = rest.replace(/^\s+/, "");
    if (!rest) break;
    const m = guard.exec(rest);
    if (!m) break;
    const raw = m[0];
    if (m[1]) {
      const d = DATE_RE.exec(m[1])!;
      toks.push({ k: "date", iso: `${d[3]}-${d[2]}-${d[1]}` });
    } else if (m[2]) {
      toks.push({ k: "money", v: parsePtNumber(m[2]) });
    } else if (m[3]) {
      toks.push({ k: "int", v: parseInt(m[3], 10) });
    } else {
      toks.push({ k: "word", v: raw });
    }
    rest = rest.slice(raw.length);
  }
  return toks;
}

/** A partir de `from`, captura 1 inteiro seguido de 7 montantes. */
function readBlock(toks: Tok[], from: number): { qty: number; monies: number[]; next: number } | null {
  let i = from;
  // o inteiro tem de vir antes de qualquer montante
  while (i < toks.length && toks[i].k === "word") i++;
  if (i >= toks.length || toks[i].k !== "int") return null;
  const qty = (toks[i] as { k: "int"; v: number }).v;
  i++;
  const monies: number[] = [];
  while (i < toks.length && monies.length < 7) {
    const t = toks[i];
    if (t.k === "money") {
      monies.push(t.v);
      i++;
    } else if (t.k === "int" && t.v === 0) {
      // zeros podem vir escritos como "0" (sem ",00 €")
      monies.push(0);
      i++;
    } else break;
  }
  if (monies.length !== 7) return null;
  return { qty, monies, next: i };
}

export function parseBolDiario(text: string): BolDailyParseResult {
  const flat = normalize(text);
  const toks = tokenize(flat);
  const warnings: string[] = [];
  const rows: BolDailyRow[] = [];
  const seen = new Set<string>();
  let totalRow: { quantity: number; totalValue: number } | null = null;
  let lastDayIdx = -1;

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.k !== "date") continue;
    const blk = readBlock(toks, i + 1);
    if (!blk) continue;
    if (seen.has(t.iso)) {
      warnings.push(`Dia ${t.iso} aparece mais de uma vez no relatório — mantida a primeira ocorrência.`);
      i = blk.next - 1;
      continue;
    }
    seen.add(t.iso);
    rows.push({
      date: t.iso,
      quantity: blk.qty,
      totalValue: blk.monies[6],
      channels: blk.monies.slice(0, 6),
    });
    lastDayIdx = blk.next;
    i = blk.next - 1;
  }

  // Linha TOTAL: a ocorrência de "TOTAL" DEPOIS do último dia seguida de
  // inteiro + 7 montantes (a do cabeçalho não tem bloco numérico atrás).
  for (let i = Math.max(0, lastDayIdx); i < toks.length; i++) {
    const t = toks[i];
    if (t.k !== "word" || !/^TOTAL$/i.test(t.v)) continue;
    const blk = readBlock(toks, i + 1);
    if (!blk) continue;
    totalRow = { quantity: blk.qty, totalValue: blk.monies[6] };
    break;
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  const totals = rows.reduce(
    (acc, r) => ({
      quantity: acc.quantity + r.quantity,
      totalValue: Math.round((acc.totalValue + r.totalValue) * 100) / 100,
    }),
    { quantity: 0, totalValue: 0 },
  );

  if (totalRow) {
    if (totalRow.quantity !== totals.quantity) {
      warnings.push(`Divergência de bilhetes: linha TOTAL = ${totalRow.quantity}, soma dos dias = ${totals.quantity}.`);
    }
    if (Math.abs(totalRow.totalValue - totals.totalValue) > 0.01) {
      warnings.push(`Divergência de valor: linha TOTAL = ${totalRow.totalValue}, soma dos dias = ${totals.totalValue}.`);
    }
  } else {
    warnings.push("Linha TOTAL não encontrada no relatório — soma não validada.");
  }
  if (rows.length === 0) warnings.push("Nenhuma linha diária reconhecida no PDF — layout inesperado.");

  const sessionsLabel = flat.match(/Todas as sess[õo]es[^|]{0,40}/i)?.[0]?.trim() || null;
  const generatedAt = flat.match(/\d{2}[|/]\d{2}[|/]\d{4}\s+\d{2}[:h]\d{2}(?:\s+[A-Za-z ]+Time)?/)?.[0] || null;
  const venue =
    flat.match(/(Coliseu|Pavilh[ãa]o|Casino|Teatro|Altice|Sala|Multiusos|Europarque|Est[áa]dio|Cine)[^|]{0,40}/i)?.[0]?.trim() || null;
  const eventName = flat.match(/[A-ZÁÂÃÀÉÊÍÓÔÕÚÇ][A-ZÁÂÃÀÉÊÍÓÔÕÚÇ ,'’]{6,}\|[^|]{0,40}/)?.[0]?.trim() || null;

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
    debug: {
      tokens: toks.length,
      daysParsed: rows.length,
      hasTotalRow: !!totalRow,
      firstDate: rows[0]?.date || null,
      lastDate: rows[rows.length - 1]?.date || null,
    },
  };
}

export interface BolDailyImportAudit {
  daily_rows: number;
  daily_total_qty: number;
  daily_total_value: number;
  daily_deleted: number;
  warnings: string[];
}

/**
 * Import full-replace da série diária de um evento.
 * Validação bloqueante contra a linha TOTAL do PDF.
 */
export async function importBolDailySeries(opts: {
  supabase: any; // service-role
  eventId: string;
  companyId: string;
  parseResult: BolDailyParseResult;
}): Promise<BolDailyImportAudit> {
  const { supabase, eventId, companyId, parseResult } = opts;

  if (parseResult.rows.length === 0) {
    throw new Error("Mapa Diário sem linhas reconhecidas — série diária não importada.");
  }
  if (!parseResult.totalRow) {
    throw new Error("Mapa Diário sem linha TOTAL — impossível validar a série diária.");
  }
  if (parseResult.totalRow.quantity !== parseResult.totals.quantity) {
    throw new Error(
      `Validação falhou (Diário): TOTAL do relatório = ${parseResult.totalRow.quantity} bilhetes, soma dos dias = ${parseResult.totals.quantity}.`,
    );
  }
  if (Math.abs(parseResult.totalRow.totalValue - parseResult.totals.totalValue) > 0.01) {
    throw new Error(
      `Validação falhou (Diário): TOTAL do relatório = ${parseResult.totalRow.totalValue} €, soma dos dias = ${parseResult.totals.totalValue} €.`,
    );
  }

  const { data: prior } = await supabase.from("bol_daily_sales").select("id").eq("event_id", eventId);
  const { error: delErr } = await supabase.from("bol_daily_sales").delete().eq("event_id", eventId);
  if (delErr) throw new Error(`Apagar série diária anterior: ${delErr.message}`);

  const payload = parseResult.rows.map((r) => ({
    company_id: companyId,
    event_id: eventId,
    sale_date: r.date,
    quantity: r.quantity,
    total_value: r.totalValue,
  }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from("bol_daily_sales").insert(payload.slice(i, i + 500));
    if (error) throw new Error(`Insert bol_daily_sales: ${error.message}`);
  }

  return {
    daily_rows: payload.length,
    daily_total_qty: parseResult.totals.quantity,
    daily_total_value: parseResult.totals.totalValue,
    daily_deleted: prior?.length || 0,
    warnings: parseResult.warnings,
  };
}
