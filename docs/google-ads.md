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

## 7. Sync Google Ads — `crm-google-ads-sync` (Sprint 2, read-only)

Edge function de leitura. Disparo manual (sem cron). Numa única invocação,
com o mesmo access token de service account, sincroniza quatro recursos:

> **Dashboard.** Existe um dashboard read-only de visualização em
> `/crm/google-ads` (`src/pages/crm-admin/google-ads/GoogleAdsAdmin.tsx`)
> dentro do MP Audience, com toggle no topo a alternar para o Dashboard
> Meta Live (`/crm`). Mostra cards KPI agregados dos últimos 30 dias
> (Gasto, Impressões, Cliques, CTR, CPC, Conversões, Valor de conversão),
> tabela de campanhas com drill-down ad group → keyword e botão
> **"Sincronizar agora"** que invoca esta edge function. RBAC: admin /
> marketing_manager / platform_admin.


| Recurso        | GAQL FROM        | Tabela destino           | Conflict target                                                  |
|----------------|------------------|--------------------------|------------------------------------------------------------------|
| Campanhas      | `campaign`       | `crm.google_campaign`    | `(connection_id, external_campaign_id)`                          |
| Ad groups      | `ad_group`       | `crm.google_ad_group`    | `(connection_id, external_ad_group_id)`                          |
| Keywords       | `keyword_view`   | `crm.google_keyword`     | `(connection_id, external_ad_group_id, external_criterion_id)`  |
| Asset groups   | `asset_group`    | `crm.google_asset_group` | `(connection_id, external_asset_group_id)`                       |

Cada um dos quatro blocos tem `try/catch` isolado — se um recurso falhar
(ex.: query rejeitada), os outros continuam e o erro é registado no array
`errors` do sumário. Asset groups devolve tipicamente 0 linhas: a conta
atual não tem campanhas Performance Max, o que é tratado como caso normal
(0 upserts, sem erro).

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

Todos os POSTs vão para
`POST /<version>/customers/2200043144/googleAds:search` com helper único
`googleAdsSearch(query)`. Headers obrigatórios: `Authorization`,
`developer-token` (secret `GOOGLE_ADS_DEVELOPER_TOKEN`), `login-customer-id`
= `9743221780` (MCC, sem hífens). O corpo do pedido é apenas `{ query }`
— a v24 deixou de suportar `pageSize` em `googleAds:search` (page size fixo
de 10000; enviá-lo devolve `INVALID_ARGUMENT / PAGE_SIZE_NOT_SUPPORTED`).

**GAQL usado:** todas as queries pedem
`metrics.{impressions,clicks,cost_micros,conversions,conversions_value}` em
`segments.date DURING LAST_30_DAYS`. Campos específicos por recurso:

- **Campanhas:** `campaign.{id,name,status,advertising_channel_type,
  bidding_strategy_type,resource_name}` + `campaign_budget.amount_micros`.
  Nota: v24 já não reconhece `campaign.start_date` nem `campaign.end_date`
  em `googleAds:search` (devolve `UNRECOGNIZED_FIELD`), pelo que foram
  removidos — as colunas `start_date`/`end_date` em `crm.google_campaign`
  ficam `null`. Por precaução, o mesmo princípio conservador (só campos
  garantidamente reconhecidos) é aplicado aos novos recursos.
- **Ad groups:** `ad_group.{id,name,status,type,resource_name}` +
  `campaign.id` (para ligar ao `external_campaign_id`).
- **Keywords:** `ad_group_criterion.{criterion_id,status,resource_name,
  keyword.text,keyword.match_type}` + `ad_group.id`.
- **Asset groups:** `asset_group.{id,name,status,resource_name}` +
  `campaign.id`.

**Robustez de resposta:** tanto a troca OAuth (`oauth2.googleapis.com/token`)
como cada chamada `googleads.googleapis.com` validam `Content-Type` antes de
`res.json()`. Se vier algo não-JSON (típico quando Google devolve HTML por
versão sunset / URL inválido / 5xx atrás de proxy), a função devolve erro
explícito `google_oauth_non_json:<status>:<ct>:<body[:300]>` ou
`google_ads_api_non_json:<status>:<ct>:<body[:300]>` em vez de rebentar com
"Unexpected token '<'".

**Persistência:** upsert em cada tabela `crm.google_*` via `service_role`
com o conflict target da tabela acima. Métricas são agregadas defensivamente
por chave (campaign.id / ad_group.id / (ad_group.id, criterion_id) /
asset_group.id), com payload cru em `raw`. O `connection_id` é uma linha
"âncora" de service account semeada por migration
(`c0000000-0000-4000-a000-000022000431`) — quando existir OAuth real,
substitui-se sem alterar o schema.

**Auth do caller:** exige JWT de admin (mesmo padrão das outras fns
sensíveis); responde `403 forbidden_admin_only` caso contrário.

**Secrets esperados:**
- `GOOGLE_SA_KEY_JSON` (Live only nesta fase)
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_API_VERSION` (opcional; fallback `v24`)

A função falha cedo e claramente se algum dos dois primeiros estiver em
falta (`missing_secret`).

**Retorno (sumário consolidado):**

```json
{
  "campaigns":    { "read": N, "upserted": N },
  "ad_groups":    { "read": N, "upserted": N },
  "keywords":     { "read": N, "upserted": N },
  "asset_groups": { "read": N, "upserted": N },
  "errors": [],
  "customer_id": "2200043144",
  "login_customer_id": "9743221780"
}
```

**Ambientes:** o secret `GOOGLE_SA_KEY_JSON` existe apenas em Live, por isso
em Test a função compila mas devolve `google_sa_auth_failed` /
`missing_secret`. Validação real só após Publish.

---

## 8. Envio de conversões offline — `crm-google-conversion-upload`

Sprint 2, peça 4. Envia para o Google Ads as conversões de venda já
atribuídas a um clique Google (gclid/gbraid/wbraid capturado na landing
e gravado em `crm.google_click`). Disparo manual a partir da tab
"Conversões" do dashboard `/crm/google-ads`.

**Ficheiro:** `supabase/functions/crm-google-conversion-upload/index.ts`.

**Endpoint Google:**
`POST https://googleads.googleapis.com/v24/customers/2200043144:uploadClickConversions`
com `partialFailure: true`. Reusa o mesmo padrão de auth da
`crm-google-ads-sync` (service account → JWT RS256 → access token,
headers `developer-token` + `login-customer-id=9743221780`, validação
de `Content-Type` antes de `res.json()`).

**Origem dos dados:** lê `crm.google_conversion` onde `status='pending'`,
até 2000 linhas por invocação, ordenadas por `conversion_datetime` asc.
Linhas sem nenhum identificador de clique são marcadas `failed` com
`error_detail='sem_identificador_clique'` e não são enviadas.

**Montagem da `ClickConversion`:**
- `conversionAction`: se `conversion_action_ref` começa por `customers/`,
  usa-se tal como está; caso contrário constrói-se
  `customers/2200043144/conversionActions/{ref}`.
- Identificador do clique: `gclid` se presente; senão `gbraid`; senão
  `wbraid` (exatamente um, mesma regra do CHECK em `google_click`).
- `conversionDateTime`: formato **exato** exigido pela Google —
  `"yyyy-MM-dd HH:mm:ss+HH:mm"` (com offset de timezone explícito,
  ex.: `"2026-06-13 16:30:00+00:00"`). Não enviamos ISO com `T` nem `Z`
  — a Google rejeita. Como `conversion_datetime` é `timestamptz`
  armazenado em UTC, o offset é sempre `+00:00`.
- `conversionValue` + `currencyCode` (default `EUR`) quando há valor.
- `orderId`: o `order_id` da linha (= `transaction_id` Ticketline/Fever).
  É a chave de dedup do lado da Google e está protegida em BD por
  UNIQUE `(company_id, conversion_action_ref, order_id)`.

**Mapeamento de resultados:** com `partialFailure: true`, a Google
devolve `results[]` com o mesmo comprimento do `conversions[]` enviado;
entradas rejeitadas aparecem vazias. Os erros vêm em
`partialFailureError.details[].errors[]` com
`location.fieldPathElements[].index` a apontar para a posição da
conversão rejeitada. A função mapeia índice→linha, atualiza:
- aceites: `status='sent'`, `sent_at=now()`, `raw` com payload+result;
- rejeitadas: `status='failed'`, `error_detail` com a mensagem da Google,
  `raw` com payload+error.

`data_manager_job_id` fica `null` neste endpoint (Click Conversions não
devolve job id — só o caminho Data Manager assíncrono devolve).

**Auth do caller:** exige JWT de admin (`has_role admin`); responde
`403 forbidden_admin_only` caso contrário. Mesmos secrets que a sync
(`GOOGLE_SA_KEY_JSON`, `GOOGLE_ADS_DEVELOPER_TOKEN`,
`GOOGLE_ADS_API_VERSION` opcional). Desde a auth v2 (ver §10), aceita também `service_role` para invocação por cron, mantendo intacto o caminho admin.

**Estados da fila `crm.google_conversion.status`:**
- `pending` — pronta a enviar (criada por upstream de vendas; ainda não
  implementado o produtor — esta função só consome).
- `sent` — aceite pela Google.
- `failed` — rejeitada (ver `error_detail`) ou sem identificador.

**Retorno:**

```json
{
  "read": N,
  "sent": N,
  "failed": N,
  "errors": [],
  "customer_id": "2200043144"
}
```

**UI:** tab "Conversões" do dashboard `/crm/google-ads` mostra KPIs
(Pendentes / Enviadas / Falhadas / Valor pendente), tabela com data,
order_id, valor, identificador de clique (badge `gclid`/`gbraid`/`wbraid`
truncado + tooltip com valor completo), badge de status e tooltip com o
`error_detail` da Google. Botão "Enviar pendentes" invoca esta edge
function e mostra toast com o sumário.

---

## 9. Produtor de conversões de LEAD — `crm-google-lead-conversion-enqueue`

Sprint 2, peça 5. **Produtor** da fila `crm.google_conversion`. Varre os
cliques Google atribuíveis a um lead na landing e cria uma linha `pending`
por lead. O consumidor que envia depois para a Google é o já existente
`crm-google-conversion-upload` (secção 8).

### Por que atribuir ao LEAD, não à venda

As vendas chegam-nos agregadas pelos parceiros de bilhética (Ticketline,
Fever) — **não temos o comprador individual**, logo não conseguimos
casar `transaction_id` ↔ `gclid`. O sinal possível de atribuição é o
**lead** que o utilizador deixou na landing logo após o clique Google.

Implicação: o conversion action no Google Ads associado a este produtor
deve ser de **categoria "Lead"** (não "Purchase"), com `count = "One"`
e janela de atribuição compatível com a janela típica entre clique e
formulário. O valor por conversão é configurável (ver abaixo).

### Configuração — `public.portal_settings`

Escopo: empresa Mundo Propício (`company_id = 7c858982-…`).

| `key`                              | Tipo  | Significado                                              |
|------------------------------------|-------|----------------------------------------------------------|
| `google_lead_conversion_action_id` | text  | ID/recurso da ação de conversão "Lead" no Google Ads     |
| `google_lead_conversion_value`     | numeric | Valor por conversão (€). Default `0` se ausente.       |

Se `google_lead_conversion_action_id` estiver vazio/ausente, a função
**não enfileira nada** e devolve `{ enqueued: 0, skipped_no_action: true }`.

Aceita o valor da `value` quer como escalar (`"123"`, `123`) quer como
objeto JSONB `{ "value": 123 }`.

### Mecânica de varrimento

- Auth do caller: JWT de admin (`has_role admin`); senão `403 forbidden_admin_only`.
- Candidatos: `crm.google_click` com `company_id = MP`, `consent_granted = true`,
  `lead_capture_id IS NOT NULL` e pelo menos um de `gclid/gbraid/wbraid`,
  ordenados por `captured_at` ASC, até **5000** por corrida.
- Dedup em duas camadas:
  1. **Filtro de query** — lê os `order_id` já existentes em
     `crm.google_conversion` para a mesma `conversion_action_ref` e
     descarta candidatos cujo `lead_capture_id` já lá está.
  2. **Rede de segurança em BD** — índice UNIQUE pré-existente
     `uq_google_conversion_order` em
     `(company_id, conversion_action_ref, order_id)`. O insert usa
     `upsert` com `onConflict: 'company_id,conversion_action_ref,order_id'`
     e `ignoreDuplicates: true`, portanto re-correr é seguro.

### Mapeamento `google_click` → `google_conversion`

| campo destino           | origem                                                              |
|-------------------------|---------------------------------------------------------------------|
| `company_id`            | MP (`7c858982-…`)                                                   |
| `conversion_action_ref` | Portal setting `google_lead_conversion_action_id`                   |
| `gclid` / `gbraid` / `wbraid` | exatamente um, prioridade `gclid > gbraid > wbraid`           |
| `google_click_id`       | `google_click.id`                                                    |
| `conversion_value`      | Portal setting `google_lead_conversion_value` (ou 0)                |
| `currency_code`         | `"EUR"`                                                              |
| `order_id`              | **`lead_capture_id`** — chave de dedup (um lead = uma conversão)     |
| `conversion_datetime`   | `google_click.captured_at` (timestamptz UTC)                         |
| `status`                | `'pending'`                                                          |

O CHECK existente `google_conversion_exactly_one_id` é respeitado por
construção (escolhemos exatamente um identificador por linha).

### Retorno

```json
{
  "candidates": N,
  "enqueued": N,
  "skipped_existing": N,
  "errors": [ { "google_click_id": "…", "reason": "…" } ],
  "company_id": "7c858982-…",
  "conversion_action_ref": "…",
  "conversion_value": 0
}
```

### Operação

- **Agendada por cron (15 em 15 min)** desde jun/2026 — ver §10. Mantém também a invocação manual via UI (caminho admin).
- Em Test corre sem precisar dos secrets da Google (não chama a Google,
  só escreve em BD). Os secrets `GOOGLE_*` continuam só relevantes para
  o consumidor `crm-google-conversion-upload`.

---

## 10. Automação por cron — produtor + consumidor (Sprint 2, peça 6)

O ciclo de conversões de lead corre automaticamente via `pg_cron` em Live, sem intervenção manual. Dois jobs encadeados temporalmente:

| jobname (jobid) | schedule | minutos | função alvo |
|---|---|---|---|
| `crm-google-lead-conversion-enqueue` (42) | `*/15 * * * *` | 00,15,30,45 | produtor (§9) — enfileira `pending` |
| `crm-google-conversion-upload` (43) | `7-59/15 * * * *` | 07,22,37,52 | consumidor (§8) — envia à Google |

O consumidor corre ~7 min depois do produtor para dar tempo ao enqueue. A janela de clique da Google é 90 dias, por isso a cadência de 15 min é folgada — prioriza sinal fresco para Smart Bidding durante on-sales sem ser pesada.

### Auth v2 — caminho service_role (cron-callable)

Ambas as funções (§8 e §9) ganharam um **segundo caminho de auth** para serem invocáveis por cron, mantendo intacto o caminho admin (botões manuais da UI):

- Descodifica manualmente o payload do JWT do Bearer (split por `.`, base64url → `atob`), como em `crm-measure-action-impact`.
- Se `payload.role === 'service_role'` → autorizado, salta `getClaims`/`has_role`.
- Caso contrário → caminho admin original (`getClaims` → `claims.sub` → `has_role admin` → 401/403).

Marcadores de versão no arranque (verificação de deploy em Live): `lead-producer-v2-cronauth` e `conv-upload-v2-cronauth`.

### Comando do cron (padrão dos crons `crm-*`)

Cada job é um `net.http_post` que lê a **service_role key do Vault** (`vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'`) e a passa como `Authorization: Bearer`. Mesmo padrão de `crm-measure-action-impact` e `crm-meta-audiences-daily-sync`.

### Regras operacionais

- **Crons NÃO propagam Test → Live via Publish.** Foram criados direto no SQL Editor de Live com `cron.schedule(jobname, schedule, command)` (idempotente — re-correr atualiza o mesmo job). `cron.alter_job`/unschedule exigem ser owner (postgres). Identificar sempre por `jobname` (jobid não é consistente cross-env).
- A **edição das edge functions** (auth v2) propaga normalmente via Publish (deploy de funções, ao contrário de crons/DML).
- Verificação de uma corrida: `net._http_response` (status_code real da função, 200 esperado) + `cron.job_run_details` (sucesso do agendamento). Nota: o `pg_net` tem timeout de 5 s; se a função demorar mais, `status_code` pode vir `NULL` — validar pelo estado em BD (`crm.google_conversion`).

### Config aplicada (Live)

`public.portal_settings` (Mundo Propício, `company_id = 7c858982-…`):
- `google_lead_conversion_action_id` = `7648181457` (ação "Enviar formulário de lead", offline upload, conta `220-004-3144`).
- `google_lead_conversion_value` = `0`.

