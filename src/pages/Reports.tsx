import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";

interface DRELine {
  label: string;
  amount: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  indent?: boolean;
}

function buildDRE(
  transactions: any[],
  categories: any[]
): DRELine[] {
  const incomes = transactions.filter((t) => t.type === "income");
  const expenses = transactions.filter((t) => t.type === "expense");

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  // Group incomes by category
  const incByCat: Record<string, number> = {};
  incomes.forEach((t) => {
    const name = catMap[t.category_id] ?? "Sem categoria";
    incByCat[name] = (incByCat[name] || 0) + Number(t.amount);
  });

  // Group expenses by category
  const expByCat: Record<string, number> = {};
  expenses.forEach((t) => {
    const name = catMap[t.category_id] ?? "Sem categoria";
    expByCat[name] = (expByCat[name] || 0) + Number(t.amount);
  });

  const totalIncome = incomes.reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = expenses.reduce((s, t) => s + Number(t.amount), 0);
  const result = totalIncome - totalExpense;

  const lines: DRELine[] = [];

  // Receitas
  lines.push({ label: "RECEITAS", amount: totalIncome, isTotal: true });
  Object.entries(incByCat)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, val]) => lines.push({ label: name, amount: val, indent: true }));

  // Despesas
  lines.push({ label: "DESPESAS", amount: totalExpense, isTotal: true });
  Object.entries(expByCat)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, val]) => lines.push({ label: name, amount: val, indent: true }));

  // Resultado
  lines.push({ label: "RESULTADO LÍQUIDO", amount: result, isGrandTotal: true });

  return lines;
}

export default function Reports() {
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

  // Summary per event
  const eventSummaries = events.map((e) => {
    const evtTx = transactions.filter((t) => t.event_id === e.id);
    const totalIncome = evtTx.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const totalExpense = evtTx.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    return { ...e, totalIncome, totalExpense, result: totalIncome - totalExpense, txCount: evtTx.length };
  });

  // Global totals
  const globalIncome = eventSummaries.reduce((s, e) => s + e.totalIncome, 0);
  const globalExpense = eventSummaries.reduce((s, e) => s + e.totalExpense, 0);
  const globalResult = globalIncome - globalExpense;

  const toggle = (id: string) => setExpandedEvent((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Relatório DRE</h1>
        <p className="text-sm text-muted-foreground">Demonstração do Resultado do Exercício por evento</p>
      </div>

      {/* Global summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Receitas</p>
          <p className="mt-1 text-xl font-bold text-success">{formatCurrency(globalIncome)}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Despesas</p>
          <p className="mt-1 text-xl font-bold text-warning">{formatCurrency(globalExpense)}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resultado Líquido</p>
          <p className={`mt-1 text-xl font-bold ${globalResult >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(globalResult)}
          </p>
        </div>
      </div>

      {/* DRE per event */}
      <div className="space-y-3">
        {eventSummaries.map((evt) => {
          const isOpen = expandedEvent === evt.id;
          const evtTx = transactions.filter((t) => t.event_id === evt.id);
          const dre = isOpen ? buildDRE(evtTx, categories) : [];

          return (
            <div key={evt.id} className="glass rounded-xl overflow-hidden">
              {/* Header row */}
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
                  <span className="text-success font-mono">{formatCurrency(evt.totalIncome)}</span>
                  <span className="text-warning font-mono">{formatCurrency(evt.totalExpense)}</span>
                  <span className={`font-mono font-bold ${evt.result >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(evt.result)}
                  </span>
                </div>
              </button>

              {/* DRE table */}
              {isOpen && (
                <div className="border-t border-border/30 px-4 pb-4">
                  {evtTx.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Sem transações para este evento.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rubrica</TableHead>
                          <TableHead className="text-right">Valor (€)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dre.map((line, i) => (
                          <TableRow
                            key={i}
                            className={
                              line.isGrandTotal
                                ? "border-t-2 border-primary/30 bg-primary/5"
                                : line.isTotal
                                ? "bg-secondary/20"
                                : ""
                            }
                          >
                            <TableCell
                              className={`${line.indent ? "pl-8" : ""} ${
                                line.isTotal || line.isGrandTotal ? "font-bold text-xs uppercase tracking-wider" : "text-sm"
                              }`}
                            >
                              {line.label}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono ${
                                line.isGrandTotal
                                  ? `text-base font-bold ${line.amount >= 0 ? "text-success" : "text-destructive"}`
                                  : line.isTotal
                                  ? "font-semibold"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {line.isGrandTotal && line.amount < 0 ? "-" : ""}
                              {formatCurrency(Math.abs(line.amount))}
                            </TableCell>
                          </TableRow>
                        ))}
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
