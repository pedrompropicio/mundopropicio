# Exemplo — Triagem das 68 issues abertas (09/10/2026)

> **Origem dos números.** edge function `github-issues`, `{"action":"list"}`, consultada a
> 09/10/2026 às 19h UTC por `net.http_post` com o Bearer do vault. 68 abertas, uma só página
> (`has_more` false). Relatório original: `claude/triagem-issues-2026-10-09.md`.
> Sem dados pessoais a anonimizar — a triagem trata números de Issue, não pessoas.

Classificação por título e label. **Cada issue verde é reconfirmada contra o código antes de
entrar num lote** — foi a confiança no enunciado que fez a #265 parar a meio à primeira
tentativa.

## Método dos lotes

- **Verde** — correcção local, causa clara, sem DDL destrutivo, sem regra de negócio por decidir. Corre sem autorização caso a caso, em lotes de 3 a 5, com verificação em Live e Publish por lote.
- **Amarelo** — mexe em DDL/RLS, em crons, ou em números que entram num fecho. Preparado pelo chat, um "ok" do Pedro por lote.
- **Vermelho** — não tem resposta técnica. Espera uma decisão, um documento ou um ficheiro.

## Vermelho — 15 issues, esperam o Pedro

| # | O que falta decidir |
|---|---|
| 270 (P0) | Coala 2026: 11.708,44 € de custo no BP sem transação — são custos reais? A própria issue diz "aguarda Pedro" |
| 108 | 7 linhas com IVA divergente da fatura — marcada "não corrigir sem autorização" |
| 215 | 308.550 € com três tratamentos de IVA em simultâneo, e a 2.ª metade sem documento |
| 245 | IVA como resultado da empresa em eventos com sócios brasileiros — regra fiscal |
| 257 | IVA não recuperável: regra de lançamento para faturas estrangeiras |
| 262 | Dois critérios de proração Master→cidades: rateio igual vs adoção por BP. Escolher um |
| 266 | Vista EBITDA com classificação configurável — desenho a definir |
| 111 | 462 transações aprovadas sem linha de BP: o que fazer ao legado |
| 134 | Auditoria de grupos de fatura: 22 linhas por rever uma a uma |
| 209 | Retenção de criativos (6.500 ficheiros, 855 MB): falta a política |

*(lista encurtada no exemplo; o relatório original traz as 15)*

## Verde — 13 issues, corro sem perguntar

Lote 1 — travam trabalho a sério:

- **260** Diálogo "Custo da tour ou desta cidade?" abre por trás do modal e trava o lançamento em 30 sub-eventos
- **249** Modal da linha de BP grava alterações não feitas; Vincular ao BP abre por trás
- **247** Grelha do BP cria versões rascunho vazias quando a gravação falha
- **248** Edição inline na vista Agrupada não regista Desfazer

Lote 2 — infra e build:

- **231** Chunk principal de 10,5 MB rebentou o precache do service worker; Publish falhava em silêncio
- **61** Migrar xlsx e unpdf de esm.sh para especificador `npm:`, com teste de parsing
- **244** Dívida da suite de testes: 7 falhas herdadas

Lote 3 — pequenas, de causa conhecida:

- **251** Portal: `SITE_URL` aponta para o domínio de pré-visualização
- **254** Geolocalização conta a mesma visita duas vezes
- **250** Ligação de empresa só mostra contas do primeiro BM
- **234** Bucket `card-documents` sem política para o papel accountant — é a única verde que toca em storage, corre sozinha no fim do lote

## Amarelo — 40 issues, um "ok" por lote

**Números de fecho** (mudam valores que já foram vistos): 292 overhead do Master a dobrar · 259 card Custos soma o cachê duas vezes · 261 cachê variável ignora BP e Master · 150 mães de rateio divergentes das filhas · 223 o mesmo evento dá valores diferentes em três sítios · 218 DRE lê transações e a fonte é o BP

**Dados e séries**: 197 `vw_event_daily_sales` perde o histórico de 8 eventos · 78 import não limpa a série antiga · 73 `capture_ticket_types` nunca teve cron · 235 Portal Contabilidade mostra o que o ZIP exclui · 206 barreira dos 1.000 registos

**Isolamento, segurança e backup**: 56 e 53 `company_id` a nascer NULL (597 linhas) · 202 backup não guarda storage e vive dentro do projeto que protege · 196 escrita recusada pela RLS falha em silêncio

*(famílias encurtadas no exemplo)*

## Duas notas que saíram da triagem

A **#292** já descreve exactamente a armadilha levantada para um fecho em curso: overhead do
Master contado a dobrar no Encontro de Contas. Não é suspeita nova — está aberta. O chat de
fecho tem de a ler antes de apresentar qualquer conta de sócios.

A **#268** é a tarefa B da #265, tal como ficou combinado: reencaminhar os restantes buckets e
só então fechar a porta. Já tem número próprio.
