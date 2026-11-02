import { useState } from "react";
import { formatMoney, type CompanyLocale } from "@/lib/company-locale";
import { Input } from "@/components/ui/input";

interface MoneyInputProps {
  value: number;
  onChange: (v: number) => void;
  currency?: string;
  companyLocale?: CompanyLocale;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Quando true, formata como percentagem (suffix " %") em vez de moeda */
  percent?: boolean;
}

/** PT keeps its existing parsing; BR also accepts pasted currency and grouped values. */
export function parseMoneyInput(raw: string, locale: "pt-PT" | "pt-BR" = "pt-PT"): number {
  let cleaned = raw.replace(/[^\d,.\-]/g, "");
  cleaned = locale === "pt-BR" && cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Input numérico com formatação pt-PT (currency ou percent).
 * - Em foco: edição livre (aceita "," e ".")
 * - Em blur: formata e propaga o número
 */
export function MoneyInput({
  value,
  onChange,
  currency = "EUR",
  companyLocale,
  disabled,
  className,
  placeholder,
  percent = false,
}: MoneyInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const formatDisplay = (n: number) => {
    if (!Number.isFinite(n)) return "";
    if (percent) {
      return new Intl.NumberFormat("pt-PT", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(n) + " %";
    }
    if (companyLocale) return formatMoney(n, companyLocale);
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  };

  const display = focused ? draft : formatDisplay(Number(value) || 0);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      onFocus={() => {
        setFocused(true);
        setDraft(value ? String(value).replace(".", ",") : "");
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const parsed = parseMoneyInput(draft, companyLocale?.locale);
        if (parsed !== value) onChange(parsed);
      }}
    />
  );
}
