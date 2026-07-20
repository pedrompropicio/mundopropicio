/**
 * Helpers para os cards Receitas/Custos em EventDetail.
 * Pure functions — sem queries, sem React.
 */

export type CardMode = "auto" | "realized" | "committed" | "forecast";
export type ModeUsed = "realized" | "committed" | "forecast";
export type Phase = "planning" | "development" | "completed";
export type RevenueScenario = "today" | "breakeven" | "forecast";

export type Formalidade = "estimado" | "negociacao" | "fechado" | "pago_parcial" | "pago_total";

export interface FormalidadeBreakdown {
  estimado: number;
  negociacao: number;
  fechado: number;
  pago: number; // pago_parcial + pago_total
}

export function emptyBreakdown(): FormalidadeBreakdown {
  return { estimado: 0, negociacao: 0, fechado: 0, pago: 0 };
}

export function addToBreakdown(
  acc: FormalidadeBreakdown,
  formalidade: Formalidade | string | null | undefined,
  amount: number,
): FormalidadeBreakdown {
  const f = (formalidade ?? "estimado") as Formalidade;
  if (f === "estimado") acc.estimado += amount;
  else if (f === "negociacao") acc.negociacao += amount;
  else if (f === "fechado") acc.fechado += amount;
  else if (f === "pago_parcial" || f === "pago_total") acc.pago += amount;
  else acc.estimado += amount;
  return acc;
}

/** Detecta fase do evento. */
export function detectPhase(opts: {
  eventStatus?: string | null;
  lastDate?: string | null;
  firstDate?: string | null;
  hasTransactions: boolean;
  hasSales: boolean;
  today?: string; // YYYY-MM-DD (defaults to today local)
}): Phase {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  if (opts.eventStatus === "completed") return "completed";
  if (opts.lastDate && today > opts.lastDate) return "completed";
  if (opts.eventStatus === "planning") return "planning";
  if (!opts.hasTransactions && !opts.hasSales && opts.firstDate && today < opts.firstDate) return "planning";
  return "development";
}

export function defaultModeForPhase(phase: Phase): ModeUsed {
  if (phase === "planning") return "forecast";
  if (phase === "completed") return "realized";
  return "committed";
}

/** Classifica L1 da árvore de contas pelo `code` (1.1.* / 1.2.* / outro). */
export function classifyIncomeL1(code?: string | null): "bilheteira" | "patrocinio" | "outros" {
  const c = (code ?? "").trim();
  if (c.startsWith("1.1")) return "bilheteira";
  if (c.startsWith("1.2")) return "patrocinio";
  return "outros";
}

/** localStorage key para preferência de modo. */
export function modeStorageKey(userId: string, eventId: string, kind: "income" | "expense"): string {
  return `ef-card-mode-${userId}-${eventId}-${kind}`;
}

export function readStoredMode(userId: string, eventId: string, kind: "income" | "expense"): CardMode {
  try {
    const v = localStorage.getItem(modeStorageKey(userId, eventId, kind));
    if (v === "auto" || v === "realized" || v === "committed" || v === "forecast") return v;
  } catch {/* noop */}
  return "auto";
}

export function writeStoredMode(userId: string, eventId: string, kind: "income" | "expense", mode: CardMode) {
  try { localStorage.setItem(modeStorageKey(userId, eventId, kind), mode); } catch {/* noop */}
}

/** localStorage key para preferência de IVA no card (c/IVA vs s/IVA). */
export function vatStorageKey(userId: string, eventId: string, kind: "income" | "expense"): string {
  return `ef-card-vat-${userId}-${eventId}-${kind}`;
}

export function readStoredWithVat(userId: string, eventId: string, kind: "income" | "expense"): boolean {
  try {
    const v = localStorage.getItem(vatStorageKey(userId, eventId, kind));
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {/* noop */}
  return false; // default s/IVA (base líquida, comportamento atual)
}

export function writeStoredWithVat(userId: string, eventId: string, kind: "income" | "expense", withVat: boolean) {
  try { localStorage.setItem(vatStorageKey(userId, eventId, kind), withVat ? "1" : "0"); } catch {/* noop */}
}
