# CHATS — Mapa de chats (Claude e ChatGPT)

> Quem não sabe onde tratar um tema, lê este ficheiro. Não se abre chat que não caiba num dos tipos abaixo. Este ficheiro é a única fonte do mapa; `claude/chats-de-trabalho.md` no Projeto Claude é arquivo.

## Duas ferramentas, um mapa

A operação corre em paralelo no Claude e no ChatGPT, com a mesma numeração e os mesmos prompts. Cada ferramenta tem o seu `0 - Cowork`. Tudo o resto é igual nos dois lados: um chat `3 - Ticketing e Receita` no Claude e outro no ChatGPT são a mesma frente, lêem o mesmo `estado-ticketing-e-receita.md` e escrevem no mesmo `QUADRO.md`.

**Quem executa.** Nenhum chat executa por iniciativa própria. O Pedro designa, na Issue (campo `Executor atual`), um único executor por demanda — Claude ou ChatGPT, com ou sem agente Lovable. O outro lado revê por leitura. Conflito de reserva ou reserva aparentemente abandonada volta ao Pedro; não há transferência automática.

**O que o executor pode fazer dentro de uma demanda autorizada** (autorização documental, D-ERP278): registar a reserva em `QUADRO.md` › "Em execução agora", actualizar o progresso, libertar a reserva, e fazer o fecho documental correspondente — reescrever o `estado-<frente>.md`, abrir/fechar/comentar Issues, registar em `DECISIONS.md` decisões efectivamente tomadas. Não abrange mudanças autónomas a regras, a este mapa, a procedimentos, código, dados ou configurações.

**O irreversível** — DDL em Live, deploy, Publish, crons, DML em dados de eventos, `send_message` que altere a plataforma, envios à Meta, campanhas e orçamento — só pelo `0 - Cowork` do lado designado e só com "Sim" do Pedro nessa sessão. Enquanto o comportamento de deploy das edge functions não estiver confirmado, assume-se que uma tarefa ao agente Lovable pode afectar Live antes do Publish: a autorização antecede a tarefa.

## Os chats

| # | Chat | Tipo | Modelo | Ficheiro de estado |
|---|---|---|---|---|
| 0 | Cowork (Claude) · Cowork (ChatGPT) | execução | pesado | o da frente tocada |
| 1 | Controller | transversal | intermédio | `INDEX.md` + Issues + todos os `estado-*` |
| 2 | Plataforma e Infra | frente | intermédio | `estado/estado-plataforma-e-infra.md` |
| 3 | Ticketing e Receita | frente | intermédio | `estado/estado-ticketing-e-receita.md` |
| 4 | Financeiro e Tesouraria | frente | intermédio | `estado/estado-financeiro-e-tesouraria.md` |
| 5 | BP, Verbas e Rateio | frente | intermédio | `estado/estado-bp-verbas-e-rateio.md` |
| 6 | Vínculo BP-Transações | frente | intermédio | `estado/estado-vinculo-bp-transacoes.md` |
| 7 | Fecho e Sócios | frente | intermédio | `estado/estado-fecho-e-socios.md` |
| 8 | Tráfego Pago | frente | intermédio | `estado/estado-audience-meta.md` + `estado-audience-google.md` (a consolidar em `estado-trafego-pago.md`) |
| 9 | CRM, Portal e Leads | frente | intermédio | `estado/estado-crm-portal-e-leads.md` |
| 10 | Entrada de Dados | operação | intermédio | sem estado próprio — usa o do 4 |
| 11 | Testes | verificação | leve | `TESTES.md` |
| — | `coala-portal` | portal de evento | leve | `estado/estado-coala-portal.md` |
| — | `newgang-portal` | portal de evento | leve | `estado/estado-newgang-portal.md` |
| — | `gestao-de-chats` | secretaria | leve | este ficheiro |
| — | `bp-<evento>-<ano>` | evento (BP) | intermédio | `estado/estado-bp-<evento>-<ano>.md` |
| — | `fecho-<evento>-<ano>` | evento (fecho) | intermédio | `fechos/estado-<evento>-<ano>.md` |

"Pesado / intermédio / leve" mapeia para o selector de cada ferramenta (Claude: Opus ou Fable / Sonnet / Haiku). Decisão de 14/10/2026: o trabalho pesado é do agente Lovable; o chat lê docs, prepara prompts e verifica. Subir ao pesado só para desenho de arquitectura ou decisão com números grandes. Quando a ferramenta expõe o modelo em execução, o chat compara-o com esta tabela no arranque e avisa se estiver acima; quando não expõe, não se exige.

Mensagens de arranque: `procedimentos/PROC-arranque-chat.md` e `docs/prompts/`. O 8 funde os antigos `audience-meta` e `audience-google` e inclui o TikTok; os dois ficheiros de estado continuam separados até ao primeiro fecho autorizado do 8.

## Tipos e regras

**(a) Frentes 2–9.** Uma por tema. Tema sem frente → 2. Frente longa fecha com handoff e abre `<frente> II`.

**(b) Chats de evento.** `bp-<evento>-<ano>` do primeiro BP até o evento acontecer (tours/masters: um chat por master); `fecho-<evento>-<ano>` do evento até selar, correndo `procedimentos/PROC-fecho-evento.md`, todos os fechamentos do evento no mesmo chat. Bug ou regra nova descoberto num chat de evento → Issue + frente; o chat de evento nunca manda o agente mexer na plataforma. Os chats de evento em curso ficam no lado (Claude ou ChatGPT) onde já estão, salvo decisão do Pedro.

**(c) Portais de evento.** `coala-portal` (coalafestival.pt) e `newgang-portal` (newgangfestival.pt, D-ERP262): site, conteúdos, emails do site, consentimento e tracking **do site**. A infraestrutura de envio (filas CAPI, consentimento no ERP, atribuição) é do 9; o portal pede ao 9 pelo quadro.

**(d) `gestao-de-chats`.** Cria chats com mensagem de arranque, mantém este ficheiro (só por demanda autorizada), responde "onde trato X?" por este mapa.

**(e) `10 - Entrada de Dados`.** Alimenta o ERP, nunca o altera: Gmail, faturas, extratos, conciliação, anexos. Tudo com preview + confirmação. Bug ou regra nova → Issue + 4.

**(f) `11 - Testes`.** Corre baterias, marca resultados em `TESTES.md`, abre Issue quando falha. Não corrige, não dispara o agente, não escreve na base.

**Tarefas programadas não são chats.**

## Proibições

- Não existem chats genéricos.
- Tema sem frente vai para o 2.
- Nenhum chat executa sem ser o executor designado.
- A mesa `bp-x-resultado` está extinta.

## Tema → chat

| Tema | Chat |
|---|---|
| Estado geral, triagem de issues, revisão semanal, handover | 1 |
| Permissões, RLS, migrações, edge functions, deploy, integrações, segredos, backups, invariantes, IU e layout de qualquer ecrã, email (Resend, DNS), créditos | 2 |
| Ticketline/BOL/Onebox/MyEntrada/Fever, sync, fecho de bilheteira, apuramentos, BI de Vendas | 3 |
| Banco, conciliação, extratos, SEPA, fornecedores, faturas (incl. Ads), IVA, tesouraria | 4 |
| Rateio, verbas por L3, day off, versões do BP, receita no BP | 5 |
| Transação↔linha de BP, D1/D2, elevação de verba, matching | 6 |
| Fechamento, sócios, cascata, conta de acerto, portal do sócio | 7 |
| Campanhas Meta/Google/TikTok: planear, construir, configurar, acompanhar, optimizar, analisar; públicos, criativos, orçamento, ROAS, tráfego × vendas | 8 |
| Contactos, leads, promotores, portal MP, portal do contabilista, consentimento, Pixel/CAPI, atribuição, qualidade dos eventos, filas e funções de envio | 9 |
| Lançar transação, desdobrar fatura, importar extrato, conciliar, anexar documento (operação, não regra) | 10 |
| Correr baterias de teste | 11 |
| BP de um evento concreto | `bp-<evento>-<ano>` |
| Fecho de um evento concreto | `fecho-<evento>-<ano>` |
| Portal Coala | `coala-portal` |
| Portal newgangfestival.pt, Clube Newgang, revelações, `/crm/sites/newgang`, `/crm/clube-newgang` | `newgang-portal` |
| Onde trato X / chat novo / arquivar | `gestao-de-chats` |

## Estado dos chats (actualizar por demanda autorizada)

Abertos a 15/10/2026: 0 (Claude), 0 (ChatGPT), 1–11, `coala-portal`, `newgang-portal`, `gestao-de-chats`, `bp-coala-2027`, `bp-ghanem-2027`, `bp-newgang-2027`, `fecho-anitta-2026`, `fecho-coala-2026` (selado), `fecho-ivete-clareou-2026`, `fecho-sm-2026`. `bp-deive-leonardo` a arquivar e substituir por `fecho-deive-leonardo-2026` (evento realizado 29/09 e 01/10/2026).

## Partilha Claude ↔ ChatGPT — quadros

- `docs/QUADRO.md` — pedidos entre chats e secção "Em execução agora". Fonte única. O Claude Doc antigo (`66346443…`) é arquivo do histórico até 15/10/2026.
- `docs/TESTES.md` — casos, resultados, datas, versões e provas. Fonte única. O Claude Doc (`941b8db9…`) pode servir de interface auxiliar do 11, mas o que não estiver no ficheiro não conta.

## Verificações técnicas pendentes (não assumir)

- Quando uma edge function editada pelo agente entra em produção (na edição ou no Publish).
- Se a rotação de segredos exige alteração cosmética + Publish.
- Validade do PAT do GitHub (`INDEX.md` diz sem expiração desde 18/09/2026; instruções do Projeto dizem 09/10/2027).
