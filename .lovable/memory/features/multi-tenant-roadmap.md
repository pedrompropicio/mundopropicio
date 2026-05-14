---
name: Multi-tenant roadmap
description: Plano e estado da transição multi-empresa (Coala/Cloudscape como 2ª empresa); Fases 1+2+3+4+5+6 COMPLETAS em Test (Fase 7 = migração Live, pendente)
type: feature
---

## Estado: Fases 1→6 + refactor multi-membership N:N COMPLETAS em Test (Fase 7 = Live, pendente)

**2026-05-14 — Refactor multi-membership (Padrão A: Identidade única + Memberships N:N)**:
- 1 user em `auth.users` pode ter membership em N empresas via `user_roles` UNIQUE (user_id, company_id, role).
- `profiles.company_id` NULLABLE (só fallback); `current_company_id()` resolve por `active_company_id` + memberships.
- VIEW `user_companies` (security_invoker) — `useUserMemberships()` no frontend.
- `CompanySwitcher` visível a QUALQUER user com ≥2 memberships (não só platform_admin).
- Edge fn `create-user` com `dry_run` → `will_create | will_attach | already_member`; UI confirma attach via AlertDialog.
- `UserManagement` lista por `user_roles WHERE company_id = activeCompanyId`; eliminar remove só a membership desta empresa (apaga `auth.users` apenas se zero memberships restantes); mudança de role escopada por empresa.
- Quarentena Fase 8 multi-país: refactor não destrava sozinho — gatilhos atuais mantêm-se.
- Detalhes: ver memória `multi-membership-model`.

Plano completo em `.lovable/plan.md`. Decisões fechadas:
- Single DB + `company_id` em tabelas core + RLS rigorosa
- 1 user → N empresas (Padrão A: memberships N:N)
- Branding por empresa (logo + cores + favicon), nome do app FIXO "MP Gestão Eventos"
- Plano de contas isolado por empresa
- Super-admin (`platform_admin`) cria empresas e convida admins
- Test fica vazio durante dev; Live migra-se na Fase 7

## Empresas em Test
1. **Mundo Propício, Lda** (PT, EUR) — slug `mundo-propicio`, id `975254b9-6b92-4cdd-a971-36e4a4f98525`
2. **Demo 2** (PT, EUR) — slug `demo-2`, id `6e174fca-69b6-4173-9aca-11a0a8355840`, tema laranja/verde (primary `15 85% 55%`, accent `160 60% 45%`) — usada para validação cross-tenant; vazia de dados de negócio.

## Fase 1 — Concluída ✅ (Test)
Migrações aplicadas:
- Enum `app_role` ganhou valor `platform_admin`
- Tabela `companies` (id, legal_name, display_name, slug, tax_id, country, currency, timezone, logo_url, favicon_url, theme_config jsonb, address jsonb, contact_email, status)
- Tabela `company_invitations` (token único, expira 7 dias)
- Coluna `company_id` em `profiles`, `user_roles`, `user_permissions` (nullable)
- Funções `current_company_id()` e `is_platform_admin(_user_id?)`
- RLS: cada user vê só a sua empresa; platform_admin vê todas
- Bucket público `company-branding`
- Trigger `handle_new_user` lê `company_id` de `raw_user_meta_data`
- Seed: empresa "Mundo Propício, Lda" criada; todos os 6 profiles existentes associados; `pedroneto@mundopropicio.com` promovido a `platform_admin` (com `company_id = NULL` no role platform_admin, mas mantém `company_id = mundo-propicio` no profile e role admin)

ID da empresa Mundo Propício em Test: `975254b9-6b92-4cdd-a971-36e4a4f98525`

## Fase 2A — Concluída ✅ (Test)
14 tabelas de eventos/BP ganharam `company_id` (nullable), seed para Mundo Propício, RLS RESTRICTIVE de isolamento por empresa, trigger BEFORE INSERT que preenche automaticamente:
- events, event_dates, event_sessions, event_partners, event_forecasts, event_forecast_partners
- event_implementations, event_closing_costs, event_partner_extras
- bp_versions, bp_version_audit_log, bp_orphan_attachments
- event_forecast_formalidade_log, forecast_audit_log

Helpers criados:
- `row_belongs_to_current_company(uuid)` — NULL-safe (linhas sem company_id ainda são visíveis durante transição)
- `set_company_id_on_insert()` — trigger genérico, lê de `current_company_id()`

**Estratégia adotada**: policies RESTRICTIVE adicionais (não substituem as existentes). Toda a lógica de admin/manager/editor/viewer/partner/accountant fica intacta — apenas é aplicada uma camada de filtragem por empresa por cima.

Total de linhas seeded em 2A: 1144 (12 eventos, 740 forecasts, 31 bp_versions, 255 forecast_audit_log, etc.)

## Fase 2B — Concluída ✅ (Test)
7 tabelas de bilhética ganharam `company_id` + RLS RESTRICTIVE + trigger BEFORE INSERT:
- event_ticket_zones (223), event_ticket_lots (456)
- event_ticket_office_assignments (8), event_ticket_office_advances (0)
- ticket_office_settlements (2), ticket_sales (530), ticket_import_logs (14)

Total seeded em 2B: 1233 linhas → Mundo Propício.

## Fase 2C — Concluída ✅ (Test)
13 tabelas de cache de artistas + camarim ganharam `company_id` + RLS RESTRICTIVE + trigger BEFORE INSERT:
- **Cache artista (6)**: event_cache_configs (1), event_cache_tiers (0), event_cache_extras (0), event_cache_deductions (0), event_cache_payments (0), event_cache_city_settlements (2)
- **Camarim (7)**: camarim_sessions (2), camarim_session_events (1), camarim_items (6), camarim_item_documents (0), camarim_item_reviews (0), camarim_fund_moves (5), camarim_integrations (0)

Total seeded em 2C: 17 linhas → Mundo Propício.

## Fase 2D — Concluída ✅ (Test)
8 tabelas do financeiro core ganharam `company_id` + RLS RESTRICTIVE + trigger BEFORE INSERT:
- transactions (139), transaction_documents (134), transaction_payments (2), transaction_audit_log (239)
- payment_lists (7), payment_list_items (39), recurring_transactions (2), partner_advance_expenses (0)

Total seeded em 2D: 562 linhas → Mundo Propício.

## Fase 2E — Concluída ✅ (Test)
10 tabelas de suporte financeiro ganharam `company_id` + RLS RESTRICTIVE + trigger BEFORE INSERT:
- **Fornecedores (4)**: suppliers (91), supplier_documents (0), supplier_credits (0), supplier_credit_usages (0)
- **Contas financeiras (2)**: financial_accounts (7), financial_account_access (1)
- **Reembolsos (2)**: reimbursement_notes (4), reimbursement_note_items (7)
- **Sócios (2)**: partner_paid_expenses (5), partner_event_access (0)

Total seeded em 2E: 115 linhas → Mundo Propício.

## Fase 2F — Concluída ✅ (Test) — última de schema
14 tabelas de sistema + comercial + comunicações + catálogos por empresa ganharam `company_id` + RLS RESTRICTIVE + trigger BEFORE INSERT:
- **Sistema/Auditoria (4)**: trash (6), undo_actions (8), system_audit_log (28), user_activity_log (5116)
- **Comercial (3)**: quotations (0), venue_reservations (56), accounting_exports (0)
- **Comunicações (5)**: email_send_log (34), email_send_state, email_unsubscribe_tokens, suppressed_emails, push_subscriptions (1)
- **Catálogos por empresa (2)**: account_categories (146), venues (66)

Total seeded em 2F: ~5461 linhas → Mundo Propício.

### Mantidas globais (intencionalmente sem company_id)
- `cities` (catálogo geográfico universal)
- `role_permissions` (matriz de permissões da app)
- `login_attempts` (anti-brute-force pré-autenticação)
- `companies` (tabela mãe)

## Resumo Fase 2 (A→F): 65 tabelas isoladas, ~8634 linhas seeded para Mundo Propício.

## Fase 3 — Concluída ✅ (Test) — edge functions de gestão de empresas
3 edge functions novas criadas (super-admin only, exceto a 3ª que é pública para fluxo de convite):

1. **create-company** — `platform_admin` cria nova empresa-cliente. Body: `legal_name`, `display_name`, `slug`, opcionais `tax_id`, `country`, `currency`, `timezone`, `contact_email`, `theme_config`, `address`. Defaults: PT/EUR/Europe/Lisbon, status=active.
2. **invite-company-admin** — `platform_admin` convida admin/manager para uma empresa. Gera token de 64 chars hex, válido 7 dias. Devolve `accept_url`. Insere em `company_invitations` com status=pending.
3. **accept-invitation** — pública (`verify_jwt = false`). Recebe `token` + `password` + `full_name` opcional. Valida convite (não usado, não expirado), cria utilizador no Auth (auto-confirmado, com `company_id` no metadata), faz upsert de `profiles` e `user_roles`, marca convite como accepted.

Migração suporte: `company_invitations` ganhou colunas `status` (CHECK pending/accepted/expired/revoked) e `accepted_user_id` (FK auth.users). Índice parcial em `token WHERE status='pending'`.

Edge functions existentes (30): mantêm-se compatíveis — RLS RESTRICTIVE da Fase 2 protege automaticamente todas as tabelas isoladas. Functions com service_role (database-backup, restore-*, create-user, delete-user, send-transactional-email, etc.) continuarão a operar; quando consultam tabelas com `company_id`, qualquer query escrita já filtra implicitamente via current_company_id() dos chamadores autenticados, ou opera cross-company explicitamente (caso de backups, que devem permanecer globais para o platform_admin).

## Fase 4 — Concluída ✅ (Test) — Isolamento de Storage por empresa
- Helper `public.storage_path_belongs_to_current_company(name)` — valida que `(storage.foldername(name))[1] = current_company_id()::text`, ou que o utilizador é `platform_admin`.
- Policies RESTRICTIVE em `storage.objects` (SELECT/INSERT/UPDATE/DELETE) para 11 buckets isolados:
  - `bp-version-snapshots`, `cache-extra-documents`, `camarim-documents`, `closing-cost-documents`, `implementation-files`, `import-reports`, `partner-extra-documents`, `supplier-credit-documents`, `supplier-documents`, `ticket-office-settlements`, `transaction-documents`.
- Convenção de path: `{company_id}/{...resto-do-path-original}/ficheiro.ext`.
- Buckets globais (sem isolamento por empresa): `company-branding` (público) e `database-backups` (acesso via service-role/platform_admin).
- Migração de dados em Test: ficheiros existentes foram prefixados com o id da Mundo Propício (`975254b9-6b92-4cdd-a971-36e4a4f98525`) quando ainda não estavam.
- ⚠️ Implicação no código: todos os `supabase.storage.from(bucket).upload(path, ...)` em buckets isolados precisam, na Fase 5, de prefixar o path com `${currentCompanyId}/`. As policies PERMISSIVE atuais (CRUD por role) continuam a aplicar-se por cima.

## Fase 5 — Concluída ✅ (Test) — UI multi-empresa
- **Hook `useCompany()`** (`src/hooks/useCompany.ts`): devolve a empresa ativa do utilizador (via `profiles.company_id` → `companies`), `companyId`, `isPlatformAdmin`. Cache TanStack 5min.
- **Helper de Storage** (`src/lib/storage.ts`): `uploadToCompanyBucket()`, `downloadFromCompanyBucket()`, `removeFromCompanyBucket()`, `signedCompanyUrl()`, `withCompanyPath()`. Prefixa idempotentemente `${companyId}/` nos 11 buckets isolados; ignora os 2 globais (`company-branding`, `database-backups`).
- **Refactor de uploads**: 11 call-sites passaram a usar `uploadToCompanyBucket` e a guardar o `path` retornado (já com prefixo) na DB:
  `BPAttachmentModal`, `CacheExtrasPanel`, `EventClosingCosts` (×2), `EventForecast`, `PartnerExtrasPanel`, `SupplierCreditsPanel` (×3), `TicketOfficeSettlementModal`, `TransactionDocumentsModal`, `CamarimItemModal`, `EventImplementations`. Os `download/createSignedUrl/remove` ficam inalterados — usam o path tal como armazenado.
- **Branding dinâmico** (`src/contexts/CompanyBrandingContext.tsx` + `src/components/BrandedLogo.tsx`): aplica `companies.logo_url`, `favicon_url` e overrides de `theme_config` (chaves `primary`, `primary_foreground`, `accent`, `sidebar` em formato HSL `"H S% L%"`) como CSS variables. Fallback para o logo Mundo Propício.
- **Header global** (`src/App.tsx`): substitui `<img logoMundoPropicio>` por `<BrandedLogo />`. App agora envolto em `<CompanyBrandingProvider>` (dentro de `AuthProvider`).
- **Páginas novas**:
  - `/accept-invitation?token=...` (público) — formulário para o convidado definir nome+password e ativar a conta via edge function `accept-invitation`.
  - `/admin/empresas` (super-admin only) — lista empresas, cria novas (chama `create-company`) e gera convites (`invite-company-admin`) com link copiável.
- **AdminPanel**: card "Empresas" só aparece a `platform_admin`.
- **Auth**: `AppRole` em `src/contexts/AuthContext.tsx` ganhou valor `platform_admin` (label "Super-Admin", cor rosa). `UserManagement` mapeia ícone.

### Convenção `theme_config`
JSON em `companies.theme_config`. Chaves opcionais (HSL string sem prefixo `hsl()`):
```json
{ "primary": "210 80% 50%", "primary_foreground": "0 0% 100%", "accent": "120 60% 45%", "sidebar": "220 15% 12%" }
```
Aplica-se via `documentElement.style.setProperty("--primary", ...)` no `CompanyBrandingProvider`. Limpa ao desmontar.

## Fase 6 — Concluída ✅ (Test) — Validação cross-tenant

### Validação estática (DB)
- 66 tabelas com policy RESTRICTIVE `company_isolation_<tabela>` usando `row_belongs_to_current_company(company_id)` — confirmado por `pg_policies`.
- 11 buckets de Storage com policies RESTRICTIVE × 4 (SELECT/INSERT/UPDATE/DELETE) usando `storage_path_belongs_to_current_company(name)` — INSERT tem `WITH CHECK` correto, impedindo escrever fora da pasta da empresa.
- `current_company_id()` SECURITY DEFINER lê `profiles.company_id` do `auth.uid()`.
- `is_platform_admin(uuid)` SECURITY DEFINER valida em `user_roles` (role `platform_admin`).
- Buckets globais (`company-branding`, `database-backups`) corretamente isentos de isolamento por empresa.

### Empresa de teste criada
- "Demo 2" (`6e174fca-69b6-4173-9aca-11a0a8355840`) com tema distinto para validar branding dinâmico.

### Validação dinâmica (UI — recomendada manualmente pelo utilizador)
A validação RLS end-to-end via `psql` no sandbox **não é possível** porque o role `sandbox_exec` tem `BYPASSRLS=true` e não pode mudar para o role `authenticated`. Para confirmação 100% real:

1. Em `/admin/empresas`, criar convite para a empresa "Demo 2" (e-mail próprio do tester).
2. Aceitar o convite em `/accept-invitation?token=…`, criar password.
3. Fazer login com a conta da Demo 2 e confirmar que:
   - Dashboard mostra **0 eventos / 0 transações / 0 fornecedores / 0 categorias** (a Mundo Propício tem 12/139/91/146 mas não devem aparecer).
   - O logo no header e cores trocam para o tema da Demo 2 (laranja/verde) caso `logo_url` esteja preenchido — caso contrário aparece o fallback Mundo Propício mas o `--primary` muda.
   - Tentativa de upload em qualquer documento (transação, supplier, camarim, etc.) deve criar paths em Storage prefixados com `6e174fca-…/`.
4. Fazer logout e login de volta como admin Mundo Propício — confirmar que **nada foi alterado** e os dados continuam todos visíveis.

### Limitações conhecidas
- A validação RLS automatizada via SQL no sandbox foi **inconclusiva** por limitações do role `sandbox_exec` (BYPASSRLS). A análise estática das policies é sólida e a estrutura está correta, mas a confirmação final exige passo manual via UI (acima).
- Caso o teste manual encontre vazamento, é provável que esteja num código que faz query com service_role (edge functions) sem filtrar por `company_id`. Auditar com prioridade `database-backup`, `database-restore-v2`, `selective-restore`, `surgical-restore`, `match-categories`, `audit-categories`, `generate-historical-transactions`.

## Como retomar
- **Fase 7 (Live)**: plano à parte. Será preciso (a) backup completo, (b) criar empresa "Mundo Propício" em Live, (c) `UPDATE` em todas as tabelas para gravar `company_id`, (d) mover ficheiros de Storage para pasta prefixada, (e) tornar `company_id NOT NULL` quando seguro, (f) publicar. Documento separado a criar quando der ordem.
