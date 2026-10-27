# P4 — RPC base da Posição Financeira — plano R2 (27/10/2026)

Classe R2 em planeamento. Sem DDL, DML, código, deploy nem Publish. HEAD na leitura: `137e8e35ffbaf9feee0835ece94edf1b65d4af45`.

## Ficheiros lidos
docs/QUADRO.md (Em execução agora), docs/estado/estado-financeiro-e-tesouraria.md, docs/DECISIONS.md (D-ERP27, D-ERP288, D-ERP318, D-ERP319), .lovable/memory/features/{event-stages, event-cash-treasury, bp-verba-por-usar, ads-invoices, account-balance-cutoff-date}.md, supabase/migrations/20260611120000_event_cash_treasury.sql (assinaturas).

## Funções existentes (catálogo Live)
- get_event_cash_position(p_company_id, p_date_from, p_date_to): SECURITY DEFINER. Espelha computeBalance por evento. Serve como âncora de reconciliação da caixa.
- get_event_cash_position_invariant(p_company_id): SECURITY DEFINER. Serve como prova.
- ticket_office_balances(uuid[]) e _ticket_office_balance_raw(uuid): SECURITY DEFINER. Fonte canónica do retido. Serve.
- event_stage(uuid): SECURITY DEFINER, sem EXECUTE para o leitor do agente. A nova RPC chama-a do lado do servidor.
- ReportForecastPayables: aberto + saldo do BP limitado a 0. Serve com ajuste (regra 2: BP bruto − pernas pagas, por estágio).

## Medições Live (MP 7c858982…, só SELECT, 27/10/2026 ~14:55 UTC)
Estágio replicado inline a partir das regras do event-stages.md, porque o leitor não pode executar event_stage. Raízes: em_curso 2026=1 e 2027=2; em_fecho 2026=4; fechado 2026=4; histórico 2024=1, 2025=3, 2026=6. Planeamento=0.
- Mães sem evento com filhas: 58 / 371.639,97 € base. Filhas sem evento: 0. A regra 4 funciona para estas.
- **Mães COM event_id e com filhas: 11 / 194.955,29 € base.** Em todas, as filhas estão no mesmo evento da mãe, e as somas das filhas diferem da mãe (ex.: 9.106,25 contra 27.318,75). Não é rateio. Parece outro padrão de mãe/filha (por exemplo, parcelas ou retenção). **Colisão com a regra 4: sem um predicado novo, estas contavam duas vezes.**
- Pagamentos com data futura: 0 (transações pagas) e 0 (pernas pagas). A regra 8 confirma-se.
- Revertidas: 1. Transitórias: 57. exclude_from_result: 84. Pernas duplicadas (mesma transação, valor e data, não revertidas): 0. Estados das pernas: paid, cancelled, reversed.
- BP com paying_partner_id: 157 linhas / 1.272.123,94 € base, excluídas do a pagar (regra 5). Transações com paying_partner_id: 19 / 207.145,08 €.
- Tipos de conta: bank, cash, prepaid_card, ticket_office, camarim_session, other.
- O teste «pernas pagas acima do BP» por categoria (232 linhas) **não é válido**: há várias linhas de BP na mesma categoria e a junção multiplica as pernas. O emparelhamento BP↔transação tem de seguir a regra das parcelas (direto + categoria, mem bp-installments) e fica por medir na implementação.

## Contrato (proposto, por aprovar)
get_financial_position_base(p_company_id uuid, p_year int) RETURNS jsonb, STABLE. A empresa tem de coincidir com current_company_id(), salvo platform_admin. Blocos: meta, events_by_stage, cash_accounts, cards, retained (com is_hidden), payables_by_stage, receivables_by_stage, settlement_accounts_info (fora do total), position (caixa e retido lado a lado). Agregação inteira no servidor, abaixo do limite de 1000 linhas. REVOKE de PUBLIC/anon e GRANT a authenticated na mesma migração, conferidos com has_function_privilege. SECURITY DEFINER só porque event_stage e ticket_office_balances já o são e o leitor precisa delas.

## Predicados (rascunho)
- Estágio da raiz = event_stage(raiz); o sub-evento herda. O histórico fica excluído.
- Planeamento: transações por pagar (amount bruto − pernas paid não revertidas).
- Em curso / em fecho / fechado: BP despesa bruto (paying_partner_id nulo, sem mães de rateio, cachê pelo contrato se existir senão cache_module) − pernas pagas emparelhadas.
- Excluir: mães sem evento com filhas; reversed_at não nulo; pernas com status diferente de paid. Transitórias e exclude_from_result: por decidir (ver questões).

## Verificação e testes (para a implementação)
Reconciliar a caixa por conta com computeBalance e get_event_cash_position; o retido com ticket_office_balances; PGlite por regra; rollback comentado em supabase/manual/.

## Paragem
Parado pela colisão das 11 mães com evento e pela referência D-ERP288. Ver docs/questoes-p4-posicao-base-20261027.md.

## Continuação 27/10/2026 15:01 UTC (HEAD fa357be0), só SELECT em Live, MP
Q1 confirmado: 69 mães = 58 (event_id nulo, installment_total nulo, 0 filhas com installment_number) + 11 (event_id e installment_total preenchidos, filhas com installment_number). Nenhum caso misto. Predicado: mãe de rateio = tem filhas AND installment_total IS NULL AND event_id IS NULL.
Q2: a data de referência Lisboa vem de DECISIONS.md, por volta da linha 4174 (pagamento sem data futura). Não vem de D-ERP288.
Q3 transitórias (is_transitory, por motivo/tipo/estado):
  em aberto: repasse despesa 4 / 63.536,42 (approved, pago 0); repasse receita 1 / 5.192,19.
  fechadas: aporte_socio 25 / 353.810,51; repasse desp 6 / 17.906,94; carga_cartao 5+5 / 5.166,68 (sem evento); entrada_a_repassar 4 / 28.430,03; emprestimo_socio 3 / 26.216,66; caucao 1 / 34.000; partner_advance 3 / base 2.008,23, pago 2.088,73.
  Proposta: os repasses em aberto entram no a pagar/a receber, na sublinha transitórias. aporte/emprestimo/partner_advance vão para as contas de acerto, informativo. carga_cartao fica fora.
Inventário (parcial):
  cache_payment_contracts: 4 ativos; liga a eventos via cache_payment_contract_cities.forecast_id (22 cidades com forecast). Serve, com um ajuste: o contrato substitui a linha cache_module desse forecast_id, sem a somar.
  event_third_party_operations: 3 registos (gross_amount/operator_result). Serve com ajuste, só informativo na v1.
  sponsorship_pipeline: 5 fechados/barter. Não serve na v1 (Q6); entra na v2 como informativo.
Pago acima do BP (pernas por forecast_id, BP despesa sem sócio pagador): 427 linhas com transações. Com o fator 1,23 aproximado, 1 linha excede (+1.756,00). É provisório: falta usar o iva_rate real de cada linha.
PENDENTE: leitura integral de INDEX.md, da migração 20260611120000, de ReportForecastPayables e do cálculo de saldos; reconciliação da caixa por conta com get_event_cash_position e do retido com ticket_office_balances.
