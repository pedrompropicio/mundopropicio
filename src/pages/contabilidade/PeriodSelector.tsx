import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  startOfMonth, endOfMonth, subMonths,
  startOfQuarter, endOfQuarter, subQuarters,
  startOfYear, endOfYear, format,
} from "date-fns";

export interface Period { from: string; to: string; }

function fmt(d: Date) { return format(d, "yyyy-MM-dd"); }

export const PRESETS: { key: string; label: string; range: () => Period }[] = [
  { key: "this_month", label: "Este mês", range: () => { const n = new Date(); return { from: fmt(startOfMonth(n)), to: fmt(endOfMonth(n)) }; } },
  { key: "last_month", label: "Mês passado", range: () => { const n = subMonths(new Date(), 1); return { from: fmt(startOfMonth(n)), to: fmt(endOfMonth(n)) }; } },
  { key: "this_quarter", label: "Trimestre actual", range: () => { const n = new Date(); return { from: fmt(startOfQuarter(n)), to: fmt(endOfQuarter(n)) }; } },
  { key: "last_quarter", label: "Trimestre passado", range: () => { const n = subQuarters(new Date(), 1); return { from: fmt(startOfQuarter(n)), to: fmt(endOfQuarter(n)) }; } },
  { key: "this_year", label: "Ano actual", range: () => { const n = new Date(); return { from: fmt(startOfYear(n)), to: fmt(endOfYear(n)) }; } },
];

interface Props { value: Period; onChange: (p: Period) => void; }

export function PeriodSelector({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((p) => {
        const r = p.range();
        const active = r.from === value.from && r.to === value.to;
        return (
          <Button
            key={p.key}
            size="sm"
            variant={active ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => onChange(r)}
          >
            {p.label}
          </Button>
        );
      })}
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
            {value.from} → {value.to}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 space-y-2" align="end">
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={value.from} max={value.to}
              onChange={(e) => onChange({ from: e.target.value, to: value.to })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={value.to} min={value.from}
              onChange={(e) => onChange({ from: value.from, to: e.target.value })} />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
