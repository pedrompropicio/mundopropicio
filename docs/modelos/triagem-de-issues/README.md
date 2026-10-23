# Triagem de Issues

**Para que serve.** Varrer todas as Issues abertas, verificar cada uma contra o código e contra Live, e devolver a fila repartida por quem decide: o que corre sozinho, o que precisa de um "ok" por lote, e o que espera uma decisão do Pedro.
**Quando se usa / quando não.** Quando a fila passa das ~40 abertas, antes de uma janela de trabalho longa, ou na revisão semanal. Não se usa para uma Issue isolada — para isso lê-se a Issue.
**Chat dono.** 1 · Controller
**Fontes.** edge function `github-issues` (`{"action":"list"}`), o repo (ficheiros citados nos enunciados) e Live por `query_database` — ver `queries.sql`
**Saída.** md; língua pt-PT

## Secções, por ordem

1. **Cabeçalho** — quantas abertas, data e hora UTC da consulta, e por que caminho foi consultada.
2. **Método dos lotes** — as três cores e o que cada uma autoriza.
3. **Vermelho** — espera o Pedro. Tabela de duas colunas: nº · o que falta decidir, numa linha.
4. **Verde** — corre sem perguntar, agrupado em lotes de 3 a 5, com o critério do lote à frente ("travam trabalho a sério", "infra e build", "pequenas, de causa conhecida").
5. **Amarelo** — um "ok" por lote, agrupado por família (números de fecho · dados e séries · isolamento, segurança e backup · funcionalidade nova).
6. **Notas que saíram da triagem** — duplicados, Issues que explicam outras, enunciados que já não batem com o código.

## Regras de forma

- **Classificar pelo título é um atalho que já falhou.** Cada issue que entra em verde é reconfirmada contra o código antes de entrar no lote — foi a confiança no enunciado que fez a #265 parar a meio.
- As três cores são sobre **autorização**, não sobre dificuldade: verde = correcção local, causa clara, sem DDL destrutivo e sem regra de negócio por decidir; amarelo = mexe em DDL/RLS, em crons, ou em números que já entraram num fecho; vermelho = não tem resposta técnica, falta uma decisão, um documento ou um ficheiro.
- Vermelho é o primeiro bloco do relatório, não o último: é o único que precisa do Pedro, e é o que destranca os outros.
- Uma linha por issue. Sem descrição longa — o que lá está é o predicado que falta provar ou decidir.
- Números citados a partir de Live levam a data da consulta.

## O que fica de fora

- Fechar, comentar ou etiquetar Issues. A triagem **propõe**; escrever na Issue é acto à parte, depois do "ok".
- Issues de outro módulo que não o pedido, quando a triagem for por frente.
- Estimativas de tempo. Não se cumprem e sujam a leitura.

## Decisões que o condicionam

- **D-ERP291** — classes de risco R0/R1/R2. A cor da triagem e a classe de risco não são a mesma coisa: uma issue verde pode ser R1, e o despacho segue a classe, não a cor.
- Labels reais: `P0`/`P1`/`P2` + módulo (`MP-ERP`, `MP-AUDIENCE`, `MP-CRM`, `transversal`). **Não existem labels de estado** — o que está em curso vive no `docs/QUADRO.md`.
- O PATCH da API do GitHub **substitui** o conjunto completo de labels: enviar sempre a lista final desejada.
- `github-issues`: o parâmetro é `number`, nunca `issue_number`. A acção `create` rebenta com GitHub 500 se o payload levar `labels` — criar sem labels e pô-las logo a seguir com `update`.

## Histórico

- 2026-10-23 — criado a partir de `claude/triagem-issues-2026-10-09.md`, com o método já estabilizado em `claude/varredura-issues-noite-2026-10-09.md`, `claude/triagem-issues-2026-09-01.md`, `claude/triagem-issues-2026-08-30.md` e `claude/triagem-issues-lote-junho-2026-08-28.md`.
