import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Sparkles, User, Filter } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface Props {
  eventId: string;
}

const STATE_LABEL: Record<string, string> = {
  estimado: "Estimado",
  negociacao: "Em negociação",
  fechado: "Fechado",
  pago_parcial: "Pago parcial",
  pago_total: "Pago total",
};

const STATE_DOT: Record<string, string> = {
  estimado: "bg-destructive/70",
  negociacao: "bg-warning",
  fechado: "bg-primary",
  pago_parcial: "bg-success/70",
  pago_total: "bg-success",
};

/**
 * Global formalidade audit log for an event — aggregates transitions across all
 * BP rows. Used inside BPVersionsHistoryModal as a tab. Supports a filter to
 * isolate auto-suggested vs manual changes.
 */
export function FormalidadeAuditTab({ eventId }: Props) {
  const [filter, setFilter] = useState<"all" | "auto" | "manual">("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["formalidade_audit_event", eventId],
    queryFn: async () => {
      // Pull forecast IDs scoped to this event, then their log entries.
      const { data: forecasts, error: fErr } = await supabase
        .from("event_forecasts")
        .select("id, description")
        .eq("event_id", eventId);
      if (fErr) throw fErr;
      const ids = (forecasts ?? []).map((f: any) => f.id);
      if (ids.length === 0) return [] as any[];

      const descMap = new Map<string, string>(
        (forecasts ?? []).map((f: any) => [f.id, f.description ?? ""]),
      );

      const { data, error } = await supabase
        .from("event_forecast_formalidade_log" as any)
        .select("id, forecast_id, from_state, to_state, changed_at, changed_by_label, auto_suggested, reason")
        .in("forecast_id", ids)
        .order("changed_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as any[]).map((e) => ({
        ...e,
        forecast_description: descMap.get(e.forecast_id) ?? "",
      }));
    },
  });

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "auto") return rows.filter((r) => r.auto_suggested);
    return rows.filter((r) => !r.auto_suggested);
  }, [rows, filter]);

  const counts = useMemo(() => {
    const auto = rows.filter((r) => r.auto_suggested).length;
    return { total: rows.length, auto, manual: rows.length - auto };
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          <span>{counts.total} alteração(ões) registadas</span>
          {counts.auto > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">
              <Sparkles className="h-2.5 w-2.5" />
              {counts.auto} auto
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="bg-background border border-border rounded px-1.5 py-0.5 text-xs"
          >
            <option value="all">Todas</option>
            <option value="auto">Apenas auto-sugeridas</option>
            <option value="manual">Apenas manuais</option>
          </select>
        </div>
      </div>

      <ScrollArea className="h-[55vh] pr-2">
        {isLoading ? (
          <div className="space-y-2 py-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-muted/40 animate-pulse rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "Ainda não há alterações de formalidade registadas neste evento."
              : "Nenhuma entrada corresponde ao filtro escolhido."}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((e) => (
              <li
                key={e.id}
                className="rounded-md border border-border bg-card p-2.5 text-xs space-y-1"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-block h-2 w-2 rounded-full ${STATE_DOT[e.from_state ?? ""] ?? "bg-muted"}`} />
                  <span className="text-muted-foreground">
                    {e.from_state ? STATE_LABEL[e.from_state] ?? e.from_state : "—"}
                  </span>
                  <span className="text-muted-foreground/60">→</span>
                  <span className={`inline-block h-2 w-2 rounded-full ${STATE_DOT[e.to_state] ?? "bg-muted"}`} />
                  <span className="font-medium">{STATE_LABEL[e.to_state] ?? e.to_state}</span>
                  {e.auto_suggested && (
                    <span
                      className="inline-flex items-center gap-0.5 rounded bg-primary/10 text-primary px-1 py-0.5 text-[10px]"
                      title="Sugerido pelo sistema e aceite pelo utilizador"
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                      auto
                    </span>
                  )}
                </div>
                <p className="text-foreground/80 line-clamp-1" title={e.forecast_description}>
                  {e.forecast_description || <em className="text-muted-foreground">linha sem descrição</em>}
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>{e.changed_by_label ?? "sistema"}</span>
                  <span>·</span>
                  <span>{format(new Date(e.changed_at), "d MMM yyyy 'às' HH:mm", { locale: pt })}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
