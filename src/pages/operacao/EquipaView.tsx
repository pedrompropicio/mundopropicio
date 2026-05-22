import { useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperacaoListFilters } from "@/hooks/useOperacaoListFilters";
import { useScopedEventIds } from "@/hooks/useScopedEventIds";
import { useAuth } from "@/contexts/AuthContext";
import { OperacaoListShell } from "@/components/operacao/list/OperacaoListShell";
import { EquipaEventoTab } from "@/components/operacao/equipa/EquipaEventoTab";
import { FieldStaffSection } from "@/components/operacao/equipa/FieldStaffSection";
import { FrentesPanel } from "@/components/operacao/event/FrentesPanel";
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

type TabKey = "pessoas" | "frentes" | "staff";

export default function EquipaView() {
  const { filters, update } = useOperacaoListFilters("pessoas");
  const { eventIds: scopedEventIds, isLoading: loadingScope } = useScopedEventIds();
  const { hasPermission, isAdmin } = useAuth();
  const [tab, setTab] = useState<TabKey>("pessoas");

  const canManageFrentes = isAdmin || hasPermission("manage_operacao_frentes");
  const canManageStaff = isAdmin || hasPermission("manage_operacao_staff");

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
        .select("id,name,date,status,company_id")
        .in("id", scopedEventIds)
        .order("date", { ascending: false });
      return data ?? [];
    },
  });

  const activeEvent = useMemo(
    () => (events ?? []).find((e: any) => e.id === activeEventId) ?? null,
    [events, activeEventId],
  );

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

  // A tab "Field Staff" é global (não depende do evento). As outras precisam de evento.
  const needsEvent = tab !== "staff";

  return (
    <OperacaoListShell
      title="Equipa"
      subtitle="Quem trabalha na operação"
      scope="pessoas"
      filtersBar={needsEvent ? filtersBar : undefined}
      page={0}
      pageSize={1}
      isLoading={loadingScope}
      isError={false}
      isEmpty={false}
    >
      <div className="p-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
            <TabsTrigger value="frentes">Por Zona / Serviço</TabsTrigger>
            <TabsTrigger value="staff" disabled={!canManageStaff}>Staff de Campo</TabsTrigger>
          </TabsList>

          <TabsContent value="pessoas" className="mt-4">
            {noScope ? (
              <Card className="p-10 text-center text-sm text-muted-foreground">
                Não fazes parte de nenhum evento. Pede para te adicionarem.
              </Card>
            ) : !activeEventId ? (
              <Card className="p-10 text-center space-y-3">
                <CalendarRange className="h-8 w-8 mx-auto text-muted-foreground" />
                <h3 className="font-medium">Escolhe um evento</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  A vista de pessoas precisa de um evento ativo. Seleciona acima.
                </p>
              </Card>
            ) : (
              <EquipaEventoTab eventId={activeEventId} />
            )}
          </TabsContent>

          <TabsContent value="frentes" className="mt-4 space-y-6">
            {noScope ? (
              <Card className="p-10 text-center text-sm text-muted-foreground">
                Não fazes parte de nenhum evento.
              </Card>
            ) : !activeEvent ? (
              <Card className="p-10 text-center space-y-3">
                <CalendarRange className="h-8 w-8 mx-auto text-muted-foreground" />
                <h3 className="font-medium">Escolhe um evento</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Para gerir produtores por Zona ou Serviço, escolhe um evento acima.
                </p>
              </Card>
            ) : (
              <>
                <FrentesPanel
                  eventId={activeEvent.id}
                  companyId={activeEvent.company_id}
                  type="zone"
                  canManage={canManageFrentes}
                />
                <FrentesPanel
                  eventId={activeEvent.id}
                  companyId={activeEvent.company_id}
                  type="service"
                  canManage={canManageFrentes}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="staff" className="mt-4">
            <FieldStaffSection compact />
          </TabsContent>
        </Tabs>
      </div>
    </OperacaoListShell>
  );
}
