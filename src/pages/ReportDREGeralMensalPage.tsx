/**
 * DRE Geral Mensal — Folha de Síntese para os Sócios (Fase 2 de tesouraria).
 *
 * Uma única página de síntese, a nível empresa, para um mês escolhido.
 * SÓ LÊ — não altera DRE, BP, Acerto de Sócios nem Resultado.
 *
 * Fontes (todas reutilizadas — nada de SQL novo):
 *  1) Resultado do Mês ............. computeDREEmpresarialMonthly (mesma lógica
 *                                    que /relatorios/dre-empresarial); pega-se
 *                                    a coluna do mês seleccionado.
 *  2) Caixa firme disponível ....... RPC get_event_cash_position (Fase 1):
 *                                       caixa = Σ realized − despesas comprometidas
 *                                              − sócios externos por liquidar
 *  3) Receitas a receber ........... transactions type=income, status='approved',
 *                                    paid_amount<amount, filtradas por
 *                                    payment_date OU date no mês.
 *  4) Retido em bilheteira ......... fetchTicketOfficeRetainedByEvent (helper Fase 1).
 *  5) Despesas comprometidas ....... RPC committed (separa-se a parte expense).
 *  6) Sócios externos por liquidar . partner_paid_expenses (Σ amount).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyBranding } from "@/contexts/CompanyBrandingContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileDown, Info } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import HelpTooltip from "@/components/HelpTooltip";
import { computeDREEmpresarialMonthly } from "@/lib/dre-empresarial-compute";
import { fetchTicketOfficeRetainedByEvent } from "@/lib/ticket-office-retained";
import { exportDREGeralMensalPDF } from "@/lib/export-dre-geral-mensal";

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function endOfMonth(y: number, mi: number): string {
  const d = new Date(y, mi + 1, 0);
  return `${y}-${String(mi + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfMonth(y: number, mi: number): string {
  return `${y}-${String(mi + 1).padStart(2, "0")}-01`;
}

export default function ReportDREGeralMensalPage() {
  const { companyId, isLoading: cLoading } = useCompany();
  const branding = useCompanyBranding();
  const { hasPermission, isAdmin } = useAuth();
  const canView = isAdmin || hasPermission("view_balances") || hasPermission("manage_accounts");

  const today = new Date();
  const [year, setYear] = useState<number>(today.getFullYear());
  const [monthIndex, setMonthIndex] = useState<number>(today.getMonth());
  const monthValue = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const dateFrom = startOfMonth(year, monthIndex);
  const dateTo = endOfMonth(year, monthIndex);

  // ── Dados para o Resultado (reutiliza compute do DRE Empresarial) ──
  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions-approved"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").in("status", ["approved", "paid"]);
      if (error) throw error;
      return data;
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["account-categories"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*");
      if (error) throw error;
      return data;
    },
  });
  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").order("date");
      if (error) throw error;
      return data;
    },
  });
  const { data: eventPartners = [] } = useQuery({
    queryKey: ["event-partners-all"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("event_partners").select("*, suppliers(name)");
      if (error) throw error;
      return data;
    },
  });
  const { data: ticketZones = [] } = useQuery({
    queryKey: ["ticket-zones-all"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_zones").select("id,event_id");
      if (error) throw error;
      return data;
    },
  });
  const { data: ticketLots = [] } = useQuery({
    queryKey: ["ticket-lots-all"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_lots").select("id,zone_id,iva_rate");
      if (error) throw error;
      return data;
    },
  });
  const { data: ticketSales = [] } = useQuery({
    queryKey: ["ticket-sales-all"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("ticket_sales").select("lot_id,sale_date,quantity,unit_price,total_value");
      if (error) throw error;
      return data;
    },
  });

  const dre = useMemo(
    () => computeDREEmpresarialMonthly({
      year,
      transactions, categories, events, eventPartners, ticketZones, ticketLots, ticketSales,
      ticketRevenueSource: "ticket_sales",
    }),
    [year, transactions, categories, events, eventPartners, ticketZones, ticketLots, ticketSales],
  );

  // ── Caixa: RPC get_event_cash_position no mês ──
  const { data: poolRows = [] } = useQuery<any[]>({
    queryKey: ["dre-geral-pool", companyId, dateFrom, dateTo],
    enabled: !!companyId && canView,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_event_cash_position", {
        p_company_id: companyId,
        p_date_from: dateFrom,
        p_date_to: dateTo,
      });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  // ── Retido em bilheteira (helper Fase 1) ──
  const { data: retainedMap = new Map<string, number>() } = useQuery({
    queryKey: ["dre-geral-retained", companyId],
    enabled: !!companyId && canView,
    queryFn: () => fetchTicketOfficeRetainedByEvent(companyId!),
  });

  // ── Approved income não pago (Receitas a receber) — no mês ──
  const { data: receitasAReceber = 0 } = useQuery<number>({
    queryKey: ["dre-geral-income-pending", companyId, dateFrom, dateTo],
    enabled: !!companyId && canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, paid_amount, status, type, is_transitory, exclude_from_result, date, payment_date")
        .eq("status", "approved")
        .eq("type", "income");
      if (error) throw error;
      return (data ?? [])
        .filter((t: any) => !t.is_transitory && !t.exclude_from_result)
        .filter((t: any) => {
          const d: string = t.payment_date || t.date;
          return d && d >= dateFrom && d <= dateTo;
        })
        .reduce((s: number, t: any) => {
          const remaining = Math.max(0, Number(t.amount || 0) - Number(t.paid_amount || 0));
          return s + remaining;
        }, 0);
    },
  });

  // ── Sócios externos por liquidar (todos, sem filtro de mês — saldo "agora") ──
  // partner_paid_expenses NÃO tem coluna `amount`; o valor vem da transação ligada.
  // Excluímos transitórios/excluídos do resultado, à imagem das restantes leituras.
  const { data: sociosPorLiquidar = 0 } = useQuery<number>({
    queryKey: ["dre-geral-partner-paid", companyId],
    enabled: !!companyId && canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("transactions(amount, is_transitory, exclude_from_result)");
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => {
        const t = r.transactions;
        if (!t || t.is_transitory || t.exclude_from_result) return s;
        return s + Number(t.amount || 0);
      }, 0);
    },
  });

  // ── Agregações finais ──
  const cash = useMemo(() => {
    let realized = 0;
    let committedSigned = 0;
    for (const r of poolRows) {
      realized += Number(r.realized || 0);
      committedSigned += Number(r.committed || 0);
    }
    // committed da RPC = (income - expense) approved-não-pago. Separamos:
    //  - Receitas a receber vêm de approved income (já computado acima → receitasAReceber).
    //  - Despesas comprometidas = parcela negativa do committed (em valor absoluto).
    // Para evitar dupla contagem com receitasAReceber, calculamos despesas
    // comprometidas como: committed_income - committed_signed = despesas (positivo).
    const despesasComprometidas = Math.max(0, receitasAReceber - committedSigned);

    let retidoBilheteira = 0;
    for (const v of retainedMap.values()) retidoBilheteira += v;

    const caixaFirme = realized - despesasComprometidas - sociosPorLiquidar;
    const caixaPotencial = caixaFirme + receitasAReceber + retidoBilheteira;
    return { realized, despesasComprometidas, sociosPorLiquidar, caixaFirme, receitasAReceber, retidoBilheteira, caixaPotencial };
  }, [poolRows, retainedMap, receitasAReceber, sociosPorLiquidar]);

  const result = useMemo(() => {
    const mi = monthIndex;
    const receitas = dre.eventIncomeMonthly[mi] || 0;
    const custosDirectos = dre.eventExpenseMonthly[mi] || 0;
    const resultadoEventos = dre.eventResultMonthly[mi] || 0;
    const distribuicao = dre.partnerDistMonthly[mi] || 0;
    const margem = dre.retainedMonthly[mi] || 0;
    const custosCorp = dre.totalCorpMonthly[mi] || 0;
    const resultadoEmpresa = dre.empresaResultMonthly[mi] || 0;
    return {
      receitasEventos: receitas,
      custosDirectosEventos: custosDirectos,
      resultadoEventos,
      distribuicaoSocios: distribuicao,
      margemEventos: margem,
      custosCorporativos: custosCorp,
      resultadoEmpresa,
      hasPartners: dre.hasPartners,
    };
  }, [dre, monthIndex]);

  function handlePdf() {
    exportDREGeralMensalPDF({
      companyName: branding.displayName,
      year, monthIndex,
      result, cash,
    });
  }

  if (!canView) return <div className="p-6 text-sm text-muted-foreground">Sem permissão para ver esta síntese.</div>;
  if (cLoading) return <div className="p-6 text-sm text-muted-foreground">A carregar…</div>;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
            DRE Geral Mensal
            <HelpTooltip text="Folha de síntese para apresentação aos sócios: resultado contabilístico do mês + disposição de caixa. Camada paralela — não altera DRE, BP, Acerto de Sócios nem Resultado." />
          </h1>
          <p className="text-xs text-muted-foreground">{branding.displayName} · {MONTH_NAMES[monthIndex]} {year}</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-[10px]">Mês</Label>
            <Input
              type="month"
              value={monthValue}
              onChange={(e) => {
                const [yy, mm] = e.target.value.split("-").map(Number);
                if (!isNaN(yy) && !isNaN(mm)) { setYear(yy); setMonthIndex(mm - 1); }
              }}
              className="h-9 text-xs"
            />
          </div>
          <Button onClick={handlePdf} size="sm" className="gap-2">
            <FileDown className="h-4 w-4" /> Exportar PDF
          </Button>
        </div>
      </div>

      {/* Secção 1 — Resultado do Mês */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">1. Resultado do Mês</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row label="Receitas de Eventos" value={result.receitasEventos} />
          <Row label="(-) Custos Directos de Eventos" value={-result.custosDirectosEventos} />
          <Row label="= Resultado Líquido de Eventos" value={result.resultadoEventos} total />
          {result.hasPartners && (
            <>
              <Row label="(-) Distribuição Sócios" value={-result.distribuicaoSocios} />
              <Row label="= Margem da Empresa (Eventos)" value={result.margemEventos} total />
            </>
          )}
          <Row label="(-) Custos Corporativos" value={-result.custosCorporativos} />
          <Row label="= RESULTADO DA EMPRESA" value={result.resultadoEmpresa} grand />
        </CardContent>
      </Card>

      {/* Secção 2 — Disposição de Caixa */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            2. Disposição de Caixa
            <HelpTooltip text="Bridge a nível empresa: combina o pool líquido (Fase 1) com receitas por receber e retido em bilheteira. Dois subtotais — firme e potencial — porque o caixa potencial depende de condições." />
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row label="Realizado de caixa (pool líquido)" value={cash.realized}
            hint="Σ realized da RPC get_event_cash_position no mês (bank · cash · prepaid_card)." />
          <Row label="(-) Despesas comprometidas (aprovadas por pagar)" value={-cash.despesasComprometidas} />
          <Row label="(-) Sócios externos por liquidar" value={-cash.sociosPorLiquidar}
            hint="Σ partner_paid_expenses ainda por regularizar." />
          <Row label="= Caixa firme disponível" value={cash.caixaFirme} total />
          <p className="text-[10px] text-muted-foreground -mt-1 mb-1">Caixa real já no pool da empresa.</p>

          <Row label="(+) Receitas a receber" value={cash.receitasAReceber} tag="condicionada"
            hint="Receitas aprovadas (ex.: patrocínios) com pagamento pendente, no mês." />
          <Row label="(+) Retido em bilheteira" value={cash.retidoBilheteira} tag="condicionada"
            hint="Liquidez condicionada — depende de repasse bilheteira/sala (withholds_revenue)." />
          <Row label="= Caixa potencial para distribuição" value={cash.caixaPotencial} grand tag="inclui condicionada" />
        </CardContent>
      </Card>

      {/* Nota de reconciliação */}
      <div className="rounded-md border bg-muted/30 p-3 text-xs flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-semibold mb-1">Porque RESULTADO ≠ CAIXA</p>
          <p className="text-muted-foreground">
            O lucro contabilístico pode estar retido em bilheteira (a repassar), por receber
            (receitas aprovadas ainda não cobradas) ou consumido por compromissos já assumidos
            mas ainda não pagos. A <strong>caixa firme</strong> é a posição actual no pool
            líquido; a <strong>potencial</strong> inclui parcelas condicionadas.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, total, grand, tag, hint }: {
  label: string; value: number; total?: boolean; grand?: boolean; tag?: string; hint?: string;
}) {
  const cls = value < -0.005 ? "text-destructive" : value > 0.005 ? "text-emerald-500" : "text-muted-foreground";
  return (
    <div className={`flex items-center justify-between gap-2 py-1.5 ${
      grand ? "border-t-2 border-primary bg-primary/10 px-2 -mx-2 font-bold text-sm mt-1"
      : total ? "border-t bg-muted/30 px-2 -mx-2 font-semibold mt-1" : ""
    }`}>
      <div className="flex items-center gap-1 min-w-0">
        <span className={grand || total ? "" : "text-sm"}>{label}</span>
        {tag && <Badge variant="outline" className="text-[9px] py-0">{tag}</Badge>}
        {hint && <HelpTooltip text={hint} size={10} />}
      </div>
      <span className={`font-mono tabular-nums text-sm ${grand || total ? "" : cls}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}
