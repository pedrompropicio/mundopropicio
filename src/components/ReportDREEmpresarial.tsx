import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { buildCategoryLookup, aggregateByHierarchyDRE, type AggregatedGroup } from "@/lib/category-hierarchy";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { buildAbsorptionMap } from "@/lib/admin-cost-allocation";
import { partnerUsesGrossExpenses } from "@/lib/partner-calc-basis";

type TicketRevenueSource = "transactions" | "ticket_sales";

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
  const [ticketRevenueSource, setTicketRevenueSource] = useState<TicketRevenueSource>("ticket_sales");
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

  const { data: ticketZones = [] } = useQuery({
    queryKey: ["ticket-zones-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_zones").select("id,event_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketLots = [] } = useQuery({
    queryKey: ["ticket-lots-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_lots").select("id,zone_id,iva_rate");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketSales = [] } = useQuery({
    queryKey: ["ticket-sales-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ticket_sales").select("lot_id,sale_date,quantity,unit_price,total_value");
      if (error) throw error;
      return data;
    },
  });

  const ticketCategoryId = useMemo(
    () => categories.find(
      (c) => c.name.toLowerCase().includes("venda de bilhete") ||
             c.name.toLowerCase().includes("bilhetes") ||
             c.name.toLowerCase().includes("bilheteira")
    )?.id ?? null,
    [categories]
  );

  // Overheads/Custos de Fecho NÃO entram no DRE Empresarial.
  // O DRE Empresarial trabalha em valores líquidos (s/IVA) com base em
  // transações reais. Overheads (rateios do BP) são previsões de gestão e
  // só fazem sentido na "Vista Sócio" do DRE por evento. Aqui ficam de fora.


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

  // Mapa de absorção: tx.id -> evento absorvedor (Fase 3 da alocação Group 10).
  // Usa TODAS as transações do ano (não só corporativas) por consistência, mas o helper
  // já filtra por categoria absorvível.
  const absorptionMap = useMemo(
    () => buildAbsorptionMap(yearTx as any, categories as any, events as any),
    [yearTx, categories, events]
  );

  // Also include corporate-category transactions that have event_id (edge case).
  // Excluímos do DRE Empresarial qualquer transação absorvida por evento ativo.
  const corpTxAll = useMemo(
    () => yearTx.filter(
      (t) => corporateCatIds.has(t.category_id || "") && !absorptionMap.has(t.id)
    ),
    [yearTx, corporateCatIds, absorptionMap]
  );

  const lines = useMemo(() => {
    const result: MonthlyLine[] = [];

    const useTicketSales = ticketRevenueSource === "ticket_sales";

    // ─── SECTION 1: RESULTADO OPERACIONAL DE EVENTOS ───
    // Monthly event results: for each month, sum income - expenses of event transactions
    const eventIncomeMonthly = new Array(12).fill(0);
    const eventExpenseMonthly = new Array(12).fill(0);

    eventTx.forEach((t) => {
      const d = t.payment_date || t.date;
      if (!d) return;
      const mi = getMonthIndex(d);
      // Quando a fonte é ticket_sales, ignoramos transações income da categoria de bilheteira
      // para não duplicar com a soma direta de ticket_sales.
      if (t.type === "income" && !t.is_transitory && !t.exclude_from_result) {
        if (useTicketSales && ticketCategoryId && t.category_id === ticketCategoryId) return;
        eventIncomeMonthly[mi] += Number(t.amount);
      } else if (t.type === "expense" && !t.is_transitory && !t.exclude_from_result) {
        eventExpenseMonthly[mi] += Number(t.amount);
      }
    });

    // Soma de bilheteira (líquida s/IVA) a partir de ticket_sales — agrupada por mês de venda.
    if (useTicketSales) {
      ticketSales.forEach((s: any) => {
        const sd: string = s.sale_date;
        if (!sd || !sd.startsWith(String(year))) return;
        const lot = ticketLots.find((l: any) => l.id === s.lot_id);
        if (!lot) return;
        // Só contar vendas de eventos cujas zonas existem (defensivo)
        const zone = ticketZones.find((z: any) => z.id === (lot as any).zone_id);
        if (!zone) return;
        const rate = Number((lot as any).iva_rate ?? 6);
        const gross = (s.total_value !== null && s.total_value !== undefined && s.total_value !== "")
          ? Number(s.total_value)
          : Number(s.quantity || 0) * Number(s.unit_price || 0);
        const net = gross / (1 + rate / 100);
        const mi = getMonthIndex(sd);
        eventIncomeMonthly[mi] += net;
      });
    }


    // Overheads/Custos de Fecho NÃO entram aqui (ver nota acima).
    const eventResultMonthly = eventIncomeMonthly.map(
      (inc, i) => inc - eventExpenseMonthly[i]
    );

    // Partner distributions by month
    const partnerDistMonthly = new Array(12).fill(0);
    // For each event in the year, calculate partner share and assign to event's month
    const yearEvents = events.filter((e) => e.date.startsWith(String(year)));
    yearEvents.forEach((evt) => {
      const partners = eventPartners.filter((p: any) => p.event_id === evt.id);
      if (partners.length === 0) return;
      const evtTx = eventTx.filter((t) => t.event_id === evt.id);
      let inc = evtTx
        .filter((t) => t.type === "income" && !t.is_transitory && !t.exclude_from_result)
        .filter((t) => !(useTicketSales && ticketCategoryId && t.category_id === ticketCategoryId))
        .reduce((s, t) => s + Number(t.amount), 0);
      // Adicionar receita líquida de bilheteira do evento (se fonte = ticket_sales)
      if (useTicketSales) {
        const evtZoneIds = ticketZones.filter((z: any) => z.event_id === evt.id).map((z: any) => z.id);
        const evtLotIds = ticketLots.filter((l: any) => evtZoneIds.includes((l as any).zone_id)).map((l: any) => l.id);
        const evtSales = ticketSales.filter((s: any) => evtLotIds.includes(s.lot_id));
        const ticketNet = evtSales.reduce((sum: number, s: any) => {
          const lot = ticketLots.find((l: any) => l.id === s.lot_id);
          const rate = Number((lot as any)?.iva_rate ?? 6);
          const gross = (s.total_value !== null && s.total_value !== undefined && s.total_value !== "")
            ? Number(s.total_value)
            : Number(s.quantity || 0) * Number(s.unit_price || 0);
          return sum + gross / (1 + rate / 100);
        }, 0);
        inc += ticketNet;
      }
      const exp = evtTx.filter((t) => t.type === "expense" && !t.is_transitory && !t.exclude_from_result)
        .reduce((s, t) => s + Number(t.amount), 0);
      const netResult = inc - exp;
      const calcBasis = (evt as any).partner_calc_basis || "net_result";

      const mi = getMonthIndex(evt.date);
      partners.forEach((p: any) => {
        let base: number;
        if (calcBasis === "gross_revenue") {
          base = inc;
        } else if (partnerUsesGrossExpenses(calcBasis, p.expense_includes_iva)) {
          const expInc = evtTx.filter((t) => t.type === "expense" && !t.is_transitory && !t.exclude_from_result)
            .reduce((s, t) => s + calcAmountWithIva(Number(t.amount), Number(t.iva_rate ?? 23)), 0);
          base = inc - expInc;
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
  }, [eventTx, corpTxAll, lookup, corporateExpenseCatIds, corporateIncomeCatIds, events, eventPartners, year, ticketRevenueSource, ticketSales, ticketLots, ticketZones, ticketCategoryId]);

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
      <div className="flex flex-wrap items-center gap-4">
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

        <div className="flex items-center gap-3 rounded-md border px-3 py-2">
          <Label className="text-xs text-muted-foreground">Receita de bilheteira:</Label>
          <RadioGroup
            value={ticketRevenueSource}
            onValueChange={(v) => setTicketRevenueSource(v as TicketRevenueSource)}
            className="flex items-center gap-3"
          >
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="ticket_sales" id="dre-emp-src-ts" />
              <Label htmlFor="dre-emp-src-ts" className="text-xs cursor-pointer">Bilheteira (líquida)</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="transactions" id="dre-emp-src-tx" />
              <Label htmlFor="dre-emp-src-tx" className="text-xs cursor-pointer">Só transações</Label>
            </div>
          </RadioGroup>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Regra: tudo s/IVA (líquido). Sem overheads (rateios do BP). Sem transitórias nem exclusões de resultado.
        Bilheteira convertida para líquido pela taxa de IVA do lote.
      </p>


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
