import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperacaoListFilters, type Responsibility, type SortDir } from "@/hooks/useOperacaoListFilters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Filter, X, ArrowUpDown } from "lucide-react";


const STATUS_OPTS = [
  { value: "pending", label: "Pendente" },
  { value: "in_progress", label: "Em curso" },
  { value: "blocked", label: "Bloqueada" },
  { value: "done", label: "Concluída" },
  { value: "cancelled", label: "Cancelada" },
];

const RESP_OPTS: { value: Responsibility; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "meus", label: "Meus" },
  { value: "sem_responsavel", label: "Sem responsável" },
];

const SORT_OPTS = [
  { value: "planned_start", label: "Início" },
  { value: "planned_end", label: "Fim" },
  { value: "name", label: "Nome" },
  { value: "status", label: "Status" },
];

export function EtapasFiltersBar() {
  const { filters, update, toggle, clear } = useOperacaoListFilters("etapas");

  const { data: frentes } = useQuery({
    queryKey: ["op-etapas-filter-frentes", filters.event],
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
    filters.frentes.length > 0 ||
    filters.status.length > 0 ||
    filters.responsibility !== "todos";

  const toggleDir = () =>
    update({ sort_dir: (filters.sort_dir === "asc" ? "desc" : "asc") as SortDir });

  return (
    <div className="border-b pb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />


        <Select
          value={filters.sort_by ?? "planned_start"}
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
        <Button variant="outline" size="sm" className="h-8 px-2" onClick={toggleDir} title="Inverter ordem">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span className="ml-1 text-[10px]">{filters.sort_dir === "asc" ? "↑" : "↓"}</span>
        </Button>

        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={clear} className="h-7 ml-auto">
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
        <span className="text-[11px] text-muted-foreground self-center ml-3 mr-1">Responsável:</span>
        {RESP_OPTS.map((o) => {
          const active = (filters.responsibility ?? "todos") === o.value;
          return (
            <Badge
              key={o.value}
              variant={active ? "default" : "outline"}
              className="cursor-pointer h-6"
              onClick={() => update({ responsibility: o.value })}
            >
              {o.label}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
