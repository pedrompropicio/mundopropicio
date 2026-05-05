# Simulador — Dashboard Financeiro v2 (Design Brief)

> **Objectivo:** Redesenhar o ExecutiveDashboard e o layout geral do Simulador para um padrão
> visual de plataformas financeiras profissionais (estilo Bloomberg Terminal / Refinitiv / Koyfin).
> Criado: 2026-05-05

---

## 1. Diagnóstico do Layout Actual

### O que existe hoje (ExecutiveDashboard.tsx — 809 linhas)

**Estrutura de dados (props imutáveis — não mudar):**
- 3 cenários: real (hoje), breakeven, forecast
- Cada cenário: rev (receitas por linha), cost (custos), res (resultado), kpis (por pessoa)
- costLines: array de linhas de custo com valores nos 3 cenários
- dailyTotals: público pagante e cortesias por dia
- sessions: vendas reais por zona/dia (para TM por zona)
- abModule: módulo A&B com totals nos 3 cenários
- beSolution / fcSolution: qty e revenue alvo de BE e Forecast
- tourBreakdowns: comparativo entre cidades (só Turnê)

**Componentes actuais:**
1. Toolbar: selector Real/BE/Forecast + botão exportar PDF
2. CompareCard: card com 4 colunas (label + 3 cenários) — padrão repetido 6x
3. Break-even: card full-width com 4 KPIs grandes
4. DailyAttendanceCard: gráfico de público/dia
5. Gráficos: PieChart (mix receitas), BarChart horizontal (custos), BarChart diário (público)
6. TourBreakdowns: tabela + BarChart de cidades (só turnê)

**Problemas identificados:**
- Visual genérico tipo "admin panel" — não transmite urgência ou leitura rápida
- Cenário activo (Real/BE/Forecast) apenas muda um highlight subtil nas colunas
- Não há hierarquia visual clara entre "o que importa agora" e "detalhe"
- KPIs grandes só no card de Break Even — o resto usa texto pequeno
- Sem indicadores de tendência / delta entre cenários
- Sem barra de progresso visual (quanto % do BE foi atingido)
- Sem semáforos de status no topo (verde/amarelo/vermelho por dimensão)
- Gráficos isolados sem contexto narrativo

---

## 2. Referências de Design (o look que queremos)

### Plataformas de referência
- **Bloomberg Terminal**: densidade de informação, fundo escuro, números grandes em verde/vermelho, grid compacto
- **Koyfin / Finchat**: estética clean-dark, cards com sparklines, delta % em destaque
- **Robinhood / Revolut**: hierarquia clara: headline KPI > contexto > detalhe
- **Linear / Vercel Analytics**: grid moderno, tipografia sans-serif apertada, sem ornamento

### Princípios de design a adoptar
1. Dark/dark-glass feel — fundo neutro escuro com cards em glassmorphism subtil (bg-card/80 + backdrop-blur-sm + ring-1)
2. KPI Hero: os 3 cenários têm cada um um GRANDE número de resultado em destaque (não enterrado em tabela)
3. Delta arrows: mostrar variação Real→Forecast em % com seta (arrow-up verde / arrow-down vermelho)
4. Progress bars: barra horizontal a mostrar "quanto % do Forecast está atingido" em cada dimensão-chave
5. Semáforos de status no header: 3 ícones (BE atingido? Margem positiva? Forecast acima de Real?)
6. Sparkline inline: mini linha de tendência do público por dia dentro do card de público — sem eixos, só a linha
7. Heatmap de cidades (turnê): substituir tabela plana por grid de cards com cor de fundo mapeada ao resultado (verde → vermelho)
8. Tipografia financeira: números em font-mono/tabular-nums, tamanhos grandes (3xl/4xl) para o hero, xs para contexto

---

## 3. Novo Layout Proposto — Estrutura

### Zona 0 — Toolbar (mantém-se mas redesenhada)
- Selector Real/BE/Forecast: substituir buttons por 3 TABs estilo "pill" com fundo colorido quando activo
  - Real: azul (--blue)
  - Break Even: âmbar (--amber)
  - Forecast: verde-esmeralda (--emerald)
- Botão PDF: move para canto direito, ícone apenas (sem texto), tooltip "Exportar PDF landscape"
- Timestamp "última actualização: hoje às HH:MM"

### Zona 1 — Hero Strip (NOVA)
Faixa horizontal com 5 KPI heroes, sem card exterior, fundo section ligeiramente diferenciado:

| KPI | Valor | Delta |
|-----|-------|-------|
| Resultado ({cenário activo}) | +/- EUR XXX | vs Real se cenário != real |
| Receita Total | EUR XXX | % de Forecast atingida |
| Custo Total | EUR XXX | — |
| Público Total | XX.XXX | % vs Forecast |
| Margem % | XX.X% | ↑ ou ↓ |

Cada hero: label em uppercase xs tracking-widest / valor em text-3xl font-bold mono / delta em text-sm com seta colorida

### Zona 2 — Status Bar (NOVA)
Uma linha horizontal com 3 semáforos (ícones + label + status):
- BE Atingido: verde CheckCircle / vermelho XCircle + "Faltam XX bilhetes"
- Margem Positiva: baseado em resultado geral
- Forecast vs Real: percentagem de progresso

### Zona 3 — Grid de KPIs Comparativos (substitui CompareCards actuais)
Substituir os CompareCards por um layout de 2 colunas:

**Coluna esquerda (2/3 de largura):** Tabela financeira consolidada
Uma única tabela densa estilo Bloomberg com as linhas:
- Bilheteira | Patrocínios | A&B | Souvenir | Outros | RECEITA TOTAL (bold)
- Cachê artístico | Produção | Staff | Outros | CUSTO TOTAL (bold)
- RESULTADO (mega bold, colorido)
- Margem % | Resultado/pessoa | TM ingresso | TM A&B

Colunas: Linha | Real | Break Even | Forecast | Delta (Real→FC)
Célula activa do cenário seleccionado com fundo bg-primary/10

**Coluna direita (1/3 de largura):** Stack de KPI cards compactos
- Card: Público (Real + progress bar → BE → FC)
- Card: Break Even (bilhetes em falta, com barra de progresso)
- Card: A&B (resultado + margem, só se hasConfig)

### Zona 4 — Gráficos (redesenhados)
Grid 3 colunas:

**Gráfico 1 — Mix de Receitas:** Substituir PieChart por Donut Chart com legenda inline (sem Legend externa), mostrando % dentro das fatias. Paleta: azul, verde, âmbar, roxo, ciano.

**Gráfico 2 — Custos vs Cenários:** Manter BarChart horizontal mas com design mais limpo:
- Remover CartesianGrid ou tornar muito subtil (opacity 0.05)
- Bars com rounded corners (radious={4})
- Tooltip com formato EUR formatado
- Cores: Real=azul, BE=âmbar, Forecast=verde

**Gráfico 3 — Público por dia com sparkline de Forecast:**
- Manter BarChart stacked Pagantes+Cortesias
- Adicionar linha Reference (capacidade máxima se dailyCapacity disponível)
- Mostrar % de ocupação por dia se dailyCapacity disponível

### Zona 5 — Heatmap de Cidades (só Turnê, redesenhado)
Substituir a tabela plana por:
- Grid de cards de cidade (3 por linha no desktop, 2 no tablet, 1 no mobile)
- Cada card tem fundo colorido com gradiente baseado na margem (≥30%: emerald-900/30, 10-30%: blue-900/30, 0-10%: amber-900/30, <0%: rose-900/30)
- Dentro do card: nome cidade (bold), Público (grande), Receita/Custo/Resultado em linha, Margem % com pill colorido, BE qty em rodapé
- Substituir BarChart de resultados por Waterfall-style ou manter BarChart simplificado com as 3 métricas

---

## 4. Paleta de Cores e Tokens

Manter compatibilidade com o sistema de design existente (Tailwind + shadcn). Adicionar apenas:

```
POSITIVO:  text-emerald-400 / bg-emerald-500/10 / ring-emerald-500/20
NEGATIVO:  text-rose-400    / bg-rose-500/10    / ring-rose-500/20
NEUTRO:    text-amber-400   / bg-amber-500/10   / ring-amber-500/20
DESTAQUE:  text-blue-400    / bg-blue-500/10    / ring-blue-500/20

HERO REAL:       bg-blue-500/8  border-blue-500/20
HERO BREAKEVEN:  bg-amber-500/8 border-amber-500/20
HERO FORECAST:   bg-emerald-500/8 border-emerald-500/20
```

---

## 5. Componentes Novos a Criar

### 5.1 KpiHero
```
interface KpiHeroProps {
  label: string;
  value: string;          // já formatado
  delta?: string;         // ex: "+12.3%" ou "−5k"
  deltaPositive?: boolean;
  subtext?: string;       // ex: "faltam 2.450"
  tone?: "blue" | "amber" | "emerald" | "rose" | "neutral";
}
```
Render: label uppercase xs + value 3xl mono bold + delta sm com seta + subtext xs muted

### 5.2 ScenarioPill
Substituição do toolbar de cenário — 3 pills inline com cor contextual

### 5.3 StatusBadge
```
interface StatusBadgeProps {
  ok: boolean;
  labelOk: string;
  labelFail: string;
  subtext?: string;
}
```

### 5.4 ProgressKpi
Barra de progresso horizontal com valor actual, target e % em texto.
```
interface ProgressKpiProps {
  current: number;
  target: number;
  label: string;
  formatFn?: (v: number) => string;
}
```

### 5.5 CityHeatCard (só turnê)
Card com fundo semântico por nível de margem, dados da cidade em layout compacto.

### 5.6 FinancialTable
Substitui os 6 CompareCards — uma única tabela com linhas de receita, custo e KPIs,
e colunas Real / BE / Forecast / Delta. Célula activa com fundo highlight.

---

## 6. Ficheiros a Criar/Modificar

| Ficheiro | Acção |
|----------|-------|
| src/components/simulator/ExecutiveDashboard.tsx | Reescrever layout (lógica de dados mantém-se) |
| src/components/simulator/KpiHero.tsx | Novo componente |
| src/components/simulator/ScenarioPill.tsx | Novo componente |
| src/components/simulator/StatusBadge.tsx | Novo componente |
| src/components/simulator/ProgressKpi.tsx | Novo componente |
| src/components/simulator/CityHeatCard.tsx | Novo componente (só turnê) |
| src/components/simulator/FinancialTable.tsx | Novo componente (substitui CompareCard) |

Os novos componentes devem ser exportados individualmente para facilitar reutilização
noutras vistas (ex: CityReadOnly no TourSimulator).

---

## 7. Regras de Não-Regressão

- Props do ExecutiveDashboard NÃO mudam — todos os callers (EventSimulator, TourSimulator) mantêm-se intactos
- CompareCard pode ser mantido internamente ou eliminado — mas o contrato externo não muda
- A lógica de cálculo (useCitySimulator, event-ab-calc) não é tocada
- Export PDF (exportNodeToPdf) mantém-se funcional — o rootRef aponta para o novo layout
- DailyAttendanceCard mantém-se sem alteração (é usado por eventId e já tem hook próprio)
- ForecastBoostCalibrator mantém-se sem alteração

---

## 8. Prioridade de Implementação

**Fase 1 (impacto visual imediato, sem risco):**
- Zona 1: Hero Strip (KpiHero × 5)
- Zona 2: Status Bar (3 semáforos)
- Toolbar redesenhada (ScenarioPill)

**Fase 2 (substituição do core tabular):**
- Zona 3: FinancialTable em vez dos 6 CompareCards
- Zona 3: ProgressKpi cards no lado direito

**Fase 3 (gráficos e tour):**
- Zona 4: Gráficos com novo estilo (donut, bars com radius, reference line)
- Zona 5: CityHeatCard grid (substitui tabela de cidades)

---

## 9. Questões para o Lovable validar antes de implementar

1. **Dark mode vs light mode:** O design financial assume dark mode como padrão. O tema actual é light-first. Devemos aplicar as cores escuras APENAS ao dashboard (classe wrapper) ou mudar o tema global?
2. **FinancialTable vs CompareCards:** Preferes manter os 6 cards independentes (mais flexível para mobile) ou consolidar numa tabela única (mais denso e financeiro)?
3. **Donut chart:** Recharts suporta donut (innerRadius). Preferes manter PieChart simples ou avançar para o donut?
4. **Heatmap de cidades:** O grid de CityHeatCard cards é visualmente mais rico mas requer mais espaço. Preferes manter a tabela para a turnê ou avançar para o heatmap?
5. **Export PDF:** Com glassmorphism e cores translúcidas, o html2canvas pode não renderizar correctamente backdrop-blur. Devemos criar uma classe "pdf-mode" sem efeitos visuais avançados que é aplicada durante a exportação?
