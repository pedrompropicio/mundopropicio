# P4 — RPC base da Posição Financeira (planeamento R2)

Estado confirmado: HEAD `ebd4e7c29c062ad65e481241e1a06a35d5675e77`; o último trabalho (P3) está concluído.
Lido até agora: `.lovable/memory/features/event-cash-treasury.md`, `account-balance-cutoff-date.md`; lista de `features/` (existem event-stages, bp-verba-por-usar, ads-invoices, event-cash-treasury, account-balance-cutoff-date); `docs/DECISIONS.md` (D-ERP27, D-ERP288, D-ERP318, D-ERP319).

## Colisão a confirmar antes de medir
- D-ERP288 em DECISIONS é «contratos de pagamento do cachê com retenção na fonte», não as datas em Europe/Lisbon. A regra Lisbon aparece noutra decisão (linha 4174, data de referência dos lançamentos). Pergunta 1: a regra 8 cita a decisão certa?

## O que este plano faz (só leitura e documentos, sem DDL nem DML)
Em modo plano só posso gravar este ficheiro. Depois do «Sim» ao plano, a primeira ação é documental (R0):
0. Reserva «P4 posição base — R2 em planeamento — agente Lovable» no QUADRO (secção do chat), depois de reconfirmar o HEAD.
1. Ler na íntegra docs/INDEX.md, QUADRO, estado-financeiro-e-tesouraria.md, as 5 memórias e `20260611120000_event_cash_treasury.sql`, `ticket-office-reconciliation.ts`, `ReportForecastPayables.tsx`, `account-balance.ts`.
2. Medir tudo de novo em Live só com SELECT (as referências de 25/10 deixam de valer).
3. Gravar `docs/testes/p4-posicao-base-plano-20261027.md` (A–F) e `docs/questoes-p4-posicao-base-20261027.md`.
4. Parar. A implementação (migração, testes, aplicação em Live) exige um «Sim» próprio.

## A) Inventário (cada item: serve / serve com ajuste / não serve, com prova)
- `get_event_cash_position(company, from, to)`: espelha `computeBalance` por evento. É a âncora provável para reconciliar a caixa. Verificar se trata as mães de rateio e o corte `initial_balance_date`.
- `get_event_cash_position_invariant`: usar como prova de reconciliação.
- `ticket_office_balances` / `_ticket_office_balance_raw`: fonte canónica do retido (regra AGENTS: RPC de saldo retido). Verificar o tratamento de `is_hidden`.
- ReportForecastPayables (Exposição Financeira): open + saldo BP limitado a 0. Comparar com a regra 2 (BP − pago, bruto).
- `financial_accounts`, cartões, `transaction_payments` (pernas), receitas por receber, `event_third_party_operations`, `sponsorship_pipeline`: classificar cada um.

## B) Contrato proposto da RPC
`get_financial_position_base(p_company_id uuid, p_year int) RETURNS jsonb`. Escolho jsonb porque os blocos têm formas diferentes e a resposta fica numa só linha, abaixo do limite de 1000 linhas.
Blocos: `meta` (empresa, ano, data Lisbon), `events_by_stage`, `cash_accounts[]`, `cards[]`, `retained[]` (por bilheteira, com `is_hidden`), `payables_by_stage`, `receivables_by_stage`, `settlement_accounts_info[]` (EIN, CC Pedro, PNI, fora do total), `position` (caixa e retido lado a lado, sem os somar entre si).
- Empresa: a RPC recusa se `p_company_id` for diferente da empresa ativa (salvo platform_admin). STABLE. SECURITY INVOKER se a RLS permitir; caso contrário DEFINER com search_path fixo. REVOKE de PUBLIC/anon e GRANT a authenticated na mesma migração, verificados com has_function_privilege.

## C) Predicados (a fixar com medição)
- Estágio: `event_stage(root)`, com o sub-evento a seguir o master; o histórico fica excluído.
- Planeamento: só transações lançadas e por pagar.
- Em curso / em fecho / fechado: a pagar = soma do BP bruto − soma das pernas pagas, por linha e com mínimo 0 (a confirmar), excluindo `paying_partner_id` de sócio.
- Rateios: contam as filhas (`parent_transaction_id` preenchido e `event_id` preenchido); as mães sem evento com filhas ficam de fora, incluindo os cachês-mãe 2.1.01.
- Cachê: contrato se existir, senão a linha cache_module, sem duplicar o artista.
- Exclusões a provar com contagens em Live: reversões, transitórias, `exclude_from_result`, pagamentos com data futura (tem de dar 0).

## D) Limite de 1000 linhas
Agregação inteira no servidor; o cliente não pagina.

## E) Verificação e testes
Reconciliar a caixa por conta com `computeBalance` e `get_event_cash_position`, e o retido com a RPC de bilheteira. Testes PGlite/vitest para cada regra (1–8). Rollback comentado guardado em supabase/manual/.

## F) Riscos e perguntas
1. A referência D-ERP288 (ver acima).
2. O a pagar por linha de BP fica com mínimo 0, ou um pagamento a mais desconta noutra linha?
3. Uma transação de evento fechado sem linha de BP ou com BP por rever: entra por cima do BP ou é só alerta?
4. Se aparecerem pernas de pagamento duplicadas ou mães de rateio com evento, paro e reporto.
5. O a receber em planeamento vem só das transações ou também do pipeline de patrocínio fechado?
