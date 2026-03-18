import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Download, BarChart3 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportPLToPDF, exportPLToExcel } from "@/lib/export-pl";

export type PLMode = "forecast" | "comparison";

interface PLLine {
  label: string;
  forecast: number;
  actual: number;
  variance: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  indent?: boolean;
  subIndent?: boolean;
  isSubTotal?: boolean;
  quantity?: number;
  unitPrice?: number;
}

function buildPL(
  forecasts: any[], transactions: any[], categories: any[],
  ticketZones: any[], ticketLots: any[], ticketSales: any[], eventId: string
): PLLine[] {
  const catMap = Object.fromEntries(categories.map((c: any) => [c.id, c.name]));

  const aggregate = (items: any[]) => {
    const byCat: Record<string, number> = {};
    items.forEach((item) => {
      const name = catMap[item.category_id] ?? "Sem categoria";
      byCat[name] = (byCat[name] ?? 0) + Number(item.amount);
    });
    return byCat;
  };

  // Calculate ticket lot revenue for this event
  const evtZones = ticketZones.filter((z: any) => z.event_id === eventId);
  let ticketForecastRevenue = 0;
  const ticketLines: PLLine[] = [];
  let totalTicketQty = 0;
  let totalTicketActualRevenue = 0;
  if (evtZones.length > 0) {
    evtZones.forEach((zone: any) => {
      const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
      let zoneRevenue = 0;
      let zoneQty = 0;
      let zoneActualRevenue = 0;
      let zoneActualQty = 0;
      zoneLots.forEach((lot: any) => {
        const lotRevenue = Number(lot.price) * Number(lot.quantity);
        const qty = Number(lot.quantity);
        ticketForecastRevenue += lotRevenue;
        zoneRevenue += lotRevenue;
        zoneQty += qty;
        // Actual sales for this lot
        const lotSales = ticketSales.filter((s: any) => s.lot_id === lot.id);
        const lotSoldQty = lotSales.reduce((s: number, sl: any) => s + Number(sl.quantity), 0);
        const lotSoldRevenue = lotSales.reduce((s: number, sl: any) => s + Number(sl.quantity) * Number(sl.unit_price), 0);
        zoneActualRevenue += lotSoldRevenue;
        zoneActualQty += lotSoldQty;
        totalTicketActualRevenue += lotSoldRevenue;
        ticketLines.push({
          label: `${zone.name} — ${lot.name}`,
          forecast: lotRevenue,
          actual: lotSoldRevenue,
          variance: lotSoldRevenue - lotRevenue,
          subIndent: true,
          quantity: qty,
          unitPrice: Number(lot.price),
        });
      });
      totalTicketQty += zoneQty;
      ticketLines.push({
        label: `Subtotal ${zone.name}`,
        forecast: zoneRevenue,
        actual: zoneActualRevenue,
        variance: zoneActualRevenue - zoneRevenue,
        subIndent: true,
        isSubTotal: true,
        quantity: zoneQty,
      });
    });
    ticketLines.push({
      label: `Total Bilheteira`,
      forecast: ticketForecastRevenue,
      actual: totalTicketActualRevenue,
      variance: totalTicketActualRevenue - ticketForecastRevenue,
      subIndent: true,
      isSubTotal: true,
      quantity: totalTicketQty,
    });
  }

  const fInc = forecasts.filter((f) => f.type === "income");
  const fExp = forecasts.filter((f) => f.type === "expense");
  const tInc = transactions.filter((t) => t.type === "income");
  const tExp = transactions.filter((t) => t.type === "expense");

  const fIncByCat = aggregate(fInc);
  const fExpByCat = aggregate(fExp);
  const tIncByCat = aggregate(tInc);
  const tExpByCat = aggregate(tExp);

  // Add ticket lot revenue to Bilheteira category forecast
  if (ticketForecastRevenue > 0) {
    const bilheteiraKey = "Bilheteira";
    fIncByCat[bilheteiraKey] = (fIncByCat[bilheteiraKey] ?? 0) + ticketForecastRevenue;
  }

  const totalFInc = Object.values(fIncByCat).reduce((s, v) => s + v, 0);
  const totalFExp = fExp.reduce((s, f) => s + Number(f.amount), 0);
  const totalTInc = tInc.reduce((s, t) => s + Number(t.amount), 0) + totalTicketActualRevenue;
  const totalTExp = tExp.reduce((s, t) => s + Number(t.amount), 0);

  const allIncCats = [...new Set([...Object.keys(fIncByCat), ...Object.keys(tIncByCat)])].sort();
  const allExpCats = [...new Set([...Object.keys(fExpByCat), ...Object.keys(tExpByCat)])].sort();


  const lines: PLLine[] = [];

  lines.push({ label: "RECEITAS", forecast: totalFInc, actual: totalTInc, variance: totalTInc - totalFInc, isTotal: true });
  allIncCats.forEach((cat) => {
    const f = fIncByCat[cat] ?? 0;
    const a = tIncByCat[cat] ?? 0;
    lines.push({ label: cat, forecast: f, actual: a, variance: a - f, indent: true });
    // Insert ticket lot breakdown after "Venda de Bilhetes"
    if (cat.toLowerCase().includes("bilhete") && ticketLines.length > 0) {
      ticketLines.forEach((tl) => lines.push(tl));
    }
  });

  lines.push({ label: "DESPESAS", forecast: totalFExp, actual: totalTExp, variance: totalTExp - totalFExp, isTotal: true });
  allExpCats.forEach((cat) => {
    const f = fExpByCat[cat] ?? 0;
    const a = tExpByCat[cat] ?? 0;
    lines.push({ label: cat, forecast: f, actual: a, variance: a - f, indent: true });
  });

  const fResult = totalFInc - totalFExp;
  const tResult = totalTInc - totalTExp;
  lines.push({ label: "RESULTADO LÍQUIDO", forecast: fResult, actual: tResult, variance: tResult - fResult, isGrandTotal: true });

  return lines;
}

export default function ReportPL() {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [mode, setMode] = useState<PLMode>("forecast");

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: forecasts = [] } = useQuery({
    queryKey: ["all-forecasts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_forecasts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").in("status", ["approved", "paid"]).order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["account-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketZones = [] } = useQuery({
    queryKey: ["all-ticket-zones"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_zones").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketLots = [] } = useQuery({
    queryKey: ["all-ticket-lots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_lots").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketSales = [] } = useQuery({
    queryKey: ["all-ticket-sales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ticket_sales").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Build proration map
  const subEventParentMap: Record<string, string> = {};
  const subCountByParent: Record<string, number> = {};
  const childrenByParent: Record<string, string[]> = {};
  events.forEach((e: any) => {
    if (e.parent_event_id) {
      subEventParentMap[e.id] = e.parent_event_id;
      subCountByParent[e.parent_event_id] = (subCountByParent[e.parent_event_id] || 0) + 1;
      if (!childrenByParent[e.parent_event_id]) childrenByParent[e.parent_event_id] = [];
      childrenByParent[e.parent_event_id].push(e.id);
    }
  });

  // Mutual exclusion: selecting parent deselects children and vice versa
  const toggleEvent = (id: string) => {
    setSelectedEventIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      let next = [...prev, id];
      const children = childrenByParent[id];
      if (children) {
        next = next.filter((x) => !children.includes(x));
      }
      const parentId = subEventParentMap[id];
      if (parentId) {
        next = next.filter((x) => x !== parentId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedEventIds((prev) => prev.length === events.length ? [] : events.map((e) => e.id));
  };

  const activeEvents = selectedEventIds.length > 0 ? events.filter((e) => selectedEventIds.includes(e.id)) : events;

  // Helper: get effective transactions/forecasts for an event (with proration)
  function getEffectiveData(eventId: string) {
    let evtF = forecasts.filter((f: any) => f.event_id === eventId);
    let evtT = transactions.filter((t: any) => t.event_id === eventId);
    const parentId = subEventParentMap[eventId];
    if (parentId) {
      const siblingCount = subCountByParent[parentId] || 1;
      const parentF = forecasts
        .filter((f: any) => f.event_id === parentId)
        .map((f: any) => ({ ...f, amount: Number(f.amount) / siblingCount }));
      const parentT = transactions
        .filter((t: any) => t.event_id === parentId)
        .map((t: any) => ({ ...t, amount: Number(t.amount) / siblingCount }));
      evtF = [...evtF, ...parentF];
      evtT = [...evtT, ...parentT];
    }
    const children = childrenByParent[eventId];
    if (children && children.length > 0) {
      children.forEach((childId) => {
        const childF = forecasts.filter((f: any) => f.event_id === childId);
        const childT = transactions.filter((t: any) => t.event_id === childId);
        evtF = [...evtF, ...childF];
        evtT = [...evtT, ...childT];
      });
    }
    return { evtF, evtT };
  }

  const eventSummaries = activeEvents.map((e) => {
    const { evtF, evtT } = getEffectiveData(e.id);
    const fInc = evtF.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const fExp = evtF.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const tInc = evtT.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const tExp = evtT.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const evtZones = ticketZones.filter((z: any) => z.event_id === e.id);
    let ticketRev = 0;
    let ticketActualRev = 0;
    evtZones.forEach((zone: any) => {
      const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
      zoneLots.forEach((lot: any) => {
        ticketRev += Number(lot.price) * Number(lot.quantity);
        const lotSales = ticketSales.filter((s: any) => s.lot_id === lot.id);
        ticketActualRev += lotSales.reduce((sum: number, sl: any) => sum + Number(sl.quantity) * Number(sl.unit_price), 0);
      });
    });
    const totalFInc = fInc + ticketRev;
    const totalTInc = tInc + ticketActualRev;
    return {
      ...e,
      fInc: totalFInc, fExp, tInc: totalTInc, tExp,
      fResult: totalFInc - fExp,
      tResult: totalTInc - tExp,
      forecastCount: evtF.length,
      txCount: evtT.length,
    };
  });

  const gFInc = eventSummaries.reduce((s, e) => s + e.fInc, 0);
  const gFExp = eventSummaries.reduce((s, e) => s + e.fExp, 0);
  const gTInc = eventSummaries.reduce((s, e) => s + e.tInc, 0);
  const gTExp = eventSummaries.reduce((s, e) => s + e.tExp, 0);
  const gFResult = gFInc - gFExp;
  const gTResult = gTInc - gTExp;

  const toggle = (id: string) => setExpandedEvent((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-6">
      {/* Mode selector + Event selector */}
      <div className="glass rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium whitespace-nowrap">Tipo de Relatório</label>
          <Select value={mode} onValueChange={(v) => setMode(v as PLMode)}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="forecast">Apenas Previsão</SelectItem>
              <SelectItem value="comparison">Previsão vs Realizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="border-t border-border/30 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Selecionar Eventos</p>
            <button onClick={toggleAll} className="text-xs text-primary hover:underline">
              {selectedEventIds.length === events.length ? "Desmarcar todos" : "Selecionar todos"}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {events.filter((e) => !e.parent_event_id).map((e) => {
              const children = events.filter((c) => c.parent_event_id === e.id);
              const isParent = children.length > 0;
              return (
                <div key={e.id}>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox checked={selectedEventIds.includes(e.id)} onCheckedChange={() => toggleEvent(e.id)} />
                    <span className={isParent ? "font-semibold" : ""}>{e.name}</span>
                    {isParent && <span className="text-xs text-muted-foreground">(consolidado)</span>}
                  </label>
                  {isParent && (
                    <div className="ml-6 mt-1 flex flex-col gap-1">
                      {children.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <Checkbox checked={selectedEventIds.includes(c.id)} onCheckedChange={() => toggleEvent(c.id)} />
                          <span className="text-muted-foreground">↳ {c.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {events.length === 0 && <p className="text-xs text-muted-foreground">Sem eventos registados.</p>}
          </div>
          {selectedEventIds.length === 0 && events.length > 0 && (
            <p className="text-xs text-muted-foreground">Nenhum evento selecionado — a mostrar todos.</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => exportPLToPDF(activeEvents, forecasts, transactions, categories, ticketZones, ticketLots, ticketSales, mode)}
          disabled={activeEvents.length === 0}
          className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive transition-all hover:bg-destructive/20 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Exportar PDF</span>
        </button>
        <button
          onClick={() => exportPLToExcel(activeEvents, forecasts, transactions, categories, ticketZones, ticketLots, ticketSales, mode)}
          disabled={activeEvents.length === 0}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Exportar Excel</span>
        </button>
      </div>

      {/* Global summary cards */}
      <div className={`grid gap-4 sm:grid-cols-2 ${mode === "comparison" ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Receitas Previstas</p>
          <p className="mt-1 text-lg font-bold text-muted-foreground">{formatCurrency(gFInc)}</p>
        </div>
        {mode === "comparison" && (
          <div className="glass rounded-xl p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Receitas Reais</p>
            <p className="mt-1 text-lg font-bold text-success">{formatCurrency(gTInc)}</p>
          </div>
        )}
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resultado Previsto</p>
          <p className={`mt-1 text-lg font-bold ${gFResult >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(gFResult)}</p>
        </div>
        {mode === "comparison" && (
          <div className="glass rounded-xl p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resultado Real</p>
            <p className={`mt-1 text-lg font-bold ${gTResult >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(gTResult)}</p>
          </div>
        )}
      </div>

      {/* Per-event expandable */}
      <div className="space-y-3">
        {eventSummaries.map((evt) => {
          const isOpen = expandedEvent === evt.id;
          const { evtF, evtT } = getEffectiveData(evt.id);
          const pl = isOpen ? buildPL(evtF, evtT, categories, ticketZones, ticketLots, ticketSales, evt.id) : [];

          return (
            <div key={evt.id} className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(evt.id)}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/30"
              >
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <BarChart3 className="h-4 w-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{evt.name}</p>
                  <p className="text-xs text-muted-foreground">{evt.forecastCount} previsões · {evt.txCount} transações</p>
                </div>
                <div className="hidden sm:flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Previsto</p>
                    <span className={`font-mono font-bold ${evt.fResult >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(evt.fResult)}</span>
                  </div>
                  {mode === "comparison" && (
                    <>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Real</p>
                        <span className={`font-mono font-bold ${evt.tResult >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(evt.tResult)}</span>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Variação</p>
                        <span className={`font-mono font-bold ${evt.tResult - evt.fResult >= 0 ? "text-success" : "text-destructive"}`}>
                          {evt.tResult - evt.fResult >= 0 ? "+" : ""}{formatCurrency(evt.tResult - evt.fResult)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border/30 px-4 pb-4">
                  {evtF.length === 0 && evtT.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Sem previsões ou transações para este evento.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                         <TableRow>
                          <TableHead>Rubrica</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Preço Unit. (€)</TableHead>
                          <TableHead className="text-right">Previsto (€)</TableHead>
                          {mode === "comparison" && <TableHead className="text-right">Real (€)</TableHead>}
                          {mode === "comparison" && <TableHead className="text-right">Variação (€)</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pl.map((line, i) => {
                          const rowClass = line.isGrandTotal
                            ? "border-t-2 border-primary/30 bg-primary/5"
                            : line.isTotal ? "bg-secondary/20"
                            : line.isSubTotal ? "bg-muted/20 border-t border-border/20"
                            : line.subIndent ? "bg-muted/10" : "";
                          const labelClass = `${line.subIndent ? "pl-12 text-xs" : line.indent ? "pl-8" : ""} ${line.isSubTotal ? "pl-12 text-xs font-semibold" : ""} ${!line.isSubTotal && line.subIndent ? "italic" : ""} ${line.isTotal || line.isGrandTotal ? "font-bold text-xs uppercase tracking-wider" : "text-sm"}`;
                          const valClass = `text-right font-mono ${line.isGrandTotal ? "text-base font-bold" : line.isTotal ? "font-semibold" : line.isSubTotal ? "text-xs font-semibold" : line.subIndent ? "text-xs text-muted-foreground" : "text-muted-foreground"}`;

                          return (
                            <TableRow key={i} className={rowClass}>
                              <TableCell className={labelClass}>{line.label}</TableCell>
                              <TableCell className={`text-right font-mono ${line.isSubTotal ? "text-xs font-semibold" : line.subIndent ? "text-xs text-muted-foreground" : "text-muted-foreground"}`}>
                                {line.quantity != null ? line.quantity.toLocaleString("pt-PT") : ""}
                              </TableCell>
                              <TableCell className={`text-right font-mono ${line.isSubTotal ? "text-xs font-semibold" : line.subIndent ? "text-xs text-muted-foreground" : "text-muted-foreground"}`}>
                                {line.unitPrice != null ? formatCurrency(line.unitPrice) : ""}
                              </TableCell>
                              <TableCell className={valClass}>{line.subIndent ? formatCurrency(line.forecast) : (line.isGrandTotal ? formatCurrency(line.forecast) : formatCurrency(Math.abs(line.forecast)))}</TableCell>
                              {mode === "comparison" && (
                                <TableCell className={valClass}>{line.subIndent ? (line.actual > 0 ? formatCurrency(line.actual) : "—") : (line.isGrandTotal ? formatCurrency(line.actual) : formatCurrency(Math.abs(line.actual)))}</TableCell>
                              )}
                              {mode === "comparison" && (
                                <TableCell className={`text-right font-mono ${line.isGrandTotal ? "text-base font-bold" : line.isTotal ? "font-semibold" : line.isSubTotal ? "text-xs font-semibold" : line.subIndent ? "text-xs" : ""} ${line.variance >= 0 ? "text-success" : "text-destructive"}`}>
                                  {line.subIndent ? "—" : `${line.variance >= 0 ? "+" : ""}${formatCurrency(line.variance)}`}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {eventSummaries.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">Sem eventos registados.</p>
        )}
      </div>
    </div>
  );
}
