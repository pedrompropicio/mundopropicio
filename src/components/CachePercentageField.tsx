import { useEffect, useState } from "react";
import { Percent } from "lucide-react";
import { canEditCachePercentage, parseCachePercentage } from "@/lib/cache-percentage";

interface Props {
  value: number;
  canEdit: boolean;
  isFinalized: boolean;
  className?: string;
  onSave: (value: number) => void;
  onInvalid: (message: string) => void;
}

/** Percentagem do artista (cachê variável). Grava ao sair do campo ou com Enter. */
export default function CachePercentageField({ value, canEdit, isFinalized, className, onSave, onInvalid }: Props) {
  const [input, setInput] = useState(String(value ?? 0));
  useEffect(() => setInput(String(value ?? 0)), [value]);
  const editable = canEditCachePercentage(canEdit, isFinalized);

  const commit = () => {
    const parsed = parseCachePercentage(input);
    if (parsed.ok === false) {
      onInvalid(parsed.error);
      setInput(String(value ?? 0));
      return;
    }
    if (Math.abs(parsed.value - Number(value || 0)) < 1e-9) return;
    onSave(parsed.value);
  };

  return (
    <div className="space-y-1">
      <label htmlFor="cache-artist-percentage" className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
        <Percent className="h-3 w-3" /> Percentagem do artista (%)
      </label>
      <div className="flex items-center gap-2">
        <input
          id="cache-artist-percentage"
          type="number"
          step="0.1"
          min="0"
          max="100"
          value={input}
          disabled={!editable}
          onChange={(e) => setInput(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={`${className ?? ""} text-xs max-w-[80px] disabled:opacity-60`}
        />
        <span className="text-[10px] text-muted-foreground">%</span>
        {isFinalized && <span className="text-[10px] text-muted-foreground">Finalizada — não editável</span>}
      </div>
    </div>
  );
}
