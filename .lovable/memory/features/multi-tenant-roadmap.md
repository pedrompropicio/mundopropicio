---
name: Multi-tenant roadmap
description: Plano e estado da transição multi-empresa (Coala Portugal/Cloudscape como 2ª empresa); Fase 1 CONCLUÍDA em Test
type: feature
---

## Estado: Fase 1 CONCLUÍDA em Test (Fases 2–7 pausadas)

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

## Como retomar
- **Fase 2A–2F (`company_id` em tabelas operacionais)**: pedir "avançar Fase 2A multi-empresa" (eventos), depois 2B (bilhética), 2C (cache), 2D (camarim), 2E (financeiro), 2F (suporte). Cada fase é uma migração separada para minimizar risco.
- **Fase 3 (edge functions)**: refactor de 30 functions + 3 novas (`create-company`, `invite-company-admin`, `accept-invitation`).
- **Fase 4 (storage paths)**: prefixo `{company_id}/` nos buckets existentes.
- **Fase 5 (UI)**: página `/admin/companies`, `useCompany()`, ThemeProvider dinâmico, logo/favicon dinâmicos.
- **Fase 6**: validação cross-tenant.
- **Fase 7**: migração Live (plano à parte).
