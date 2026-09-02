# ESTADO — Plataforma & Infra

Atualizado: 2026-09-01 · Issues: #86 · a-seguir #83, #87, #96, #61 · ação do Pedro: #87 passo 2

## Em que pé está
Lovable Cloud + Supabase **Live único** (decisão fechada, D2 — não reabrir). DDL do agente aplica direto em Live; `query_database` só ataca Live. Publish propaga código, edge functions e frontend — **não** objetos SQL, DML nem crons.

A 30/08 fez-se limpeza estrutural: 42 tabelas tinham dois triggers idênticos de `company_id` e ficaram com um; duas funções de validação L2 sem trigger nenhum foram removidas; e a `entity_documents` nasceu já com política RESTRICTIVE — a primeira tabela a nascer do lado certo da #83.

A 01/09 atacou-se a #86 pelo lado dos produtores: varreram-se as edge functions à procura de inserts sob `service_role` sem `company_id` explícito, e corrigiram-se os dois casos com dano medido. Publicado e verificado em Live.

## A trabalhar agora
- **#86** — `set_company_id_on_insert` aborta inserts sem contexto de utilizador, em 71 tabelas. **Progresso a 01/09:** `update-transaction` e `approve-transaction` (4 inserts em `transaction_audit_log`) e as whitelists de restore de `ticket_sales` em `selective-restore` e `surgical-restore` estão corrigidos e provados em Live. Continua aberta: falta o inventário completo das tabelas escritas sem contexto de utilizador, que é o critério de aceitação. #53 e #56 seguem como sub-tarefas; #96 saiu daqui.

## Próximo passo concreto
**Ação do Pedro:** desativar a edge function `generate-historical-transactions` no Lovable (#87 passo 2). Enquanto estiver deployed continua invocável por qualquer admin e escreve `amount` com o IVA embutido. Só depois se remove do repo.

## Prazos e renovações
- **PAT do GitHub expira 24/set/2026** (#15) — 23 dias.
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

`query_database` rejeita `drop policy` (erro 499) — essas vão pelo SQL Editor de Live, exceção registada na constraint de DDL. Edge functions via `service_role` precisam de GRANTs explícitos em `crm.*`. `send_message` do Lovable dá transport error mas a mensagem chegou — verificar com `get_project`. Scanner pré-Publish: "Ignore issue", nunca "Try to fix all".

## Onde ler mais
- `claude/auditoria-company-id-service-role-2026-09-01.md` (incidente da auditoria, 01/09)
- `.lovable/memory/constraints/lovable-cloud-ddl-workflow.md` (reescrita a 30/08 — o mundo com Test acabou), `edge-fn-esm-sh-supabase-js.md`
- Issues #86, #83, #87, #96, #61, #57
