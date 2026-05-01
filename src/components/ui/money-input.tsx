import { useState } from "react";
import { Input } from "@/components/ui/input";

interface MoneyInputProps {
  value: number;
  onChange: (v: number) => void;
  currency?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Quando true, formata como percentagem (suffix " %") em vez de moeda */
  percent?: boolean;
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
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  };

  const parseDraft = (s: string): number => {
    const cleaned = s
      .replace(/[^\d,.\-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
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
        const parsed = parseDraft(draft);
        if (parsed !== value) onChange(parsed);
      }}
    />
  );
}
