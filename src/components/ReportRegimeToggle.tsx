import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { Regime } from "@/lib/report-regime";

export function ReportRegimeToggle({ value, onChange }: {
  value: Regime;
  onChange: (value: Regime) => void;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">Regime:</span>
      <RadioGroup
        aria-label="Regime"
        value={value}
        onValueChange={(v) => onChange(v as Regime)}
        className="flex gap-4"
      >
        {(["caixa", "competencia"] as const).map((regime) => (
          <div key={regime} className="flex items-center gap-1.5">
            <RadioGroupItem value={regime} id={`report-regime-${regime}`} />
            <Label htmlFor={`report-regime-${regime}`} className="cursor-pointer text-sm">
              {regime === "caixa" ? "Caixa" : "Competência"}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
