// Datas de negócio (vendas, períodos de campanha) são SEMPRE Europe/Lisbon,
// independentemente do fuso do browser ou do servidor.
// Ver .lovable/memory/constraints/timezone-portugal.md

/** Data de hoje em Europe/Lisbon no formato yyyy-MM-dd. */
export function lisbonTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
}

/**
 * Data de hoje em Europe/Lisbon como Date local à meia-noite —
 * seguro para `format(d, "yyyy-MM-dd")` do date-fns.
 */
export function lisbonToday(): Date {
  const [y, m, d] = lisbonTodayISO().split("-").map(Number);
  return new Date(y, m - 1, d);
}
