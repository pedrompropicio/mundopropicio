import { AlertTriangle, Info } from "lucide-react";
import { NO_IBAN_TOOLTIP } from "@/lib/payment-iban";

/**
 * Badge de dados bancários. `variant="destructive"` (default) = inelegível;
 * `variant="neutral"` = informativo (ex.: transferência interna sem IBAN, que
 * é elegível mas liquida-se no homebanking).
 */
export default function NoIbanBadge({
  className = "",
  label = "Sem IBAN",
  tooltip = NO_IBAN_TOOLTIP,
  variant = "destructive",
}: {
  className?: string;
  label?: string;
  tooltip?: string;
  variant?: "destructive" | "neutral";
}) {
  const neutral = variant === "neutral";
  const Icon = neutral ? Info : AlertTriangle;
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        neutral ? "bg-muted text-muted-foreground" : "bg-destructive/15 text-destructive"
      } ${className}`}
    >
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}
