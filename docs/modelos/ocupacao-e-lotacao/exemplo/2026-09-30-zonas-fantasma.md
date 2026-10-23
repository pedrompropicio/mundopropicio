# Exemplo — Zonas fantasma: a carga da sala inflacionada (30/09/2026)

> **Origem dos números.** Live, leitura de 30/09/2026. Reincidência da Issue #198.
> Relatório original: `claude/zonas-fantasma-carga-inflacionada-2026-09-30.md`.
> **Anonimização:** eventos por artista e cidade, como já estavam; sem dados pessoais.

## Como apareceu

O Pedro reparou olhando para o ecrã: a carga de um dos eventos não batia com o tamanho da sala.

## O que estava errado

Os cartões do ecrã de Vendas — Carga total, Ocupado, Lugares por vender, Ocupação da sala —
construíam a carga a partir da **última linha de cada zona**, fosse de que dia fosse. Quando a
bilheteira muda o nome de uma zona, a linha antiga fica na tabela para sempre e continua a contar.

| Evento | Antes | Depois (leitura de 30/09) |
|---|---|---|
| Artista A · Porto | carga 8.482 · ocupação 63,4% | carga 6.368 · ocupado 5.376 · por vender 992 · **84,4%** |
| Artista B · Albufeira | carga 2.820 · ocupado 985 · 34,9% | carga 1.410 · ocupado 656 · por vender 754 · **46,5%** |
| Artista A · Lisboa | 6.118 / 4.398 | igual |
| Artista B · Porto | 2.955 / 2.130 | igual |

No primeiro, as fantasmas eram **6 zonas de 23/08** com o nome curto, as mesmas que hoje aparecem
com o sufixo do nome do recinto. Somavam exactamente **2.114 lugares**. No segundo era uma linha
"TOTAL" de 24/08, que duplicava a sala inteira e inflacionava também o ocupado e os lugares por
vender.

## A pista que provou o diagnóstico

Os "Lugares por vender" **já estavam certos** (992 = 6.368 − 5.376). Só podiam estar se a
subtração usasse a leitura do dia — ou seja, o ecrã tinha as duas fontes lado a lado e escolhia a
errada para a carga. É o tipo de incoerência interna que vale mais do que uma suspeita.

## A regra que ficou

Carga, ocupado, bloqueado, lugares por vender e ocupação vêm **todos da mesma observação: a mais
recente do evento**. Uma zona que não aparece nessa observação deixou de existir e não conta para
nada. Implementada numa função única, partilhada pelos cartões, pela tabela por zona e pela
ocupação por cidade, com dois testes novos.

## Porque é que a correcção anterior não chegou

Foi feita **só na função da base de dados**. Os ecrãs que fazem as contas no próprio componente
ficaram de fora e continuaram com a regra antiga. É o padrão que já custou outra sessão: **a mesma
pergunta respondida por duas implementações diferentes.**

## Não foi preciso mexer em dados

As linhas antigas continuam como histórico legítimo. O erro era lê-las como se fossem actuais, não
existirem. Sem DDL, sem DML.

## Consequência operacional imediata

Um dos eventos estava a **84,4% a três dias do concerto, com 992 lugares por vender** — não a
63,4% com 3.106 por vender. O outro a 46,5%, não a 34,9%. A diferença muda a decisão comercial.
