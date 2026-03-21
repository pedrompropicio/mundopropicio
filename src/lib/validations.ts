import { z } from "zod";

// ── Transaction validation ──
export const transactionSchema = z.object({
  description: z.string().trim().min(1, "Descrição é obrigatória").max(500, "Máximo 500 caracteres"),
  type: z.enum(["income", "expense"], { required_error: "Tipo é obrigatório" }),
  amount: z.string().min(1, "Montante é obrigatório").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    "Montante deve ser positivo"
  ),
  iva_rate: z.number().min(0).max(100),
  event_id: z.string().optional(),
  category_id: z.string().optional(),
  supplier_id: z.string().optional(),
  account_id: z.string().optional(),
  date: z.string().min(1, "Data é obrigatória").regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido"),
  due_date: z.string().optional(),
  specification: z.string().max(500, "Máximo 500 caracteres").optional(),
});

// ── Supplier validation ──
export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(200, "Máximo 200 caracteres"),
  trade_name: z.string().max(200).nullable().optional(),
  nif: z.string().max(20).nullable().optional(),
  contact_name: z.string().max(200).nullable().optional(),
  email: z.string().email("Email inválido").max(255).nullable().optional().or(z.literal("")),
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  iban: z.string().max(34, "IBAN inválido").nullable().optional(),
  swift_bic: z.string().max(11, "SWIFT/BIC inválido").nullable().optional(),
  payment_terms: z.string().max(100).nullable().optional(),
  category: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

// ── Event validation ──
export const eventSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(300, "Máximo 300 caracteres"),
  date: z.string().min(1, "Data é obrigatória"),
  budget: z.number().min(0, "Orçamento não pode ser negativo").optional(),
  status: z.enum(["planning", "confirmed", "active", "completed", "cancelled"]).optional(),
});

// ── Quotation validation ──
export const quotationSchema = z.object({
  description: z.string().trim().min(1, "Descrição é obrigatória").max(500),
  amount: z.number().positive("Montante deve ser positivo"),
  event_id: z.string().uuid("Evento inválido"),
  supplier_id: z.string().uuid("Fornecedor inválido"),
  iva_rate: z.number().min(0).max(100),
});

// Helper to validate and return errors
export function validateForm<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (!errors[key]) {
      errors[key] = issue.message;
    }
  }
  return { success: false, errors };
}
