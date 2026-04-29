# Multi-empresa — Plano de implementação

> Decisões fechadas: single DB, `company_id` em todas as tabelas core, RLS rigorosa, branding por empresa (logo+cores+favicon), plano de contas isolado, 1 utilizador = 1 empresa, super-admin cria empresas, **Test fica vazio durante desenvolvimento**, Live migra-se com plano à parte.

---

## 1. Conceitos fundamentais

### 1.1 Nome do app
Permanece **fixo**: "MP Gestão Eventos". Só varia o branding da empresa cliente (logo, nome legal, NIF, país, cores, favicon). Já está em memory (`mem://constraints/app-brand-name-fixed`).

### 1.2 Hierarquia de papéis
- **Super-admin (platform)** — só tu. Pode ver/criar/editar empresas, convidar admins de empresa, ver logs cross-tenant. **Não** aparece na lista normal de utilizadores duma empresa.
- **Admin de empresa** — equivalente ao `admin` atual mas confinado à sua `company_id`.
- **Manager / Editor / Viewer / Accountant / Partner** — iguais aos atuais, todos com `company_id` único.

Implementação: nova role `platform_admin` no enum `app_role`. Todas as queries cross-tenant exigem `has_role(auth.uid(), 'platform_admin')`.

### 1.3 Isolamento
- Coluna `company_id uuid NOT NULL` em **todas** as tabelas core de negócio (lista no §3).
- Função SECURITY DEFINER `current_company_id()` lê de `profiles.company_id` do `auth.uid()`.
- RLS de cada tabela: `USING (company_id = public.current_company_id())` para SELECT/UPDATE/DELETE; `WITH CHECK (company_id = public.current_company_id())` para INSERT.
- Platform admin tem `OR has_role(auth.uid(), 'platform_admin')` em todas.
- Tabelas globais (sem `company_id`): `cities`, `venues` *(decidir adiante)*, `email_unsubscribe_tokens`, `login_attempts`, `system_audit_log` (com `company_id` opcional para filtrar mas visível ao platform admin).

---

## 2. Modelo de dados — novas tabelas

### 2.1 `companies`
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| legal_name | text NOT NULL | "Mundo Propício, Lda" |
| display_name | text NOT NULL | "Mundo Propício" |
| slug | text UNIQUE NOT NULL | "mundo-propicio" (para URLs/seletores) |
| tax_id | text | NIF/CNPJ |
| country | text NOT NULL DEFAULT 'PT' | ISO-2 |
| currency | text NOT NULL DEFAULT 'EUR' | |
| timezone | text NOT NULL DEFAULT 'Europe/Lisbon' | |
| logo_url | text | path no bucket `company-branding` |
| favicon_url | text | |
| theme_config | jsonb | `{ primary, accent, background, ... }` em HSL |
| address | jsonb | `{ street, city, postal_code, country }` |
| contact_email | text | |
| status | text NOT NULL DEFAULT 'active' | `active|suspended|trial` |
| created_at, updated_at | timestamptz | |

RLS:
- SELECT: utilizadores autenticados veem apenas a empresa onde `company_id = current_company_id()`. Platform admin vê todas.
- INSERT/UPDATE/DELETE: apenas platform admin.

### 2.2 `company_invitations`
Para o fluxo "super-admin convida admin de empresa":
| coluna | tipo |
|---|---|
| id | uuid PK |
| company_id | uuid FK companies |
| email | text NOT NULL |
| role | app_role NOT NULL |
| token | text UNIQUE NOT NULL |
| invited_by | uuid |
| accepted_at | timestamptz |
| expires_at | timestamptz NOT NULL DEFAULT now()+7d |
| created_at | timestamptz |

### 2.3 `profiles` — adicionar `company_id`
- Add `company_id uuid REFERENCES companies(id)` (nullable temporariamente em Test, depois NOT NULL via migração final).
- Trigger `handle_new_user`: ao receber novo signup, lê `raw_user_meta_data->>'company_id'` (passado pelo edge `accept-invitation`) e grava.
- Platform admins têm `company_id = NULL` (são meta).

---

## 3. Tabelas que ganham `company_id`

**Todas as 73** exceto:
- `cities` (catálogo global)
- `venues` (decisão pendente — provavelmente também por empresa, ver §6)
- `email_unsubscribe_tokens`, `suppressed_emails` (ligados a email, não a empresa)
- `login_attempts` (segurança transversal)
- `role_permissions` (catálogo global de permissões)

**Tabelas de domínio que recebem `company_id NOT NULL`** (lista exaustiva):
account_categories, accounting_exports, bp_orphan_attachments, bp_version_audit_log, bp_versions, camarim_fund_moves, camarim_integrations, camarim_item_documents, camarim_item_reviews, camarim_items, camarim_session_events, camarim_sessions, email_send_log, email_send_state, event_cache_city_settlements, event_cache_configs, event_cache_deductions, event_cache_extras, event_cache_payments, event_cache_tiers, event_closing_costs, event_dates, event_forecast_formalidade_log, event_forecast_partners, event_forecasts, event_implementations, event_partner_extras, event_partners, event_sessions, event_ticket_lots, event_ticket_office_advances, event_ticket_office_assignments, event_ticket_zones, events, financial_account_access, financial_accounts, forecast_audit_log, partner_advance_expenses, partner_event_access, partner_paid_expenses, payment_list_items, payment_lists, push_subscriptions, quotations, recurring_transactions, reimbursement_note_items, reimbursement_notes, supplier_credit_usages, supplier_credits, supplier_documents, suppliers, system_audit_log, ticket_import_logs, ticket_office_settlements, ticket_sales, transaction_audit_log, transaction_documents, transaction_payments, transactions, trash, undo_actions, user_activity_log, user_permissions, user_roles.

**Estratégia de adicionar a coluna:** uma migração por **grupo lógico** (~6 grupos), cada uma com:
1. `ALTER TABLE ... ADD COLUMN company_id uuid REFERENCES companies(id)` (nullable inicialmente).
2. Recriar políticas RLS de cada tabela com filtro por `current_company_id()`.
3. Adicionar índice `(company_id, ...campos-mais-filtrados)`.
4. (Em fase 2) tornar `NOT NULL` depois de seed/migração.

---

## 4. Storage

Buckets atuais (camarim-documents, transaction-documents, supplier-documents, accounting-exports, event-closing-costs, etc.) — adicionar **prefixo `{company_id}/`** em todos os paths.

Políticas storage:
```sql
USING (
  bucket_id = 'transaction-documents'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
)
```

Novo bucket: **`company-branding`** (público) para logos e favicons.

---

## 5. Edge functions

Todas precisam de extrair `company_id` do utilizador autenticado (via JWT → profile). Cada função fica responsável por **validar** que recursos manipulados pertencem a essa empresa.

Funções a tocar (impacto):
- **Crítico** — manipulam dados de várias tabelas: `approve-transaction`, `update-transaction`, `close-camarim-session`, `generate-historical-transactions`, `match-categories`, `audit-categories`.
- **Médio** — geram artefactos: `database-backup`, `database-restore*`, `selective-restore`, `surgical-restore` (têm de ser por empresa!), `extract-camarim-receipt`, `extract-invoice-total`, `extract-ticket-pdf`.
- **Admin** — `create-user`, `delete-user` ganham parâmetro `company_id` e validam que quem chama é admin dessa empresa (ou platform admin).
- **Inalteráveis** (ou quase): `auth-email-hook`, `check-login-rate`, `fetch-fx-rate`, `help-search`, `request-password-reset`.
- **Novas funções:**
  - `create-company` (platform admin) — cria empresa + bucket folders + plano de contas vazio.
  - `invite-company-admin` — gera token, envia email.
  - `accept-invitation` — aceita convite, cria utilizador com `company_id` correto.

---

## 6. Decisões pendentes (para resolver durante implementação)

| # | Tema | Default proposto | Confirma quando chegares lá |
|---|---|---|---|
| D1 | `cities` é global ou por empresa? | **Global** (catálogo PT/BR) | |
| D2 | `venues` é global ou por empresa? | **Por empresa** (cada cliente cura os seus) | |
| D3 | Plano de contas inicial duma empresa nova: copia template ou nasce vazio? | **Vazio** (admin importa o seu) | |
| D4 | IVA categories são globais (PT) ou por empresa? | **Global por país** (PT tem 6/13/23) | |
| D5 | Logos antigos do projeto (assets em `src/assets/logos/`) ficam onde? | **Migram para Mundo Propício no bucket** | |
| D6 | Backup diário (cron 03:00) corre 1 vez por empresa ou 1 vez global com folders? | **1 ficheiro por empresa**, mesmo cron | |
| D7 | Trash + 30 dias é por empresa ou global com `company_id`? | **Por empresa com `company_id`** | |

---

## 7. UI

### 7.1 Header
- Sem seletor de empresa (1 utilizador = 1 empresa).
- Mostra logo da empresa ativa (lê de `companies.logo_url`) à esquerda + nome legal pequeno por baixo.
- Theme aplicado dinamicamente: ao boot, `<style>` com CSS variables da empresa injetado em `<head>`.
- Favicon trocado dinamicamente via `<link rel="icon">` para `companies.favicon_url`.

### 7.2 Nova página `/admin/companies` (só platform admin)
- Lista de empresas com KPIs (utilizadores, eventos, transações, storage usado).
- Criar nova empresa (modal com legal_name, slug, country, currency, branding upload).
- Convidar admin (email + role).
- Suspender/ativar empresa.

### 7.3 Auth
- `/auth` (login) inalterado.
- `/auth?invitation=<token>` — fluxo novo: aceita convite, cria conta com `company_id` pré-definido.
- Após login, se utilizador não tem `company_id` e não é platform admin → erro "Conta sem empresa atribuída, contacte o administrador".

---

## 8. Faseamento (Test only)

### Fase 0 — Plano (este documento) ✅
### Fase 1 — Fundamentos (1 migration grande)
1. Criar `companies`, `company_invitations`.
2. Adicionar `platform_admin` ao enum `app_role`.
3. Adicionar `company_id` a `profiles`, `user_roles`, `user_permissions`.
4. Função `current_company_id()` SECURITY DEFINER.
5. Trigger `handle_new_user` atualizado para ler `company_id` de metadata.
6. Bucket `company-branding` (público).
7. Seed: criar empresa "Mundo Propício" + tornar conta `pedrobrandao@socialmusic.com.br` (ou indicada) em platform_admin.

### Fase 2 — `company_id` em tabelas operacionais (1 migration por grupo)
- 2A: Eventos (`events`, `event_dates`, `event_sessions`, `event_partners`, `event_forecasts`, `event_forecast_partners`, `event_implementations`, `event_closing_costs`, `event_partner_extras`, `bp_versions`, `bp_version_audit_log`, `bp_orphan_attachments`, `event_forecast_formalidade_log`, `forecast_audit_log`).
- 2B: Bilhética (`event_ticket_zones`, `event_ticket_lots`, `event_ticket_office_assignments`, `event_ticket_office_advances`, `ticket_office_settlements`, `ticket_sales`, `ticket_import_logs`).
- 2C: Cache artista (`event_cache_*`).
- 2D: Camarim (`camarim_*`).
- 2E: Financeiro (`transactions`, `transaction_audit_log`, `transaction_documents`, `transaction_payments`, `payment_lists`, `payment_list_items`, `recurring_transactions`, `quotations`, `accounting_exports`, `account_categories`, `financial_accounts`, `financial_account_access`, `suppliers`, `supplier_credits`, `supplier_credit_usages`, `supplier_documents`, `reimbursement_notes`, `reimbursement_note_items`, `partner_advance_expenses`, `partner_paid_expenses`, `partner_event_access`).
- 2F: Suporte (`trash`, `undo_actions`, `system_audit_log`, `user_activity_log`, `email_send_log`, `email_send_state`, `push_subscriptions`).

Cada migration recria RLS e índices da tabela.

### Fase 3 — Edge functions
- Helper partilhado `_shared/get-company-id.ts` para extrair company_id do JWT.
- Refactor das 30 functions, prioritizando críticas.
- Novas functions: `create-company`, `invite-company-admin`, `accept-invitation`.

### Fase 4 — Storage
- Renomear convenção de paths para `{company_id}/...` em código que faz upload.
- Atualizar políticas dos buckets.

### Fase 5 — UI
- Página `/admin/companies` (platform admin).
- Hook `useCompany()` que devolve a empresa ativa.
- `ThemeProvider` lê `theme_config` da empresa.
- Logo + favicon dinâmicos.
- Fluxo de convite + aceitação.

### Fase 6 — Validação em Test
- Criar 3 empresas seed: "Mundo Propício", "Empresa Demo 2", "Empresa Demo 3".
- Criar utilizador admin em cada.
- Validar que `admin@empresa2.com` **nunca** consegue ver dados de empresa 1 (testes de RLS exaustivos).
- Validar branding switching.
- Validar storage isolation.

### Fase 7 — Plano de migração para Live
*(documento separado, após Fase 6 estar verde)*
- Backup completo de Live.
- Criar empresa "Mundo Propício" em Live.
- `UPDATE` em todas as tabelas para gravar `company_id` da Mundo Propício.
- Tornar colunas `NOT NULL`.
- Publicar.

---

## 9. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Bug numa policy RLS expõe dados entre empresas | Testes automatizados em Fase 6: criar 2 empresas, autenticar como admin de cada, tentar ler dados da outra — deve devolver 0 rows. |
| Edge function esquece-se de filtrar por company_id | Helper `assertCompanyOwnership(resourceCompanyId)` obrigatório em todas, lança 403 se mismatch. |
| Migração Live demora horas (UPDATE em tabelas grandes) | Fazer em janela de manutenção; usar `UPDATE ... WHERE company_id IS NULL` em batch. |
| Foreign keys cross-table com `company_id` desalinhado | Trigger de validação: numa transação, `event.company_id` tem de bater certo com `transaction.company_id`. |
| Perda de personalização atual (logo MP, favicon, cores) | Tudo isto vira o registo "Mundo Propício" inicial; aplicação fica com aspeto idêntico. |
| Custo de manutenção de bugs cross-tenant | RLS rigorosa + testes E2E por tenant + checklist de revisão de migrations. |

---

## 10. O que **não** muda

- Lógica de negócio (BP, Master/Split, Camarim, Tax, Cache, Settlement, etc.) — toda intacta.
- Schema das tabelas existentes além da nova coluna `company_id`.
- Endpoints/edge functions visíveis ao utilizador final.
- Aspecto da UI (excepto adição de logo da empresa no header).

---

## 11. Próximos passos

1. ✅ Aprovar este plano.
2. Avançar para **Fase 1** — migration de fundamentos (`companies`, `company_invitations`, `current_company_id()`, `platform_admin` role).
3. Validar Fase 1 em Test (criar empresa seed, atribuir tu como platform admin).
4. Iterar Fases 2A → 2F (uma migration de cada vez, com pausa para testar).
5. Fases 3 → 6.
6. Plano separado para Fase 7 (Live).
