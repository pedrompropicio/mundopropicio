# CHATS — Mapa de chats (Claude e ChatGPT)

> Quem não sabe onde tratar um tema, lê este ficheiro. Não se abre chat que não caiba num dos tipos abaixo. Este ficheiro é a única fonte do mapa; `claude/chats-de-trabalho.md` no Projeto Claude é arquivo.

## Duas ferramentas, um mapa

A operação corre em paralelo no Claude e no ChatGPT, com a mesma numeração e os mesmos prompts. Cada ferramenta tem o seu `0 - Cowork`. Tudo o resto é igual nos dois lados: um chat `3 - Ticketing e Receita` no Claude e outro no ChatGPT são a mesma frente, lêem o mesmo `estado-ticketing-e-receita.md` e escrevem no mesmo `QUADRO.md`.

**Quem executa.** Nenhum chat executa por iniciativa própria. O Pedro designa, na Issue (campo `Executor atual`), um único executor por demanda — o 0, uma frente, um chat de evento ou um portal, em qualquer das ferramentas, com ou sem agente Lovable (D-ERP278 ponto 10); Publish e crons ficam sempre com o 0. O outro lado revê por leitura. Conflito de reserva ou reserva aparentemente abandonada volta ao Pedro; não há transferência automática.

**O que o executor pode fazer dentro de uma demanda autorizada** (autorização documental, D-ERP278): registar a reserva em `QUADRO.md` › "Em execução agora", actualizar o progresso, libertar a reserva, e fazer o fecho documental correspondente — reescrever o `estado-<frente>.md`, abrir/fechar/comentar Issues, registar em `DECISIONS.md` decisões efectivamente tomadas. Não abrange mudanças autónomas a regras, a este mapa, a procedimentos, código, dados ou configurações. Independentemente de demanda, qualquer chat escreve as suas próprias linhas no `QUADRO.md` (D-ERP278, ponto 9).

**O irreversível** — DDL em Live, deploy, Publish, crons, DML técnico em dados de eventos (entrada operacional de dados é exceção do chat 10, conforme D-ERP285), `send_message` que altere a plataforma, envios à Meta, campanhas e orçamento — só pelo `0 - Cowork` do lado designado e só com "Sim" do Pedro nessa sessão. Enquanto o comportamento de deploy das edge functions não estiver confirmado, assume-se que uma tarefa ao agente Lovable pode afectar Live antes do Publish: a autorização antecede a tarefa.

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
| — | `juridico` | assessoria | pesado | `estado/estado-juridico.md` |
| — | `gestao-de-chats` | secretaria | leve | este ficheiro |
| — | `bp-<evento>-<ano>` | evento (BP) | intermédio | `estado/estado-bp-<evento>-<ano>.md` |
| — | `fecho-<evento>-<ano>` | evento (fecho) | intermédio | `fechos/estado-<evento>-<ano>.md` |

"Pesado / intermédio / leve" mapeia para o selector de cada ferramenta (Claude: Opus ou Fable / Sonnet / Haiku). Decisão de 14/10/2026: o trabalho pesado é do agente Lovable; o chat lê docs, prepara prompts e verifica. Subir ao pesado só para desenho de arquitectura ou decisão com números grandes. **Excepção: o `juridico` corre em pesado** (decisão do Pedro, 26/10/2026) — o trabalho dele é raciocínio sobre texto longo (contratos, legislação de três países), não despacho ao agente, e a cláusula que custa dinheiro está quase sempre enterrada. Quando a ferramenta expõe o modelo em execução, o chat compara-o com esta tabela no arranque e avisa se estiver acima — ou, no caso do `juridico`, abaixo; quando não expõe, não se exige.

A frente 2 pode executar demandas de infra quando designada na Issue (D-ERP287).

Mensagens de arranque: `procedimentos/PROC-arranque-chat.md` e `docs/prompts/`. O 8 funde os antigos `audience-meta` e `audience-google` e inclui o TikTok; os dois ficheiros de estado continuam separados até ao primeiro fecho autorizado do 8.

## Tipos e regras

**(a) Frentes 2–9.** Uma por tema. Tema sem frente → 2. Frente longa fecha com handoff e abre `<frente> II`.

**(b) Chats de evento.** `bp-<evento>-<ano>` do primeiro BP até o evento acontecer (tours/masters: um chat por master); `fecho-<evento>-<ano>` do evento até selar, correndo `procedimentos/PROC-fecho-evento.md`, todos os fechamentos do evento no mesmo chat. Bug ou regra nova descoberto num chat de evento → Issue + frente; o chat de evento nunca manda o agente mexer na plataforma. Os chats de evento em curso ficam no lado (Claude ou ChatGPT) onde já estão, salvo decisão do Pedro.

**(c) Portais de evento.** `coala-portal` (coalafestival.pt) e `newgang-portal` (newgangfestival.pt, D-ERP262): site, conteúdos, emails do site, consentimento e tracking **do site**. A infraestrutura de envio (filas CAPI, consentimento no ERP, atribuição) é do 9; o portal pede ao 9 pelo quadro. **A regra de consentimento e de privacidade é do `juridico`**; o portal implementa-a.

**(d) `gestao-de-chats`.** Cria chats com mensagem de arranque, mantém este ficheiro (só por demanda autorizada), responde "onde trato X?" por este mapa.

**(e) `10 - Entrada de Dados`.** Executa a entrada operacional de dados pelos fluxos existentes: Gmail/Drive, fornecedores, faturas, transações, linhas de BP necessárias ao lançamento, extratos, conciliação, liquidações registadas e anexos. Após prévia dos registos/efeitos e autorização expressa do Pedro, o próprio 10 pode ser o executor designado na Issue, sem passar pelo 0 (D-ERP285). Mantém reserva, pesquisa de duplicados/NIF/IBAN, conferência e fecho documental. Autorização de lote com âmbito explícito cobre as escritas necessárias desse lote, sem reconfirmação por cada insert. O 0 fica para código/alterações técnicas. O 10 não altera regras, código, schema/DDL, configurações, crons, deploy/Publish nem envia tarefas ao Lovable, emails ou pagamentos bancários. Bugs/regras novas → Issue + frente. Registar uma liquidação não é efetuar pagamento bancário.

**(f) `11 - Testes`.** Corre baterias, marca resultados em `TESTES.md`, abre Issue quando falha. Não corrige, não dispara o agente, não escreve na base.

**(g) `juridico`.** Assessoria jurídica em Portugal, Espanha e Brasil (aberto a 26/10/2026). Contratos — ler, criticar, redigir, negociar; RGPD e proteção de dados — decide a regra (fundamento de licitude, consentimento, políticas, retenção, subcontratantes, transferências internacionais, pedidos de titulares e de autoridades), que o 9 e os portais implementam; laboral; licenciamento de espetáculos e direitos de autor; fiscal só na parte de direito (o IVA operacional fica no 4, a contabilidade na Expert Numbers). **Só R0**: não escreve código, não dispara o agente, não escreve na base, **não envia nada para fora** — prepara, e diz quando deve passar por advogado. **O repo é público**: termos contratuais, valores negociados, dados pessoais e estratégia de negociação nunca entram no repo; vivem no Projeto do Claude, no Drive com partilha restrita, ou no chat. No repo entram só regras e decisões sem dados identificáveis.

Toda a Issue nova leva `**Frente dona:**` e `**Executor atual:**` no corpo; o painel (#360) lê estas linhas; sem elas infere pelo label de módulo e marca '(inferida)'.

**Tarefas programadas não são chats.**

- **Ramos (D-ERP344, 31/10/2026).** ERP: agente Lovable em `lovable/dev`; `main` protegido (PR + CI verde). Nenhum chat escreve directo no `main`. Quem precisar de ver no `main` o que pediu ao agente espera pelo PR que o 0 · Cowork junta antes da janela de Publish.

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
| Contactos, leads, promotores, portal MP, portal do contabilista, consentimento (implementação), Pixel/CAPI, atribuição, qualidade dos eventos, filas e funções de envio | 9 |
| Lançar transação, desdobrar fatura, importar extrato, conciliar, anexar documento (operação, não regra) | 10 |
| Correr baterias de teste | 11 |
| Contratos (ler, criticar, redigir, negociar, responder a contrapartes) | `juridico` |
| RGPD: fundamento de licitude, textos de consentimento, políticas de privacidade e cookies, retenção, subcontratantes, pedidos de titulares, resposta a CNPD/AEPD/ANPD | `juridico` |
| Laboral, licenciamento de espetáculos, direitos de autor e entidades de gestão coletiva, enquadramento jurídico-fiscal | `juridico` |
| BP de um evento concreto | `bp-<evento>-<ano>` |
| Fecho de um evento concreto | `fecho-<evento>-<ano>` |
| Portal Coala | `coala-portal` |
| Portal newgangfestival.pt, Clube Newgang, revelações, `/crm/sites/newgang`, `/crm/clube-newgang` | `newgang-portal` |
| Onde trato X / chat novo / arquivar | `gestao-de-chats` |

## Estado dos chats (actualizar por demanda autorizada)

Abertos a 15/10/2026: 0 (Claude), 0 (ChatGPT), 1–11, `coala-portal`, `newgang-portal`, `gestao-de-chats`, `bp-coala-2027`, `bp-ghanem-2027`, `bp-newgang-2027`, `fecho-anitta-2026`, `fecho-coala-2026` (selado), `fecho-ivete-clareou-2026`, `fecho-sm-2026`. `bp-deive-leonardo` a arquivar e substituir por `fecho-deive-leonardo-2026` (evento realizado 29/09 e 01/10/2026).

Aberto a 26/10/2026: `juridico` (decisão do Pedro; prompt em `docs/prompts/juridico.md`).

Aberto a 28/10/2026: `bp-hk-madrid-2026` (decisão do Pedro; BP da temporada Henry & Klauss em Madrid, evento `bf9ce2d8-754e-4485-8427-e2d486c39919`; estado em `estado/estado-bp-hk-madrid-2026.md`).

## Partilha Claude ↔ ChatGPT — quadros

- `docs/QUADRO.md` — pedidos entre chats e secção "Em execução agora". Fonte única. O Claude Doc antigo (`66346443…`) é arquivo do histórico até 15/10/2026.
- `docs/TESTES.md` — casos, resultados, datas, versões e provas. Fonte única. O Claude Doc (`941b8db9…`) pode servir de interface auxiliar do 11, mas o que não estiver no ficheiro não conta.

## Verificações técnicas pendentes (não assumir)

- Quando uma edge function editada pelo agente entra em produção (na edição ou no Publish).
- Se a rotação de segredos exige alteração cosmética + Publish.
- Validade do PAT do GitHub (`INDEX.md` diz sem expiração desde 18/09/2026; instruções do Projeto dizem 09/10/2027).
