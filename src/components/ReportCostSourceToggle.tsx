import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { REPORT_COST_SOURCE_LABEL, type ReportCostSource } from "@/lib/report-event-cost";

/**
 * #218 — "Custo de evento: BP (padrão) | Transações (comparação)".
 * Vista de comparação apenas: estado local do ecrã, NUNCA gravado como preferência.
 */
export function ReportCostSourceToggle({
  value,
  onChange,
}: {
  value: ReportCostSource;
  onChange: (v: ReportCostSource) => void;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">Custo de evento:</span>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as ReportCostSource)}
        className="flex gap-4"
      >
        {(["bp", "transactions"] as ReportCostSource[]).map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <RadioGroupItem value={k} id={`cost-src-${k}`} />
            <Label htmlFor={`cost-src-${k}`} className="cursor-pointer text-sm">
              {REPORT_COST_SOURCE_LABEL[k]}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
