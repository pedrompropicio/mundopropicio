# Simulador — Dashboard Financeiro v2: Prompt de Implementação para o Lovable

> **Estado:** Mockup aprovado pelo utilizador em 2026-05-05.
> Referência visual: `.lovable/memory/features/simulator-dashboard-v2-mockup.html`
> Design brief: `.lovable/memory/features/simulator-dashboard-v2-brief.md`

---

## Decisões Finais (pós-aprovação do mockup)

| Questão | Decisão |
|---------|---------|
| Dark mode | Aplicar **apenas ao wrapper do ExecutiveDashboard** via classe `data-theme="financial"` — não alterar tema global |
| FinancialTable vs CompareCards | **FinancialTable** — uma única tabela densa substitui os 6 CompareCards |
| Donut Chart | **Sim** — usar `innerRadius` no Recharts PieChart |
| Heatmap de cidades | **Sim** — CityHeatCard grid substitui tabela plana na turnê |
| Export PDF safe-mode | **Sim** — adicionar classe `pdf-rendering` ao rootRef durante exportação, CSS desactiva backdrop-blur e transparências |

---

## Regras Absolutas de Não-Regressão

1. **Props de ExecutiveDashboard.tsx NÃO mudam.** Todos os callers (EventSimulator, TourSimulator) mantêm-se sem qualquer alteração.
2. **useCitySimulator, event-ab-calc, useEventABScenarios** — não tocar.
3. **DailyAttendanceCard** e **ForecastBoostCalibrator** — não tocar.
4. **Export PDF** via `exportNodeToPdf` mantém-se funcional.
5. **CompareCard** pode ser eliminado após FinancialTable estar implementada e testada.
6. O novo layout deve funcionar em **light mode** quando `data-theme="financial"` não está aplicado — usar variáveis CSS que fazem fallback ao tema do sistema.

---

## Ficheiros a Criar (novos componentes)

```
src/components/simulator/KpiHero.tsx
src/components/simulator/ScenarioPill.tsx
src/components/simulator/StatusBadge.tsx
src/components/simulator/ProgressKpi.tsx
src/components/simulator/FinancialTable.tsx
src/components/simulator/CityHeatCard.tsx
```

## Ficheiros a Modificar

```
src/components/simulator/ExecutiveDashboard.tsx   ← reescrever layout (preservar lógica)
```

---

## Fase 1 — Componentes Atómicos

### 1.1 KpiHero.tsx

Componente de KPI grande no topo do dashboard (Hero Strip).

```tsx
interface KpiHeroProps {
  label: string;
  value: string;           // já formatado ex: "€ 1.24M" ou "−6.8%"
  delta?: string;          // ex: "+12.3%" ou "−5k bilhetes"
  deltaPositive?: boolean; // true=verde, false=vermelho, undefined=neutro
  subtext?: string;        // ex: "78% do Forecast (€ 1.59M)"
  progress?: number;       // 0-100, mostra barra abaixo se definido
  progressColor?: "blue" | "emerald" | "rose" | "amber";
  tone?: "positive" | "negative" | "neutral" | "muted";
}

// Render pattern:
// <div className="flex flex-col gap-1 p-4 rounded-xl border [tone-classes]">
//   <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
//     {label}
//   </span>
//   <span className="font-bold tabular-nums leading-none [tone-value-classes]"
//         style={{ fontSize: "clamp(20px, 2.5vw, 28px)", fontFamily: "monospace" }}>
//     {value}
//   </span>
//   {delta && (
//     <span className="flex items-center gap-1 text-xs font-semibold [delta-color]">
//       {deltaPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
//       {delta}
//     </span>
//   )}
//   {subtext && <span className="text-[11px] text-muted-foreground">{subtext}</span>}
//   {progress !== undefined && (
//     <div className="mt-1 h-[3px] rounded-full bg-muted/30 overflow-hidden">
//       <div className="h-full rounded-full [progress-color-class]"
//            style={{ width: `${Math.min(100, progress)}%` }} />
//     </div>
//   )}
// </div>

// Tone classes:
// positive: bg-emerald-500/5 border-emerald-500/15 → value: text-emerald-400
// negative: bg-rose-500/5    border-rose-500/15    → value: text-rose-400
// neutral:  bg-muted/10      border-border         → value: text-foreground
// muted:    bg-transparent   border-border/50      → value: text-foreground
```

### 1.2 ScenarioPill.tsx

Selector de cenário com 3 pills coloridos.

```tsx
interface ScenarioPillProps {
  active: "real" | "breakeven" | "forecast";
  onChange: (s: "real" | "breakeven" | "forecast") => void;
}

// Render: 3 botões inline dentro de um container pill
// Cada botão quando activo tem fundo semântico:
//   real:      bg-blue-500/15    text-blue-400    border-blue-500/30
//   breakeven: bg-amber-500/15   text-amber-400   border-amber-500/30
//   forecast:  bg-emerald-500/15 text-emerald-400 border-emerald-500/30
// Inactivo: text-muted-foreground hover:text-foreground
```

### 1.3 StatusBadge.tsx

Semáforo de status (ok/fail) com label e subtext.

```tsx
interface StatusBadgeProps {
  ok: boolean | "warn";   // true=verde, false=vermelho, "warn"=âmbar
  label: string;
  subtext?: string;
}

// Render: dot colorido + label bold + subtext muted
// ok=true  → dot verde  #10b981
// ok=false → dot vermelho #f43f5e
// ok="warn"→ dot âmbar  #f59e0b
```

### 1.4 ProgressKpi.tsx

Card com barra de progresso (Real → BE → Forecast).

```tsx
interface ProgressKpiProps {
  label: string;
  current: number;
  currentLabel: string;
  beTarget: number;
  beLabel: string;
  fcTarget: number;
  fcLabel: string;
  formatFn?: (v: number) => string;
  footer?: string;  // ex: "Faltam X pessoas para BE"
}

// 3 barras sobrepostas com labels e valores alinhados à direita
// Barra Real: azul (progress = current/max)
// Barra BE:   âmbar (progress = 100% ou beTarget/max)
// Barra FC:   emerald (progress = 100%)
// max = Math.max(current, beTarget, fcTarget)
```

---

## Fase 2 — FinancialTable

### 2.1 FinancialTable.tsx

Substitui os 6 CompareCards. Tabela densa com 5 colunas.

```tsx
interface FinancialRow {
  label: string;
  indent?: boolean;        // 24px left padding (subcategorias)
  values: [number, number, number]; // [real, be, forecast]
  delta?: number;          // real→forecast delta (valor absoluto ou %)
  deltaType?: "value" | "pct";
  tone?: "positive" | "negative" | "neutral";
  bold?: boolean;
  separator?: boolean;     // linha separadora antes desta row
  sectionHeader?: "revenue" | "cost" | "kpis"; // header colorido
}

interface FinancialTableProps {
  rows: FinancialRow[];
  active: "real" | "breakeven" | "forecast";
  formatFn: (v: number) => string;
}

// Layout:
// Col 1: Linha (flex, 34% width)
// Col 2: Real   (destaque quando active==="real")
// Col 3: BE     (destaque quando active==="breakeven")
// Col 4: FC     (destaque quando active==="forecast")
// Col 5: Δ Real→FC
//
// Célula activa: bg-primary/8 rounded-sm
// Section headers: texto colorido uppercase tracking-wide
//   revenue → text-blue-400
//   cost    → text-rose-400
//   kpis    → text-violet-400
//
// RESULTADO row: fundo tinted, fonte maior (text-base ou text-lg), bold
// Delta positivo: text-emerald-400  negativo: text-rose-400
```

### 2.2 Construção das rows em ExecutiveDashboard

Substituir os 6 CompareCard calls por um único `<FinancialTable>` com as seguintes rows:

```
sectionHeader "revenue" → label "Receitas"
  indent: Bilheteira        [today.ticketsRevenue, breakeven.ticketsRevenue, forecast.ticketsRevenue]
  indent: A&B               [(today.drinkRevenue+today.foodRevenue), ...]
  indent: Patrocínios       [today.sponsorRevenue, ...]
  indent: Souvenir          [today.souvenirRevenue, ...]
  indent: Outros            [today.otherCredits, ...]
  bold:   RECEITA TOTAL     [today.totalRevenue, ...]  → delta pct

sectionHeader "cost" → label "Custos"
  (top 7 costLines mapeadas dinamicamente)
  bold:   CUSTO TOTAL       [todayCosts.totalCost, ...]

separator + RESULTADO       [todayRes.general, beRes.general, fcRes.general]
  → tone: positive se ≥0, negative se <0

sectionHeader "kpis" → label "Indicadores por pessoa"
  indent: TM Ingresso       [todayKpis.tmTickets, ...]
  indent: TM A&B            [todayKpis.tmAB, ...]
  indent: Custo/pessoa      [todayKpis.costPerPerson, ...]
  indent: Resultado/pessoa  [todayKpis.resultPerPerson, ...]  → signed
```

---

## Fase 3 — Gráficos e CityHeatCard

### 3.1 Donut Chart (em ExecutiveDashboard)

Substituir o PieChart actual por:

```tsx
<PieChart>
  <Pie
    data={revenueMixActive}
    dataKey="value"
    nameKey="name"
    outerRadius={80}
    innerRadius={50}        // ← NOVO: torna donut
    paddingAngle={2}
    label={false}           // ← sem labels externas
  >
    {revenueMixActive.map((_, i) => (
      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
    ))}
  </Pie>
  <Tooltip formatter={(v: any) => fmt(Number(v))} />
</PieChart>
// Legenda: componente custom inline à direita (não usar Legend do recharts)
// Cada item: dot colorido + name + pct (value/total * 100)
```

### 3.2 BarChart de Custos — Melhorias

```tsx
// Remover CartesianGrid ou opacity 0.04
// Adicionar radius nas bars:
<Bar dataKey="Real"     fill="#3b82f6" radius={[3,3,0,0]} />
<Bar dataKey="BE"       fill="#f59e0b" radius={[3,3,0,0]} />
<Bar dataKey="Forecast" fill="#10b981" radius={[3,3,0,0]} />
// Tooltip com formatCurrency
```

### 3.3 BarChart de Público — Reference Line

```tsx
import { ReferenceLine } from "recharts";
// Adicionar quando dailyCapacity está definido:
{dailyCapacity && (
  <ReferenceLine y={dailyCapacity} stroke="#f59e0b" strokeDasharray="4 3"
    strokeOpacity={0.5} label={{ value: "Cap.", fill: "#f59e0b", fontSize: 9 }} />
)}
```

### 3.4 CityHeatCard.tsx

Card de cidade com fundo semântico por nível de margem.

```tsx
interface CityHeatCardProps {
  name: string;
  publico: number;
  ticketMedio: number;
  abPerPerson: number;
  receita: number;
  custo: number;
  resultado: number;
  margem: number;           // percentagem, pode ser negativa
  breakEvenQty: number;
  formatFn: (v: number) => string;
  fmtNum: (v: number) => string;
}

// Cor do fundo baseada em margem:
// margem >= 30:  bg-emerald-500/8  border-emerald-500/20  → pill text-emerald-400
// 10 <= m < 30: bg-blue-500/8    border-blue-500/20     → pill text-blue-400
// 0 <= m < 10:  bg-amber-500/8   border-amber-500/20    → pill text-amber-400
// m < 0:        bg-rose-500/8    border-rose-500/20     → pill text-rose-400

// Layout interno:
// Linha topo: nome (font-bold) + pill de margem (%)
// Público: mono bold grande (22px) + label "pessoas · forecast"
// Grid 2 colunas: Receita/Custo/Resultado
// Footer: "BE: X pessoas" (cor âmbar se breakEvenQty > publico)
```

---

## Fase 4 — Novo Layout de ExecutiveDashboard

### 4.1 Estrutura geral do return()

```tsx
return (
  // Wrapper com data-theme para CSS scoped
  <div data-theme="financial" className="space-y-4">

    {/* TOOLBAR — fora do rootRef */}
    <div className="flex items-center justify-between print:hidden">
      <ScenarioPill active={active} onChange={setActive} />
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">
          Actualizado em {new Date().toLocaleDateString("pt-PT")}
        </span>
        <Button onClick={handleExport} disabled={exporting} variant="outline" size="sm">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          <span className="hidden sm:inline ml-1">PDF</span>
        </Button>
      </div>
    </div>

    {/* CONTEÚDO CAPTURADO PARA PDF */}
    <div ref={rootRef} className="space-y-4">

      {/* CABEÇALHO DO PDF */}
      <div className="flex items-end justify-between border-b pb-2">
        <div>
          <h2 className="text-lg font-bold">{eventName}</h2>
          <p className="text-xs text-muted-foreground">
            Dashboard Executivo · <span className="font-semibold text-foreground">{SCEN_LABELS[active]}</span>
          </p>
        </div>
        <div className="text-right text-[10px] text-muted-foreground">
          {new Date().toLocaleDateString("pt-PT")} · Real · Break Even · Forecast
        </div>
      </div>

      {/* ZONA 1 — HERO STRIP */}
      <section>
        <p className="section-label mb-2">Visão geral · cenário {SCEN_LABELS[active]}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiHero label="Resultado Geral"
            value={fmt(sel.res.general)}
            tone={sel.res.general >= 0 ? "positive" : "negative"}
            delta={...}  deltaPositive={...}
            subtext={reachedBE ? "Break Even atingido" : `Faltam ${fmt(Math.abs(sel.res.general))} para BE`}
          />
          <KpiHero label="Receita Total"
            value={fmt(sel.rev.totalRevenue)}
            tone="neutral"
            subtext={`${pctForecast}% do Forecast (${fmt(forecast.totalRevenue)})`}
            progress={pctForecast} progressColor="blue"
          />
          <KpiHero label="Custo Total"
            value={fmt(sel.cost.totalCost)}
            tone="muted"
            subtext={`Custo/pessoa: ${fmt(sel.kpis.costPerPerson)}`}
          />
          <KpiHero label="Público Total"
            value={fmtNum(sel.kpis.totalPublic)}
            tone="neutral"
            subtext={`${pctPubForecast}% do alvo (${fmtNum(fcTargetQty)})`}
            progress={pctPubForecast} progressColor="emerald"
          />
          <KpiHero label="Margem · TM Ingresso"
            value={fmtPct(margemPct)}
            tone={margemPct >= 0 ? "positive" : "negative"}
            subtext={`TM: ${fmt(sel.kpis.tmTickets)} · A&B/pp: ${fmt(sel.kpis.tmAB)}`}
          />
        </div>
      </section>

      {/* ZONA 2 — STATUS BAR */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-4 py-2.5 text-sm">
        <StatusBadge ok={reachedBE} label="Break Even"
          subtext={reachedBE ? undefined : `Faltam ${fmtNum(needForBE)} bilhetes`} />
        <StatusBadge ok={todayRes.general >= 0} label="Margem positiva"
          subtext={`Resultado: ${fmt(todayRes.general)}`} />
        <StatusBadge ok={pctPubForecast >= 100 ? true : pctPubForecast >= 60 ? "warn" : false}
          label={`Forecast: ${pctPubForecast.toFixed(0)}% atingido`} />
        {abModule.hasConfig && (
          <StatusBadge ok={abMarginReal >= 0} label="A&B activo"
            subtext={`Margem A&B: ${fmt(abMarginReal)}`} />
        )}
      </div>

      {/* ZONA 3 — FINANCIAL TABLE + KPI STACK */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)" }}>
        <FinancialTable rows={financialRows} active={active} formatFn={fmt} />
        <div className="flex flex-col gap-3">
          <ProgressKpi label="Público" current={todayKpis.totalPublic}
            currentLabel="Real" beTarget={beTargetQty} beLabel="Break Even"
            fcTarget={fcTargetQty} fcLabel="Forecast" formatFn={fmtNum}
            footer={`Faltam ${fmtNum(needForBE)} pessoas para BE`}
          />
          <Card className="...">  {/* Break Even card */} </Card>
          {ab3 && <Card className="...">  {/* A&B card */} </Card>}
        </div>
      </div>

      {/* ZONA 3.5 — Público por dia */}
      {eventId && <DailyAttendanceCard eventId={eventId} dailyCapacity={dailyCapacity} />}

      {/* ZONA 4 — GRÁFICOS */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Donut Mix Receitas */}
        {/* BarChart Custos (com radius) */}
        {/* BarChart Público (com ReferenceLine) */}
      </div>

      {/* ZONA 5 — HEATMAP CIDADES (só turnê) */}
      {tourBreakdowns && tourBreakdowns.length > 0 && (
        <section>
          <p className="section-label mb-3">Comparativo entre cidades · {SCEN_LABELS[active]}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tourBreakdowns.map((c) => (
              <CityHeatCard key={c.name} {...c} formatFn={fmt} fmtNum={fmtNum} />
            ))}
          </div>
        </section>
      )}

    </div>
  </div>
);
```

---

## Fase 5 — CSS Scoped (dark-glass) + PDF Safe-Mode

### 5.1 Adicionar ao global CSS ou como style block no componente

```css
/* Dark-glass theme — aplica apenas dentro de [data-theme="financial"] */
[data-theme="financial"] {
  --fin-bg:        #0a0f1a;
  --fin-surface:   rgba(15, 23, 42, 0.70);
  --fin-border:    rgba(148, 163, 184, 0.08);
  --fin-text:      #e2e8f0;
  --fin-muted:     #64748b;
}

[data-theme="financial"] .glass {
  background:       var(--fin-surface);
  border-color:     var(--fin-border);
  backdrop-filter:  blur(12px);
}

/* PDF safe-mode: desactivar efeitos visuais avançados durante exportação */
[data-theme="financial"].pdf-rendering .glass,
[data-theme="financial"].pdf-rendering [class*="backdrop"] {
  backdrop-filter: none !important;
  background:      rgba(15, 23, 42, 0.95) !important;
}
```

### 5.2 Aplicar pdf-rendering durante exportação

```tsx
const handleExport = async () => {
  if (!rootRef.current) return;
  setExporting(true);
  // Activar safe-mode
  rootRef.current.closest('[data-theme="financial"]')?.classList.add("pdf-rendering");
  try {
    await exportNodeToPdf(rootRef.current, `Dashboard_${eventName}_${SCEN_LABELS[active]}.pdf`, {
      orientation: "l",
      title: `${eventName} — Dashboard Executivo · ${SCEN_LABELS[active]}`,
    });
    toast({ title: "PDF exportado", description: SCEN_LABELS[active] });
  } catch (e: any) {
    toast({ title: "Erro a exportar", description: e.message, variant: "destructive" });
  } finally {
    rootRef.current.closest('[data-theme="financial"]')?.classList.remove("pdf-rendering");
    setExporting(false);
  }
};
```

---

## Helpers e Cálculos Auxiliares Necessários

Adicionar estes memos dentro de ExecutiveDashboard, **antes** do return():

```tsx
// % do forecast atingida (receita)
const pctForecast = forecast.totalRevenue > 0
  ? Math.round((today.totalRevenue / forecast.totalRevenue) * 100)
  : 0;

// % do público forecast atingida
const pctPubForecast = fcTargetQty > 0
  ? Math.round((todayKpis.totalPublic / fcTargetQty) * 100)
  : 0;

// Margem % do cenário activo
const margemPct = sel.rev.totalRevenue > 0
  ? (sel.res.general / sel.rev.totalRevenue) * 100
  : 0;

// Rows da FinancialTable (memo de costLines)
const financialRows = useMemo((): FinancialRow[] => {
  const topCosts = [...(costLines ?? [])]
    .filter((c: any) => !c.is_ab_passthrough)
    .map((c: any) => ({
      label: c.label || "—",
      indent: true,
      values: [Number(c.actual_amount || 0), Number(c.break_even_amount || 0), Number(c.forecast_amount || 0)] as [number,number,number],
    }))
    .filter((c) => c.values.some(v => v > 0))
    .sort((a, b) => b.values[0] - a.values[0])
    .slice(0, 7);

  return [
    { label: "Receitas", sectionHeader: "revenue" },
    { label: "Bilheteira",  indent: true, values: [today.ticketsRevenue,  breakeven.ticketsRevenue,  forecast.ticketsRevenue] },
    { label: "A&B",         indent: true, values: [(today.drinkRevenue||0)+(today.foodRevenue||0), (breakeven.drinkRevenue||0)+(breakeven.foodRevenue||0), (forecast.drinkRevenue||0)+(forecast.foodRevenue||0)] },
    { label: "Patrocínios", indent: true, values: [today.sponsorRevenue,  breakeven.sponsorRevenue,  forecast.sponsorRevenue] },
    { label: "Souvenir",    indent: true, values: [today.souvenirRevenue, breakeven.souvenirRevenue, forecast.souvenirRevenue] },
    { label: "Outros",      indent: true, values: [today.otherCredits,    breakeven.otherCredits,    forecast.otherCredits] },
    { label: "RECEITA TOTAL", bold: true, separator: true,
      values: [today.totalRevenue, breakeven.totalRevenue, forecast.totalRevenue],
      delta: today.totalRevenue > 0 ? ((forecast.totalRevenue - today.totalRevenue) / today.totalRevenue) * 100 : 0,
      deltaType: "pct" },
    { label: "Custos", sectionHeader: "cost" },
    ...topCosts,
    { label: "CUSTO TOTAL", bold: true, separator: true,
      values: [todayCosts.totalCost, beCosts.totalCost, fcCosts.totalCost] },
    { label: "RESULTADO", bold: true, separator: true,
      values: [todayRes.general, beRes.general, fcRes.general],
      tone: todayRes.general >= 0 ? "positive" : "negative",
      delta: todayRes.general !== 0 ? fcRes.general - todayRes.general : undefined,
      deltaType: "value" },
    { label: "Indicadores por pessoa", sectionHeader: "kpis" },
    { label: "TM Ingresso",      indent: true, values: [todayKpis.tmTickets,      beKpis.tmTickets,      fcKpis.tmTickets] },
    { label: "TM A&B",           indent: true, values: [todayKpis.tmAB,           beKpis.tmAB,           fcKpis.tmAB] },
    { label: "Custo / pessoa",   indent: true, values: [todayKpis.costPerPerson,   beKpis.costPerPerson,   fcKpis.costPerPerson] },
    { label: "Resultado / pessoa", indent: true, tone: todayKpis.resultPerPerson >= 0 ? "positive" : "negative",
      values: [todayKpis.resultPerPerson, beKpis.resultPerPerson, fcKpis.resultPerPerson] },
  ];
}, [today, breakeven, forecast, todayCosts, beCosts, fcCosts, todayRes, beRes, fcRes, todayKpis, beKpis, fcKpis, costLines]);
```

---

## Imports Novos Necessários

```tsx
// Novos ícones
import { TrendingUp, TrendingDown } from "lucide-react";

// Novos componentes
import KpiHero           from "@/components/simulator/KpiHero";
import ScenarioPill      from "@/components/simulator/ScenarioPill";
import StatusBadge       from "@/components/simulator/StatusBadge";
import ProgressKpi       from "@/components/simulator/ProgressKpi";
import FinancialTable    from "@/components/simulator/FinancialTable";
import CityHeatCard      from "@/components/simulator/CityHeatCard";

// Recharts — adicionar aos existentes:
import { ReferenceLine } from "recharts";
```

---

## Checklist de Implementação

**Fase 1 — Componentes atómicos (sem risco)**
- [ ] KpiHero.tsx criado e testado isoladamente
- [ ] ScenarioPill.tsx criado
- [ ] StatusBadge.tsx criado
- [ ] ProgressKpi.tsx criado

**Fase 2 — FinancialTable**
- [ ] FinancialTable.tsx criado com suporte a sectionHeader, indent, tone, bold, separator
- [ ] financialRows memo adicionado ao ExecutiveDashboard
- [ ] CompareCards substituídos pelo novo FinancialTable
- [ ] Verificar que os 3 cenários mostram os mesmos números que antes

**Fase 3 — Layout e Gráficos**
- [ ] ExecutiveDashboard.tsx reescrito com nova estrutura de zonas
- [ ] Donut chart (innerRadius adicionado)
- [ ] BarChart de custos (radius adicionado)
- [ ] BarChart público (ReferenceLine adicionada)
- [ ] CityHeatCard.tsx criado
- [ ] Heatmap de cidades substitui tabela plana na zona 5

**Fase 4 — CSS e PDF**
- [ ] data-theme="financial" aplicado ao wrapper
- [ ] pdf-rendering class remove backdrop-blur durante exportação
- [ ] handleExport actualizado

**Fase 5 — Verificação final**
- [ ] EventSimulator → Dashboard Executivo: funciona sem alterações
- [ ] TourSimulator → Dashboard Executivo: funciona sem alterações
- [ ] Export PDF produz ficheiro legível (sem artefactos de backdrop-blur)
- [ ] Responsivo: mobile (1 col hero), tablet (2-3 col), desktop (5 col)
- [ ] Tema light mode: dashboard legível mesmo sem dark theme

---

## Referência Visual

Mockup HTML completo disponível em:
`.lovable/memory/features/simulator-dashboard-v2-mockup.html`

Consultar mockup para:
- Cores exactas e hex values
- Hierarquia tipográfica
- Layout do CityHeatCard (verde/azul/âmbar/vermelho)
- Layout do FinancialTable com highlight da coluna activa
- Barra de progresso tripla no ProgressKpi
