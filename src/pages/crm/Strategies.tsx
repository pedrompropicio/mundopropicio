import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Plus, Loader2, Target, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/strategy-status";

type StrategyRow = {
  id: string;
  name: string;
  event_id: string | null;
  goal_revenue_eur: number;
  status: string;
  generated_at: string | null;
  created_at: string;
  detected_artist: string | null;
};

const statusStyles: Record<string, string> = {
  draft: "bg-muted/40 text-muted-foreground border-border",
  generated: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  in_progress: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  completed: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  archived: "bg-muted/40 text-muted-foreground border-border opacity-60",
};



function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "agora mesmo";
  if (m < 60) return `há ${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  return `há ${d}d`;
}

export default function CrmStrategies() {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-strategies-list"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_strategies")
        .select("id, name, event_id, goal_revenue_eur, status, generated_at, created_at, detected_artist")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const strategies = (data ?? []) as StrategyRow[];

      const eventIds = Array.from(new Set(strategies.map((s) => s.event_id).filter(Boolean))) as string[];
      let eventsMap = new Map<string, { id: string; name: string; date: string | null }>();
      if (eventIds.length) {
        const { data: events } = await supabase
          .from("events")
          .select("id, name, date")
          .in("id", eventIds);
        for (const e of events ?? []) eventsMap.set(e.id, e as any);
      }
      return strategies.map((s) => ({ ...s, event: s.event_id ? eventsMap.get(s.event_id) ?? null : null }));
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <Brain className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Estratégias de Campanha</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Planos de campanha gerados por IA com base em metas de receita e contexto Meta
            </p>
          </div>
        </div>
        <Button
          onClick={() => navigate("/audience/strategies/new")}
          className="bg-cyan-500 hover:bg-cyan-600 text-white"
        >
          <Plus className="h-4 w-4 mr-2" /> Nova estratégia
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar estratégias…
        </div>
      )}

      {error && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 text-sm text-destructive">
          {(error as Error).message}
        </Card>
      )}

      {!isLoading && data && data.length === 0 && (
        <Card className="p-10 text-center border-dashed">
          <Brain className="h-10 w-10 text-cyan-400 mx-auto mb-3 opacity-70" />
          <h3 className="text-lg font-medium mb-1">Ainda não tens estratégias</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Cria a primeira para começar a planear campanhas com IA.
          </p>
          <Button
            onClick={() => navigate("/audience/strategies/new")}
            className="bg-cyan-500 hover:bg-cyan-600 text-white"
          >
            <Plus className="h-4 w-4 mr-2" /> Criar primeira estratégia
          </Button>
        </Card>
      )}

      {data && data.length > 0 && (
        <div className="grid gap-3">
          {data.map((s) => (
            <Card
              key={s.id}
              onClick={() => navigate(`/audience/strategies/${s.id}`)}
              className="p-4 cursor-pointer transition-all hover:border-cyan-500/30 hover:bg-cyan-500/[0.02]"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium truncate">{s.name}</h3>
                    <Badge variant="outline" className={cn("text-[10px] uppercase", statusStyles[s.status] ?? statusStyles.draft)}>
                      {statusLabel(s.status)}
                    </Badge>
                    {s.detected_artist && (
                      <span className="text-xs text-muted-foreground">· 🎤 {s.detected_artist}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5" />
                      Meta:{" "}
                      <span className="text-foreground font-medium">
                        {Number(s.goal_revenue_eur).toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                      </span>
                    </span>
                    {s.event && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {s.event.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {s.generated_at ? `Gerada ${timeAgo(s.generated_at)}` : `Criada ${timeAgo(s.created_at)}`}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
