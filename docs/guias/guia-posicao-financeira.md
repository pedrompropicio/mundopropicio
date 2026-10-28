# Guia da Posição Financeira — como ler cada número

## Como usar este guia {#regras}
A Posição Financeira mostra cinco coisas lado a lado: o que há em caixa, o que está retido nas bilheteiras, o que a MP deve, o que tem a receber e o que falta financiar nos eventos futuros. Cada número tem uma fórmula e uma origem; este guia diz qual. Os valores de exemplo foram lidos em Live a 28/10/2026 (empresa Mundo Propício) e vão mudando: guarda a fórmula, não o valor.

Regras que explicam a maior parte das dúvidas:

- Caixa e retido nunca se somam: o retido ainda está nas bilheteiras, não é dinheiro da MP.
- O "a pagar" é o que a MP deve hoje: faturas já lançadas e, nos eventos já iniciados, as linhas de BP que ainda não viraram transação.
- Nos eventos que ainda não começaram, o BP por lançar não entra no "a pagar"; só aparece na cobertura de eventos futuros, como necessidade.
- Todos os valores incluem IVA.
- O BP é provisório: pode ser substituído, por isso não é o custo final.

## A pagar {#a-pagar}
Valores de 28/10/2026: a pagar 999.665,12, dos quais 594.081,75 já estão em transações. O "a pagar" soma duas coisas diferentes: faturas já lançadas em transações (compromisso firme) e saldo de linhas de BP que ainda não virou transação (estimativa).

Tabela (€, valores de 28/10/2026): Em curso (ainda não iniciados): em transações 245.094,94 · saldo de BP 0,00 · total 245.094,94. Em fecho: 338.173,19 · 231.454,58 · 569.627,77. Fechados: 10.813,62 · 174.128,78 · 184.942,40. Planeamento: 0,00 · 0,00 · 0,00. Total: 594.081,75 · 405.583,36 · 999.665,12.

- Em transações: faturas aprovadas ou parcialmente pagas ainda em aberto. Em eventos em fecho e fechados, é a sublinha "lançado" mais as transações sem linha de BP. Em eventos em curso que ainda não começaram, é o campo "só transações" (Madrid 184.670,96, RG 2027 60.398,11, Newgang 2027 25,87).
- Saldo de BP por lançar: o que o BP aprovado ainda tem acima do que já foi pago ou lançado. Nos eventos em fecho ou fechados divide-se em "confirmado", "ajustado" e "por rever"; hoje quase tudo (404.716,51) está "por rever".
- Eventos que ainda não começaram: o BP por lançar não entra aqui. É por isso que Madrid, a três semanas, só tem 184.670,96 e não os 265.640,50 de BP por lançar. Esses valores aparecem na cobertura.

Fora do total de 999.665,12 (valores de 28/10/2026):

- Transitórias a pagar: 64.703,88. Entradas e saídas de repasse; com elas, "posição → a pagar" fica 1.064.368,99.
- Caches de contratos ativos: 168.364,76. Informativo e já incluído no total; não somar de novo.
- No Saldo Geral entram ainda o que a estrutura (custos sem evento) tem por pagar e o que se deve a sócios por liquidar.

## Cobertura de eventos futuros: cada linha e de onde vem {#cobertura}
O cartão olha só para eventos em planeamento ou em curso cujo primeiro dia ainda não passou. Hoje são três da MP: Henry & Klauss Madrid (21/11/2026), Raphael Ghanem 2027 (11/02/2027) e Newgang Festival 2027 (25/03/2027). Djavan e Coala Festival Portugal 2027 não entram: pertencem à empresa Coala, que tem a sua própria posição.

Linhas (valores de 28/10/2026, €):

- Vendas futuras 625.052,75: vendas já feitas — Madrid na ECI 300.074,75; RG 2027 na Ticketline 279.893,00 e na BOL 45.085,00. Só compara; não entra na necessidade atual.
- Despesas pagas 412.469,02: já saiu da conta — Madrid 378.586,08; RG 2027 15.438,74; Newgang 18.444,20.
- A pagar lançado 245.094,94: faturas lançadas por pagar — Madrid 184.670,96; RG 2027 60.398,11; Newgang 25,87.
- BP por lançar 895.116,73: linhas de BP sem transação — Madrid 265.640,50; RG 2027 143.981,59; Newgang 485.494,64.
- Aporte de sócios 353.810,51: dinheiro que sócios já puseram nos eventos (transações de aporte).
- Aporte MP (estimativa) 58.658,51: despesas pagas menos aporte de sócios (412.469,02 − 353.810,51). É um resíduo, não um registo de quem pagou.
- Dinheiro de eventos em conta 92.275,50: soma dos eventos com saldo positivo na conta da MP (movimento desde a data de corte mais o anterior à data de corte).
- Caixa MP adiantado 21.094,40: soma dos eventos com saldo negativo — a caixa geral já pagou despesas deles.
- Saído mínimo das bilheteiras 109.050,59: o mínimo que já saiu da Ticketline para a conta da MP — vendas 279.893,00 menos retido 170.842,41.

Três pontos que costumam gerar dúvida:

- O dinheiro que entra de 15 em 15 dias da Ticketline chega ao banco sem evento associado (pool). Por isso não aparece como receita do RG 2027 nem como dinheiro de evento em conta; aparece só como "saído mínimo".
- A ECI (Madrid) tem 300.074,75 de vendas e todo o valor está retido: ainda nada chegou à conta. A BOL está igual: 45.085,00 vendidos e retidos.
- A Ticketline é uma bolsa partilhada. Hoje o RG 2027 é o único evento futuro nela, por isso o cálculo identifica a fonte. Se entrar outro evento futuro na Ticketline, a saída por evento passa a ser indeterminada.

## As necessidades de financiamento {#necessidade}
A necessidade responde: quanto dinheiro falta para pagar o que os eventos futuros vão custar, sem contar com as vendas. Calcula-se evento a evento (nunca negativa) e soma-se.

Fórmula: necessidade = a pagar lançado + BP por lançar − dinheiro do evento em conta.

Duas leituras, porque as faturas sem linha de BP podem ou não ser parte do BP por lançar (valores de 28/10/2026):

- Com faturas sem linha: 1.047.936,17 — conta tudo: 245.094,94 + 895.116,73 − 92.275,50. Leitura prudente.
- Faturas sem linha cobrem BP: 881.399,21 — assume que essas faturas (Madrid 162.336,96 e RG 2027 4.200,00, total 166.536,96) já pagam parte do BP por lançar e retira-as dele. Leitura otimista.

O bloco "com receita" subtrai das duas necessidades o que ainda vai entrar das vendas:

- potencial = max(0, receita considerada − saído mínimo)
- necessidade com receita = max(0, necessidade − potencial)

Linhas (valores de 28/10/2026, €):

- Receita considerada — 625.052,75 — hoje igual às vendas reais, porque nenhum evento tem cenário de previsão: modo Real.
- Saído mínimo — 109.050,59 — já está na conta da MP; não conta outra vez.
- Potencial após saído mínimo — 516.002,16 — 625.052,75 − 109.050,59; é o retido hoje: ECI 300.074,75 + Ticketline 170.842,41 + BOL 45.085,00.
- Com receita, com faturas sem linha — 531.934,01 — 1.047.936,17 − 516.002,16.
- Com receita, faturas sem linha cobrem BP — 365.397,05 — 881.399,21 − 516.002,16.

Quando configurares um cenário no modal da bilheteria (modo previsão e percentagem), a receita considerada passa a ser a previsão dos lotes de planeamento (quantidade × preço, com IVA), com corte pela capacidade da zona, e o potencial sobe em conformidade. Com modo Real ou 0%, o ecrã mantém-se como está hoje.

## Limites e cuidados {#limites}

- O BP é provisório. A necessidade mistura transações reais com BP que ainda pode mudar.
- O saído mínimo é um mínimo. A Ticketline paga por bolsa e parte dos repasses antigos foi atribuída a outros eventos (por exemplo, a Ivete), por isso o que saiu do RG 2027 pode ser mais do que 109.050,59 (valores de 28/10/2026), nunca menos.
- O retido não tem data de entrada. O bloco "com receita" assume que o retido (ECI, Ticketline, BOL) vai chegar à conta, mas não diz quando. Para o fluxo de pagamentos, a data de chegada dos 300.074,75 da ECI (valores de 28/10/2026) conta tanto como o valor.
- Eventos perto da data. Hoje o BP por lançar de um evento que ainda não começou não entra no "a pagar". Está prevista a mudança de mostrar esse compromisso como linha própria nos eventos que começam dentro de um horizonte (por defeito 30 dias, configurável no modal da bilheteria); Issue #389.
- Quem pagou. O sistema não regista qual sócio fez cada aporte (Issue #385) nem quem pagou os pagamentos sem conta (Issue #384); o "Aporte MP" é por isso uma estimativa por resíduo.
- Sem calendário. As linhas de BP não têm data de vencimento; o ecrã diz quanto falta pagar, não em que dia.
