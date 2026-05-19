import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperacaoListFilters } from "@/hooks/useOperacaoListFilters";
import { useScopedEventIds } from "@/hooks/useScopedEventIds";
import { OperacaoListShell } from "@/components/operacao/list/OperacaoListShell";
import { ChamadosFiltersBar } from "@/components/operacao/list/ChamadosFiltersBar";
import { ChamadoListRow, type ChamadoListRowData } from "@/components/operacao/list/ChamadoListRow";

const PAGE_SIZE = 50;

export default function ChamadosList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { filters, page, setPage } = useOperacaoListFilters("chamados");
  const { eventIds: scopedEventIds, isLoading: loadingScope } = useScopedEventIds();
  const [params] = useSearchParams();
  const [accumulated, setAccumulated] = useState<ChamadoListRowData[]>([]);

  const priorityFilter = useMemo(
    () => (params.get("priority") ?? "").split(",").filter(Boolean),
    [params],
  );
  const breachesOnly = params.get("breaches") === "1";

  const targetEventIds = useMemo(
    () => (filters.event ? [filters.event] : scopedEventIds),
    [filters.event, scopedEventIds],
  );

  const { data: frentes } = useQuery({
    queryKey: ["chamados-list-frentes", targetEventIds.join(",")],
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
    return filters.frentes.length > 0 ? all.filter((id) => filters.frentes.includes(id)) : all;
  }, [frentes, filters.frentes]);

  const queryKey = useMemo(
    () => [
      "chamados-list",
      scopedFrenteIds.join(","),
      filters.status.join(","),
      priorityFilter.join(","),
      breachesOnly,
      filters.sort_by ?? "created_at",
      filters.sort_dir ?? "desc",
      page,
      user?.id,
    ],
    [scopedFrenteIds, filters.status, priorityFilter, breachesOnly, filters.sort_by, filters.sort_dir, page, user?.id],
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
        .from("operacao_registros")
        .select(
          `id, text, priority, status, sla_due_at, escalation_level, acked_at, resolved_at, created_at,
           frente:operacao_frentes!operacao_registros_frente_id_fkey(id, name, color, event:events(id, name)),
           etapa:operacao_etapas!operacao_registros_etapa_id_fkey(id, name),
           author:profiles!operacao_registros_author_profile_id_fkey(id, full_name)`,
          { count: "exact" },
        )
        .eq("kind", "chamado")
        .in("frente_id", scopedFrenteIds);

      if (filters.status.length > 0) q = q.in("status", filters.status);
      if (priorityFilter.length > 0) q = q.in("priority", priorityFilter);
      if (breachesOnly) q = q.gte("escalation_level", 2);

      // TODO: sort_by="priority" requer CASE em SQL ou client-side (enum não tem ordem natural).
      // v1: cai para created_at desc.
      const sortBy = filters.sort_by ?? "created_at";
      const sortDir = filters.sort_dir ?? "desc";
      if (sortBy === "priority") {
        q = q.order("created_at", { ascending: false });
      } else {
        q = q.order(sortBy, { ascending: sortDir === "asc", nullsFirst: false });
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      q = q.range(from, to);

      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as ChamadoListRowData[], count: count ?? 0 };
    },
  });

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
      title="Chamados"
      subtitle="Vista cross-evento de chamados operacionais"
      scope="chamados"
      filtersBar={<ChamadosFiltersBar />}
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
      emptyTitle={noScope ? "Sem eventos acessíveis" : "Sem chamados para os filtros actuais"}
      emptyMessage={
        noScope
          ? "Não fazes parte de nenhum evento. Pede a alguém para te adicionar."
          : "Tenta ajustar os filtros ou limpar."
      }
    >
      {accumulated.map((c) => (
        <ChamadoListRow
          key={c.id}
          chamado={c}
          showEventBadge={scopedEventIds.length > 1 && !filters.event}
          onClick={() => navigate(`/operacao/chamado/${c.id}`)}
        />
      ))}
    </OperacaoListShell>
  );
}
