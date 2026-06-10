# Google Ads — integração MP Audience

> Integração Google Ads do MP Audience, em paralelo ao domínio Meta já existente
> (`crm.meta_*`). Atribuição de clique (GCLID), conversões offline via Data Manager
> API, e espelho de campanhas. Esta página documenta as **decisões do Sprint 1**.

| | |
|---|---|
| **Estado** | 🟡 Sprint 1 (sem credenciais Google API) |
| **Schema** | `crm.google_*` (espelha o padrão `crm.meta_*`) |
| **Módulo cliente** | MP Audience / MP CRM |
| **Sprint 1 entrega** | Schema + captura GCLID + esqueleto admin |
| **Sprint 2 (pendente)** | Envio de conversões, sync de campanhas, Customer Match |

---

## 1. Âmbito do Sprint 1

Apenas peças que **NÃO dependem de credenciais da Google API**:

1. **Schema `crm.google_*`** — migration `supabase/migrations/20260610011843_e60a623e-9f5a-4791-9c90-4f2333bb2b3d.sql`
   (nunca via SQL Editor).
2. **Captura de GCLID na landing** — ver §4 (depende de onde vive o Portal).
3. **Esqueleto da área admin `/crm/google-ads`** — navegação + placeholders, sem lógica de API.

Fora de âmbito (Sprint 2): tudo o que toca a Google Ads API / Data Manager API.

---

## 2. Schema `crm.google_*`

Espelha o padrão `crm.meta_*`: RLS `tenant_isolation_{select,insert,update}` +
`service_role_bypass`; GRANT `USAGE` no schema `crm` + `SELECT/INSERT/UPDATE` a
`authenticated` **e** `service_role`; `last_synced_at` explícito nas tabelas-espelho;
`raw jsonb`. Multi-tenant por `company_id = public.current_company_id()`.

### 2.1 `crm.google_click` — atribuição de clique
Capturada na landing. Campos não-negociáveis:
- `gclid` / `gbraid` / `wbraid` `varchar(255)` — **exatamente um** preenchido
  (CHECK `google_click_exactly_one_id`). `gclid` é **case-sensitive** (não normalizar).
- `landing_url`, `referrer`, `utm_source/medium/campaign/content/term`.
- `event_id` → `public.events` (quando a landing é de um evento; nullable).
- `client_event_id` (UUID client-side, à maneira do Portal) e `lead_capture_id`
  (→ `public.lead_capture`) para correlação com lead/sessão.
- `consent_granted` — estado de consentimento na captura (gating igual ao pixel/CAPI).
- `captured_at` (default `now()`), `expires_at` = `captured_at + 90 dias`
  (janela de atribuição Google), preenchido por **trigger** `BEFORE INSERT/UPDATE`
  (`crm.google_click_set_expires`). NÃO é coluna gerada: `timestamptz + interval`
  usa `timestamptz_pl_interval`, que é STABLE e não pode estar numa coluna
  `GENERATED` (erro Postgres 42P17).

### 2.2 `crm.google_conversion` — fila de conversões (Sprint 2 popula)
Espelha o envio de `purchase` do CAPI:
- `conversion_action_ref` (conversion action da Google).
- `gclid` / `gbraid` / `wbraid` (exatamente um) + `google_click_id` (→ `google_click`).
- `conversion_value`, `currency_code`, `conversion_datetime`.
- `order_id` = **`transaction_id` da venda** (Ticketline/Fever) — chave de dedupe.
  UNIQUE `(company_id, conversion_action_ref, order_id)` evita envio duplicado.
- `status` `pending|sent|failed`, `data_manager_job_id`, `error_detail`, `sent_at`.

### 2.3 Tabelas-espelho (esqueleto; Sprint 2 popula)
`crm.google_campaign`, `crm.google_ad_group`, `crm.google_keyword`,
`crm.google_asset_group`. Hierarquia Google: Campaign → Ad Group →
(Keyword p/ Search | Asset Group p/ Performance Max). `customer_id` = conta Google
Ads (análogo a `ad_account_id` no Meta); budgets/contadores em **micros**.
Tal como `crm.meta_campaign_snapshot`, **NÃO são source of truth** para status/budget
— é um snapshot com `last_synced_at`. Referenciam `crm.ad_platform_connections`
(que já aceita `platform='google'`).

---

## 3. Conexão (reutiliza `crm.ad_platform_connections`)

`crm.ad_platform_connections.platform` já aceita `'meta' | 'google' | 'tiktok'`.
A ligação OAuth do Google entra aqui no Sprint 2 (mesma tabela, `platform='google'`,
`customer_id` na conta selecionada). Não é preciso schema novo de conexões.

---

## 4. Captura de GCLID na landing — **Portal é um projeto SEPARADO**

A landing pública (`www.mundopropicio.com`) **não vive neste repositório**. Segundo
`docs/portal/architecture.md`, o portal público é um projeto **Lovable modern /
TanStack Start** distinto (este repo é a SPA Vite de backoffice + edge functions).

Por isso, o Sprint 1 **não** implementa aqui o código client-side de captura — fica
para a integração do lado do Portal. Padrão a seguir lá (igual ao pixel/CAPI atual):
1. Ao carregar a landing, ler `gclid`/`gbraid`/`wbraid` e `utm_*` do URL.
2. Respeitar o **gating de consentimento** existente (igual ao pixel/CAPI); registar
   `consent_granted`.
3. Persistir em `crm.google_click` (via o padrão de escrita do Portal — write
   server-side, à maneira de `lead_capture` / `process-lead-capture`), associando
   `event_id`, `client_event_id` e `lead_capture_id` quando disponíveis.

> Quando o Portal for integrado, o ponto de escrita pode ser uma edge function
> pública análoga a `process-lead-capture` (este repo) ou o write direto do Portal,
> conforme a decisão de arquitetura. O schema já o suporta.

---

## 5. Dependências do Sprint 2 (gate)

- **Data Manager API** (Google) para envio de conversões offline (`crm.google_conversion`).
- **Developer token** aprovado (Basic/Standard access) — gate para qualquer chamada à
  Google Ads API / Data Manager API. Sem ele, nada de sync nem envio.
- **Google Ads API** para o sync das tabelas-espelho e para Customer Match.

A área admin `/crm/google-ads` mostra estas dependências como pendentes.

---

## 6. Ficheiros (Sprint 1)
- `supabase/migrations/20260610011843_e60a623e-9f5a-4791-9c90-4f2333bb2b3d.sql` — schema `crm.google_*`.
- `src/pages/crm-admin/google-ads/GoogleAdsAdmin.tsx` — esqueleto admin.
- `src/App.tsx` — rota `/crm/google-ads`.
- `src/components/CrmSidebar.tsx` — entrada de navegação.
- `DATABASE.md`, `SCREENS.md` — documentação.
