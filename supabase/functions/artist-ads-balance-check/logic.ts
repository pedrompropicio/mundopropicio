// Lógica pura do D-ERP267 (sem I/O) — testável com deno test.

/** Converte "1.234,56" / "1,234.56" / "4619,56" / "4619.56" em número. */
export function parseAmount(s: string): number | null {
  let t = s.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(t)) return null;
  const lastDot = t.lastIndexOf("."), lastComma = t.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    t = t.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    const parts = t.split(",");
    t = parts.length === 2 && parts[1].length <= 2 ? parts.join(".") : parts.join("");
  } else if (lastDot >= 0) {
    const parts = t.split(".");
    t = parts.length === 2 && parts[1].length <= 2 ? t : parts.join("");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Saldo disponível no display_string do funding_source_details da Meta (pré-pago). */
export function parseMetaDisplayBalance(display: string | null | undefined): number | null {
  if (!display) return null;
  const m = String(display).match(
    /(saldo\s+dispon[ií]vel|available\s+balance|available\s+funds|saldo)\s*[:(]?\s*(-?\s*(?:R\$|€|\$|US\$|EUR|BRL)?\s*-?[\d.,\s]*\d(?:\s*(?:€|EUR|BRL))?)/i,
  );
  if (!m) return null;
  return parseAmount(m[2]);
}

export type BalanceAlert = { kind: "saldo_critico" | "saldo_baixo" | "saldo_ilegivel"; severity: "alta" | "media"; message: string } | null;

export function balanceAlert(o: {
  source: string; balance: number | null; daysLeft: number | null; label: string; ccy: string; ilegivelMsg?: string;
}): BalanceAlert {
  if (o.source === "postpaid_na") return null;
  if (o.balance === null) {
    return { kind: "saldo_ilegivel", severity: "media", message: `${o.label}: ${o.ilegivelMsg ?? "saldo ilegível"}` };
  }
  const v = `${o.balance.toFixed(2)} ${o.ccy}`;
  const d = o.daysLeft === null ? "sem gasto recente" : `${o.daysLeft.toFixed(1)} dia(s)`;
  if (o.balance <= 0 || (o.daysLeft !== null && o.daysLeft < 1)) {
    return { kind: "saldo_critico", severity: "alta", message: `${o.label}: saldo crítico ${v} (${d} ao ritmo dos últimos 3 dias).` };
  }
  if (o.daysLeft !== null && o.daysLeft < 2) {
    return { kind: "saldo_baixo", severity: "media", message: `${o.label}: saldo baixo ${v} (${d} ao ritmo dos últimos 3 dias).` };
  }
  return null;
}

export type CauseInput = {
  balanceCritical: boolean;          // saldo ≤ 0 ou última leitura crítica
  accountProblem: string | null;     // account_status / disable_reason
  adsRejectedOrReview: string | null;
  budgetExhausted: string | null;
};

export function pickCause(c: CauseInput): string {
  if (c.balanceCritical) return "saldo esgotado ou crítico";
  if (c.accountProblem) return `conta com problema (${c.accountProblem})`;
  if (c.adsRejectedOrReview) return `anúncios rejeitados/em revisão (${c.adsRejectedOrReview})`;
  if (c.budgetExhausted) return `orçamento esgotado (${c.budgetExhausted})`;
  return "sem causa identificada";
}

/** Fração do dia decorrida num fuso (0..1). */
export function dayFraction(now: Date, tz: string): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0);
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return (h * 60 + m) / 1440;
}

export function deliveryStopped(o: { spendToday: number; avg3d: number; frac: number }) {
  const expected = o.avg3d * o.frac;
  return { expected, stopped: o.avg3d > 0 && expected > 0 && o.spendToday < 0.1 * expected };
}
