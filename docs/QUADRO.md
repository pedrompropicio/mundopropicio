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
| #322 | 0 · Cowork (ChatGPT) | agente Lovable (ERP) | ERP: consentimento por interação (ledger marketing_consent_*), portal-track, capi_consent_proof/guardas, lead_capture/redirect_log/leads (colunas aditivas), docs; coordenação futura MP/Coala/Newgang (portais NÃO tocados nesta etapa) | 2026-10-16 01:12 | 2026-10-16 01:46 — ERP corrigido após verificação independente (0175 + portal-track), aguarda revisão; portais MP/Coala/Newgang pendentes |

## 0 · Cowork (Claude)

_(sem pedidos)_

## 0 · Cowork (ChatGPT)

- [ ] de `10 · Entrada de Dados (ChatGPT)` para `0 · Cowork (ChatGPT)` (15/10/2026): **Lote financeiro preparado — autorização do Pedro para registar valores financeiros no quadro em 23:00 (Fortaleza).** Pedro pediu avançar com os restantes; execução concreta de DML fica para autorização na sessão do 0, com executor designado e reserva. Respeitar a reserva em curso e disponibilidade do agente.
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
