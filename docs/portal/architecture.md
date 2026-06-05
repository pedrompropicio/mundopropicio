# MP Suite — Arquitectura Unificada

**Versão:** 2 (28/05/2026)
**Estado:** Decisões fechadas · Em implementação
**Decisor:** Pedro Neto
**Contexto:** Conversa Claude 28/05/2026 sobre dependência de pixel de bilheteiras e risco de boicote

---

## 1. Visão de produto

Mundo Propício opera 4 produtos digitais sobre **uma única fundação de dados**. Os produtos têm UIs e responsabilidades distintas, mas partilham o mesmo Supabase central (`ukpuhoynrqobqtzdbysp`).

| Produto | Função | Audiência | Stack |
|---|---|---|---|
| **MP Gestão** | ERP — eventos, finanças, plano de contas, bilheteiras, reembolsos | Interno | Lovable Cloud (Vite SPA) |
| **MP Audience** | Marketing intelligence — Meta Ads, ROAS, diagnóstico 360, redesign de campanhas | Interno | Lovable Cloud (edge functions) |
| **MP Operação** | Produção e operação — diário de obra, frentes, registos, chamados | Interno | Lovable Cloud |
| **MP CRM** | Vendas e relacionamento — leads, pipelines, fidelização. **Inclui o portal público como camada de captação.** | Interno (backoffice) + Público (portal) | Lovable Cloud (backoffice) + Lovable modern/TanStack Start (portal público) |

## 2. O portal público é a face externa do MP CRM

`www.mundopropicio.com` deixa de ser site institucional isolado. Passa a ser:

- **Funil de captação de leads** — toda a comunicação (paga e orgânica) aterra aqui primeiro
- **Camada de pixel próprio** — independência do pixel das bilheteiras
- **Fonte de audiência primária** — base para lookalikes, retargeting, Custom Audiences no Meta
- **Catálogo de eventos rico** — objectivamente melhor que páginas de bilheteiras (que têm propaganda da concorrência)

A bilheteira deixa de ser fonte de verdade — passa a ser apenas o checkout final.

## 3. Por que isto importa: risco de boicote

Bilheteiras estão a oferecer serviço paralelo de gestão de tráfego pago cobrando percentual sobre conversão. Isto cria incentivo económico para degradarem o sinal do tráfego próprio da MP:

- Latência na propagação de eventos `purchase` para o pixel MP (mas não para o pixel deles)
- Deduplicação que descarta eventos do pixel MP em caso de colisão
- Attribution windows mais curtas no pixel MP
- Match quality (email/phone hash) propositadamente fracos
- CAPI server-side oferecido só aos clientes pagantes

Independentemente de isto vir a acontecer, o simples facto de **poderem** fazê-lo torna a infraestrutura crítica de marketing refém de terceiros com incentivo desalinhado. O portal próprio resolve isto.

## 4. Fundação de dados única

### Decisão estrutural: Supabase central como source of truth

Hoje há dois Supabases:
- `ukpuhoynrqobqtzdbysp` — MP Gestão + MP Audience (129 tabelas em `public.*`, 86 edge functions, schema `crm.*` para Meta)
- `zjseklogascfwqjoocbl` — site mundopropicio.com (schema `public.*` isolado, ~6 tabelas)

**Vamos consolidar tudo no `ukpuhoynrqobqtzdbysp`** (decisão A1). O Supabase do site é depreciado após migração.

### Fronteira de schemas — realidade do repo

A revisão técnica revelou que o ERP da MP vive todo em `public.*`, não em `crm.*`. O esquema `crm.*` está reservado ao domínio Meta (insights de campanhas, criativos, diagnóstico 360). Esta é a realidade que adoptamos:

- **`public.*`** — schema operacional. 129 tabelas (eventos, transacções, plano de contas, bilheteiras, papéis, etc.). Multi-tenant por `company_id NOT NULL` (102/129 tabelas). RLS company-scoped universal via `current_company_id()` (288 ocorrências em 73 migrations) + camada RESTRICTIVE `company_isolation_*`. **Acesso público controlado por views read-only e tabelas-proxy com RLS específica.**
- **`crm.*`** — schema do domínio Meta. `crm.meta_*` (campaigns, adsets, ads, creatives, insights diários, diagnóstico, strategies). Acesso só por edge functions com `service_role`. **Não usado pelo portal público.**

O portal **lê de views públicas** (ex.: `public.events_public`, `public.event_lineups_public`) e **escreve em tabelas-proxy** (`public.lead_capture`, `public.redirect_log`) que existem para permitir INSERT anónimo sem expor as tabelas operacionais. Detalhes técnicos em `data-model.md`.

### Tabelas novas que emergem do portal

Todas em `public.*`, com `company_id NOT NULL` para alinhar com a convenção do ERP:

- **`public.contacts`** — identidade unificada do fã (email, phone hash, consentimentos). Migra de `newsletter_subscribers` do site velho.
- **`public.leads`** — eventos de interesse (newsletter signup, redirect click, view content). Substitui `redirect_clicks` do `events` actual com modelo mais rico.
- **`public.event_lineups`** — artistas por evento (antes era prosa livre).
- **`public.event_faqs`** — perguntas frequentes por evento.

Estas tabelas alimentam o **backoffice do MP CRM** (a desenvolver) e o **MP Audience** (que ganha sinal upstream independente do pixel da bilheteira).

### Distinção crítica: consentimento de fã vs. de staff

A revisão técnica clarificou que existem **dois domínios de opt-in distintos**, que devem permanecer separados:

| Domínio | Tabela canónica | Canais | Identidade | Base legal |
|---|---|---|---|---|
| **Fã (marketing)** | `public.contacts.consent_email`/`consent_whatsapp` (novo) | Email + WhatsApp | Email/telefone anónimo | Consentimento RGPD para marketing |
| **Staff (operacional)** | `public.notification_optin` (existente, intocado) | Só WhatsApp | `profiles.id` (auth.users) | Notificações operacionais internas |

`notification_optin` continua dedicada a notificações operacionais para staff (triggers de equipa, etapas, frentes). **Não migrar consent de fãs para lá** — confundiria domínios com bases legais e identidades diferentes.

## 5. Fluxos de dados entre produtos

```
                          ┌─────────────────────┐
                          │   Supabase central  │
                          │ ukpuhoynrqobqtzdbysp │
                          └──────────┬──────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
   public.events                public.contacts             public.transactions
   public.event_dates           public.leads                public.budgets
   public.event_lineups         (audience signal)           crm.meta_* (insights)
   public.event_faqs
        │                            │
        │ via views public.*_public  │ via edge functions
        ▼                            ▼
┌──────────────────┐         ┌──────────────────┐
│  Portal Público  │ ──────► │   MP CRM (UI)    │ ◄────── MP Gestão (gerir eventos)
│ mundopropicio.com│  leads  │  backoffice MP   │
│                  │         └──────────────────┘
└──────────────────┘                  │
        │                             │
        │ pixel MP + CAPI             │ Custom Audiences (hash SHA-256)
        ▼                             ▼
┌──────────────────────────────────────────────┐
│         Meta Ads (act_5094207367314169)       │
│              ↑                                │
│              │ ROAS, insights diários         │
│              │                                │
│         ┌────┴──────┐                         │
│         │ MP Audience│                        │
│         │ diagnóstico│                        │
│         │  360, redesign                      │
│         └───────────┘                         │
└──────────────────────────────────────────────┘
```

### Quem cria, quem consome

| Entidade | Criada em | Consumida em |
|---|---|---|
| Eventos | MP Gestão (ERP) | Portal (via view), MP Audience (campanhas), MP CRM (segmentação) |
| Contactos / Leads | Portal (newsletter, redirect clicks) | MP CRM (gestão), MP Audience (Custom Audiences) |
| Transacções financeiras | MP Gestão | MP Gestão (relatórios) |
| Insights Meta (`crm.meta_*`) | MP Audience (sync edge function) | MP Audience (diagnóstico), MP Gestão (ROAS) |

## 6. Stack técnica por produto

| Produto | Hoje | Após esta evolução |
|---|---|---|
| MP Gestão | Lovable classic (Vite+React SPA) | Mantém |
| MP Audience | Lovable classic + edge functions | Mantém |
| MP Operação | Lovable classic | Mantém |
| MP CRM backoffice | (não existe) | Lovable classic, modal dentro de MP Gestão Eventos |
| **Portal público** | **Lovable classic SPA, Supabase isolado** | **Lovable modern (TanStack Start, SSR/SSG), Supabase central** |

A migração do portal para `tech_stack: "modern"` (TanStack Start) é decisão crítica para SEO e Open Graph dinâmico. Justificação detalhada em `migration-plan.md`.

## 7. Princípios arquitectónicos

1. **Source of truth única.** Cada conceito (evento, contacto, transacção) vive numa única tabela canónica em `public.*`. Tudo o resto é view ou agregação.
2. **Schemas separam domínios.** `public.*` é operacional (todo o ERP). `crm.*` é domínio Meta (insights, campanhas, diagnóstico). Sem cruzamento.
3. **Portal nunca lê tabelas operacionais directamente.** Lê de views (`public.events_public`, etc.) que projectam apenas o necessário para consumo público e filtram por `portal_visible = true`.
4. **Portal nunca escreve em tabelas operacionais directamente.** Escreve em tabelas-proxy (`public.lead_capture`, `public.redirect_log`) com RLS INSERT-anónimo. Processamento para `contacts`/`leads` corre via edge function com privilégios elevados.
5. **Convenção multi-tenant respeitada.** Tabelas novas (`contacts`, `leads`, `event_lineups`, `event_faqs`) têm `company_id NOT NULL` como o resto do ERP.
6. **Dois domínios de opt-in.** Marketing de fã → `contacts.consent_*`. Operacional de staff → `notification_optin` (intocado).
7. **Stack adequada à função.** Apps internas em Vite SPA (Lovable classic). Portal público em TanStack Start (Lovable modern) — SSR para SEO, OG dinâmico, Core Web Vitals.
8. **Mudanças em tabelas operacionais não devem partir o portal.** Garantido por camada de views `*_public` que isolam o portal de evoluções internas.

## 8. O que isto NÃO é

- Não é migração para fora do Lovable. Continua tudo no Lovable Cloud.
- Não é refactor do MP Gestão / MP Audience / MP Operação. Esses ficam como estão.
- Não é desenvolvimento de checkout próprio. Bilheteiras continuam a vender; o portal só redirecciona com tracking.
- Não é mudar a relação comercial com artistas ou bilheteiras. Eventos são da MP; bilheteira é decisão operacional.
- Não é unificar `notification_optin` com `contacts`. São domínios separados (operacional staff vs. marketing fã).
