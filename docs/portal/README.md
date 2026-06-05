# Portal MP — Documentação

Toda a documentação relativa à evolução de `www.mundopropicio.com` para portal MP CRM (face externa do produto MP CRM da MP Suite) e à consolidação dos dois Supabases num só.

**Versão:** 2 (28/05/2026) — incorpora correcções de duas revisões técnicas do Claude Code sobre schema real, convenções multi-tenant, e segurança RLS.

## Documentos

| Doc | O quê |
|---|---|
| [`architecture.md`](./architecture.md) | Visão dos 4 produtos MP, fronteiras, decisões estruturais |
| [`data-model.md`](./data-model.md) | Schema-alvo em `public.*`, tabelas novas, views, RLS |
| [`mvp-spec.md`](./mvp-spec.md) | Especificação da página individual de evento (MVP médio) |
| [`migration-plan.md`](./migration-plan.md) | Plano faseado: stack → Supabase → MVP. Checkpoints e rollback Lovable-aware |
| [`email-bilheteiras.md`](./email-bilheteiras.md) | Esboço de email para levantamento técnico das bilheteiras |

## Decisões fechadas

### Decisões estruturais (conversa 28/05)
- **A1** — Site adopta o Supabase central (`ukpuhoynrqobqtzdbysp`)
- **B** — Migração de stack do portal para TanStack Start (Lovable modern) **primeiro**, antes de criar página individual de evento
- **C** — MVP médio: rica em conteúdo (line-up, FAQ, mapa, press, lead capture)
- Sequência: Fase 1 stack → Fase 2 Supabase → Fase 3 MVP da página de evento

### Decisões técnicas (revisões Code)
- **Q1** — Schema-alvo é `public.*` (não `crm.*`). `crm.*` mantém-se exclusivo para domínio Meta. `public.events` é a tabela canónica.
- **Q2** — Mapear admin do site velho para `public.user_roles` existente com enum `app_role`. Não criar tabela nova.
- **Q3** — `is_past` calculado na view (`date < current_date`), não como coluna gerada (Postgres rejeita `now()` em GENERATED).
- **Q4** — Renomear stubs `docs/DATABASE.md` → `docs/whatsapp-notifications-db.md` e `docs/SCREENS.md` → `docs/whatsapp-notifications-screens.md` no mesmo commit (nome enganador; SoT é a raiz).
- **Q5** — Rollback Lovable-aware: revert SQL idempotente + re-deploy explícito de edge functions + revert de `.env`/queries via agente Lovable. Não há "git revert resolve tudo".
- **+1** — `company_id NOT NULL REFERENCES companies(id)` nas 4 tabelas novas. `event_lineups`/`event_faqs` com `DEFAULT current_company_id()`. `contacts`/`leads` SEM default — escritos por service_role a partir de `lead_capture` anónimo, processador define explicitamente o UUID da MP.
- **+2** — Opt-in canónico separa dois domínios:
  - Fãs (marketing): `contacts.consent_email`/`consent_whatsapp` é canónico; histórico de mudanças em log próprio ou via `crm.leads`.
  - Staff (operacional WhatsApp): `notification_optin` existente fica intocado, exclusivo para `profiles` (auth users internos).

## Sequência de execução

1. Pedro lê toda a documentação e confirma ou pede ajustes
2. Quando estiver pronto, dispatcha Fase 1 (prompt para Lovable agent do projecto `mundopropicioweb`)
3. Cada fase: prompt → execução → checkpoint → Publish → confirmação Pedro antes da próxima

Email para bilheteiras pode ir em paralelo a qualquer fase.

## O que NÃO está aqui

- Decisões comerciais com artistas/bilheteiras (não há)
- Roadmap do backoffice MP CRM (vem depois do portal estar estável)
- Roadmap de outras peças MP Audience (continuam em `docs/integrations/` e `docs/architecture/`)
- Spec do CAPI server-side (esboçado em `mvp-spec.md`, detalhe técnico fica para Fase 3)
