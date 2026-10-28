/**
 * Pesquisa geral da aba Documentos do Portal da Contabilidade (#392, R1 revisto, 28/10/2026).
 *
 * Regras decididas pelo Pedro:
 * - Termos separados por espaço combinam com E (cada termo pode casar em qualquer campo).
 * - Sem distinguir maiúsculas nem acentos (normalização NFD + remoção de diacríticos).
 * - Valor: aceita "1.234,56", "1234,56", "1234.56", "1234", "€ 1.234,56".
 *   Um termo numérico casa se for igual ao amount OU ao paid_amount (2 casas)
 *   OU se aparecer como parte do valor formatado ("234" casa 1.234,56).
 * - O filtro corre no cliente sobre o universo paginado (fetchAllPagedQuery);
 *   este módulo é puro e não fala com a base.
 */

/** Normaliza para comparação: NFD, sem diacríticos, minúsculas. */
export function normalizeSearchText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Faz o parse de um termo numérico em formato PT ou EN.
 * Devolve null quando o termo não é um valor monetário/numérico.
 *
 * Regras:
 * - "€", espaços e sinal "-" são ignorados.
 * - Com os dois separadores, o mais à direita é o decimal ("1.234,56" PT, "1,234.56" EN).
 * - Com um só separador: uma ocorrência seguida de 1-2 dígitos é decimal;
 *   seguida de 3 dígitos (ou repetida) é separador de milhares.
 * - Só dígitos: inteiro.
 */
export function parseAmountTerm(term: string): number | null {
  let t = term.trim().replace(/€/g, "").replace(/\s+/g, "");
  if (!t) return null;
  let negative = false;
  if (t.startsWith("-")) {
    negative = true;
    t = t.slice(1);
  }
  if (!/^\d[\d.,]*$/.test(t)) return null;

  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  let decimalSep: string | null = null;

  if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? "," : ".";
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = t.split(sep);
    const trailing = parts[parts.length - 1].length;
    if (parts.length === 2 && trailing >= 1 && trailing <= 2) {
      decimalSep = sep; // "1234,56" / "1234.5"
    } else if (trailing === 3 && parts.slice(1).every((p) => p.length === 3)) {
      decimalSep = null; // "1.234" / "1,234,567" → milhares
    } else if (parts.length === 2 && trailing <= 2) {
      decimalSep = sep;
    } else {
      return null; // formato ambíguo ("1.2345", "1,23,4") não é valor
    }
  }

  let normalized = t;
  if (decimalSep) {
    const thousandSep = decimalSep === "," ? "." : ",";
    normalized = normalized.split(thousandSep).join("");
    normalized = normalized.replace(decimalSep, ".");
  } else {
    normalized = normalized.replace(/[.,]/g, "");
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** Campos pesquisáveis de uma linha da aba Documentos. */
export interface AccountantSearchRow {
  description?: string | null;
  invoice_ref?: string | null;
  supplier_name?: string | null;
  supplier_trade_name?: string | null;
  supplier_nif?: string | null;
  account_name?: string | null;
  review_note?: string | null;
  response_note?: string | null;
  amount?: number | null;
  paid_amount?: number | null;
}

const TEXT_FIELDS: (keyof AccountantSearchRow)[] = [
  "description",
  "invoice_ref",
  "supplier_name",
  "supplier_trade_name",
  "supplier_nif",
  "account_name",
  "review_note",
  "response_note",
];

/** Formata um valor para comparação parcial: "1.234,56" (pt-PT) e "1234.56". */
function formattedVariants(value: number): string[] {
  const abs = Math.abs(value);
  return [
    abs.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    abs.toFixed(2),
  ];
}

/** Um termo casa se aparecer em qualquer campo de texto OU casar com o valor. */
export function matchesTerm(row: AccountantSearchRow, term: string): boolean {
  const normalizedTerm = normalizeSearchText(term.trim());
  if (!normalizedTerm) return true;

  for (const field of TEXT_FIELDS) {
    const value = row[field];
    if (typeof value === "string" && value && normalizeSearchText(value).includes(normalizedTerm)) {
      return true;
    }
  }

  const parsed = parseAmountTerm(term);
  if (parsed !== null) {
    const bare = normalizedTerm.replace(/[€\s]/g, "").replace(/^-/, "");
    for (const value of [row.amount, row.paid_amount]) {
      if (value === null || value === undefined) continue;
      const num = Number(value);
      if (!Number.isFinite(num)) continue;
      // Igualdade a 2 casas decimais.
      if (Math.abs(num - parsed) < 0.005) return true;
      // Parte do valor formatado ("234" casa 1.234,56).
      if (bare && formattedVariants(num).some((f) => f.includes(bare))) return true;
    }
  }

  return false;
}

/** Todos os termos têm de casar (E lógico); pesquisa vazia casa tudo. */
export function matchesAllTerms(row: AccountantSearchRow, query: string): boolean {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  return terms.every((term) => matchesTerm(row, term));
}

/**
 * Com texto na pesquisa o ZIP fica desativado: o generate-accountant-zip só
 * conhece período e filtros e exportaria transações que a contabilista não vê.
 * ZIP dos resultados da pesquisa será uma Issue R2 à parte.
 */
export function isZipBlockedBySearch(query: string): boolean {
  return query.trim().length > 0;
}
