/**
 * Saneador de texto para PDFs gerados com jsPDF.
 * O jsPDF usa Helvetica com codificação WinAnsi, que não tem U+2212 (MINUS SIGN):
 * esse carácter sai como aspa ("9,89 € em vez de −9,89 €). Trocamos também
 * U+2013/U+2014 por hífen ASCII para uniformizar. Aplicar a TODO o texto que
 * entra no PDF, incluindo notas vindas da base.
 */
export const sanitizePdfText = (text: string): string => String(text ?? "").replace(/[\u2212\u2013\u2014]/g, "-");

const sanitizeCell = (c: unknown): unknown => (typeof c === "string" ? sanitizePdfText(c) : c);
export const sanitizePdfRows = <T>(rows: T[][] | undefined): T[][] | undefined =>
  rows?.map((r) => r.map(sanitizeCell) as T[]);
