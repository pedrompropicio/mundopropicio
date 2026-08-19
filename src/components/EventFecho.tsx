import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileBarChart2, TrendingUp, TrendingDown, ArrowRightLeft, Users, Layers } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { calcTotalWithIva, roundCents } from "@/lib/iva";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import HelpTooltip from "@/components/HelpTooltip";
import { expandOverheadToSplits } from "@/lib/overhead-proration";
import {
  getPartnerCalcBasisLabel,
  normalizePartnerCalcBasis,
  usesGrossExpenseAmounts,
} from "@/lib/partner-calc-basis";

interface Props {
  eventId: string;
  eventName: string;
  /** IDs dos sub-eventos quando este é um Master de turnê (vazio em evento simples) */
  childEventIds?: string[];
  /** Se for sub-evento, ID do Master para puxar overhead via Master ÷N */
  parentEventId?: string | null;
}

/**
 * Vista sintética de Fecho do Evento.
 *
 * Estrutura:
 *  • Receita (s/IVA e c/IVA) — vinda de transações income do evento (ou ticket sales se houver)
 *  • Despesas operacionais (não-overhead) — soma de transações expense
 *  • Resultado SEM overhead (receita - despesas op.)
 *  • Overheads — receitas e despesas com is_overhead=true (linha do evento + fatia ÷N do Master)
 *  • Resultado COM overhead — referência interna; NÃO é o resultado da empresa (overhead exclui)
 *  • Acerto com Sócios — quota de cada sócio sobre resultado SEM overhead + extras + pago-por-sócio
 *
 * Nota fiscal: Overhead tem `exclude_from_result=true`, portanto não impacta o resultado
 * contabilístico da empresa. A coluna "c/ overhead" é apenas para o cálculo do acerto.
 */
export function EventFecho({ eventId, eventName, childEventIds, parentEventId }: Props) {
  // ---- Eventos relevantes (master + filhos quando turnê)
  const allEventIds = [eventId, ...(childEventIds || [])];

  // ---- Sócios deste evento (ou pai, se sub-evento)
  const partnersSourceId = parentEventId || eventId;
  const { data: partners = [] } = useQuery({
    queryKey: ["fecho-partners", partnersSourceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_partners")
        .select("*, suppliers(name)")
        .eq("event_id", partnersSourceId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // ---- Calc basis
  const { data: eventInfo } = useQuery({
    queryKey: ["fecho-event-info", partnersSourceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("partner_calc_basis")
        .eq("id", partnersSourceId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // ---- Transações (income + expense) — apenas do evento (não Master se sub) ou master+filhos
  // IMPORTANTE: aplicar os mesmos filtros do PartnerSettlementTab para que os dois fechos coincidam.
  // Filtro canónico em `@/lib/fecho-filters` (ver .lovable/memory/features/fecho-filter-parity.md):
  //   status ∈ {approved, paid} · !is_transitory · !exclude_from_result · reversed_at IS NULL · !is_hidden
  const { data: transactions = [] } = useQuery({
    queryKey: ["fecho-transactions", allEventIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, type, amount, iva_rate, status, description, is_transitory, exclude_from_result, reversed_at, is_hidden, account_categories(name, code)")
        .in("event_id", allEventIds)
        .in("status", ["approved", "paid"]);
      if (error) throw error;
      return (data || []).filter((t: any) => isValidFechoTransaction(t));
    },
  });

  // ---- Forecasts overhead (do próprio evento + filhos)
  const { data: ownOverheads = [] } = useQuery({
    queryKey: ["fecho-overheads", allEventIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, event_id, type, amount, iva_rate, description, account_categories(code, name)")
        .in("event_id", allEventIds)
        .eq("is_overhead", true).is("version_id", null);
      if (error) throw error;
      return data || [];
    },
  });

  // ---- Overhead via Master (quando este evento é Split)
  const { data: masterOverheadSlice = [] } = useQuery({
    queryKey: ["fecho-overhead-via-master", parentEventId, eventId],
    queryFn: async () => {
      if (!parentEventId) return [] as any[];
      const { data: siblings, error: sErr } = await supabase
        .from("events")
        .select("id")
        .eq("parent_event_id", parentEventId);
      if (sErr) throw sErr;
      const n = (siblings ?? []).length || 1;
      const { data: oh, error: ohErr } = await supabase
        .from("event_forecasts")
        .select("id, event_id, type, amount, iva_rate, description, account_categories(code, name)")
        .eq("event_id", parentEventId)
        .eq("is_overhead", true).is("version_id", null);
      if (ohErr) throw ohErr;
      return (oh ?? []).map((o: any) => ({
        ...o,
        id: `${o.id}::split::${eventId}`,
        amount: Number(o.amount) / n,
        _via_master: true,
      }));
    },
    enabled: !!parentEventId,
  });

  // ---- Ticket sales (preferência sobre income transactions se houver)
  const { data: ticketSales = [] } = useQuery({
    queryKey: ["fecho-ticket-sales", allEventIds],
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .in("event_id", allEventIds);
      if (!zones || zones.length === 0) return [];
      const zoneIds = zones.map(z => z.id);
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, iva_rate")
        .in("zone_id", zoneIds);
      if (!lots || lots.length === 0) return [];
      const { data: sales } = await supabase
        .from("ticket_sales")
        .select("lot_id, quantity, unit_price, total_value")
        .in("lot_id", lots.map(l => l.id));
      return (sales || []).map((s: any) => {
        const lot = lots.find((l: any) => l.id === s.lot_id);
        const ivaRate = lot?.iva_rate || 0;
        const gross = s.total_value != null ? Number(s.total_value) : Number(s.quantity) * Number(s.unit_price);
        const net = gross / (1 + ivaRate / 100);
        return { gross, net };
      });
    },
  });

  // ---- Despesas pagas por sócios
  const { data: paidByPartners = [] } = useQuery({
    queryKey: ["fecho-paid-by-partners", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("partner_id, transactions(amount, iva_rate)")
        .eq("event_id", eventId)
        .eq("status", "approved");
      if (error) throw error;
      return data || [];
    },
  });

  // ---- Extras de sócios (custos analíticos sem cash)
  const { data: partnerExtras = [] } = useQuery({
    queryKey: ["fecho-partner-extras", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_partner_extras")
        .select("partner_id, amount, description")
        .eq("event_id", eventId);
      if (error) throw error;
      return data || [];
    },
  });

  // ============= Cálculos =============
  // Política do Fecho com Sócios: respeita `partner_calc_basis` do evento.
  //   • net_result_gross_expenses (default) → Receita NET, Despesas GROSS (c/ IVA)
  //   • gross_revenue                       → Receita GROSS, Despesas idem
  //   • net (raro)                          → ambos NET
  // Esta lógica é INDEPENDENTE da Análise de Resultados do Dashboard, que é sempre NET.
  const calcBasis = normalizePartnerCalcBasis(eventInfo?.partner_calc_basis);
  const useGrossExpenses = usesGrossExpenseAmounts(calcBasis);

  // Receita: ticket sales se houver, senão income transactions
  const incomeTx = transactions.filter((t: any) => t.type === "income");
  const expenseTx = transactions.filter((t: any) => t.type === "expense");

  const hasTickets = ticketSales.length > 0;
  const revenueNet = hasTickets
    ? ticketSales.reduce((s, t: any) => s + t.net, 0)
    : incomeTx.reduce((s, t: any) => s + Number(t.amount), 0);
  const revenueGross = hasTickets
    ? ticketSales.reduce((s, t: any) => s + t.gross, 0)
    : incomeTx.reduce((s, t: any) => s + calcTotalWithIva(Number(t.amount), Number(t.iva_rate || 0)), 0);

  const expenseNet = expenseTx.reduce((s, t: any) => s + Number(t.amount), 0);
  const expenseGross = expenseTx.reduce(
    (s, t: any) => s + calcTotalWithIva(Number(t.amount), Number(t.iva_rate || 0)),
    0,
  );

  const revenue = calcBasis === "gross_revenue" ? revenueGross : revenueNet;
  const expensesOp = useGrossExpenses ? expenseGross : expenseNet;
  const resultWithoutOverhead = revenue - expensesOp;

  // Overheads (próprios + via master)
  const allOverheads = [...ownOverheads, ...masterOverheadSlice];
  const overheadIncome = allOverheads.filter((o: any) => o.type === "income");
  const overheadExpense = allOverheads.filter((o: any) => o.type === "expense");
  const overheadIncomeGross = overheadIncome.reduce((s, o: any) => s + calcTotalWithIva(Number(o.amount), Number(o.iva_rate)), 0);
  const overheadIncomeNet = overheadIncome.reduce((s, o: any) => s + Number(o.amount), 0);
  const overheadExpenseGross = overheadExpense.reduce((s, o: any) => s + calcTotalWithIva(Number(o.amount), Number(o.iva_rate)), 0);
  const overheadExpenseNet = overheadExpense.reduce((s, o: any) => s + Number(o.amount), 0);

  // Overhead segue a mesma base do resto do Fecho.
  const overheadIncomeFinal = calcBasis === "gross_revenue" ? overheadIncomeGross : overheadIncomeNet;
  const overheadExpenseFinal = useGrossExpenses ? overheadExpenseGross : overheadExpenseNet;
  const overheadNet = overheadIncomeFinal - overheadExpenseFinal;
  const resultWithOverhead = resultWithoutOverhead + overheadNet;

  // Acerto com sócios — base = resultado COM overhead (overhead entra no acerto, mas não na empresa)
  const settlements = partners.map((p: any) => {
    const result = resultWithOverhead;
    const effectivePct = result < 0 && p.loss_percentage != null ? Number(p.loss_percentage) : Number(p.percentage);
    const partnerShare = roundCents(result * (effectivePct / 100));

    // Pago por sócio — segue a mesma base de despesas (gross se aplicável).
    const paid = paidByPartners
      .filter((pe: any) => pe.partner_id === p.id)
      .reduce((s: number, pe: any) => {
        const t = pe.transactions;
        if (!t) return s;
        const amt = useGrossExpenses
          ? calcTotalWithIva(Number(t.amount), Number(t.iva_rate || 0))
          : Number(t.amount);
        return s + amt;
      }, 0);

    // Extras analíticos
    const extras = partnerExtras
      .filter((e: any) => e.partner_id === p.id)
      .reduce((s: number, e: any) => s + Number(e.amount), 0);

    // Saldo final: empresa paga sócio se positivo
    const balance = roundCents(partnerShare + paid - extras);

    return {
      id: p.id,
      name: p.suppliers?.name || "—",
      percentage: Number(p.percentage),
      lossPercentage: p.loss_percentage != null ? Number(p.loss_percentage) : null,
      effectivePct,
      partnerShare,
      paid: roundCents(paid),
      extras: roundCents(extras),
      balance,
    };
  });

  // ============= Export PDF =============
  function exportPdf() {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 16;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Fecho do Evento — ${eventName}`, margin, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}  •  Base: ${getPartnerCalcBasisLabel(calcBasis)}`, margin, y);
    doc.setTextColor(0);
    y += 8;

    // Bloco síntese
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Síntese Operacional (sem overhead)", margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      body: [
        ["Receita", formatCurrency(revenue)],
        ["Despesas operacionais", formatCurrency(expensesOp)],
        ["Resultado s/ overhead", formatCurrency(resultWithoutOverhead)],
      ],
      margin: { left: margin, right: margin },
      styles: { fontSize: 10 },
      columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right", fontStyle: "bold" } },
      theme: "plain",
      didParseCell: (data) => {
        if (data.row.index === 2) {
          data.cell.styles.fillColor = [240, 240, 240];
          data.cell.styles.textColor = resultWithoutOverhead >= 0 ? [0, 120, 0] : [180, 0, 0];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // Overheads
    if (allOverheads.length > 0) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Overheads (não impactam resultado da empresa)", margin, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Descrição", "Tipo", "Base", "IVA", "Total"]],
        body: allOverheads.map((o: any) => [
          o.description + (o._via_master ? " (via Master)" : ""),
          o.type === "income" ? "Receita" : "Despesa",
          formatCurrency(Number(o.amount)),
          `${o.iva_rate}%`,
          formatCurrency(calcTotalWithIva(Number(o.amount), Number(o.iva_rate))),
        ]),
        foot: [[
          "Total líquido overhead",
          "",
          "",
          "",
          formatCurrency(overheadNet),
        ]],
        margin: { left: margin, right: margin },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [60, 60, 60] },
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
        columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // Síntese final
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Síntese Final (com overhead — base do acerto com sócios)", margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      body: [
        ["Resultado s/ overhead", formatCurrency(resultWithoutOverhead)],
        ["Overhead líquido", formatCurrency(overheadNet)],
        ["Resultado c/ overhead", formatCurrency(resultWithOverhead)],
      ],
      margin: { left: margin, right: margin },
      styles: { fontSize: 10 },
      columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right", fontStyle: "bold" } },
      theme: "plain",
      didParseCell: (data) => {
        if (data.row.index === 2) {
          data.cell.styles.fillColor = [220, 230, 255];
          data.cell.styles.textColor = resultWithOverhead >= 0 ? [0, 120, 0] : [180, 0, 0];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Acerto sócios
    if (settlements.length > 0) {
      if (y > 230) { doc.addPage(); y = 16; }
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Acerto com Sócios", margin, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Sócio", "%", "Quota", "Pago p/ sócio", "Extras", "Saldo"]],
        body: settlements.map(s => [
          s.name,
          s.lossPercentage != null
            ? `${s.percentage}% / ${s.lossPercentage}%`
            : `${s.percentage}%`,
          formatCurrency(s.partnerShare),
          formatCurrency(s.paid),
          formatCurrency(s.extras),
          formatCurrency(s.balance),
        ]),
        margin: { left: margin, right: margin },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [60, 60, 60] },
        columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right", fontStyle: "bold" } },
      });
      y = (doc as any).lastAutoTable.finalY + 4;

      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100);
      doc.text("Saldo positivo = empresa paga ao sócio. Saldo negativo = sócio paga à empresa.", margin, y);
      doc.setTextColor(0);
    }

    doc.save(`Fecho_${eventName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
  }

  // ============= Render =============
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileBarChart2 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold">Fecho do Evento</h3>
          <Badge variant="outline" className="text-[10px]">
            Base: {getPartnerCalcBasisLabel(calcBasis)}
          </Badge>
        </div>
        <Button size="sm" variant="outline" onClick={exportPdf}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar PDF
        </Button>
      </div>

      {/* Síntese sem overhead */}
      <div className="glass rounded-xl p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Síntese Operacional (sem overhead)
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-success" /> Receita
            </p>
            <p className="text-xl font-bold font-mono text-success">{formatCurrency(revenue)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-destructive" /> Despesas operacionais
            </p>
            <p className="text-xl font-bold font-mono text-destructive">{formatCurrency(expensesOp)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Resultado s/ overhead</p>
            <p className={`text-xl font-bold font-mono ${resultWithoutOverhead >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(resultWithoutOverhead)}
            </p>
          </div>
        </div>
      </div>

      {/* Overheads */}
      {allOverheads.length > 0 ? (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50 bg-warning/5 flex items-center gap-2">
            <Layers className="h-4 w-4 text-warning" />
            <span className="font-semibold text-sm">Overheads</span>
            <HelpTooltip text="Custos rateados da empresa (assessoria, jurídico, escritório). Não impactam o resultado da empresa, mas entram no acerto com sócios." size={13} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allOverheads.map((o: any) => {
                const total = calcTotalWithIva(Number(o.amount), Number(o.iva_rate));
                return (
                  <TableRow key={o.id}>
                    <TableCell className="text-sm">
                      {o.description}
                      {o._via_master && (
                        <Badge variant="outline" className="ml-2 text-[9px] bg-primary/10 text-primary border-primary/30">
                          via Master
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${o.type === "income" ? "text-success" : "text-destructive"}`}>
                        {o.type === "income" ? "Receita" : "Despesa"}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${o.type === "income" ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(Number(o.amount))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{o.iva_rate}%</TableCell>
                    <TableCell className={`text-right font-mono text-sm font-semibold ${o.type === "income" ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(total)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2 border-border bg-muted/30">
                <TableCell colSpan={4} className="font-bold text-sm">TOTAL OVERHEAD LÍQUIDO</TableCell>
                <TableCell className={`text-right font-mono font-bold ${overheadNet >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(overheadNet)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Sem rateios de overhead registados.
        </div>
      )}

      {/* Síntese com overhead */}
      <div className="glass rounded-xl p-4 border border-primary/30 bg-primary/5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">
          Síntese Final (com overhead — base do acerto com sócios)
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Resultado s/ overhead</p>
            <p className={`text-lg font-bold font-mono ${resultWithoutOverhead >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(resultWithoutOverhead)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Overhead líquido</p>
            <p className={`text-lg font-bold font-mono ${overheadNet >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(overheadNet)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Resultado c/ overhead</p>
            <p className={`text-2xl font-bold font-mono ${resultWithOverhead >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(resultWithOverhead)}
            </p>
          </div>
        </div>
      </div>

      {/* Acerto com Sócios */}
      {settlements.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50 bg-muted/30 flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            <span className="font-semibold">Acerto com Sócios</span>
            <HelpTooltip text="Quota de cada sócio sobre o resultado COM overhead, somada ao que pagou pelo evento e descontados extras analíticos." size={13} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sócio</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Quota</TableHead>
                <TableHead className="text-right">Pago p/ sócio</TableHead>
                <TableHead className="text-right">Extras</TableHead>
                <TableHead className="text-right">Saldo final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      {s.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {s.lossPercentage != null
                      ? `${s.percentage}% / ${s.lossPercentage}%`
                      : `${s.percentage}%`}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${s.partnerShare >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(s.partnerShare)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(s.paid)}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(s.extras)}</TableCell>
                  <TableCell className={`text-right font-mono font-bold text-base ${s.balance >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(s.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-4 py-2 text-[10px] text-muted-foreground italic border-t border-border/30 bg-muted/10">
            Saldo positivo = empresa paga ao sócio. Saldo negativo = sócio paga à empresa.
          </div>
        </div>
      )}
    </div>
  );
}
