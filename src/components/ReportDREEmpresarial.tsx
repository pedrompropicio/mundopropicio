import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildCategoryLookup, aggregateByHierarchyDRE, type AggregatedGroup } from "@/lib/category-hierarchy";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function calcAmountWithIva(amount: number, ivaRate: number): number {
  return amount * (1 + ivaRate / 100);
}

function getMonthIndex(dateStr: string): number {
  return new Date(dateStr).getMonth();
}

interface MonthlyLine {
  label: string;
  monthly: number[];
  total: number;
  isHeader?: boolean;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  indent?: boolean;
  isSectionTitle?: boolean;
}

export default function ReportDREEmpresarial() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const year = Number(selectedYear);

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").order("date");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions-approved"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").in("status", ["approved", "paid"]);
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

  const { data: eventPartners = [] } = useQuery({
    queryKey: ["event-partners-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_partners").select("*, suppliers(name)");
      if (error) throw error;
      return data;
    },
  });

  const { data: closingCosts = [] } = useQuery({
    queryKey: ["closing-costs-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_closing_costs").select("*");
      if (error) throw error;
      return data;
    },
  });

  const lookup = useMemo(() => buildCategoryLookup(categories), [categories]);

  // Identify corporate categories (code starts with "10")
  const corporateCatIds = useMemo(() => {
    return new Set(categories.filter((c) => c.code.startsWith("10")).map((c) => c.id));
  }, [categories]);

  // Corporate sub-groups for display
  const corporateExpenseGroupCodes = ["10.3", "10.4", "10.5", "10.6", "10.7"];
  const corporateIncomeGroupCodes = ["10.1", "10.2"];
  const corporateIncomeLeafCodes = ["10.6.03"]; // Juros Recebidos is income within expense group

  const corporateExpenseCatIds = useMemo(() => {
    return new Set(
      categories
        .filter((c) => {
          if (!c.code.startsWith("10")) return false;
          // It's an expense if its type is "expense" OR it falls under expense groups
          // But exclude income items like 10.5.02 (IVA a Recuperar) and 10.6.03 (Juros Recebidos)
          return c.type === "expense" && !corporateIncomeLeafCodes.includes(c.code);
        })
        .map((c) => c.id)
    );
  }, [categories]);

  const corporateIncomeCatIds = useMemo(() => {
    return new Set(
      categories
        .filter((c) => {
          if (!c.code.startsWith("10")) return false;
          return c.type === "income" || corporateIncomeLeafCodes.includes(c.code);
        })
        .map((c) => c.id)
    );
  }, [categories]);

  // Filter transactions by year
  const yearTx = useMemo(
    () => transactions.filter((t) => {
      const d = t.payment_date || t.date;
      return d && d.startsWith(String(year));
    }),
    [transactions, year]
  );

  // Event transactions (with event_id AND not corporate categories)
  const eventTx = useMemo(
    () => yearTx.filter((t) => t.event_id && !corporateCatIds.has(t.category_id || "")),
    [yearTx, corporateCatIds]
  );

  // Corporate transactions (no event_id OR corporate categories)
  const corpTx = useMemo(
    () => yearTx.filter((t) => !t.event_id && corporateCatIds.has(t.category_id || "")),
    [yearTx, corporateCatIds]
  );

  // Also include corporate-category transactions that have event_id (edge case)
  const corpTxAll = useMemo(
    () => yearTx.filter((t) => corporateCatIds.has(t.category_id || "")),
    [yearTx, corporateCatIds]
  );

  const lines = useMemo(() => {
    const result: MonthlyLine[] = [];

    // ─── SECTION 1: RESULTADO OPERACIONAL DE EVENTOS ───
    // Monthly event results: for each month, sum income - expenses of event transactions
    const eventIncomeMonthly = new Array(12).fill(0);
    const eventExpenseMonthly = new Array(12).fill(0);

    eventTx.forEach((t) => {
      const d = t.payment_date || t.date;
      if (!d) return;
      const mi = getMonthIndex(d);
      if (t.type === "income" && !t.is_transitory && !t.exclude_from_result) {
        eventIncomeMonthly[mi] += Number(t.amount);
      } else if (t.type === "expense" && !t.is_transitory && !t.exclude_from_result) {
        eventExpenseMonthly[mi] += Number(t.amount);
      }
    });

    // Closing costs by month (use event date for month)
    const closingCostMonthly = new Array(12).fill(0);
    closingCosts.forEach((cc: any) => {
      const evt = events.find((e) => e.id === cc.event_id);
      if (!evt || !evt.date.startsWith(String(year))) return;
      const mi = getMonthIndex(evt.date);
      closingCostMonthly[mi] += Number(cc.amount);
    });

    const eventResultMonthly = eventIncomeMonthly.map(
      (inc, i) => inc - eventExpenseMonthly[i] - closingCostMonthly[i]
    );

    // Partner distributions by month
    const partnerDistMonthly = new Array(12).fill(0);
    // For each event in the year, calculate partner share and assign to event's month
    const yearEvents = events.filter((e) => e.date.startsWith(String(year)));
    yearEvents.forEach((evt) => {
      const partners = eventPartners.filter((p: any) => p.event_id === evt.id);
      if (partners.length === 0) return;
      const evtTx = eventTx.filter((t) => t.event_id === evt.id);
      const inc = evtTx.filter((t) => t.type === "income" && !t.is_transitory && !t.exclude_from_result)
        .reduce((s, t) => s + Number(t.amount), 0);
      const exp = evtTx.filter((t) => t.type === "expense" && !t.is_transitory && !t.exclude_from_result)
        .reduce((s, t) => s + Number(t.amount), 0);
      const evtClosing = closingCosts.filter((cc: any) => cc.event_id === evt.id)
        .reduce((s: number, cc: any) => s + Number(cc.amount), 0);
      const netResult = inc - exp - evtClosing;
      const calcBasis = (evt as any).partner_calc_basis || "net_result";
      
      const mi = getMonthIndex(evt.date);
      partners.forEach((p: any) => {
        let base: number;
        if (calcBasis === "gross_revenue") {
          base = inc;
        } else if (p.expense_includes_iva) {
          const expInc = evtTx.filter((t) => t.type === "expense" && !t.is_transitory && !t.exclude_from_result)
            .reduce((s, t) => s + calcAmountWithIva(Number(t.amount), Number(t.iva_rate ?? 23)), 0);
          base = inc - expInc - evtClosing;
        } else {
          base = netResult;
        }
        partnerDistMonthly[mi] += base * (Number(p.percentage) / 100);
      });
    });

    const retainedMonthly = eventResultMonthly.map((r, i) => r - partnerDistMonthly[i]);

    // Add event section
    result.push(makeSectionTitle("RESULTADO OPERACIONAL DE EVENTOS"));
    result.push(makeLine("Receitas de Eventos", eventIncomeMonthly, false, false, true));
    result.push(makeLine("(-) Custos Directos de Eventos", eventExpenseMonthly.map((v) => -v), false, false, true));
    if (closingCostMonthly.some((v) => v !== 0)) {
      result.push(makeLine("(-) Custos de Fecho", closingCostMonthly.map((v) => -v), false, false, true));
    }
    result.push(makeLine("= Resultado Líquido Eventos", eventResultMonthly, false, true));
    
    const hasPartners = partnerDistMonthly.some((v) => v !== 0);
    if (hasPartners) {
      result.push(makeLine("(-) Distribuição Sócios", partnerDistMonthly.map((v) => -v), false, false, true));
      result.push(makeLine("= Margem da Empresa (Eventos)", retainedMonthly, false, true));
    }

    // ─── SECTION 2: CUSTOS CORPORATIVOS ───
    const corpExpTx = corpTxAll.filter(
      (t) => t.type === "expense" && !t.is_transitory && !t.exclude_from_result && corporateExpenseCatIds.has(t.category_id || "")
    );

    // Aggregate by L2 group monthly
    const corpGroupMonthly: Record<string, { name: string; code: string; monthly: number[] }> = {};
    corpExpTx.forEach((t) => {
      const catInfo = lookup[t.category_id || ""];
      const groupName = catInfo?.groupName ?? "Sem categoria";
      const groupCode = catInfo?.groupCode ?? "Z";
      if (!corpGroupMonthly[groupCode]) {
        corpGroupMonthly[groupCode] = { name: groupName, code: groupCode, monthly: new Array(12).fill(0) };
      }
      const d = t.payment_date || t.date;
      if (!d) return;
      const mi = getMonthIndex(d);
      corpGroupMonthly[groupCode].monthly[mi] += Number(t.amount);
    });

    const corpGroups = Object.values(corpGroupMonthly).sort((a, b) => a.code.localeCompare(b.code));
    const totalCorpMonthly = new Array(12).fill(0);
    corpGroups.forEach((g) => g.monthly.forEach((v, i) => (totalCorpMonthly[i] += v)));

    result.push(makeSectionTitle("CUSTOS CORPORATIVOS"));
    corpGroups.forEach((g) => {
      result.push(makeLine(g.name, g.monthly.map((v) => -v), false, false, true));
    });
    result.push(makeLine("= Total Custos Corporativos", totalCorpMonthly.map((v) => -v), false, true));

    // ─── SECTION 3: RESULTADO DA EMPRESA ───
    const baseForResult = hasPartners ? retainedMonthly : eventResultMonthly;
    const empresaResultMonthly = baseForResult.map((r, i) => r - totalCorpMonthly[i]);

    result.push(makeSectionTitle("RESULTADO DA EMPRESA"));
    result.push(makeLine("RESULTADO DA EMPRESA", empresaResultMonthly, true));

    // ─── SECTION 4: MOVIMENTOS FINANCEIROS ───
    const corpIncTx = corpTxAll.filter(
      (t) => t.type === "income" && !t.is_transitory && !t.exclude_from_result && corporateIncomeCatIds.has(t.category_id || "")
    );

    const finGroupMonthly: Record<string, { name: string; code: string; monthly: number[] }> = {};
    corpIncTx.forEach((t) => {
      const catInfo = lookup[t.category_id || ""];
      const groupName = catInfo?.groupName ?? "Sem categoria";
      const groupCode = catInfo?.groupCode ?? "Z";
      if (!finGroupMonthly[groupCode]) {
        finGroupMonthly[groupCode] = { name: groupName, code: groupCode, monthly: new Array(12).fill(0) };
      }
      const d = t.payment_date || t.date;
      if (!d) return;
      const mi = getMonthIndex(d);
      finGroupMonthly[groupCode].monthly[mi] += Number(t.amount);
    });

    const finGroups = Object.values(finGroupMonthly).sort((a, b) => a.code.localeCompare(b.code));
    if (finGroups.length > 0) {
      result.push(makeSectionTitle("MOVIMENTOS FINANCEIROS"));
      finGroups.forEach((g) => {
        result.push(makeLine(g.name, g.monthly, false, false, true));
      });
      const totalFinMonthly = new Array(12).fill(0);
      finGroups.forEach((g) => g.monthly.forEach((v, i) => (totalFinMonthly[i] += v)));
      result.push(makeLine("= Total Movimentos Financeiros", totalFinMonthly, false, true));

      // Posição final
      const posicaoMonthly = empresaResultMonthly.map((r, i) => r + totalFinMonthly[i]);
      result.push(makeLine("POSIÇÃO FINANCEIRA", posicaoMonthly, true));
    }

    return result;
  }, [eventTx, corpTxAll, lookup, corporateExpenseCatIds, corporateIncomeCatIds, events, eventPartners, closingCosts, year]);

  const years = useMemo(() => {
    const ySet = new Set<number>();
    transactions.forEach((t) => {
      const d = t.payment_date || t.date;
      if (d) ySet.add(new Date(d).getFullYear());
    });
    if (ySet.size === 0) ySet.add(currentYear);
    return Array.from(ySet).sort((a, b) => b - a);
  }, [transactions]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px] sticky left-0 bg-background z-10">Descrição</TableHead>
              {MONTHS.map((m) => (
                <TableHead key={m} className="text-right min-w-[90px] text-xs">{m}</TableHead>
              ))}
              <TableHead className="text-right min-w-[100px] font-bold text-xs">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, idx) => {
              if (line.isSectionTitle) {
                return (
                  <TableRow key={idx} className="bg-muted/50">
                    <TableCell colSpan={14} className="font-bold text-xs uppercase tracking-wider py-3 text-muted-foreground">
                      {line.label}
                    </TableCell>
                  </TableRow>
                );
              }

              const isNegativeResult = line.isGrandTotal && line.total < 0;

              return (
                <TableRow
                  key={idx}
                  className={
                    line.isGrandTotal
                      ? "bg-primary/10 font-bold border-t-2 border-primary"
                      : line.isTotal
                      ? "font-semibold bg-muted/30"
                      : ""
                  }
                >
                  <TableCell
                    className={`sticky left-0 bg-background z-10 text-sm ${
                      line.indent ? "pl-8" : ""
                    } ${line.isGrandTotal ? "bg-primary/10" : line.isTotal ? "bg-muted/30" : ""}`}
                  >
                    {line.label}
                  </TableCell>
                  {line.monthly.map((val, mi) => (
                    <TableCell
                      key={mi}
                      className={`text-right text-xs tabular-nums ${
                        val < 0 ? "text-destructive" : ""
                      } ${line.isGrandTotal ? "bg-primary/10" : line.isTotal ? "bg-muted/30" : ""}`}
                    >
                      {val === 0 ? "—" : formatCurrency(val)}
                    </TableCell>
                  ))}
                  <TableCell
                    className={`text-right text-xs font-bold tabular-nums ${
                      line.total < 0 ? "text-destructive" : ""
                    } ${line.isGrandTotal ? "bg-primary/10" : line.isTotal ? "bg-muted/30" : ""}`}
                  >
                    {line.total === 0 ? "—" : formatCurrency(line.total)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function makeSectionTitle(label: string): MonthlyLine {
  return { label, monthly: new Array(12).fill(0), total: 0, isSectionTitle: true };
}

function makeLine(
  label: string,
  monthly: number[],
  isGrandTotal = false,
  isTotal = false,
  indent = false
): MonthlyLine {
  const total = monthly.reduce((s, v) => s + v, 0);
  return { label, monthly, total, isGrandTotal, isTotal, indent };
}
