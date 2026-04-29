---
name: Multi-tenant roadmap
description: Plano aprovado para transição multi-empresa (single DB + company_id + RLS) — PAUSADO antes da Fase 1
type: feature
---

# Multi-tenant roadmap (PAUSADO)

Plano completo em `.lovable/plan.md`. Retomar com "avançar Fase 1 multi-empresa".

## Arquitectura aprovada
- **Isolamento**: Single DB + coluna `company_id` em ~73 tabelas + RLS via `current_company_id()` (SECURITY DEFINER lendo `profiles.company_id` do utilizador autenticado).
- **Utilizador ↔ Empresa**: 1 utilizador = 1 empresa (relação directa em `profiles.company_id`). Super-admin terá conta separada por empresa se precisar.
- **Branding por empresa**: Logo + cores + favicon via `companies.theme_config` (JSONB) injectado por `ThemeProvider` em CSS variables. Nome do app é FIXO "MP Gestão Eventos" — só varia branding da empresa cliente.
- **Plano de contas e config**: Tudo isolado por empresa.
- **Onboarding**: Super-admin (`platform_admin` role) cria empresas via `/admin/companies` e convida admin de cada uma. Sem self-signup.
- **Dados existentes**: Test fica vazio para validar arquitectura; migração de Live é plano separado (F7).

## Fases (resumo)
1. **F1 — Foundations**: tabelas `companies`, `company_invitations`, função `current_company_id()`, role `platform_admin`.
2. **F2 — Schema**: adicionar `company_id NOT NULL` a ~73 tabelas em 6 migrações agrupadas + reescrever ~150 RLS policies.
3. **F3 — Edge Functions**: refactor de ~30 functions para resolver `company_id` do JWT.
4. **F4 — Storage**: buckets passam a estrutura `{company_id}/path/` + policies novas.
5. **F5 — UI super-admin**: `/admin/companies`, convites, editor de branding, ThemeProvider dinâmico.
6. **F6 — Validação Test**: criar empresas seed, testar isolamento, queries cruzadas, exportações, relatórios.
7. **F7 — Migração Live**: plano separado — criar empresas em Live, UPDATE em todas as tabelas, validação dupla.

## Empresas previstas (até 3 inicialmente)
1. **Coala Portugal** — entidade legal: **CLOUDSCAPE EVENTOS E PRODUCOES ARTISTICAS LDA** (será a primeira a entrar em produção multi-empresa).
2. (a definir)
3. (a definir)

## Estado actual
**PAUSADO** antes da F1. Retomar quando o utilizador pedir explicitamente.
