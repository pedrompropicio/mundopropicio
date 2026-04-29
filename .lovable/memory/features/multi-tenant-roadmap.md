---
name: Multi-tenant roadmap (pausado)
description: Planeamento aprovado para transformar MP Gestão Eventos em multi-empresa; aguarda arranque da Fase 1
type: feature
---

Plano completo em `.lovable/plan.md`. Decisões fechadas:
- Single DB + `company_id` em todas as tabelas core + RLS por `current_company_id()`.
- Branding por empresa (logo + cores + favicon). Nome do app fixo "MP Gestão Eventos".
- Plano de contas e config isolados por empresa.
- 1 utilizador = 1 empresa (`profiles.company_id`). Super-admin (`platform_admin`) cria empresas e convida admins.
- Test fica vazio durante desenvolvimento; Live migra-se em plano separado (Fase 7).

Faseamento:
- F1 Fundamentos (companies, company_invitations, current_company_id(), platform_admin, bucket company-branding)
- F2A–F2F adicionar company_id a ~73 tabelas em 6 grupos
- F3 Edge functions (helper get-company-id + refactor das 30 + 3 novas: create-company, invite-company-admin, accept-invitation)
- F4 Storage com prefixo {company_id}/
- F5 UI (/admin/companies, useCompany(), ThemeProvider dinâmico)
- F6 Validação isolamento em Test
- F7 Migração Live (plano à parte)

Estado atual: **PAUSADO antes da Fase 1**. Retomar pedindo "avançar Fase 1 multi-empresa".
