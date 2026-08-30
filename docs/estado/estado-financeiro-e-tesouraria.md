# ESTADO — Financeiro & Tesouraria

Atualizado: 2026-08-30 · Issues: #84, #37, #39 · a-seguir #38

## Em que pé está
A espinha está construída e em uso: listas de pagamento com exportação SEPA (fase 1), parcelamento com editor de grupo, créditos de fornecedor, sessões de cartão pré-pago, listas de reembolso e portal da contabilista com conferência documento a documento (84 revisões reais). O que falta são as bordas — permissões, bloqueios por estado, e o retorno do banco.

Esta frente nasceu a 30/08/2026. Antes disto, estas issues não pertenciam a frente nenhuma.

## A trabalhar agora
- **#84** — despesa de evento sem linha de BP: travar na autorização, no servidor. É a frente onde o dinheiro entra no sistema, e hoje entra sem vínculo em 86% dos casos.

## Próximo passo concreto
Decidir o âmbito exato da #84 com o Pedro — em especial o tratamento dos reembolsos que nascem sem despesa original, e o limite de valor acima do qual o guarda-chuva de rubrica não é aceite.

## Bloqueios
- A #84 fica **atrás da #82** (fecho selado). Não vale apertar a entrada de custos enquanto um fecho entregue ainda se pode recalcular sozinho.
- A taxonomia com L3 duplicadas precede a construção dos guarda-chuvas: Alimentação vive em `2.2.04` e `4.5.01`, Transporte em `2.2.03` e `4.5.02`, as quatro em uso.

## Factos que não se reinvestigam

**A lista de reembolso é um veículo de pagamento, não uma unidade contabilística.** `reimbursement_note_items` tem quatro colunas úteis — o item **é** uma transação que já existe. Qualquer regra aplica-se por transação, nunca por lista. Das 24 notas, 9 misturam despesas de evento com despesas só da empresa, e uma mistura dois eventos diferentes.

**O camarim já tem o campo do vínculo ao BP e nunca foi preenchido.** `camarim_items.bp_forecast_id` está a NULL nos 35 itens; os 24 já integrados viraram transações com `event_id` e sem `forecast_id`, num total de 15.496,15 €.

**Movimentos de capital ficam fora do resultado por trigger.** Qualquer rubrica `10.1.%` recebe `is_transitory = true` por `force_transitory_for_capital_branch`. Mas **entram no apuramento de IVA na mesma** — o `IvaManagement.tsx` não filtra transitórias nem excluídas do resultado.

**`transactions.iva_rate` tem default 23.** Uma transação criada sem passar a taxa nasce a 23% e vai direta ao apuramento de IVA. A taxa tem de ser sempre explícita.

**Feriados não entram no cálculo da data de execução SEPA** — decisão registada em `pain001.ts`: o banco reagenda.

## Onde ler mais
- `.lovable/memory/features/card-sessions.md`, `supplier-credits.md`, `transaction-installments.md`, `role-accountant.md`
- Issues #84, #37, #38, #39
- Relacionada noutra frente: **#85** (redébito e acerto com sócios) vive em `fecho-e-socios`, mas os lançamentos saem aqui.
