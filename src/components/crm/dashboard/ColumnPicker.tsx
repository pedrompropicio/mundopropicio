import { Columns3, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { METRIC_COLUMNS, type MetricColumnId } from "@/lib/crm/columns";

/** Selector de colunas visíveis (guardado em localStorage pelo hook useDashboardColumns). */
export function ColumnPicker({
  visible,
  onToggle,
  onReset,
}: {
  visible: MetricColumnId[];
  onToggle: (id: MetricColumnId) => void;
  onReset: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Columns3 className="h-3.5 w-3.5" />
          Colunas
          <span className="font-mono tabular-nums text-muted-foreground">({visible.length})</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Métricas</span>
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={onReset}>
            <RotateCcw className="h-3 w-3 mr-1" />
            Repor
          </Button>
        </div>
        <div className="max-h-72 overflow-y-auto space-y-0.5">
          {METRIC_COLUMNS.map((col) => (
            <label
              key={col.id}
              className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/60 cursor-pointer"
            >
              <Checkbox
                checked={visible.includes(col.id)}
                onCheckedChange={() => onToggle(col.id)}
              />
              <span className="truncate">{col.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
