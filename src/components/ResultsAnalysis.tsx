import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { Download, TrendingUp, TrendingDown, Target, BarChart3, Users, Ticket, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface CompletedResult {
  id: string;
  name: string;
  date: string;
  totalIncome: number;
  totalExpense: number;
  margin: number;
  marginPct: number;
  totalPartnerPct: number;
  companyShare: number;
  hasPartners: boolean;
  incomeSource: "transactions" | "ticket_sales";
  expenseSource: "transactions";
}

interface ActiveProjection {
  id: string;
  name: string;
  date: string;
  bpIncome100: number;
  bpExpense: number;
  margin100: number;
  margin80: number;
  breakEvenPct: number;
  actualIncome: number;
  actualExpense: number;
  actualMargin: number;
  actualMarginPct: number;
  totalPartnerPct: number;
  companyMargin100: number;
  companyActualMargin: number;
  incomeSource: "lot_projection" | "ticket_sales";
  expenseSource: "forecasts" | "transactions";
}

const sourceLabels: Record<string, { label: string; icon: "ticket" | "file" }> = {
  ticket_sales: { label: "Vendas", icon: "ticket" },
  lot_projection: { label: "Projeção Lotes", icon: "ticket" },
  transactions: { label: "Transações", icon: "file" },
  forecasts: { label: "BP", icon: "file" },
};

function SourceBadge({ source }: { source: string }) {
  const info = sourceLabels[source] ?? { label: source, icon: "file" };
  return (
    <Badge variant="outline" className="text-[9px] px-1 py-0 gap-0.5 font-normal text-muted-foreground">
      {info.icon === "ticket" ? <Ticket className="h-2.5 w-2.5" /> : <FileText className="h-2.5 w-2.5" />}
      {info.label}
    </Badge>
  );
}

export function ResultsAnalysis() {
  const currentYear = new Date().getFullYear();

  const { data: events = [] } = useQuery({
    queryKey: ["ra_events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, status, event_type, parent_event_id, partner_calc_basis")
        .order("date");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["ra_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, event_id, type, amount, status, is_transitory, exclude_from_result");
      if (error) throw error;
      return data;
    },
  });

  const { data: forecasts = [] } = useQuery({
    queryKey: ["ra_forecasts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, event_id, type, amount, is_transitory, exclude_from_result");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketSales = [] } = useQuery({
    queryKey: ["ra_ticket_sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("*, event_ticket_zones(event_id)");
      if (error) throw error;
      return data;
    },
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["ra_partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_partners")
        .select("event_id, percentage, loss_percentage, suppliers(name)");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketLots = [] } = useQuery({
    queryKey: ["ra_ticket_lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_lots")
        .select("id, quantity, price, zone_id, event_ticket_zones(event_id)");
      if (error) throw error;
      return data;
    },
  });

  const { completed, active, yearTotals } = useMemo(() => {
    // Build maps
    // Projected revenue from ticket lots (capacity × price)
    const lotRevenueMap: Record<string, number> = {};
    ticketLots.forEach((lot: any) => {
      const eventId = lot.event_ticket_zones?.event_id;
      if (!eventId) return;
      lotRevenueMap[eventId] = (lotRevenueMap[eventId] || 0) + Number(lot.quantity) * Number(lot.price);
    });
    const txnMap: Record<string, { income: number; expense: number }> = {};
    transactions.forEach((t: any) => {
      if (!t.event_id || t.is_transitory || t.exclude_from_result) return;
      if (!txnMap[t.event_id]) txnMap[t.event_id] = { income: 0, expense: 0 };
      if (t.type === "income") txnMap[t.event_id].income += Number(t.amount);
      else txnMap[t.event_id].expense += Number(t.amount);
    });

    // Add ticket sales to txnMap income
    const salesByEvent: Record<string, number> = {};
    ticketSales.forEach((ts: any) => {
      const eventId = ts.event_ticket_zones?.event_id;
      if (!eventId) return;
      salesByEvent[eventId] = (salesByEvent[eventId] || 0) + Number(ts.quantity) * Number(ts.unit_price);
    });
    Object.entries(salesByEvent).forEach(([eid, rev]) => {
      if (!txnMap[eid]) txnMap[eid] = { income: 0, expense: 0 };
      txnMap[eid].income += rev;
    });

    const forecastMap: Record<string, { income: number; expense: number }> = {};
    forecasts.forEach((f: any) => {
      if (f.is_transitory || f.exclude_from_result) return;
      if (!forecastMap[f.event_id]) forecastMap[f.event_id] = { income: 0, expense: 0 };
      if (f.type === "income") forecastMap[f.event_id].income += Number(f.amount);
      else forecastMap[f.event_id].expense += Number(f.amount);
    });

    const partnerMap: Record<string, { totalPct: number; items: any[] }> = {};
    partners.forEach((p: any) => {
      if (!partnerMap[p.event_id]) partnerMap[p.event_id] = { totalPct: 0, items: [] };
      partnerMap[p.event_id].totalPct += Number(p.percentage);
      partnerMap[p.event_id].items.push(p);
    });

    // Filter events for current year, exclude parent (multi_day) to avoid double counting
    const yearEvents = events.filter(
      (e: any) => new Date(e.date).getFullYear() === currentYear && e.event_type !== "multi_day"
    );

    const completed: CompletedResult[] = [];
    const active: ActiveProjection[] = [];

    const today = new Date().toISOString().slice(0, 10);

    yearEvents.forEach((e: any) => {
      const income = txnMap[e.id]?.income ?? 0;
      const expense = txnMap[e.id]?.expense ?? 0;
      const margin = income - expense;
      const totalPartnerPct = partnerMap[e.id]?.totalPct ?? 0;
      const companyPct = 100 - totalPartnerPct;
      const hasSales = (salesByEvent[e.id] ?? 0) > 0;

      if (e.status === "completed") {
        completed.push({
          id: e.id,
          name: e.name,
          date: e.date,
          totalIncome: income,
          totalExpense: expense,
          margin,
          marginPct: income > 0 ? (margin / income) * 100 : 0,
          totalPartnerPct,
          companyShare: margin * (companyPct / 100),
          hasPartners: totalPartnerPct > 0,
          incomeSource: hasSales ? "ticket_sales" : "transactions",
          expenseSource: "transactions",
        });
      } else if (e.status === "active" || e.status === "confirmed") {
        // Projections always use planning data (lots + BP)
        const bpIncome = lotRevenueMap[e.id] ?? 0;
        const bpExpense = forecastMap[e.id]?.expense ?? 0;
        const margin100 = bpIncome - bpExpense;
        const margin80 = bpIncome * 0.8 - bpExpense;
        const breakEvenPct = bpIncome > 0 ? (bpExpense / bpIncome) * 100 : 0;

        active.push({
          id: e.id,
          name: e.name,
          date: e.date,
          bpIncome100: bpIncome,
          bpExpense: bpExpense,
          margin100,
          margin80,
          breakEvenPct: Math.min(breakEvenPct, 999),
          actualIncome: income,
          actualExpense: expense,
          actualMargin: margin,
          actualMarginPct: income > 0 ? (margin / income) * 100 : 0,
          totalPartnerPct,
          companyMargin100: margin100 * (companyPct / 100),
          companyActualMargin: margin * (companyPct / 100),
          incomeSource: "lot_projection",
          expenseSource: "forecasts",
        });
      }
    });

    completed.sort((a, b) => a.date.localeCompare(b.date));
    active.sort((a, b) => a.date.localeCompare(b.date));

    const yearTotals = {
      income: completed.reduce((s, e) => s + e.totalIncome, 0),
      expense: completed.reduce((s, e) => s + e.totalExpense, 0),
      margin: completed.reduce((s, e) => s + e.margin, 0),
      companyShare: completed.reduce((s, e) => s + e.companyShare, 0),
    };

    return { completed, active, yearTotals };
  }, [events, transactions, forecasts, ticketSales, partners, ticketLots, currentYear]);

  const generatePdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.text(`Análise de Resultados ${currentYear}`, 14, 18);
    doc.setFontSize(9);
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-PT")}`, 14, 24);

    let y = 30;

    // --- Completed events ---
    if (completed.length > 0) {
      doc.setFontSize(12);
      doc.text("Eventos Concluídos", 14, y);
      y += 2;

      autoTable(doc, {
        startY: y,
        head: [["Evento", "Data", "Receitas", "Despesas", "Margem", "Margem %", "Sócios %", "Parte Empresa"]],
        body: [
          ...completed.map((e) => [
            e.name,
            formatDate(e.date),
            formatCurrency(e.totalIncome),
            formatCurrency(e.totalExpense),
            formatCurrency(e.margin),
            `${e.marginPct.toFixed(1)}%`,
            e.hasPartners ? `${e.totalPartnerPct.toFixed(0)}%` : "—",
            formatCurrency(e.companyShare),
          ]),
          [
            { content: `TOTAL ${currentYear}`, styles: { fontStyle: "bold" } },
            "",
            { content: formatCurrency(yearTotals.income), styles: { fontStyle: "bold" } },
            { content: formatCurrency(yearTotals.expense), styles: { fontStyle: "bold" } },
            { content: formatCurrency(yearTotals.margin), styles: { fontStyle: "bold" } },
            yearTotals.income > 0
              ? `${((yearTotals.margin / yearTotals.income) * 100).toFixed(1)}%`
              : "—",
            "",
            { content: formatCurrency(yearTotals.companyShare), styles: { fontStyle: "bold" } },
          ],
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 128, 105] },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // --- Active events ---
    if (active.length > 0) {
      if (y > 160) {
        doc.addPage();
        y = 18;
      }
      doc.setFontSize(12);
      doc.text("Eventos Ativos — Projeções", 14, y);
      y += 2;

      autoTable(doc, {
        startY: y,
        head: [["Evento", "Data", "BP Receita", "BP Despesa", "Margem 100%", "Margem 80%", "Break-Even", "Receita Real", "Despesa Real", "Margem Real"]],
        body: active.map((e) => [
          e.name,
          formatDate(e.date),
          formatCurrency(e.bpIncome100),
          formatCurrency(e.bpExpense),
          formatCurrency(e.margin100),
          formatCurrency(e.margin80),
          `${e.breakEvenPct.toFixed(1)}%`,
          formatCurrency(e.actualIncome),
          formatCurrency(e.actualExpense),
          formatCurrency(e.actualMargin),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] },
        margin: { left: 14, right: 14 },
      });
    }

    doc.save(`analise-resultados-${currentYear}.pdf`);
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Análise de Resultados {currentYear}
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={generatePdf}>
          <Download className="h-4 w-4 mr-1" />
          PDF
        </Button>
      </div>

      {/* --- COMPLETED --- */}
      {completed.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-success" />
            Eventos Concluídos
          </h3>
          <div className="overflow-x-auto glass rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 text-left font-medium">Evento</th>
                  <th className="p-3 text-left font-medium hidden md:table-cell">Data</th>
                  <th className="p-3 text-right font-medium">Receitas</th>
                  <th className="p-3 text-right font-medium">Despesas</th>
                  <th className="p-3 text-right font-medium">Margem</th>
                  <th className="p-3 text-right font-medium hidden lg:table-cell">Margem %</th>
                  <th className="p-3 text-right font-medium">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 ml-auto">
                          <Users className="h-3 w-3" /> Empresa
                        </TooltipTrigger>
                        <TooltipContent>Parte da margem que cabe à empresa, descontando a participação dos sócios</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {completed.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <a href={`/eventos/${e.id}`} className="font-medium hover:text-primary transition-colors">
                        {e.name}
                      </a>
                    </td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell">{formatDate(e.date)}</td>
                    <td className="p-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-mono text-success">{formatCurrency(e.totalIncome)}</span>
                        <SourceBadge source={e.incomeSource} />
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-mono text-warning">{formatCurrency(e.totalExpense)}</span>
                        <SourceBadge source={e.expenseSource} />
                      </div>
                    </td>
                    <td className={`p-3 text-right font-mono font-semibold ${e.margin >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(e.margin)}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground hidden lg:table-cell">
                      {e.marginPct.toFixed(1)}%
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {e.hasPartners && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {e.totalPartnerPct.toFixed(0)}% sócios
                          </Badge>
                        )}
                        <span className={`font-mono font-semibold ${e.companyShare >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(e.companyShare)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border/60 bg-muted/20 font-semibold text-xs uppercase">
                  <td className="p-3" colSpan={2}>Total {currentYear}</td>
                  <td className="p-3 text-right font-mono text-success">{formatCurrency(yearTotals.income)}</td>
                  <td className="p-3 text-right font-mono text-warning">{formatCurrency(yearTotals.expense)}</td>
                  <td className={`p-3 text-right font-mono ${yearTotals.margin >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(yearTotals.margin)}
                  </td>
                  <td className="p-3 text-right font-mono text-muted-foreground hidden lg:table-cell">
                    {yearTotals.income > 0 ? `${((yearTotals.margin / yearTotals.income) * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className={`p-3 text-right font-mono ${yearTotals.companyShare >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(yearTotals.companyShare)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* --- ACTIVE PROJECTIONS --- */}
      {active.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-primary" />
            Eventos Ativos — Projeções
          </h3>
          <div className="overflow-x-auto glass rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 text-left font-medium" rowSpan={2}>Evento</th>
                  <th className="p-3 text-center font-medium border-b border-border/30" colSpan={4}>Projeção</th>
                  <th className="p-3 text-center font-medium border-b border-border/30 border-l-2 border-l-border" colSpan={4}>Resultado Real</th>
                </tr>
                <tr className="border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="p-2 text-right font-medium">Margem 100%</th>
                  <th className="p-2 text-right font-medium">Margem 80%</th>
                  <th className="p-2 text-right font-medium">Break-Even</th>
                  <th className="p-2 text-right font-medium hidden lg:table-cell">Empresa</th>
                  <th className="p-2 text-right font-medium border-l-2 border-l-border">Receita</th>
                  <th className="p-2 text-right font-medium">Despesa</th>
                  <th className="p-2 text-right font-medium">Margem</th>
                  <th className="p-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {active.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <a href={`/eventos/${e.id}`} className="font-medium hover:text-primary transition-colors">
                        {e.name}
                      </a>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{formatDate(e.date)}</span>
                        <SourceBadge source={e.incomeSource} />
                        <SourceBadge source={e.expenseSource} />
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`font-mono ${e.margin100 >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(e.margin100)}
                        </span>
                        {e.totalPartnerPct > 0 && (
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">
                              Empresa {(100 - e.totalPartnerPct).toFixed(0)}%
                            </Badge>
                            <span className={`font-mono text-xs ${e.companyMargin100 >= 0 ? "text-success" : "text-destructive"}`}>
                              {formatCurrency(e.companyMargin100)}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`font-mono ${e.margin80 >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(e.margin80)}
                        </span>
                        {e.totalPartnerPct > 0 && (() => {
                          const companyPct = 100 - e.totalPartnerPct;
                          const companyMargin80 = e.margin80 * (companyPct / 100);
                          return (
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">
                                Empresa {companyPct.toFixed(0)}%
                              </Badge>
                              <span className={`font-mono text-xs ${companyMargin80 >= 0 ? "text-success" : "text-destructive"}`}>
                                {formatCurrency(companyMargin80)}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <Badge
                        variant={e.breakEvenPct <= 70 ? "default" : e.breakEvenPct <= 90 ? "secondary" : "destructive"}
                        className="font-mono text-xs"
                      >
                        {e.breakEvenPct.toFixed(1)}%
                      </Badge>
                    </td>
                    <td className={`p-3 text-right font-mono hidden lg:table-cell ${e.companyMargin100 >= 0 ? "text-success" : "text-destructive"}`}>
                      {e.totalPartnerPct > 0 ? formatCurrency(e.companyMargin100) : "—"}
                    </td>
                    <td className="p-3 text-right font-mono text-success border-l-2 border-l-border">{formatCurrency(e.actualIncome)}</td>
                    <td className="p-3 text-right font-mono text-warning">{formatCurrency(e.actualExpense)}</td>
                    <td className="p-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`font-mono font-semibold ${e.actualMargin >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(e.actualMargin)}
                        </span>
                        {e.totalPartnerPct > 0 && (
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">
                              Empresa {(100 - e.totalPartnerPct).toFixed(0)}%
                            </Badge>
                            <span className={`font-mono text-xs ${e.companyActualMargin >= 0 ? "text-success" : "text-destructive"}`}>
                              {formatCurrency(e.companyActualMargin)}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className={`p-3 text-right font-mono text-xs ${e.actualMargin >= 0 ? "text-success" : "text-destructive"}`}>
                      {e.actualMarginPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {completed.length === 0 && active.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Sem dados de resultados para {currentYear}.
        </p>
      )}
    </section>
  );
}
