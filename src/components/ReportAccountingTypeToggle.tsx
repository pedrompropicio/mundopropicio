import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { AccountingType } from "@/lib/report-accounting-type";

export function ReportAccountingTypeToggle({ value, onChange, disabled = false }: {
  value: AccountingType;
  onChange: (value: AccountingType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">Tipo:</span>
      <RadioGroup
        aria-label="Tipo"
        value={value}
        disabled={disabled}
        onValueChange={(v) => onChange(v as AccountingType)}
        className="flex flex-wrap gap-4"
      >
        {([
          ["all", "Todas"],
          ["contabil", "Só contábeis"],
          ["gerencial", "Só gerenciais"],
        ] as const).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5">
            <RadioGroupItem value={type} id={`report-accounting-type-${type}`} />
            <Label htmlFor={`report-accounting-type-${type}`} className="cursor-pointer text-sm">
              {label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
