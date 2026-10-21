/** #335: pure EUR preview. Never mutates documents, payments or budgets. */
export type OffsetDocumentType = "income" | "expense";
export interface OffsetPlanItem {
  id: string;
  supplierId: string;
  type: OffsetDocumentType;
  grossCents: number;
  paidCents: number;
  currency: string;
  cashOrder: number;
  hasInstallments?: boolean;
  hasCredit?: boolean;
  hasFx?: boolean;
}
export interface OffsetAllocation extends OffsetPlanItem {
  openCents: number;
  cashCents: number;
  compensationCents: number;
}
export type OffsetPreview =
  | { ok: true; items: OffsetAllocation[]; movementCents: number }
  | { ok: false; code: string; message: string; differenceCents?: number };
const money = (cents: number) => (cents / 100).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integer = (n: number) => Number.isSafeInteger(n);
export function previewTransactionOffset(items: readonly OffsetPlanItem[], movementCents: number): OffsetPreview {
  if (!integer(movementCents) || items.length < 2) return { ok: false, code: "invalid_items", message: "Selecione receitas e despesas em cêntimos inteiros." };
  const supplier = items[0]?.supplierId;
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id || ids.has(item.id) || !supplier || item.supplierId !== supplier || !["income", "expense"].includes(item.type) || !integer(item.grossCents) || !integer(item.paidCents) || !integer(item.cashOrder) || item.grossCents <= item.paidCents || item.paidCents < 0) {
      return { ok: false, code: "invalid_items", message: "Documentos inválidos, repetidos ou de entidades diferentes." };
    }
    ids.add(item.id);
    if (item.currency !== "EUR" || item.hasInstallments || item.hasCredit || item.hasFx) return { ok: false, code: "unsupported_debt", message: "Nesta fase só são aceites dívidas simples em EUR, sem parcelas, crédito ou câmbio." };
  }
  if (!items.some(i => i.type === "income") || !items.some(i => i.type === "expense")) return { ok: false, code: "invalid_items", message: "Selecione receitas e despesas." };
  const signed = items.reduce((sum, i) => sum + (i.type === "income" ? 1 : -1) * (i.grossCents - i.paidCents), 0);
  if (!integer(signed)) return { ok: false, code: "invalid_amount", message: "Valor fora do limite de cêntimos inteiros." };
  const direction = movementCents < 0 ? -1 : 1;
  const differenceCents = (signed - movementCents) * direction;
  if (differenceCents !== 0) return { ok: false, code: "unbalanced", differenceCents, message: `${differenceCents < 0 ? "Faltam" : "Excedem"} ${money(Math.abs(differenceCents))} €` };
  let remaining = Math.abs(movementCents);
  const cashType = movementCents < 0 ? "expense" : "income";
  const ordered = [...items].sort((a, b) => a.cashOrder - b.cashOrder || a.id.localeCompare(b.id));
  const allocations = ordered.map(item => {
    const openCents = item.grossCents - item.paidCents;
    const cashCents = item.type === cashType ? Math.min(openCents, remaining) : 0;
    remaining -= cashCents;
    return { ...item, openCents, cashCents, compensationCents: openCents - cashCents };
  });
  return { ok: true, items: allocations, movementCents };
}
/** Complete canonical associations, not the legacy anchor alone. */
export function offsetForecastOffer(input: { approved: boolean; active: boolean; linkedTransactionSupplierIds: readonly (string | null)[] }, supplierId: string): "create" | "existing" | "unavailable" {
  if (!input.approved || !input.active || !supplierId) return "unavailable";
  if (input.linkedTransactionSupplierIds.length === 0) return "create";
  return input.linkedTransactionSupplierIds.includes(supplierId) ? "existing" : "unavailable";
}
