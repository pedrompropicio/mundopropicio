import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, ChevronRight } from "lucide-react";
import { TicketImportModal } from "@/components/TicketUploadModals";
import { format } from "date-fns";

interface Props {
  officeId?: string; // if provided, filter to this office only
}

export function TicketOfficeEventsList({ officeId }: Props) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Get all ticket office assignments (optionally filtered by office)
  const { data: assignments = [] } = useQuery({
    queryKey: ["to_event_assignments", officeId],
    queryFn: async () => {
      let q = supabase
        .from("event_ticket_office_assignments")
        .select("financial_account_id, event_id");
      if (officeId) q = q.eq("financial_account_id", officeId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const eventIds = [...new Set(assignments.map((a: any) => a.event_id))];

  const { data: events = [] } = useQuery({
    queryKey: ["to_events_list", eventIds],
    enabled: eventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, status, event_type")
        .in("id", eventIds)
        .in("status", ["confirmed", "active"])
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Get zones for these events
  const { data: zones = [] } = useQuery({
    queryKey: ["to_event_zones", eventIds],
    enabled: eventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("id, event_id")
        .in("event_id", eventIds);
      if (error) throw error;
      return data || [];
    },
  });

  const zoneIds = zones.map((z: any) => z.id);
  const zoneEventMap = useMemo(() => {
    const map: Record<string, string> = {};
    zones.forEach((z: any) => { map[z.id] = z.event_id; });
    return map;
  }, [zones]);

  // Get sales (include sale_date for period info)
  const { data: sales = [] } = useQuery({
    queryKey: ["to_event_sales", zoneIds],
    enabled: zoneIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("zone_id, quantity, unit_price, financial_account_id, sale_date")
        .in("zone_id", zoneIds);
      if (error) throw error;
      return data || [];
    },
  });

  // Get import logs for all events
  const { data: importLogs = [] } = useQuery({
    queryKey: ["to_import_logs", eventIds],
    enabled: eventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_import_logs")
        .select("event_id, created_at, period_from, period_to")
        .in("event_id", eventIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Get lots for IVA rates
  const { data: lots = [] } = useQuery({
    queryKey: ["to_event_lots", zoneIds],
    enabled: zoneIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_lots")
        .select("id, zone_id, price, iva_rate")
        .in("zone_id", zoneIds);
      if (error) throw error;
      return data || [];
    },
  });

  // Get transactions (expenses) for these events from ticket office accounts
  const officeIds = officeId
    ? [officeId]
    : [...new Set(assignments.map((a: any) => a.financial_account_id))];

  const { data: txns = [] } = useQuery({
    queryKey: ["to_event_txns", eventIds, officeIds],
    enabled: eventIds.length > 0 && officeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("event_id, type, amount, paid_amount, account_id, iva_rate")
        .in("event_id", eventIds)
        .in("account_id", officeIds);
      if (error) throw error;
      return data || [];
    },
  });

  // Build lot price->iva map per zone
  const lotIvaMap = useMemo(() => {
    const map: Record<string, Record<number, number>> = {};
    lots.forEach((l: any) => {
      if (!map[l.zone_id]) map[l.zone_id] = {};
      map[l.zone_id][Number(l.price)] = Number(l.iva_rate || 0);
    });
    return map;
  }, [lots]);

  // Aggregate per event (include sales period from sales data)
  const eventSummaries = useMemo(() => {
    const map: Record<string, { revenue: number; ivaRevenue: number; expenses: number; ivaExpenses: number; qty: number; firstSaleDate: string | null; lastSaleDate: string | null; lastImportDate: string | null; importPeriodFrom: string | null; importPeriodTo: string | null }> = {};
    eventIds.forEach((eid) => { map[eid] = { revenue: 0, ivaRevenue: 0, expenses: 0, ivaExpenses: 0, qty: 0, firstSaleDate: null, lastSaleDate: null, lastImportDate: null, importPeriodFrom: null, importPeriodTo: null }; });

    sales.forEach((s: any) => {
      const eventId = zoneEventMap[s.zone_id];
      if (!eventId || !map[eventId]) return;
      if (officeId && s.financial_account_id && s.financial_account_id !== officeId) return;
      const lineTotal = s.quantity * Number(s.unit_price);
      map[eventId].revenue += lineTotal;
      map[eventId].qty += s.quantity;
      // Track sale date range
      if (s.sale_date) {
        if (!map[eventId].firstSaleDate || s.sale_date < map[eventId].firstSaleDate!) map[eventId].firstSaleDate = s.sale_date;
        if (!map[eventId].lastSaleDate || s.sale_date > map[eventId].lastSaleDate!) map[eventId].lastSaleDate = s.sale_date;
      }
      const zoneIva = lotIvaMap[s.zone_id];
      if (zoneIva) {
        const rate = zoneIva[Number(s.unit_price)] ?? 0;
        if (rate > 0) {
          map[eventId].ivaRevenue += lineTotal - lineTotal / (1 + rate / 100);
        }
      }
    });

    // Attach import log info
    importLogs.forEach((log: any) => {
      if (!log.event_id || !map[log.event_id]) return;
      const entry = map[log.event_id];
      // Last import date = most recent created_at (already sorted desc)
      if (!entry.lastImportDate) entry.lastImportDate = log.created_at;
      // Broadest import period
      if (log.period_from && (!entry.importPeriodFrom || log.period_from < entry.importPeriodFrom)) entry.importPeriodFrom = log.period_from;
      if (log.period_to && (!entry.importPeriodTo || log.period_to > entry.importPeriodTo)) entry.importPeriodTo = log.period_to;
    });

    txns.forEach((t: any) => {
      if (!t.event_id || !map[t.event_id]) return;
      if (t.type === "expense") {
        const expAmount = Number(t.paid_amount || t.amount || 0);
        map[t.event_id].expenses += expAmount;
        const rate = Number(t.iva_rate || 0);
        if (rate > 0) {
          map[t.event_id].ivaExpenses += expAmount - expAmount / (1 + rate / 100);
        }
      }
    });

    return map;
  }, [sales, txns, zoneEventMap, lotIvaMap, eventIds, officeId, importLogs]);

  const totalRevenue = Object.values(eventSummaries).reduce((s, e) => s + e.revenue, 0);
  const totalExpenses = Object.values(eventSummaries).reduce((s, e) => s + e.expenses, 0);
  const totalIvaRevenue = Object.values(eventSummaries).reduce((s, e) => s + e.ivaRevenue, 0);
  const totalIvaExpenses = Object.values(eventSummaries).reduce((s, e) => s + e.ivaExpenses, 0);
  const totalIvaBalance = totalIvaRevenue - totalIvaExpenses;

  if (events.length === 0) {
    return (
      <div className="glass rounded-xl p-6 text-center text-muted-foreground text-sm">
        Nenhum evento associado {officeId ? "a esta bilheteira" : "a bilheteiras"}.
      </div>
    );
  }

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Eventos em Venda</h3>
        <span className="text-xs text-muted-foreground ml-auto">{events.length} evento(s)</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Evento</TableHead>
            <TableHead className="text-right">Receita</TableHead>
            <TableHead className="text-right">Despesas</TableHead>
            <TableHead className="text-right">IVA Rec.</TableHead>
            <TableHead className="text-right">IVA Desp.</TableHead>
            <TableHead className="text-right">Saldo IVA</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((ev: any) => {
            const s = eventSummaries[ev.id] || { revenue: 0, expenses: 0, ivaRevenue: 0, ivaExpenses: 0, qty: 0 };
            const ivaBalance = s.ivaRevenue - s.ivaExpenses;
            return (
              <TableRow
                key={ev.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => { setSelectedEventId(ev.id); setShowImport(true); }}
              >
                <TableCell>
                  <div>
                    <p className="font-medium text-sm truncate max-w-[180px]">{ev.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(ev.date), "dd/MM/yyyy")} · {s.qty} bilhetes
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm font-mono text-emerald-500">{formatCurrency(s.revenue)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm font-mono text-red-400">{formatCurrency(s.expenses)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm font-mono text-muted-foreground">{formatCurrency(s.ivaRevenue)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm font-mono text-muted-foreground">{formatCurrency(s.ivaExpenses)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className={`text-sm font-mono ${ivaBalance >= 0 ? "text-emerald-500" : "text-red-400"}`}>{formatCurrency(ivaBalance)}</span>
                </TableCell>
                <TableCell>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="border-t-2 font-semibold bg-muted/30">
            <TableCell>
              <span className="text-sm">Total</span>
            </TableCell>
            <TableCell className="text-right">
              <span className="text-sm font-mono text-emerald-500">{formatCurrency(totalRevenue)}</span>
            </TableCell>
            <TableCell className="text-right">
              <span className="text-sm font-mono text-red-400">{formatCurrency(totalExpenses)}</span>
            </TableCell>
            <TableCell className="text-right">
              <span className="text-sm font-mono text-muted-foreground">{formatCurrency(totalIvaRevenue)}</span>
            </TableCell>
            <TableCell className="text-right">
              <span className="text-sm font-mono text-muted-foreground">{formatCurrency(totalIvaExpenses)}</span>
            </TableCell>
            <TableCell className="text-right">
              <span className={`text-sm font-mono ${totalIvaBalance >= 0 ? "text-emerald-500" : "text-red-400"}`}>{formatCurrency(totalIvaBalance)}</span>
            </TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>

      <TicketImportModal
        open={showImport}
        onClose={() => { setShowImport(false); setSelectedEventId(null); }}
        selectedEventId={selectedEventId ?? undefined}
      />
    </div>
  );
}
