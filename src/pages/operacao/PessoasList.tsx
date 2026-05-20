import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperacaoListFilters } from "@/hooks/useOperacaoListFilters";
import { useScopedEventIds } from "@/hooks/useScopedEventIds";
import { OperacaoListShell } from "@/components/operacao/list/OperacaoListShell";
import { PessoasFiltersBar } from "@/components/operacao/list/PessoasFiltersBar";
import { PessoaListRow, type PessoaListRowData } from "@/components/operacao/list/PessoaListRow";

const PAGE_SIZE = 50;

export default function PessoasList() {
  const navigate = useNavigate();
  const { filters, page, setPage } = useOperacaoListFilters("pessoas");
  const { eventIds: scopedEventIds, isLoading: loadingScope } = useScopedEventIds();
  const [params] = useSearchParams();
  const typeFilter = useMemo(
    () => (params.get("type") ?? "").split(",").filter(Boolean),
    [params],
  );

  const targetEventIds = useMemo(
    () => (filters.event ? [filters.event] : scopedEventIds),
    [filters.event, scopedEventIds],
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
    queryKey: [
      "pessoas-list",
      targetEventIds.join(","),
      typeFilter.join(","),
      filters.sort_by ?? "name",
      filters.sort_dir ?? "asc",
      page,
    ],
    enabled: targetEventIds.length > 0 && !loadingScope,
    staleTime: 30_000,
    queryFn: async () => {
      // 1) Frentes do scope (para filtrar etapas/registros e ter nomes)
      const { data: frentes, error: frErr } = await supabase
        .from("operacao_frentes")
        .select("id, name, event_id, current_lead_id")
        .in("event_id", targetEventIds);
      if (frErr) throw frErr;
      const frenteById = new Map<string, { id: string; name: string }>();
      (frentes ?? []).forEach((f: any) => frenteById.set(f.id, { id: f.id, name: f.name }));
      const frenteIds = Array.from(frenteById.keys());

      if (frenteIds.length === 0) {
        return { rows: [] as PessoaListRowData[], count: 0 };
      }

      // 2) Etapas do scope (para mapear etapa -> frente)
      const { data: etapas, error: etErr } = await supabase
        .from("operacao_etapas")
        .select("id, frente_id, responsible_profile_id")
        .in("frente_id", frenteIds);
      if (etErr) throw etErr;
      const etapaToFrente = new Map<string, string>();
      (etapas ?? []).forEach((e: any) => etapaToFrente.set(e.id, e.frente_id));
      const etapaIds = Array.from(etapaToFrente.keys());

      // 3) Paralelo: team, assignees, chamados abertos
      const [teamRes, assignRes, chamadosRes] = await Promise.all([
        supabase
          .from("operacao_frente_team")
          .select("profile_id, frente_id, role_in_frente, is_permanent_lead")
          .in("frente_id", frenteIds)
          .eq("active", true),
        etapaIds.length
          ? supabase
              .from("operacao_etapa_assignees")
              .select("profile_id, role, etapa_id")
              .in("etapa_id", etapaIds)
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from("operacao_registros")
          .select("author_profile_id, frente_id")
          .eq("kind", "chamado")
          .in("status", ["open", "in_progress"])
          .in("frente_id", frenteIds),
      ]);
      if (teamRes.error) throw teamRes.error;
      if (assignRes.error) throw assignRes.error;
      if (chamadosRes.error) throw chamadosRes.error;

      // 4) Coletar todos profile_ids únicos
      const profileIds = new Set<string>();
      (frentes ?? []).forEach((f: any) => f.current_lead_id && profileIds.add(f.current_lead_id));
      (etapas ?? []).forEach((e: any) => e.responsible_profile_id && profileIds.add(e.responsible_profile_id));
      (teamRes.data ?? []).forEach((t: any) => t.profile_id && profileIds.add(t.profile_id));
      (assignRes.data ?? []).forEach((a: any) => a.profile_id && profileIds.add(a.profile_id));
      (chamadosRes.data ?? []).forEach((c: any) => c.author_profile_id && profileIds.add(c.author_profile_id));

      if (profileIds.size === 0) {
        return { rows: [] as PessoaListRowData[], count: 0 };
      }

      // 5) Hidratar profiles
      const { data: profilesData, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, profile_type")
        .in("id", Array.from(profileIds));
      if (pErr) throw pErr;
      const profileById = new Map<string, any>();
      (profilesData ?? []).forEach((p: any) => profileById.set(p.id, p));

      // 6) Agregar
      const map = new Map<string, PessoaListRowData>();
      const ensure = (pid: string): PessoaListRowData | null => {
        if (!pid) return null;
        if (!map.has(pid)) {
          const p = profileById.get(pid);
          map.set(pid, {
            profile_id: pid,
            full_name: p?.full_name ?? null,
            email: p?.email ?? null,
            profile_type: p?.profile_type ?? null,
            counts: { zonas_lead: 0, zonas_team: 0, etapas_owner: 0, etapas_helper: 0, chamados_abertos: 0 },
            frentes_nomes: [],
          });
        }
        return map.get(pid)!;
      };
      const addFrente = (row: PessoaListRowData, frenteId?: string | null) => {
        const fn = frenteId ? frenteById.get(frenteId)?.name : null;
        if (fn && !row.frentes_nomes.includes(fn)) row.frentes_nomes.push(fn);
      };

      // team
      const teamPairs = new Set<string>(); // `${profile_id}|${frente_id}`
      (teamRes.data ?? []).forEach((t: any) => {
        const row = ensure(t.profile_id);
        if (!row) return;
        teamPairs.add(`${t.profile_id}|${t.frente_id}`);
        if (t.is_permanent_lead || t.role_in_frente === "lead") row.counts.zonas_lead++;
        else row.counts.zonas_team++;
        addFrente(row, t.frente_id);
      });

      // current_lead_id (fallback se não estiver em team)
      (frentes ?? []).forEach((f: any) => {
        if (!f.current_lead_id) return;
        const row = ensure(f.current_lead_id);
        if (!row) return;
        addFrente(row, f.id);
        if (!teamPairs.has(`${f.current_lead_id}|${f.id}`)) row.counts.zonas_lead++;
      });

      // etapa assignees
      (assignRes.data ?? []).forEach((a: any) => {
        const row = ensure(a.profile_id);
        if (!row) return;
        if (a.role === "owner") row.counts.etapas_owner++;
        else row.counts.etapas_helper++;
        addFrente(row, etapaToFrente.get(a.etapa_id));
      });

      // etapas.responsible_profile_id
      (etapas ?? []).forEach((e: any) => {
        if (!e.responsible_profile_id) return;
        const row = ensure(e.responsible_profile_id);
        if (!row) return;
        row.counts.etapas_owner++;
        addFrente(row, e.frente_id);
      });

      // chamados abertos
      (chamadosRes.data ?? []).forEach((c: any) => {
        const row = ensure(c.author_profile_id);
        if (!row) return;
        row.counts.chamados_abertos++;
        addFrente(row, c.frente_id);
      });

      // Filter por type
      let rows = Array.from(map.values());
      if (typeFilter.length > 0) {
        rows = rows.filter((r) => r.profile_type && typeFilter.includes(r.profile_type));
      }

      // Sort
      const sortBy = filters.sort_by ?? "name";
      const sortDir = filters.sort_dir ?? "asc";
      rows.sort((a, b) => {
        let cmp = 0;
        if (sortBy === "name") {
          cmp = (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? "", "pt-PT");
        } else if (sortBy === "etapas") {
          cmp = (a.counts.etapas_owner + a.counts.etapas_helper) -
                (b.counts.etapas_owner + b.counts.etapas_helper);
        } else if (sortBy === "chamados") {
          cmp = a.counts.chamados_abertos - b.counts.chamados_abertos;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });

      const total = rows.length;
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE;
      return { rows: rows.slice(0, to), count: total };
    },
  });

  const total = pageData?.count ?? null;
  const rows = pageData?.rows ?? [];
  const hasMore = total !== null && rows.length < total;
  const noScope = !filters.event && scopedEventIds.length === 0 && !loadingScope;

  return (
    <OperacaoListShell
      title="Pessoas"
      subtitle="Vista de gestão operacional por produtor e staff"
      scope="pessoas"
      filtersBar={<PessoasFiltersBar />}
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
      isEmpty={!isLoading && rows.length === 0}
      emptyTitle={noScope ? "Sem eventos acessíveis" : "Sem pessoas operacionais"}
      emptyMessage={
        noScope
          ? "Não fazes parte de nenhum evento. Pede a alguém para te adicionar."
          : "Ninguém está atribuído a zonas, etapas ou chamados destes eventos."
      }
    >
      {rows.map((p) => (
        <PessoaListRow
          key={p.profile_id}
          pessoa={p}
          onClick={() => navigate(`/operacao/pessoa/${p.profile_id}`)}
        />
      ))}
    </OperacaoListShell>
  );
}
