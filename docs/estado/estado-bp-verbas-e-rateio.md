# ESTADO — BP, Verbas & Rateio

Atualizado: 2026-09-06 · #103 rondas 1 e 2 em produção (Publish do Pedro a 04/09 e 06/09)

## Em que pé está
O BP de receita está construído. A aba Business Plan tem sub-separadores Despesas | Receitas e as receitas com módulo aparecem como linhas sintéticas não persistidas — 1.1.01 (bilheteira), 1.1.03 (A&B) e 1.2.01 (patrocínios, D22) — com três colunas s/IVA: previsto original, previsto corrente e real.

- **1.1.01 Bilheteira:** previsto original fixado uma única vez em `events.ticketing_baseline_net`; previsto corrente do cenário Forecast do Simulador ao vivo (`computeLiveTicketForecast`, capacidade = carga corrente de `zone_capacity_snapshot`); real de `ticket_sales` líquido por IVA do lote (D11 linha a linha). Há duas cargas (D20): inicial = `event_ticket_zones.total_capacity`; corrente = último retrato de `event_zone_capacities`, capturado pelo ciclo diário da Ticketline (v2.40) e mostrado com data.
- **1.1.03 A&B:** corrente do cenário A&B ativo, real de `useEventABRealized`, original de `events.ab_baseline_net`.
- **1.2.01 Patrocínios (D22):** só aparece quando o evento tem verbas em `event_sponsorship_targets`. Previsto original = Σ `baseline_amount` das verbas; previsto corrente = fechados + por captar até `events.sponsorship_closed_at`, depois só fechados; real = Σ `confirmed_amount` dos cards fechados não-permuta. A apresentação exclui as linhas de BP ligadas a esses cards (`1.2.01` ou `1.2.02`) para não duplicar. Segmentos por empresa em `sponsorship_segments` (7 semeados, trigger para empresas novas). Painel "Verbas de patrocínio" e botão "Encerrar captação" na aba Receitas, gated por `manage_bp`.

Receitas manuais continuam como `event_forecasts` com `type='income'`. Totais e estado vazio incluem sintéticas + reais + manuais; card Receitas bate ao cabeçalho.

## A trabalhar agora
Nada em execução.

## Próximo passo concreto
Definir as verbas por segmento nos eventos futuros (Ghanem 2027 e seguintes) — sem verbas o BP de receita de patrocínios é só o realizado. Depois: curva de evolução L1/L2/L3 sobre `forecast_audit_log` (charter do chat bp-x-resultado, ponto 5).

## Bloqueios
Nenhum.

## Factos que não se reinvestigam

**Fundações construídas a 02/09 (todas inertes):**
- `manage_bp` — permissão criada e LIGADA às RPCs batch_insert/update_event_forecasts (via has_permission_in com o company_id do evento) e ao canEditBP do EventForecast. Admin e manager têm-na; comportamento igual ao anterior.
- `approve_transactions` e `raise_budget` — permissões criadas, admin e manager.
- Trigger `enforce_transaction_approval_permission` BEFORE INSERT OR UPDATE em transactions: protege a transição para 'approved'. Excepção obrigatória para auth.uid() NULL (service_role, crons, edge functions). Fechou um buraco real — a policy de UPDATE permitia a editor aprovar por fora da UI.
- `companies.default_budget_mode` (with_bp | without_bp) e `events.budget_mode` (nullable, herda). Função `event_budget_mode(_event_id)`. Fortal e Siriguella (BR) nascem em `without_bp`; MP e Coala em `with_bp`. Os 43 eventos existentes ficaram a NULL.
- `event_forecasts.baseline_amount` — o previsto original (D3), com trigger BEFORE INSERT e carry preservado em promote_scenario_to_active. NÃO confundir com `original_amount`, que é o valor na moeda de origem do multi-currency.

**Elevação de verba não tem limite em euros.** Decisão de 02/09: é permissão booleana (`raise_budget`). Quem a tem eleva sem limiar; quem não a tem não eleva e a tarefa sobe ao diretor. Não há tabela de limites nem segundo aprovador.

**Baseline vs corrente, medido:** 1.074 linhas activas. Soma baseline 6.148.757,20 €; soma corrente 6.230.181,72 €. O previsto cresceu **81.424,52 €**. O backfill usou o valor mais antigo do forecast_audit_log em 94 linhas e o valor actual nas restantes — o audit só arranca a 17/06/2026, logo para as mais antigas o "original" é o valor à data do backfill.

**Coerência de IVA BP × Transações.** De 174 linhas com transações vinculadas, 21 têm taxa divergente: injectam **41.077,40 €** de ruído nas leituras c/IVA contra 21.648,19 € de desvio real em base. 15 têm taxa única (corrigível), 6 têm transações de taxas mistas (hotel, camarim — casos do D11.3). Secção nova no relatório /relatorios/auditoria-iva, com botão "Adotar taxa efetiva" manual, por linha, gated por manage_bp.

**Anitta EDA 2026 — 7 linhas por decidir, NÃO corrigir sem autorização do Pedro.** Taxa de BP a 23% com faturas a 0% (open bar produto e pessoal, produtos de camarim, bares VIP produto e pessoal, sala VIP aeroporto). Previsto bruto 82.450,94 € com a taxa do BP contra 68.573,76 € com a taxa real: **13.877,19 €** de despesa inexistente. SÓ afecta o fecho se o critério estiver em "previsto + excedido" (o default do useEventCostBasis é "realizado", guardado em localStorage por user+evento). Com c/IVA ligado (contratual, net_result_gross_expenses) e base committed, baixa a quota em ~2.081 € (EIN 15%) e ~9.714 € (ANITTA 70%). O evento está em fecho — nada se altera sem análise do Pedro.

**IVA 0% no BP tem quatro causas distintas e o sistema não as separa:** isenção legal (seguros, taxas públicas, per diems, alfândega); autoliquidação intracomunitária (Meta, Google, ClepMedia); transporte internacional (aéreo); e composição mista onde o zero é aproximação (hospedagem, camarins). 208 das 712 linhas de despesa estão a 0%, 2.091.583,15 €. Hospedagem: 28 linhas, 127.298,03 €, em 13 eventos — é convenção da equipa, não erro. NÃO mexer antes do campo de desembolso previsto existir (D11.2/11.3).

**Fórmula do previsto original fechada a 03/09 (adenda D21):** min(carga inicial, Σ qty dos lotes de planeamento) × preço médio líquido ponderado dos lotes de planeamento. Sem lotes de planeamento → "—" e nada se grava.

**Baselines já fixadas em produção (query a `events`, 05/09):** Ivete 232.075,47 € (fixada 03/09 23:58 UTC; A&B 67.948,75 €) e Anitta EDA 2026 2.591.000,00 € (fixada 04/09 11:04 UTC; 30.207 bilhetes de lotes de planeamento × preço líquido; carga inicial 40.000). São colunas novas, não tocam em nenhum apuramento nem no fecho da Anitta.

**Ivete, carga corrente lida da Ticketline:** 20.016 a 27/08 (lotes 4/5 abertos) → 8.500 desde 03/09 (lotes 4/5 a zero, Lote 3 reduzido). Ocupação 05/09: 7.533. Vendas 05/09 11:13 UTC: 6.043 bilhetes, 453.192,92 € s/IVA. A ocupação inclui convites/bloqueios — não é venda paga.

**O 1,57 M€ que apareceu como previsto corrente a 03/09 era o fallback estático sobre `event_simulator_inputs` parados desde 10/06** — eliminado (adenda 2 da D21). `event_simulator_inputs` não tem cron: refresca ao abrir o Simulador e nem a página nem o BP dependem dele.

**Publish pode não reconstruir edge functions** (03/09: `fetch-ticketline-reports` ficou em v2.39 sem erro após dois Publish; resolvido com deploy directo de 4 funções). Regra: depois de Publish que toque em edge functions, confirmar a versão em produção; se divergir, deploy directo. Nota em `docs/integrations/ticketline.md`.

**Factos novos a 06/09:**
- Nenhum evento tem verbas de patrocínio (`event_sponsorship_targets` = 0 linhas) nem captação encerrada (`events.sponsorship_closed_at` = NULL em todos).
- O motor `src/lib/sponsorship-bp-sync.ts` passou a rejeitar cards meio-ligados (#118): guarda passa a `linked_transaction_id || linked_forecast_id`; card meio-ligado devolve `half_linked`, botão de sync travado com aviso. Linhas novas geradas por cards fechados nascem com `formalidade = 'fechado'` (#119).
- Os 3 cards meio-ligados da Anitta (Durex 15.000 €, Matudis 6.000 €, Durex aluguer 813,01 €) continuam meio-ligados por decisão — corrigir só depois do fecho da Anitta, com o padrão SQL documentado do Casino.

## Onde ler mais
- `docs/DECISIONS.md` — DR-2026-09-02-D1 a D11, D20, D21, D22 + adendas
- `.lovable/memory/features/` — bp-previsto-original, event-budget-mode, fecho-filter-parity, iva-portugal, partner-rls-and-bp-edit, bp-receita, ticketline-occupation
- `src/lib/bp-income-synthetic.ts`, `src/lib/bp-sponsorship-synthetic.ts`, `src/lib/event-simulator-forecast-live.ts`
- `docs/questoes-bp-receita.md`
- `docs/integrations/ticketline.md`
