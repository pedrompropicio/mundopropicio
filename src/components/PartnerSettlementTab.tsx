import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, UserCheck, TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Props {
  eventId: string;
  eventName: string;
}

interface PartnerSettlement {
  partnerId: string;
  partnerName: string;
  percentage: number;
  expenseIncludesIva: boolean;
  calcBasis: string;
  revenue: number;
  expenses: number;
  result: number;
  partnerShare: number;
  paidExpenses: { description: string; amount: number; date: string; category: string }[];
  totalPaidByPartner: number;
  settlement: number; // positive = company pays partner, negative = partner pays company
}

export function PartnerSettlementTab({ eventId, eventName }: Props) {
  // Event info
  const { data: event } = useQuery({
    queryKey: ["event-detail", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("partner_calc_basis").eq("id", eventId).single();
      if (error) throw error;
      return data;
    },
  });

  // Partners
  const { data: partners = [] } = useQuery({
    queryKey: ["event-partners", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_partners")
        .select("*, suppliers(name)")
        .eq("event_id", eventId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // Event transactions
  const { data: transactions = [] } = useQuery({
    queryKey: ["event-transactions-settlement", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, iva_rate, type, date, status")
        .eq("event_id", eventId);
      if (error) throw error;
      return data;
    },
  });

  // Partner paid expenses
  const { data: paidExpenses = [] } = useQuery({
    queryKey: ["partner-paid-expenses", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("*, event_partners(id, suppliers(name)), transactions(description, amount, iva_rate, date, account_categories(name))")
        .eq("event_id", eventId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // Ticket sales revenue
  const { data: ticketSales = [] } = useQuery({
    queryKey: ["event-ticket-sales-settlement", eventId],
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .eq("event_id", eventId);
      if (!zones || zones.length === 0) return [];
      const zoneIds = zones.map(z => z.id);
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, price, iva_rate, zone_id")
        .in("zone_id", zoneIds);
      if (!lots || lots.length === 0) return [];
      const lotIds = lots.map(l => l.id);
      const { data: sales } = await supabase
        .from("ticket_sales")
        .select("lot_id, quantity, unit_price")
        .in("lot_id", lotIds);
      return (sales || []).map((s: any) => {
        const lot = lots.find((l: any) => l.id === s.lot_id);
        const ivaRate = lot?.iva_rate || 0;
        const gross = s.quantity * s.unit_price;
        const net = gross / (1 + ivaRate / 100);
        return { gross, net, iva: gross - net };
      });
    },
  });

  if (partners.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Sem sócios cadastrados neste evento.
      </div>
    );
  }

  // Calculate financials
  const hasTicketSales = ticketSales.length > 0;
  const ticketRevenueGross = ticketSales.reduce((s: number, t: any) => s + t.gross, 0);
  const ticketRevenueNet = ticketSales.reduce((s: number, t: any) => s + t.net, 0);

  const incomeTransactions = transactions.filter((t: any) => t.type === "income");
  const expenseTransactions = transactions.filter((t: any) => t.type === "expense");

  const totalRevenueNet = hasTicketSales
    ? ticketRevenueNet
    : incomeTransactions.reduce((s: number, t: any) => s + Number(t.amount) / (1 + Number(t.iva_rate) / 100), 0);
  const totalRevenueGross = hasTicketSales
    ? ticketRevenueGross
    : incomeTransactions.reduce((s: number, t: any) => s + Number(t.amount), 0);

  const totalExpensesNet = expenseTransactions.reduce((s: number, t: any) => s + Number(t.amount) / (1 + Number(t.iva_rate) / 100), 0);
  const totalExpensesGross = expenseTransactions.reduce((s: number, t: any) => s + Number(t.amount), 0);

  const calcBasis = event?.partner_calc_basis || "net";

  // Build settlements
  const settlements: PartnerSettlement[] = partners.map((p: any) => {
    const revenue = calcBasis === "net" ? totalRevenueNet : totalRevenueGross;
    const expenses = p.expense_includes_iva ? totalExpensesGross : totalExpensesNet;
    const result = revenue - expenses;
    const partnerShare = result * (Number(p.percentage) / 100);

    const partnerExpenses = paidExpenses
      .filter((pe: any) => pe.partner_id === p.id)
      .map((pe: any) => ({
        description: pe.transactions?.description || "—",
        amount: Number(pe.transactions?.amount || 0),
        date: pe.transactions?.date || "",
        category: pe.transactions?.account_categories?.name || "—",
      }));
    const totalPaidByPartner = partnerExpenses.reduce((s, e) => s + e.amount, 0);

    // Settlement: positive = company owes partner
    // If profit: partner receives partnerShare + totalPaidByPartner
    // If loss: partner owes |partnerShare| but already paid totalPaidByPartner, so settlement = partnerShare + totalPaidByPartner
    const settlement = partnerShare + totalPaidByPartner;

    return {
      partnerId: p.id,
      partnerName: p.suppliers?.name || "—",
      percentage: Number(p.percentage),
      expenseIncludesIva: p.expense_includes_iva,
      calcBasis,
      revenue,
      expenses,
      result,
      partnerShare,
      paidExpenses: partnerExpenses,
      totalPaidByPartner,
      settlement,
    };
  });

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 16;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Fecho de Contas — ${eventName}`, margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Data: ${format(new Date(), "dd/MM/yyyy")}`, margin, y);
    doc.text(`Base de cálculo: ${calcBasis === "net" ? "Sem IVA" : "Com IVA"}`, pageW / 2, y);
    y += 8;

    // Summary table
    autoTable(doc, {
      startY: y,
      head: [["", "Receita", "Despesas", "Resultado"]],
      body: [[
        "Evento",
        formatCurrency(calcBasis === "net" ? totalRevenueNet : totalRevenueGross),
        formatCurrency(calcBasis === "net" ? totalExpensesNet : totalExpensesGross),
        formatCurrency((calcBasis === "net" ? totalRevenueNet : totalRevenueGross) - (calcBasis === "net" ? totalExpensesNet : totalExpensesGross)),
      ]],
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [41, 41, 41] },
    });

    y = (doc as any).lastAutoTable.finalY + 8;

    // Per-partner sections
    for (const s of settlements) {
      if (y > 170) { doc.addPage(); y = 16; }

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`${s.partnerName} (${s.percentage}%)`, margin, y);
      y += 6;

      // Partner summary
      const summaryRows = [
        ["Participação no resultado", formatCurrency(s.partnerShare)],
        ["Despesas pagas pelo sócio", formatCurrency(s.totalPaidByPartner)],
        ["Saldo do encontro de contas", formatCurrency(s.settlement)],
      ];

      autoTable(doc, {
        startY: y,
        body: summaryRows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" } },
        theme: "plain",
      });

      y = (doc as any).lastAutoTable.finalY + 4;

      // Partner expenses detail
      if (s.paidExpenses.length > 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        doc.text("Detalhe das despesas pagas pelo sócio:", margin, y);
        y += 4;

        autoTable(doc, {
          startY: y,
          head: [["Descrição", "Categoria", "Data", "Valor"]],
          body: s.paidExpenses.map(e => [
            e.description,
            e.category,
            e.date ? format(new Date(e.date), "dd/MM/yyyy") : "",
            formatCurrency(e.amount),
          ]),
          foot: [["Total", "", "", formatCurrency(s.totalPaidByPartner)]],
          margin: { left: margin + 4, right: margin },
          styles: { fontSize: 8 },
          headStyles: { fillColor: [80, 80, 80] },
          footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
          columnStyles: { 3: { halign: "right" } },
        });

        y = (doc as any).lastAutoTable.finalY + 6;
      }

      // Settlement direction
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      const direction = s.settlement > 0
        ? `→ Empresa deve pagar ${formatCurrency(s.settlement)} ao sócio`
        : s.settlement < 0
          ? `→ Sócio deve pagar ${formatCurrency(Math.abs(s.settlement))} à empresa`
          : "→ Sem saldo pendente";
      doc.text(direction, margin, y);
      y += 10;
    }

    doc.save(`Fecho_${eventName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-bold">Encontro de Contas</h3>
        </div>
        <Button size="sm" variant="outline" onClick={exportPdf}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar PDF
        </Button>
      </div>

      {/* Global summary */}
      <div className="glass rounded-xl p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Receita ({calcBasis === "net" ? "s/IVA" : "c/IVA"})</p>
            <p className="text-xl font-bold font-mono text-success">{formatCurrency(calcBasis === "net" ? totalRevenueNet : totalRevenueGross)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Despesas</p>
            <p className="text-xl font-bold font-mono text-destructive">{formatCurrency(calcBasis === "net" ? totalExpensesNet : totalExpensesGross)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Resultado</p>
            <p className={`text-xl font-bold font-mono ${(calcBasis === "net" ? totalRevenueNet - totalExpensesNet : totalRevenueGross - totalExpensesGross) >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency((calcBasis === "net" ? totalRevenueNet - totalExpensesNet : totalRevenueGross - totalExpensesGross))}
            </p>
          </div>
        </div>
      </div>

      {/* Per-partner cards */}
      {settlements.map((s) => (
        <div key={s.partnerId} className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50 bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              <span className="font-semibold">{s.partnerName}</span>
              <Badge variant="outline" className="text-xs">{s.percentage}%</Badge>
            </div>
            <div className="flex items-center gap-2">
              {s.settlement > 0 ? (
                <Badge className="bg-success/15 text-success text-xs">
                  <TrendingUp className="h-3 w-3 mr-1" /> Empresa paga {formatCurrency(s.settlement)}
                </Badge>
              ) : s.settlement < 0 ? (
                <Badge className="bg-destructive/15 text-destructive text-xs">
                  <TrendingDown className="h-3 w-3 mr-1" /> Sócio paga {formatCurrency(Math.abs(s.settlement))}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">Sem saldo</Badge>
              )}
            </div>
          </div>

          <div className="p-4 space-y-3">
            {/* Summary row */}
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Participação no resultado</span>
                <p className={`font-mono font-bold ${s.partnerShare >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(s.partnerShare)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Despesas pagas pelo sócio</span>
                <p className="font-mono font-bold">{formatCurrency(s.totalPaidByPartner)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Saldo final</span>
                <p className={`font-mono font-bold text-lg ${s.settlement >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(s.settlement)}</p>
              </div>
            </div>

            {/* Expenses detail */}
            {s.paidExpenses.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Despesas pagas pelo sócio:</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.paidExpenses.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{e.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.category}</TableCell>
                        <TableCell className="text-xs font-mono">{e.date ? format(new Date(e.date), "dd/MM/yyyy") : ""}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(e.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-border bg-muted/30">
                      <TableCell colSpan={3} className="font-bold text-xs">Total</TableCell>
                      <TableCell className="text-right font-mono font-bold">{formatCurrency(s.totalPaidByPartner)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}

            {s.paidExpenses.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Sem despesas pagas por este sócio registadas.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
