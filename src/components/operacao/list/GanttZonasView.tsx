import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfDay,
} from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GanttFrente {
  id: string;
  name: string;
  color: string | null;
}

interface Props {
  scopedFrenteIds: string[];
  frentesById: Map<string, GanttFrente>;
  eventDateMax?: string | null;
  onEtapaClick: (etapaId: string) => void;
}

interface EtapaRow {
  id: string;
  name: string;
  status: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  has_no_date: boolean | null;
  frente_id: string;
}

const STATUS_BAR: Record<string, { bg: string; border: string; text: string; label: string }> = {
  pending:     { bg: "bg-slate-400/60",  border: "border-l-slate-500",   text: "text-slate-50",     label: "Pendente"   },
  in_progress: { bg: "bg-blue-500",      border: "border-l-blue-700",   text: "text-white",         label: "Em curso"   },
  blocked:     { bg: "bg-orange-500",    border: "border-l-orange-700", text: "text-white",         label: "Bloqueada"  },
  done:        { bg: "bg-emerald-500",   border: "border-l-emerald-700",text: "text-white",         label: "Concluída"  },
  cancelled:   { bg: "bg-slate-300/40",  border: "border-l-slate-400", text: "text-slate-600",      label: "Cancelada"  },
};

const HARD_LIMIT = 500;

function parseDay(s?: string | null): Date | null {
  if (!s) return null;
  try {
    return startOfDay(parseISO(s.length === 10 ? `${s}T00:00:00` : s));
  } catch {
    return null;
  }
}

export function GanttZonasView({ scopedFrenteIds, frentesById, eventDateMax, onEtapaClick }: Props) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["gantt-etapas", scopedFrenteIds.join(",")],
    enabled: scopedFrenteIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operacao_etapas")
        .select(
          "id, name, status, planned_start, planned_end, actual_start, actual_end, has_no_date, frente_id",
        )
        .in("frente_id", scopedFrenteIds)
        .limit(HARD_LIMIT + 1);
      if (error) throw error;
      return (data ?? []) as EtapaRow[];
    },
  });

  const etapas = data ?? [];
  const overLimit = etapas.length > HARD_LIMIT;
  const etapasUsed = overLimit ? etapas.slice(0, HARD_LIMIT) : etapas;

  const { withDates, withoutDates, minDate, maxDate, pxPerDay, totalDays, todayOffsetPx } = useMemo(() => {
    const today = startOfDay(new Date());
    const withDates: Array<EtapaRow & { startD: Date; endD: Date }> = [];
    const withoutDates: EtapaRow[] = [];

    for (const e of etapasUsed) {
      const ps = parseDay(e.planned_start);
      const pe = parseDay(e.planned_end);
      if (e.has_no_date || (!ps && !pe)) {
        withoutDates.push(e);
        continue;
      }
      const startD = ps ?? pe!;
      const endD = pe ?? ps!;
      withDates.push({ ...e, startD, endD });
    }

    let min: Date = today;
    let max: Date = addDays(today, 7);
    if (withDates.length > 0) {
      min = withDates.reduce((acc, e) => (e.startD < acc ? e.startD : acc), withDates[0].startD);
      max = withDates.reduce((acc, e) => (e.endD > acc ? e.endD : acc), withDates[0].endD);
    }
    if (eventDateMax) {
      const ed = parseDay(eventDateMax);
      if (ed && ed > max) max = ed;
    }
    // Buffer ±1 dia
    min = addDays(min, -1);
    max = addDays(max, 1);

    const totalDays = Math.max(1, differenceInCalendarDays(max, min) + 1);
    let pxPerDay = 60;
    if (totalDays > 90) pxPerDay = 16;
    else if (totalDays > 30) pxPerDay = 24;
    else if (totalDays > 14) pxPerDay = 40;

    const todayDelta = differenceInCalendarDays(today, min);
    const todayOffsetPx =
      todayDelta >= 0 && todayDelta <= totalDays - 1 ? todayDelta * pxPerDay + pxPerDay / 2 : null;

    return { withDates, withoutDates, minDate: min, maxDate: max, pxPerDay, totalDays, todayOffsetPx };
  }, [etapasUsed, eventDateMax]);

  // Agrupar por frente, preservando ordem dos frentes recebidos
  const grouped = useMemo(() => {
    const map = new Map<string, Array<EtapaRow & { startD: Date; endD: Date }>>();
    scopedFrenteIds.forEach((fid) => map.set(fid, []));
    withDates.forEach((e) => {
      if (!map.has(e.frente_id)) map.set(e.frente_id, []);
      map.get(e.frente_id)!.push(e);
    });
    // ordenar etapas por startD
    for (const list of map.values()) {
      list.sort((a, b) => a.startD.getTime() - b.startD.getTime());
    }
    return Array.from(map.entries()).filter(([, list]) => list.length > 0);
  }, [withDates, scopedFrenteIds]);

  const totalWidth = totalDays * pxPerDay;

  // Header de dias
  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < totalDays; i++) arr.push(addDays(minDate, i));
    return arr;
  }, [minDate, totalDays]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
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

  if (etapas.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Sem etapas neste evento.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {overLimit && (
          <Alert className="mx-3 mt-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Vista limitada a {HARD_LIMIT} etapas. Filtra por estado ou tipo para reduzir.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex border-y bg-card">
          {/* Coluna esquerda sticky */}
          <div className="w-40 md:w-56 shrink-0 border-r bg-card">
            <div className="h-10 border-b px-3 flex items-center text-[11px] font-semibold uppercase text-muted-foreground">
              Zona / Serviço
            </div>
            {grouped.map(([fid, list]) => {
              const f = frentesById.get(fid);
              return (
                <div key={fid} className="border-b last:border-b-0">
                  <div className="px-3 py-1.5 flex items-center gap-2 bg-muted/40">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: f?.color ?? "#6b7280" }}
                    />
                    <span className="text-xs font-semibold truncate">{f?.name ?? "—"}</span>
                  </div>
                  {list.map((e) => (
                    <div
                      key={e.id}
                      className="px-3 py-1 text-[11px] text-muted-foreground truncate h-8 flex items-center"
                      title={e.name}
                    >
                      {e.name}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Coluna direita scrollável */}
          <div className="flex-1 overflow-x-auto">
            <div style={{ width: totalWidth }} className="relative">
              {/* Header de dias */}
              <div className="h-10 border-b flex sticky top-0 bg-card z-10">
                {days.map((d, i) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={i}
                      style={{ width: pxPerDay }}
                      className={cn(
                        "shrink-0 border-r text-[10px] text-center flex flex-col justify-center",
                        isWeekend && "bg-muted/30",
                      )}
                    >
                      <div className="text-muted-foreground">
                        {format(d, pxPerDay >= 40 ? "EEE" : "EE", { locale: pt })}
                      </div>
                      <div className="font-medium">
                        {format(d, pxPerDay >= 40 ? "d MMM" : "d/M", { locale: pt })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Linhas */}
              {grouped.map(([fid, list]) => (
                <div key={fid} className="border-b last:border-b-0 relative">
                  {/* Header de zona vazio (alinhar com sidebar) */}
                  <div className="h-7 bg-muted/40 relative">
                    {/* grid de dias subtle */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {days.map((d, i) => {
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        return (
                          <div
                            key={i}
                            style={{ width: pxPerDay }}
                            className={cn("shrink-0 border-r border-border/40", isWeekend && "bg-background/40")}
                          />
                        );
                      })}
                    </div>
                  </div>
                  {list.map((e) => {
                    const startDelta = differenceInCalendarDays(e.startD, minDate);
                    const spanDays = differenceInCalendarDays(e.endD, e.startD) + 1;
                    const left = startDelta * pxPerDay;
                    const width = Math.max(8, spanDays * pxPerDay - 2);
                    const c = STATUS_BAR[e.status] ?? STATUS_BAR.pending;
                    const showText = pxPerDay >= 24 && width >= 80;
                    return (
                      <div key={e.id} className="h-8 relative">
                        {/* grid */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {days.map((d, i) => {
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                            return (
                              <div
                                key={i}
                                style={{ width: pxPerDay }}
                                className={cn("shrink-0 border-r border-border/40", isWeekend && "bg-muted/20")}
                              />
                            );
                          })}
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => onEtapaClick(e.id)}
                              style={{ left, width }}
                              className={cn(
                                "absolute top-1 bottom-1 rounded-sm border-l-4 px-1.5 text-[10px] font-medium overflow-hidden text-left transition hover:brightness-110",
                                c.bg,
                                c.border,
                                c.text,
                              )}
                            >
                              {showText && <span className="truncate block leading-6">{e.name}</span>}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs space-y-0.5">
                            <div className="font-semibold">{e.name}</div>
                            <div className="text-muted-foreground">
                              {format(e.startD, "d MMM", { locale: pt })}
                              {" → "}
                              {format(e.endD, "d MMM", { locale: pt })}
                            </div>
                            <div>{c.label}</div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Linha vertical Hoje */}
              {todayOffsetPx !== null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500/70 pointer-events-none z-20"
                  style={{ left: todayOffsetPx }}
                >
                  <div className="absolute -top-0 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1 rounded">
                    HOJE
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {withoutDates.length > 0 && (
          <div className="mx-3 mb-3 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase px-1">
              <CalendarOff className="h-3.5 w-3.5" />
              Etapas sem datas ({withoutDates.length})
            </div>
            {(() => {
              const groupedNoDates = new Map<string, EtapaRow[]>();
              withoutDates.forEach((e) => {
                const list = groupedNoDates.get(e.frente_id) ?? [];
                list.push(e);
                groupedNoDates.set(e.frente_id, list);
              });
              const sortedGroups = Array.from(groupedNoDates.entries()).sort(([aId], [bId]) => {
                const fa = frentesById.get(aId);
                const fb = frentesById.get(bId);
                return (fa?.name ?? "").localeCompare(fb?.name ?? "", "pt-PT");
              });
              return sortedGroups.map(([frenteId, list]) => {
                const f = frentesById.get(frenteId);
                return (
                  <div key={frenteId} className="rounded-md border bg-card overflow-hidden">
                    <div className="px-3 py-2 bg-muted/40 border-b flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: f?.color ?? "#6b7280" }}
                      />
                      <span className="text-xs font-semibold truncate">{f?.name ?? "—"}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                        {list.length} {list.length === 1 ? "etapa" : "etapas"}
                      </span>
                    </div>
                    <div className="divide-y">
                      {list.map((e) => {
                        const c = STATUS_BAR[e.status] ?? STATUS_BAR.pending;
                        return (
                          <button
                            key={e.id}
                            onClick={() => onEtapaClick(e.id)}
                            className="w-full px-3 py-2.5 text-left hover:bg-muted/40 flex items-center gap-2 min-h-[44px]"
                          >
                            <span className="font-medium text-sm flex-1 truncate">{e.name}</span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded shrink-0", c.bg, c.text)}>
                              {c.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}

      </div>
    </TooltipProvider>
  );
}
