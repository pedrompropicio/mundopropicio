# P4 — Posição Financeira base (R2, continuação do plano)

HEAD atual: fa357be01a0453de6938d841c99b1eb9573dfcdf (mudou desde b14b50ae).
Neste turno não houve código, DDL, DML nem Publish.

## Provas novas em Live (só SELECT, MP 7c858982…)

Q1. Predicado confirmado nas 69 mães (transações com filhas via parent_transaction_id):
- 58: event_id nulo, installment_total nulo, 0 filhas com installment_number. São rateio e ficam excluídas.
- 11: event_id preenchido, installment_total preenchido, filhas com installment_number. São cadeias de parcelas e contam todas.
- Nenhum caso misto. Predicado fixado: mãe de rateio = tem filhas AND installment_total IS NULL AND event_id IS NULL.

Q2. A data de referência `(now() AT TIME ZONE 'Europe/Lisbon')::date` está em DECISIONS.md, por volta da linha 4174 (triggers de pagamento sem data futura). Depois do Sim, corrijo a citação em event-stages.md e no R0.

Q3. Transitórias, medidas por motivo, tipo e estado:
- Fechadas (pago = base): aporte_socio receita 25 / 353.810,51; repasse despesa 6 / 17.906,94; carga_cartao 5+5 / 5.166,68 cada (sem evento, anulam-se); entrada_a_repassar 4 / 28.430,03; emprestimo_socio 3 / 26.216,66 (sem evento); caucao 1 / 34.000,00; partner_advance 3 / base 2.008,23, pago 2.088,73.
- Em aberto: repasse despesa 4 / 63.536,42 (aprovadas, pago 0, com evento); repasse receita 1 / 5.192,19 (aprovada, pago 0, com evento).
- Proposta: a caixa conta sempre o que foi pago. O a pagar e o a receber contam as transitórias de repasse em aberto, numa sublinha «transitórias», porque são obrigação real. aporte_socio, emprestimo_socio e partner_advance vão para a linha informativa das contas de acerto. carga_cartao é interna e fica fora. O alerta de partner_advance mostra 80,50 € pagos acima da base (em bruto, por confirmar).

Q4–Q6 ficam como o Pedro decidiu: mínimo 0 por linha com alerta separado; transação sem BP entra com contagem e nunca em dobro com o forecast_id; o a receber em planeamento conta só transações.

## Ainda por fazer (só leitura, primeiro passo depois da aprovação)
1. Ler por inteiro docs/INDEX.md (188 linhas), 20260611120000_event_cash_treasury.sql, ReportForecastPayables.tsx e o cálculo de saldos (computeBalance/fetchAccountCashAdjustments).
2. Classificar no inventário: contas e cartões, receitas por receber, event_third_party_operations, sponsorship_pipeline.
3. Cachê: cache_payment_contracts não tem event_id. Primeiro leio o esquema (ligação por cidade/linhas), depois meço contrato vs cache_module por artista e evento, sem dupla contagem.
4. «Pago acima do BP»: emparelhar pelo forecast_id ou pela 1.ª parcela (bp-installments), depois UNION por categoria sem multiplicar as pernas.
5. Reconciliar a caixa por conta com get_event_cash_position, e o retido com ticket_office_balances.
6. Atualizar o R0 (docs/testes/p4-posicao-base-plano-20261027.md), as questões (docs/questoes-p4-posicao-base-20261027.md) e a reserva no QUADRO (R2 em planeamento, sem PARADO). Depois paro e espero novo Sim para implementar.

## Fica para a implementação (com outro Sim)
- RPC get_financial_position_base(p_company_id, p_year) devolve jsonb com blocos: caixa, cartões, retido, a pagar por estágio, a receber por estágio, contas de acerto informativas e eventos por estágio. Agrega no servidor, contornando o limite de 1000 linhas.
- Usa SECURITY DEFINER só para ler event_stage. Valida a empresa ativa. A mesma migração faz REVOKE anon e GRANT authenticated, verificados com has_function_privilege. O rollback fica guardado.
- Testes PGlite/vitest como no P1/P1b. Sem Publish.
