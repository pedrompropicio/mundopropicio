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
          <select
            value={rate}
            onChange={(e) => handleRate(e.target.value)}
            disabled={disabled}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-60"
          >
            <option value="">— Sem retenção —</option>
            <option value="11.5">11,5%</option>
            <option value="16.5">16,5%</option>
            <option value="20">20%</option>
            <option value="23">23%</option>
            <option value="25">25%</option>
            <option value="custom">Outra…</option>
          </select>
          {rate === "custom" && (
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              autoFocus
              placeholder="Taxa %"
              onChange={(e) => handleRate(e.target.value)}
              disabled={disabled}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
            />
          )}
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
      {liquidoFornecedor != null && (
        <p className="text-[10px] text-muted-foreground">
          Líquido a pagar ao fornecedor: <span className="font-semibold font-mono text-foreground">{liquidoFornecedor.toFixed(2)}€</span>
          {" · "}Pré-preenche a liquidação (poderá ser ajustado).
        </p>
      )}
    </div>
  );
}
