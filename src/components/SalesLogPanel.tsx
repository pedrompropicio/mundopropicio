import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { CalendarDays, AlertTriangle, FileText, Upload, Keyboard, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format, eachDayOfInterval, parseISO, isValid, getISOWeek, getYear, startOfWeek, endOfWeek } from "date-fns";
import { pt } from "date-fns/locale";

interface Props {
  eventId: string;
  lastSalesDate: string | null;
  isEditable: boolean;
}

interface DaySummary {
  date: string;
  dateTo?: string | null;
  quantity: number;
  revenue: number;
  sources: string[];
  hasImport: boolean;
  hasManual: boolean;
  isPeriod: boolean;
  details: DayDetail[];
}

interface DayDetail {
  zone: string;
  lot: string;
  quantity: number;
  unitPrice: number;
  revenue: number;
  source: string;
}

type ViewMode = "totals" | "detail";

export function SalesLogPanel({ eventId, lastSalesDate, isEditable }: Props) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("totals");

  // Fetch ticket_sales with zone/lot info
  const { data: salesByDay = [] } = useQuery({
    queryKey: ["sales-log-daily", eventId],
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id, name")
        .eq("event_id", eventId);
      if (!zones || zones.length === 0) return [];

      const zoneIds = zones.map((z) => z.id);
      const zoneMap = new Map(zones.map((z) => [z.id, z.name]));

      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, price, zone_id, name, lot_type")
        .in("zone_id", zoneIds);
      if (!lots || lots.length === 0) return [];

      const lotIds = lots.map((l) => l.id);
      const lotMap = new Map(lots.map((l) => [l.id, l]));

      const { data: sales } = await supabase
        .from("ticket_sales")
        .select("sale_date, sale_date_to, quantity, unit_price, source, lot_id")
        .in("lot_id", lotIds)
        .order("sale_date", { ascending: true });
      if (!sales) return [];

      // Group by day
      const dayMap = new Map<string, DaySummary>();

      for (const s of sales) {
        const saleDateTo = (s as any).sale_date_to as string | null;
        const isPeriod = !!saleDateTo && saleDateTo !== s.sale_date;
        const key = isPeriod ? `${s.sale_date}_${saleDateTo}` : s.sale_date;

        const lot = lotMap.get(s.lot_id);
        const zoneName = lot ? (zoneMap.get(lot.zone_id) || "—") : "—";
        const lotName = lot ? `${lot.name} (${lot.lot_type})` : "—";

        const detail: DayDetail = {
          zone: zoneName,
          lot: lotName,
          quantity: s.quantity,
          unitPrice: Number(s.unit_price),
          revenue: s.quantity * Number(s.unit_price),
          source: s.source,
        };

        const existing = dayMap.get(key);
        if (existing) {
          existing.quantity += s.quantity;
          existing.revenue += s.quantity * Number(s.unit_price);
          existing.details.push(detail);
          if (s.source === "import" && !existing.hasImport) { existing.hasImport = true; existing.sources.push("Importação"); }
          if (s.source === "manual" && !existing.hasManual) { existing.hasManual = true; existing.sources.push("Manual"); }
        } else {
          const entry: DaySummary = {
            date: s.sale_date,
            dateTo: isPeriod ? saleDateTo : null,
            quantity: s.quantity,
            revenue: s.quantity * Number(s.unit_price),
            sources: [],
            hasImport: false,
            hasManual: false,
            isPeriod,
            details: [detail],
          };
          if (s.source === "import") { entry.hasImport = true; entry.sources.push("Importação"); }
          if (s.source === "manual") { entry.hasManual = true; entry.sources.push("Manual"); }
          if (s.source !== "import" && s.source !== "manual") entry.sources.push(s.source);
          dayMap.set(key, entry);
        }
      }

      return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    },
  });

  // Fetch import logs
  const { data: importLogs = [] } = useQuery({
    queryKey: ["sales-import-logs", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_import_logs")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Compute gaps (days without sales between first and last sale, excluding period-covered days)
  const { gaps, firstDate, lastDate, totalDays, daysWithSales } = useMemo(() => {
    if (salesByDay.length === 0) return { gaps: [] as string[], firstDate: null, lastDate: null, totalDays: 0, daysWithSales: 0 };

    const first = salesByDay[0].date;
    const allLastDates = salesByDay.map((s) => s.dateTo || s.date);
    const last = allLastDates.sort().pop()!;

    // Build set of all covered dates
    const coveredDates = new Set<string>();
    for (const s of salesByDay) {
      if (s.isPeriod && s.dateTo) {
        const from = parseISO(s.date);
        const to = parseISO(s.dateTo);
        if (isValid(from) && isValid(to)) {
          eachDayOfInterval({ start: from, end: to }).forEach((d) =>
            coveredDates.add(format(d, "yyyy-MM-dd"))
          );
        }
      } else {
        coveredDates.add(s.date);
      }
    }

    const firstParsed = parseISO(first);
    const lastParsed = parseISO(last);
    if (!isValid(firstParsed) || !isValid(lastParsed)) return { gaps: [], firstDate: first, lastDate: last, totalDays: 0, daysWithSales: coveredDates.size };

    const allDays = eachDayOfInterval({ start: firstParsed, end: lastParsed });
    const gapDays = allDays
      .map((d) => format(d, "yyyy-MM-dd"))
      .filter((d) => !coveredDates.has(d));

    return { gaps: gapDays, firstDate: first, lastDate: last, totalDays: allDays.length, daysWithSales: coveredDates.size };
  }, [salesByDay]);

  // Update last_sales_date on event
  const updateLastSalesDate = useMutation({
    mutationFn: async () => {
      if (!lastDate) return;
      const { error } = await supabase
        .from("events")
        .update({ last_sales_date: lastDate } as any)
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-detail"] });
    },
  });

  const totalQuantity = salesByDay.reduce((s, d) => s + d.quantity, 0);
  const totalRevenue = salesByDay.reduce((s, d) => s + d.revenue, 0);

  const formatDatePT = (d: string) => {
    try {
      return format(parseISO(d), "dd/MM/yyyy", { locale: pt });
    } catch {
      return d;
    }
  };

  const formatDayOfWeek = (d: string) => {
    try {
      return format(parseISO(d), "EEE", { locale: pt });
    } catch {
      return "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <CalendarDays className="h-4 w-4 text-primary" />
          Log de Vendas
        </button>
        {lastSalesDate && (
          <Badge variant="outline" className="text-xs gap-1">
            <CheckCircle2 className="h-3 w-3 text-success" />
            Último dia: {formatDatePT(lastSalesDate)}
          </Badge>
        )}
      </div>

      {!expanded && salesByDay.length > 0 && (
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>{daysWithSales} dia(s) com vendas</span>
          {gaps.length > 0 && (
            <span className="text-warning flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {gaps.length} dia(s) sem vendas
            </span>
          )}
          <span>{totalQuantity} bilhetes · {formatCurrency(totalRevenue)}</span>
        </div>
      )}

      {expanded && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="glass rounded-lg p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Período</p>
              <p className="text-sm font-semibold mt-0.5">
                {firstDate ? `${formatDatePT(firstDate)} — ${formatDatePT(lastDate!)}` : "Sem vendas"}
              </p>
            </div>
            <div className="glass rounded-lg p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Dias c/ Vendas</p>
              <p className="text-sm font-semibold mt-0.5">{daysWithSales} / {totalDays}</p>
            </div>
            <div className="glass rounded-lg p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Bilhetes</p>
              <p className="text-sm font-semibold mt-0.5">{totalQuantity.toLocaleString("pt-PT")}</p>
            </div>
            <div className="glass rounded-lg p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Receita Bruta</p>
              <p className="text-sm font-semibold text-success mt-0.5">{formatCurrency(totalRevenue)}</p>
            </div>
          </div>

          {/* Last sales date control */}
          {isEditable && lastDate && (
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-3 py-2">
              <div className="text-xs">
                <span className="text-muted-foreground">Último dia de vendas computado: </span>
                <span className="font-semibold">{formatDatePT(lastDate)}</span>
                {lastSalesDate && lastSalesDate !== lastDate && (
                  <span className="text-warning ml-2">(registado: {formatDatePT(lastSalesDate)})</span>
                )}
              </div>
              {(!lastSalesDate || lastSalesDate !== lastDate) && (
                <button
                  onClick={() => updateLastSalesDate.mutate()}
                  disabled={updateLastSalesDate.isPending}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {updateLastSalesDate.isPending ? "A gravar…" : "Atualizar"}
                </button>
              )}
            </div>
          )}

          {/* Gaps warning */}
          {gaps.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-1">
              <p className="text-xs font-semibold text-warning flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {gaps.length} dia(s) sem vendas registadas
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {gaps.map((g) => (
                  <Badge key={g} variant="outline" className="text-[10px] border-warning/30 text-warning">
                    {formatDatePT(g)} ({formatDayOfWeek(g)})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* View mode toggle */}
          {salesByDay.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Vista:</span>
              <div className="inline-flex rounded-md border border-border/50 overflow-hidden">
                <button
                  onClick={() => setViewMode("totals")}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${viewMode === "totals" ? "bg-primary text-primary-foreground" : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"}`}
                >
                  Totais
                </button>
                <button
                  onClick={() => setViewMode("detail")}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${viewMode === "detail" ? "bg-primary text-primary-foreground" : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"}`}
                >
                  Zona / Lote
                </button>
              </div>
            </div>
          )}

          {/* Daily sales table with weekly/monthly subtotals */}
          {salesByDay.length > 0 && (() => {
            // Build rows with week/month subtotal rows interleaved
            type RowItem = { type: "day"; data: DaySummary } | { type: "week"; label: string; qty: number; rev: number } | { type: "month"; label: string; qty: number; rev: number };
            const rows: RowItem[] = [];
            let currentWeekKey = "";
            let currentMonthKey = "";
            let weekQty = 0, weekRev = 0;
            let monthQty = 0, monthRev = 0;

            const getWeekKey = (d: string) => { const p = parseISO(d); return isValid(p) ? `${getYear(p)}-W${String(getISOWeek(p)).padStart(2, "0")}` : ""; };
            const getMonthKey = (d: string) => d.substring(0, 7);
            const getMonthLabel = (d: string) => { const p = parseISO(d + "-01"); return isValid(p) ? format(p, "MMMM yyyy", { locale: pt }) : d; };
            const getWeekLabel = (d: string) => {
              const p = parseISO(d);
              if (!isValid(p)) return d;
              const ws = startOfWeek(p, { weekStartsOn: 1 });
              const we = endOfWeek(p, { weekStartsOn: 1 });
              return `Sem ${getISOWeek(p)} (${format(ws, "dd/MM")} — ${format(we, "dd/MM")})`;
            };

            for (let i = 0; i < salesByDay.length; i++) {
              const day = salesByDay[i];
              const wk = getWeekKey(day.date);
              const mo = getMonthKey(day.date);

              if (currentMonthKey && mo !== currentMonthKey) {
                if (currentWeekKey) {
                  rows.push({ type: "week", label: getWeekLabel(salesByDay[i - 1].date), qty: weekQty, rev: weekRev });
                  weekQty = 0; weekRev = 0;
                }
                rows.push({ type: "month", label: getMonthLabel(currentMonthKey), qty: monthQty, rev: monthRev });
                monthQty = 0; monthRev = 0;
              } else if (currentWeekKey && wk !== currentWeekKey) {
                rows.push({ type: "week", label: getWeekLabel(salesByDay[i - 1].date), qty: weekQty, rev: weekRev });
                weekQty = 0; weekRev = 0;
              }

              currentWeekKey = wk;
              currentMonthKey = mo;
              weekQty += day.quantity; weekRev += day.revenue;
              monthQty += day.quantity; monthRev += day.revenue;
              rows.push({ type: "day", data: day });
            }
            if (currentWeekKey && salesByDay.length > 0) {
              rows.push({ type: "week", label: getWeekLabel(salesByDay[salesByDay.length - 1].date), qty: weekQty, rev: weekRev });
            }
            if (currentMonthKey && salesByDay.length > 0) {
              rows.push({ type: "month", label: getMonthLabel(currentMonthKey), qty: monthQty, rev: monthRev });
            }

            const colSpanTotal = viewMode === "detail" ? 5 : 2;
            const colCount = viewMode === "detail" ? 8 : 5;

            return (
              <div className="glass rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background z-10">
                    <tr className="border-b border-border/50 text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Data</th>
                      <th className="px-3 py-2 text-left font-medium">Dia</th>
                      {viewMode === "detail" && (
                        <>
                          <th className="px-3 py-2 text-left font-medium">Zona</th>
                          <th className="px-3 py-2 text-left font-medium">Lote</th>
                          <th className="px-3 py-2 text-right font-medium">P. Unit.</th>
                        </>
                      )}
                      <th className="px-3 py-2 text-right font-medium">Bilhetes</th>
                      <th className="px-3 py-2 text-right font-medium">Receita</th>
                      <th className="px-3 py-2 text-center font-medium">Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      if (row.type === "week") {
                        return (
                          <tr key={`wk-${idx}`} className="bg-primary/5 border-y border-primary/10">
                            <td className="px-3 py-1.5 text-xs font-semibold text-primary" colSpan={colSpanTotal}>
                              📅 {row.label}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs font-semibold text-primary">{row.qty.toLocaleString("pt-PT")}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs font-semibold text-primary">{formatCurrency(row.rev)}</td>
                            <td />
                          </tr>
                        );
                      }
                      if (row.type === "month") {
                        return (
                          <tr key={`mo-${idx}`} className="bg-accent/10 border-y-2 border-accent/20">
                            <td className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-accent-foreground" colSpan={colSpanTotal}>
                              📊 {row.label}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs font-bold text-accent-foreground">{row.qty.toLocaleString("pt-PT")}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs font-bold text-accent-foreground">{formatCurrency(row.rev)}</td>
                            <td />
                          </tr>
                        );
                      }
                      const day = row.data;

                      if (viewMode === "detail") {
                        // Render one row per zone/lot detail
                        return day.details.map((det, detIdx) => (
                          <tr key={`${day.date}-${detIdx}`} className="border-b border-border/20 hover:bg-secondary/10">
                            {detIdx === 0 ? (
                              <>
                                <td className="px-3 py-1.5 font-mono text-xs" rowSpan={day.details.length}>
                                  {day.isPeriod && day.dateTo ? (
                                    <span className="flex items-center gap-1">
                                      {formatDatePT(day.date)} — {formatDatePT(day.dateTo)}
                                      <Badge variant="outline" className="text-[10px] px-1 py-0 border-primary/30 text-primary ml-1">Período</Badge>
                                    </span>
                                  ) : formatDatePT(day.date)}
                                </td>
                                <td className="px-3 py-1.5 text-xs text-muted-foreground capitalize" rowSpan={day.details.length}>
                                  {day.isPeriod ? "—" : formatDayOfWeek(day.date)}
                                </td>
                              </>
                            ) : null}
                            <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[120px]" title={det.zone}>{det.zone}</td>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[120px]" title={det.lot}>{det.lot}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs">{formatCurrency(det.unitPrice)}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs">{det.quantity.toLocaleString("pt-PT")}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs text-success">{formatCurrency(det.revenue)}</td>
                            <td className="px-3 py-1.5 text-center">
                              {detIdx === 0 && (
                                <div className="flex items-center justify-center gap-1">
                                  {day.hasImport && (
                                    <span title="Importação" className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                      <Upload className="h-2.5 w-2.5" /> Imp
                                    </span>
                                  )}
                                  {day.hasManual && (
                                    <span title="Digitação manual" className="inline-flex items-center gap-0.5 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                      <Keyboard className="h-2.5 w-2.5" /> Man
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ));
                      }

                      // Totals view
                      return (
                        <tr key={day.isPeriod ? `${day.date}_${day.dateTo}` : day.date} className="border-b border-border/20 hover:bg-secondary/10">
                          <td className="px-3 py-1.5 font-mono text-xs">
                            {day.isPeriod && day.dateTo ? (
                              <span className="flex items-center gap-1">
                                {formatDatePT(day.date)} — {formatDatePT(day.dateTo)}
                                <Badge variant="outline" className="text-[10px] px-1 py-0 border-primary/30 text-primary ml-1">Período</Badge>
                              </span>
                            ) : formatDatePT(day.date)}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground capitalize">
                            {day.isPeriod ? "—" : formatDayOfWeek(day.date)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs">{day.quantity.toLocaleString("pt-PT")}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs text-success">{formatCurrency(day.revenue)}</td>
                          <td className="px-3 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {day.hasImport && (
                                <span title="Importação" className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                  <Upload className="h-2.5 w-2.5" /> Imp
                                </span>
                              )}
                              {day.hasManual && (
                                <span title="Digitação manual" className="inline-flex items-center gap-0.5 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  <Keyboard className="h-2.5 w-2.5" /> Man
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border/50 bg-secondary/10 font-semibold text-xs">
                      <td className="px-3 py-2" colSpan={colSpanTotal}>Total Geral</td>
                      <td className="px-3 py-2 text-right font-mono">{totalQuantity.toLocaleString("pt-PT")}</td>
                      <td className="px-3 py-2 text-right font-mono text-success">{formatCurrency(totalRevenue)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}

          {/* Import logs */}
          {importLogs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> Histórico de Importações
              </p>
              <div className="space-y-1">
                {importLogs.map((log: any) => (
                  <div key={log.id} className="flex items-center justify-between rounded-lg border border-border/30 bg-secondary/10 px-3 py-2 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm")}
                      </span>
                      <span className="font-medium">{log.file_name || "Importação"}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {log.import_type === "pdf" ? "PDF" : log.import_type === "manual" ? "Manual" : log.import_type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{log.rows_imported} linhas</span>
                      {log.rows_skipped > 0 && <span className="text-warning">{log.rows_skipped} ignoradas</span>}
                      <span>Período: {formatDatePT(log.period_from)} — {formatDatePT(log.period_to)}</span>
                      {log.report_url && (
                        <a href={log.report_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          Relatório
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {salesByDay.length === 0 && importLogs.length === 0 && (
            <div className="glass rounded-xl p-6 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Sem vendas registadas para este evento.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
