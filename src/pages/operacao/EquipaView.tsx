import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperacaoListFilters } from "@/hooks/useOperacaoListFilters";
import { useScopedEventIds } from "@/hooks/useScopedEventIds";
import { OperacaoListShell } from "@/components/operacao/list/OperacaoListShell";
import { EquipaEventoTab } from "@/components/operacao/equipa/EquipaEventoTab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Filter, CalendarRange } from "lucide-react";

export default function EquipaView() {
  const { filters, update } = useOperacaoListFilters("pessoas");
  const { eventIds: scopedEventIds, isLoading: loadingScope } = useScopedEventIds();
  const [tab, setTab] = useState<"evento" | "cadastro">("evento");

  const activeEventId = useMemo(
    () => filters.event ?? (scopedEventIds.length === 1 ? scopedEventIds[0] : null),
    [filters.event, scopedEventIds],
  );

  const { data: events } = useQuery({
    queryKey: ["equipa-event-options", scopedEventIds.join(",")],
    enabled: scopedEventIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id,name,date,status")
        .in("id", scopedEventIds)
        .order("date", { ascending: false });
      return data ?? [];
    },
  });

  const filtersBar = (
    <div className="border-b pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select
          value={filters.event ?? "__none__"}
          onValueChange={(v) => update({ event: v === "__none__" ? null : v })}
        >
          <SelectTrigger className="w-[260px] h-8">
            <SelectValue placeholder="Escolhe um evento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— Escolhe um evento —</SelectItem>
            {(events ?? []).map((e: any) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const noScope = scopedEventIds.length === 0 && !loadingScope;

  return (
    <OperacaoListShell
      title="Equipa"
      subtitle="Quem trabalha na operação deste evento"
      scope="pessoas"
      filtersBar={filtersBar}
      page={0}
      pageSize={1}
      isLoading={loadingScope}
      isError={false}
      isEmpty={false}
    >
      <div className="p-3">
        {noScope ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            Não fazes parte de nenhum evento. Pede para te adicionarem.
          </Card>
        ) : !activeEventId ? (
          <Card className="p-10 text-center space-y-3">
            <CalendarRange className="h-8 w-8 mx-auto text-muted-foreground" />
            <h3 className="font-medium">Escolhe um evento</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              A vista de equipa precisa de um evento ativo. Seleciona acima.
            </p>
          </Card>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="evento">Equipa do Evento</TabsTrigger>
              <TabsTrigger value="cadastro" disabled>
                Cadastro (em breve)
              </TabsTrigger>
            </TabsList>
            <TabsContent value="evento">
              <EquipaEventoTab eventId={activeEventId} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </OperacaoListShell>
  );
}
