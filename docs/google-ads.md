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

### 4.1 Edge function de ingest (este repo)

`supabase/functions/crm-google-click-ingest/index.ts` — endpoint público que recebe
POST do portal e escreve em `crm.google_click` com a `SERVICE_ROLE` auto-injetada.
Alinhado com o padrão `capi-meta-events` (`verify_jwt = false` em `config.toml`,
CORS estrito, validação Zod no handler).

**URLs:**
- Test: `https://ukpuhoynrqobqtzdbysp.supabase.co/functions/v1/crm-google-click-ingest`
- Live: `https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/crm-google-click-ingest`

**Origin allowlist** (rejeita 403 fora destes):
- `https://www.mundopropicio.com`
- `https://mundopropicio.com`
- `https://propicio-stage-portal.lovable.app`
- `https://*--26b95793-17b6-478c-a6e8-745c0cfb7ed9.lovable.app` (previews Lovable do portal)

**company_id é fixo no servidor** — lido de `PORTAL_DEFAULT_COMPANY_ID` com
fallback hardcoded para `7c858982-…` (Mundo Propício). **Nunca aceitar do payload**
— qualquer site público conseguiria forjar inserts noutro tenant.

**Payload aceite** (validação Zod, body máx 4 KB):
- `gclid` | `gbraid` | `wbraid` (exatamente um, máx 255, sem normalizar)
- `utm_source/medium/campaign/content/term` (opcionais, máx 255)
- `landing_url` (URL, obrigatório), `referrer` (URL, opcional)
- `user_agent` (máx 1000), `consent_granted` (boolean, obrigatório)
- `event_id` (uuid, opcional), `client_event_id` (uuid, obrigatório),
  `lead_capture_id` (uuid, opcional)

`captured_at` e `expires_at` ficam a cargo da BD (default + trigger +90d). O
`consent_granted=false` é gravado tal qual — o gating downstream para Google é
tratado depois (não no ingest).

### 4.2 Padrão do lado do Portal (resumo)

1. Ao carregar a landing, ler `gclid`/`gbraid`/`wbraid` e `utm_*` do URL.
2. Respeitar o gating de consentimento existente (igual ao pixel/CAPI); registar
   `consent_granted`.
3. POST para a URL Live da `crm-google-click-ingest` (apontar para Test só em
   previews/desenvolvimento), associando `event_id`, `client_event_id` e
   `lead_capture_id` quando disponíveis.

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

---

## 7. Sync de campanhas — `crm-google-ads-sync` (Sprint 2, MVP read-only)

Primeira edge function de leitura. Disparo manual (sem cron). Só campanhas
(ad groups / keywords / asset groups ficam para iterações seguintes).

**Ficheiro:** `supabase/functions/crm-google-ads-sync/index.ts`.

**Auth para Google:** service account via `GOOGLE_SA_KEY_JSON` (JSON completo
do Google Cloud, com `client_email` + `private_key`). A função normaliza o
`private_key` com `.replace(/\\n/g, "\n")`, assina um JWT RS256 com scope
`https://www.googleapis.com/auth/adwords` e troca-o por um `access_token` em
`https://oauth2.googleapis.com/token` (grant `jwt-bearer`).

**Chamada à Google Ads API:** REST na versão lida do secret
`GOOGLE_ADS_API_VERSION` (fallback `v24`, estável até sunset mai/2027 —
Google passou a cadência mensal de versões em 2026; `v17` foi descontinuada
há muito e `v20` sunset 10/06/2026). Para subir de versão basta definir o
secret (ex.: `v25`) sem alterar código.
`POST /<version>/customers/2200043144/googleAds:search` com GAQL a pedir
`campaign.{id,name,status,advertising_channel_type,bidding_strategy_type,
resource_name}`, `campaign_budget.amount_micros` e
`metrics.{impressions,clicks,cost_micros,conversions,conversions_value}`
em `segments.date DURING LAST_30_DAYS`. Nota: a v24 já não reconhece
`campaign.start_date` nem `campaign.end_date` em `googleAds:search`
(devolve `UNRECOGNIZED_FIELD`), pelo que foram removidos da query — as
colunas `start_date`/`end_date` em `crm.google_campaign` ficam gravadas
como `null`. O corpo do pedido é apenas `{ query }` — a v24 deixou de
suportar `pageSize` em `googleAds:search` (page size fixo de 10000;
enviá-lo devolve `INVALID_ARGUMENT / PAGE_SIZE_NOT_SUPPORTED`). Headers
obrigatórios: `Authorization`, `developer-token` (secret
`GOOGLE_ADS_DEVELOPER_TOKEN`), `login-customer-id` = `9743221780` (MCC,
sem hífens).

**Robustez de resposta:** tanto a troca OAuth (`oauth2.googleapis.com/token`)
como a chamada `googleads.googleapis.com` validam `Content-Type` antes de
`res.json()`. Se vier algo não-JSON (típico quando Google devolve HTML por
versão sunset / URL inválido / 5xx atrás de proxy), a função devolve erro
explícito `google_oauth_non_json:<status>:<ct>:<body[:300]>` ou
`google_ads_api_non_json:<status>:<ct>:<body[:300]>` em vez de rebentar com
"Unexpected token '<'".

**Persistência:** upsert em `crm.google_campaign` via `service_role` com
conflict target `(connection_id, external_campaign_id)` — índice único já
existe na tabela. Inclui métricas agregadas + payload cru em `raw`. O
`connection_id` é uma linha "âncora" de service account semeada por
migration (`c0000000-0000-4000-a000-000022000431`) — quando existir OAuth
real, substitui-se sem alterar o schema.

**Auth do caller:** exige JWT de admin (mesmo padrão das outras fns
sensíveis); responde `403 forbidden_admin_only` caso contrário.

**Secrets esperados:**
- `GOOGLE_SA_KEY_JSON` (Live only nesta fase)
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_API_VERSION` (opcional; fallback `v24`)

A função falha cedo e claramente se algum dos dois primeiros estiver em
falta (`missing_secret`).

**Retorno:** `{ read, campaigns, upserted, errors, customer_id,
login_customer_id }`.

**Ambientes:** o secret `GOOGLE_SA_KEY_JSON` existe apenas em Live, por isso
em Test a função compila mas devolve `google_sa_auth_failed` /
`missing_secret`. Validação real só após Publish.
