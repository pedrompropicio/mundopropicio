import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOperacaoListFilters, type SortDir } from "@/hooks/useOperacaoListFilters";
import { useScopedEventIds } from "@/hooks/useScopedEventIds";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Filter, X, ArrowUpDown, AlertTriangle } from "lucide-react";

const STATUS_OPTS = [
  { value: "open", label: "Abertos" },
  { value: "in_progress", label: "Em curso" },
  { value: "resolved", label: "Resolvidos" },
  { value: "closed", label: "Fechados" },
];

const PRIORITY_OPTS = [
  { value: "crit", label: "Crítica" },
  { value: "high", label: "Alta" },
  { value: "med", label: "Média" },
  { value: "low", label: "Baixa" },
];

const SORT_OPTS = [
  { value: "created_at", label: "Mais recente" },
  { value: "sla_due_at", label: "SLA mais urgente" },
  { value: "priority", label: "Prioridade" },
];

export function ChamadosFiltersBar() {
  const { filters, update, toggle, clear } = useOperacaoListFilters("chamados");
  const { eventIds } = useScopedEventIds();
  const [params, setParams] = useSearchParams();

  const priorityFilter = useMemo(
    () => (params.get("priority") ?? "").split(",").filter(Boolean),
    [params],
  );
  const breachesOnly = params.get("breaches") === "1";

  const togglePriority = (val: string) => {
    const next = new URLSearchParams(params);
    const list = priorityFilter.slice();
    const idx = list.indexOf(val);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(val);
    if (list.length === 0) next.delete("priority");
    else next.set("priority", list.join(","));
    next.delete("page");
    setParams(next, { replace: true });
  };

  const toggleBreaches = () => {
    const next = new URLSearchParams(params);
    if (breachesOnly) next.delete("breaches");
    else next.set("breaches", "1");
    next.delete("page");
    setParams(next, { replace: true });
  };

  const { data: events } = useQuery({
    queryKey: ["op-chamados-filter-events", eventIds.join(",")],
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

  const { data: frentes } = useQuery({
    queryKey: ["op-chamados-filter-frentes", filters.event],
    enabled: !!filters.event,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,name,color")
        .eq("event_id", filters.event!)
        .neq("status", "cancelled")
        .order("display_order");
      return data ?? [];
    },
  });

  const hasAnyFilter =
    !!filters.event ||
    filters.frentes.length > 0 ||
    filters.status.length > 0 ||
    priorityFilter.length > 0 ||
    breachesOnly;

  const clearAll = () => {
    const next = new URLSearchParams(params);
    next.delete("priority");
    next.delete("breaches");
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
          onValueChange={(v) => update({ event: v === "__all__" ? null : v, frentes: [] })}
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
          value={filters.sort_by ?? "created_at"}
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

        <Button
          variant={breachesOnly ? "destructive" : "outline"}
          size="sm"
          className="h-8"
          onClick={toggleBreaches}
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
          Só breaches
        </Button>

        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 ml-auto">
            <X className="h-3 w-3 mr-1" /> Limpar
          </Button>
        )}
      </div>

      {(frentes ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(frentes ?? []).map((f: any) => {
            const active = filters.frentes.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggle("frentes", f.id)}
                className={
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition " +
                  (active ? "bg-foreground text-background" : "hover:bg-muted")
                }
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: f.color ?? "#6b7280" }}
                />
                {f.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <span className="text-[11px] text-muted-foreground self-center mr-1">Status:</span>
        {STATUS_OPTS.map((o) => {
          const active = filters.status.includes(o.value as any);
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
        <span className="text-[11px] text-muted-foreground self-center ml-3 mr-1">Prioridade:</span>
        {PRIORITY_OPTS.map((o) => {
          const active = priorityFilter.includes(o.value);
          return (
            <Badge
              key={o.value}
              variant={active ? "default" : "outline"}
              className="cursor-pointer h-6"
              onClick={() => togglePriority(o.value)}
            >
              {o.label}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
