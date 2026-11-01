import { AlertTriangle } from "lucide-react";
import { validateIban, ibanWarningMessage } from "@/lib/iban";
import { classifyBankAccountValue, NON_IBAN_WARNING } from "@/lib/bank-account-value";

export function IbanWarning({
  value,
  className = "",
  allowNonIban = false,
}: {
  value: string | null | undefined;
  className?: string;
  /** Fornecedores: valor sem forma de IBAN mostra aviso suave em vez de «IBAN inválido». */
  allowNonIban?: boolean;
}) {
  const v = (value ?? "").trim();
  if (!v) return null;
  const msg =
    allowNonIban && classifyBankAccountValue(v) === "nao_iban"
      ? NON_IBAN_WARNING
      : ibanWarningMessage(validateIban(v));
  if (!msg) return null;
  return (
    <div className={`flex items-start gap-1.5 text-[11px] text-warning ${className}`}>
      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  );
}
