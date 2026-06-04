# MP Suite — Modelo de Dados Unificado

**Versão:** 2 (28/05/2026) — reescrito após revisões técnicas (schema real, multi-tenant, RLS)
**Referência:** `architecture.md` (Secção 4 — Fundação de dados única)
**Estado:** Desenho · Pronto para execução em Fase 2 da migração

---

## 1. Schema actual vs. schema-alvo

### Schema actual

**Supabase central `ukpuhoynrqobqtzdbysp` (MP Gestão + MP Audience) — tabelas relevantes:**
- `public.events` — schema operacional. Colunas: `id, name, date (DATE), location, status, budget, tickets_sold, tickets_total, company_id, city_id, venue_id, event_type, parent_event_id, operacao_mode, pl_mode, partner_calc_basis, absorbs_admin_costs, admin_window_start/end, import_template, last_sales_date, ticketing_provider, ticketing_url, ticketline_event_id, created_at, updated_at`
- `public.event_dates` — `id, event_id, date, label, created_at`
- `public.user_roles` — com enum `app_role` (`platform_admin/admin/manager/editor/viewer/accountant/partner`)
- `public.notification_optin` — opt-in operacional WhatsApp para staff (`profile_id`, `phone_number`, `opted_in_at/opted_out_at`). **Intocado, não usado pelo portal.**
- `public.companies` — tabela canónica de tenants
- `crm.meta_*` — domínio Meta (campanhas, insights, criativos, diagnóstico). **Não usado pelo portal.**

**Supabase site `zjseklogascfwqjoocbl` (a depreciar):**
- `public.events` — schema simples (title_pt/en, description_pt/en, date, location, image, ticket_url, slug, redirect_clicks, featured, hidden, is_past)
- `public.newsletter_subscribers` — email, name, phone, consent_email, consent_whatsapp, is_active
- `public.blog_posts` — bilingue
- `public.press_clippings`
- `public.site_content` — JSON bilingue por page_key
- `public.user_roles` — admin/moderator/user (vocabulário texto)

### Schema-alvo (consolidado em `ukpuhoynrqobqtzdbysp`, tudo em `public.*`)

```
public.*  (operacional, RLS company-scoped via current_company_id() + camada RESTRICTIVE)

Tabelas existentes a ESTENDER:
├── public.events                ← extensão com campos bilingues, slug, portal_*
├── public.event_dates           ← reutilizar como está
├── public.user_roles            ← reutilizar enum app_role existente
├── public.notification_optin    ← INTOCADO (staff operacional, não fã)
└── public.companies             ← reutilizar (UUID da MP é o tenant default)

Tabelas existentes a REUTILIZAR (migração de dados do site velho):
├── public.blog_posts            ← já existe? Verificar; se não, criar
├── public.site_content          ← idem
└── public.press_clippings       ← idem (ou consolidar como public.event_press_clippings)

Tabelas NOVAS:
├── public.contacts              ← identidade unificada do fã (marketing)
├── public.leads                 ← eventos de interesse (newsletter, click, view_content)
├── public.event_lineups         ← line-up estruturado por evento
└── public.event_faqs            ← FAQ por evento

Camada de exposição pública (VIEWS, owner privilegiado, security_invoker=false):
├── public.events_public         ← filtra portal_visible=true, formato simples
├── public.event_lineups_public  ← join via event_id
├── public.event_faqs_public     ← join via event_id
├── public.event_press_public    ← join via event_id
├── public.blog_posts_public     ← só published=true
└── public.site_content_public

Tabelas-proxy (RLS INSERT-only anónimo, processadas por edge function):
├── public.lead_capture          ← portal escreve aqui; edge function processa para contacts+leads
└── public.redirect_log          ← portal escreve aqui; edge function processa para leads
```

## 2. Tabelas-chave em detalhe

### Pré-requisitos

Antes de qualquer DDL, validar:

```sql
-- 1. Confirmar pgcrypto activa (para digest() nos hashes SHA-256)
SELECT * FROM pg_extension WHERE extname = 'pgcrypto';
-- Se não estiver: CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Confirmar schema real de public.events
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'events'
ORDER BY ordinal_position;

-- 3. Confirmar enum app_role e roles existentes
SELECT enum_range(NULL::app_role);
SELECT id, role, profile_id FROM public.user_roles WHERE role = 'admin';

-- 4. Confirmar current_company_id() disponível e UUID da MP
SELECT id, name FROM public.companies WHERE name ILIKE '%mundo%';
-- Guardar UUID da MP para uso explícito em contacts/leads (ver §2.4)
```

### 2.1 `public.events` (extensão)

Adicionar (idempotente):

```sql
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS title_pt text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS title_en text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS description_pt text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS description_en text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location_pt text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location_en text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS hero_image_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS poster_image_url text;  -- og:image 1200x630
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_map_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_directions_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS portal_visible boolean NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS portal_featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS meta_pixel_id text;  -- per-event Meta Pixel ID (Sprint 1)

-- Unique constraint em slug, deferida (permite NULL para eventos legacy sem slug)
CREATE UNIQUE INDEX IF NOT EXISTS events_slug_unique_idx
  ON public.events(slug) WHERE slug IS NOT NULL;
```

**Notas importantes:**

- Coluna de data canónica é **`date` (DATE)**, **não `start_date`**. Toda a view/cálculo usa `date`.
- Título canónico para eventos legacy é **`name`** (NOT NULL existente). A view deve usar `coalesce(title_pt, name)` para garantir resultado não-nulo.
- `ticketing_url` (existente) é o destino do redirector. **Não criar `ticket_url` duplicado.**
- `is_past` **NÃO é coluna gerada** (Postgres rejeita `now()` em `GENERATED`, pois não é IMMUTABLE). Calculado na view (`date < current_date AS is_past`).
- Backfill de `slug` para eventos existentes que vão para o portal: fazer separadamente em script de migração, garantindo unicidade (slugify de `name` + sufixo se conflito).

### 2.2 `public.event_lineups` (nova)

```sql
CREATE TABLE IF NOT EXISTS public.event_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  artist_name text NOT NULL,
  artist_image_url text,
  artist_bio_pt text,
  artist_bio_en text,
  stage text,                     -- 'principal', 'secundário', etc.
  performance_date timestamptz,
  performance_time time,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_lineups_event_order_idx
  ON public.event_lineups(event_id, display_order);
CREATE INDEX IF NOT EXISTS event_lineups_company_idx
  ON public.event_lineups(company_id);

-- RLS: alinhar com convenção multi-tenant do ERP
ALTER TABLE public.event_lineups ENABLE ROW LEVEL SECURITY;
-- (policies company-scoped + camada company_isolation_*, conforme padrão das 102 tabelas)
```

### 2.3 `public.event_faqs` (nova)

```sql
CREATE TABLE IF NOT EXISTS public.event_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  question_pt text NOT NULL,
  question_en text,
  answer_pt text NOT NULL,
  answer_en text,
  category text,                  -- 'acessos', 'idade', 'bagagem', 'food', etc.
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_faqs_event_order_idx
  ON public.event_faqs(event_id, display_order);

ALTER TABLE public.event_faqs ENABLE ROW LEVEL SECURITY;
-- (policies como acima)
```

### 2.4 `public.contacts` (nova) — identidade unificada do fã

```sql
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  -- NOTA: SEM default current_company_id() — escrito por service_role
  -- sem contexto de company. Processador define explicitamente o UUID da MP.

  email text,
  phone_e164 text,
  name text,

  -- Hashes SHA-256 para Meta Custom Audiences (envio directo sem re-hash)
  email_hash_sha256 text GENERATED ALWAYS AS (
    CASE WHEN email IS NOT NULL
      THEN encode(digest(lower(trim(email)), 'sha256'), 'hex')
      ELSE NULL
    END
  ) STORED,
  phone_hash_sha256 text GENERATED ALWAYS AS (
    CASE WHEN phone_e164 IS NOT NULL
      THEN encode(digest(phone_e164, 'sha256'), 'hex')
      ELSE NULL
    END
  ) STORED,

  -- Consentimento de MARKETING (distinto de notification_optin que é operacional)
  consent_email boolean NOT NULL DEFAULT false,
  consent_whatsapp boolean NOT NULL DEFAULT false,
  consent_email_at timestamptz,
  consent_whatsapp_at timestamptz,

  is_active boolean NOT NULL DEFAULT true,
  source text,                    -- 'portal_newsletter', 'portal_event_lead', 'import_old_site', etc.
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Constraints UNIQUE separadas (email e phone podem ser NULL independentemente)
CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_unique_idx
  ON public.contacts(company_id, lower(trim(email))) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_phone_unique_idx
  ON public.contacts(company_id, phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_email_hash_idx ON public.contacts(email_hash_sha256);
CREATE INDEX IF NOT EXISTS contacts_phone_hash_idx ON public.contacts(phone_hash_sha256);
CREATE INDEX IF NOT EXISTS contacts_source_idx ON public.contacts(source);
CREATE INDEX IF NOT EXISTS contacts_company_idx ON public.contacts(company_id);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
-- (policies company-scoped + camada company_isolation_*)
```

**Notas críticas:**

- **`company_id` NOT NULL SEM default** — porque a escrita vem de `service_role` a partir de `lead_capture` anónimo, e nesse contexto `current_company_id()` retorna NULL. Edge function processadora define o UUID da MP explicitamente (constante).
- **Upsert por email OR phone NÃO é trivial.** Há duas constraints UNIQUE separadas. `ON CONFLICT (email)` resolve um caso, `ON CONFLICT (phone_e164)` resolve outro, mas não os dois numa só instrução. Ver lógica explícita em §3.2.
- `pgcrypto` é pré-requisito para `digest()` nos hashes generated (ver §2 pré-requisitos).
- Consentimento aqui é **de marketing** (RGPD para email/WhatsApp promocional). **Não confundir com `public.notification_optin`** (operacional, staff interno).

### 2.5 `public.leads` (nova) — eventos de interesse

```sql
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  -- SEM default, mesma razão de contacts

  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,

  kind text NOT NULL,             -- 'newsletter_signup', 'event_interest',
                                  -- 'redirect_click', 'view_content', 'initiate_checkout'
  source text,                    -- 'portal_home', 'portal_event_page', 'portal_event_card', etc.

  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,

  mp_click_id text,               -- para reconciliação futura com webhooks de bilheteira
  ip_inet inet,
  user_agent text,
  fbc text,                       -- Facebook click ID (CAPI dedup)
  fbp text,                       -- Facebook browser ID

  meta jsonb,                     -- extensível
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_contact_idx ON public.leads(contact_id);
CREATE INDEX IF NOT EXISTS leads_event_idx ON public.leads(event_id);
CREATE INDEX IF NOT EXISTS leads_kind_created_idx ON public.leads(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_mp_click_idx ON public.leads(mp_click_id) WHERE mp_click_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_company_idx ON public.leads(company_id);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
-- (policies company-scoped + camada company_isolation_*)
```

`public.leads` serve duplo propósito: (a) sinal operacional para o MP CRM (segmentar contactos por interesse), (b) histórico append-only de consentimento de fã (via `kind='newsletter_signup'`) para auditoria RGPD sem precisar de tabela `consent_log` separada.

### 2.6 Views para consumo do portal

Todas as views são criadas por owner privilegiado com `security_invoker = false`, e expostas a `anon` via `GRANT SELECT`. Isto isola o `anon` das tabelas-base sem o forçar a ter privilégios directos.

```sql
CREATE OR REPLACE VIEW public.events_public
WITH (security_invoker = false) AS
SELECT
  e.id,
  e.slug,
  COALESCE(e.title_pt, e.name) AS title_pt,        -- fallback para eventos legacy
  COALESCE(e.title_en, e.name) AS title_en,
  e.description_pt,
  e.description_en,
  COALESCE(e.location_pt, e.location) AS location_pt,
  COALESCE(e.location_en, e.location) AS location_en,
  e.date,                                          -- coluna real (não start_date)
  e.hero_image_url,
  e.poster_image_url,
  e.venue_map_url,
  e.venue_directions_url,
  e.ticketing_url,                                 -- coluna real existente
  e.meta_pixel_id,                                 -- Sprint 1, per-event pixel
  e.portal_featured AS featured,
  (e.date < current_date) AS is_past               -- cálculo na view, não generated
FROM public.events e
WHERE e.portal_visible = true
  AND e.slug IS NOT NULL;

GRANT SELECT ON public.events_public TO anon, authenticated;
```

Análogas para `event_lineups_public`, `event_faqs_public`, `event_press_public`, `blog_posts_public`, `site_content_public` (join via `event_id`/`slug`, filtros equivalentes).

### 2.7 Tabelas-proxy para INSERT anónimo

O portal **escreve em proxies** com RLS específica, nunca directamente em `contacts`/`leads`.

```sql
CREATE TABLE IF NOT EXISTS public.lead_capture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone text,
  name text,
  consent_email boolean NOT NULL DEFAULT false,
  consent_whatsapp boolean NOT NULL DEFAULT false,
  event_slug text,                -- se lead de evento específico
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  fbc text,
  fbp text,
  ip_inet inet,
  user_agent text,
  raw jsonb,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  processing_error text,          -- para debug se processador falhar
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_capture ENABLE ROW LEVEL SECURITY;

-- anon SÓ pode inserir, nada mais
CREATE POLICY lead_capture_anon_insert ON public.lead_capture
  FOR INSERT TO anon WITH CHECK (true);
-- sem SELECT/UPDATE/DELETE para anon

-- service_role tem acesso total (default)
```

```sql
CREATE TABLE IF NOT EXISTS public.redirect_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug text NOT NULL,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  mp_click_id text,
  ip_inet inet,
  user_agent text,
  referrer text,
  fbc text,
  fbp text,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.redirect_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY redirect_log_anon_insert ON public.redirect_log
  FOR INSERT TO anon WITH CHECK (true);
```

## 3. Processamento de leads e redirects

### 3.1 Decisão arquitectónica: edge function, não trigger

**Não usar trigger DB para processar `lead_capture` → `contacts`/`leads`.** Razões:

- Trigger executaria com privilégios do chamador (`anon`), que não pode escrever em `contacts`/`leads`. Exigiria função `SECURITY DEFINER` — possível, mas adiciona complexidade.
- `pg_net`/`net.http_post` em trigger para CAPI tem timeout curto e fire-and-forget; não fiável.
- Edge function permite logging, retries, observabilidade, e desacopla o caminho síncrono do utilizador (insert no portal devolve rápido; processamento é assíncrono).

**Padrão adoptado:** edge function `process-lead-capture` (e análoga `process-redirect-log`), invocada por:
- **Trigger leve** que faz `net.http_post` fire-and-forget para a edge function ao INSERT (sem esperar resposta)
- **Cron de catch-up** (a cada 5min) que processa `processed = false` mais antigos que 1min (rede de segurança caso trigger falhe)

### 3.2 Lógica do processador (`process-lead-capture`)

Para cada `lead_capture` com `processed = false`:

```typescript
const MP_COMPANY_ID = 'UUID-DA-MUNDO-PROPICIO';  // constante, do .env da edge function

// 1. Procurar contact existente (email OU phone)
let contact = await supabase
  .from('contacts')
  .select('*')
  .eq('company_id', MP_COMPANY_ID)
  .eq('email', normalizeEmail(lc.email))
  .maybeSingle();

if (!contact && lc.phone) {
  contact = await supabase
    .from('contacts')
    .select('*')
    .eq('company_id', MP_COMPANY_ID)
    .eq('phone_e164', normalizePhone(lc.phone))
    .maybeSingle();
}

// 2. Insert ou update
if (contact) {
  await supabase.from('contacts').update({
    name: lc.name || contact.name,
    phone_e164: contact.phone_e164 || normalizePhone(lc.phone),
    email: contact.email || normalizeEmail(lc.email),
    consent_email: contact.consent_email || lc.consent_email,
    consent_whatsapp: contact.consent_whatsapp || lc.consent_whatsapp,
    consent_email_at: lc.consent_email && !contact.consent_email ? new Date() : contact.consent_email_at,
    consent_whatsapp_at: lc.consent_whatsapp && !contact.consent_whatsapp ? new Date() : contact.consent_whatsapp_at,
    last_activity_at: new Date(),
  }).eq('id', contact.id);
} else {
  contact = await supabase.from('contacts').insert({
    company_id: MP_COMPANY_ID,      // EXPLÍCITO
    email: normalizeEmail(lc.email),
    phone_e164: normalizePhone(lc.phone),
    name: lc.name,
    consent_email: lc.consent_email,
    consent_whatsapp: lc.consent_whatsapp,
    consent_email_at: lc.consent_email ? new Date() : null,
    consent_whatsapp_at: lc.consent_whatsapp ? new Date() : null,
    source: lc.source || 'portal_newsletter',
  }).select().single();
}

// 3. Insert lead event (sempre, append-only)
const eventId = lc.event_slug
  ? (await supabase.from('events').select('id').eq('slug', lc.event_slug).single())?.data?.id
  : null;

await supabase.from('leads').insert({
  company_id: MP_COMPANY_ID,        // EXPLÍCITO
  contact_id: contact.id,
  event_id: eventId,
  kind: lc.event_slug ? 'event_interest' : 'newsletter_signup',
  source: lc.source,
  utm_source: lc.utm_source,
  utm_medium: lc.utm_medium,
  utm_campaign: lc.utm_campaign,
  utm_content: lc.utm_content,
  fbc: lc.fbc,
  fbp: lc.fbp,
  ip_inet: lc.ip_inet,
  user_agent: lc.user_agent,
});

// 4. CAPI Meta (paralelo, ver mvp-spec.md)
await sendCapiLead({ contact, event_id: eventId, ... });

// 5. Marcar processado
await supabase.from('lead_capture').update({
  processed: true,
  processed_at: new Date(),
}).eq('id', lc.id);
```

### 3.3 Idempotência e ordem

- Cada `lead_capture` tem `id` único; processador é idempotente por `id`.
- Race condition entre dois inserts simultâneos do mesmo email: resolvida pelos índices UNIQUE em `contacts(company_id, lower(trim(email)))` — segundo insert falha, processador apanha o existente e faz update.
- Mensagens fora-de-ordem (lead com mesmo email chegar 2x): consentimento é OR (uma vez concedido, mantém-se). Histórico em `leads`.

## 4. RLS e segurança — resumo

| Tabela | RLS / Acesso |
|---|---|
| `public.events` (e estendida) | Convenção existente do ERP: company-scoped via `current_company_id()` + `company_isolation_*` |
| `public.event_lineups`, `event_faqs` | Mesma convenção; INSERT/UPDATE/DELETE por admin/editor; SELECT via view pública para anon |
| `public.contacts`, `public.leads` | Mesma convenção; SELECT só para admin/editor; INSERT/UPDATE só por service_role (edge function) |
| `public.lead_capture`, `public.redirect_log` | INSERT to anon; sem SELECT/UPDATE/DELETE para anon; service_role tem tudo |
| `public.*_public` (views) | `security_invoker=false`, owner privilegiado, `GRANT SELECT TO anon, authenticated` |
| `public.notification_optin` | **Intocado** — continua a servir staff operacional |

## 5. Plano de migração de dados

### Fase 0 — Preparação (sem mudanças destrutivas)

1. Validar pré-requisitos (§2): pgcrypto, schema real de `events`, enum `app_role`, UUID da MP em `companies`.
2. Criar tabelas novas: `contacts`, `leads`, `event_lineups`, `event_faqs`.
3. Estender `public.events` (idempotente).
4. Criar views `*_public` com owner privilegiado.
5. Criar `lead_capture`, `redirect_log` com RLS INSERT-anónimo.
6. Criar edge functions `process-lead-capture`, `process-redirect-log`, `capi-meta-events`.
7. Backfill de `slug` em `public.events` para eventos que vão ao portal (script controlado, com unicidade garantida).

### Fase 1 — Migração de dados do site velho

Edge function pontual `migrate-old-site-to-central`. Lê de `zjseklogascfwqjoocbl` (REST com chave anon), escreve em `ukpuhoynrqobqtzdbysp` (service_role). **Idempotente em re-runs:**

1. `public.events` (site velho) → match por slug em `public.events` (central). Se existir: update dos campos do portal (`title_pt/en`, `description_pt/en`, `hero_image_url`, `poster_image_url`, `slug`, `portal_visible=true`). Se não existir: pode ter sido criado só no site sem espelho no ERP — INSERT com `company_id = MP_UUID` e flags do portal.
2. `public.newsletter_subscribers` → `public.contacts` (matching por email; insert com `source='import_old_site'`).
3. `public.blog_posts` → `public.blog_posts` (verificar se já existe no central; criar se não).
4. `public.press_clippings` → `public.event_press_clippings` ou tabela equivalente.
5. `public.site_content` → `public.site_content`.
6. `public.user_roles` (site) → `public.user_roles` (central) com role `admin` no enum `app_role` para o profile de Pedro.

**Validação:** contagens antes/depois batem; spot-check de 5 eventos manuais; logs sem erros.

### Fase 2 — Repointing do site

Conforme `migration-plan.md`. Resumo:

1. `.env` do projecto site → credenciais do central.
2. Regenerar `types.ts` para o schema central.
3. Substituir queries:
   - `from("events")` → `from("events_public")`
   - `from("newsletter_subscribers").insert(...)` → `from("lead_capture").insert(...)`
   - `rpc("increment_event_redirect_clicks", ...)` → `from("redirect_log").insert({ kind: 'redirect_click', ... })`
4. Reescrever `/admin` para escrever em `public.events` (e tabelas relacionadas) via edge function com `SECURITY DEFINER` que valida `app_role` antes de aceitar a operação.

### Fase 3 — Cleanup

30 dias após repointing estável:
- `zjseklogascfwqjoocbl` em read-only (snapshot final)
- Eliminação do projecto antigo após período de carência

## 6. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Drift entre `public.events` e `public.events_public` | View regenerada por migration; teste de integridade automático no CI |
| Lead capture spam (insert anónimo aberto) | Rate limit por IP na edge function; CAPTCHA opcional no form se necessário |
| Schema de `public.events` actual diverge do esperado em runtime | Validação em Fase 0 (§2 pré-requisitos) antes de aplicar; `ADD COLUMN IF NOT EXISTS` é idempotente |
| `pgcrypto` não activa | Validar em pré-requisitos; `CREATE EXTENSION IF NOT EXISTS pgcrypto` se preciso |
| `company_id` NULL em `contacts`/`leads` por bug no processador | Constraint `NOT NULL` falha o insert; logado em `lead_capture.processing_error` para retry |
| View `security_invoker=true` por defeito da plataforma | Especificar explicitamente `security_invoker = false` no CREATE; testar com user `anon` antes de produção |
| Trigger leve usa `pg_net` (mesmo limitações do que se evitou em processamento) | Trigger é só notificação fire-and-forget para edge function; cron de catch-up garante eventual consistência |
| Eventos no ERP (multi-dia, parent_event_id) vs eventos no site (1 evento/dia) | View `events_public` filtra por `portal_visible=true`; admin decide o que aparece. `event_dates_public` expõe sub-datas se preciso. |
| Auth do admin do site quebra após repointing | Pré-mapear `profile_id` de Pedro em `public.user_roles` (central) com `role='admin'` ANTES do repointing |
| Migração re-run cria duplicados | Matching por slug (events) e por email/phone (contacts) garante idempotência |

## 7. Convenção que NÃO se segue (com justificação)

- **`contacts`/`leads` SEM `DEFAULT current_company_id()`.** As 102 tabelas com convenção têm esse default, mas funciona porque são escritas com contexto de auth user. `contacts`/`leads` são escritas por `service_role` sem contexto — `current_company_id()` retorna NULL. Solução: `NOT NULL` sem default; processador define explicitamente o UUID da MP.
