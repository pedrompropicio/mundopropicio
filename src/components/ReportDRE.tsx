import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, FileText, Download } from "lucide-react";
import { exportDREToExcel } from "@/lib/export-dre";

interface DRELine {
  label: string;
  amountExIva: number;
  ivaAmount: number;
  amountIncIva: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  indent?: boolean;
}

function calcAmountWithIva(amount: number, ivaRate: number): number {
  return amount * (1 + ivaRate / 100);
}

function buildDRE(transactions: any[], categories: any[]): DRELine[] {
  const incomes = transactions.filter((t) => t.type === "income");
  const expenses = transactions.filter((t) => t.type === "expense");
  const catMap = Object.fromEntries(categories.map((c: any) => [c.id, c.name]));

  const aggregate = (txs: any[]) => {
    const byCat: Record<string, { exIva: number; iva: number; incIva: number }> = {};
    txs.forEach((t) => {
      const name = catMap[t.category_id] ?? "Sem categoria";
      const amt = Number(t.amount);
      const iva = Number(t.iva_rate ?? 23);
      const withIva = calcAmountWithIva(amt, iva);
      if (!byCat[name]) byCat[name] = { exIva: 0, iva: 0, incIva: 0 };
      byCat[name].exIva += amt;
      byCat[name].iva += withIva - amt;
      byCat[name].incIva += withIva;
    });
    return byCat;
  };

  const incByCat = aggregate(incomes);
  const expByCat = aggregate(expenses);
  const totalIncEx = incomes.reduce((s, t) => s + Number(t.amount), 0);
  const totalIncInc = incomes.reduce((s, t) => s + calcAmountWithIva(Number(t.amount), Number(t.iva_rate ?? 23)), 0);
  const totalExpEx = expenses.reduce((s, t) => s + Number(t.amount), 0);
  const totalExpInc = expenses.reduce((s, t) => s + calcAmountWithIva(Number(t.amount), Number(t.iva_rate ?? 23)), 0);

  const lines: DRELine[] = [];
  lines.push({ label: "RECEITAS", amountExIva: totalIncEx, ivaAmount: totalIncInc - totalIncEx, amountIncIva: totalIncInc, isTotal: true });
  Object.entries(incByCat).sort((a, b) => b[1].exIva - a[1].exIva)
    .forEach(([name, val]) => lines.push({ label: name, amountExIva: val.exIva, ivaAmount: val.iva, amountIncIva: val.incIva, indent: true }));
  lines.push({ label: "DESPESAS", amountExIva: totalExpEx, ivaAmount: totalExpInc - totalExpEx, amountIncIva: totalExpInc, isTotal: true });
  Object.entries(expByCat).sort((a, b) => b[1].exIva - a[1].exIva)
    .forEach(([name, val]) => lines.push({ label: name, amountExIva: val.exIva, ivaAmount: val.iva, amountIncIva: val.incIva, indent: true }));
  const resEx = totalIncEx - totalExpEx;
  const resInc = totalIncInc - totalExpInc;
  lines.push({ label: "RESULTADO LÍQUIDO", amountExIva: resEx, ivaAmount: resInc - resEx, amountIncIva: resInc, isGrandTotal: true });
  return lines;
}

export default function ReportDRE() {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").order("date", { ascending: false });
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

  const eventSummaries = events.map((e) => {
    const evtTx = transactions.filter((t: any) => t.event_id === e.id);
    const totalIncEx = evtTx.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalIncInc = evtTx.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + calcAmountWithIva(Number(t.amount), Number(t.iva_rate ?? 23)), 0);
    const totalExpEx = evtTx.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalExpInc = evtTx.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + calcAmountWithIva(Number(t.amount), Number(t.iva_rate ?? 23)), 0);
    return { ...e, totalIncEx, totalIncInc, totalExpEx, totalExpInc, resultEx: totalIncEx - totalExpEx, resultInc: totalIncInc - totalExpInc, txCount: evtTx.length };
  });

  const globalIncEx = eventSummaries.reduce((s, e) => s + e.totalIncEx, 0);
  const globalIncInc = eventSummaries.reduce((s, e) => s + e.totalIncInc, 0);
  const globalExpEx = eventSummaries.reduce((s, e) => s + e.totalExpEx, 0);
  const globalExpInc = eventSummaries.reduce((s, e) => s + e.totalExpInc, 0);
  const globalResultEx = globalIncEx - globalExpEx;
  const globalResultInc = globalIncInc - globalExpInc;

  const toggle = (id: string) => setExpandedEvent((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          onClick={() => exportDREToExcel(events, transactions, categories)}
          disabled={events.length === 0}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Exportar Excel</span>
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Receitas</p>
          <p className="mt-1 text-lg font-bold text-success">{formatCurrency(globalIncEx)}</p>
          <p className="text-xs text-muted-foreground">c/ IVA: {formatCurrency(globalIncInc)}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Despesas</p>
          <p className="mt-1 text-lg font-bold text-warning">{formatCurrency(globalExpEx)}</p>
          <p className="text-xs text-muted-foreground">c/ IVA: {formatCurrency(globalExpInc)}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resultado Líquido</p>
          <p className={`mt-1 text-lg font-bold ${globalResultEx >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(globalResultEx)}
          </p>
          <p className="text-xs text-muted-foreground">c/ IVA: {formatCurrency(globalResultInc)}</p>
        </div>
      </div>

      <div className="space-y-3">
        {eventSummaries.map((evt) => {
          const isOpen = expandedEvent === evt.id;
          const evtTx = transactions.filter((t: any) => t.event_id === evt.id);
          const dre = isOpen ? buildDRE(evtTx, categories) : [];

          return (
            <div key={evt.id} className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(evt.id)}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/30"
              >
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <FileText className="h-4 w-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{evt.name}</p>
                  <p className="text-xs text-muted-foreground">{evt.txCount} transações</p>
                </div>
                <div className="hidden sm:flex items-center gap-6 text-sm">
                  <span className="text-success font-mono">{formatCurrency(evt.totalIncEx)}</span>
                  <span className="text-warning font-mono">{formatCurrency(evt.totalExpEx)}</span>
                  <span className={`font-mono font-bold ${evt.resultEx >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(evt.resultEx)}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border/30 px-4 pb-4">
                  {evtTx.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Sem transações para este evento.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rubrica</TableHead>
                          <TableHead className="text-right">S/ IVA (€)</TableHead>
                          <TableHead className="text-right">IVA (€)</TableHead>
                          <TableHead className="text-right">C/ IVA (€)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dre.map((line, i) => {
                          const rowClass = line.isGrandTotal
                            ? "border-t-2 border-primary/30 bg-primary/5"
                            : line.isTotal ? "bg-secondary/20" : "";
                          const labelClass = `${line.indent ? "pl-8" : ""} ${line.isTotal || line.isGrandTotal ? "font-bold text-xs uppercase tracking-wider" : "text-sm"}`;
                          const valClass = (amt: number) =>
                            `text-right font-mono ${line.isGrandTotal ? `text-base font-bold ${amt >= 0 ? "text-success" : "text-destructive"}` : line.isTotal ? "font-semibold" : "text-muted-foreground"}`;
                          return (
                            <TableRow key={i} className={rowClass}>
                              <TableCell className={labelClass}>{line.label}</TableCell>
                              <TableCell className={valClass(line.amountExIva)}>{formatCurrency(Math.abs(line.amountExIva))}</TableCell>
                              <TableCell className={valClass(line.ivaAmount)}>{formatCurrency(Math.abs(line.ivaAmount))}</TableCell>
                              <TableCell className={valClass(line.amountIncIva)}>{formatCurrency(Math.abs(line.amountIncIva))}</TableCell>
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
