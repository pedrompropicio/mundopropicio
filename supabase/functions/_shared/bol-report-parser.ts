// Parser do mapa "M2 - TIPO DE VENDA" da BOL (produtores.bol.pt).
// Título no PDF: "Ocupação Sessões M2 - Tipo de Venda".
//
// Formato real (calibrado com o exemplo do Deive Leonardo, Coliseu de Lisboa, 14/08/2026):
//
//   Sector | Lotação Qt | Disp. Qt | Ocupação Qt | Taxa Ocup. % |
//   Vendas Inteiras (Qt, Valor) | Descontos (Qt, Valor) | Total Vendas (Qt, Valor) |
//   Convites Qt | Permutas Qt | Reservas Geral Qt | Reservas Produção Qt | Bloqueados Qt
//
// Uma linha por setor + linha TOTAL. Valores em formato pt (" 3 600,00 €"),
// percentagens com vírgula ("27,8"), zeros escritos como "0" (sem "€").
// Nomes de setor podem ocupar várias linhas no texto extraído e conter números
// ("Camarotes 1ª Frente Par 6 pax"). Pode ter 2+ páginas.
//
// O parser é tolerante: não depende da ordem exata dos tokens de cabeçalho,
// ancora-se em blocos de 15 valores numéricos por linha e valida contra TOTAL.

export interface BolSectorRow {
  sector: string;
  capacity: number;      // Lotação Qt
  available: number;     // Disp. Qt
  occupied: number;      // Ocupação Qt
  occupancyRate: number; // Taxa Ocup. %
  fullQty: number;       // Vendas Inteiras Qt
  fullValue: number;     // Vendas Inteiras Valor
  discountQty: number;   // Descontos Qt
  discountValue: number; // Descontos Valor
  totalQty: number;      // Total Vendas Qt
  totalValue: number;    // Total Vendas Valor
  invitations: number;   // Convites Qt
  swaps: number;         // Permutas Qt
  reservedGeneral: number;
  reservedProduction: number;
  blocked: number;
  rawTokens: string[];
}

export interface BolParseResult {
  rows: BolSectorRow[];
  totalRow: BolSectorRow | null;
  header: {
    eventName: string | null;
    venue: string | null;
    sessionsLabel: string | null;
    generatedAt: string | null;
  };
  totals: { qty: number; value: number; capacity: number };
  warnings: string[];
  debug: Record<string, unknown>;
}

const VALUE_COUNT = 15;

/** Tokens de cabeçalho/rodapé que nunca fazem parte de um nome de setor. */
const NOISE_TOKEN =
  /^(Sector|Setor|Lota[çc][ãa]o|Disp\.?|Ocupa[çc][ãa]o|Ocup\.?|Taxa|Vendas|Inteiras|Descontos|Desconto|Convites|Permutas|Reservas|Geral|Produ[çc][ãa]o|Bloqueados|Total|Qt\.?|%|Valor|P[áa]g\.?|de|www\.bol\.pt|GMT|Standard|Time|M2|-|Tipo|Venda|Sess[õo]es)$/i;

/** Depois deste token, tudo o que vem antes é cabeçalho/rodapé. */
const CUT_TOKEN = /^(www\.bol\.pt|\||\)|Time|Valor|Qt\.?|%|Bloqueados|Produ[çc][ãa]o)$/i;

const NUMERIC = /^-?\d+(?:[.,]\d+)?$/;
const MONEY_SUFFIX = /€$/;

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[\u00a0\u2009\u202f]/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(raw: string): number {
  const cleaned = raw.replace(/€/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const isNumericToken = (t: string) => NUMERIC.test(t.replace(/€$/, "")) || t === "€";

/**
 * Resolve um bloco de tokens numéricos em valores.
 * Ambiguidade: "60 3 600,00 €" pode ser (60, 3600.00) ou (60, 3, 600.00).
 * Resolve-se juntando grupos de milhar de 3 dígitos ao valor monetário e
 * testando as duas leituras do grupo líder até obter exatamente 15 valores.
 */
function resolveValues(tokens: string[]): number[] | null {
  // 1. junta o "€" solto ao token anterior
  const merged: string[] = [];
  for (const t of tokens) {
    if (t === "€" && merged.length) merged[merged.length - 1] += "€";
    else merged.push(t);
  }

  // 2. localiza os tokens monetários (terminam em €) e os grupos de milhar
  //    imediatamente à sua esquerda.
  type Group = { moneyIdx: number; leaderIdx: number | null; midIdxs: number[] };
  const groups: Group[] = [];
  for (let i = 0; i < merged.length; i++) {
    if (!MONEY_SUFFIX.test(merged[i])) continue;
    const midIdxs: number[] = [];
    let j = i - 1;
    while (j >= 0 && /^\d{3}$/.test(merged[j]) && !MONEY_SUFFIX.test(merged[j])) {
      midIdxs.unshift(j);
      j--;
    }
    const leaderIdx = j >= 0 && /^\d{1,3}$/.test(merged[j]) && !MONEY_SUFFIX.test(merged[j]) ? j : null;
    groups.push({ moneyIdx: i, leaderIdx, midIdxs });
  }

  const build = (useLeader: boolean[]): { values: number[]; moneyPos: number[] } => {
    const consumed = new Set<number>();
    groups.forEach((g, gi) => {
      if (useLeader[gi] && g.leaderIdx !== null) consumed.add(g.leaderIdx);
      for (const idx of g.midIdxs) consumed.add(idx);
    });
    const values: number[] = [];
    const moneyPos: number[] = [];
    for (let k = 0; k < merged.length; k++) {
      if (consumed.has(k)) continue; // absorvido no valor monetário
      if (MONEY_SUFFIX.test(merged[k])) {
        const gi = groups.findIndex((x) => x.moneyIdx === k);
        const g = groups[gi];
        const pieces: string[] = [];
        if (useLeader[gi] && g.leaderIdx !== null) pieces.push(merged[g.leaderIdx]);
        pieces.push(...g.midIdxs.map((z) => merged[z]));
        pieces.push(merged[k].replace(/€$/, ""));
        moneyPos.push(values.length);
        values.push(toNumber(pieces.join("")));
      } else {
        values.push(toNumber(merged[k]));
      }
    }
    return { values, moneyPos };
  };

  const n = groups.length;
  let best: { values: number[]; score: number } | null = null;
  for (let mask = 0; mask < (1 << n); mask++) {
    const useLeader = Array.from({ length: n }, (_, k) => Boolean(mask & (1 << k)));
    const { values, moneyPos } = build(useLeader);
    if (values.length !== VALUE_COUNT) continue;
    // Coerência estrutural: monetários em 5/7/9, Total = Inteiras + Descontos.
    let score = 0;
    if (moneyPos.every((p) => p === 5 || p === 7 || p === 9)) score += 10;
    if (values[8] === values[4] + values[6]) score += 5;
    if (Math.abs(values[9] - (values[5] + values[7])) < 0.02) score += 5;
    if (values[0] === values[1] + values[2]) score += 2;
    if (!best || score > best.score) best = { values, score };
  }
  return best ? best.values : null;

}

function cleanName(buffer: string[]): string {
  let toks = buffer.slice();
  // corta tudo até ao último token de cabeçalho/rodapé
  let cut = -1;
  for (let i = 0; i < toks.length; i++) if (CUT_TOKEN.test(toks[i])) cut = i;
  if (cut >= 0) toks = toks.slice(cut + 1);
  toks = toks.filter((t) => !NOISE_TOKEN.test(t) && !/^\d{2}\|\d{2}\|\d{4}$/.test(t) && !/^\d{2}:\d{2}$/.test(t));
  if (toks.length > 8) toks = toks.slice(-8);
  return toks.join(" ").replace(/\s+/g, " ").trim();
}

function makeRow(sector: string, v: number[], rawTokens: string[]): BolSectorRow {
  return {
    sector,
    capacity: v[0],
    available: v[1],
    occupied: v[2],
    occupancyRate: v[3],
    fullQty: v[4],
    fullValue: v[5],
    discountQty: v[6],
    discountValue: v[7],
    totalQty: v[8],
    totalValue: v[9],
    invitations: v[10],
    swaps: v[11],
    reservedGeneral: v[12],
    reservedProduction: v[13],
    blocked: v[14],
    rawTokens,
  };
}

/** Parser do M2 — Tipo de Venda. */
export function parseBolM2(text: string): BolParseResult {
  const flat = normalizeWhitespace(text);
  const tokens = flat.split(" ").filter((t) => t.length > 0);
  const warnings: string[] = [];
  const rows: BolSectorRow[] = [];
  let totalRow: BolSectorRow | null = null;

  let nameBuffer: string[] = [];
  let i = 0;
  let numericRuns = 0;
  while (i < tokens.length) {
    if (!isNumericToken(tokens[i])) {
      nameBuffer.push(tokens[i]);
      i++;
      continue;
    }
    // corrida numérica maximal
    let j = i;
    while (j < tokens.length && isNumericToken(tokens[j])) j++;
    const run = tokens.slice(i, j);
    numericRuns++;
    const values = resolveValues(run);
    if (values) {
      // "TOTAL" só conta se for o último token antes dos números — o cabeçalho
      // também contém "Total Vendas".
      const isTotal = /^TOTAL$/i.test(nameBuffer[nameBuffer.length - 1] || "");
      const name = isTotal ? "TOTAL" : cleanName(nameBuffer);
      const row = makeRow(name, values, run);
      if (isTotal) {
        if (!totalRow) totalRow = row;
      } else if (!name) {
        warnings.push(`Linha com 15 valores sem nome de setor reconhecido: ${run.join(" ").slice(0, 120)}`);
      } else {
        rows.push(row);
      }
      nameBuffer = [];
    } else {
      // não é uma linha de dados (ex.: números no nome, paginação, timestamps)
      nameBuffer.push(...run);
    }
    i = j;
  }

  const totals = rows.reduce(
    (acc, r) => ({
      qty: acc.qty + r.totalQty,
      value: Math.round((acc.value + r.totalValue) * 100) / 100,
      capacity: acc.capacity + r.capacity,
    }),
    { qty: 0, value: 0, capacity: 0 },
  );

  if (!totalRow) {
    warnings.push("Linha TOTAL não encontrada no mapa M2 — soma não validada.");
  } else {
    if (totalRow.totalQty !== totals.qty) {
      warnings.push(`Divergência de bilhetes: TOTAL do relatório = ${totalRow.totalQty}, soma dos setores = ${totals.qty}.`);
    }
    if (Math.abs(totalRow.totalValue - totals.value) > 0.02) {
      warnings.push(`Divergência de valor: TOTAL do relatório = ${totalRow.totalValue}, soma dos setores = ${totals.value}.`);
    }
  }
  if (rows.length === 0) warnings.push("Nenhum setor reconhecido no mapa M2 — layout inesperado.");

  const sessionsLabel = flat.match(/Todas as sess[õo]es[^|]{0,40}/i)?.[0]?.trim() || null;
  const generatedAt = flat.match(/\d{2}\|\d{2}\|\d{4}\s+\d{2}:\d{2}(?:\s+[A-Za-z ]+Time)?/)?.[0] || null;
  const venue = flat.match(/(Coliseu|Pavilh[ãa]o|Casino|Teatro|Altice|Sala|Multiusos|Europarque|Est[áa]dio|Cine)[^|]{0,40}/i)?.[0]?.trim() || null;
  const eventName = flat.match(/[A-ZÁÂÃÀÉÊÍÓÔÕÚÇ][A-ZÁÂÃÀÉÊÍÓÔÕÚÇ ,'’]{6,}\|[^|]{0,40}/)?.[0]?.trim() || null;

  return {
    rows,
    totalRow,
    header: { eventName, venue, sessionsLabel, generatedAt },
    totals,
    warnings,
    debug: { tokens: tokens.length, numericRuns, sectors: rows.length, hasTotalRow: !!totalRow },
  };
}

/** Extrai texto de um PDF (Uint8Array) usando unpdf. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // @ts-ignore — especificador remoto Deno (não resolvido pelo tsc do frontend)
  const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text ?? "");
}
