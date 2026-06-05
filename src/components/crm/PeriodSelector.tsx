import { Button } from "@/components/ui/button";
import type { PeriodMode } from "@/lib/crm/period";

interface Props {
  mode: PeriodMode;
  onChange: (mode: "yesterday" | "7d" | "30d") => void;
}

/**
 * Seletor de período compacto (Ontem / 7d / 30d).
 * Versão mínima usada no detalhe da campanha — sem custom range.
 * Para custom range ver o seletor inline em src/pages/crm/Campaigns.tsx.
 */
export function PeriodSelector({ mode, onChange }: Props) {
  const opts = [
    { k: "yesterday", l: "Ontem" },
    { k: "7d", l: "7 dias" },
    { k: "30d", l: "30 dias" },
  ] as const;
  return (
    <div className="flex items-center gap-1.5">
      {opts.map((p) => (
        <Button
          key={p.k}
          size="sm"
          variant={mode === p.k ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => onChange(p.k)}
        >
          {p.l}
        </Button>
      ))}
    </div>
  );
}
