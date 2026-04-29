---
name: Multi-tenant roadmap
description: Plano e estado da transição multi-empresa (Coala/Cloudscape como 2ª empresa); Fase 2 (schema) COMPLETA em Test
type: feature
---

## Estado: Fase 1 + Fase 2 (A→F) COMPLETAS em Test (Fases 3–7 pendentes)

Plano completo em `.lovable/plan.md`. Decisões fechadas:
- Single DB + `company_id` em tabelas core + RLS rigorosa
- 1 utilizador = 1 empresa (`profiles.company_id`)
- Branding por empresa (logo + cores + favicon), nome do app FIXO "MP Gestão Eventos"
- Plano de contas isolado por empresa
- Super-admin (`platform_admin`) cria empresas e convida admins
- Test fica vazio durante dev; Live migra-se na Fase 7

## Empresas previstas
1. **Mundo Propício, Lda** (PT, EUR) — empresa atual, slug `mundo-propicio`
2. **CLOUDSCAPE EVENTOS E PRODUCOES ARTISTICAS LDA** (Coala Portugal) — 1ª empresa-cliente externa

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

## Como retomar
- **Fase 3 (edge functions)**: refactor de 30 functions + 3 novas (`create-company`, `invite-company-admin`, `accept-invitation`).
- **Fase 4 (storage paths)**: prefixo `{company_id}/` nos buckets existentes.
- **Fase 5 (UI)**: página `/admin/companies`, `useCompany()`, ThemeProvider dinâmico, logo/favicon dinâmicos.
- **Fase 6**: validação cross-tenant.
- **Fase 7**: migração Live (plano à parte).
