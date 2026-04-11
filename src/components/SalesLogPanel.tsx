import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { CalendarDays, AlertTriangle, FileText, Upload, Keyboard, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format, eachDayOfInterval, parseISO, isValid } from "date-fns";
import { pt } from "date-fns/locale";

interface Props {
  eventId: string;
  lastSalesDate: string | null;
  isEditable: boolean;
}

interface DaySummary {
  date: string;
  quantity: number;
  revenue: number;
  sources: string[];
  hasImport: boolean;
  hasManual: boolean;
}

export function SalesLogPanel({ eventId, lastSalesDate, isEditable }: Props) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  // Fetch ticket_sales grouped by sale_date
  const { data: salesByDay = [] } = useQuery({
    queryKey: ["sales-log-daily", eventId],
    queryFn: async () => {
      // Get all zones for this event
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .eq("event_id", eventId);
      if (!zones || zones.length === 0) return [];

      const zoneIds = zones.map((z) => z.id);

      // Get all lots for these zones
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, price, zone_id")
        .in("zone_id", zoneIds);
      if (!lots || lots.length === 0) return [];

      const lotIds = lots.map((l) => l.id);
      const lotPriceMap = Object.fromEntries(lots.map((l) => [l.id, Number(l.price)]));

      // Get all sales for these lots
      const { data: sales } = await supabase
        .from("ticket_sales")
        .select("sale_date, quantity, unit_price, source, lot_id")
        .in("lot_id", lotIds)
        .order("sale_date", { ascending: true });
      if (!sales) return [];

      // Group by day
      const dayMap = new Map<string, DaySummary>();
      for (const s of sales) {
        const key = s.sale_date;
        const existing = dayMap.get(key) || { date: key, quantity: 0, revenue: 0, sources: [], hasImport: false, hasManual: false };
        existing.quantity += s.quantity;
        existing.revenue += s.quantity * Number(s.unit_price);
        if (s.source === "import" && !existing.hasImport) { existing.hasImport = true; existing.sources.push("Importação"); }
        if (s.source === "manual" && !existing.hasManual) { existing.hasManual = true; existing.sources.push("Manual"); }
        if (s.source !== "import" && s.source !== "manual" && !existing.sources.includes(s.source)) existing.sources.push(s.source);
        dayMap.set(key, existing);
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

  // Compute gaps (days without sales between first and last sale)
  const { gaps, firstDate, lastDate, totalDays, daysWithSales } = useMemo(() => {
    if (salesByDay.length === 0) return { gaps: [] as string[], firstDate: null, lastDate: null, totalDays: 0, daysWithSales: 0 };

    const first = salesByDay[0].date;
    const last = salesByDay[salesByDay.length - 1].date;
    const salesDates = new Set(salesByDay.map((s) => s.date));

    const firstParsed = parseISO(first);
    const lastParsed = parseISO(last);
    if (!isValid(firstParsed) || !isValid(lastParsed)) return { gaps: [], firstDate: first, lastDate: last, totalDays: 0, daysWithSales: salesByDay.length };

    const allDays = eachDayOfInterval({ start: firstParsed, end: lastParsed });
    const gapDays = allDays
      .map((d) => format(d, "yyyy-MM-dd"))
      .filter((d) => !salesDates.has(d));

    return { gaps: gapDays, firstDate: first, lastDate: last, totalDays: allDays.length, daysWithSales: salesByDay.length };
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

          {/* Daily sales table */}
          {salesByDay.length > 0 && (
            <div className="glass rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Data</th>
                    <th className="px-3 py-2 text-left font-medium">Dia</th>
                    <th className="px-3 py-2 text-right font-medium">Bilhetes</th>
                    <th className="px-3 py-2 text-right font-medium">Receita</th>
                    <th className="px-3 py-2 text-center font-medium">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {salesByDay.map((day) => (
                    <tr key={day.date} className="border-b border-border/20 hover:bg-secondary/10">
                      <td className="px-3 py-1.5 font-mono text-xs">{formatDatePT(day.date)}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground capitalize">{formatDayOfWeek(day.date)}</td>
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
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border/50 bg-secondary/10 font-semibold text-xs">
                    <td className="px-3 py-2" colSpan={2}>Total</td>
                    <td className="px-3 py-2 text-right font-mono">{totalQuantity.toLocaleString("pt-PT")}</td>
                    <td className="px-3 py-2 text-right font-mono text-success">{formatCurrency(totalRevenue)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

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
