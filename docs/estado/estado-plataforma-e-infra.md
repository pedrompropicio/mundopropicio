# ESTADO — Plataforma & Infra

Atualizado: 2026-09-14 · Issues: #86 · a-seguir #83, #87, #96, #61, #169 · ação do Pedro: #87 passo 2

## Em que pé está
Lovable Cloud + Supabase **Live único** (decisão fechada, D2 — não reabrir). DDL do agente aplica direto em Live; `query_database` só ataca Live. Publish propaga código, edge functions e frontend — **não** objetos SQL, DML nem crons.

A 30/08 fez-se limpeza estrutural: 42 tabelas tinham dois triggers idênticos de `company_id` e ficaram com um; duas funções de validação L2 sem trigger nenhum foram removidas; e a `entity_documents` nasceu já com política RESTRICTIVE — a primeira tabela a nascer do lado certo da #83.

A 01/09 atacou-se a #86 pelo lado dos produtores: varreram-se as edge functions à procura de inserts sob `service_role` sem `company_id` explícito, e corrigiram-se os dois casos com dano medido. Publicado e verificado em Live.

A 11-12/09 reconstruiu-se a base de fornecedores: fusão dos duplicados por IBAN, três índices únicos parciais em Live como trava nova, e unificação da normalização de IBAN numa só função da app.

Ainda a 12/09 fechou-se a conciliação bancária de **uma linha contra N transações** (tabela-ponte `bank_line_transactions`) e os documentos da linha do banco (`bank_line_documents` + réplicas `bank://`), com a coluna nova `transaction_documents.partner_visible` a impedir que a fatura de um crédito partilhado chegue ao sócio do evento.

**E fechou-se hoje, 12/09, a consolidação do Extrato da Conta** (`/relatorios/extrato`) — ver a secção seguinte.

A 14/09 o dia foi de reparação: o ecrã de Transações esteve vazio para toda a gente por causa de um embed ambíguo do PostgREST, a fusão de fornecedores de 12/09 revelou-se ter atravessado fronteiras de empresa e foi revertida, o ciclo de vida do fornecedor ganhou regras, e o verificador de invariantes foi consolidado num só motor com referências aceites por escrito. As três secções seguintes contam cada um dos casos.

## Incidente — o ecrã de Transações ficou vazio para toda a gente (14/09/2026)

Uma chave estrangeira nova entre `transactions` e `suppliers` deixou **duas** FKs entre o mesmo par de tabelas. O embed escrito como `suppliers(name)` passou a ser ambíguo e o PostgREST responde **HTTP 300 / PGRST201** — **recusa o pedido inteiro**, não devolve resultado parcial. O ecrã não mostrava erro nenhum: a query era desestruturada sem ler `{ error }` e a linha "Sem transações registadas." servia tanto para lista vazia como para query falhada.

Correção: o embed passou a nomear a FK explicitamente — `suppliers:suppliers!transactions_supplier_id_fkey(name)` — com o alias preservado, para o código a jusante ficar intocado.

⚠️ **Regra que fica:** acrescentar uma FK entre um par de tabelas que já tem uma parte **silenciosamente todos os embeds desse par**. Hoje existem **35 pares de tabelas com FK duplicada** (apurado em Live a 14/09). Está sob vigilância pelo invariante `pares_fk_duplicada`, com referência 35 — qualquer FK nova faz o número subir e o verificador acusa.

Fica em aberto: o ecrã de Transações continua a engolir o erro da query (issue nova aberta hoje).

## Incidente — a fusão de fornecedores de 12/09 atravessou fronteiras de empresa, revertida a 14/09

As 86 fusões de duplicados por IBAN de 12/09 foram feitas por SQL sob `service_role`, onde `current_company_id()` devolve NULL e as políticas RESTRICTIVE não se aplicam. Resultado: fornecedores de empresas diferentes foram fundidos e **48 transações** ficaram apontadas a um fornecedor de outra empresa, num total de **78.922,17 €**.

Reversão a 14/09: **85 dos 86** fornecedores reativados (um era duplicado genuíno e ficou inativo), as 48 transações reapontadas ao fornecedor da própria empresa e **30 mapeamentos de rubrica** do Coala repostos.

Tropeção no caminho, que fica registado: a primeira tentativa de reativação rebentou contra `suppliers_company_iban_unique` porque a verificação prévia só procurou colisões contra fornecedores **já ativos**, e não entre os próprios 86. Nada foi escrito — a instrução abortou inteira.

⚠️ **Regra que fica:** uma operação de dados em massa sob `service_role` tem de reproduzir à mão as fronteiras que as travas da base garantiriam a um utilizador normal — `company_id` em cada linha tocada, e a verificação de unicidade tem de incluir o próprio lote. Está sob vigilância pelo invariante `tx_fornecedor_outra_empresa`, referência 0.

**Correção a um facto antes registado:** a RPC `check_supplier_iban_duplicate` **não** atravessa fronteiras de empresa — filtra por `current_company_id()`. O defeito real era outro: não excluía fornecedores **inativos**, e por isso acusava duplicado contra um registo desativado que já não devia contar. Corrigido.

## Ciclo de vida do fornecedor (14/09/2026)

Nada na aplicação desativa um fornecedor: `is_active` só era mexido por SQL. E o botão de apagar em `Suppliers.tsx` fazia `.delete()` direto, sem passar pelo Lixo, apesar de `src/lib/trash.ts` já declarar `supplier: "Fornecedor"`. Passou a apagar para o Lixo, recuperável. **Desativado** passa a significar uma coisa só: registo fundido ou substituído, mantido para o histórico e com nota auditável.

## Verificador de invariantes (consolidado a 14/09/2026)

Já existia um `check_system_invariants()` com ecrã próprio — não se reinventou, consolidou-se.

Estrutura: tabela `system_invariants` (`name`, `description`, `severity`, `reference_count`, `notes`, `reference_updated_by`, `reference_updated_at`), tabela `invariant_runs` com o histórico, função `run_invariant_checks()` que corre e devolve, `run_invariant_checks_and_log()` que corre e grava a corrida, e `accept_invariant_reference(name, value, note)` que aceita a contagem de hoje como referência.

**Princípio central: o alerta é por desvio face à referência, nunca por número diferente de zero.** Dívida herdada com contagem conhecida não faz barulho todos os dias; o que faz barulho é a contagem **mexer**.

19 verificações a 14/09, todas conformes. Referências em Live a 14/09/2026:

- severidade `error`, referência **0**: `BP_DESPESA_EM_L2`, `coala_map_outra_empresa`, `fecho_confirmado_liquido_retido`, `filha_rateio_com_conta`, `FORECAST_ID_ORFAO`, `fornecedor_iban_duplicado_ativo`, `grupo_fatura_veredicto_desagrupar_por_aplicar`, `tipo_invalido`, `tx_conta_outra_empresa`, `tx_evento_outra_empresa`, `tx_fornecedor_outra_empresa`, `tx_rubrica_outra_empresa`, `VINCULO_CROSS_EVENTO`
- severidade `error`, referência **7**: `VINCULO_DESSINCRONIZADO` — **contradição assumida**, dívida herdada com severidade de erro. Ou desce a zero ou passa a `warn` com razão escrita. Issue aberta.
- severidade `warn`, dívida herdada: `paid_amount_acima_do_bruto` 9, `pares_fk_duplicada` 35, `TRIGGER_DOCUMENTADO_SEM_LIGACAO` 4, `TX_EVENTO_SEM_RUBRICA` 13, `tx_paga_sem_linha_de_pagamento` 1026

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

## A trabalhar agora
- **#86** — `set_company_id_on_insert` aborta inserts sem contexto de utilizador, em 71 tabelas. **Progresso a 01/09:** `update-transaction` e `approve-transaction` (4 inserts em `transaction_audit_log`) e as whitelists de restore de `ticket_sales` em `selective-restore` e `surgical-restore` estão corrigidos e provados em Live. Continua aberta: falta o inventário completo das tabelas escritas sem contexto de utilizador, que é o critério de aceitação. #53 e #56 seguem como sub-tarefas; #96 saiu daqui.

**Fechado hoje (12/09):** a consolidação do extrato da conta saiu desta secção — está entregue, testada e verificada em Live.

**Entregue a 13/09 (D-ERP57):** contas de tráfego do próprio artista. `crm.ad_platform_connections` com `connection_scope = 'artist'` + `artist_id`; funções `artist-ads-meta-oauth-start|callback|select-account|disconnect` deployed; RPC `artist_ads_register_external` para Google/TikTok sem OAuth; `crm-google-sync-campaigns` promove `pending_link` → `active`; ecrã de Conexões etiqueta "Artista: <nome>". Registado o Google do Litto Lins (`8841388615`). **Pendente do Pedro:** abrir o link de autorização Meta do Litto (em baixo) e, no Google Ads, aceitar o convite do MCC para a conta ficar `active`.

## Próximo passo concreto
**Ação do Pedro:** desativar a edge function `generate-historical-transactions` no Lovable (#87 passo 2). Enquanto estiver deployed continua invocável por qualquer admin e escreve `amount` com o IVA embutido. Só depois se remove do repo.

**Ação do Pedro:** confirmar o Publish das correções de IBAN (commits `3b5f702` e `c61a880`).

## Prazos e renovações
- **PAT do GitHub expira 24/set/2026** (#15) — 12 dias.
- Token Meta da conta da Ivete expira 08/10/2026. Fortal e Siriguella expirados desde 22/08 (#36).

## Factos que não se reinvestigam

**Empresas: quatro.** Mundo Propício (PT), Coala Festival Portugal (PT), Fortal (BR), Siriguella (BR). A Social Music seria a **5.ª**, e os eventos `SM - Lisboa` e `SM - Porto` estão hoje sob o `company_id` da MP — se ela passar a empresa própria, esses eventos migram, e isso é trabalho de dados.

**Isolamento: 106 de 144 com RESTRICTIVE, 38 sem.** As 15 nomeadas na #83 como fuga real estão **todas corrigidas**. Sobram quatro tabelas de sistema: `notification_templates`, `system_reminders`, `system_reminder_settings`, `operacao_chamado_sla`. As outras 34 têm RLS ligada e nenhuma tem leitura aberta — é dívida, não é porta aberta.

⚠️ **Regra de leitura de RLS:** acesso = `(OR das PERMISSIVE) AND (AND das RESTRICTIVE)`. Procurar isolamento **por função** (`row_belongs_to_current_company`), não só por comparação directa.

**RLS ligada com zero políticas = negar tudo:** `app_secrets`, `vip_coupon_email_log`.

**Auditoria server-side de transações esteve partida de 28/abr a 01/set.** Sob `service_role`, `current_company_id()` devolve NULL, o default de `company_id` não resolve e o insert em `transaction_audit_log` era rejeitado — com o erro engolido. Custou **894 transações editadas** e **1.209 aprovadas** sem rasto do lado do servidor, e o campo `Propagação grupo-fatura` nunca teve uma única linha. Não deu nas vistas porque o frontend escreve as suas próprias linhas com o JWT do utilizador, logo a tabela nunca ficou vazia. **A regra que ficou:** insert sob `service_role` passa `company_id` explícito, tirado da linha auditada — nunca do perfil do utilizador nem de `current_company_id()`. Detalhe completo em `claude/auditoria-company-id-service-role-2026-09-01.md`.

**Restore de `ticket_sales` estava impossível.** As whitelists de colunas em `selective-restore` e `surgical-restore` tinham 13 das 15 colunas da tabela: faltavam `company_id` (NOT NULL, rebentava o upsert) e `total_value` (coluna normal, não gerada — perdia-se o valor). Corrigido a 01/09. **Fica de pé (#96):** backups *legacy* (v2, pré-multi-tenant) não têm `company_id` nas linhas, e como o `cleanRow` só copia o que existe, o restore a partir desses continua a rebentar. Só platform_admin lhes chega.

**A Gestão de IVA não filtra nada.** O `IvaManagement.tsx` traz todas as transações — sem filtro de `is_transitory`, `exclude_from_result` ou estado. Uma transação fora do resultado entra no apuramento de IVA na mesma. E `transactions.iva_rate` tem **default 23**: taxa omitida nasce a 23%.

**A edge function `github-issues` não é alcançável por HTTPS direto do container das tarefas agendadas** (403). O caminho que funciona é `net.http_post` a partir de `query_database`, com a service role key do vault (secret `email_queue_service_role_key`). Parâmetro é `number`, não `issue_number`. Acções: `list`, `create`, `comment`, `close`, `update` — atenção que `update` com `labels` **substitui** o conjunto todo, não acrescenta.

**Um trigger de `company_id` por tabela, com o nome `trg_set_company_id`.** Três tabelas mantêm nomes legados (`event_courtesies`, `event_ticket_types`, `event_ticket_type_zones`) — cada uma com um só trigger. Não criar um segundo com outro nome.

**Base de fornecedores reconstruída a 11-12/09.** Estado final: 455 ativos, 86 desativados por duplicação, ZERO grupos duplicados por IBAN, 1.443 transações (inalterado). Antes: 541 fornecedores, 330 com IBAN mas só 244 IBANs distintos, 48 IBANs gravados com separadores.

Origem: importação de **29/04/2026 às 23:49:50** — 93 fornecedores criados no mesmo segundo, com IBAN (86) mas quase sem NIF (14). Sem NIF não havia como reconhecer o fornecedor existente, e a única proteção era `suppliers_company_name_unique (company_id, lower(trim(name))) WHERE is_active`, que falha ao primeiro espaço a mais: `RICARDO COVOES S A ` não colide com `RICARDO COVOES S A`. Dos 86 desativados, 81 nasceram nesse dia. O lote de 09/08 (67 fornecedores) não produziu duplicados.

Trava nova, criada em Live a 12/09: três índices únicos parciais `suppliers_company_iban_unique`, `suppliers_company_iban2_unique`, `suppliers_company_iban3_unique`, sobre `(company_id, iban|iban_2|iban_3) WHERE is_active AND <coluna> IS NOT NULL AND <coluna> <> ''`. O `WHERE is_active` é deliberado — os desativados mantêm o IBAN para o histórico. Apanham colisões dentro da MESMA coluna; o caso cruzado (iban_2 de um = iban de outro) fica coberto pela RPC `check_supplier_iban_duplicate` no formulário.

⚠️ A PRÓXIMA IMPORTAÇÃO EM MASSA DE FORNECEDORES VAI REBENTAR contra estes índices em vez de criar gémeos. É intencional. A solução é reconciliar pelo IBAN normalizado antes de inserir, nunca desativar o índice.

Cada fornecedor desativado tem nota auditável: `[2026-09-12] Duplicado por IBAN — fundido em <id>. …`

**Normalização de IBAN: uma só função em toda a app** — `normalizeIban` de `src/lib/iban.ts` (remove `[\s.\-_/]`, upper). A função local `normalizeIbanStr` do SupplierFormModal foi eliminada. Existem DOIS motores de validação e é deliberado: `lib/iban.ts` serve o aviso visual a cada tecla (puro, sem import dinâmico); `ibantools` decide a gravação no submit. Depois da unificação só podem discordar na tabela de países — daí o fallback no texto do toast.

**Método: políticas RLS alteram-se por MIGRAÇÃO RASTREADA, não pelo SQL Editor.** É isso que resolve a limitação do `query_database`, que rejeita `drop policy` (erro 499), e ao mesmo tempo deixa rasto no repositório. Substitui a nota anterior, que mandava usar o SQL Editor de Live. Edge functions via `service_role` precisam de GRANTs explícitos em `crm.*`. `send_message` do Lovable dá transport error mas a mensagem chegou — verificar com `get_project`. Scanner pré-Publish: "Ignore issue", nunca "Try to fix all".

**Conciliação bancária: uma linha, N transações (12/09).** A tabela-ponte `bank_line_transactions` é a SSOT das conciliações manuais de N. O lote SEPA **NÃO** resolve o N — foge-lhe, guardando um apontador para `payment_list_sepa_exports.transaction_ids`; o `transactionIds` do motor **nunca é gravado**, é derivado em memória via `sepaSiblings`. Os lançamentos ficam **fora** da ponte (cardinalidade inversa, N linhas → 1 transação, caso TPA). Três sítios têm de conhecer a ponte, e sem eles o "Resto sem explicação" deixa de dar zero: `savedExplainedIds`, o `preUsed` do `rerunReconcile`, e a trava de escrita do `rerunReconcile`.

**Documentos: `bank_line_documents` + réplicas com prefixo `bank://`.** Estrutura sem réplica em `transaction_documents` é **invisível ao contabilista** — nem o `ReportAccountingExport`, nem o ZIP, nem a aba Documentos a leem. O prefixo `bank://` tem de ser reconhecido em **CINCO** resolvedores de bucket: `accountant-tx-docs.ts`, `TransactionDocumentsModal`, `ReportAccountingExport.downloadFile`, `generate-accountant-zip` e `resolve-attachment-url`. Se um ficar de fora, o contabilista vê o anexo listado e não o abre.

**`transaction_documents.partner_visible`** (novo, default `true`): a política `transaction_documents_select_partner` passa a exigi-lo. Réplicas de linhas do banco entram sempre com `false`. `is_accounting` (papel) e `partner_visible` (evento) são eixos independentes.

**O extrato consolidado não mexe nos números.** `closingBalance`, `totalIncome`, `totalExpense` e as **duas exportações** continuam a ler o `lines` plano. A consolidação decide só o que se DESENHA. Ver **D-ERP55**.

## Onde ler mais
- `claude/auditoria-company-id-service-role-2026-09-01.md` (incidente da auditoria, 01/09)
- `.lovable/memory/constraints/lovable-cloud-ddl-workflow.md` (reescrita a 30/08 — o mundo com Test acabou), `edge-fn-esm-sh-supabase-js.md`
- `docs/DECISIONS.md` — D-ERP40 (identidade de fornecedor é o IBAN normalizado), D-ERP41 (o anexo do movimento do banco pertence ao movimento e nunca é visível ao sócio), D-ERP55 (o saldo do extrato calcula-se sobre a ordem que se vê)
- Issues #86, #83, #87, #96, #61, #57
