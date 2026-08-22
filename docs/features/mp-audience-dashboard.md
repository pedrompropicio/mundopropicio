# MP Audience — Dashboard de tráfego pago

> Fonte de verdade do ecrã `/audience/dashboard` (Meta + Google Ads unificados).
> Escrito a partir do código em `src/pages/crm/Campaigns.tsx`, `src/components/crm/dashboard/`
> e `src/lib/crm/`. Última revisão: 21/ago/2026 (Fase 5 do redesenho).

---

## 1. Estado e âmbito

| | |
|---|---|
| **Rota** | `/audience/dashboard` (`CrmCampaigns` = `src/pages/crm/Campaigns.tsx`) |
| **Módulo** | MP Audience (CRM / tráfego pago) |
| **Plataformas** | Meta (Facebook + Instagram) e Google Ads, na mesma tabela |
| **Estado** | Em produção |

O ecrã é o índice do módulo: `/audience` redirecciona para cá.

O que substituiu: até à Fase 3B existia uma aba de campanhas separada na página
`/audience/google-ads` (componente `GoogleCampaignsTable`, desde então apagado).
Duplicava este dashboard e assumia EUR fixo. A página `/audience/google-ads`
mantém-se, mas só com **conversões offline**.

---

## 2. Modelo de dados

Tudo no schema **`crm`** (não em `public`).

### Métricas (uma linha por dia × entidade, `time_increment=1`)

| Tabela | Granularidade |
|---|---|
| `crm.meta_campaign_insights_daily` | campanha × dia |
| `crm.meta_adset_insights_daily` | conjunto × dia |
| `crm.meta_ad_insights_daily` | anúncio × dia |
| `crm.google_campaign_insights_daily` | campanha × dia (Google) |

Colunas de métrica lidas pelo dashboard (as mesmas nos três níveis do Meta —
constante `METRIC_COLS` em `dashboard-queries.ts`): `spend_cents`, `cpc_cents`,
`ctr`, `impressions`, `clicks`, `purchases_count`, `purchases_value_cents`,
`frequency`, `currency`, `reach`, `unique_clicks`, `unique_ctr`, `cpm_cents`,
`cpp_cents`, `view_content_count`, `add_to_cart_count`,
`initiate_checkout_count`, `video_plays`, `video_3s_views`, `video_thruplays`,
`video_p75_watched`.

As tabelas de vídeo guardam ainda `video_p25/p50/p100_watched` e
`video_avg_time_watched_sec` (Fase 4), não usados no ecrã.

### Metadados (estado da entidade, não performance)

| Tabela | O que descreve |
|---|---|
| `crm.meta_campaign_snapshot` | nome, `status`/`effective_status`, objectivo, orçamento diário/vitalício, `bid_strategy`, `linked_event_id`, `linked_event_locked`, `currency`, `replaced_by_strategy_id` |
| `crm.meta_adset_snapshot` | nome, estado, orçamento, `optimization_goal`, `learning_stage_info`, `attribution_spec`, `targeting` |
| `crm.meta_ad_snapshot` | nome, estado, `meta_creative_id` |
| `crm.google_campaign` | nome, `status`, `advertising_channel_type`, `bidding_strategy_type`, `budget_amount_micros`, `customer_id`, `linked_event_id`, `linked_event_locked` |
| `crm.ad_platform_connections` | conexão por empresa/plataforma, conta seleccionada e respectiva moeda |
| `public.events` | evento ligado à campanha e `target_roas` (meta de ROAS por evento) |

Regra prática: **métricas** vêm sempre de `*_insights_daily`; **estado, nome e
orçamento** vêm sempre dos `*_snapshot` / `google_campaign`. O dashboard nunca
deriva orçamento de insights nem estado de métricas.

---

## 3. Convenções de unidades

A secção mais importante do documento — foi aqui que apanhámos dois bugs
(escala do `ctr` do Google e denominador do `unique_ctr`).

- **Dinheiro em cêntimos**, inteiros, nas duas plataformas (`spend_cents`,
  `purchases_value_cents`, `cpc_cents`, `cpm_cents`, `cpp_cents`,
  `conversions_value_cents`). O Google devolve **micros**; a conversão é
  `micros / 10000` e vive em `supabase/functions/crm-google-sync-campaigns/index.ts`.
  O orçamento do Google (`budget_amount_micros`) é convertido no front-end, em
  `google-queries.ts`, pela mesma divisão.
- **`ctr` e `unique_ctr` são fracções**, nunca percentagens. `0,0111` é 1,11%.
  O sync do Google **não** multiplica por 100 de propósito, para bater com o
  Meta. A UI multiplica na formatação (`pct()` em `MetricCells.tsx`).
- **`unique_ctr` do Meta é `unique_clicks / reach`**, não sobre impressões — é
  a definição do Meta e a coluna deles bate exactamente com este quociente
  (`computeUniqueCtr` em `aggregate.ts`).
- **`cpm_cents` e `cpp_cents` são cêntimos por mil** (impressões e pessoas
  alcançadas, respectivamente).
- **Colunas de vídeo a NULL significam "não se aplica"**, não zero. Um anúncio
  de imagem não tem hook rate; mostrar 0% dava a entender criativo falhado. A
  flag `hasVideo` do `Aggregate` decide entre número e "—".
- **`reach` não é somável.** Somar alcance entre campanhas, conjuntos ou dias
  conta a mesma pessoa mais que uma vez. Por isso o campo do agregado chama-se
  `reachSum` e a célula tem tooltip a dizê-lo. Tudo o que dele derive (CPP, CTR
  único agregado) é aproximado por construção.
- **Métricas que o Google não fornece** (alcance, frequência, cliques únicos,
  ViewContent, AddToCart, InitiateCheckout) ficam NULL nas linhas normalizadas.
  As flags `has*` do `Aggregate` fazem a UI mostrar "—".

---

## 4. Arquitectura do front-end

### `src/components/crm/dashboard/`

| Ficheiro | Papel |
|---|---|
| `types.ts` | `CampaignRow`, `InsightRow`, snapshots, `EventRow`, agrupamentos `SimpleGroup`/`TourGroup`. `platform` ausente ⇒ `"meta"` |
| `CampaignTableHeader.tsx` | cabeçalho da tabela, com ordenação |
| `CampaignTableRow.tsx` | linha de campanha (nível 1) e ponto de entrada do drill-down |
| `AdsetRow.tsx` | linha de conjunto (nível 2), com indentação |
| `AdRow.tsx` | linha de anúncio (nível 3) |
| `MetricCells.tsx` | células de métrica partilhadas pelos 3 níveis — único sítio que formata números da tabela |
| `ColumnPicker.tsx` | escolha de colunas visíveis (persistida) |
| `KpiCard.tsx` / `Sparkline.tsx` | KPIs do topo e mini-gráfico inline |
| `DailyPerformanceChart.tsx` | investimento/receita em barras + ROAS em linha, por dia |
| `ConversionFunnelPanel.tsx` | funil do período e sinalização de taxas impossíveis |
| `AlertsBar.tsx` | barra de alertas accionáveis (vazia quando não há nada a dizer) |
| `PlatformBadge.tsx` / `PlatformBreakdown.tsx` | identidade e consolidação Meta · Google · Consolidado |
| `TargetRoasEditor.tsx` | edição de `events.target_roas` no card do evento |
| `EventGroupCard.tsx` / `TourFamilyCard.tsx` | agrupamento por evento simples e por família de turnê (master + splits) |
| `EditCampaignPopover.tsx` / `ReassignCampaignToSplit.tsx` | acções sobre campanhas Meta (orçamento, estado, atribuição a split) |
| `CampaignAnalysisSheet.tsx` / `AudienceCoachSheet.tsx` / `CampaignRedesignDialog.tsx` | painéis de IA |
| `budget-mode-context.ts` | critério CBO/ABO (campanha com budget ⇒ CBO; soma dos adsets ⇒ ABO; senão desconhecido) |
| `dashboard-table-context.ts` | contexto da tabela (colunas, ordenação, período) partilhado pelos 3 níveis |

### `src/lib/crm/`

| Ficheiro | Papel |
|---|---|
| `dashboard-queries.ts` | queries Meta (snapshots + insights dos 3 níveis, orçamentos de adsets) |
| `google-queries.ts` | queries Google normalizadas para a forma do Meta com `platform: "google"` |
| `aggregate.ts` | `aggregate()` + derivados (CPC, CTR, CPM, CPP, CPA, ticket, CTR único, hook rate, thumbstop, retenção 75%) |
| `period.ts` | estado do período (ontem / 7d / 30d / personalizado) |
| `daily-series.ts` | série diária; dias sem dados ficam `null`, nunca zero |
| `kpi-deltas.ts` | variação vs período anterior, só quando a janela anterior está completa |
| `columns.ts` | catálogo de colunas e persistência em `localStorage` |
| `table-sort.ts` | ordenação dentro de cada nível (ordenar campanhas não mexe nos conjuntos) |
| `csv-export.ts` | exporta o que está no ecrã (linhas e colunas visíveis, período seleccionado) |
| `alerts.ts` | regras dos alertas |
| `dashboard-format.ts` | formatação de dinheiro/números e bandas de cor |
| `platform.ts` | plataformas e respectivas cores (`--chart-1` Meta, `--chart-2` Google) |

### Drill-down preguiçoso

A tabela desce Campanha → Conjunto → Anúncio na mesma grelha. Os insights de
conjunto e de anúncio **só são pedidos quando a linha é expandida**:
`crm.meta_ad_insights_daily` tem uma linha por anúncio **por dia**, o que dá
milhares de linhas por conta e período. Carregar tudo no arranque tornava o
ecrã inutilizável e trazia dados que ninguém abriu. As queries dos níveis
inferiores ficam `enabled` apenas com a linha aberta e mantêm-se em cache.

O drill-down é só Meta — as linhas Google são de acompanhamento.

---

## 5. Fuso horário

O dashboard calcula "hoje" em **Europe/Lisbon**, via `lisbonToday()` /
`lisbonTodayISO()` em `src/lib/date-lisbon.ts`. Todas as janelas de negócio
(`period.ts`, janela de 60 dias dos insights) derivam daí.

Porquê: o utilizador opera muitas vezes do Brasil e a conta de anúncios é
portuguesa. Com `new Date()` nu, "ontem" no browser podia ser um dia diferente
de "ontem" na conta de anúncios, e os números não batiam com o Ads Manager.

Regra: **nunca usar `new Date()` cru para derivar uma janela de negócio.**
Ver `.lovable/memory/constraints/timezone-portugal.md`.

---

## 6. Sync

| Função | O que sincroniza | Como corre |
|---|---|---|
| `crm-meta-sync-campaigns` | `meta_campaign_snapshot` | botão manual ("Sincronizar agora") |
| `crm-meta-sync-adsets` | `meta_adset_snapshot` | botão manual |
| `crm-meta-sync-ads` | `meta_ad_snapshot` | botão manual |
| `crm-meta-sync-insights` | os três `meta_*_insights_daily` (`time_increment=1`), incluindo métricas de vídeo | botão manual (incremental e histórico) |
| `crm-meta-sync-creatives` | `meta_creatives` (`meta_video_id` incluído) | **cron diário 06:00 UTC** (`scripts/crm-cron-sync-creatives-live.txt`) |
| `crm-google-sync-campaigns` | `google_campaign` + `google_campaign_insights_daily`, micros→cêntimos, auto-link ao evento | **cron diário 05:30 UTC**, `mode='incremental'`, `days_back=7` (`supabase/manual/cron_google_sync_campaigns_live.sql`) |

Honestidade sobre o que falta: **o Meta não tem cron de insights**. Snapshots e
insights do Meta dependem do botão "Sincronizar agora" no dashboard. O
backfill histórico é sempre manual nas duas plataformas (Google: `mode='full'`).

Consequência prática: colunas novas nascem vazias. Depois de um Publish que
acrescente colunas de métrica (foi o caso das de vídeo, Fase 4), é preciso
correr um **sync histórico** — até lá o histórico mostra "—".

O cabeçalho mostra a frescura por plataforma (máximo de `last_synced_at`); acima
de 48h fica em alerta com o número de dias.

Os crons vivem **apenas no Live** (pg_cron não propaga Test→Live via Publish) —
ver `.lovable/memory/constraints/lovable-cloud-ddl-workflow.md`.

---

## 7. Armadilhas conhecidas

- **A coluna `actions` das tabelas de insights está a NULL.** Os dados de
  acções do Meta vivem em `raw->'actions'`. Quem for buscar conversões por
  tipo de acção tem de ler o JSON `raw`, não a coluna. As contagens que o
  dashboard usa (`purchases_count`, `view_content_count`, …) já são extraídas
  no sync.
- **Schema `crm` exige cast.** O `src/integrations/supabase/types.ts` gerado só
  cobre `public`, logo todas as queries usam
  `(supabase as any).schema("crm")`. Não é preguiça de tipagem: é o preço de o
  gerador não abranger schemas não-públicos.
- **Agregação entre moedas está deliberadamente bloqueada.** Quando as moedas
  das plataformas divergem, o consolidado devolve `null` em vez de somar às
  cegas; a UI mostra cada plataforma na sua moeda. Nunca há conversão
  automática de câmbio.
- **`reach` somado é aproximação** (ver §3). Vale para ordem de grandeza, não
  para relatório de alcance.
- **Meta de ROAS** vem de `public.events.target_roas`; NULL cai no fallback
  `DEFAULT_TARGET_ROAS` (8×).

---

## 8. Diagnóstico do funil

O painel mostra Impressões → Cliques → ViewContent → AddToCart →
InitiateCheckout → Compras, com a taxa de passagem entre cada par.

Compras podem aparecer **acima** de InitiateCheckout. Não é bug de cálculo: é
o retrato de um pixel incompleto. O checkout acontece no site da bilheteira
(Ticketline, BOL, Fever), onde o pixel do evento muitas vezes não dispara
`InitiateCheckout`, mas a compra chega por outra via de atribuição. Resultado:
o passo intermédio subconta e a taxa passa dos 100%.

A UI sinaliza isso a vermelho de propósito — taxas >100%, ou
InitiateCheckout→Compra acima de 80%. É diagnóstico de instrumentação em falta,
não um número a esconder. Enquanto o passo estiver assinalado, ler o funil de
InitiateCheckout para trás como indicativo e confiar em Impressões, Cliques e
Compras.

---

## 9. Painel de impacto nas vendas (por evento)

Ficheiros: `src/components/crm/dashboard/SalesImpactPanel.tsx` +
`src/lib/crm/sales-impact.ts`. Renderizado dentro de `EventGroupCard`, quando o
card do evento está expandido.

**Porquê existe.** O ROAS que as plataformas reportam pode enganar. Nas cidades
da turnê Raphael Ghanem servidas pela Ticketline, o Meta reportava ROAS 1,43x,
mas as vendas diárias saltaram de ~4/dia para ~32/dia (Almada) no arranque das
campanhas (06/08). Descontando a linha de base, o Meta via ~40% das compras que
provavelmente gerou — o `fbc` não chega ao Purchase da Ticketline. Quando a
atribuição está partida, **a série diária da bilheteira é a fonte de verdade**.

**O que mede.**

- Bilhetes e receita por dia, de `public.ticketline_daily_sales`.
- Investimento diário por plataforma, de `crm.meta_campaign_insights_daily` e
  `crm.google_campaign_insights_daily`, através das campanhas com
  `linked_event_id` = o evento (já agregado pelo card).
- Marca vertical no primeiro dia com `spend_cents > 0` de cada plataforma.
- Leitura: média de bilhetes/dia antes e depois do arranque + multiplicador,
  bilhetes/receita/investimento no período depois, e a percentagem de compras
  que as plataformas captam (`purchases_count ÷ bilhetes vendidos`).

**O que NÃO mede.** Não mede vendas incrementais. A diferença entre o depois e a
linha de base é rotulada **"variação após o arranque"** e é correlação, não
experiência controlada: no mesmo período há imprensa, abertura de vendas e
outras plataformas. O tooltip do painel diz isso explicitamente. Nunca renomear
para "incremental" nem "vendas geradas pela campanha".

**Regras de desenho.**

- Dois gráficos empilhados que partilham o eixo de datas — bilhetes (unidades) e
  investimento (dinheiro). **Nunca dois eixos verticais no mesmo gráfico.**
- Dias sem registo de venda ficam `null` (lacuna), nunca zero.
- Cobertura: só os eventos com captura diária da Ticketline têm série (Almada,
  Estoril, Lisboa, Santarém, Albufeira à data). Sem série, o painel diz "sem
  série diária de vendas para este evento". **Proibido** reconstruir a série a
  partir de `ticket_sales`, que é agregado por lote e zona.
- Janela: `max(período seleccionado, 60 dias)` para haver linha de base antes do
  arranque; "hoje" vem de `lisbonToday()`.
