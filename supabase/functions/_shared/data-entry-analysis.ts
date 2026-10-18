/** #333 phase10: pure, credential-free contract. Candidates never authorize a write. */
import { z } from "npm:zod@3";
import { validCivilDate, validMoney } from "./data-entry-core.ts";

export const ANALYSIS_FIELDS = ["supplier_name", "supplier_nif", "invoice_number", "invoice_date", "currency", "total_amount", "iva_amount", "customer_nif"] as const;
export type AnalysisField = typeof ANALYSIS_FIELDS[number];
export const ANALYSIS_LIMITS = { documentBytes: 5 * 1024 * 1024, messageBytes: 2000, historyTurns: 8, historyBytes: 12000, outputTokens: 6000, answerChars: 4000, quoteChars: 500, warnings: 12 } as const;

/** Small strict wire schema: constraints are checked locally, not sent to the model. */
export const analysisWireSchema = z.object({
  answer: z.string(),
  fields: z.array(z.object({ field: z.string(), value: z.string().nullable(), quote: z.string().nullable(), page: z.number().nullable(), confidence: z.string(), uncertainty: z.string().nullable() }).strict()),
  warnings: z.array(z.string()),
}).strict();
export type AnalysisWire = z.infer<typeof analysisWireSchema>;
export type AnalysisCandidate = { field: AnalysisField; value: string | null; quote: string | null; page: number | null; confidence: "high" | "medium" | "low"; uncertainty: string | null; origin: "document" | "suggestion"; usable: boolean };
export type AnalysisReport = { document_id: string; document_sha256: string; company_id: string; answer: string; candidates: AnalysisCandidate[]; warnings: string[]; erp: { company_tax: string | null }; };
export type AnalysisTurn = { role: "user" | "assistant"; text: string };

export class AnalysisError extends Error { constructor(message: string, readonly status = 422) { super(message); } }
const bytes = (s: string) => new TextEncoder().encode(s).length;
export function validateAnalysisInput(message: string, history: AnalysisTurn[]) {
  if (!message.trim() || bytes(message) > ANALYSIS_LIMITS.messageBytes || history.length > ANALYSIS_LIMITS.historyTurns || history.some((t) => !["user", "assistant"].includes(t.role) || typeof t.text !== "string") || bytes(JSON.stringify(history)) > ANALYSIS_LIMITS.historyBytes)
    throw new AnalysisError("Conversa demasiado longa. Reduz a mensagem ou reabre o lote para continuar.", 413);
}

export function validateAnalysisReport(raw: unknown, context: { document_id: string; document_sha256: string; company_id: string; company_tax: string | null }): AnalysisReport {
  const parsed = analysisWireSchema.safeParse(raw);
  if (!parsed.success) throw new AnalysisError("A análise não devolveu dados válidos. Revê o documento manualmente.");
  const v = parsed.data;
  if (!v.answer.trim() || v.answer.length > ANALYSIS_LIMITS.answerChars || v.fields.length > ANALYSIS_FIELDS.length || v.warnings.length > ANALYSIS_LIMITS.warnings || v.warnings.some((s) => s.length > 500)) throw new AnalysisError("A resposta excedeu os limites da análise.");
  const seen = new Set<string>();
  const candidates = v.fields.map((f): AnalysisCandidate => {
    if (!ANALYSIS_FIELDS.some((key) => key === f.field) || seen.has(f.field) || !["high", "medium", "low"].includes(f.confidence) || (f.page !== null && (!Number.isInteger(f.page) || f.page < 1 || f.page > 10000)) || (f.quote?.length ?? 0) > ANALYSIS_LIMITS.quoteChars || (f.value?.length ?? 0) > 200 || (f.uncertainty?.length ?? 0) > 500) throw new AnalysisError("A análise contém campos ou referências inválidos.");
    seen.add(f.field);
    const field = f.field as AnalysisField;
    const value = f.value?.trim() || null;
    const quote = f.quote?.trim() || null;
    let usable = value !== null && quote !== null && f.confidence !== "low" && !f.uncertainty;
    if (field === "invoice_date" && value !== null && !validCivilDate(value)) usable = false;
    if (["total_amount", "iva_amount"].includes(field) && value !== null && (!/^\d+(\.\d{1,2})?$/.test(value) || !validMoney(Number(value)))) usable = false;
    if (field === "currency" && value !== "EUR") usable = false;
    return { field, value, quote, page: f.page, confidence: f.confidence as AnalysisCandidate["confidence"], uncertainty: f.uncertainty, origin: quote ? "document" : "suggestion", usable };
  });
  const total = candidates.find((c) => c.field === "total_amount");
  const iva = candidates.find((c) => c.field === "iva_amount");
  const currency = candidates.find((c) => c.field === "currency");
  const warnings = [...v.warnings];
  if (!currency?.usable) {
    warnings.push("Moeda ausente, incerta ou diferente de EUR: confirma manualmente; os montantes não podem ser transferidos.");
    for (const c of candidates) if (["total_amount", "iva_amount"].includes(c.field)) c.usable = false;
  }
  if (total?.value && iva?.value && Number(iva.value) > Number(total.value)) {
    total.usable = false; iva.usable = false;
    warnings.push("IVA superior ao total: revisão obrigatória, sem correção automática.");
  }
  return { document_id: context.document_id, document_sha256: context.document_sha256, company_id: context.company_id, answer: v.answer, candidates, warnings, erp: { company_tax: context.company_tax } };
}