import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CalendarOff, User as UserIcon, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GanttFrente } from "./GanttZonasView";

// Mantido em sync com STATUS_BAR do GanttZonasView (TODO: extrair para src/lib/operacao-status-colors.ts)
const STATUS_BAR: Record<string, { bg: string; text: string; label: string }> = {
  pending:     { bg: "bg-slate-400/60",  text: "text-slate-50",    label: "Pendente"   },
  in_progress: { bg: "bg-blue-500",      text: "text-white",       label: "Em curso"   },
  blocked:     { bg: "bg-orange-500",    text: "text-white",       label: "Bloqueada"  },
  done:        { bg: "bg-emerald-500",   text: "text-white",       label: "Concluída"  },
  cancelled:   { bg: "bg-slate-300/40",  text: "text-slate-600",   label: "Cancelada"  },
};

interface Props {
  scopedFrenteIds: string[];
  frentesById: Map<string, GanttFrente>;
  selectedFrenteIds: string[];
  onEtapaClick: (etapaId: string) => void;
}

interface EtapaRow {
  id: string;
  name: string;
  status: string;
  planned_start: string | null;
  planned_end: string | null;
  has_no_date: boolean | null;
  created_at: string | null;
  frente_id: string;
  responsible: { id: string; full_name: string | null } | null;
  supplier: { id: string; name: string | null } | null;
}

function fmtRange(start: string | null, end: string | null): string | null {
  const s = start ? parseISO(start.length === 10 ? `${start}T00:00:00` : start) : null;
  const e = end ? parseISO(end.length === 10 ? `${end}T00:00:00` : end) : null;
  if (!s && !e) return null;
  const fmt = (d: Date) => format(d, "d MMM HH:mm", { locale: pt });
  if (s && e) return `${fmt(s)} → ${fmt(e)}`;
  return fmt((s ?? e)!);
}

export function ZonasListaView({
  scopedFrenteIds,
  frentesById,
  selectedFrenteIds,
  onEtapaClick,
}: Props) {
  const activeIds = selectedFrenteIds.length > 0 ? selectedFrenteIds : scopedFrenteIds;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["zonas-lista-etapas", activeIds.join(",")],
    enabled: activeIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operacao_etapas")
        .select(
          `id, name, status, planned_start, planned_end, has_no_date, created_at, frente_id,
           responsible:profiles!operacao_etapas_responsible_profile_id_fkey(id, full_name),
           supplier:suppliers!operacao_etapas_supplier_id_fkey(id, name)`,
        )
        .in("frente_id", activeIds)
        .order("planned_start", { ascending: true, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as EtapaRow[];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, EtapaRow[]>();
    activeIds.forEach((id) => map.set(id, []));
    (data ?? []).forEach((e) => {
      if (!map.has(e.frente_id)) map.set(e.frente_id, []);
      map.get(e.frente_id)!.push(e);
    });
    // Ordenar dentro de cada zona: com planned_start ASC, depois sem planned_start por created_at ASC
    for (const list of map.values()) {
      list.sort((a, b) => {
        const aHas = !!a.planned_start && !a.has_no_date;
        const bHas = !!b.planned_start && !b.has_no_date;
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        if (aHas && bHas) {
          return (a.planned_start ?? "").localeCompare(b.planned_start ?? "");
        }
        return (a.created_at ?? "").localeCompare(b.created_at ?? "");
      });
    }
    // Preservar a ordem de activeIds (que segue accumulated), mas remover sem etapas? Mostrar zonas vazias também.
    return Array.from(map.entries());
  }, [data, activeIds]);

  if (isLoading) {
    return (
      <div className="space-y-3 p-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{(error as any)?.message ?? "Erro a carregar etapas."}</AlertDescription>
      </Alert>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Sem zonas / serviços para mostrar.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      {grouped.map(([fid, list]) => {
        const f = frentesById.get(fid);
        return (
          <div key={fid} className="rounded-md border bg-card overflow-hidden">
            <div className="px-3 py-2.5 bg-muted/40 border-b flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: f?.color ?? "#6b7280" }}
              />
              <span className="text-sm font-semibold truncate">{f?.name ?? "—"}</span>
              <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
                {list.length} {list.length === 1 ? "etapa" : "etapas"}
              </span>
            </div>
            {list.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                Sem etapas
              </div>
            ) : (
              <div className="divide-y">
                {list.map((e) => {
                  const c = STATUS_BAR[e.status] ?? STATUS_BAR.pending;
                  const range =
                    e.has_no_date ? null : fmtRange(e.planned_start, e.planned_end);
                  const responsavel = e.responsible?.full_name?.trim();
                  const supplier = e.supplier?.name?.trim();
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onEtapaClick(e.id)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/40 min-h-[44px] flex flex-col gap-1"
                    >
                      <div className="flex items-start gap-2">
                        <span className="font-medium text-sm flex-1 min-w-0 break-words">
                          {e.name}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded shrink-0",
                            c.bg,
                            c.text,
                          )}
                        >
                          {c.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {range ? (
                          <span>{range}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <CalendarOff className="h-3 w-3" /> Sem datas
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <UserIcon className="h-3 w-3" />
                          {responsavel || "Sem responsável"}
                        </span>
                        {supplier && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {supplier}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
