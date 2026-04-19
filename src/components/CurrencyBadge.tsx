import { CurrencyCode, formatInCurrency, isSupportedCurrency } from "@/lib/currency";

interface Props {
  currency?: string | null;
  originalAmount?: number | null;
  fxRate?: number | null;
  className?: string;
}

/** Small inline badge: shows "BRL" tag + tooltip with original × rate when not EUR. */
export function CurrencyBadge({ currency, originalAmount, fxRate, className }: Props) {
  if (!currency || currency === "EUR") return null;
  if (!isSupportedCurrency(currency)) return null;
  const c = currency as CurrencyCode;

  const tooltip =
    originalAmount && fxRate
      ? `${formatInCurrency(Number(originalAmount), c)} @ ${Number(fxRate).toFixed(6)}`
      : `Lançado em ${c}`;

  return (
    <span
      title={tooltip}
      className={
        "inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground " +
        (className ?? "")
      }
    >
      {c}
    </span>
  );
}
