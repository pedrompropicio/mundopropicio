import { AlertTriangle } from "lucide-react";
import { NO_IBAN_TOOLTIP } from "@/lib/payment-iban";

/** Badge vermelho para transações sem dados bancários resolvíveis. */
export default function NoIbanBadge({
  className = "",
  label = "Sem IBAN",
  tooltip = NO_IBAN_TOOLTIP,
}: {
  className?: string;
  label?: string;
  tooltip?: string;
}) {
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive ${className}`}
    >
      <AlertTriangle className="h-3 w-3" /> {label}
    </span>
  );
}
