import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { History, Sparkles, User } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface Props {
  forecastId: string;
  /** Optional CSS class for the trigger button. */
  className?: string;
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
 * Popover triggered by a small clock icon next to a BP row.
 * Shows the audit history of formalidade transitions for a single forecast,
 * including who changed it, when, and whether it was an auto-suggested change
 * accepted by the user (vs a fully manual change).
 */
export function FormalidadeHistoryPopover({ forecastId, className }: Props) {
  const [open, setOpen] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["formalidade_log", forecastId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecast_formalidade_log" as any)
        .select("id, from_state, to_state, changed_at, changed_by_label, auto_suggested, reason")
        .eq("forecast_id", forecastId)
        .order("changed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`rounded p-1 hover:bg-secondary ${className ?? ""}`}
          title="Histórico de formalidade"
        >
          <History className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b border-border px-3 py-2 flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">Histórico de formalidade</span>
        </div>
        <div className="max-h-72 overflow-auto">
          {isLoading ? (
            <div className="p-3 text-xs text-muted-foreground">A carregar…</div>
          ) : entries.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">
              Sem alterações registadas para esta linha.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id} className="px-3 py-2 text-xs space-y-1">
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
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>{e.changed_by_label ?? "sistema"}</span>
                    <span>·</span>
                    <span>{format(new Date(e.changed_at), "d MMM yyyy 'às' HH:mm", { locale: pt })}</span>
                  </div>
                  {e.reason && (
                    <p className="text-[11px] italic text-muted-foreground">{e.reason}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
