import { z } from "zod";
import type { AnalysisReport, AnalysisTurn, AnalysisCandidate } from "@shared/data-entry-analysis";
export type { AnalysisReport, AnalysisTurn, AnalysisCandidate };
const candidate = z.object({ field: z.enum(["supplier_name", "supplier_nif", "invoice_number", "invoice_date", "currency", "total_amount", "iva_amount", "customer_nif"]), value: z.string().nullable(), quote: z.string().nullable(), page: z.number().nullable(), confidence: z.enum(["high", "medium", "low"]), uncertainty: z.string().nullable(), origin: z.enum(["document", "suggestion"]), usable: z.boolean() }).strict();
const report = z.object({ document_id: z.string(), document_sha256: z.string().regex(/^[a-f0-9]{64}$/), company_id: z.string(), answer: z.string().max(4000), candidates: z.array(candidate).max(8), warnings: z.array(z.string().max(500)).max(14), erp: z.object({ company_tax: z.string().nullable() }).strict() }).strict();
export function parseAnalysisReport(raw: unknown): AnalysisReport {
  const parsed = report.safeParse(raw);
  if (!parsed.success) throw new Error("Resposta de análise inválida. Nenhum campo foi confirmado.");
  return parsed.data as AnalysisReport;
}
export type ReviewForm = { supplier_name: string; supplier_nif: string; invoice_number: string; invoice_date: string; total: string; iva: string; customer_nif: string; payer: string; notes: string };
export function applyAnalysisCandidate(form: ReviewForm, c: AnalysisCandidate): ReviewForm {
  if (!c.usable || c.origin !== "document" || !c.quote || c.value === null || c.field === "currency") return form;
  const key = c.field === "total_amount" ? "total" : c.field === "iva_amount" ? "iva" : c.field;
  return { ...form, [key]: c.value };
}