# ESTADO — Plataforma & Infra

Atualizado 2026-09-18 · Issues #186, #202, #204, #206 · a-seguir #83, #96, #61. Fechadas a 18/09: #211, #203.

## Em que pé está
A 16–17/09 fizeram-se correções de UI no ecrã de Transações (tabela do BP sem scroll horizontal; busca por nome fantasia) e fechou-se a **#86** (ver D-ERP75).

A maior entrega dos dois dias foi o **Manual de Orientação construído de ponta a ponta** — ver secção própria abaixo e D-ERP79.

A 17/09 as transitórias passaram a dizer porquê (D-ERP80) — backfill das 41, CHECKs validados, caminhos automáticos a gravar o motivo, selector só no interruptor manual, invariante `transitoria_partner_advance_sem_linha` a 0, testado ponta a ponta em Live com dados isolados.

A 18/09 fechou-se a abrangência e a observabilidade do backup diário: uma corrida por alvo, formato v4 por pasta, inventário derivado e restauro compatível com `crm` e ficheiros divididos. Ver D-ERP82 e a secção própria abaixo.

A 18/09 à tarde limparam-se os alertas mortos (#211, parte 1) e fechou-se a fase 1 da barreira dos 1.000 registos (#206) — o DRE da Mundo Propício passou de 4.122.661,93 € para 6.600.832,36 € de despesas approved|paid, que é o valor certo. A #140 fechou-se a 18/09 alargando a janela da tarefa agendada de captação de Madrid para `0 8-23 * * *` UTC — cobre as 23h de Lisboa no verão e no inverno sem manutenção.

**O restauro completo passou a ser atómico e foi ensaiado (18/09, #203 fechada, D-ERP89).** Os dados do backup carregam-se primeiro numa área de sombra (`restore_shadow`), validam-se por SQL (contagens do manifesto, todas as FKs, `company_id`) e só então trocam em produção dentro de **uma** transação, com triggers de utilizador desligados e as cinco chaves dos dois ciclos adiadas até ao fim. Antes disto o restauro completo **falhava garantidamente** — inseria `transactions` antes de `event_forecasts` — e nunca tinha sido executado. Ensaio na siriguella: fotografia antes/depois com **zero diferenças** (227 tabelas, 2.736 linhas) e retrocesso provado com uma sombra corrompida (produção intacta, 24 triggers religados). Ver secção própria abaixo.


## Barreira dos 1.000 registos — fase 1 (18/09/2026)
O PostgREST devolve no máximo 1.000 linhas por pedido; qualquer select do cliente sem `.range()` numa tabela acima disso fica truncado em silêncio. A Mundo Propício tem 1.197 transações approved|paid; o DRE, P&L, Resultados, Rentabilidade, Tesouraria, Acerto com Sócios, Pendências e Lista de Eventos liam 1.000. Diferença medida no DRE: 2.478.170,43 €.

319 leituras passaram por `fetchAllPaged` / `fetchAllPagedQuery` de `src/lib/supabase-paging.ts`. Nenhuma agregação foi alterada.

Guarda: `src/lib/postgrest-large-tables.json` (20 tabelas) + `src/lib/__tests__/postgrest-row-limit.test.ts`, que falha o build com ficheiro e linha. A primeira versão do teste deixava passar leituras porque a janela de análise ia até ao `.from(` seguinte e apanhava escapes de outra query — corrigido para analisar só o encadeamento da própria query, e provado a falhar antes de corrigir os ficheiros.

Invariante `tabelas_acima_de_1000` (warn), referência 28. O JSON tem 20; as 8 em falta (`redirect_log`, `consent_log`, `crm.google_click`, `artist_metrics_daily`, `tickets_v2_sync_log`, `crm.meta_ad_insights_daily`, `crm.meta_ad_snapshot`, `crm.meta_adset_snapshot`) entram na fase 2.

Fase 2 por fazer, na #206: somas e contagens na base (RPCs) em vez do cliente, com ADR próprio.

⚠️ Regra que fica: depois de o agente dizer que acabou, verificar por leitura do código. Nesta tarefa isso apanhou 25 leituras que a guarda deixava passar e 20 imports errados de `paging.ts` nas edge functions que teriam partido o deploy.

## Alertas mortos e vigilância do email — #211 (fechada 18/09/2026)
`notify_sync_action_needed()` apontava para o projeto de TEST antigo e falhava em silêncio desde sempre. Não se corrigiu: apagou-se, com os três triggers, porque o Coala (última corrida 28/08) e o Fever (16/08) estão parados por decisão de negócio e o que está vivo — ticketline e bol — já é coberto pelo `check_ticketing_sync_health()`. `run_operacao_sla_escalator()` com o URL corrigido. Zero referências a `ukpuhoynrqobqtzdbysp` em funções e crons.

`check_ticketing_sync_health()` passou a cobrir `coala_sync_config` e `fever_sync_config`, para novembro (abertura das vendas do Coala 2027) não chegar sem vigilância.

`email_send_log` tinha 279 falhas que ninguém viu: 255 da campanha vip-coupon (218 destinatários, 19/08–04/09, evento já passado, sem reenvio), 14 do `bilheteira-sync-digest` para o Pedro, 10 de endereço inválido. Invariantes novos: `emails_falhados_24h` (error, ref 0) e `emails_presos_pending` (warn, ref 214).

Parte 2 fechada: o cancelamento de subscrição é POR EMPRESA (decisão do Pedro). `send-transactional-email` exige `companyId` no body, procura e grava o token por `(email, company_id)`, e a supressão é por empresa; `email_unsubscribe_tokens.company_id` é NOT NULL. Provado com dois envios do digest ao Pedro em `sent`. A verificação apanhou dois chamadores que o agente deixou por actualizar e que teriam partido em silêncio: `check_ticketing_sync_health()` (o alerta de bilheteira — cada envio daria 400 assíncrono contado como sucesso) e `request-password-reset` (token sem `company_id` contra NOT NULL). Ambos corrigidos. ⚠️ Regra que fica: quando uma edge function passa a exigir um campo, varrer TODOS os chamadores — incluindo funções SQL com `net.http_post`, que não aparecem numa busca ao código TypeScript.

Fora desta frente, registado: `coala_signup_confirm` com 10 na fila morta (403 `no_matching_sender`, domínio de envio não verificado) → coala-portal, antes de novembro; `fever_sync_config` com `enabled=true` num evento de maio que não corre desde agosto → ticketing-e-receita.

## Backup e restauro (18/09/2026)

**Estado verificado em Live — seis corridas com `status='ok'`:**

- global: **40 tabelas · 33.344 linhas · 38,88 MB**
- mundo-propicio: **226 tabelas · 206.080 linhas · 171,61 MB**
- coala-portugal: **226 tabelas · 30.362 linhas · 73,59 MB**
- fortal: **226 tabelas · 4.636 linhas · 13,75 MB**
- social-artists: **226 tabelas · 22.889 linhas · 9,67 MB**
- siriguella: **226 tabelas · 2.736 linhas · 6,59 MB**

O cron Live `daily-database-backup`, jobid **207**, corre em `0 3 * * *` e dispara seis chamadas independentes — uma por empresa ativa e uma global — com a service role key guardada no vault. Uma corrida **só conta** quando existe em `public.backup_runs` uma linha com `status='ok'`; ficheiros presentes no storage não provam que a corrida terminou.

O formato v4 é uma pasta por corrida, com um ficheiro por tabela, partes para tabelas grandes e `manifest.json` com contagens. A lista nasce do inventário dos schemas `public` e `crm`: tabelas com `company_id` vão para a empresa e tabelas sem `company_id` vão para o global. As exclusões deliberadas vivem em `public.backup_excluded_tables`, com motivo, e aparecem no manifesto. O restauro lê `crm.<tabela>` pelo schema `crm`, exige todas as partes e recusa contagens diferentes do manifesto.

Tabelas de controlo:

- `backup_runs` — execução, alvo, estado, contagens, tamanho e caminho da pasta.
- `backup_excluded_tables` — exclusões explícitas e justificadas; a única linha atual é `public.ticketline_sync_runs` (#204).

Invariantes:

- `backup_empresa_em_falta` — `error`, referência **0**; empresas ativas e global sem backup `ok` nas últimas 30 horas.
- `backup_tabelas_excluidas` — `warn`, referência **1**; qualquer alteração no número de exclusões exige revisão.

### Infraestrutura e identidades (complemento, 18/09/2026)
A corrida global passou a escrever mais dois ficheiros na sua pasta, e ambos são obrigatórios: se qualquer uma das recolhas falhar, a corrida global fica com `status='error'`.

- `infra.json` — 38 crons com o comando completo, 29 buckets com configuração, 156 políticas de storage com a expressão de cada uma, 11 extensões, 603 migrações aplicadas e o inventário dos 14 segredos do vault. Dos segredos guarda-se APENAS nome, descrição e data. Nunca o valor. Os segredos das edge functions nem aparecem, porque não são legíveis por SQL — têm de ser capturados à mão do dashboard.
- `identities.json` — 42 utilizadores e 42 identidades. Sem `encrypted_password`, sem tokens de confirmação ou recuperação, sem `identity_data`. A recuperação de acesso faz-se por reposição de palavra-passe forçada, e isso é decisão fechada, não limitação.

Funções: `backup_infra_snapshot()` e `backup_identities_snapshot()`, SECURITY DEFINER, com `anon` e `authenticated` a false e `service_role` a true, verificado em Live.

Corrida global de referência a 18/09: pasta `global/2026-09-18T01-41-20`, 40 tabelas, 33.356 linhas, 39,00 MB.

**Regra que fica:** a estrutura da base NÃO se salvaguarda no backup — vive nas migrações do repositório. O backup guarda o que as migrações não conseguem repor: dados, crons, configuração de buckets, identidades e o inventário de segredos.

**Continua por fazer, sem mitigação atual:**

- Os ficheiros de storage **nunca são copiados, só listados**, e o manifesto cobre apenas **7 dos 29 buckets** (#202).
- Os backups vivem dentro do próprio projeto que protegem, têm retenção de 30 dias e podem ser apagados por admin.
- O PITR da Supabase está por confirmar no dashboard.
- O restauro por evento não cobre tabelas ligadas ao evento apenas por referência ambígua (11 ligações classificadas como referência, não pertença) — ficam no estado atual.

**Resíduos conhecidos — não redescobrir:**

- `tables_not_restored` no resultado do restauro é decorativo: a condição nunca dispara porque a ordem é construída a partir do próprio manifesto.
- O preview v4 da `database-restore` confirma que todas as partes existem, mas deliberadamente não lhes conta as linhas, para não descarregar 171,61 MB só para pré-visualizar. Os previews das outras duas funções contam e validam as linhas.

### Restauro completo atómico (18/09/2026, #203, D-ERP89)

O `mode: "restore"` da `database-restore` passou a: carregar o backup em sombras
(`restore_shadow.<schema>__<tabela>`, colunas de hoje, sem constraints/triggers/índices) →
validar por SQL (contagem de cada sombra = manifesto; todas as FKs, contra a sombra do pai
ou contra produção quando o pai está fora do backup; `company_id` diferente = **erro**) →
trocar em produção com `restore_apply_from_shadow`, que É a transação → limpar as sombras e
deixar linha em `backup_runs` (`scope` `restore` ou `restore_test`). Falha na validação ou
na troca: produção intacta e sombras deixadas de pé para inspecção.

As cinco chaves dos dois ciclos (`transactions`↔`event_forecasts` e
`transactions`↔`ticket_office_settlements`) são `DEFERRABLE INITIALLY IMMEDIATE` — são as
únicas cinco adiáveis em `public` e `crm`; o comportamento normal não muda.

**Ensaio de 18/09 na siriguella:** backup fresco (`siriguella/2026-09-18T19-51-05`, 226
tabelas, 2.736 linhas), restauro por cima dela própria, fotografia antes/depois por tabela
(contagem + `md5`): **zero diferenças** em 227 tabelas / 2.736 linhas. Retrocesso provado
com uma sombra corrompida: `23503` em `SET CONSTRAINTS ALL IMMEDIATE`, siriguella idêntica,
1.570 transações intactas, 24 triggers de `transactions` religados. `backup_runs` tem as
três linhas do ensaio (duas `restore_test` `error` das duas falhas reais do caminho, uma
`restore_test` `ok`).

**Três coisas que a tarefa apanhou e não se reinvestigam:** `postgres` não é superuser
(`session_replication_role` fora de questão — usa-se `DISABLE/ENABLE TRIGGER USER`);
`pg_safeupdate` obriga a `WHERE` em todo o `DELETE` destas funções; e o Postgres recusa
religar triggers com eventos adiados pendentes (`55006`), pelo que a verificação das FKs vem
**antes** do `ENABLE TRIGGER USER`. Detalhe em
`.lovable/memory/features/restauro-atomico.md`.

**`selective-restore` e `surgical-restore` no caminho novo (18/09/2026, #203, D-ERP89).**
Ambas passam pelas sombras, validação e troca atómica. A `surgical-restore` não tem lógica
própria: são 66 linhas que reencaminham para a `selective-restore` com `scope: 'events'` e as
raízes de bilheteira. A `selective-restore` tem dois âmbitos:

- `scope: 'tables'` — apaga por `company_id` e repõe (caminho `company` da
  `restore_apply_from_shadow`).
- `scope: 'events'` — âmbito derivado do **grafo real** (nada de listas à mão):
  `restore_event_scope` parte das linhas `events`, desce por FKs e devolve a **chave primária
  real** de cada linha, lida do catálogo (por isso entram tabelas cuja PK não é `id`, como
  `event_marketing`, `event_portal_endorsements` e `event_simulator_config`). Só se seguem
  **ligações de pertença** (coluna `<pai>_id`); ligações de simples referência ficam de fora
  (ex.: `event_simulator_config.sales_curve_prior_event_id`, que arrastava dados de outros
  eventos). Aplica-se com `p_scope='rows'`: **actualização no lugar** (`INSERT … ON CONFLICT
  (pk) DO UPDATE`) e eliminação só do que existe hoje e não vinha no backup.

**Porque não se apaga a linha do evento:** `transactions.event_id` e `events.parent_event_id`
são `ON DELETE CASCADE`. Apagar a linha `events` de um evento-mãe arrastava os sub-eventos e
tudo abaixo — foi apanhado em ensaio (`23503` em `payment_list_items_transaction_id_fkey`,
produção intacta). Daí o UPSERT.

**Ensaio de 18/09 no Deive Leonardo** (`e103ed22`, evento-mãe com 2 sub-eventos):
âmbito 17 tabelas / 60 linhas; preview hoje = backup (`mundo-propicio/2026-09-18T00-20-19`),
80 FKs validadas, 0 erros; restauro real `ok` (60 linhas repostas, 0 eliminações);
fotografia antes = depois (`events` `85be037c…`, `transactions` `1a3f5dfa…`,
`bank_statement_lines` `c8921265…`, `event_simulator_config` `80ad1f21…`); sub-eventos
intactos (2 filhos, 7 itens de lista de pagamento deles); 1.570 transações; 24 triggers de
`transactions` religados; 0 sombras deixadas. **Retrocesso:** com a sombra de `events`
renomeada e `transactions.currency='XXX'`, a aplicação parou em `23514` e a fotografia ficou
**igual** à de antes. **`scope: 'tables'`** em `sponsorship_segments` da siriguella: 7 linhas,
`md5` antes = depois (`c4e74fd6…`).

**Dois defeitos reais corrigidos no ensaio:** a carga rebentava em colunas criadas **depois**
do backup (`transaction_payments.closes_transaction`, `NOT NULL`) — agora insere só as colunas
do backup e as novas assumem o default; e a validação exigia que o pai viesse no backup, o que
é falso num âmbito de um evento (espelhos e linhas do BP do evento-mãe) — em `p_scope='rows'`
aceita-se pai na sombra **ou** em produção.

**Resíduo:** a unicidade diária de `backup_runs` já não se aplica a `scope='restore_test'`
(vários ensaios por dia ficavam presos em `running` porque o fecho colidia).



## Manual de Orientação (17/09/2026)
O que existe:

- Artigos-fonte em `docs/manual/*.md`, um por capítulo. Cada secção leva um bloco ````ajuda` (`id`, `tooltip`, `ecras`, `perfis`, `fontes`, `termos`) e diagramas SVG em `docs/manual/img/`.
- Importador para a base: botão **Administração → Sincronizar manual** (edge function `manual-sync`). Conteúdo global, sem `company_id`, por desenho.
- Tabelas `help_articles`, `help_sections`, `help_chunks`, `help_questions` e função `help_search_chunks`.
- Pesquisa híbrida: `pgvector` (`google/gemini-embedding-2`) + full-text português com `unaccent` + trigram, RRF.
- Tooltips com anchor nos cinco pontos de rateio já mapeados.
- Painel lateral (`HelpSidePanel`) que abre por cima de qualquer modal.
- Ecrã **Administração → Lacunas do manual** para perguntas não respondidas / baixa confiança, com diagnóstico `max_cosine` / `lexical_hits` visível a admin.

Como se publica conteúdo:

1. Editar ou criar `docs/manual/<capitulo>.md`.
2. Fazer Publish.
3. Clicar **Administração → Sincronizar manual**.

Regras que ficaram:

- **Uma tarefa com migração só está feita quando a migração está aplicada e verificada em Live** — ficheiro no repositório não basta. As migrações `20260917010000_help_search_hybrid.sql` e `20260917020000_help_terms.sql` foram aplicadas e verificadas em Live a 17/09.
- **A pesquisa só desiste sem LLM quando não há acerto lexical nem cosseno acima do limiar.** A pergunta "como exporto o SAF-T?" continua a falhar porque não há conteúdo sobre SAF-T no manual; perguntas com acerto lexical ("rateio dayoff", "hotel da folga") seguem para o LLM e respondem corretamente.
- **Imagens de `docs/manual/img/` são a única exceção a "nunca HTML cru"** — os diagramas são SVG inline, referenciados no markdown como `![alt](img/x.svg)`.

## A trabalhar agora
- **#206 fase 2** — somas e contagens de tabelas grandes na base (RPCs), com ADR próprio. Não subir `db-max-rows`.
- **#186** — diálogo 'Rateio ou Exclusivo?' do modal Nova Transação. Correção em portal publicada a 16/09 — falta confirmação visual do Pedro no diálogo "Custo da tour ou desta cidade?".
- **Manual — próximos capítulos** (Fecho do evento, BP…), um de cada vez, no mesmo formato de `rateios.md`.

## Incidente — o ecrã de Transações ficou vazio para toda a gente (14/09/2026)
Uma chave estrangeira nova entre `transactions` e `suppliers` deixou **duas** FKs entre o mesmo par de tabelas. O embed escrito como `suppliers(name)` passou a ser ambíguo e o PostgREST responde **HTTP 300 / PGRST201** — **recusa o pedido inteiro**, não devolve resultado parcial. O ecrã não mostrava erro nenhum: a query era desestruturada sem ler `{ error }` e a linha "Sem transações registadas." servia tanto para lista vazia como para query falhada.

Correção: o embed passou a nomear a FK explicitamente — `suppliers:suppliers!transactions_supplier_id_fkey(name)` — com o alias preservado, para o código a jusante ficar intocado.

⚠️ **Regra que fica:** acrescentar uma FK entre um par de tabelas que já tem uma parte **silenciosamente todos os embeds desse par**. Hoje existem **35 pares de tabelas com FK duplicada** (apurado em Live a 14/09). Está sob vigilância pelo invariante `pares_fk_duplicada`, com referência 35 — qualquer FK nova faz o número subir e o verificador acusa.

Resolvido a 14/09 (#174 fechada): `QueryErrorState.tsx` criado com estado de falha distinto; `Transactions.tsx` com três ramos (a carregar / falhou / vazio); 243 queries em 98 ficheiros passaram a ler `{ error }`; 6 embeds ambíguos adicionais corrigidos.

## Incidente — a fusão de fornecedores de 12/09 atravessou fronteiras de empresa, revertida a 14/09
As 86 fusões de duplicados por IBAN de 12/09 foram feitas por SQL sob `service_role`, onde `current_company_id()` devolve NULL e as políticas RESTRICTIVE não se aplicam. Resultado: fornecedores de empresas diferentes foram fundidos e **48 transações** ficaram apontadas a um fornecedor de outra empresa, num total de **78.922,17 €**.

Reversão a 14/09: **85 dos 86** fornecedores reativados (um era duplicado genuíno e ficou inativo), as 48 transações reapontadas ao fornecedor da própria empresa e **30 mapeamentos de rubrica** do Coala repostos.

Tropeção no caminho, que fica registado: a primeira tentativa de reativação rebentou contra `suppliers_company_iban_unique` porque a verificação prévia só procurou colisões contra fornecedores **já ativos**, e não entre os próprios 86. Nada foi escrito — a instrução abortou inteira.

⚠️ **Regra que fica:** uma operação de dados em massa sob `service_role` tem de reproduzir à mão as fronteiras que as travas da base garantiriam a um utilizador normal — `company_id` em cada linha tocada, e a verificação de unicidade tem de incluir o próprio lote. Está sob vigilância pelo invariante `tx_fornecedor_outra_empresa`, referência 0.

**Correção a um facto antes registado:** a RPC `check_supplier_iban_duplicate` **não** atravessa fronteiras de empresa — filtra por `current_company_id()`. O defeito real era outro: não excluía fornecedores **inativos**, e por isso acusava duplicado contra um registo desativado que já não devia contar. Corrigido.

## Ciclo de vida do fornecedor (14/09/2026)
Nada na aplicação desativa um fornecedor: `is_active` só era mexido por SQL. E o botão de apagar em `Suppliers.tsx` fazia `.delete()` direto, sem passar pelo Lixo, apesar de `src/lib/trash.ts` já declarar `supplier: "Fornecedor"`. Passou a apagar para o Lixo, recuperável. **Desativado** passa a significar uma coisa só: registo fundido ou substituído, mantido para o histórico e com nota auditável.

## Tratamento de erros e detetor de embeds ambíguos (14/09/2026)
**#174 — Ecrãs engoliam erros de query PostgREST.** `src/components/QueryErrorState.tsx` criado com estado de falha visual distinto (código+mensagem+hint do PostgREST, botão "Tentar de novo", `console.error`). `src/pages/Transactions.tsx` e mais 97 ficheiros passaram a ler `{ error }` — 243 pontos de leitura. Estado vazio e estado de erro são agora inequívocos em toda a app.

**#169 — Detetor de embeds PostgREST ambíguos.** `src/lib/postgrest-ambiguous-pairs.json` com os 35 pares de FK duplicada apurados em Live a 14/09. `src/lib/__tests__/postgrest-embeds.test.ts` faz scan de `src/**/*.ts(x)` e `supabase/functions/**/*.ts` — falha com guidance (ficheiro, linha, como qualificar) se encontrar embed sem `!<fk_name>`. Passou: 2/2, 91ms. 6 embeds adicionais corrigidos com FK nomeada.

⚠️ **Regra que fica:** qualquer embed entre pares do JSON tem de usar o formato `alias:tabela!fk(col)`. O teste é a guarda permanente.

## Verificador de invariantes (consolidado a 14/09/2026; atualizado a 18/09/2026)
Já existia um `check_system_invariants()` com ecrã próprio — não se reinventou, consolidou-se.

Estrutura: tabela `system_invariants` (`name`, `description`, `severity`, `reference_count`, `notes`, `reference_updated_by`, `reference_updated_at`), tabela `invariant_runs` com o histórico, função `run_invariant_checks()` que corre e devolve, `run_invariant_checks_and_log()` que corre e grava a corrida, e `accept_invariant_reference(name, value, note)` que aceita a contagem de hoje como referência.

**Princípio central: o alerta é por desvio face à referência, nunca por número diferente de zero.** Dívida herdada com contagem conhecida não faz barulho todos os dias; o que faz barulho é a contagem **mexer**.

**27 verificações a 18/09/2026.** Não conformes hoje: `rateio_filhas_nao_somam_a_mae` **1/0** (Meta 252466632, #183), `emails_falhados_24h` **1/0** (a falha das 08:00 de 18/09, corrigida — desce a 0 quando as 24 h passarem), `pares_fk_duplicada` **37/35** e `tx_paga_sem_linha_de_pagamento` **1.213/1.026** (deriva alheia a esta frente). Referências em Live:

- severidade `error`, referência **0**: `BP_DESPESA_EM_L2`, `backup_empresa_em_falta`, `carga_sem_credito`, `coala_map_outra_empresa`, `emails_falhados_24h`, `fecho_confirmado_liquido_retido`, `filha_rateio_com_conta`, `FORECAST_ID_ORFAO`, `fornecedor_iban_duplicado_ativo`, `grupo_fatura_veredicto_desagrupar_por_aplicar`, `tipo_invalido`, `transitoria_partner_advance_sem_linha`, `tx_conta_outra_empresa`, `tx_evento_outra_empresa`, `tx_fornecedor_outra_empresa`, `tx_rubrica_outra_empresa`, `VINCULO_CROSS_EVENTO`
- severidade `error`, referência **0**: `VINCULO_DESSINCRONIZADO` — 7 vínculos reparados em Live a 14/09 (forecast_id reposto nas 7 transações do Coala Festival Portugal 2026 onde o âncora existia mas o link inverso era NULL). Issue #173 fechada.
- severidade `warn`: `backup_tabelas_excluidas` **1** (referência 1), `emails_presos_pending` **214** (referência 214), `tabelas_acima_de_1000` **28** (referência 28); dívida herdada: `paid_amount_acima_do_bruto` 9, `TRIGGER_DOCUMENTADO_SEM_LIGACAO` 4, `TX_EVENTO_SEM_RUBRICA` 13.
- **Deriva a investigar, não causada pelo trabalho do backup:** `pares_fk_duplicada` está em **37** contra referência **35**; `tx_paga_sem_linha_de_pagamento` está em **1.213** contra referência **1.026**.

Cron em Live: `invariant-checks-daily`, jobid **131**, `10 7 * * *`. ⚠️ O Publish **não** propaga crons — este objeto vive só em Live e não está no repositório.

Duas verificações candidatas foram **eliminadas antes de entrar**, por serem falsos positivos provados: "filha de rateio com conta" sem excluir parcelas (as 4 linhas encontradas eram parcelas, que têm conta legitimamente) e "grupo de fatura com documentos diferentes" comparando `file_url` (difere por desenho — 24 de 24).

## Extrato da Conta — consolidação de movimentos do banco (fechado a 12/09/2026)
O extrato passou a mostrar o que o **banco** agrupou: um movimento único que cobre N transações aparece como **UMA linha expansível**, em vez de N linhas consecutivas. Interruptor **"Consolidar movimentos do banco"**, guardado como preferência por utilizador.

**Ficheiros:**
- `src/lib/statement-grouping.ts` — função pura `groupStatementLines` (não faz I/O, não toca a base).
- `src/hooks/useBankMovementGroups.ts` — ponte isolada para o mundo da conciliação; só lê.
- `src/components/ReportBankStatement.tsx` — único consumidor.
- `src/lib/__tests__/statement-grouping.test.ts` — testes.

**Chave de agrupamento, por precedência:**
1. Linha do banco com `matched_sepa_export_id` → transações do lote, com **fusão dos exports irmãos** (mesma `payment_list_id`, mesmo total ±0,01 — a dupla geração é o MESMO acontecimento).
2. Linha do banco com ponte `bank_line_transactions` → as N transações.
3. Só como **recurso**, para transações sem linha do banco: `payment_list_sepa_exports`, com a mesma fusão de irmãos.

A fonte do banco ganha sempre. **Uma transação pertence no máximo a um grupo.** Um movimento que cobre **uma** transação só **não forma grupo** — fica linha solta. `matched_transaction_id`/`created_transaction_id` são 1:1 e por isso nunca formam grupo.

**Anexos:** os documentos do movimento do banco (`bank_line_documents`) chegam-se pelo **clip no cabeçalho do grupo**. Grupos de fonte `sepa` não têm linha do banco e por isso **não têm clip**.

**Degradação:** se qualquer leitura da conciliação falhar, o hook devolve índices vazios e o extrato volta a **linha a linha** — nunca fica em branco nem inventa grupos.

**Verificado na Live a 12/09/2026, Banco Santander Totta:**
```
439.196,92
+ 135.986,96  TicketLine (2 transações)   = 575.183,88
−     882,32  Passagem aérea               = 574.301,56
−  25.736,37  LOTE SEPA 11/09 (19 transações) = 548.565,19
+     895,70                                = 549.460,89
+     207,00  Ajustes de caixa             = 549.667,89
```
549.667,89 € = Saldo Final da tabela = extrato do Santander.

O saldo mostrado com a consolidação ligada é recalculado sobre a ordem que se vê — ver **D-ERP55**.

## Performance RLS (Fix C concluído a 14/09; A e B deferidos)
**Fix C** — `auth.uid()` → `(SELECT auth.uid())` em 567 políticas do schema `public`. Migration `20260914223900_rls_wrap_auth_uid_in_select.sql`, Publish feito, verificado em Live (`rls_estaveis = 567`). Elimina 177M+ seq_scans por sessão em `user_roles`.

**Fix A** — deferido: `v_artist_growth_summary` como matview sem RLS criaria fuga multi-tenant (authenticated veria dados de todas as empresas); a view não é usada no código da app (custo vem de queries externas).

**Fix B** — deferido: os embeds em `Transactions.tsx` já são explícitos (`!transactions_supplier_id_fkey`); o custo real é o `fetchAllPaged` sem filtro de evento/estado — reabrir quando houver janela.

## Prazos e renovações
- **PAT do GitHub expira 24/set/2026** (#15) — 6 dias.
- Token Meta da conta da Ivete expira 08/10/2026. Fortal e Siriguella expirados desde 22/08 (#36).

## Factos que não se reinvestigam
**Empresas: quatro.** Mundo Propício (PT), Coala Festival Portugal (PT), Fortal (BR), Siriguella (BR). A Social Music seria a **5.ª**, e os eventos `SM - Lisboa` e `SM - Porto` estão hoje sob o `company_id` da MP — se ela passar a empresa própria, esses eventos migram, e isso é trabalho de dados.

**Isolamento: 106 de 144 com RESTRICTIVE, 38 sem.** As 15 nomeadas na #83 como fuga real estão **todas corrigidas**. Sobram quatro tabelas de sistema: `notification_templates`, `system_reminders`, `system_reminder_settings`, `operacao_chamado_sla`. As outras 34 têm RLS ligada e nenhuma tem leitura aberta — é dívida, não é porta aberta.

⚠️ **Regra de leitura de RLS:** acesso = `(OR das PERMISSIVE) AND (AND das RESTRICTIVE)`. Procurar isolamento **por função** (`row_belongs_to_current_company`), não só por comparação directa.

**RLS ligada com zero políticas = negar tudo:** `app_secrets`, `vip_coupon_email_log`.

**Auditoria server-side de transações esteve partida de 28/abr a 01/set.** Sob `service_role`, `current_company_id()` devolve NULL, o default de `company_id` não resolve e o insert em `transaction_audit_log` era rejeitado — com o erro engolido. Custou **894 transações editadas** e **1.209 aprovadas** sem rasto do lado do servidor, e o campo `Propagação grupo-fatura` nunca teve uma única linha. Não deu nas vistas porque o frontend escreve as suas próprias linhas com o JWT do utilizador, logo a tabela nunca ficou vazia. **A regra que ficou:** insert sob `service_role` passa `company_id` explícito, tirado da linha auditada — nunca do perfil do utilizador nem de `current_company_id()`. Detalhe completo em `claude/auditoria-company-id-service-role-2026-09-01.md`.

**Restore de `ticket_sales` estava impossível.** As whitelists de colunas em `selective-restore` e `surgical-restore` tinham 13 das 15 colunas da tabela: faltavam `company_id` (NOT NULL, rebentava o upsert) e `total_value` (coluna normal, não gerada — perdia-se o valor). Corrigido a 01/09. **Fica de pé (#96):** backups *legacy* (v2, pré-multi-tenant) não têm `company_id` nas linhas, e como o `cleanRow` só copia o que existe, o restore a partir desses continua a rebentar. Só platform_admin lhes chega. **Ver também #204:** `public.ticketline_sync_runs` está deliberadamente excluída do backup porque guarda payloads crus de diagnóstico da Ticketline; a exclusão é explícita em `backup_excluded_tables` e em cada manifesto.

**Transitórias isentas do gate D1+D8 (15/09/2026).** A edge function `approve-transaction` bloqueava transações `is_transitory = true` (repasses ZigPay, intermediação financeira) porque o select não incluía o campo e o filtro de candidatos não testava `!t.is_transitory`. A `structurallyNeedsBpLine` da UI já tinha a isenção — a edge function ficou dessincronizada. Corrigido a 15/09: `is_transitory` adicionado ao select (L85) e ao filtro D1+D8 (L170). Publicado. Memória `bp-linha-obrigatoria.md` atualizada (isenção 4 + subsecção da edge function).

**A Gestão de IVA não filtra nada.** O `IvaManagement.tsx` traz todas as transações — sem filtro de `is_transitory`, `exclude_from_result` ou estado. Uma transação fora do resultado entra no apuramento de IVA na mesma. E `transactions.iva_rate` tem **default 23**: taxa omitida nasce a 23%.

**A edge function `github-issues` não é alcançável por HTTPS direto do container das tarefas agendadas** (403). O caminho que funciona é `net.http_post` a partir de `query_database`, com a service role key do vault (secret `email_queue_service_role_key`). Parâmetro é `number`, não `issue_number`. Acções: `list`, `create`, `comment`, `close`, `update` — atenção que `update` com `labels` **substitui** o conjunto todo, não acrescenta.

**Um trigger de `company_id` por tabela, com o nome `trg_set_company_id`.** Três tabelas mantêm nomes legados (`event_courtesies`, `event_ticket_types`, `event_ticket_type_zones`) — cada uma com um só trigger. Não criar um segundo com outro nome.

**Medido em Live a 16/09/2026: 90 triggers com `set_company_id_on_insert`**, não 88. A `system_audit_log` deixou de ter o seu por D-ERP75.

**Três perguntas registadas às 01:26 UTC de 17/09 com `max_cosine` 0 foram uma corrida de teste falhada**, não lacunas reais — o utilizador de teste não tinha papel admin e, por isso, não via nenhum pedaço do manual.

**Base de fornecedores reconstruída a 11-12/09.** Estado final na altura: 455 ativos, 86 desativados por duplicação, ZERO grupos duplicados por IBAN, 1.443 transações (inalterado). Antes: 541 fornecedores, 330 com IBAN mas só 244 IBANs distintos, 48 IBANs gravados com separadores. ⚠️ **A fusão foi revertida a 14/09 por ter atravessado fronteiras de empresa** — o estado final correto é o descrito na secção "Incidente — a fusão de fornecedores de 12/09 atravessou fronteiras de empresa": 85 dos 86 reativados, 48 transações reapontadas, 30 mapeamentos de rubrica repostos.

Origem: importação de **29/04/2026 às 23:49:50** — 93 fornecedores criados no mesmo segundo, com IBAN (86) mas quase sem NIF (14). Sem NIF não havia como reconhecer o fornecedor existente, e a única proteção era `suppliers_company_name_unique (company_id, lower(trim(name))) WHERE is_active`, que falha ao primeiro espaço a mais: `RICARDO COVOES S A ` não colide com `RICARDO COVOES S A`. Dos 86 desativados, 81 nasceram nesse dia. O lote de 09/08 (67 fornecedores) não produziu duplicados.

Trava nova, criada em Live a 12/09: três índices únicos parciais `suppliers_company_iban_unique`, `suppliers_company_iban2_unique`, `suppliers_company_iban3_unique`, sobre `(company_id, iban|iban_2|iban_3) WHERE is_active AND <coluna> IS NOT NULL AND <coluna> <> ''`. O `WHERE is_active` é deliberado — os desativados mantêm o IBAN para o histórico. Apanham colisões dentro da MESMA coluna; o caso cruzado (iban_2 de um = iban de outro) fica coberto pela RPC `check_supplier_iban_duplicate` no formulário.

⚠️ A PRÓXIMA IMPORTAÇÃO EM MASSA DE FORNECEDORES VAI REBENTAR contra estes índices em vez de criar gémeos. É intencional. A solução é reconciliar pelo IBAN normalizado antes de inserir, nunca desativar o índice.

Cada fornecedor desativado tem nota auditável: `[2026-09-12] Duplicado por IBAN — fundido em <id>. …`

**Nome fantasia vive em `suppliers.trade_name`; a busca tem de o incluir (16/09).** Desde a reconstrução da base de fornecedores (12-14/09) o nome fiscal está em `name` e o nome fantasia em `trade_name` — em Live a 16/09, 82 fornecedores ativos com `trade_name`, 28 deles alterados a 14/09 (ex.: CASINO ESTORIL → ESTORIL SOL III…, IPRINT → FORMATO MAGENTO…). A busca de Transações nunca leu `trade_name` — antes 'encontrava' porque o nome fantasia estava em `name`. Corrigido em `Transactions.tsx` (embed `suppliers!transactions_supplier_id_fkey(name, trade_name)`, haystack e chips) e em `TransactionFiltersPanel.tsx` (filtro e rótulo 'Nome fiscal (Nome fantasia)'). ⚠️ Qualquer outro ecrã que pesquise ou liste fornecedores só por `name` tem o mesmo defeito latente.

**Normalização de IBAN: uma só função em toda a app** — `normalizeIban` de `src/lib/iban.ts` (remove `[\s.\-_/]`, upper). A função local `normalizeIbanStr` do SupplierFormModal foi eliminada. Existem DOIS motores de validação e é deliberado: `lib/iban.ts` serve o aviso visual a cada tecla (puro, sem import dinâmico); `ibantools` decide a gravação no submit. Depois da unificação só podem discordar na tabela de países — daí o fallback no texto do toast.

**Método: políticas RLS alteram-se por MIGRAÇÃO RASTREADA, não pelo SQL Editor.** É isso que resolve a limitação do `query_database`, que rejeita `drop policy` (erro 499), e ao mesmo tempo deixa rasto no repositório. Substitui a nota anterior, que mandava usar o SQL Editor de Live. Edge functions via `service_role` precisam de GRANTs explícitos em `crm.*`. `send_message` do Lovable dá transport error mas a mensagem chegou — verificar com `get_project`. Scanner pré-Publish: "Ignore issue", nunca "Try to fix all".

**Conciliação bancária: uma linha, N transações (12/09).** A tabela-ponte `bank_line_transactions` é a SSOT das conciliações manuais de N. O lote SEPA **NÃO** resolve o N — foge-lhe, guardando um apontador para `payment_list_sepa_exports.transaction_ids`; o `transactionIds` do motor **nunca é gravado**, é derivado em memória via `sepaSiblings`. Os lançamentos ficam **fora** da ponte (cardinalidade inversa, N linhas → 1 transação, caso TPA). Três sítios têm de conhecer a ponte, e sem eles o "Resto sem explicação" deixa de dar zero: `savedExplainedIds`, o `preUsed` do `rerunReconcile`, e a trava de escrita do `rerunReconcile`.

**Documentos: `bank_line_documents` + réplicas com prefixo `bank://`.** Estrutura sem réplica em `transaction_documents` é **invisível ao contabilista** — nem o `ReportAccountingExport`, nem o ZIP, nem a aba Documentos a leem. O prefixo `bank://` tem de ser reconhecido em **CINCO** resolvedores de bucket: `accountant-tx-docs.ts`, `TransactionDocumentsModal`, `ReportAccountingExport.downloadFile`, `generate-accountant-zip` e `resolve-attachment-url`. Se um ficar de fora, o contabilista vê o anexo listado e não o abre.

**`transaction_documents.partner_visible`** (novo, default `true`): a política `transaction_documents_select_partner` passa a exigi-lo. Réplicas de linhas do banco entram sempre com `false`. `is_accounting` (papel) e `partner_visible` (evento) são eixos independentes.

**O extrato consolidado não mexe nos números.** `closingBalance`, `totalIncome`, `totalExpense` e as **duas exportações** continuam a ler o `lines` plano. A consolidação decide só o que se DESENHA. Ver **D-ERP55**.

**Transitórias têm motivo obrigatório (transactions.transitory_reason, 7 valores).** Caminhos da base que o gravam: `force_transitory_for_capital_branch` (10.1.04 → `emprestimo_socio`; restantes 10.1.* → `aporte_socio`) e `card_load_on_out_paid` (`carga_cartao`). As funções de cenários/versões copiam `event_forecasts`, não transações — não são afetadas. `renegotiate_transaction_installments` recusa transitórias. Regra de teste em Live: dados com prefixo, ids anotados, apagados no fim, e prova de que a base voltou à linha de base.

## Onde ler mais
- `docs/DECISIONS.md` — D-ERP75, D-ERP79, D-ERP80, D-ERP82
- `docs/manual/rateios.md` — primeiro capítulo do Manual de Orientação
- `claude/auditoria-company-id-service-role-2026-09-01.md` (incidente da auditoria, 01/09)
- `docs/procedimentos/PROC-recuperacao-plataforma.md`
- `.lovable/memory/constraints/lovable-cloud-ddl-workflow.md` (reescrita a 30/08 — o mundo com Test acabou), `edge-fn-esm-sh-supabase-js.md`
- Issues #186, #202, #203, #204, #206, #211, #140, #83, #96, #61, #57
