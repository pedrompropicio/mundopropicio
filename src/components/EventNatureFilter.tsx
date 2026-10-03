import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { EVENT_NATURES, type EventNature } from "@/lib/event-nature";

interface Props {
  /** Vazio = todas as naturezas. */
  value: EventNature[];
  onChange: (v: EventNature[]) => void;
}

/** Filtro multi-selecção "Natureza do evento". Por omissão todas. */
export function EventNatureFilter({ value, onChange }: Props) {
  const all = value.length === 0 || value.length === EVENT_NATURES.length;
  const label = all
    ? "Todas"
    : value.length === 1
      ? EVENT_NATURES.find((n) => n.value === value[0])?.label
      : `${value.length} selecionadas`;
  const effective = all ? EVENT_NATURES.map((n) => n.value) : value;
  const toggle = (v: EventNature) => {
    const next = effective.includes(v) ? effective.filter((x) => x !== v) : [...effective, v];
    onChange(next.length === EVENT_NATURES.length ? [] : next);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          Natureza do evento: {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2" align="start">
        {EVENT_NATURES.map((n) => (
          <label key={n.value} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={effective.includes(n.value)} onCheckedChange={() => toggle(n.value)} />
            {n.label}
          </label>
        ))}
        {!all && (
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => onChange([])}>
            Todas
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
