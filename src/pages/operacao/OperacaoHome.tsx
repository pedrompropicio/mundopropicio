import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOperacaoFilters } from "@/hooks/useOperacaoFilters";
import { OperacaoFiltersBar } from "@/components/operacao/desktop/OperacaoFiltersBar";
import { FrenteCardDesktop } from "@/components/operacao/desktop/FrenteCardDesktop";
import { EtapaKanban } from "@/components/operacao/desktop/EtapaKanban";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";

export default function OperacaoHome() {
  const isMobile = useIsMobile();
  const { user, hasPermission, isAdmin } = useAuth();
  const { filters } = useOperacaoFilters();
  const canManageFrentes = isAdmin || hasPermission("manage_operacao_frentes");
  const canView = isAdmin || hasPermission("view_operacao");

  const { data: frentes } = useQuery({
    queryKey: ["op-home-frentes", filters.event, filters.frentes.join(",")],
    enabled: !!filters.event && !isMobile && canView,
    queryFn: async () => {
      let q = supabase
        .from("operacao_frentes")
        .select("id,name,color,status,current_lead_id,event_id")
        .eq("event_id", filters.event!)
        .neq("status", "cancelled")
        .order("display_order");
      const { data } = await q;
      let list = data ?? [];
      if (filters.frentes.length > 0) list = list.filter((f: any) => filters.frentes.includes(f.id));
      return list;
    },
  });

  const ids = useMemo(() => (frentes ?? []).map((f: any) => f.id), [frentes]);

  const { data: counts } = useQuery({
    queryKey: ["op-home-counts", ids],
    enabled: ids.length > 0 && !isMobile && canView,
    queryFn: async () => {
      const [{ data: etapas }, { data: regs }] = await Promise.all([
        supabase.from("operacao_etapas").select("frente_id,status").in("frente_id", ids),
        supabase.from("operacao_registros").select("frente_id,status,kind").in("frente_id", ids).eq("kind", "chamado"),
      ]);
      const out: Record<string, any> = {};
      for (const id of ids) out[id] = { etapas_pending: 0, etapas_in_progress: 0, etapas_done: 0, chamados_open: 0, chamados_in_progress: 0 };
      (etapas ?? []).forEach((e: any) => {
        if (e.status === "pending") out[e.frente_id].etapas_pending++;
        else if (e.status === "in_progress") out[e.frente_id].etapas_in_progress++;
        else if (e.status === "done") out[e.frente_id].etapas_done++;
      });
      (regs ?? []).forEach((r: any) => {
        if (r.status === "open") out[r.frente_id].chamados_open++;
        else if (r.status === "in_progress") out[r.frente_id].chamados_in_progress++;
      });
      return out;
    },
  });

  const { data: teamMap } = useQuery({
    queryKey: ["op-home-team", ids],
    enabled: ids.length > 0 && !isMobile && canView,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frente_team")
        .select("frente_id,profile_id,role_in_frente, profiles:profile_id(full_name,profile_type)")
        .in("frente_id", ids).eq("active", true);
      const out: Record<string, any[]> = {};
      (data ?? []).forEach((m: any) => {
        if (!out[m.frente_id]) out[m.frente_id] = [];
        out[m.frente_id].push({
          profile_id: m.profile_id,
          full_name: m.profiles?.full_name ?? null,
          role_in_frente: m.role_in_frente,
          profile_type: m.profiles?.profile_type ?? null,
        });
      });
      return out;
    },
  });

  const { data: lastActMap } = useQuery({
    queryKey: ["op-home-lastact", ids],
    enabled: ids.length > 0 && !isMobile && canView,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_registros")
        .select("frente_id,kind,text,created_at, author:profiles!operacao_registros_author_profile_id_fkey(full_name)")
        .in("frente_id", ids).neq("kind", "chamado").order("created_at", { ascending: false }).limit(200);
      const out: Record<string, any> = {};
      for (const r of data ?? []) {
        if (!out[(r as any).frente_id]) {
          out[(r as any).frente_id] = {
            kind: (r as any).kind, text: (r as any).text, created_at: (r as any).created_at,
            author_name: (r as any).author?.full_name ?? null,
          };
        }
      }
      return out;
    },
  });

  if (isMobile) return <Navigate to="/operacao/equipa" replace />;
  if (!canView) return <div className="p-6">Sem permissão.</div>;

  return (
    <div>
      <OperacaoFiltersBar />
      <Tabs defaultValue="frentes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="frentes">Frentes</TabsTrigger>
          <TabsTrigger value="kanban">Etapas Kanban</TabsTrigger>
        </TabsList>

        <TabsContent value="frentes">
          {!filters.event && <p className="text-sm text-muted-foreground">Escolhe um evento acima.</p>}
          {(frentes ?? []).length === 0 && filters.event && (
            <Card className="p-6 text-center text-muted-foreground">
              Sem Frentes neste evento. Cria uma em + Planejamento.
            </Card>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(frentes ?? []).map((f: any) => (
              <FrenteCardDesktop
                key={f.id}
                frente={f}
                counts={counts?.[f.id] ?? { etapas_pending:0, etapas_in_progress:0, etapas_done:0, chamados_open:0, chamados_in_progress:0 }}
                lastActivity={lastActMap?.[f.id] ?? null}
                team={teamMap?.[f.id] ?? []}
                isLead={f.current_lead_id === user?.id}
                canManage={canManageFrentes}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="kanban">
          {!filters.event ? (
            <p className="text-sm text-muted-foreground">Escolhe um evento acima.</p>
          ) : (
            <EtapaKanban />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
