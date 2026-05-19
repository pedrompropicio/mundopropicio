import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperacaoListFilters } from "@/hooks/useOperacaoListFilters";
import { useScopedEventIds } from "@/hooks/useScopedEventIds";
import { OperacaoListShell } from "@/components/operacao/list/OperacaoListShell";
import { ZonasFiltersBar } from "@/components/operacao/list/ZonasFiltersBar";
import { ZonaCard, type ZonaCardData } from "@/components/operacao/list/ZonaCard";
import { EditFrenteSheet } from "@/components/operacao/event/EditFrenteSheet";

const PAGE_SIZE = 50;

type FrenteCounts = ZonaCardData["counts"];
const emptyCounts = (): FrenteCounts => ({
  total: 0,
  pending: 0,
  in_progress: 0,
  blocked: 0,
  done: 0,
  cancelled: 0,
  chamados_open: 0,
});

export default function ZonasList() {
  const navigate = useNavigate();
  const { isAdmin, hasPermission } = useAuth();
  const canEdit = isAdmin || hasPermission("manage_operacao_frentes");
  const { filters, page, setPage } = useOperacaoListFilters("zonas");
  const { eventIds: scopedEventIds, isLoading: loadingScope } = useScopedEventIds();
  const [params] = useSearchParams();
  const typeFilter = params.get("type"); // "zone" | "service" | null
  const [editingFrenteId, setEditingFrenteId] = useState<string | null>(null);
  const [accumulated, setAccumulated] = useState<ZonaCardData[]>([]);

  const targetEventIds = useMemo(
    () => (filters.event ? [filters.event] : scopedEventIds),
    [filters.event, scopedEventIds],
  );

  const queryKey = useMemo(
    () => [
      "zonas-list",
      targetEventIds.join(","),
      filters.status.join(","),
      typeFilter ?? "all",
      filters.sort_by ?? "display_order",
      filters.sort_dir ?? "asc",
      page,
    ],
    [targetEventIds, filters.status, typeFilter, filters.sort_by, filters.sort_dir, page],
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
    enabled: targetEventIds.length > 0 && !loadingScope,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("operacao_frentes")
        .select(
          `id, name, type, status, color, display_order, event_id,
           event:events!operacao_frentes_event_id_fkey(id, name, date),
           lead:profiles!operacao_frentes_current_lead_id_fkey(id, full_name)`,
          { count: "exact" },
        )
        .in("event_id", targetEventIds);

      if (filters.status.length > 0) q = q.in("status", filters.status);
      else q = q.neq("status", "cancelled");

      if (typeFilter === "zone" || typeFilter === "service") {
        q = q.eq("type", typeFilter);
      }

      const sortBy = filters.sort_by ?? "display_order";
      const sortDir = filters.sort_dir ?? "asc";
      q = q.order(sortBy, { ascending: sortDir === "asc", nullsFirst: false });

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      q = q.range(from, to);

      const { data: frentesRaw, count, error } = await q;
      if (error) throw error;
      const frentes = (frentesRaw ?? []) as any[];
      if (frentes.length === 0) return { rows: [] as ZonaCardData[], count: count ?? 0 };

      const frenteIds = frentes.map((f) => f.id as string);

      const [{ data: etapas }, { data: chamados }] = await Promise.all([
        supabase
          .from("operacao_etapas")
          .select("frente_id, status")
          .in("frente_id", frenteIds),
        supabase
          .from("operacao_registros")
          .select("frente_id")
          .eq("kind", "chamado")
          .in("status", ["open", "in_progress"])
          .in("frente_id", frenteIds),
      ]);

      const countsByFrente: Record<string, FrenteCounts> = {};
      frenteIds.forEach((id) => {
        countsByFrente[id] = emptyCounts();
      });
      (etapas ?? []).forEach((e: any) => {
        const c = countsByFrente[e.frente_id];
        if (!c) return;
        c.total++;
        if (e.status === "pending") c.pending++;
        else if (e.status === "in_progress") c.in_progress++;
        else if (e.status === "blocked") c.blocked++;
        else if (e.status === "done") c.done++;
        else if (e.status === "cancelled") c.cancelled++;
      });
      (chamados ?? []).forEach((ch: any) => {
        if (countsByFrente[ch.frente_id]) countsByFrente[ch.frente_id].chamados_open++;
      });

      const rows: ZonaCardData[] = frentes.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        color: f.color,
        status: f.status,
        event: f.event ?? null,
        lead: f.lead ?? null,
        counts: countsByFrente[f.id] ?? emptyCounts(),
      }));

      return { rows, count: count ?? 0 };
    },
  });

  useEffect(() => {
    if (page === 0) {
      setAccumulated(pageData?.rows ?? []);
    } else if (pageData) {
      setAccumulated((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...pageData.rows.filter((r) => !seen.has(r.id))];
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageData, page]);

  const total = pageData?.count ?? null;
  const hasMore = total !== null && accumulated.length < total;
  const noScope = !filters.event && scopedEventIds.length === 0 && !loadingScope;

  return (
    <>
      <OperacaoListShell
        title="Zonas / Serviços"
        subtitle="Vista cross-evento de zonas e serviços operacionais"
        scope="zonas"
        filtersBar={<ZonasFiltersBar />}
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
        emptyTitle={noScope ? "Sem eventos acessíveis" : "Sem zonas / serviços"}
        emptyMessage={
          noScope
            ? "Não fazes parte de nenhum evento. Pede a alguém para te adicionar."
            : "Cria zonas e serviços no Hub do Evento."
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
          {accumulated.map((z) => (
            <ZonaCard
              key={z.id}
              zona={z}
              showEventBadge={scopedEventIds.length > 1 && !filters.event}
              onClick={() => navigate(`/operacao/frente/${z.id}`)}
              onEdit={() => setEditingFrenteId(z.id)}
              canEdit={canEdit}
            />
          ))}
        </div>
      </OperacaoListShell>

      <EditFrenteSheet
        frenteId={editingFrenteId}
        open={!!editingFrenteId}
        onClose={() => setEditingFrenteId(null)}
        onChanged={() => refetch()}
      />
    </>
  );
}
