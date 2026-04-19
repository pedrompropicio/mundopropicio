import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  CurrencyCode,
  SUPPORTED_CURRENCIES,
  convertToEur,
  fetchSuggestedFxRate,
  formatInCurrency,
} from "@/lib/currency";

interface Props {
  /** Currency selected. */
  currency: CurrencyCode;
  onCurrencyChange: (c: CurrencyCode) => void;
  /** Amount in the original currency (string for input control). */
  originalAmount: string;
  onOriginalAmountChange: (v: string) => void;
  /** Exchange rate: 1 unit of `currency` = fxRate EUR. */
  fxRate: string;
  onFxRateChange: (v: string) => void;
  /** Source label persisted with the row. */
  onFxRateSourceChange?: (s: "manual" | "suggested") => void;
  /**
   * Called whenever the EUR amount changes (auto-derived from original × rate).
   * Use this to sync the canonical EUR `amount` field stored in DB.
   */
  onEurAmountChange: (eur: number) => void;
  label?: string;
  disabled?: boolean;
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60";

export function CurrencyAmountInput({
  currency,
  onCurrencyChange,
  originalAmount,
  onOriginalAmountChange,
  fxRate,
  onFxRateChange,
  onFxRateSourceChange,
  onEurAmountChange,
  label = "Valor s/ IVA",
  disabled,
}: Props) {
  const [loadingRate, setLoadingRate] = useState(false);

  const isEur = currency === "EUR";
  const numAmount = parseFloat(originalAmount) || 0;
  const numRate = isEur ? 1 : parseFloat(fxRate) || 0;
  const eur = isEur ? numAmount : convertToEur(numAmount, numRate);

  // Sync canonical EUR amount up to parent
  useEffect(() => {
    onEurAmountChange(eur);
  }, [eur]); // eslint-disable-line react-hooks/exhaustive-deps

  // When switching to EUR, clear fx fields
  useEffect(() => {
    if (isEur) {
      if (fxRate !== "") onFxRateChange("");
    }
  }, [isEur]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFetchRate() {
    if (isEur) return;
    setLoadingRate(true);
    const r = await fetchSuggestedFxRate(currency, supabase);
    setLoadingRate(false);
    if (r) {
      onFxRateChange(r.toFixed(6));
      onFxRateSourceChange?.("suggested");
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {label} {!isEur && `(${currency})`}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={originalAmount}
            onChange={(e) => onOriginalAmountChange(e.target.value)}
            className={inputClass}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Moeda</label>
          <select
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value as CurrencyCode)}
            className={`${inputClass} pr-2`}
            disabled={disabled}
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!isEur && (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Câmbio (1 {currency} = X €)
              </label>
              <input
                type="number"
                step="0.000001"
                min="0"
                value={fxRate}
                onChange={(e) => {
                  onFxRateChange(e.target.value);
                  onFxRateSourceChange?.("manual");
                }}
                className={inputClass}
                placeholder="Ex.: 0.18"
                disabled={disabled}
              />
            </div>
            <button
              type="button"
              onClick={handleFetchRate}
              disabled={disabled || loadingRate}
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary disabled:opacity-50 flex items-center gap-1.5"
              title="Buscar câmbio do dia"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingRate ? "animate-spin" : ""}`} />
              Sugerir
            </button>
          </div>

          {numAmount > 0 && numRate > 0 && (
            <p className="text-xs text-muted-foreground">
              {formatInCurrency(numAmount, currency)} × {numRate.toFixed(6)} ={" "}
              <span className="font-semibold text-foreground">{formatInCurrency(eur, "EUR")}</span>
            </p>
          )}
          {numAmount > 0 && numRate <= 0 && (
            <p className="text-xs text-warning">Define o câmbio para calcular o valor em EUR.</p>
          )}
        </div>
      )}
    </div>
  );
}
