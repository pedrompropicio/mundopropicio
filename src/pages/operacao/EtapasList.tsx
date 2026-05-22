import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperacaoListFilters } from "@/hooks/useOperacaoListFilters";
import { useScopedEventIds } from "@/hooks/useScopedEventIds";
import { OperacaoListShell } from "@/components/operacao/list/OperacaoListShell";
import { EtapasFiltersBar } from "@/components/operacao/list/EtapasFiltersBar";
import { EtapaListRow, type EtapaListRowData } from "@/components/operacao/list/EtapaListRow";
import { ChevronDown, ChevronRight, MapPin, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export default function EtapasList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { filters, page, setPage } = useOperacaoListFilters("etapas");
  const { eventIds: scopedEventIds, isLoading: loadingScope } = useScopedEventIds();
  const [accumulated, setAccumulated] = useState<EtapaListRowData[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const targetEventIds = useMemo(
    () => (filters.event ? [filters.event] : scopedEventIds),
    [filters.event, scopedEventIds],
  );

  const { data: frentes } = useQuery({
    queryKey: ["etapas-list-frentes", targetEventIds.join(",")],
    enabled: targetEventIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operacao_frentes")
        .select("id, event_id")
        .in("event_id", targetEventIds)
        .neq("status", "cancelled");
      if (error) throw error;
      return data ?? [];
    },
  });

  const scopedFrenteIds = useMemo(() => {
    const all = (frentes ?? []).map((f: any) => f.id as string);
    return filters.frentes.length > 0
      ? all.filter((id) => filters.frentes.includes(id))
      : all;
  }, [frentes, filters.frentes]);

  const queryKey = useMemo(
    () => [
      "etapas-list",
      scopedFrenteIds.join(","),
      filters.status.join(","),
      filters.responsibility ?? "todos",
      filters.sort_by ?? "planned_start",
      filters.sort_dir ?? "asc",
      page,
      user?.id,
    ],
    [scopedFrenteIds, filters.status, filters.responsibility, filters.sort_by, filters.sort_dir, page, user?.id],
  );

  const {
    data: pageData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey,
    enabled: scopedFrenteIds.length > 0 && !loadingScope,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("operacao_etapas")
        .select(
          `id, name, status, escopo, planned_start, planned_end, actual_start, actual_end, has_no_date, responsible_profile_id,
           frente:operacao_frentes!operacao_etapas_frente_id_fkey(id, name, color, type, event_id, event:events(id, name)),
           responsible:profiles!operacao_etapas_responsible_profile_id_fkey(id, full_name),
           supplier:suppliers!operacao_etapas_supplier_id_fkey(id, name)`,
          { count: "exact" },
        )
        .in("frente_id", scopedFrenteIds);

      if (filters.status.length > 0) q = q.in("status", filters.status);

      if (filters.responsibility === "meus" && user?.id) {
        q = q.eq("responsible_profile_id", user.id);
      } else if (filters.responsibility === "sem_responsavel") {
        q = q.is("responsible_profile_id", null);
      }

      const sortBy = filters.sort_by ?? "planned_start";
      const sortDir = filters.sort_dir ?? "asc";
      q = q.order(sortBy, { ascending: sortDir === "asc", nullsFirst: false });

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      q = q.range(from, to);

      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as EtapaListRowData[], count: count ?? 0 };
    },
  });

  // Reset accumulator when filters/scope change (page 0)
  useEffect(() => {
    if (page === 0) {
      setAccumulated(pageData?.rows ?? []);
    } else if (pageData) {
      setAccumulated((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const fresh = pageData.rows.filter((r) => !seen.has(r.id));
        return [...prev, ...fresh];
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageData, page]);

  const total = pageData?.count ?? null;
  const hasMore = total !== null && accumulated.length < total;
  const noScope = !filters.event && scopedEventIds.length === 0 && !loadingScope;

  return (
    <OperacaoListShell
      title="Etapas"
      subtitle="Vista cross-evento de etapas operacionais"
      scope="etapas"
      filtersBar={<EtapasFiltersBar />}
      refreshButton
      onRefresh={() => {
        setPage(0);
        refetch();
      }}
      isFetching={isFetching}
      lastUpdatedAt={dataUpdatedAt}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      onLoadMore={() => setPage(page + 1)}
      hasMore={hasMore}
      isLoading={(isLoading || loadingScope) && page === 0}
      isError={isError}
      errorMessage={(error as any)?.message}
      onRetry={() => refetch()}
      isEmpty={!isLoading && accumulated.length === 0}
      emptyTitle={noScope ? "Sem eventos acessíveis" : "Sem etapas para os filtros actuais"}
      emptyMessage={
        noScope
          ? "Não fazes parte de nenhum evento. Pede a alguém para te adicionar."
          : "Tenta ajustar os filtros ou limpar."
      }
    >
      {accumulated.map((etapa) => (
        <EtapaListRow
          key={etapa.id}
          etapa={etapa}
          showEventBadge={scopedEventIds.length > 1 && !filters.event}
          onClick={() => navigate(`/operacao/etapa/${etapa.id}`)}
        />
      ))}
    </OperacaoListShell>
  );
}
