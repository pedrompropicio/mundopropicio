import { AlertTriangle } from "lucide-react";
import { NO_IBAN_TOOLTIP } from "@/lib/payment-iban";

/** Badge vermelho para transações sem dados bancários resolvíveis. */
export default function NoIbanBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title={NO_IBAN_TOOLTIP}
      className={`inline-flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive ${className}`}
    >
      <AlertTriangle className="h-3 w-3" /> Sem IBAN
    </span>
  );
}
