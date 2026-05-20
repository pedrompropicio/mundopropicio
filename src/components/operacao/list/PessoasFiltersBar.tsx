import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOperacaoListFilters, type SortDir } from "@/hooks/useOperacaoListFilters";
import { useScopedEventIds } from "@/hooks/useScopedEventIds";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Filter, X, ArrowUpDown } from "lucide-react";

const TYPE_OPTS = [
  { value: "field_staff", label: "Staff" },
  { value: "producer", label: "Produtor" },
  { value: "viewer", label: "Diretor" },
  { value: "admin", label: "Admin" },
];

const SORT_OPTS = [
  { value: "name", label: "Nome A-Z" },
  { value: "etapas", label: "Mais etapas" },
  { value: "chamados", label: "Mais chamados" },
];

export function PessoasFiltersBar() {
  const { filters, update, clear } = useOperacaoListFilters("pessoas");
  const { eventIds } = useScopedEventIds();
  const [params, setParams] = useSearchParams();

  const typeFilter = useMemo(
    () => (params.get("type") ?? "").split(",").filter(Boolean),
    [params],
  );

  const toggleType = (val: string) => {
    const next = new URLSearchParams(params);
    const list = typeFilter.slice();
    const idx = list.indexOf(val);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(val);
    if (list.length === 0) next.delete("type");
    else next.set("type", list.join(","));
    next.delete("page");
    setParams(next, { replace: true });
  };

  const { data: events } = useQuery({
    queryKey: ["op-pessoas-filter-events", eventIds.join(",")],
    enabled: eventIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id,name,date,status")
        .in("id", eventIds)
        .order("date", { ascending: false });
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!filters.event && events && events.length === 1) {
      update({ event: events[0].id });
    }
  }, [filters.event, events, update]);

  const hasAnyFilter = !!filters.event || typeFilter.length > 0;

  const clearAll = () => {
    const next = new URLSearchParams(params);
    next.delete("type");
    setParams(next, { replace: true });
    clear();
  };

  const toggleDir = () =>
    update({ sort_dir: (filters.sort_dir === "asc" ? "desc" : "asc") as SortDir });

  return (
    <div className="border-b pb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select
          value={filters.event ?? "__all__"}
          onValueChange={(v) => update({ event: v === "__all__" ? null : v })}
        >
          <SelectTrigger className="w-[240px] h-8">
            <SelectValue placeholder="Todos os eventos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os eventos</SelectItem>
            {(events ?? []).map((e: any) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.sort_by ?? "name"}
          onValueChange={(v) => update({ sort_by: v })}
        >
          <SelectTrigger className="w-[200px] h-8">
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
        <Button variant="outline" size="sm" className="h-8 px-2" onClick={toggleDir} title="Inverter ordem">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span className="ml-1 text-[10px]">{filters.sort_dir === "asc" ? "↑" : "↓"}</span>
        </Button>

        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 ml-auto">
            <X className="h-3 w-3 mr-1" /> Limpar
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-[11px] text-muted-foreground self-center mr-1">Tipo:</span>
        {TYPE_OPTS.map((o) => {
          const active = typeFilter.includes(o.value);
          return (
            <Badge
              key={o.value}
              variant={active ? "default" : "outline"}
              className="cursor-pointer h-6"
              onClick={() => toggleType(o.value)}
            >
              {o.label}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
