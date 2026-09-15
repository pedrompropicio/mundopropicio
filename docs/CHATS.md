# CHATS — Mapa de chats do projeto Claude

> Quem não sabe onde tratar um tema, lê este ficheiro. Não se abre chat que não caiba num dos quatro tipos abaixo.

## Regra: quatro tipos de chat, mais nada

### (a) Frentes permanentes — 9, nome exacto

`fecho-e-socios` · `bp-verbas-e-rateio` · `vinculo-bp-transacoes` · `ticketing-e-receita` · `audience-meta` · `audience-google` · `crm-portal-e-leads` · `plataforma-e-infra` · `financeiro-e-tesouraria`

Frente que fique longa demais **fecha com handoff** e abre `<frente> II`.

### (b) Chats de evento — dois por evento

| Chat | Vida | Regra |
|---|---|---|
| `bp-<evento>-<ano>` | do primeiro BP até o evento acontecer | Tours/masters: **um chat por master**, sub-eventos tratados lá dentro |
| `fecho-<evento>-<ano>` | do evento até selar o fechamento | Corre `procedimentos/PROC-fecho-evento.md`; **todos** os fechamentos do evento no mesmo chat |

### (c) `coala-portal`

Portal Coala.

### (d) `gestao-de-chats` — secretaria

Cria chats com mensagem de arranque (`procedimentos/PROC-arranque-chat.md`), mantém **este** ficheiro, prepara handoffs de arquivo e responde a "onde trato X?" — **só** por este mapa.

**Tarefas programadas não são chats.**

## Proibições

- **Não existem chats genéricos.** Nada de "Ajustes Diversos", "Gestão Sistema de Gestão" ou equivalentes.
- **Tema sem frente vai para `plataforma-e-infra`.**
- Bug, regra nova ou campo em falta descoberto num chat de evento → **Issue + frente**. O chat de evento **nunca** manda o agente mexer na plataforma.
- A mesa `bp-x-resultado` foi **extinta**: decisões passam para `bp-verbas-e-rateio` e `vinculo-bp-transacoes`.

## Tema → chat

| Tema | Chat |
|---|---|
| Rateio master/sub-eventos, day off, custos de tour entre cidades, verbas por L3, BP como retrato vivo, receita no BP | `bp-verbas-e-rateio` |
| Transação↔linha de BP, excedido, elevação de verba, histórico de linhas | `vinculo-bp-transacoes` |
| Fechamento, sócios, Portal do sócio, encontro de contas, cascata, IVA não recuperável no fecho | `fecho-e-socios` |
| Ticketline/Fever/Onebox/MyEntrada, sync, bilhetes, captação de vendas | `ticketing-e-receita` |
| Meta ads, criativos, tráfego pago, dashboard de tráfego, audiências | `audience-meta` |
| Google Ads | `audience-google` |
| Contactos, leads, promotores, portal MP | `crm-portal-e-leads` |
| Banco, conciliação, extratos, IVA no formulário, pagamentos, Santander, cartões, tesouraria | `financeiro-e-tesouraria` |
| Permissões, RLS, domínio, créditos, integrações, Claude Code, triagem de issues, email | `plataforma-e-infra` |
| BP de um evento concreto | `bp-<evento>-<ano>` |
| Fecho de um evento concreto | `fecho-<evento>-<ano>` |
| Portal Coala | `coala-portal` |
| Onde trato X / chat novo / arquivar | `gestao-de-chats` |

## Estado a 15/09/2026

**Abertos:** `fecho-e-socios` · `bp-verbas-e-rateio` · `audience-meta` · `audience-google` · `crm-portal-e-leads` · `gestao-de-chats` · `coala-portal` · `bp-coala-2027` · `bp-ghanem-2027` · `bp-deive-leonardo` · `fecho-anitta-2026` · `fecho-coala-2026` · `fecho-ivete-clareou-2026`

**Frentes ainda sem chat:** `vinculo-bp-transacoes` · `ticketing-e-receita` · `plataforma-e-infra` · `financeiro-e-tesouraria`

## Ficheiro de estado por chat

| Tipo de chat | Ficheiro de estado |
|---|---|
| Frente | `docs/estado/estado-<frente>.md` |
| Evento em fecho | `docs/fechos/estado-<evento>-<ano>.md` |
| Evento em BP | `docs/estado/estado-bp-<evento>-<ano>.md` |
