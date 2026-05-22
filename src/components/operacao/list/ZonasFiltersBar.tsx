import { useSearchParams } from "react-router-dom";
import { useOperacaoListFilters, type SortDir } from "@/hooks/useOperacaoListFilters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Filter, X, ArrowUpDown } from "lucide-react";

const STATUS_OPTS = [
  { value: "active", label: "Activas" },
  { value: "completed", label: "Concluídas" },
  { value: "cancelled", label: "Canceladas" },
];

const TYPE_OPTS: { value: "all" | "zone" | "service"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "zone", label: "Zonas" },
  { value: "service", label: "Serviços" },
];

const SORT_OPTS = [
  { value: "display_order", label: "Ordem" },
  { value: "name", label: "Nome" },
];

export function ZonasFiltersBar() {
  const { filters, update, toggle, clear } = useOperacaoListFilters("zonas");
  const [params, setParams] = useSearchParams();
  const currentType = (params.get("type") as "zone" | "service" | null) ?? "all";

  const setType = (v: "all" | "zone" | "service") => {
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("type");
    else next.set("type", v);
    next.delete("page");
    setParams(next, { replace: true });
  };

  // "Activas" visualmente activo quando não há filtro explícito de status
  const statusActive = (val: string) =>
    filters.status.length === 0 ? val === "active" : filters.status.includes(val as any);

  const hasAnyFilter = filters.status.length > 0 || currentType !== "all";

  const toggleDir = () =>
    update({ sort_dir: (filters.sort_dir === "asc" ? "desc" : "asc") as SortDir });

  return (
    <div className="border-b pb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select
          value={filters.sort_by ?? "display_order"}
          onValueChange={(v) => update({ sort_by: v })}
        >
          <SelectTrigger className="w-[160px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                Ordenar: {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2"
          onClick={toggleDir}
          title="Inverter ordem"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span className="ml-1 text-[10px]">{filters.sort_dir === "asc" ? "↑" : "↓"}</span>
        </Button>

        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clear();
              setType("all");
            }}
            className="h-7 ml-auto"
          >
            <X className="h-3 w-3 mr-1" /> Limpar
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-[11px] text-muted-foreground self-center mr-1">Tipo:</span>
        {TYPE_OPTS.map((o) => {
          const active = currentType === o.value;
          return (
            <Badge
              key={o.value}
              variant={active ? "default" : "outline"}
              className="cursor-pointer h-6"
              onClick={() => setType(o.value)}
            >
              {o.label}
            </Badge>
          );
        })}
        <span className="text-[11px] text-muted-foreground self-center ml-3 mr-1">Status:</span>
        {STATUS_OPTS.map((o) => {
          const active = statusActive(o.value);
          return (
            <Badge
              key={o.value}
              variant={active ? "default" : "outline"}
              className="cursor-pointer h-6"
              onClick={() => toggle("status", o.value)}
            >
              {o.label}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
