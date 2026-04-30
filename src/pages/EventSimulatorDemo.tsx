/**
 * /demo/simulador — página de demonstração do layout do Event Simulator.
 *
 * Renderiza o mesmo visual da página real com dados de teste em memória
 * (Cenário B do test suite: Festival 2 dias × 3 zonas com overrides),
 * sem dependências de auth/RLS/DB. Útil para QA visual + screenshots.
 */
import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Calculator, TrendingUp, Save, Beer, UtensilsCrossed, Ticket, Info,
  Shirt, Megaphone, Percent, Download, LineChart,
} from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import {
  computeTotals, suggestBreakEven, projectSalesCurve, n,
  type SimGlobalCfg, type SimZoneCfg, type SimCellInput,
} from "@/lib/event-simulator-calc";

// ---- Cenário demo: Festival 2 dias × 3 zonas ----
const DEMO_DAYS = [
  { idx: 0, date: "2026-07-18", label: "Sex 18/07" },
  { idx: 1, date: "2026-07-19", label: "Sáb 19/07" },
];
const DEMO_ZONES = ["Geral", "VIP", "Backstage"];

const DEMO_CFG: SimGlobalCfg & { sponsorship_notes: string; prior_year_real_revenue: number; prior_year_real_expenses: number } = {
  default_drink_avg_ticket: 10,
  default_food_avg_ticket: 5,
  default_drink_cmv_pct: 60,
  default_food_cmv_pct: 70,
  default_drink_conversion_pct: 100,
  default_food_conversion_pct: 50,
  default_merch_avg_ticket: 25,
  default_merch_cmv_pct: 40,
  default_merch_conversion_pct: 8,
  sponsorship_revenue: 35000,
  sponsorship_notes: "Coca-Cola 25k confirmado, Super Bock 10k em pipe",
  variable_spa_pct: 5,
  variable_commission_pct: 5,
  prior_year_real_revenue: 425000,
  prior_year_real_expenses: 380000,
};

const DEMO_ZONE_CFG: Record<string, SimZoneCfg> = {
  Geral: {
    drink_avg_ticket: 7, food_avg_ticket: 4,
    drink_cmv_pct: null, food_cmv_pct: null,
    drink_conversion_pct: null, food_conversion_pct: null,
    merch_avg_ticket: null, merch_cmv_pct: null, merch_conversion_pct: null,
  },
  VIP: {
    drink_avg_ticket: 15, food_avg_ticket: 12, merch_avg_ticket: 40,
    drink_cmv_pct: 50, food_cmv_pct: 60, merch_cmv_pct: 35,
    drink_conversion_pct: null, food_conversion_pct: null, merch_conversion_pct: 20,
  },
  Backstage: {
    drink_avg_ticket: null, food_avg_ticket: null, merch_avg_ticket: null,
    drink_cmv_pct: null, food_cmv_pct: null, merch_cmv_pct: null,
    drink_conversion_pct: 0, food_conversion_pct: 0, merch_conversion_pct: 0,
  },
};

type CellState = { projected_qty: number; courtesy_qty: number; ticket_revenue: number; capacity: number };
const DEMO_INPUTS: Record<string, CellState> = {
  "0::Geral": { projected_qty: 800, courtesy_qty: 30, ticket_revenue: 28000, capacity: 1000 },
  "0::VIP": { projected_qty: 100, courtesy_qty: 10, ticket_revenue: 8500, capacity: 120 },
  "0::Backstage": { projected_qty: 0, courtesy_qty: 25, ticket_revenue: 0, capacity: 30 },
  "1::Geral": { projected_qty: 950, courtesy_qty: 30, ticket_revenue: 33250, capacity: 1000 },
  "1::VIP": { projected_qty: 110, courtesy_qty: 10, ticket_revenue: 9350, capacity: 120 },
  "1::Backstage": { projected_qty: 0, courtesy_qty: 25, ticket_revenue: 0, capacity: 30 },
};

// Simula um BP existente (para break-even e DRE comparativo)
const DEMO_BP_REVENUE = 110000;
const DEMO_BP_EXPENSES = 95000;
const DEMO_BP_TICKET = 78000;
const DEMO_BP_SPONSORS = 30000;

export default function EventSimulatorDemo() {
  const [cfg, setCfg] = useState(DEMO_CFG);
  const [inputs] = useState(DEMO_INPUTS);

  const cells: SimCellInput[] = useMemo(
    () => DEMO_DAYS.flatMap((d) =>
      DEMO_ZONES.map((z) => {
        const s = inputs[`${d.idx}::${z}`];
        return {
          day_index: d.idx, zone_label: z,
          projected_qty: s.projected_qty, courtesy_qty: s.courtesy_qty,
          ticket_revenue: s.ticket_revenue,
        };
      })
    ),
    [inputs]
  );

  const totals = useMemo(() => computeTotals(cells, DEMO_ZONE_CFG, cfg), [cells, cfg]);
  const breakEven = useMemo(() => suggestBreakEven(totals, DEMO_BP_EXPENSES), [totals]);
  const curve = useMemo(() => projectSalesCurve(totals.projectedQty), [totals.projectedQty]);

  const dre = [
    { label: "Real (ano anterior)", revenue: cfg.prior_year_real_revenue, expenses: cfg.prior_year_real_expenses },
    { label: "Forecast DVT (BP atual)", revenue: DEMO_BP_REVENUE, expenses: DEMO_BP_EXPENSES },
    { label: "Projetado (simulador)", revenue: totals.grossRevenue, expenses: DEMO_BP_EXPENSES + totals.cogsTotal + totals.variableTotal },
    { label: "Break-Even", revenue: DEMO_BP_EXPENSES, expenses: DEMO_BP_EXPENSES },
  ];

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground mb-1">DEMO • dados em memória</div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" /> Simulador — Festival Demo 2026
          </h1>
          <p className="text-xs text-muted-foreground">
            {DEMO_DAYS.length} dias × {DEMO_ZONES.length} zonas •
            <Badge variant="outline" className="ml-2">Bilheteira é o motor</Badge>
          </p>
        </div>
        <Button disabled>
          <Save className="mr-2 h-4 w-4" /> Guardar configurações
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI icon={<Ticket className="h-4 w-4" />} label="Público pagante" value={totals.projectedQty.toLocaleString("pt-PT")} sub={`+ ${totals.courtesyQty} cortesias`} />
        <KPI icon={<TrendingUp className="h-4 w-4" />} label="Receita bruta" value={formatCurrency(totals.grossRevenue)} sub={`Bilh. ${formatCurrency(totals.ticketRevenue)}`} />
        <KPI icon={<Beer className="h-4 w-4" />} label="F&B + Merch" value={formatCurrency(totals.drinkRevenue + totals.foodRevenue + totals.merchRevenue)} sub={`Margem ${formatCurrency(totals.derivedMargin)}`} />
        <KPI icon={<Megaphone className="h-4 w-4" />} label="Patrocínios" value={formatCurrency(totals.sponsorsRevenue)} sub={cfg.sponsorship_notes} />
        <KPI icon={<Calculator className="h-4 w-4" />} label="Break-Even" value={breakEven ? `${breakEven.toLocaleString("pt-PT")} pax` : "—"} sub={`Despesas ${formatCurrency(DEMO_BP_EXPENSES)}`} />
      </div>

      <Tabs defaultValue="matrix" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="matrix">Bilheteira</TabsTrigger>
          <TabsTrigger value="zones">F&B / Merch</TabsTrigger>
          <TabsTrigger value="sponsors">Patrocínios</TabsTrigger>
          <TabsTrigger value="variable">Despesas variáveis</TabsTrigger>
          <TabsTrigger value="curve">Curva de vendas</TabsTrigger>
          <TabsTrigger value="dre">DRE</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>

        {/* Bilheteira */}
        <TabsContent value="matrix" className="space-y-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Ticket className="h-4 w-4 text-primary" /> Inputs por dia × zona
              </CardTitle>
              <Button size="sm" variant="outline" disabled>
                <Download className="h-3 w-3 mr-1" /> Puxar do BP ({formatCurrency(DEMO_BP_TICKET)})
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dia</TableHead>
                    <TableHead>Zona</TableHead>
                    <TableHead className="text-right">Capacidade</TableHead>
                    <TableHead className="text-right">Pagantes</TableHead>
                    <TableHead className="text-right">Cortesias</TableHead>
                    <TableHead className="text-right">Receita bilh. (€)</TableHead>
                    <TableHead className="text-right">Margem F&B+Merch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DEMO_DAYS.map((d) => DEMO_ZONES.map((z) => {
                    const s = inputs[`${d.idx}::${z}`];
                    const cell = cells.find((c) => c.day_index === d.idx && c.zone_label === z)!;
                    const r = computeTotals([cell], DEMO_ZONE_CFG, cfg);
                    return (
                      <TableRow key={`${d.idx}-${z}`}>
                        <TableCell className="text-xs whitespace-nowrap">{d.label}</TableCell>
                        <TableCell className="text-xs font-medium">{z}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{s.capacity}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{s.projected_qty}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{s.courtesy_qty}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{formatCurrency(s.ticket_revenue)}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{formatCurrency(r.derivedMargin)}</TableCell>
                      </TableRow>
                    );
                  }))}
                  <TableRow className="font-semibold bg-secondary/30">
                    <TableCell colSpan={3} className="text-xs">TOTAL</TableCell>
                    <TableCell className="text-right">{totals.projectedQty.toLocaleString("pt-PT")}</TableCell>
                    <TableCell className="text-right">{totals.courtesyQty}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.ticketRevenue)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.derivedMargin)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Zones */}
        <TabsContent value="zones" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Beer className="h-4 w-4 text-primary" /> Conversão e Ticket Médio por Zona
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Receitas escalam com público total (pagantes + cortesias). Vazio = usa defaults globais.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2}>Zona</TableHead>
                    <TableHead className="text-right" colSpan={3}><Beer className="inline h-3 w-3 mr-1" /> Bebidas</TableHead>
                    <TableHead className="text-right" colSpan={3}><UtensilsCrossed className="inline h-3 w-3 mr-1" /> Comida</TableHead>
                    <TableHead className="text-right" colSpan={3}><Shirt className="inline h-3 w-3 mr-1" /> Merch</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="text-right text-xs">Conv.%</TableHead>
                    <TableHead className="text-right text-xs">Ticket €</TableHead>
                    <TableHead className="text-right text-xs">CMV %</TableHead>
                    <TableHead className="text-right text-xs">Conv.%</TableHead>
                    <TableHead className="text-right text-xs">Ticket €</TableHead>
                    <TableHead className="text-right text-xs">CMV %</TableHead>
                    <TableHead className="text-right text-xs">Conv.%</TableHead>
                    <TableHead className="text-right text-xs">Ticket €</TableHead>
                    <TableHead className="text-right text-xs">CMV %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DEMO_ZONES.map((z) => {
                    const zc = DEMO_ZONE_CFG[z];
                    const v = (val: number | null, fb: number) => (
                      <span className={val == null ? "text-muted-foreground italic" : "font-mono"}>
                        {val == null ? fb : val}
                      </span>
                    );
                    return (
                      <TableRow key={z}>
                        <TableCell className="font-medium text-xs">{z}</TableCell>
                        <TableCell className="text-right text-xs">{v(zc.drink_conversion_pct, cfg.default_drink_conversion_pct)}</TableCell>
                        <TableCell className="text-right text-xs">{v(zc.drink_avg_ticket, cfg.default_drink_avg_ticket)}</TableCell>
                        <TableCell className="text-right text-xs">{v(zc.drink_cmv_pct, cfg.default_drink_cmv_pct)}</TableCell>
                        <TableCell className="text-right text-xs">{v(zc.food_conversion_pct, cfg.default_food_conversion_pct)}</TableCell>
                        <TableCell className="text-right text-xs">{v(zc.food_avg_ticket, cfg.default_food_avg_ticket)}</TableCell>
                        <TableCell className="text-right text-xs">{v(zc.food_cmv_pct, cfg.default_food_cmv_pct)}</TableCell>
                        <TableCell className="text-right text-xs">{v(zc.merch_conversion_pct, cfg.default_merch_conversion_pct)}</TableCell>
                        <TableCell className="text-right text-xs">{v(zc.merch_avg_ticket, cfg.default_merch_avg_ticket)}</TableCell>
                        <TableCell className="text-right text-xs">{v(zc.merch_cmv_pct, cfg.default_merch_cmv_pct)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-semibold bg-secondary/30 [&>td]:text-xs">
                    <TableCell>Receita projetada</TableCell>
                    <TableCell colSpan={3} className="text-right font-mono">{formatCurrency(totals.drinkRevenue)}</TableCell>
                    <TableCell colSpan={3} className="text-right font-mono">{formatCurrency(totals.foodRevenue)}</TableCell>
                    <TableCell colSpan={3} className="text-right font-mono">{formatCurrency(totals.merchRevenue)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sponsors */}
        <TabsContent value="sponsors" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-primary" /> Patrocínios e Apoios
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Independente do público projetado. BP atual: <strong>{formatCurrency(DEMO_BP_SPONSORS)}</strong> (1.2.01 + 1.2.02).
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Receita de patrocínios projetada (€)">
                  <Input type="number" value={cfg.sponsorship_revenue} onChange={(e) => setCfg((s) => ({ ...s, sponsorship_revenue: n(e.target.value) }))} />
                </Field>
                <Field label="Notas / Patrocinadores">
                  <Input value={cfg.sponsorship_notes} onChange={(e) => setCfg((s) => ({ ...s, sponsorship_notes: e.target.value }))} />
                </Field>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 text-xs">
                <span>BP atual tem {formatCurrency(DEMO_BP_SPONSORS)} em patrocínios.</span>
                <Button size="sm" variant="outline" onClick={() => setCfg((s) => ({ ...s, sponsorship_revenue: DEMO_BP_SPONSORS }))}>
                  <Download className="h-3 w-3 mr-1" /> Puxar do BP
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Variable */}
        <TabsContent value="variable" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Percent className="h-4 w-4 text-primary" /> Despesas variáveis (escalam com receita)
              </CardTitle>
              <p className="text-xs text-muted-foreground">Calculadas em tempo real sobre a receita bruta projetada.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="SPA / Direitos autorais (% receita bruta)">
                  <Input type="number" value={cfg.variable_spa_pct} onChange={(e) => setCfg((s) => ({ ...s, variable_spa_pct: n(e.target.value) }))} />
                </Field>
                <Field label="Comissão de bilheteira (% receita de bilheteira)">
                  <Input type="number" value={cfg.variable_commission_pct} onChange={(e) => setCfg((s) => ({ ...s, variable_commission_pct: n(e.target.value) }))} />
                </Field>
              </div>
              <div className="rounded-lg border p-3 space-y-1 text-xs">
                <RowKV label="Receita bruta" value={formatCurrency(totals.grossRevenue)} />
                <RowKV label={`SPA (${cfg.variable_spa_pct}%)`} value={formatCurrency(totals.variableSpa)} />
                <RowKV label={`Comissão bilh. (${cfg.variable_commission_pct}%)`} value={formatCurrency(totals.variableCommission)} />
                <RowKV label="Total variáveis" value={formatCurrency(totals.variableTotal)} bold />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Curve */}
        <TabsContent value="curve" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <LineChart className="h-4 w-4 text-primary" /> Curva de vendas projetada (preset)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Total esperado: <strong>{totals.projectedQty.toLocaleString("pt-PT")}</strong> bilhetes.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dias antes</TableHead>
                    <TableHead className="text-right">% cumulativo</TableHead>
                    <TableHead className="text-right">Bilhetes esperados</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {curve.map((c) => (
                    <TableRow key={c.daysBefore}>
                      <TableCell className="text-xs">D-{c.daysBefore}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{c.cumulativePct}%</TableCell>
                      <TableCell className="text-right text-xs font-mono">{c.qty.toLocaleString("pt-PT")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DRE */}
        <TabsContent value="dre" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">DRE comparativo</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cenário</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Despesas</TableHead>
                    <TableHead className="text-right">Resultado</TableHead>
                    <TableHead className="text-right">Margem %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dre.map((d) => {
                    const result = d.revenue - d.expenses;
                    const margin = d.revenue > 0 ? (result / d.revenue) * 100 : 0;
                    return (
                      <TableRow key={d.label}>
                        <TableCell className="text-xs font-medium">{d.label}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{formatCurrency(d.revenue)}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{formatCurrency(d.expenses)}</TableCell>
                        <TableCell className={`text-right text-xs font-mono font-semibold ${result >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                          {formatCurrency(result)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">{margin.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="text-xs text-muted-foreground mt-3 flex gap-2 items-start">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Adoptar cenário (criar/atualizar forecasts reais) chega na Entrega 4.</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Config */}
        <TabsContent value="config" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Beer className="h-4 w-4" /> Defaults Bebidas</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-3 gap-3">
                <Field label="Conv. %"><Input type="number" value={cfg.default_drink_conversion_pct} onChange={(e) => setCfg((s) => ({ ...s, default_drink_conversion_pct: n(e.target.value) }))} /></Field>
                <Field label="Ticket €"><Input type="number" value={cfg.default_drink_avg_ticket} onChange={(e) => setCfg((s) => ({ ...s, default_drink_avg_ticket: n(e.target.value) }))} /></Field>
                <Field label="CMV %"><Input type="number" value={cfg.default_drink_cmv_pct} onChange={(e) => setCfg((s) => ({ ...s, default_drink_cmv_pct: n(e.target.value) }))} /></Field>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><UtensilsCrossed className="h-4 w-4" /> Defaults Comida</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-3 gap-3">
                <Field label="Conv. %"><Input type="number" value={cfg.default_food_conversion_pct} onChange={(e) => setCfg((s) => ({ ...s, default_food_conversion_pct: n(e.target.value) }))} /></Field>
                <Field label="Ticket €"><Input type="number" value={cfg.default_food_avg_ticket} onChange={(e) => setCfg((s) => ({ ...s, default_food_avg_ticket: n(e.target.value) }))} /></Field>
                <Field label="CMV %"><Input type="number" value={cfg.default_food_cmv_pct} onChange={(e) => setCfg((s) => ({ ...s, default_food_cmv_pct: n(e.target.value) }))} /></Field>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shirt className="h-4 w-4" /> Defaults Merchandising</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-3 gap-3">
                <Field label="Conv. %"><Input type="number" value={cfg.default_merch_conversion_pct} onChange={(e) => setCfg((s) => ({ ...s, default_merch_conversion_pct: n(e.target.value) }))} /></Field>
                <Field label="Ticket €"><Input type="number" value={cfg.default_merch_avg_ticket} onChange={(e) => setCfg((s) => ({ ...s, default_merch_avg_ticket: n(e.target.value) }))} /></Field>
                <Field label="CMV %"><Input type="number" value={cfg.default_merch_cmv_pct} onChange={(e) => setCfg((s) => ({ ...s, default_merch_cmv_pct: n(e.target.value) }))} /></Field>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Histórico Real (ano anterior)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Receita real anterior (€)"><Input type="number" value={cfg.prior_year_real_revenue} onChange={(e) => setCfg((s) => ({ ...s, prior_year_real_revenue: n(e.target.value) }))} /></Field>
                <Field label="Despesas reais anteriores (€)"><Input type="number" value={cfg.prior_year_real_expenses} onChange={(e) => setCfg((s) => ({ ...s, prior_year_real_expenses: n(e.target.value) }))} /></Field>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
        <div className="text-lg font-semibold mt-1">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function RowKV({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold border-t pt-1 mt-1" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
