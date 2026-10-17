# QUADRO — pedidos entre chats e reservas de execução

> Fonte única dos pedidos entre chats, nas duas ferramentas (Claude e ChatGPT). Lê-se no início de cada resposta. O histórico até 15/10/2026 está no Claude Doc `https://claude.ai/code/artifact/66346443-15cd-419b-9a88-919549c735c2` (arquivo, não se consulta para saber o estado).

## Interruptor — Publish automático em sessões agendadas: **DESLIGADO**

Só o Pedro muda esta linha, por comando expresso, e só para situações de automação entre chats (o Operador do quadro a esgotar pedidos já preparados). Enquanto disser DESLIGADO, nenhuma sessão agendada faz Publish ou deploy: prepara tudo e deixa `AGUARDA PEDRO` com o passo pronto. Com LIGADO, o Operador publica o que estiver no quadro nesse momento e diz na linha o que o Publish levou (inclui commits de outras frentes); a regra do executor designado continua a valer para tudo o que não seja esse Publish. Desligado a 15/10/2026 até os dois lados (Claude e ChatGPT) estarem a conviver sem conflitos (D-ERP278).

## Regras

- **Gravação e sincronização GitHub ↔ Lovable — decisão de Pedro, 16/10/2026 13:29 Fortaleza (incidente #329):** um único escritor por projeto em cada momento, incluindo documentação. `agentFinished=true` não prova sincronização. Antes de escrever no GitHub ou de enviar tarefa ao Lovable, obter o HEAD atual do GitHub e o último commit efetivo do Lovable; confirmar que o trabalho do agente já está integrado no HEAD (ancestralidade) e que o Lovable recebeu o HEAD antes de retomar. Se houver commits exclusivos dos dois lados, parar escritas na main e novas tarefas; preservar ambos os heads em branches de backup e reconciliar por merge comum, sem squash/rebase/reset/force push. Durante execução ou fila pendente do agente, registar progresso nas Issues ou em branch documental separada; integrar essa branch apenas com o agente parado e após revalidar os heads. Após integração, verificar os ficheiros e histórico dos dois lados; se o conector não provar receção pelo Lovable, verificar no editor antes de enviar nova tarefa. Reservar e fechar a demanda sem alternar escritores enquanto a sincronização não estiver confirmada. Nenhum botão de manter/restaurar deve ser escolhido para descartar a outra linha de trabalho sem comparação e backup. Esta regra aplica-se igualmente a Claude, ChatGPT e edição manual.

- **Autorização documental de Pedro, 16/10/2026 13:07 Fortaleza:** reserva, progresso e fecho documental de demandas autorizadas podem ser atualizados sem novo pedido de autorização por cada gravação. Para esta atualização, Pedro autorizou expressamente a substituição integral do QUADRO e do estado Newgang no repositório público `pedrompropicio/mundopropicio`, preservando o conteúdo existente das outras frentes. Ler a versão e SHA atuais, limitar o diff à demanda e não acrescentar dados pessoais, segredos ou dados financeiros alheios. Esta regra não desativa nem altera a revisão automática da plataforma; eventuais recusas continuam a ser reportadas. Alterações de negócio/dados mantêm autorização própria.

- Cada pedido é uma linha `- [ ] de <chat X> para <chat Y> (<data>): …` escrita na secção do **destinatário**. Quem trata marca `[x]` e escreve o resultado por baixo, indentado, com data. Linhas tratadas não se apagam durante 30 dias; depois passam para o fim da secção, em "Tratados".
- Este ficheiro regista; não activa nem notifica ninguém. Quem abre um chat lê a sua secção.
- Números só com origem (query na hora, ficheiro, Issue). Nunca de memória.
- **Qualquer chat escreve aqui as suas próprias linhas** (reserva, progresso, libertação, pedido a outro chat na secção do destinatário, resultado na sua secção), em qualquer ferramenta, sem passar pelo 0 nem pelo Pedro — D-ERP278 ponto 9, 17/10/2026. Mecanismo: tarefa ao agente Lovable do ERP limitada ao docs/QUADRO.md (ou conector GitHub), diff só com as linhas do próprio chat, sem código; `get_project` com `agentFinished = true` antes; agente ocupado = esperar, nunca entregar a linha ao Pedro para colar. Escrever no QUADRO não é "mexer na plataforma". A #329 (um escritor de cada vez) aplica-se.
- Antes de qualquer `send_message` ao agente Lovable: ler "Em execução agora" e confirmar por `get_project` que `agentFinished` é `true`. O agente é um só, partilhado pelos dois lados.
- Nenhuma sessão agendada faz DDL em Live, OAuth, pagamentos, envios de email/mensagens, envios à Meta ou apaga dados — nunca, com o interruptor em qualquer posição. Publish e deploy só com o interruptor LIGADO. O resto deixa `AGUARDA PEDRO` com o passo pronto.

## Em execução agora

Uma linha por demanda em curso. O executor designado pelo Pedro escreve-a **antes** de agir, actualiza-a quando o âmbito tocado muda, e apaga-a no fim (depois do fecho documental). Outro lado que encontre aqui o componente que ia tocar: pára e regista o pedido na secção do executor. Linha sem actualização há mais de 24 h ou executor sem sessão: não se assume — volta ao Pedro.

| Issue | Lado · chat | Executor | Componentes (tabelas, funções, ficheiros, ecrãs) | Desde (UTC) | Última actualização |
|---|---|---|---|---|---|
| #332 cidade | newgang-portal | agente Lovable ERP, autorizado por Pedro | Fase A inerte: referência oficial concelhos PT, normalização/perfil/captura/summary, action cities, SQL de backfill não executado; sem migração/deploy/envios | 2026-10-17 12:31 | 2026-10-17 12:51 — Fase A pronta32/32+handler2/2; CAOP308/hash/método; aguardaSimB/paísportal/Lagoa; nenhum Live; #323 intacta |
| #332 lista | newgang-portal | agente Lovable ERP, autorizado por Pedro | Fase A inerte após cidade: ramo newgang_clube:v2 por ledger meta_ads anuncios-v1 efetivo, phone=NULL, SQL/testes; lista e cron2499 intocados | 2026-10-17 12:41 | 2026-10-17 12:51 — Fase A pronta32/32SQL/1285Vitest; aguardaSimB/deploysync/cronativo; GitHub ancestral atrasado, revalidar antesLive |
| #323 | 10 · Entrada de Dados (ChatGPT) | ChatGPT, direto pelos fluxos existentes | CHATS/DECISIONS/PROC-arranque/prompts10; suppliers/DNS.PT; event_forecasts Newgang2027/domínio; transactions+transaction_payments lote DNS/TAP/TikTok; transaction_documents; standalone_invoices Lovable | 2026-10-16 02:09 | 2026-10-16 02:09 — documentação e pré-verificação; sem agente Lovable; exclui CAPI #322 |

## 0 · Cowork (Claude)

_(sem pedidos)_

## 0 · Cowork (ChatGPT)

- [x] de `10 · Entrada de Dados (ChatGPT)` para `0 · Cowork (ChatGPT)` (15/10/2026): **Encaminhamento superado pela autorização de execução no próprio chat 10 (#323, Pedro 15/10 23:04). Lote financeiro preparado — autorização do Pedro para registar valores financeiros no quadro em 23:00 (Fortaleza).** Pedro pediu avançar com os restantes; execução concreta de DML fica para autorização na sessão do 0, com executor designado e reserva. Respeitar a reserva em curso e disponibilidade do agente.
  - Lovable: **300 USD**, pago pessoalmente pelo Pedro, fatura em nome da MP. Usar Faturas Avulsas, câmbio pela data da fatura; sem transação financeira, BP ou reembolso.
  - TAP: **1.156,25 EUR**, "Emissão de Bilhetes Aéreos Diretoria", categoria **10.11.01 — Passagens Aéreas — Diretoria**, IVA0, sem evento/BP. Categoria confirmada pelo lançamento anterior de 452,50 EUR. Falta confirmar a conta de pagamento desta nova TAP.
  - Domínio Newgang: **94,10 EUR =76,50 base+17,60 IVA23%**, Newgang Festival 2027. Criar fornecedor e linha própria do BP ("Registo do domínio newgangfestival.pt — 5 anos"), categoria proposta **3.2.01 — Digital**, e transação vinculada. Pedro confirmou pagamento pelo Santander e liquidação em **12/10/2026**, data da fatura.
  - TikTok: **6 faturas,total469 EUR** (53+53+64+77+93+129). Repetir modelo existente consultado: **3.2.01 — Digital**, sem evento/BP, IVA0, conta TikTok Ads, uma transação por fatura com anexo. Confirmar datas/pagamentos e repetir pesquisa de duplicados antes de gravar.
  - **Revenue Share suspenso até esclarecimento do Pedro em16/10.** ERP:base7.583,70+IVA1.744,25=9.327,95 EUR. Fatura:base7.986,98+IVA1.837,01=9.823,99 EUR. Diferença **403,28 de base+92,76 de IVA=496,04 EUR**. Não criar nova receita nem alterar as existentes.
  - Anthropic,192,50 EUR,fica fora por falta de NIF da MP,conforme decisão existente. Não duplicar os documentos de salas/Ticketline/TAP que o chat10 encontrou já lançados e anexados.
  - Fonte dos valores: triagem Gmail últimos7dias e consultas próprias em Live no chat10 nesta sessão. Reobter documentos e referências na origem antes de executar; identificadores de emails/anexos e IDs internos omitidos deste registo. Sem gravação de lançamentos pelo chat10,sem pagamentos externos,emails,código ou Publish.

  - **Complemento autorizado expressamente por Pedro em15/10/2026 23:02(Fortaleza): registar TODAS as informações deste lote no GitHub oficial do projeto, incluindo referências dos emails/documentos e dados ERP.** A autorização é documental; não substitui o Sim para executar DML na sessão do0.
    - Lovable: fatura **D38TWLH0-0041**,13/10/2026,300USD,reverse charge,cliente MP NIF515274291. Gmail **1a133abbe1e4a3dc**,anexo **Invoice-D38TWLH0-0041.pdf**. Fluxo ingest-standalone-invoice,pagador Pedro Neto.
    - TAP: fatura **AIE APXIE026/05516776**,emitida12/10/2026,bilhetes11/10,total1.156,25EUR. Gmail **1a12f74c2b1a4e1b**,anexo **AIE APXIE026_05516776.pdf**. Fornecedor existente **473cc422-a045-4dea-a6c2-e994d89006ef**,NIF500278725. Modelo anterior **aad7f44d-4dde-42d0-9e3d-6be145824bcf**,452,50EUR,10.11.01,sem evento,paid,conta Santander,service_payment. Não copiar pagamento/conta para a nova sem confirmação.
    - Domínio: **FEPP26/08261**,12/10/2026,fornecedor **Associação DNS.PT,NIF510664024**,não localizado na pesquisa. Gmail **1a130cb630181492**,anexo **FEPP26_08261.pdf**. Cliente MP NIF515274291;registo newgangfestival.pt por5anos. Criar fornecedor após nova verificação por NIF/IBAN,não inventar IBAN/entidade/referência MB. Linha nova no Newgang Festival2027,3.2.01 Digital,76,50base+17,60IVA=94,10. Liquidada12/10 pelo Santander conforme Pedro;conta consultada **594befaa-bd40-4858-a59a-aa90b9837c75**,confirmar empresa. Vínculo **transactions.forecast_id**.
    - TikTok: fornecedor **351ec77a-2dff-4bc2-997c-02a63c30810c**,NIFGB485763736;conta **b9ef2143-9188-4da4-9e36-8fef1feded62**. Exemplos existentes **b13fb9a1-a6fe-444a-8405-db7f6b276818**,**9e74a67a-5509-423a-a591-0acdf38896ca**,**410a4b02-bdb5-46e5-8b10-d8b72563d811**:expense,3.2.01 Digital,sem evento/forecast,IVA0,payment_method transfer,paid,PDF anexado. Pedro pediu repetir esse modelo,sem migração para Faturas Ads nesta demanda. Faturas/Gmail: **BDUK20266244875**,09/10,53EUR,**1a1205c86b9ec8ab**; **BDUK20266259310**,10/10,53EUR,**1a123665d440d564**; **BDUK20266280544**,10/10,64EUR,**1a127fa8ecfd47b2**; **BDUK20266302366**,12/10,77EUR,**1a12e0fa13910355**; **BDUK20266334139**,13/10,93EUR,**1a1353f32d0b92cc**; **BDUK20266381155**,15/10,129EUR,**1a13f02803ac9ebf**. PDFs identificam campanhas Roupa de Solteira,IDs1878235862930498/1878234185487474 não localizados no espelho crm.tiktok_campaign da MP consultado; não inventar ligação a evento/música. Confirmar pagamento/datas pelos recibos.
    - Revenue Share **FT11.1/113**,Gmail **1a12f889bf710c0a**,anexo **Mundo Propício - FT 2026 113.pdf**,12/10. Existentes Lisboa **bb8641b0-9488-474e-ac9a-db929d7c3862**(base3.360,60),Porto **bcf33eae-911a-49d8-9931-202ae220d535**(base4.223,10),ambasapproved,IVA23,sem anexos. Diferença já detalhada;**NÃO ALTERAR** até Pedro esclarecer16/10.
    - Anthropic **L8LP6SDY-0008 a0011**,10/10,94,10+24,60+24,60+49,20=192,50EUR;sem NIF MP nos PDFs,excluídas conforme **#255**.
    - Já lançados/anexados,não repetir: Campo Pequeno **FT1334–1337,RE1063,adiantamento43**(Gmail **1a12fc2d0305923c**);SBA **FT275/292**(Gmail **1a122d3bbcc94d36**,reenvios **1a122cddfaeb00a0/1a1212c0ad855d2d**);Coliseu **FT002/6132,FT002/6134,RE002/3348**(Gmail **1a135916ea84a66d**);Ticketline **FT3411/3159**(Gmail **1a1206c4bcfe7ab4**);TAP **05478581**(Gmail **1a129d88c31181bd**). Anexos confirmados pelos registos ERP,não por comparação binária dos ficheiros.
    - Apuramento **3163/2026**já existente,draft,com documento;Deive Braga com fecho draft:fora deste lote,não criar receitas adicionais.
    - Ler features **invoice-groups.md**,**standalone-invoices.md**,**transaction-duplicate-warning.md**,**ads-invoices.md** e **docs/estado/estado-vinculo-bp-transacoes.md**. O trecho antigo de transactions-bp-linkage.md que nega forecast_id está ultrapassado. Revalidar duplicados imediatamente antes de gravar e conferir anexos,pagamentos,saldos e vínculos depois. Sem segredos,credenciais ou tokens neste pedido.


- [x] #321 — verificação independente: ingestão de contactos e retoma contínua do Clube (`06-clube-continuo.md`, `08-welcome-reserva-live.md`). — tratado: validado e publicado 16/10 (SHA 2130204b…).

- [x] de `0 · Cowork (ChatGPT)` para `0 · Cowork (ChatGPT)` (15/10/2026 23:45): **#320 — diagnóstico sem segredos e provas versionadas.**
  Resultado (15/10/2026 23:49 UTC, autorização Pedro): diagnóstico sensível removido confirmado por leitura independente; provas verificadas no commit: `docs/testes/issue320/06-tsgo.md`, `06-vitest.md`, `06-build.md`. Os `.txt` ignorados não contam como provas. CI confirmada independentemente pelo Claude e ChatGPT via conector GitHub: https://github.com/pedrompropicio/mundopropicio/actions/runs/38824514063, job `quality` `116728694956`, conclusion `success`, SHA `7b151756ad8060019de571b9295a6a978e0fbb1e` (confirmado no checkout do log).

- [x] #320 — P1 CAPI implementado, suspenso e validado independentemente.
  Resultado (15/10/2026 23:49 UTC): fecho documental autorizado; todas as etapas CI verdes (tsgo/vitest/canário runtime verify_jwt/build), 151 ficheiros aprovados +1 skipped e 1177 testes aprovados +1 skipped +11 todo. Canário 401 Invalid JWT = recusa esperada. O relato anterior de CI pendente e `.txt` disponíveis fica anulado; rasto do incidente em `docs/testes/issue320/04-correcao-lacunas.md` e `07-fecho-documental-ci.md`. Ingestão lead_capture/redirect_log → contacts/leads ficou suspensa na #320 (superado: lead_capture retomada pela #321).

- [x] de `0 · Cowork (ChatGPT)` para `0 · Cowork (ChatGPT)` (15/10/2026): **entrega do fecho técnico #320 para verificação independente.**
  Resultado (15/10/2026 23:49 UTC): validação independente recebida e fecho documental autorizado. 11 corpos SQL repo × Live iguais; grants anon/authenticated false, service_role true; sent_n 29550 e hash `b1738fd8ecdd96d7c54466ad7c81e112` preservados. Provas: `docs/testes/issue320/04-correcao-lacunas.md`, `05-fecho-tecnico.md`, `06-tsgo.md`, `06-vitest.md`, `06-build.md`, `07-fecho-documental-ci.md`. Migrações 0164_gaps e 0165_foundations_mirror preservadas, sem alteração nesta sessão. Interruptor suspenso; crons 33/34/44/45 ausentes. Reserva #320 libertada no fim do fecho documental; Pedro fecha a Issue pelo conector após a entrega. P1 validado, não projeto CAPI inteiro; P2/P3 fora do âmbito e retoma exige autorização própria. Sem deploy, Publish, envios ou retoma; Publish automático permanece DESLIGADO. A referência antiga a reserva mantida até fechar a Issue fica superada pela autorização expressa deste fecho.

- [x] de `newgang-portal` para 0 · Cowork (ChatGPT) (15/10/2026): **Encaminhamento superado pela decisão de Pedro de 15/10 23:39 Fortaleza: execução no próprio chat do portal; ver secção newgang-portal.** **Clube Newgang — nomes dos níveis e dimensão das marcas.** Pedido do Pedro: Gang → Gang, Elite → Crew, Lenda → Goat; reduzir um pouco mais as marcas MP, Newgang Produções e Fever no rodapé. Proposta apresentada: redução adicional de 15%, mantendo proporções em computador e telemóvel. Pedro autorizou colocar este pedido no quadro; **este registo não constitui autorização de execução, DML, tarefa ao Lovable ou Publish**. Preparar âmbito e obter o Sim do Pedro na sessão do 0 antes de implementar. Confirmar impacto em CRM, API, portal e Wallet/criativos (nomes antigos), preservando pontos, limites e benefícios. Fontes lidas: `docs/estado/estado-newgang-portal.md`, `docs/specs/portal-newgangfestival.md`, `.lovable/memory/features/portal-newgangfestival.md`; portal `src/components/portal-member.tsx` e `portal-shell.tsx`. Projeto portal confirmado na spec: `1a915f50-55ca-4bb6-9abe-8f241c54647a`; evento `407f43fc-790f-4ea7-8b2a-4162805dfb16`. Aguardar disponibilidade do agente partilhado e respeitar a reserva #320.


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

- [x] 17/10/2026 — **Coala EB27 / audiências concluído** (Claude, com Sim do Pedro): público Meta P_EB27_LISTA criado (52521842310116, 1.876 linhas); pixel do site Coala definido (dataset 1142136723579970); portal Coala commit 315106c8 publicado (Lead, CompleteRegistration, ViewContent só com consentimento); ERP commit 1f34284b (regra de recolha EB27 + sync replace; `meta_custom_audiences` 6fe063a2…, enabled=true; envio real 1.877 ok); cron `coala-eb27-audience-sync` jobid 2494, diário 04:30 UTC. Outras audiências Meta não tocadas. Pendente: (1) Pedro testar coalafestival.pt (aceitar cookies de marketing, pedir convite com email fora da lista) para confirmar os eventos no Events Manager; (2) após 18/10 04:30 UTC verificar `meta_audience_sync_log` e o tamanho do público; (3) decisão do Pedro sobre o texto de consentimento eb2027-v1, que não menciona Meta/publicidade; (4) audiências por evento, exclusão da lista nas campanhas de aquisição, lookalike 1% PT; (5) fecho documental em estado-coala-portal.md e DECISIONS.md — fica com o coala-portal, que a partir de hoje escreve aqui directamente.

_(sem pedidos)_

## newgang-portal

- [x] 17/10/2026 12:51 UTC — **#332 cidade e lista: Fase A preparada**, agente Lovable ERP autorizado por Pedro; cidade→lista em sequência. CAOP2025 308/278+19+11 com URLs/hashes/método; RPC cities/cache60s e normalização servidor/CRM; backfill exato NÃO executado. Coletor anúncios-v1 meta_ads atual, perfil>=13/email válido/não suprimido; phoneNULL e envio emailhash-only preparado;46legados email excluídos; descadastro email+ads preservado. SQL32/32cada/1285Vitest/buildOK; contagensSELECT62membros/3elegíveis/59semads. Provas docs/testes/issue332/cidade-fase-a.md e lista-fase-a.md. Nenhuma migração/deploy/sync/Meta/crons/lista/Publish. **AGUARDA PEDRO**: deploysync além de newgang-portal, efeito cronjáativo, paísportal/Lagoa nominal, HEAD/CI final. Reservas mantidas aguardandoFaseB; #323 intacta.

- [x] 17/10/2026 11:29 UTC — **#332 imediato concluído em Live**, executor agente Lovable ERP, autorização Pedro. HEADs iguais67a9c7df. Migração0184 (ingestão imediata clube_newgang via trigger→collector canónico; reservas welcome retry_safe/3 tentativas/5min; unknown nunca repete; club_pending_capture_exists 30min) + deploy só newgang-portal. E2E Live: inscrição→membro no mesmo instante, welcome enfileirado em0,67s (antes até~5min), 1 welcome/1 sessão, sem duplicado. club_points inalterado 47/4375/hash170f71afecb51e61fbc879a979298008. Limpeza do teste autorizada e verificada (0 linhas). Provas docs/testes/issue332/imediato-aplicacao.md. request_access: sent/not_member/pending, 20/IP/10min→429. Reserva #332 libertada; #323 intacta. Sem Publish/crons/envios extra/P_NG27_LISTA/Reactivar/Wallet. Pendentes: portal separado (caixa granted qualquer versão + estados pending), comentário Issue, CI final.
- [x] 17/10/2026 04:10 UTC — **#332 consentimento por pessoa: backend concluído**, executor agente Lovable ERP; HEAD inicial igual GitHub/Lovable7e950672 e ancestralidadeexit0. Migração0182, email-v3 independente, referências anúncios-v1 no ledger322; RPCs sessão/CAS/me privado; descadastro email+anúncios+supressão+token atómico. Deploy só newgang-portal/handle-email-unsubscribe; SQL40/40,handler17/17,Vitest1281; ledger31/3075/hashb138bae60762cb68157209ac97c1a199 preservado; novos históricos0/0. Provas docs/testes/issue332/consentimento-pessoa.md; contrato docs/features/newgang-consentimento-pessoa-332.md. Reserva332libertada no fecho; #323/DECISIONS intactos. Sem Publish/envios/crons/portal-track/CAPI/P_NG27_LISTA/Reactivar. Pendentes: portal separado, parental/WhatsApp, política jurídica, coletor por pessoa e autorização de entregas; comentárioIssue indisponível por falta de conexãoGitHub, CIfinal não confirmado.

- [x] 17/10/2026 03:50 UTC — **Decisão expressa de Pedro: reserva #322 libertada; consentimento de anúncios do Newgang passa à #332**, executor agente Lovable ERP. Email-v3 separado dos anúncios-v1 por pessoa; sem Publish/envios/crons, sem alterar lista P_NG27_LISTA ou Reactivar no CRM. #323 preservada, incluindo DECISIONS; decisão registada aqui enquanto esse ficheiro estiver reservado.

- [x] 17/10/2026 02:42 UTC — **#332 passo 4 Meta concluído** (Claude · newgang-portal, agente Lovable ERP, autorização Pedro): migração0181 ramo newgang_clube:v2, assinatura/Coala/genérico/ACL preservados; P_NG27_LISTA desativada, ligaçãoMP verificada, audience_id_metaNULL/replacetrue. Live02:37–02:38:46 registos evento,39 consent_emailtrue,0v2,0elegíveis; RPCautenticada200/0, syncdry_run400audience_not_linked_to_meta. PostgreSQLlocalNewgang+Coala/9filtros e Vitest1281 passaram; buildOK, CIbaselineverde/finalaguarda sincronização. Provas docs/testes/issue332/; Issuecomentada; reserva libertada. Sem Publish/deploy/cron/envioMeta/backfill; #322/#323 intactas. FaltaPublishportalv2,criar/ligarpúblico e autorização separada deativação/envio/cron; restante#332aberto.

- [x] 17/10/2026 01:50 UTC — **Sessão encerrada por Pedro; agente libertado para Claude.** ERP `933cb4d1` e portal `0b37edbf` ambos `agentFinished=true`, sem tarefa pendente deste chat. Pedro confirmou Publish e teste real: editar perfil não repete os 50 pontos. Reserva antiga #328 deste executor retirada por já concluída; #322/#323 preservadas. Última UI: data DD/MM/AAAA, países PT/BR/ES no topo, releitura automática de me/ranking; provas na #330. Pendentes próprios: WhatsApp, fluxo parental, PDF e confirmação real da atualização automática noutra primeira conclusão; não executados neste fecho.

- [x] 17/10/2026 01:20 UTC — **#330 profile-v1 ativada** (ChatGPT, autorização específica Pedro): configuração50ON; SQL59/59, handler9/9, CRM7/7; site/bundle200 availabletrue/points50, países249, tokeninválido401. Transação/site-lock: ledger27/2750/hash10ec45aea047074dfbda903436e7edf4 preservado, perfis/créditos330zero. Provas docs/testes/issue330/ativacao-profile-v1.md/json. Sem código/deploy/Publish/envios; WhatsAppadapter_pending e parental<13bloqueado. SemE2EautenticadoLive. Reserva#330libertada; #322/#323/#332 preservadas.

- [ ] de `coala-portal` para `newgang-portal` (17/10/2026): **Issue #332 — audiências Meta, TikTok e Google a partir dos cadastros do portal Newgang, no modelo do Coala EB27.** Referência pronta no Coala (17/10): público Meta P_EB27_LISTA (ID 52521842310116, 1.876 linhas) com sync diário em modo replace (cron `coala-eb27-audience-sync`, 04:30 UTC, linha `meta_custom_audiences` 6fe063a2…); pixel do site com eventos Lead, CompleteRegistration e ViewContent só com consentimento de marketing (portal Coala commit 315106c8); regra de recolha EB27 no ERP (commit 1f34284b). Executor: a designar pelo Pedro. Antes de assumir: confirmar que o pixel das campanhas Newgang alimenta o site próprio e não só a Fever; CAPI (#320) e consentimento por interacção (#322) não se tocam.

- [x] 16/10 16:07 UTC — #326 etapa SQL local concluída e revista, commits c934f748…/ae49b380…;64 asserções seriais,17 registos concorrentes/barreiras,14 hashes equivalentes a Live. Sem alteração de produção. Falhas+soluções #328, bónus por edição #327. Pedro autorizou atualização integral destes documentos e avanço das correções; reserva #326 substituída por #328. Preparar/testar correções técnicas; SQL Live e deploy apenas após prévia concreta. Novas pontuações pendentes. #322/#323 preservadas.

- [x] 16/10, sessão 12:02–12:41 Fortaleza — **#324/#325/#326: primeira etapa frontend/local implementada**, executor ChatGPT · newgang-portal via agente Lovable do portal. Commit `4df23d3238d3219a78455d40b0ddb5914217c15f`: convite Crew+ref de quem partilha, preservação do par sem storage, ajuda móvel e testes locais. Prova versionada108 testes/14 ficheiros;9 verificações independentes do helper aprovadas. Typecheck/build reportados pelo agente, CI não confirmada independentemente. Sem Publish, DML/DDL, pontuações/níveis novos ou alteração de consentimento. RPCs/pontos/concorrência/E2E incluindo SSR e decisão de pontuações #327 continuam pendentes; Issues abertas. Tentativas anteriores de gravar reserva/estado foram recusadas pela revisão automática; Pedro autorizou expressamente a substituição documental preservando o restante conteúdo às12:41. Etapa concluída, sem reserva ativa desta demanda; #322/#323 intactas. Progresso completo nas Issues #324–#326.

- [ ] 16/10 — **Retomar plano aprovado na próxima sessão: #324**, lançamento segunda19/10. Filhos #325 convite/Crew/instruções móveis, #326 bateria de testes fictícios com isolamento e egress bloqueado, #327 pontuações/conquistas/automação gradual. Hoje autorizada e concluída só documentação; antes de implementar fechar pontuações/transição, segurança dos testes e obter designação/autorização concreta. Sem reserva de agente nesta demanda. Ver estado-newgang-portal.md. Pedro confirmou verificação visual dos níveis ok; reparação individual de indicação continua pendente.

- [x] 16/10 03:25 UTC — Pedro autorizou correção textual Goat; aplicada 1 linha de club_levels.benefit (“Tudo de Elite” → “Tudo de Crew”), verificada em Live. Limites Gang/Crew/Goat 0/500/1500 intactos. Pendência textual das entradas anteriores resolvida; reserva libertada. Sem Publish.

- [x] 16/10 — nomes aplicados e verificados: Gang 0, Crew 500, Goat 1500 (SELECT+API HTTP200); artes aprovadas verificadas HTTP/SHA/visual e função Wallet deployada, flag true. IDs/limites/benefícios preservados. Prova Etapa 3 em docs/testes/newgang-niveis/01-wallet-crew-goat.md. Reserva libertada; #322/#323 preservadas. Pendentes: referência textual “Tudo de Elite” no benefício Goat, CI independente/visual produção/dispositivo Wallet, consolidação regra dos portais após #323. Nenhum Publish frontend nesta etapa.

- [ ] 16/10 03:16 UTC — restante implementação preparada, commit `6da541493d14d66c1c2a9b67adc95ae79f15c9bb`: compatibilidade Crew/Elite e Goat/Lenda em wallet-google.ts, flag de novos criativos false; SQL guardado em `supabase/manual/20261016_newgang_niveis_crew_goat.PENDENTE.sql`, não aplicado. Código verificado independentemente; agente reporta 1248 testes aprovados e tsgo limpo; CI não verificada. Artes novas CREW/GOAT preparadas por imagegen e mostradas a Pedro; aguardam aprovação e carregamento. Não houve DML, deploy/Publish nem chamadas Google. Reserva desta etapa libertada após conclusão do agente; próxima etapa: aprovar artes, carregar/verificar, ativar compatibilidade e aplicar SQL só após prévia+Sim. #322/#323 intactas.

- [ ] Resultado 16/10 UTC: rodapé -15% implementado no portal, CSS confirmado no commit `5dfc3b4a8b17fa312857800b9cc15504cc12dc5a`; sem Publish. Níveis pendentes de alinhamento canónico club_levels + wallet-google.ts/criativos (nomes novos atualmente caem no hero Gang). Nenhum DML/Google executado. Agente concluído e reserva desta tarefa libertada; #322/#323 preservadas. Regra de execução no próprio portal registada, consolidação documental pendente de #323. Issue nova recusada por revisão automática.

- [ ] de `newgang-portal` para `newgang-portal` (15/10/2026 23:39 Fortaleza): **Pedro alterou expressamente a regra e autorizou avançar neste chat.** Implementações no agente Lovable do próprio portal passam a ser conduzidas pelo respetivo chat do Portal, sem passagem pelo 0-Cowork, mantendo autorização expressa, executor único, reserva, verificação e fecho documental. Aplicar a regra em CHATS.md, procedimento/prompts aplicáveis e DECISIONS.md quando libertos da reserva documental #323. Executor designado desta demanda: ChatGPT · newgang-portal. Atualizações autorizadas: Gang permanece Gang; Elite → Crew; Lenda → Goat; redução adicional proposta de 15% das marcas MP, NG e Fever no rodapé, mantendo proporções desktop/mobile. Confirmar impacto CRM/API/Wallet sem alterar pontos/limites/benefícios; não presumir autorização para DML de eventos ou chamadas externas Google Wallet. **Bloqueio de coordenação:** #322 reserva o agente partilhado e prevê trabalho no portal Newgang; #323 reserva CHATS/DECISIONS/PROC-arranque. Não transferir nem sobrepor reservas; Pedro deve resolver a ordem. get_project do portal às 02:42 UTC de 16/10: agentFinished=true, mas não liberta reservas. Pedido anterior ao 0 superado pela decisão desta sessão. Sem Publish autorizado.


## gestao-de-chats

- [ ] de 0 para `gestao-de-chats` (15/10/2026): arquivar `bp-deive-leonardo` e abrir `fecho-deive-leonardo-2026` com o molde 3 (evento master `e103ed22-d53c-4eb7-99e8-a6cdbf1d2dfd`, subs Braga `3def1b85…` 29/09 e Lisboa `b7e0407d…` 01/10). AGUARDA PEDRO (decisão 6 da proposta v2).

## Chats de evento

### fecho-ivete-clareou-2026
_(ver pedido no 1 — acerto do Casino Estoril)_

### fecho-sm-2026
_(sem pedidos)_

### fecho-anitta-2026 · bp-coala-2027 · bp-ghanem-2027 · bp-newgang-2027
_(sem pedidos)_
