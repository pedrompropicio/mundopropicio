# ESTADO — BP, Verbas & Rateio

Atualizado: 2026-09-02 · 11 decisões fechadas (D1–D11) · fundações construídas

## Em que pé está
O desenho do "BP como base real de custos e de receita" está fechado em 11 decisões (ver DECISIONS.md, DR-2026-09-02-D1 a D11). As quatro fundações técnicas foram construídas e estão INERTES — nenhuma altera comportamento até o D8 ser construído.

## A trabalhar agora
Nada em execução.

## Próximo passo concreto
**D8 — a regra vive no servidor.** Validação no INSERT de transactions que lê `event_budget_mode(event_id)` e exige a linha de BP quando o evento é `with_bp`. Duas excepções declaradas: filha de rateio herda do master; parcela herda do pai.

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

## Onde ler mais
- `docs/DECISIONS.md` — DR-2026-09-02-D1 a D11
- `.lovable/memory/features/` — bp-previsto-original, event-budget-mode, fecho-filter-parity, iva-portugal, partner-rls-and-bp-edit
