# Modelos de relatório — regras e molde

Decisão do Pedro, 23/10/2026: os relatórios que ficam bons guardam-se aqui, no repo, para serem reutilizados por qualquer chat, no Claude ou no ChatGPT. Não há segundo sítio: um relatório que viva só num chat, num Claude Doc ou num ficheiro do Projeto não é modelo.

## Onde

`docs/modelos/<pasta-do-modelo>/` — nome em kebab-case, sem datas (ex.: `fecho-evento`, `bilheteira-por-apuramento`, `trafego-x-vendas-diario`, `dre-gerencial`, `acerto-com-socios`, `conciliacao-cartoes`). O catálogo é `docs/modelos/INDEX.md`; é o único ficheiro que os chats lêem no arranque — o resto só quando usam o modelo.

## Quatro peças fixas por modelo

1. `README.md` — o que é; quando se usa e quando não; ordem das secções; o que entra e o que fica de fora; regras de forma (pt-PT ou pt-BR, moeda, casas decimais, bloco WhatsApp quando é para a equipa — negrito com asteriscos simples, linhas curtas, sem tabelas); decisões D-ERP que o condicionam.
2. `queries.sql` — as consultas que o alimentam, em blocos curtos e separados, com os parâmetros marcados `{{event_id}}`, `{{company_id}}`, `{{period_from}}`, `{{period_to}}`. Só SELECT.
3. `template.md` (ou `template.xlsx`, `template.html`) — o esqueleto com marcadores `{{…}}`; sem números fixos.
4. `exemplo/` — um relatório real que ficou bom, tal como saiu, com data e origem dos números no topo. É a peça que mais ajuda a reproduzir. Dados pessoais de sócios, fornecedores ou clientes: anonimizados (o repo é público).

## Como se usa

- Pedido ao chat: "faz o relatório `<pasta>` para `<evento/período>`". O chat lê o `README.md` e o `queries.sql`, corre as consultas na hora (números nunca de memória), preenche o template e entrega.
- Se o resultado exigiu desvios ao modelo que valem para o futuro, o chat actualiza o modelo (R0) no mesmo fecho; desvios só daquele caso ficam no relatório, não no modelo.
- Um modelo novo nasce de um relatório que o Pedro deu por bom. O chat que o fez cria a pasta com as quatro peças e acrescenta a linha ao `INDEX.md`.

## Molde do `README.md` de um modelo

```
# <Nome do modelo>

**Para que serve.** …
**Quando se usa / quando não.** …
**Chat dono.** <n · frente>
**Fontes.** <tabelas, RPCs, ficheiros> — ver queries.sql
**Saída.** <md / xlsx / html / bloco WhatsApp>; língua <pt-PT|pt-BR>

## Secções, por ordem
1. …
2. …

## Regras de forma
- …

## O que fica de fora
- …

## Decisões que o condicionam
- D-ERP… — …

## Histórico
- <data> — criado a partir de <origem> (chat, Issue, ficheiro)
```

## Não é modelo

Handoffs, planos, actas de decisão, prompts, auditorias de uma só vez. Esses ficam onde estão (docs/handoffs, docs/DECISIONS.md, docs/prompts, claude/*).
