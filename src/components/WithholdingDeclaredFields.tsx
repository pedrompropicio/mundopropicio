import { useEffect, useRef } from "react";

/**
 * Campos de retenção IRS declarada na fatura (no momento do lançamento).
 *
 * Permite introduzir taxa OU valor — recalcula o outro automaticamente a partir
 * da base. Estes valores são apenas declarativos: pré-preenchem o modal de
 * pagamento mas continuam editáveis na liquidação real.
 *
 * Usado em TransactionFormModal (criação) e TransactionEditModal (edição).
 */

interface Props {
  /** Base de cálculo da retenção = TOTAL c/ IVA (base + IVA). */
  baseAmount: number;
  rate: string;          // %
  amount: string;        // €
  onRateChange: (v: string) => void;
  onAmountChange: (v: string) => void;
  disabled?: boolean;
  /** Predefinido — para esconder em receitas etc. */
  hidden?: boolean;
}

export function WithholdingDeclaredFields({
  baseAmount,
  rate,
  amount,
  onRateChange,
  onAmountChange,
  disabled = false,
  hidden = false,
}: Props) {
  // Marca qual campo o utilizador editou pela última vez para evitar
  // ciclos de recálculo.
  const lastEdited = useRef<"rate" | "amount" | null>(null);

  // Quando a base muda e o utilizador definiu uma TAXA, recalcula o valor.
  useEffect(() => {
    const r = parseFloat(rate);
    if (!isNaN(r) && r > 0 && baseAmount > 0 && lastEdited.current !== "amount") {
      const newAmt = +(baseAmount * r / 100).toFixed(2);
      const cur = parseFloat(amount);
      if (isNaN(cur) || Math.abs(cur - newAmt) > 0.005) {
        onAmountChange(String(newAmt));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseAmount, rate]);

  if (hidden) return null;

  const handleRate = (v: string) => {
    lastEdited.current = "rate";
    onRateChange(v);
    const r = parseFloat(v);
    if (!isNaN(r) && r > 0 && baseAmount > 0) {
      onAmountChange(String(+(baseAmount * r / 100).toFixed(2)));
    } else if (v === "") {
      onAmountChange("");
    }
  };

  const handleAmount = (v: string) => {
    lastEdited.current = "amount";
    onAmountChange(v);
    const a = parseFloat(v);
    if (!isNaN(a) && a > 0 && baseAmount > 0) {
      onRateChange(String(+(a / baseAmount * 100).toFixed(2)));
    } else if (v === "") {
      onRateChange("");
    }
  };

  const declaredAmount = parseFloat(amount) || 0;
  const liquidoFornecedor = baseAmount > 0 && declaredAmount > 0
    ? Math.max(0, baseAmount - declaredAmount)
    : null;

  const COMMON_RATES = [11.5, 16.5, 20, 23, 25];

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-warning">
          Retenção IRS declarada na fatura
        </p>
        <span className="text-[10px] text-muted-foreground">opcional</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
            Taxa (%)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={rate}
            placeholder="0"
            onChange={(e) => handleRate(e.target.value)}
            disabled={disabled}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-60"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
            Valor (€)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            placeholder="0,00"
            onChange={(e) => handleAmount(e.target.value)}
            disabled={disabled}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-60"
          />
        </div>
      </div>
      {/* Atalhos para taxas comuns IRS PT */}
      <div className="flex flex-wrap gap-1">
        <span className="text-[10px] text-muted-foreground self-center mr-1">Comuns:</span>
        {COMMON_RATES.map((r) => {
          const active = parseFloat(rate) === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => handleRate(String(r))}
              disabled={disabled}
              className={
                "rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors " +
                (active
                  ? "bg-warning text-warning-foreground"
                  : "border border-border bg-background text-muted-foreground hover:bg-secondary")
              }
            >
              {r.toString().replace(".", ",")}%
            </button>
          );
        })}
        {(parseFloat(rate) > 0 || parseFloat(amount) > 0) && (
          <button
            type="button"
            onClick={() => { lastEdited.current = null; onRateChange(""); onAmountChange(""); }}
            disabled={disabled}
            className="ml-auto rounded-md px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-destructive"
          >
            Limpar
          </button>
        )}
      </div>
      {liquidoFornecedor != null && (
        <p className="text-[10px] text-muted-foreground">
          Calculado sobre o total c/ IVA: <span className="font-mono text-foreground">{baseAmount.toFixed(2)}€</span>
          {" · "}Líquido a pagar ao fornecedor: <span className="font-semibold font-mono text-foreground">{liquidoFornecedor.toFixed(2)}€</span>
          {" · "}Pré-preenche a liquidação (poderá ser ajustado).
        </p>
      )}
    </div>
  );
}
