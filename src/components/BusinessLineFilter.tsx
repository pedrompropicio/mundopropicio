import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useBusinessLines } from "@/hooks/useBusinessLines";
import { businessLineLabel } from "@/lib/business-line-filter";

interface Props {
  /** Vazio = todas as linhas, incluindo sem linha. */
  value: string[];
  onChange: (value: string[]) => void;
}

export function BusinessLineFilter({ value, onChange }: Props) {
  const { data: lines = [] } = useBusinessLines(false);
  const options = [
    ...lines.map((line) => ({ id: line.id, label: `${line.name}${line.is_active ? "" : " (inactiva)"}` })),
    { id: "__sem_linha__", label: "Sem linha" },
  ];
  const all = value.length === 0 || options.every((option) => value.includes(option.id));
  const label = all ? "Todas"
    : value.length === 1 ? businessLineLabel(value[0], lines) : `${value.length} selecionadas`;
  const effective = all ? options.map((option) => option.id) : value;
  const toggle = (id: string) => {
    const next = effective.includes(id) ? effective.filter((item) => item !== id) : [...effective, id];
    onChange(options.every((option) => next.includes(option.id)) ? [] : next);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          Linha de negócio: {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2" align="start">
        {options.map((option) => (
          <label key={option.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={effective.includes(option.id)} onCheckedChange={() => toggle(option.id)} />
            {option.label}
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
