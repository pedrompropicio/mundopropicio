# PROCEDIMENTO — Rateio de day-offs de turnê

Aplica-se a custos de dias sem show numa turnê, partilhados com outras cidades ou promotores, cuja parte da MP só se conhece no acerto final. O encontro de contas é **gerencial**. A parte fiscal resolve-se fora: no movimento financeiro emite-se ou recebe-se fatura.

## Passo 1 — Onde nasce a linha de BP

- **Turnê com Master:** linha "Rateio day-offs" no Master; espelha-se proporcionalmente nas cidades.
- **Data única:** linha no próprio evento.

O valor é estimativa da nossa parte. É previsão, não compromisso.

## Passo 2 — Conta de acerto

Uma conta por circuito, criada em Contas com `is_accounting = false` (não é conta contabilística) e `skip_balance_check = true` (permite liquidar sem saldo). O saldo dela é a posição do encontro de contas, não caixa.

Precedente: conta corrente Google Ads. **Não** é o padrão do Acerto de Madrid.

## Passo 3 — Lançar as transações do circuito

Toda a despesa que vai a encontro de contas — paga por nós ou a receber de terceiros — lança-se com **Excluir do Resultado** ligado e liquida-se pela conta do Passo 2.

Move a conta, não entra no resultado nem consome verba do BP. A trava de linha de BP não se aplica: `exclude_from_result` é uma das quatro excepções da trava.

## Passo 4 — Onde as encontrar

- Capa do evento: card **"Fora do resultado"**, com contagem e soma.
- Transações: chip **"Fora do Resultado"**, ou o deep-link `?event=<id>&excluded=1`.

## Passo 5 — Acerto final

Conhecida a nossa parte por rubrica:

1. Lançar as transações definitivas por rubrica, agora **dentro** do resultado, ligadas às linhas de BP respectivas.
2. Ajustar cada linha de BP ao valor real.
3. Baixar a linha "Rateio day-offs" ao que sobrar dela — ou a zero, se tudo passou às rubricas.
4. Guardar o mapa do acerto (cidades, totais, a nossa quota) em **Documentos** do evento.

## Passo 6 — Conferir

- Painel **"Verba por usar"** no Fecho: a linha de rateio não deve lá aparecer.
- Conta de acerto a zero, ou com a diferença explicada e a receber/pagar.
- Marcar "Verbas revistas" no painel.

⚠️ Nada no sistema obriga o Passo 5. `event_close_blockers` não testa verba por usar e `raise_forecast_budget` só sobe linhas. O painel avisa; a decisão é de gestão.
