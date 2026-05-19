import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { PhaseBadge } from "@/components/operacao/event/PhaseBadge";
import { Calendar, MapPin } from "lucide-react";

function fmtRange(date?: string | null, endDate?: string | null) {
  if (!date) return "";
  const d = new Date(date);
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  const a = d.toLocaleDateString("pt-PT", opts);
  if (!endDate || endDate === date) return a;
  const e = new Date(endDate);
  return `${a} → ${e.toLocaleDateString("pt-PT", opts)}`;
}

const PHASE_SORT: Record<string, number> = { planning: 0, montagem: 1, evento: 2, post: 3 };

export default function EventListWithPhase() {
  const navigate = useNavigate();
  const { hasPermission, isAdmin } = useAuth();
  const canView = isAdmin || hasPermission("view_operacao");

  const { data: events, isLoading } = useQuery({
    queryKey: ["op-events-list"],
    enabled: canView,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id,name,date,location,operacao_mode,status,company_id")
        .neq("status", "cancelled")
        .order("date", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const ids = useMemo(() => (events ?? []).map((e: any) => e.id), [events]);

  const { data: stats } = useQuery({
    queryKey: ["op-events-stats", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [{ data: etapas }, { data: chamados }] = await Promise.all([
        supabase.from("operacao_etapas").select("id, frente_id, operacao_frentes!inner(event_id)").in("operacao_frentes.event_id" as any, ids),
        supabase.from("operacao_registros").select("id, frente_id, status, kind, operacao_frentes!inner(event_id)").in("operacao_frentes.event_id" as any, ids).eq("kind", "chamado").in("status", ["open", "in_progress"]),
      ]);
      const out: Record<string, { etapas: number; chamados: number }> = {};
      for (const id of ids) out[id] = { etapas: 0, chamados: 0 };
      (etapas ?? []).forEach((r: any) => { const eid = r.operacao_frentes?.event_id; if (eid && out[eid]) out[eid].etapas++; });
      (chamados ?? []).forEach((r: any) => { const eid = r.operacao_frentes?.event_id; if (eid && out[eid]) out[eid].chamados++; });
      return out;
    },
  });

  const sorted = useMemo(() => {
    const list = [...(events ?? [])];
    list.sort((a: any, b: any) => {
      const aOrder = PHASE_SORT[a.operacao_mode] ?? 9;
      const bOrder = PHASE_SORT[b.operacao_mode] ?? 9;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (b.date ?? "").localeCompare(a.date ?? "");
    });
    return list;
  }, [events]);

  if (!canView) return <div className="p-6 text-sm text-muted-foreground">Sem permissão para ver Operação.</div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">Operação — escolhe o evento</h1>
        <p className="text-sm text-muted-foreground mt-1">Selecciona um evento para entrar no Hub operacional.</p>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}

      {!isLoading && sorted.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          Não há eventos para mostrar. Vai a <strong>MP Gestão</strong> para criar.
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sorted.map((e: any) => {
          const s = stats?.[e.id] ?? { etapas: 0, chamados: 0 };
          return (
            <Card
              key={e.id}
              className="p-4 cursor-pointer hover:bg-muted/40 transition-colors glass"
              onClick={() => navigate(`/operacao/${e.id}`)}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold leading-tight">{e.name}</h3>
                <PhaseBadge phase={e.operacao_mode as any} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtRange(e.date)}</span>
                {e.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{e.location}</span>}
              </div>
              <div className="mt-3 flex gap-3 text-[11px]">
                <span className="text-muted-foreground">{s.etapas} etapas</span>
                <span className={s.chamados > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
                  {s.chamados} chamados abertos
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
