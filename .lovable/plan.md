# BP como retrato vivo do custo — decisão de base + 3 funcionalidades

## 0. Trava anti-reinvestigação — o que já existe

Procurei em `docs/`, `docs/features/`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` e na memória do projeto.

**Nada dos três fluxos está desenhado em `docs/`.** `docs/features/` só tem CRM/Meta, portal, operação, roles, SEPA, WhatsApp e cupão VIP. `docs/DECISIONS.md` (239 linhas, ADRs D1…) não tem nenhuma decisão sobre o BP — a decisão de base é nova e entra como ADR.

O que **já existe em código** e é reutilizável:

- `bpL3Overrun` (`src/pages/PartnerEventDetail.tsx` ~l.818) já calcula o excedido por L3: monta `entries {key: l3.id, forecast: l3.total, realized: realizedByL3Id[l3.id].total}` e chama `computeOverrunMap`. O realizado por L3 vem do RPC `get_partner_bp_realized` — **agregado por rubrica, não por linha**. O excesso propaga a L2/L1/TOTAL via `bpExcessByL2` / `bpExcessByL1` e ao card Despesas por `bpTotalExpenseAdjusted`.
- `src/lib/event-cost-basis.ts` já é o SSoT da forma `previsto + max(realizado − previsto, 0)` (`computeOverrunMap`, `sumExcess`, `computeOutsideBpExcess`, `EXCESS_EPSILON = 0.005`, IVA linha a linha).
- `src/lib/bp-tx-matching.ts` é o matching canónico linha↔transações (FK `transaction_id` → categoria única → tokens), já usado pela vista Agrupada, pelo bucket "Sem linha específica" e pelo bulk de geração de TX.
- `src/lib/ordering-partner.ts` já tem `matchesOrderingPartnerFilter` / `buildInheritedOrdererMap` / `effectiveTransactionOrderer` — base pronta para o filtro de saldo.
- `src/lib/fecho-filters.ts` define o universo válido de TX (`approved|paid`, sem transitória/excluída/estornada/oculta).

**`formula_type` / `formula_value` — não servem para verba.** Na base só existem dois valores: `fixed` (1408 linhas) e `cache_module` (6, geradas pelo `useSyncCacheForecasts`). `formula_value` é vestigial — o único sítio que o escreve com significado é `EventForecast.tsx:354` (`amount / n`, memória do rateio ÷N). Não há motor de fórmulas. Reaproveitá-los para envelope seria sobrecarregar um campo com semântica morta mas lida por `CopyPLModal`, `useActiveVersionDiff`, `AuditoriaContas` e pelos restores. **Não vou usar.**

---

## 1. ADR a registar em `docs/DECISIONS.md`

Secção nova "MP ERP — Business Plan", com:

**D-BP1 — O BP é o retrato vivo do custo e converge para o fecho.**
Decisão: o custo do evento lê-se no BP, não nas transações. As transações são comprovação de pagamento. Planeado-vs-realizado compara-se entre **versões seladas** (`bp_versions`) e o BP actual — nunca BP-vs-transações.
Porquê: em co-produção grande parte do custo não passa pelo nosso ERP. Na Anitta, 33 rubricas com zero transações somam 959.722,52 € geridos pela EIN; um relatório BP×Transações leria isso como poupança de 959 mil que não existe.
Corolário: **despesa sem `ordering_partner_id` é Mundo Propício** (já é o default assumido em `ordering-partner.ts`: vazio = "MP / comum").
Consequência: o excedido deixa de ser categoria de custo e passa a **métrica de desactualização do BP** — deve tender para zero.
Estado: vigente.

**D-BP2 — Verba por L3 (envelope) coexiste com linhas bottom-up.** (o desenho do ponto 4 abaixo)

Nenhum relatório existente é apagado nesta ronda: `ReportBPTransactions` fica, mas ganha um cabeçalho a dizer que compara pagamento, não custo, e o comparador de custo canónico passa a ser o de versões (`ActiveVersionDiffModal`).

---

## 2. Funcionalidade 1 — sinalizar e **actualizar** linha ultrapassada

Onde: vista Agrupada do BP (`EventForecast.tsx`) e Planilha (`BPPlanilha.tsx`); leitura idêntica no portal do sócio, mas **sem** o gesto de escrita.

- Cálculo: reutiliza `computeOverrunMap` de `event-cost-basis.ts`. Nada de fórmula nova.
- **Vários lançamentos contra uma linha (o caso Aéreo, 34 emissões / 1 linha "Voos"):** não se compara linha↔transação, compara-se **rubrica L3↔soma das transações da rubrica** — exactamente o que o `bpL3Overrun` já faz. A FK `event_forecasts.transaction_id` continua a ser só back-link da 1.ª parcela (regra já existente em `mem://features/bp-installments`); o matching por rubrica é o "azul" de `bp-tx-matching.ts`, com o bucket "Sem linha específica" a garantir que nenhuma TX com categoria fica invisível.
- **Quando a rubrica tem N linhas de BP**, o excesso é da rubrica, não de uma linha em particular. Regra proposta: o botão só propõe actualização automática quando a rubrica tem **uma única linha** de despesa; com várias linhas abre um popover que mostra o excesso da rubrica e as TX não reclamadas, e obriga a escolher qual a linha a subir (ou criar linha nova). Sem adivinhar rateios.
- Gesto: badge âmbar `+64.886,01 €` → botão **"Actualizar para o real"** → grava `amount` = realizado s/IVA (IVA mantém-se; conversão via `calcTotalWithIva` invertida linha a linha), grava justificação automática em `forecast_audit_log`, dispara snapshot só se ainda não houver versão do dia (`create_bp_snapshot` já é idempotente por transição, aqui será chamada explícita opcional).
- Guardas: linhas `cache_module`, `is_overhead` via Master, `master_forecast_id` (fatia importada) e retroactivas ficam **read-only** — o gesto aparece no Master.
- KPI novo no topo do BP: "Desactualização: X €" (= `sumExcess`), alvo zero.

Ficheiros: `event-cost-basis.ts` (helper `overrunToNewAmount`), `EventForecast.tsx`, `BPPlanilha.tsx`, `ForecastEditModal.tsx` (grava justificação), `PartnerEventDetail.tsx` (só leitura + rótulo).

---

## 3. Funcionalidade 2 — saldo por linha + filtro

- `saldo = max(previsto − realizado, 0)` por rubrica L3, com o mesmo par de mapas do overrun (é a face simétrica: um dos dois é sempre zero).
- Coluna "Saldo" opcional na Agrupada e na Planilha + KPI "Verba a dormir: X €".
- Selector `Todas | Só com saldo | Só ultrapassadas`.
- **Falso positivo do parceiro:** o filtro "Só com saldo" considera por defeito apenas linhas cujo ordenador efectivo é **MP / comum** (`ordering_partner_id IS NULL`, pelo corolário do D-BP1), com um toggle "incluir linhas de sócio" desligado. Linhas de parceiro com realizado zero são o normal — o custo existe fora do nosso ERP e não é verba por libertar. Herança de ordenador na TX usa `buildInheritedOrdererMap` (já existe, não se cria matching novo).
- Sanidade: na Anitta o filtro deve devolver os 6.480,38 € MP (Assessoria 2.500, Rádio/TV 2.341,34, Panfletagem 1.364,86, Gráfica 274,18) e **não** as 33 rubricas EIN.

Ficheiros: `event-cost-basis.ts`, `ordering-partner.ts`, `EventForecast.tsx`, `BPPlanilha.tsx`, `PartnerEventDetail.tsx`.

---

## 4. Funcionalidade 3 — verba por L3 consumida pelas linhas

### Crítica à regra proposta
A regra `custo = max(verba, soma(linhas))` / `saldo = max(verba − soma(linhas), 0)` está correcta e é a **mesma forma** do "previsto + excedido" um nível acima — reaproveita-se `computeOverrunMap` invertendo os papéis (`forecast := soma(linhas)`, `realized := verba`) ou, mais legível, um helper novo `envelopeValue(budget, linesSum)` no mesmo ficheiro. Uma correcção: `soma(linhas)` tem de ser a soma **com a mesma base de IVA** do resto do agregador (a verba é gravada s/IVA, com `iva_rate` própria) e tem de **excluir** linhas `is_overhead`, `master_forecast_id` e `cache_module`, senão a verba compete com valores que não são "linhas do envelope".

### 4.1 Onde vive a verba
**Tabela nova `event_category_budgets`** (`id`, `event_id`, `category_id`, `amount`, `iva_rate`, `notes`, `released_at`, `released_by`, `company_id`, `created_by`, timestamps; UNIQUE `(event_id, category_id)`; RLS PERMISSIVE + RESTRICTIVE `row_belongs_to_current_company`; GRANTs explícitos).
Porquê **não** uma linha marcada em `event_forecasts`: são ~80 ficheiros a tocar `event_forecasts` (lista completa abaixo) e **todos** somam `amount` sem conhecer flags novas. Uma linha-envelope faria dupla contagem imediata em DRE, Fecho, cards, exports, portal do sócio e snapshots — e o pior é que muitos desses agregadores são SQL (RPCs `get_partner_bp_realized`, `get_partner_bp_realized`, `batch_*`, restores). Tabela separada torna o *opt-in* explícito: quem não souber da verba continua a dar o número bottom-up de hoje (nunca inflaciona), e só os agregadores migrados dão o número novo.

### 4.2 Raio de alcance — inventário
84 ficheiros referenciam `event_forecasts`. Dos que **somam** BP e teriam de aprender a regra: **~24 no frontend + 4 em SQL**.

| Área | Ficheiros |
|---|---|
| Árvore/edição do BP | `EventForecast.tsx`, `BPGridEditor.tsx`, `admin/BPPlanilha.tsx`, `ForecastEditModal.tsx` |
| Fecho / sócios | `EventFecho.tsx`, `PartnerSettlementTab.tsx`, `PartnerDREDialog.tsx`, `ReportPartnerSettlement.tsx` |
| Cards / capa do evento | `useEventFinancialCardData.ts`, `event-financial-card.ts`, `useEventCostBasis.ts`, `useFechoBasis.ts`, `EventDetail.tsx` |
| Relatórios | `ReportBPTransactions.tsx`, `ReportDRE.tsx`, `ReportDREBrasil.tsx`, `ReportPL.tsx`, `ReportBudgetDeviation.tsx`, `ReportForecastPayables.tsx`, `ResultsAnalysis.tsx` |
| Exports | `export-event-bp-pdf.ts`, `export-pl.ts` |
| Portal do sócio | `PartnerEventDetail.tsx` |
| Versões | `useBPVersions.ts`, `useActiveVersionDiff.ts`, `bp-versions/ActiveVersionDiffModal.tsx` |
| SQL | `create_bp_snapshot`, `_revert_event_to_version`, `promote_scenario_to_active`, `get_partner_bp_realized` |

Estratégia para não espalhar a regra por 24 sítios: **um único helper** `applyEnvelopes(l3Totals, budgets)` em `event-cost-basis.ts` + um hook `useEventCategoryBudgets(eventId)`. Faseamento: Fase A = árvore do BP + planilha + cards (a verba fica visível e correcta onde se decide); Fase B = Fecho/sócios/DRE/exports/portal; Fase C = versões e SQL. Enquanto B/C não chegam, mostram o número bottom-up — nunca um número inflacionado sem se saber porquê. A discrepância é explícita num aviso "existem verbas L3 não reflectidas nesta vista".

### 4.3 Versões seladas
`bp_versions.snapshot_payload` é jsonb — acrescenta-se a chave `category_budgets: []` em `create_bp_snapshot`, `promote_scenario_to_active` e no revert. As versões já seladas **não se tocam**: a leitura faz `coalesce(payload->'category_budgets','[]')`, logo uma versão antiga lê-se como "sem verbas" — que é a verdade histórica. O diff (`useActiveVersionDiff`) ganha a entidade "Verba L3" com as mesmas 3 operações (adicionada/removida/alterada) e o comparador nunca compara verba contra linha.

### 4.4 Dupla contagem verba ↔ linha genérica
Nem bloqueio nem silêncio: **a verba absorve as linhas** por definição (`max`), portanto a linha "Bandas a confirmar 300.000" dentro de um L3 com verba 300.000 **não** duplica — dá `max(300k, 300k) = 300k`. O problema real é o inverso: essa linha genérica **consome** toda a verba e a próxima banda confirmada passa a estourar. Regra: ao criar/definir verba num L3 que já tenha linhas com `formalidade = 'estimado'`, propor **converter a linha genérica em verba** (apagar a linha, gravar o `amount` como verba) num diálogo com pré-visualização. E aviso permanente na rubrica quando existir linha `estimado` sob verba, porque é quase sempre a mesma coisa contada duas vezes conceptualmente.

### 4.5 Fecho
**Confirmação humana, rubrica a rubrica** — concordo com a inclinação. Libertar em silêncio muda resultado e distribuição 70/15/15 sem ninguém ver. Desenho: na transição `active → completed`, o `EventFecho` mostra um passo "Libertar verbas não alocadas" com uma linha por L3 com saldo (verba, soma das linhas, saldo, e escolha **Libertar** / **Manter**). O fecho fica **bloqueado** enquanto houver verba não decidida. Libertar grava `released_at`/`released_by` (não apaga: auditoria) e a partir daí `custo = soma(linhas)`. O snapshot de fecho automático (já existente) corre **depois** da decisão, para a versão selada guardar o estado final.

### 4.6 Permissões e multi-tenant
Definir/editar/libertar verba: **admin, manager, platform_admin**. Editor: só leitura (pode continuar a criar linhas que consomem a verba). Partner: leitura, e só se tiver `view_bp`; nunca escrita (nem com `can_edit_bp` — a flag habilita linhas, não envelopes). `company_id` NOT NULL preenchido por trigger `_set_..._company_id` como nas restantes tabelas; RESTRICTIVE `row_belongs_to_current_company`. Audit via trigger genérico `audit_generic_changes` → `system_audit_log`.

---

## 5. O que **não** faço nesta ronda
Sem migrations, sem código, sem Publish. Próximo passo depois da tua validação: Fase A da funcionalidade 3 + funcionalidades 1 e 2 (que são independentes da verba e podem sair primeiro).

## 6. Perguntas que ficam para ti
1. Funcionalidades 1 e 2 saem antes da verba (são independentes e de baixo risco)? A minha recomendação é sim.
2. Na funcionalidade 1, com rubrica de várias linhas de BP, aceitas o popover de escolha manual em vez de rateio automático?
3. A conversão "linha genérica estimada → verba" (4.4) pode ser proposta automaticamente ou queres sempre criar a verba à mão?
