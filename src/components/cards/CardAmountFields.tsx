import { useEffect, useRef, useState } from "react";
import IvaRateSelect from "@/components/IvaRateSelect";
import { cardBaseFromTotal, cardTotalFromBase } from "@/lib/card-session-helpers";

interface Props {
  /** Total c/IVA (string controlada pelo modal — é o que se grava como paid_amount). */
  total: string;
  onTotalChange: (v: string) => void;
  ivaRate: number;
  onIvaRateChange: (r: number) => void;
  eventId?: string | null;
  required?: boolean;
  labelClassName?: string;
  inputClassName?: string;
}

const DEFAULT_LABEL = "mb-1 block text-xs font-medium text-muted-foreground";
const DEFAULT_INPUT =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50";

/**
 * Campos de valor do módulo Cartões, na ordem padrão do sistema:
 * Valor s/IVA → Taxa IVA → Total c/IVA. Os dois campos de valor são
 * editáveis com ligação bidirecional; o OCR preenche pelo Total do talão.
 */
export default function CardAmountFields({
  total,
  onTotalChange,
  ivaRate,
  onIvaRateChange,
  eventId,
  required,
  labelClassName = DEFAULT_LABEL,
  inputClassName = DEFAULT_INPUT,
}: Props) {
  const [base, setBase] = useState<string>(total === "" ? "" : String(cardBaseFromTotal(total, ivaRate)));
  const lastTotal = useRef(total);

  // Total mudou por fora (scan, edição do próprio campo, reset) → recalcula base.
  useEffect(() => {
    if (total !== lastTotal.current) {
      lastTotal.current = total;
      setBase(total === "" ? "" : String(cardBaseFromTotal(total, ivaRate)));
    }
  }, [total, ivaRate]);

  const handleBase = (v: string) => {
    setBase(v);
    const next = v === "" ? "" : String(cardTotalFromBase(v, ivaRate));
    lastTotal.current = next;
    onTotalChange(next);
  };

  const handleRate = (r: number) => {
    onIvaRateChange(r);
    if (base !== "") {
      const next = String(cardTotalFromBase(base, r));
      lastTotal.current = next;
      onTotalChange(next);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div>
        <label className={labelClassName}>Valor s/IVA (€)</label>
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          value={base}
          onChange={(e) => handleBase(e.target.value)}
          className={inputClassName}
        />
      </div>
      <div>
        <label className={labelClassName}>Taxa IVA</label>
        <IvaRateSelect eventId={eventId || null} value={Number(ivaRate) || 0} onChange={handleRate} />
      </div>
      <div>
        <label className={labelClassName}>Total c/IVA (€){required ? " *" : ""}</label>
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          min="0.01"
          value={total}
          onChange={(e) => onTotalChange(e.target.value)}
          required={required}
          className={inputClassName}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">Total igual ao talão — é o que sai do cartão.</p>
      </div>
    </div>
  );
}
