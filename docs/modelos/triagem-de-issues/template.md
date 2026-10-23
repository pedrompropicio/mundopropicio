# Triagem das {{n_abertas}} issues abertas — {{data}}

Feita no chat {{chat}}. Fonte: edge function `github-issues`, `{"action":"list"}`, consultada a
{{data_hora_utc}} por `net.http_post` com o Bearer do vault. {{n_abertas}} abertas,
{{n_paginas}} página(s) (`has_more` {{has_more}}).

Classificação por título e label. **Cada issue verde é reconfirmada contra o código antes de
entrar num lote.**

## Método dos lotes

- **Verde** — correcção local, causa clara, sem DDL destrutivo, sem regra de negócio por decidir. Corre sem autorização caso a caso, em lotes de 3 a 5, com verificação em Live e Publish por lote.
- **Amarelo** — mexe em DDL/RLS, em crons, ou em números que entram num fecho. Preparado pelo chat, um "ok" do Pedro por lote.
- **Vermelho** — não tem resposta técnica. Espera uma decisão, um documento ou um ficheiro.

## Vermelho — {{n_vermelho}} issues, esperam o Pedro

| # | O que falta decidir |
|---|---|
| {{numero}} ({{prioridade}}) | {{o_que_falta_decidir}} |

## Verde — {{n_verde}} issues, corro sem perguntar

Lote 1 — {{criterio_do_lote_1}}:

- **{{numero}}** {{uma_linha}}

Lote 2 — {{criterio_do_lote_2}}:

- **{{numero}}** {{uma_linha}}

## Amarelo — {{n_amarelo}} issues, um "ok" por lote

**{{familia}}**: {{numero}} {{uma_linha}} · {{numero}} {{uma_linha}}

## Notas que saíram da triagem

{{duplicados, issues que explicam outras, enunciados que já não batem com o código}}
