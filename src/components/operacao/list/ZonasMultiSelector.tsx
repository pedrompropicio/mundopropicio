import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Zona {
  id: string;
  name: string;
  color?: string | null;
  type?: string | null;
}

interface Props {
  zonas: Zona[];
  selectedIds: string[]; // vazio = todas
  onChange: (ids: string[]) => void;
}

export function ZonasMultiSelector({ zonas, selectedIds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const allSelected = selectedIds.length === 0 || selectedIds.length === zonas.length;
  const effectiveSelected = useMemo(
    () => (allSelected ? new Set(zonas.map((z) => z.id)) : new Set(selectedIds)),
    [allSelected, selectedIds, zonas],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return zonas;
    return zonas.filter((z) => z.name.toLowerCase().includes(q));
  }, [zonas, search]);

  const label = allSelected
    ? `Todas (${zonas.length})`
    : `${selectedIds.length} de ${zonas.length}`;

  const toggle = (id: string) => {
    const current = new Set(effectiveSelected);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    if (current.size === zonas.length) onChange([]);
    else onChange(Array.from(current));
  };

  const selectAll = () => onChange([]);
  const clearAll = () => onChange(zonas.length > 0 ? [zonas[0].id] : []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2">
          <span className="text-xs">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
            Todas
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>
            <X className="h-3 w-3 mr-1" /> Limpar
          </Button>
        </div>
        {zonas.length > 10 && (
          <div className="border-b p-2 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar..."
              className="h-8 pl-7 text-xs"
            />
          </div>
        )}
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Sem resultados
            </div>
          ) : (
            filtered.map((z) => {
              const checked = effectiveSelected.has(z.id);
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => toggle(z.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/60 text-left min-h-[36px]",
                  )}
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: z.color ?? "#6b7280" }}
                  />
                  <span className="text-sm truncate">{z.name}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          {allSelected
            ? "Todas as zonas / serviços"
            : `${selectedIds.length} ${selectedIds.length === 1 ? "zona seleccionada" : "zonas seleccionadas"}`}
        </div>
      </PopoverContent>
    </Popover>
  );
}
