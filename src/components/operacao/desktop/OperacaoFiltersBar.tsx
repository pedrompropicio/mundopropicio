import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScopedEventIds } from "@/hooks/useScopedEventIds";
import { useOperacaoFilters } from "@/hooks/useOperacaoFilters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Filter, X } from "lucide-react";
import { useEffect } from "react";

const STATUS_OPTS: { value: string; label: string }[] = [
  { value: "pending", label: "Pendente" },
  { value: "in_progress", label: "Em curso" },
  { value: "blocked", label: "Bloqueada" },
  { value: "done", label: "Concluída" },
  { value: "cancelled", label: "Cancelada" },
];

const KIND_OPTS: { value: string; label: string }[] = [
  { value: "evolucao", label: "Evolução" },
  { value: "observacao", label: "Observação" },
  { value: "punch", label: "Punch" },
  { value: "chamado", label: "Chamado" },
];

export function OperacaoFiltersBar() {
  const { user } = useAuth();
  const { filters, update, toggle, clear } = useOperacaoFilters();

  // Events where user is in a frente team
  const { data: events } = useQuery({
    queryKey: ["op-filter-events", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: teams } = await supabase
        .from("operacao_frente_team")
        .select("frente_id")
        .eq("profile_id", user!.id).eq("active", true);
      const frenteIds = Array.from(new Set((teams ?? []).map((t: any) => t.frente_id)));
      if (frenteIds.length === 0) return [];
      const { data: fr } = await supabase
        .from("operacao_frentes")
        .select("event_id, events(id,name,date,status)")
        .in("id", frenteIds);
      const eventMap = new Map<string, any>();
      (fr ?? []).forEach((f: any) => {
        if (f.events && !eventMap.has(f.events.id)) eventMap.set(f.events.id, f.events);
      });
      return Array.from(eventMap.values()).sort((a, b) =>
        (b.date ?? "").localeCompare(a.date ?? ""),
      );
    },
  });

  // Default event = most recent
  useEffect(() => {
    if (!filters.event && events && events.length > 0) {
      update({ event: events[0].id });
    }
  }, [filters.event, events, update]);

  const { data: frentes } = useQuery({
    queryKey: ["op-filter-frentes", filters.event],
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
    filters.frentes.length > 0 || filters.status.length > 0 || filters.kind.length > 0;

  return (
    <div className="sticky top-14 z-30 -mx-4 lg:-mx-6 mb-4 border-b bg-background/95 backdrop-blur px-4 lg:px-6 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filters.event ?? ""} onValueChange={(v) => update({ event: v, frentes: [] })}>
          <SelectTrigger className="w-[240px] h-8">
            <SelectValue placeholder="Escolhe o evento" />
          </SelectTrigger>
          <SelectContent>
            {(events ?? []).map((e: any) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={clear} className="h-7 ml-auto">
            <X className="h-3 w-3 mr-1" /> Limpar
          </Button>
        )}
      </div>

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
        <span className="text-[11px] text-muted-foreground self-center ml-3 mr-1">Tipo:</span>
        {KIND_OPTS.map((o) => {
          const active = filters.kind.includes(o.value as any);
          return (
            <Badge
              key={o.value}
              variant={active ? "default" : "outline"}
              className="cursor-pointer h-6"
              onClick={() => toggle("kind", o.value)}
            >
              {o.label}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
