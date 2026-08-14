import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buildPartnerSettlementReportData } from "@/lib/partner-settlement-report";

export default function ReportPartnerSettlement() {
  const { data: partners = [], isLoading: isLoadingPartners } = useQuery({
    queryKey: ["settlement-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_partners")
        .select("id, event_id, percentage, supplier_id, suppliers(name), events(id, name, status)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // IMPORTANTE: trazer is_transitory para conseguir calcular o crédito transitório
  // (cauções pagas e ainda não devolvidas) — alinhado com PartnerSettlementTab.
  const { data: transactions = [], isLoading: isLoadingTransactions } = useQuery({
    queryKey: ["settlement-txs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, event_id, type, amount, status, is_transitory, exclude_from_result")
        .in("status", ["approved", "paid"]);
      if (error) throw error;
      return data;
    },
  });

  const { data: paidExpenses = [], isLoading: isLoadingPaidExpenses } = useQuery({
    queryKey: ["settlement-paid-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("partner_id, event_id, transaction_id, transactions(amount, is_transitory, type)")
        .eq("status", "approved");
      if (error) throw error;
      return data;
    },
  });

  const { data: partnerAdvances = [], isLoading: isLoadingPartnerAdvances } = useQuery({
    queryKey: ["settlement-partner-advances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_advance_expenses")
        .select("partner_id, event_id, transactions(amount, iva_rate)");
      if (error) throw error;
      return data;
    },
  });

  const { data: events = [], isLoading: isLoadingEvents } = useQuery({
    queryKey: ["settlement-events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name, status, parent_event_id, partner_calc_basis");
      if (error) throw error;
      return data;
    },
  });

  const { data: forecasts = [], isLoading: isLoadingForecasts } = useQuery({
    queryKey: ["settlement-overheads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("event_id, amount, status, is_overhead")
        .eq("is_overhead", true)
        .eq("status", "approved").is("version_id", null);
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketSales = [], isLoading: isLoadingTicketSales } = useQuery({
    queryKey: ["settlement-ticket-sales"],
    queryFn: async () => {
      const { data: zones, error: zonesError } = await supabase
        .from("event_ticket_zones")
        .select("id, event_id");
      if (zonesError) throw zonesError;
      if (!zones || zones.length === 0) return [];

      const zoneIds = zones.map((zone) => zone.id);
      const { data: lots, error: lotsError } = await supabase
        .from("event_ticket_lots")
        .select("id, zone_id, iva_rate")
        .in("zone_id", zoneIds);
      if (lotsError) throw lotsError;
      if (!lots || lots.length === 0) return [];

      const zoneById = new Map(zones.map((zone) => [zone.id, zone.event_id]));
      const lotById = new Map(lots.map((lot) => [lot.id, lot]));
      const { data: sales, error: salesError } = await supabase
        .from("ticket_sales")
        .select("lot_id, quantity, unit_price, total_value")
        .in("lot_id", lots.map((lot) => lot.id));
      if (salesError) throw salesError;

      const aggregates = new Map<string, { eventId: string; gross: number; net: number }>();
      (sales || []).forEach((sale: any) => {
        const lot = lotById.get(sale.lot_id);
        const eventId = lot ? zoneById.get(lot.zone_id) : undefined;
        if (!lot || !eventId) return;
        const gross = sale.total_value != null ? Number(sale.total_value) : Number(sale.quantity || 0) * Number(sale.unit_price || 0);
        const net = gross / (1 + Number(lot.iva_rate || 0) / 100);
        const current = aggregates.get(eventId) ?? { eventId, gross: 0, net: 0 };
        current.gross += gross;
        current.net += net;
        aggregates.set(eventId, current);
      });

      return Array.from(aggregates.values());
    },
  });

  const settlementData = useMemo(
    () => buildPartnerSettlementReportData({
      events: events as any,
      partners: partners as any,
      transactions: transactions as any,
      forecasts: forecasts as any,
      paidExpenses: paidExpenses as any,
      partnerAdvances: partnerAdvances as any,
      ticketSales: ticketSales as any,
    }),
    [events, forecasts, paidExpenses, partnerAdvances, partners, ticketSales, transactions],
  );

  const totals = settlementData.reduce(
    (acc, d: any) => ({
      partnerShare: acc.partnerShare + d.partnerShare,
      extras: acc.extras + d.extras,
      paidExpenses: acc.paidExpenses + d.paidExpenses,
      transitoryCredit: acc.transitoryCredit + d.transitoryCredit,
      resultPendingByCash: acc.resultPendingByCash + d.resultPendingByCash,
      equityContribution: acc.equityContribution + d.equityContribution,
      settlement: acc.settlement + d.settlement,
    }),
    { partnerShare: 0, extras: 0, paidExpenses: 0, transitoryCredit: 0, resultPendingByCash: 0, equityContribution: 0, settlement: 0 }
  );

  const isLoading = isLoadingPartners || isLoadingTransactions || isLoadingPaidExpenses || isLoadingPartnerAdvances || isLoadingEvents || isLoadingForecasts || isLoadingTicketSales;

  if (isLoading) return <p className="py-8 text-center text-muted-foreground">A carregar…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Quota-Parte</p>
          <p className="text-lg font-bold font-mono">{formatCurrency(totals.partnerShare)}</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Extras</p>
          <p className="text-lg font-bold font-mono text-warning">{formatCurrency(totals.extras)}</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Desp. Pagas Sócios</p>
          <p className="text-lg font-bold font-mono text-success">{formatCurrency(totals.paidExpenses)}</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Cauções Pendentes</p>
          <p className="text-lg font-bold font-mono text-accent">{formatCurrency(totals.transitoryCredit)}</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Pend. por Equity</p>
          <p className="text-lg font-bold font-mono text-warning">{formatCurrency(totals.resultPendingByCash)}</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Aportes Necessários</p>
          <p className="text-lg font-bold font-mono text-destructive">{formatCurrency(totals.equityContribution)}</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Acerto Total</p>
          <p className={`text-lg font-bold font-mono ${totals.settlement >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(totals.settlement)}</p>
        </div>
      </div>

      <div className="glass rounded-xl p-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sócio</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead className="text-center">%</TableHead>
              <TableHead className="text-right">Resultado<br/><span className="text-[10px] font-normal text-muted-foreground">(c/ overhead)</span></TableHead>
              <TableHead className="text-right text-warning">Overhead</TableHead>
              <TableHead className="text-right">Quota-Parte</TableHead>
              <TableHead className="text-right">Extras</TableHead>
              <TableHead className="text-right">Desp. Pagas</TableHead>
              <TableHead className="text-right">Cauções (+)</TableHead>
              <TableHead className="text-right">Pend. Equity</TableHead>
              <TableHead className="text-right">Aporte</TableHead>
              <TableHead className="text-right">Acerto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {settlementData.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">Sem parcerias registadas</TableCell></TableRow>
            ) : settlementData.map((d: any) => (
              <TableRow key={d.rowId}>
                <TableCell className="font-medium">{d.partnerName}</TableCell>
                <TableCell>
                  {d.eventName}
                  <Badge variant="outline" className="ml-2 text-[10px]">{d.eventStatus}</Badge>
                </TableCell>
                <TableCell className="text-center">{d.percentage}%</TableCell>
                <TableCell className={`text-right font-mono ${d.result >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(d.result)}</TableCell>
                <TableCell className="text-right font-mono text-warning">{d.overhead > 0 ? formatCurrency(d.overhead) : "—"}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(d.partnerShare)}</TableCell>
                <TableCell className="text-right font-mono text-warning">{formatCurrency(d.extras)}</TableCell>
                <TableCell className="text-right font-mono text-success">{formatCurrency(d.paidExpenses)}</TableCell>
                <TableCell className="text-right font-mono text-accent">{d.transitoryCredit > 0 ? formatCurrency(d.transitoryCredit) : "—"}</TableCell>
                <TableCell className="text-right font-mono text-warning">{d.resultPendingByCash > 0 ? formatCurrency(d.resultPendingByCash) : "—"}</TableCell>
                <TableCell className="text-right font-mono text-destructive">{d.equityContribution > 0 ? formatCurrency(d.equityContribution) : "—"}</TableCell>
                <TableCell className={`text-right font-mono font-semibold ${d.settlement >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(d.settlement)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
