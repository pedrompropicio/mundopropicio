import { z } from "zod";

export const FINANCIAL_POSITION_PATH = "/erp/posicao-financeira";
export const FINANCIAL_POSITION_PERMISSION = "view_financial_position";
export const POSITION_STAGES = ["em_curso", "em_fecho", "fechado", "planeamento"] as const;
const amount = z.number().finite();
const count = z.number().int().nonnegative();
const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
});
const balance = z.object({ account_id: z.string().uuid(), name: z.string(), saldo: amount.nullable() });
const counted = z.object({ total: amount, n: count });
const transient = z.object({ total: amount, itens: z.array(z.object({ reason: z.string(), n: count, aberto: amount })) });
const payable = z.object({
  total: amount, bp: amount, bp_linhas: count, linhas_contrato_cache: count,
  sublinhas: z.object({ lancado: amount, confirmado: amount, por_rever: amount, ajustado: amount, partner_paid_fora_do_total: amount }),
  sem_bp: counted, so_transacoes: counted,
});
// The RPC emits all four financial stages, even when no events qualify.
const stages = <T extends z.ZodTypeAny>(schema: T) => z.object({
  em_curso: schema, em_fecho: schema, fechado: schema, planeamento: schema,
});
const event = z.object({ event_id: z.string().uuid(), name: z.string(), first_day: civilDate.nullable(), started: z.boolean(), sub_events: count });
export const financialPositionSchema = z.object({
  meta: z.object({ company_id: z.string().uuid(), year: z.number().int().nullable(), reference_date: civilDate, timezone: z.literal("Europe/Lisbon"), version: z.string().min(1), balances_visible: z.boolean(), notes: z.string() }),
  eventos_por_estagio: z.object({ em_curso: z.array(event).optional(), em_fecho: z.array(event).optional(), fechado: z.array(event).optional(), planeamento: z.array(event).optional(), historico: z.array(event).optional(), cancelado: z.array(event).optional() }).strict().transform(({ historico: _historico, cancelado: _cancelado, ...active }) => active),
  caixa: z.array(balance.extend({ type: z.enum(["bank", "cash"]), is_hidden: z.boolean(), cutoff: civilDate.nullable() })),
  cartoes: z.array(balance),
  retido: z.object({ visivel: z.array(balance), ocultas: z.array(balance), total_visiveis: amount.nullable(), total_ocultas: amount.nullable() }),
  a_pagar: z.object({ por_estagio: stages(payable), total: amount, transitorias: transient }),
  a_receber: z.object({ por_estagio: stages(counted), total: amount, transitorias: transient }),
  acerto_informativo: z.object({ fora_do_total: z.literal(true), contas: z.array(balance), a_recuperar_caucao: counted }),
  operacoes_terceiros_informativo: z.array(z.object({ event_id: z.string().uuid(), kind: z.string().nullable(), name: z.string().nullable(), gross_amount: amount.nullable(), operator_result: amount.nullable() })),
  alertas: z.object({ pago_acima_do_bp: z.object({ n: count, excesso: amount }), bp_sem_transacao: counted.extend({ por_rever_n: count }) }),
  posicao: z.object({ caixa: amount.nullable(), cartoes: amount.nullable(), caixa_e_cartoes: amount, retido_visiveis: amount.nullable(), a_pagar: amount, a_receber: amount, nota: z.string() }),
});
export type FinancialPosition = z.infer<typeof financialPositionSchema>;
export function parseFinancialPosition(raw: unknown): FinancialPosition {
  const result = financialPositionSchema.safeParse(raw);
  if (!result.success) throw new Error("financial_position_invalid_response");
  return result.data;
}
export function financialPositionError(error: unknown): string {
  const message = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (message.includes("financial_position_permission_denied")) return "Sem permissão para ver a posição financeira";
  if (message.includes("company_forbidden")) return "Empresa não autorizada";
  if (message.includes("not_authenticated")) return "Sessão expirada";
  if (message.includes("financial_position_invalid_response")) return "Dados da posição financeira inválidos";
  return "Não foi possível carregar a posição financeira";
}
export function formatPositionAmount(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions).format(value);
}
export function formatPositionDate(value: string | null): string {
  if (value === null) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
export function currentLisbonYear(): number {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Lisbon", year: "numeric" }).format(new Date()));
}
/** Year options for the single selector: next year down to five years back. */
export function positionYearOptions(current: number): number[] {
  return Array.from({ length: 7 }, (_, i) => current + 1 - i);
}
