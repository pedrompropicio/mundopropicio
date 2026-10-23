# Ocupação e lotação

**Para que serve.** Dizer quanto da sala está ocupado agora, por zona, sem contar lugares que já não existem.
**Quando se usa / quando não.** Quando se olha para a venda de um evento em curso, antes de decidir uma virada de lote ou um aumento de sala, e sempre que a carga no ecrã não parece bater com o tamanho da sala. Não responde a "quanto do que planeámos já vendemos" — isso é outra pergunta e tem outro relatório.
**Chat dono.** 3 · Ticketing e Receita
**Fontes.** `event_zone_capacities` (com `observed_on`), `ticket_sales` por `zone_id` — ver `queries.sql`
**Saída.** md, com bloco WhatsApp quando vai para a equipa; língua pt-PT

## A regra, que é toda a razão de ser deste modelo

**Carga, ocupado, bloqueado, lugares por vender e ocupação da sala vêm todos da mesma observação: a mais recente do evento.** Uma zona que não aparece nessa observação deixou de existir — mudou de nome — e não conta para nada. **Nunca se mistura a leitura de hoje com a de outro dia.**

Quando a bilheteira muda o nome de uma zona, a linha antiga fica na tabela para sempre. Somar "a última linha de cada zona" em vez de "todas as linhas da última observação" duplica a sala.

## Secções, por ordem

1. **A observação usada** — data, e quantas zonas tem. Primeira linha do relatório, sempre.
2. **Os números da sala** — carga, ocupado, bloqueado, por vender, ocupação.
3. **Por zona** — a tabela.
4. **Zonas fantasma detetadas**, se houver: quais, de que dia, e quantos lugares somavam.
5. **Leitura comercial** — uma ou duas frases, com os dias que faltam para o espetáculo.

## Regras de forma

- **Percentagens sobre o que está libertado**, nunca sobre o total do recinto ou da temporada.
- A data da observação entra no relatório, não só a data de hoje. São coisas diferentes e a distância entre as duas é informação.
- Se a carga mudar face ao relatório anterior, dizer porquê antes de dizer a percentagem. Uma ocupação que salta 20 pontos sem venda nenhuma é zona fantasma, não é sucesso.
- Bloco WhatsApp para a equipa: negrito com asteriscos simples, linhas curtas, sem tabelas.

## O que fica de fora

- Receita e conta-corrente com a bilheteira — `bilheteira-por-apuramento`.
- Curva de vendas e projeção — relatório próprio.
- Taxa de ocupação contra a capacidade **planeada**: mede outra coisa (o que planeámos contra o que vendemos) e deve manter-se separada, com um nome que diga o que mede.

## Decisões que o condicionam

- Precedência de origem **por evento, nunca por linha**: se o evento tem linhas num espelho, a série vem só do espelho; as duas famílias nunca se somam.
- Qualquer soma de vendas começa numa RPC, nunca numa leitura montada no cliente — o PostgREST corta aos 1.000 em silêncio.
- `ticket_sales` liga-se por `zone_id` e **não tem `event_id`**.

## Porque é que isto reincidiu, e o que impede a terceira vez

A primeira correcção foi feita **só na função da base de dados**. Os ecrãs que fazem as contas no próprio componente ficaram de fora e continuaram com a regra antiga — a mesma pergunta respondida por duas implementações diferentes. A regra vive agora numa função única partilhada pelos cartões, pela tabela por zona e pela ocupação por cidade, com testes. **Ao mexer nesta conta, mexe-se na função única, nunca no componente.**

## Histórico

- 2026-10-23 — criado a partir de `claude/zonas-fantasma-carga-inflacionada-2026-09-30.md` (reincidência da Issue #198), com `claude/bi-ocupacao-fonte-e-zonas-fantasma-198-2026-09-17.md` e `claude/bol-ocupacao-por-zona-2026-08-28.md`.
