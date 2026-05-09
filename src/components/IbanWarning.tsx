import { AlertTriangle } from "lucide-react";
import { validateIban, ibanWarningMessage } from "@/lib/iban";

export function IbanWarning({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  const v = (value ?? "").trim();
  if (!v) return null;
  const check = validateIban(v);
  const msg = ibanWarningMessage(check);
  if (!msg) return null;
  return (
    <div className={`flex items-start gap-1.5 text-[11px] text-warning ${className}`}>
      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  );
}
