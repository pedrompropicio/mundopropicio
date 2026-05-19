import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OperacaoStatusBadge } from "@/components/operacao/OperacaoStatusBadge";
import { RefreshCw, ChevronRight, AlertTriangle, PlayCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

function formatRelative(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((d - now) / 60000);
  const abs = Math.abs(diffMin);
  const future = diffMin >= 0;
  let label: string;
  if (abs < 1) label = "agora";
  else if (abs < 60) label = `${abs} min`;
  else if (abs < 60 * 24) label = `${Math.round(abs / 60)}h`;
  else if (abs < 60 * 24 * 7) label = `${Math.round(abs / (60 * 24))}d`;
  else
    label = new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
  return future ? `daqui a ${label}` : `há ${label}`;
}

function ageSeconds(ts: number | undefined): number {
  if (!ts) return 0;
  return Math.floor((Date.now() - ts) / 1000);
}

type Etapa = {
  id: string;
  name: string;
  status: string;
  planned_start: string | null;
  planned_end: string | null;
  has_no_date: boolean | null;
  frente: { id: string; name: string; color: string | null; type: string | null } | null;
  responsible: { id: string; full_name: string | null } | null;
  supplier: { name: string | null } | null;
};

export function MontagemPhase({ eventId }: { eventId: string }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("em_curso");
  const [, force] = useState(0);

  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["op-hub-montagem", eventId],
    queryFn: async () => {
      const { data: frentes } = await supabase
        .from("operacao_frentes")
        .select("id")
        .eq("event_id", eventId);
      const frenteIds = (frentes ?? []).map((f: any) => f.id);
      if (frenteIds.length === 0) return [] as Etapa[];
      const { data: etapas, error } = await supabase
        .from("operacao_etapas")
        .select(
          `id,name,status,planned_start,planned_end,has_no_date,
           frente:operacao_frentes!operacao_etapas_frente_id_fkey(id,name,color,type),
           responsible:profiles!operacao_etapas_responsible_profile_id_fkey(id,full_name),
           supplier:suppliers!operacao_etapas_supplier_id_fkey(name)`
        )
        .in("frente_id", frenteIds)
        .order("planned_start", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (etapas ?? []) as unknown as Etapa[];
    },
  });

  // Re-render every 30s so relative dates / "atualizado há Xs" update
  useEffect(() => {
    const i = setInterval(() => force((x) => x + 1), 30000);
    return () => clearInterval(i);
  }, []);

  const { emCurso, atrasadas, lookahead } = useMemo(() => {
    const now = Date.now();
    const in48h = now + 48 * 3600 * 1000;
    const list = data ?? [];
    const emCurso = list.filter((e) => {
      if (e.status === "done" || e.status === "cancelled") return false;
      if (e.status === "in_progress") return true;
      if (e.planned_start && new Date(e.planned_start).getTime() <= now) return true;
      return false;
    });
    const atrasadas = list.filter(
      (e) =>
        e.status !== "done" &&
        e.status !== "cancelled" &&
        e.planned_end &&
        new Date(e.planned_end).getTime() < now
    );
    const lookahead = list.filter((e) => {
      if (!e.planned_start) return false;
      const t = new Date(e.planned_start).getTime();
      return t >= now && t <= in48h;
    });
    return { emCurso, atrasadas, lookahead };
  }, [data, dataUpdatedAt]);

  const age = ageSeconds(dataUpdatedAt);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Montagem</h2>
          <p className="text-xs text-muted-foreground">
            Lista executiva — etapas em curso, atrasadas e próximas 48h.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {dataUpdatedAt ? `atualizado há ${age}s` : "—"}
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 w-full sm:w-auto">
          <TabsTrigger value="em_curso" className="gap-1.5">
            <PlayCircle className="h-3.5 w-3.5" /> Em curso
            <Badge variant="secondary" className="ml-1">{emCurso.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="atrasadas" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Atrasadas
            <Badge
              variant="secondary"
              className={cn(
                "ml-1",
                atrasadas.length > 0 && "bg-destructive/15 text-destructive border-destructive/30"
              )}
            >
              {atrasadas.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="lookahead" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" /> 48h
            <Badge variant="secondary" className="ml-1">{lookahead.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="em_curso" className="mt-4">
          <EtapaList
            etapas={emCurso}
            isLoading={isLoading}
            emptyText="Nenhuma etapa em curso. As etapas com início previsto ≤ hoje vão aparecer aqui."
            onOpen={(id) => navigate(`/operacao/etapa/${id}`)}
          />
        </TabsContent>
        <TabsContent value="atrasadas" className="mt-4">
          <EtapaList
            etapas={atrasadas}
            isLoading={isLoading}
            emptyText="Sem etapas atrasadas. 👍"
            danger
            onOpen={(id) => navigate(`/operacao/etapa/${id}`)}
          />
        </TabsContent>
        <TabsContent value="lookahead" className="mt-4">
          <EtapaList
            etapas={lookahead}
            isLoading={isLoading}
            emptyText="Sem etapas previstas para as próximas 48h."
            onOpen={(id) => navigate(`/operacao/etapa/${id}`)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EtapaList({
  etapas,
  isLoading,
  emptyText,
  danger,
  onOpen,
}: {
  etapas: Etapa[];
  isLoading: boolean;
  emptyText: string;
  danger?: boolean;
  onOpen: (id: string) => void;
}) {
  if (isLoading) return <p className="text-sm text-muted-foreground p-4">A carregar…</p>;
  if (etapas.length === 0)
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </Card>
    );

  return (
    <Card className="overflow-hidden divide-y">
      {etapas.map((e) => {
        const sub = [e.frente?.name, e.responsible?.full_name, e.supplier?.name]
          .filter(Boolean)
          .join(" · ");
        return (
          <button
            key={e.id}
            onClick={() => onOpen(e.id)}
            className={cn(
              "w-full flex items-center gap-3 p-3 hover:bg-muted/40 text-left cursor-pointer",
              danger && "hover:bg-destructive/5"
            )}
          >
            <div
              className="w-1.5 self-stretch rounded-full"
              style={{ backgroundColor: e.frente?.color ?? "#6b7280" }}
            />
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-semibold truncate", danger && "text-destructive")}>
                {e.name}
              </p>
              {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {e.planned_end && (
                <span
                  className={cn(
                    "text-[11px]",
                    danger ? "text-destructive font-medium" : "text-muted-foreground"
                  )}
                >
                  {formatRelative(e.planned_end)}
                </span>
              )}
              <OperacaoStatusBadge status={e.status} />
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        );
      })}
    </Card>
  );
}
