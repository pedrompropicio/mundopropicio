import { useEffect } from "react";
import { CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { creditRemaining, type SupplierCredit } from "@/lib/supplier-credits";
import { useAvailableSupplierCredits } from "@/hooks/useAvailableSupplierCredits";

export type CreditSelection = { creditId: string; amount: string } | null;

type Props = {
  supplierId?: string | null;
  /** Valor máximo abatível (normalmente o valor a pagar). */
  maxAmount: number;
  value: CreditSelection;
  onChange: (v: CreditSelection) => void;
  disabled?: boolean;
};

/**
 * Banner de sugestão de abate de crédito de fornecedor.
 * NUNCA abate automaticamente — a financeira tem de confirmar marcando a opção.
 */
export function SupplierCreditBanner({ supplierId, maxAmount, value, onChange, disabled }: Props) {
  const { data: credits = [] } = useAvailableSupplierCredits(supplierId);

  const totalAvailable = credits.reduce((s, c) => s + creditRemaining(c), 0);
  const selected: SupplierCredit | undefined = credits.find((c) => c.id === value?.creditId);

  // Se o crédito escolhido desaparecer (esgotou/expirou), limpa a selecção.
  useEffect(() => {
    if (value && !selected) onChange(null);
  }, [value, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!supplierId || credits.length === 0) return null;

  const defaultAmount = (c: SupplierCredit) =>
    Math.min(creditRemaining(c), maxAmount > 0 ? maxAmount : creditRemaining(c)).toFixed(2);

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <CreditCard className="h-3.5 w-3.5" />
        💳 Este fornecedor tem {formatCurrency(totalAvailable)} de crédito disponível
      </p>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={(e) => {
            if (!e.target.checked) return onChange(null);
            const c = credits[0];
            onChange({ creditId: c.id, amount: defaultAmount(c) });
          }}
        />
        <span>Abater crédito neste pagamento</span>
      </label>

      {value && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Crédito</label>
            <select
              value={value.creditId}
              disabled={disabled}
              onChange={(e) => {
                const c = credits.find((x) => x.id === e.target.value);
                if (c) onChange({ creditId: c.id, amount: defaultAmount(c) });
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              {credits.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.reason}
                  {c.document_ref ? ` (${c.document_ref})` : ""} — {formatCurrency(creditRemaining(c))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">
              Valor a abater (€) {selected ? `· máx ${formatCurrency(Math.min(creditRemaining(selected), maxAmount || creditRemaining(selected)))}` : ""}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              disabled={disabled}
              value={value.amount}
              onChange={(e) => onChange({ ...value, amount: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-right font-mono"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Valida a selecção e devolve o valor numérico a abater (ou null). */
export function resolveCreditSelection(
  value: CreditSelection,
  credits: SupplierCredit[],
  maxAmount: number,
): { creditId: string; amount: number } | null {
  if (!value) return null;
  const credit = credits.find((c) => c.id === value.creditId);
  if (!credit) throw new Error("Crédito inválido ou já indisponível");
  const amount = Math.round((parseFloat(value.amount) || 0) * 100) / 100;
  if (amount <= 0) throw new Error("Valor do crédito a abater tem de ser positivo");
  if (amount > creditRemaining(credit) + 0.01)
    throw new Error(`O crédito só tem ${creditRemaining(credit).toFixed(2)} € disponível`);
  if (maxAmount > 0 && amount > maxAmount + 0.01)
    throw new Error("O crédito a abater não pode exceder o valor a pagar");
  return { creditId: credit.id, amount };
}
