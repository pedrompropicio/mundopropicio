/**
 * Parser do extrato do Santander Totta — formato "tabulado Excel".
 *
 * Ficheiro sem cabeçalho, separador `;`, codificação latin-1, quebras CRLF.
 * Onze colunas por linha, por esta ordem:
 *   0 nº de conta
 *   1 data de movimento DD-MM-AAAA
 *   2 data-valor DD-MM-AAAA
 *   3 descrição (com enchimento de espaços à direita)
 *   4 campo de zeros
 *   5 débito  (sinal colado, zeros à esquerda, decimais com vírgula)
 *   6 crédito (idem; só um dos dois vem preenchido)
 *   7 saldo após o movimento
 *   8..10 códigos internos
 *
 * O ficheiro é um FACTO EXTERNO: o parser não interpreta nem corrige nada,
 * apenas lê. A estrutura está preparada para outros bancos no futuro
 * (`BankStatementFormat`), mas só o Santander está implementado.
 */

export type BankStatementFormat = "santander_tabulado";

export interface ParsedStatementLine {
  /** 1-indexado, sobre as linhas úteis do ficheiro (para mensagens de erro). */
  lineNumber: number;
  accountNumber: string;
  bookingDate: string; // YYYY-MM-DD
  valueDate: string | null; // YYYY-MM-DD
  description: string;
  /** Valor com sinal: negativo a débito, positivo a crédito. */
  amount: number;
  balanceAfter: number | null;
  raw: Record<string, unknown>;
}

export interface ParsedStatement {
  format: BankStatementFormat;
  lines: ParsedStatementLine[];
  periodFrom: string | null;
  periodTo: string | null;
  /** Saldo antes da primeira linha = saldo da 1.ª linha − o seu movimento. */
  openingBalance: number | null;
  /** Saldo após a última linha, como declarado pelo banco. */
  closingBalance: number | null;
  /** Coerência interna: saldo[i] = saldo[i−1] + movimento[i]. */
  coherent: boolean;
  /** Preenchido quando `coherent` é falso. */
  coherenceError: string | null;
}

/** Lê o ficheiro em latin-1 (ISO-8859-1), como o banco o produz. */
export function decodeLatin1(buffer: ArrayBuffer): string {
  return new TextDecoder("iso-8859-1").decode(new Uint8Array(buffer));
}

/** "-00000000000002968,13" → -2968.13 · "   " → null */
export function parseSantanderAmount(field: string | undefined): number | null {
  const raw = (field ?? "").trim();
  if (!raw) return null;
  const sign = raw.startsWith("-") ? -1 : 1;
  const digits = raw.replace(/[+-]/g, "").replace(/\./g, "").replace(",", ".");
  if (!digits || !/^\d*(\.\d*)?$/.test(digits)) return null;
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return Math.round(sign * n * 100) / 100;
}

/** "31-08-2026" → "2026-08-31" */
export function parseSantanderDate(field: string | undefined): string | null {
  const m = (field ?? "").trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const CENT = 0.005;

export function parseSantanderStatement(buffer: ArrayBuffer): ParsedStatement {
  const text = decodeLatin1(buffer);
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const lines: ParsedStatementLine[] = [];
  rawLines.forEach((rawLine, idx) => {
    const cols = rawLine.split(";");
    if (cols.length < 8) {
      throw new Error(
        `Linha ${idx + 1} não tem o formato esperado (${cols.length} colunas, esperadas 11).`,
      );
    }
    const bookingDate = parseSantanderDate(cols[1]);
    if (!bookingDate) {
      throw new Error(`Linha ${idx + 1}: data de movimento ilegível ("${cols[1]}").`);
    }
    const debit = parseSantanderAmount(cols[5]);
    const credit = parseSantanderAmount(cols[6]);
    if (debit === null && credit === null) {
      throw new Error(`Linha ${idx + 1}: sem débito nem crédito.`);
    }
    const amount = debit !== null ? debit : (credit as number);
    lines.push({
      lineNumber: idx + 1,
      accountNumber: (cols[0] ?? "").trim(),
      bookingDate,
      valueDate: parseSantanderDate(cols[2]),
      description: (cols[3] ?? "").trim(),
      amount,
      balanceAfter: parseSantanderAmount(cols[7]),
      raw: { cols, line: rawLine },
    });
  });

  if (lines.length === 0) {
    throw new Error("Ficheiro sem linhas de movimento.");
  }

  // Coerência interna: cada saldo tem de ser o anterior mais o movimento.
  let coherent = true;
  let coherenceError: string | null = null;
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1].balanceAfter;
    const cur = lines[i].balanceAfter;
    if (prev === null || cur === null) continue;
    const expected = Math.round((prev + lines[i].amount) * 100) / 100;
    if (Math.abs(expected - cur) > CENT) {
      coherent = false;
      coherenceError =
        `A cadeia de saldos parte na linha ${lines[i].lineNumber}: ` +
        `saldo anterior ${prev.toFixed(2)} + movimento ${lines[i].amount.toFixed(2)} = ` +
        `${expected.toFixed(2)}, mas o ficheiro declara ${cur.toFixed(2)}.`;
      break;
    }
  }

  const first = lines[0];
  const last = lines[lines.length - 1];
  const openingBalance =
    first.balanceAfter === null ? null : Math.round((first.balanceAfter - first.amount) * 100) / 100;

  const dates = lines.map((l) => l.bookingDate).sort();

  return {
    format: "santander_tabulado",
    lines,
    periodFrom: dates[0] ?? null,
    periodTo: dates[dates.length - 1] ?? null,
    openingBalance,
    closingBalance: last.balanceAfter,
    coherent,
    coherenceError,
  };
}

/**
 * Impressão digital de uma linha, única por conta.
 *
 * Entra o saldo após o movimento DE PROPÓSITO: é o que distingue dois
 * movimentos iguais no mesmo dia. Reimportar o mesmo ficheiro não pode
 * criar uma única linha nova.
 */
export async function computeLineHash(
  accountId: string,
  line: Pick<ParsedStatementLine, "bookingDate" | "valueDate" | "description" | "amount" | "balanceAfter">,
): Promise<string> {
  const normDesc = line.description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const payload = [
    accountId,
    line.bookingDate,
    line.valueDate ?? "",
    normDesc,
    line.amount.toFixed(2),
    line.balanceAfter === null ? "" : line.balanceAfter.toFixed(2),
  ].join("|");
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
