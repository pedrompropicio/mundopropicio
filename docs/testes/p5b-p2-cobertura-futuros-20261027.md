# P5b passo 2 — cobertura_futuros (p5-v3) — R1 — 27/10/2026

Sim explícito do Pedro (20:45 UTC); 39–43 pelas recomendadas; 3 correções do 0 aplicadas. Sem DDL, sem DML, sem Publish.

## O que mudou
- Novo `supabase/functions/_shared/financial-position/future-coverage.ts` (puro).
- `assemble.ts`: versão p5-v3, campo `cobertura_futuros`, nota «Destinado a eventos futuros: X € dentro do caixa» no Saldo Geral (caixa e totais iguais).
- `financial-position/index.ts`: leituras do bloco em paralelo ao motor, deadline 6 s; ficheiro tocado para a função ser reconstruída (leva também o p5-v2).
- `src/lib/financial-position-p5.ts`: zod aceita só p5-v3; bloco strict; incompleto ⇔ eventos/bilheteiras/total null.
- `FutureCoverageCard` na página Posição Financeira (sempre "todos os anos"; duas leituras lado a lado).

## Fontes e chamadas
- a pagar/BP/pagas: `a_pagar.por_evento` (0284), sem réplica.
- vendas: `get_ticket_office_sales(p_account_id)` com o JWT do utilizador. É SECURITY INVOKER com EXECUTE para authenticated e service_role; usa-se o JWT para respeitar a RLS do utilizador. Falha → bloco incompleto.
- caixa: `get_event_cash_position(p_company_id)` com o JWT do utilizador (exige current_company_id/is_platform_admin); soma por event_id contra a árvore completa.
- movimento anterior ao corte: transações do evento em contas bank/cash/prepaid_card com skip_balance_check=false e payment_date ≤ initial_balance_date; income +, expense −; reversed_at nulo.
- aportes: income, paid, is_transitory, transitory_reason=aporte_socio.

## Fixtures (vitest, sem credenciais)
Madrid: aporte sócios 353.810,51 (249.000,00 conta líquida + 104.810,51 direto/automático); aporte MP 24.775,57; dinheiro parado desde corte −6.724,50 + anterior ao corte 99.000,00 = 92.275,50; necessidade com faturas sem linha 358.035,96, assumindo que cobrem BP 195.699,00. Ghanem: Ticketline mínimo 109.050,59, indeterminado; BOL retido = vendas → 0; ECI única. Newgang: sem vendas, caixa MP adiantado 18.444,20. Planeamento sem data marcado; em_curso já iniciado fora. Saldos invisíveis → null. Caixa negado → incompleto. Saldo Geral/sócios/resultado iguais com e sem bloco.

## Para o 0 verificar em Live
1. Chamada autenticada à função: `meta.version = "p5-v3"`.
2. p5-v2 no mesmo deploy: existe `projecao_em_curso`; Madrid fora de `socios.linhas`; `socios.a_receber_total` sem Madrid.
3. `cobertura_futuros.meta.incompleto = false`; Madrid: dinheiro_parado_bruto {desde_corte −6.724,50, anterior_ao_corte 99.000,00}; vendas ECI = valor do dia (ex. 297.462,25); aporte_socios.total 353.810,51.
4. Por conta: vendas futuras e retido contra SELECT independente; Ticketline saido_minimo = max(0, vendas futuras − retido).
5. `meta.duracao_ms` comparado com 6–8 s anteriores.
