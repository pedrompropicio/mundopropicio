import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function ReportPartnerSettlement() {
  const { data: partners = [], isLoading } = useQuery({
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

  const { data: transactions = [] } = useQuery({
    queryKey: ["settlement-txs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("event_id, type, amount, status, is_transitory, exclude_from_result")
        .in("status", ["approved", "paid"]);
      if (error) throw error;
      return data;
    },
  });

  const { data: extras = [] } = useQuery({
    queryKey: ["settlement-extras"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_partner_extras").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: paidExpenses = [] } = useQuery({
    queryKey: ["settlement-paid-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("partner_id, event_id, transaction_id, transactions(amount)");
      if (error) throw error;
      return data;
    },
  });

  interface SettlementRow {
    partnerId: string;
    partnerName: string;
    eventName: string;
    eventStatus: string;
    percentage: number;
    result: number;
    partnerShare: number;
    extras: number;
    paidExpenses: number;
    settlement: number;
  }

  const settlementData: SettlementRow[] = useMemo(() => {
    return partners.map((p) => {
      const ev = p.events as any;
      if (!ev) return null;
      const supplierName = (p.suppliers as any)?.name ?? "Desconhecido";

      const evTxs = transactions.filter((t) => t.event_id === p.event_id && !t.is_transitory && !t.exclude_from_result);
      const revenue = evTxs.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
      const expense = evTxs.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
      const result = revenue - expense;

      const partnerShare = result * (p.percentage / 100);
      const partnerExtras = extras.filter((e) => e.partner_id === p.id).reduce((s, e) => s + Number(e.amount), 0);
      const partnerPaid = paidExpenses
        .filter((pe) => pe.partner_id === p.id)
        .reduce((s, pe) => s + Number((pe.transactions as any)?.amount ?? 0), 0);

      const settlement = partnerShare - partnerExtras + partnerPaid;

      return {
        partnerId: p.id,
        partnerName: supplierName,
        eventName: ev.name,
        eventStatus: ev.status,
        percentage: p.percentage,
        result,
        partnerShare,
        extras: partnerExtras,
        paidExpenses: partnerPaid,
        settlement,
      } as SettlementRow;
    }).filter(Boolean) as SettlementRow[];
  }, [partners, transactions, extras, paidExpenses]);

  const totals = settlementData.reduce(
    (acc, d: any) => ({
      partnerShare: acc.partnerShare + d.partnerShare,
      extras: acc.extras + d.extras,
      paidExpenses: acc.paidExpenses + d.paidExpenses,
      settlement: acc.settlement + d.settlement,
    }),
    { partnerShare: 0, extras: 0, paidExpenses: 0, settlement: 0 }
  );

  if (isLoading) return <p className="py-8 text-center text-muted-foreground">A carregar…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
              <TableHead className="text-right">Resultado</TableHead>
              <TableHead className="text-right">Quota-Parte</TableHead>
              <TableHead className="text-right">Extras</TableHead>
              <TableHead className="text-right">Desp. Pagas</TableHead>
              <TableHead className="text-right">Acerto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {settlementData.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sem parcerias registadas</TableCell></TableRow>
            ) : settlementData.map((d: any) => (
              <TableRow key={d.partnerId}>
                <TableCell className="font-medium">{d.partnerName}</TableCell>
                <TableCell>
                  {d.eventName}
                  <Badge variant="outline" className="ml-2 text-[10px]">{d.eventStatus}</Badge>
                </TableCell>
                <TableCell className="text-center">{d.percentage}%</TableCell>
                <TableCell className={`text-right font-mono ${d.result >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(d.result)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(d.partnerShare)}</TableCell>
                <TableCell className="text-right font-mono text-warning">{formatCurrency(d.extras)}</TableCell>
                <TableCell className="text-right font-mono text-success">{formatCurrency(d.paidExpenses)}</TableCell>
                <TableCell className={`text-right font-mono font-semibold ${d.settlement >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(d.settlement)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
