import { useEventIvaCountry } from "@/hooks/useEventIvaCountry";
import { IVA_RATE_LABELS } from "@/lib/iva";

interface IvaRateSelectProps {
  /** Evento a que a linha/transação está ligada. Sem evento → taxas PT. */
  eventId?: string | null;
  value: number;
  onChange: (rate: number) => void;
  disabled?: boolean;
  className?: string;
  /** Mostra nota "Taxas de <país>" quando o evento é estrangeiro. */
  showCountryHint?: boolean;
}

/**
 * Seletor de taxa de IVA que respeita o país da cidade do evento
 * (PT 23/13/6/0 · ES 21/10/4/0). Ver .lovable/memory/features/iva-espanha.md.
 */
export default function IvaRateSelect({
  eventId,
  value,
  onChange,
  disabled,
  className,
  showCountryHint = true,
}: IvaRateSelectProps) {
  const { rates, country, isForeign } = useEventIvaCountry(eventId);
  // Se a taxa atual não pertence ao conjunto do país (ex.: transação antiga),
  // mostramo-la ainda assim para não perder o valor guardado.
  const options = rates.includes(value as any) ? rates : [...rates, value as any].sort((a, b) => b - a);

  return (
    <>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className={
          className ??
          "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
        }
      >
        {options.map((r) => (
          <option key={r} value={r}>
            {IVA_RATE_LABELS[r] ?? `${r}%`}
          </option>
        ))}
      </select>
      {showCountryHint && isForeign && (
        <p className="mt-1 text-[11px] text-amber-500">Taxas de {country} (evento fora de Portugal)</p>
      )}
    </>
  );
}
