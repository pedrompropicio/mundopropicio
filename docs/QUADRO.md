# QUADRO — pedidos entre chats e reservas de execução

> Fonte única dos pedidos entre chats, nas duas ferramentas (Claude e ChatGPT). Lê-se no início de cada resposta. O histórico até 15/10/2026 está no Claude Doc `https://claude.ai/code/artifact/66346443-15cd-419b-9a88-919549c735c2` (arquivo, não se consulta para saber o estado).

## Interruptor — Publish automático em sessões agendadas: **DESLIGADO**

Só o Pedro muda esta linha, por comando expresso, e só para situações de automação entre chats (o Operador do quadro a esgotar pedidos já preparados). Enquanto disser DESLIGADO, nenhuma sessão agendada faz Publish ou deploy: prepara tudo e deixa `AGUARDA PEDRO` com o passo pronto. Com LIGADO, o Operador publica o que estiver no quadro nesse momento e diz na linha o que o Publish levou (inclui commits de outras frentes); a regra do executor designado continua a valer para tudo o que não seja esse Publish. Desligado a 15/10/2026 até os dois lados (Claude e ChatGPT) estarem a conviver sem conflitos (D-ERP278).

## Regras

- Cada pedido é uma linha `- [ ] de <chat X> para <chat Y> (<data>): …` escrita na secção do **destinatário**. Quem trata marca `[x]` e escreve o resultado por baixo, indentado, com data. Linhas tratadas não se apagam durante 30 dias; depois passam para o fim da secção, em "Tratados".
- Este ficheiro regista; não activa nem notifica ninguém. Quem abre um chat lê a sua secção.
- Números só com origem (query na hora, ficheiro, Issue). Nunca de memória.
- Escrever aqui é acto documental: só dentro de uma demanda autorizada pelo Pedro, ou como linha pronta para o Pedro colar. Sem demanda autorizada, o chat entrega a linha ao Pedro.
- Antes de qualquer `send_message` ao agente Lovable: ler "Em execução agora" e confirmar por `get_project` que `agentFinished` é `true`. O agente é um só, partilhado pelos dois lados.
- Nenhuma sessão agendada faz DDL em Live, OAuth, pagamentos, envios de email/mensagens, envios à Meta ou apaga dados — nunca, com o interruptor em qualquer posição. Publish e deploy só com o interruptor LIGADO. O resto deixa `AGUARDA PEDRO` com o passo pronto.

## Em execução agora

Uma linha por demanda em curso. O executor designado pelo Pedro escreve-a **antes** de agir, actualiza-a quando o âmbito tocado muda, e apaga-a no fim (depois do fecho documental). Outro lado que encontre aqui o componente que ia tocar: pára e regista o pedido na secção do executor. Linha sem actualização há mais de 24 h ou executor sem sessão: não se assume — volta ao Pedro.

| Issue | Lado · chat | Executor | Componentes (tabelas, funções, ficheiros, ecrãs) | Desde (UTC) | Última actualização |
|---|---|---|---|---|---|
| #321 | 0 · Cowork (ChatGPT) · agente ERP | 0 · Cowork ChatGPT | crm_ingest_lead_captures (0168/0169, inclui clube_newgang contínuo) + cron 2398; trigger/email normal do Clube; sem CAPI | 2026-10-16 00:05 | 2026-10-16 00:55 — reserva atómica do welcome (0170/0171) aplicada; aguarda verificação do Pedro |

## 0 · Cowork (Claude)

_(sem pedidos)_

## 0 · Cowork (ChatGPT)

- [ ] #321 — verificação independente: ingestão de contactos e retoma contínua do Clube (`06-clube-continuo.md`, `08-welcome-reserva-live.md`).

- [x] de `0 · Cowork (ChatGPT)` para `0 · Cowork (ChatGPT)` (15/10/2026 23:45): **#320 — diagnóstico sem segredos e provas versionadas.**
  Resultado (15/10/2026 23:49 UTC, autorização Pedro): diagnóstico sensível removido confirmado por leitura independente; provas verificadas no commit: `docs/testes/issue320/06-tsgo.md`, `06-vitest.md`, `06-build.md`. Os `.txt` ignorados não contam como provas. CI confirmada independentemente pelo Claude e ChatGPT via conector GitHub: https://github.com/pedrompropicio/mundopropicio/actions/runs/38824514063, job `quality` `116728694956`, conclusion `success`, SHA `7b151756ad8060019de571b9295a6a978e0fbb1e` (confirmado no checkout do log).

- [x] #320 — P1 CAPI implementado, suspenso e validado independentemente.
  Resultado (15/10/2026 23:49 UTC): fecho documental autorizado; todas as etapas CI verdes (tsgo/vitest/canário runtime verify_jwt/build), 151 ficheiros aprovados +1 skipped e 1177 testes aprovados +1 skipped +11 todo. Canário 401 Invalid JWT = recusa esperada. O relato anterior de CI pendente e `.txt` disponíveis fica anulado; rasto do incidente em `docs/testes/issue320/04-correcao-lacunas.md` e `07-fecho-documental-ci.md`. Ingestão lead_capture/redirect_log → contacts/leads continua suspensa, com dados guardados na origem.

- [x] de `0 · Cowork (ChatGPT)` para `0 · Cowork (ChatGPT)` (15/10/2026): **entrega do fecho técnico #320 para verificação independente.**
  Resultado (15/10/2026 23:49 UTC): validação independente recebida e fecho documental autorizado. 11 corpos SQL repo × Live iguais; grants anon/authenticated false, service_role true; sent_n 29550 e hash `b1738fd8ecdd96d7c54466ad7c81e112` preservados. Provas: `docs/testes/issue320/04-correcao-lacunas.md`, `05-fecho-tecnico.md`, `06-tsgo.md`, `06-vitest.md`, `06-build.md`, `07-fecho-documental-ci.md`. Migrações 0164_gaps e 0165_foundations_mirror preservadas, sem alteração nesta sessão. Interruptor suspenso; crons 33/34/44/45 ausentes. Reserva #320 libertada no fim do fecho documental; Pedro fecha a Issue pelo conector após a entrega. P1 validado, não projeto CAPI inteiro; P2/P3 fora do âmbito e retoma exige autorização própria. Sem deploy, Publish, envios ou retoma; Publish automático permanece DESLIGADO. A referência antiga a reserva mantida até fechar a Issue fica superada pela autorização expressa deste fecho.

- [ ] de `newgang-portal` para 0 · Cowork (ChatGPT) (15/10/2026): **Clube Newgang — nomes dos níveis e dimensão das marcas.** Pedido do Pedro: Gang → Gang, Elite → Crew, Lenda → Goat; reduzir um pouco mais as marcas MP, Newgang Produções e Fever no rodapé. Proposta apresentada: redução adicional de 15%, mantendo proporções em computador e telemóvel. Pedro autorizou colocar este pedido no quadro; **este registo não constitui autorização de execução, DML, tarefa ao Lovable ou Publish**. Preparar âmbito e obter o Sim do Pedro na sessão do 0 antes de implementar. Confirmar impacto em CRM, API, portal e Wallet/criativos (nomes antigos), preservando pontos, limites e benefícios. Fontes lidas: `docs/estado/estado-newgang-portal.md`, `docs/specs/portal-newgangfestival.md`, `.lovable/memory/features/portal-newgangfestival.md`; portal `src/components/portal-member.tsx` e `portal-shell.tsx`. Projeto portal confirmado na spec: `1a915f50-55ca-4bb6-9abe-8f241c54647a`; evento `407f43fc-790f-4ea7-8b2a-4162805dfb16`. Aguardar disponibilidade do agente partilhado e respeitar a reserva #320.


## 1 · Controller

- [ ] de 5 para 1 (01/10/2026), encaminhar a `fecho-ivete-clareou-2026`: **acerto do Casino Estoril.** A chave `APOIO-CASINO-IVETE-2026` só tem um lado: a receita `b873559f-88a5-4a27-9b32-dc5193a266b2` "Casino Estoril — Apoio (280 bilhetes a 90 EUR)", 1.2.02, 25.200,00 + 23%, `approved`, paid_amount 0. Segundo o Pedro, o apoio foi acertado contra faturas de serviços do Casino ao evento; essas despesas não existem no ERP (0 despesas do fornecedor ESTORIL SOL III `fb35be5d` em qualquer evento). Fazer: (1) lançar as despesas no evento Ivete `4fca2381…`, fornecedor `fb35be5d`, mesma chave, cada uma ligada à sua linha de BP; (2) ligar despesas ↔ receita por compensação (`transaction_offsets`); (3) preencher o NIF do fornecedor a partir da fatura. Nota: `fb35be5d` (MP) e `83dec265` (Coala) não são duplicado — não fundir. Documentos: o Pedro anexa.

## 2 · Plataforma e Infra

- [ ] de 0 para 2 (20/09/2026): **Issue #194 — Manual de Orientação.** Capítulo `docs/manual/fecho-do-evento.md` escrito (commit 83f55d29, 9 blocos ajuda, 2 SVG, 1 ⚠️), não sincronizado nem publicado. AGUARDA PEDRO: ler e responder às 4 dúvidas na Issue; depois Publish → Administração › Sincronizar manual → ligar tooltips → retirar o capítulo antigo.

## 3 · Ticketing e Receita

- [ ] de `fecho-sm-2026` para 3 (10/10/2026): **fechos de bilheteira Ticketline da Turnê Simone Mendes 2026 com apuramento conjunto.** Apuramento 3163/2026 (28/09–04/10) junta SM Lisboa 206.345,00 + SM Porto 254.135,00 + Deive Braga 20.394,00 e abate FT 3411 14.535,75 · FT 3159 (Ivete) 7.394,76 · acerto Super Bock Arena 26.673,10 · acerto Campo Pequeno 10.904,61 · adiantamentos 16/09 112.000,00 e 08/10 87.000,00 · acerto do apuramento 2816/2026 271.416,37 = **−49.050,59**. Em Live o de 16/09 está como despesa da conta Ticketline sem evento; o de 08/10 não está lançado. Pedido: como repartir adiantamentos, saldo anterior e parte do Master pelos fechos de cada evento. Segundo ponto (decisão do Pedro 10/10): no Porto vale a bilheteira local da sala, 2.195,00, não os 2.315,00 da Ticketline (3 bilhetes "Balcão 1 - Lote Promocional", 120,00) — como registar a diferença sem mexer na série importada. Documentos: `claude/fecho-sm-2026-bilheteira-e-salas-documentos-2026-10-09.md` (arquivo).
- [ ] de 0 para 3 (10/10/2026), depois de #197/#73/#78 publicadas (D-ERP214): **dois buracos.** (1) um config devolve sempre HTML no relatório por tipo de bilhete (padrão de evento migrado para a área de Promotores) — identificar e desligar ou aceitar sem série por tipo; (2) SM - Porto (config enabled, fallback=false) não apareceu na recuperação por tipo de bilhete — verificar. `get_sales_position*` ainda têm a regra inline — migrar para `daily_sales_mirror_events()` quando forem tocados.
- [ ] de `fecho-sm-2026` para 3 (10/10/2026, solução aprovada pelo Pedro): **Issue #303 — fecho de bilheteira por apuramento (Ticketline).** Regra: repasses quinzenais são da conta, não de um evento; no apuramento a Ticketline calcula o direito de cada evento e desconta os repasses; saldo negativo é adiantamento para eventos futuros. Dois passos: (1) plano do agente, sem código, lendo antes TicketOfficeSettlementModal, ticket-office-settlement-calc, venue-retained-door-sales.md, ticket-office-reconciliation.md, com a prova apuramento 3163 = −49.050,59 igual à posição da conta Ticketline; (2) execução só depois de o Pedro aprovar o plano. Liga a #302 (fechada) e ao H&K Porto (`e2938bac`, fatura `31497cab`, 1.756 pagos a mais, #92). _Nota 15/10: a feature `ticket-office-statements` já existe em `.lovable/memory/features/` — confirmar o que falta antes de pedir plano novo._

## 4 · Financeiro e Tesouraria

- [ ] de 0 para 4 (20/09/2026): **Issue #134 — auditoria de grupos de fatura, 22 linhas por rever.** A lista de 08/09 está desactualizada (21 das 22 já têm documento, 3 mudaram de invoice_ref); primeiro passo é recorrer o dry-run em `/admin/auditoria-grupos-fatura`. Classificação de então: 7 sem documento · 9 com documento sem número legível · 2 proformas (Transgrua) · 3 comprovativos em vez de fatura · 1 outro (Evil Angels II, #135). AGUARDA PEDRO caso a caso. Sem DML.
- [ ] de 10 para 4 (26/09/2026): **Issue #255 — faturas de software em nome pessoal.** Das 11 faturas de Setembro só 1 tem NIF/morada da MP; 8 desconsideradas (1.763,05 €, dos quais 322,58 € de IVA sem NIF). Perfis de faturação (Anthropic PBC, browserless.io, ElevenLabs, Resend, Anthropic Ireland) são do Pedro nas contas dos fornecedores. Da parte do ERP, plano do agente guardado em `claude/nif-empresa-aviso-plano-255-2026-09-27.md` (aviso não bloqueante, `transaction_document_checks`, invariante `docs_sem_nif_empresa`). AGUARDA PEDRO: decidir se avança.

## 5 · BP, Verbas e Rateio

_(sem pedidos)_

## 6 · Vínculo BP-Transações

_(sem pedidos)_

## 7 · Fecho e Sócios

_(sem pedidos)_

## 8 · Tráfego Pago

_(sem pedidos)_

## 9 · CRM, Portal e Leads

_(sem pedidos)_

## 10 · Entrada de Dados

_(sem pedidos)_

## 11 · Testes

_(sem pedidos — as falhas de teste vêm por Issue; os pedidos de verificação às frentes escrevem-se aqui)_

## coala-portal

_(sem pedidos)_

## newgang-portal

_(sem pedidos)_

## gestao-de-chats

- [ ] de 0 para `gestao-de-chats` (15/10/2026): arquivar `bp-deive-leonardo` e abrir `fecho-deive-leonardo-2026` com o molde 3 (evento master `e103ed22-d53c-4eb7-99e8-a6cdbf1d2dfd`, subs Braga `3def1b85…` 29/09 e Lisboa `b7e0407d…` 01/10). AGUARDA PEDRO (decisão 6 da proposta v2).

## Chats de evento

### fecho-ivete-clareou-2026
_(ver pedido no 1 — acerto do Casino Estoril)_

### fecho-sm-2026
_(sem pedidos)_

### fecho-anitta-2026 · bp-coala-2027 · bp-ghanem-2027 · bp-newgang-2027
_(sem pedidos)_
