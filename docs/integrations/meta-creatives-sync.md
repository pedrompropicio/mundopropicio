# Meta Creatives Sync (MCS) — integração

> Sincronização automática de criativos Meta Ads (Facebook + Instagram) para `crm.meta_creatives`, populando `headline`, `body`, `cta_type`, `link_url` e `meta_image_hash` a partir da Graph API. Habilita preview de anúncios, herança em redesign de estratégia, e (futuro) análise IA de criativos.

| | |
|---|---|
| **Status** | ✅ Operacional (v1) |
| **Plataforma alvo** | Meta Business (Graph API v19.0) |
| **Módulo cliente** | MP Audience |
| **Versão activa** | v1 |
| **Sprint fechado** | 2026-05-17 |
| **Commit principal** | `a2b2ed93` |
| **Última revisão** | 2026-05-17 |

---

## 1. Visão geral

O MCS resolve um problema concreto: criativos publicados directamente no Meta Ads Manager (não criados pela UI do MP Audience) chegavam à nossa DB com `library_id=NULL` e `headline/body/cta_type=NULL`. Resultado: previews vazios no fluxo de redesign, e o `crm-meta-campaign-redesign` não conseguia herdar nada útil.

A v1 sincroniza diariamente os criativos das conexões Meta activas, lendo `object_story_spec` via Graph API e mapeando-o para as colunas da tabela. Cobre os 3 shapes mais comuns (`video_data`, `link_data`, `image_data`) + fallback para tipos não-reconhecidos.

**Validação em produção 2026-05-17:** 804/804 criativos sincronizados para o tenant Mundo Propício. Strategy F regerada para campanha Ivete Clareou Portugal completou com sucesso, consumindo dados sincronizados via MCS v1.

---

## 2. Arquitectura

### Componentes

- **Edge function** [supabase/functions/crm-meta-sync-creatives/index.ts](supabase/functions/crm-meta-sync-creatives/index.ts) (~358 linhas)
- **Tabela** `crm.meta_creatives`, definida em [supabase/migrations/20260511200047_aabf13b1-04fc-4ac6-a578-5f9621e3b453.sql](supabase/migrations/20260511200047_aabf13b1-04fc-4ac6-a578-5f9621e3b453.sql); ajustes v1 em [supabase/migrations/20260518000000_meta_creatives_sync_support.sql](supabase/migrations/20260518000000_meta_creatives_sync_support.sql)
- **RPC dual-mode** `public.crm_get_meta_decrypted_token` — devolve token decifrado para cron (service_role) ou para user autenticado
- **Cron** `jobid=22`, schedule `'0 6 * * *'` (06:00 UTC diário), aplicado em script `scripts/crm-cron-sync-creatives-live.txt`

### Estratégia de fetch — set-diff

Para evitar custo desnecessário na Graph API e não sobrescrever uploads UI manuais, o sync usa 2-query set-diff:

1. **Query A:** `SELECT meta_creative_id FROM crm.meta_creatives WHERE company_id=$1` — IDs já em DB.
2. **Query B:** `GET /act/{ad_account_id}/ads?fields=creative{id}` — IDs presentes na Meta.
3. **Diff:** `meta_ids \ db_ids` = lista de missing.
4. **Fetch detalhado:** só para os missing, em chunks de 50, `GET /?ids=...&fields=name,object_story_spec,...`.
5. **Insert:** `upsert(rows, { onConflict: 'company_id,meta_creative_id', ignoreDuplicates: true })`.

**Consequência intencional:** rows existentes com fields vazios (criadas antes do MCS v1) NÃO são re-fetched nem curadas retroactivamente. Isto preserva uploads UI manuais. Para curar legacy, ver Backlog MCS v2.

### Parser — 4 branches sobre `object_story_spec`

Implementado em `parseCreativeFields(creative)` dentro da edge function:

| Branch | Trigger | `headline` | `body` | `link_url` | `cta_type` | `type` |
|---|---|---|---|---|---|---|
| `video_data` | `object_story_spec.video_data` presente | `.title` | `.message` | `.call_to_action.value.link` | `.call_to_action.type` | `video` |
| `link_data` | `object_story_spec.link_data` presente | `.name` | `.message` | `.link` | `.call_to_action.type` | `banner` |
| `image_data` | `object_story_spec.image_data` presente | `null` ⚠️ | `.message` | `.call_to_action.value.link` | `.call_to_action.type` | `banner` |
| fallback `unknown` | nenhum dos acima | `creative.title` | `creative.body` | `null` | `null` | `unknown` |

O fallback emite `console.warn` com o `creative.id` e a estrutura encontrada — útil para diagnosticar coverage gaps que justifiquem MCS v2.

### Auth dual-mode

A RPC `public.crm_get_meta_decrypted_token` é chamada por dois callers distintos:
- **Cron** (service_role): chega via `net.http_post` com header `Authorization: Bearer <service_role_key>`.
- **Trigger manual** (user JWT): chega com `Authorization: Bearer <user_jwt>`.

A RPC detecta o caller via:
```sql
current_setting('request.jwt.claims', true)::jsonb ->> 'role'
```
- `'service_role'` → bypassa company filter, devolve token para qualquer connection_id passada.
- qualquer outra role → valida que a connection pertence ao `current_company_id()`.

Mais defensivo que comparar a string `Authorization` directamente.

### Tabela `crm.meta_creatives` — colunas relevantes

| Coluna | Tipo | Populado por MCS v1? |
|---|---|---|
| `id` | uuid PK | auto |
| `company_id` | uuid NOT NULL | sim |
| `meta_creative_id` | text | sim (id Meta) |
| `name` | text NOT NULL | sim (`creative.name` ou `[Meta] <id>` fallback) |
| `type` | text NOT NULL | sim (`video` / `banner` / `unknown`) |
| `headline` | text NULL | condicional (NULL em `image_data` e em quase todos os fallback) |
| `body` | text NULL | condicional |
| `cta_type` | text NULL | condicional |
| `link_url` | text NULL | condicional (NULL em fallback) |
| `meta_image_hash` | text NULL | sim (preparado para v2) |
| `file_url` | text NULL | **sempre NULL** (v1 não resolve image_hash) |
| `storage_path` | text NULL | sempre NULL (só uploads UI) |
| `created_by` | uuid NULL | NULL quando vem do cron (service_role não tem user) |

Constraint relevante: `UNIQUE INDEX (company_id, meta_creative_id) WHERE meta_creative_id IS NOT NULL` — ver Bug #4 abaixo para implicação no upsert.

### Timeout — pg_net vs edge

`net.http_post` da `pg_net` tem timeout default de ~5s. A edge function `crm-meta-sync-creatives` demora tipicamente ~18s (804 criativos em chunks de 50 + Graph API roundtrip + insert). Consequência: `net._http_response.status_code` virá **NULL** mesmo em sucessos.

**Não validar sucesso via `status_code` HTTP.** Validar sempre via estado em DB (count em `meta_creatives` antes/depois do trigger). Ver §3.2.

---

## 3. Operação

### 3.1 Trigger manual (SQL Editor)

Para sincronizar imediatamente sem esperar pelas 06:00 UTC, correr no SQL Editor (substituir placeholders):

```sql
SELECT net.http_post(
  url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/crm-meta-sync-creatives',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'email_queue_service_role_key'
    )
  ),
  body := jsonb_build_object(
    'connection_id', '<connection_uuid>',
    'ad_account_id', '<act_xxxxxxxxxxxxx>',
    'role', 'service_role'
  ),
  timeout_milliseconds := 30000
) AS request_id;
```

Notas:
- `connection_id`: row em `crm.meta_connections` com status activo (`active` ou `connected`).
- `ad_account_id`: `act_<id>` da Meta (já normalizado em `crm.meta_connections.selected_ad_account_id`).
- `timeout_milliseconds := 30000` evita o cap default de 5s.
- O `request_id` devolvido permite consultar `SELECT * FROM net._http_response WHERE id=<request_id>` mais tarde — mas, conforme §2 timeout, `status_code` será NULL em sucessos.

### 3.2 Validação de sucesso

**Antes do trigger:** capturar baseline.
```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE headline IS NOT NULL) AS with_headline,
       max(created_at) AS last_insert
FROM crm.meta_creatives
WHERE company_id = '<company_uuid>';
```

**Depois do trigger** (esperar ~30s):
```sql
-- A. Quantos novos desde X
SELECT count(*) AS new_since_baseline
FROM crm.meta_creatives
WHERE company_id = '<company_uuid>'
  AND created_at > '<baseline_timestamp>';

-- B. Distribuição por type (mostra coverage do parser — branch unknown alto sugere
--    criativos em formato não-suportado pelo v1; ver Backlog MCS v2)
SELECT type, count(*) AS n,
       count(*) FILTER (WHERE headline IS NOT NULL) AS with_headline,
       count(*) FILTER (WHERE body IS NOT NULL) AS with_body,
       count(*) FILTER (WHERE link_url IS NOT NULL) AS with_link
FROM crm.meta_creatives
WHERE company_id = '<company_uuid>'
GROUP BY type
ORDER BY n DESC;

-- C. Criativos órfãos: referenciados em meta_ad_snapshot mas missing em meta_creatives
--    (zero é o esperado depois de um sync completo)
SELECT s.meta_creative_id, count(*) AS ads_referencing
FROM crm.meta_ad_snapshot s
LEFT JOIN crm.meta_creatives c
  ON c.meta_creative_id = s.meta_creative_id AND c.company_id = s.company_id
WHERE s.company_id = '<company_uuid>'
  AND s.meta_creative_id IS NOT NULL
  AND c.id IS NULL
GROUP BY s.meta_creative_id;
```

### 3.3 Cron

- **jobid:** 22
- **schedule:** `'0 6 * * *'` (06:00 UTC = 07:00 Lisboa hora padrão / 06:00 BRT durante summer time PT)
- **Filtro de connections:** `status IN ('active','connected')` (ver Bug #5 — o filtro evoluiu durante o sprint)
- **Definição:** `scripts/crm-cron-sync-creatives-live.txt` (aplicado manualmente no SQL Editor, não vive em migration)
- **Verificar estado:** `SELECT jobid, schedule, command, active FROM cron.job WHERE jobid = 22;`
- **Últimas execuções:** `SELECT runid, job_pid, status, return_message, start_time, end_time FROM cron.job_run_details WHERE jobid = 22 ORDER BY start_time DESC LIMIT 10;`

---

## 4. Sete bugs corrigidos no sprint

| # | Bug | Fix | Aprendizado estrutural |
|---|---|---|---|
| 1 | Lovable não auto-deploya NEW edge functions via push GitHub | Publish manual via UI | Para novas functions → Publish obrigatório depois do push |
| 2 | RPC `public.crm_get_meta_decrypted_token` falhava com service_role JWT (`auth.uid()=NULL`) | Dual-mode via `current_setting('request.jwt.claims',true)::jsonb ->> 'role' = 'service_role'` | RPCs `SECURITY DEFINER` precisam dual-mode quando chamadas por cron via service_role |
| 3 | Schema column wrong: `external_account_id` não existe na tabela `meta_connections` | Corrigido para `selected_ad_account_id` | DDL real diverge do briefing inicial — verificar sempre via `information_schema` antes de codar |
| 4 | Partial UNIQUE index (`WHERE meta_creative_id IS NOT NULL`) não serve como conflict target em `.upsert(onConflict:cols)` — erro `42P10` | DROP partial + ADD UNIQUE total. NULLs distintos por defeito preservam legacy rows sem violação | supabase-js `.upsert(onConflict)` NÃO aceita partial UNIQUE indexes — usar UNIQUE total ou cair para raw SQL |
| 5 | Cron filtrava `status='connected'` mas DB tem rows com `status='active'` | Patch para `status IN ('active','connected')` | Estados de connection na DB real divergem do que o briefing assumia — auditar valores existentes via `SELECT DISTINCT` antes de escrever filtros |
| 6 | Service_role sem GRANT INSERT/UPDATE em `crm.meta_creatives` e `crm.meta_sync_state` — erro `42501` | `GRANT SELECT, INSERT, UPDATE` em ambas as tabelas + `GRANT USAGE ON SCHEMA crm TO service_role` | Edge functions chamadas via service_role precisam GRANTs explícitos em schemas non-public. Outros syncs do projecto nunca expuseram isto porque sempre chamados via UI com user JWT (`role=authenticated`, RLS path) |
| 7 | Constraint `meta_creatives_type_check` só aceitava `'image','video','carousel'` — parser v1 produz `'banner'` para `link_data` ads | DROP+RECREATE constraint com 7 tipos permitidos: `image`, `video`, `carousel`, `banner`, `unknown`, `collection`, `instant_experience` | Check constraints legacy criados antes de syncs automáticos podem rejeitar tipos novos descobertos pelo parser. Auditar constraints CHECK antes de introduzir parser |

---

## 5. Lições estruturais para Lovable Cloud + Supabase

1. **GRANTs explícitos em schemas non-public.** Edge functions chamadas via service_role precisam de `GRANT SELECT/INSERT/UPDATE/DELETE` explícitos nas tabelas + `GRANT USAGE` no schema. Não é herdado de `public`. Aplica-se a TODA tabela nova em `crm.*` (ou qualquer outro schema custom).

2. **RPCs `SECURITY DEFINER` chamadas por cron precisam dual-mode auth.** Detectar role via `current_setting('request.jwt.claims', true)::jsonb ->> 'role'` e bypassar filtros de tenant quando `role = 'service_role'`. String-compare do header `Authorization` é frágil.

3. **`upsert(onConflict: cols)` em supabase-js NÃO aceita partial unique indexes como conflict target.** Se a constraint tem `WHERE`, a CLI/SDK rejeita como "no unique or exclusion constraint matching". Soluções: criar constraint full unique paralela, ou usar `ignoreDuplicates:true` (que ignora a constraint específica), ou cair para SQL `INSERT ... ON CONFLICT` raw.

4. **`pg_net` timeout default ~5s vs edge function frequentemente >5s.** `net._http_response.status_code` virá NULL em sucessos longos. Validar sucesso **sempre via DB state** (count antes/depois, distribuição por type), nunca por HTTP response.

5. **Push para `main` NÃO auto-aplica DB migrations no Lovable Cloud.** Ficheiros em `supabase/migrations/` são documentação até serem aplicados (a) pelo agente Lovable quando explicitamente pedido, ou (b) manualmente no SQL Editor. O push triggera deploy de frontend e (com touch) de edge functions, mas o tracking de migrations é separado.

6. **SQL manual no SQL Editor de Test NÃO invalida o tracking de Publish.** O botão Lovable Publish pode dizer "Up to date" mesmo havendo drift real entre Test e Live. Workaround: aplicar o mesmo SQL em Live (drift de tracking fica como dívida menor — migration idempotente garante que re-correr é no-op). Ver §10 abaixo para caso concreto.

---

## 6. Limitações conhecidas v1

- **347 de 805 criativos (43%) caem no branch fallback `type='unknown'`** e ficam completamente vazios. Tipicamente: carousels (`template_data`) e Dynamic Product Ads (`asset_feed_spec`, `product_set_id` presente). Cobertos no Backlog MCS v2 P0.
- **`file_url` é sempre NULL.** Imagens via `image_hash` não são resolvidas em v1. `meta_image_hash` é populado e fica pronto para v2 resolver via batch `/act/adimages`.
- **Set-diff não cura legacy.** Rows pré-MCS v1 com fields vazios não são re-fetched. Para curar, seria preciso `DELETE` selectivo e re-correr o sync, ou um pass v2 explicitamente retroactivo.
- **Cards de preview no fluxo "Re-desenhar campanha (com herança)"** ([src/pages/crm/StrategyView.tsx:944-1022](src/pages/crm/StrategyView.tsx:944)) renderizam `(sem headline)` / `(sem primary text)` / `{{product.name}}` literal para criativos do branch fallback ou DPAs. **Comportamento esperado**, não bug — o front mostra fielmente o que está em DB.

---

## 7. Backlog MCS v2 (priorizado)

- **P0 — Parser para `template_data` (carousels) + `asset_feed_spec` (DPAs).** Vai recuperar coverage dos ~43% órfãos. Para DPAs, o parser deve extrair os assets individuais e mapear cada um como criativo (ou criar um row sumário com flag `is_dpa=true`).
- **P1 — Resolução de `image_hash` → URL via Graph API.** Batch fetch contra `/act/{ad_account_id}/adimages?hashes=[...]`. Popula `file_url`. Cards de preview passam a mostrar imagens.
- **P1 — Detecção de DPAs no parser (`product_set_id` presente)** + flag `is_dpa boolean` na tabela + badge na UI ("Dynamic Product Ad") em vez de renderizar `{{product.name}}` literal. Requer migration `ALTER TABLE`.
- **P1 — Auto-trigger `crm-meta-creative-analyze`** após cada sync bem-sucedido. Popula `analysis_jsonb.scores.overall` (pipeline IA score). Pré-requisito para o branch `winningByScore` em redesign deixar de ser raro.
- **P2 (UX quick win, não bloqueia)** — fallback secundário em `AdMockup` ([src/pages/crm/StrategyView.tsx:1591](src/pages/crm/StrategyView.tsx:1591)): `body || creative.name || '(sem primary text)'`. Pelo menos mostra o nome do anúncio em vez de placeholder.

---

## 8. Validação em produção — 2026-05-17

- **Tenant:** Mundo Propício (`company_id = 7c858982-6ccd-47ca-bd65-e0dd3eebf01c`)
- **Universo sincronizado:** 804 / 804 criativos da connection activa
- **Distribuição coverage (snapshot do dia):**
  - `video`: 367 (99.7% com headline+body)
  - `banner` (`link_data`): 91 (100% com headline+body — todos os 91 do dia eram link_data; nenhum image_data observado neste universo)
  - `unknown` (fallback): 347 (0% com qualquer field útil)
- **Smoke test downstream:** Strategy F regenerada para campanha **Ivete Clareou Portugal** via edge `crm-meta-campaign-redesign` — completou com sucesso, herdou 14 criativos (texto+CTA+link) que antes vinham todos a NULL.

### Commits relevantes do sprint

- **`a2b2ed93`** — `feat(mp-audience): Sprint Meta Creatives Sync v1`
  Criação inicial da edge function `crm-meta-sync-creatives`, parser 4-branch, primeira versão da estratégia set-diff e migration da tabela `crm.meta_creatives`.

- **`6f3a17e4`** — `fix(mp-audience): force re-deploy crm-meta-sync-creatives edge function`
  Re-deploy forçado depois de descoberto que Lovable não auto-aplica novas edge functions via push GitHub (Bug #1 da tabela §4). Publish manual passou a ser obrigatório.

- **`58be6783`** — `[Lovable agent] migration RPC dual-mode public.crm_get_meta_decrypted_token`
  Migration aplicada pelo agente Lovable que estende a RPC para detectar `service_role` via `current_setting` JWT claims, resolvendo o crash com `auth.uid()=NULL` quando chamada pelo cron (Bug #2).

- **`d00e7bd0`** — `fix(mp-audience): MCS v1 final — UNIQUE total + cron status correcto`
  DROP do partial UNIQUE em `crm.meta_creatives` e substituição por UNIQUE total em `(company_id, meta_creative_id)`, permitindo upsert via supabase-js (Bug #4). Patch do filtro do cron para `status IN ('active','connected')` em vez de só `'connected'` (Bug #5).

- **`315367c4`** — `fix(mp-audience): MCS v1 — versionar GRANTs service_role + type_check alargado`
  Adicionados GRANTs `SELECT/INSERT/UPDATE` explícitos a service_role em `crm.meta_creatives` e `crm.meta_sync_state`, mais `USAGE` no schema `crm` (Bug #6). DROP+RECREATE da constraint `meta_creatives_type_check` para aceitar os 7 tipos descobertos pelo parser (Bug #7).

---

## 9. Drift de tracking conhecido

A tabela `crm.meta_campaign_changes` (migration [supabase/migrations/20260516210000_meta_campaign_changes.sql](supabase/migrations/20260516210000_meta_campaign_changes.sql)) — usada pelo audit trail consumido a jusante deste sync — foi aplicada manualmente em **Test E em Live** via SQL Editor após o Lovable Publish ter falhado a detectar a migration. Resultado: a tabela existe em ambos os ambientes mas `supabase_migrations.schema_migrations` não regista a migration `20260516210000`.

**Dívida técnica menor** — a migration é idempotente (`IF NOT EXISTS` / `DROP IF EXISTS`), portanto re-correr é no-op. A investigar futuramente: por que o Publish reportou "Up to date" havendo uma migration nova com timestamp > último Publish em `main`.

---

## 10. Histórico

- **2026-05-17** — Sprint MCS v1 fechado. 7 bugs corrigidos no caminho (ver §4). Validação produção 804/804 sincronizados. Backlog v2 definido.
- **2026-05-17** — Documento criado.

---

## 12. Sync event-aware + fix do cron (2026-06)

### 12.1 Sync por campanha, excluindo eventos passados
A `crm-meta-sync-creatives` é **event-aware** por **exclusão**. Parâmetro de body
**`exclude_past_events`** (**default `true`**) — substitui o antigo
`active_events_only`:

- `true` (default): sincroniza criativos de **TODAS as campanhas EXCETO as ligadas
  a eventos JÁ OCORRIDOS**. Campanhas **sem evento** (`linked_event_id IS NULL`) são
  **sempre incluídas** — os criativos pertencem às campanhas, não aos eventos.
- `false`: sync total (sem exclusão).

**Porque mudou:** o `active_events_only` (só `status='active' AND date >= hoje`)
era demasiado restritivo — deixava de fora campanhas sem evento e campanhas de
eventos futuros não marcados `active`. Os criativos pertencem às campanhas; só os
de eventos **passados** é que não interessam.

**Critério de "evento já ocorrido"** (Step 0): `status = 'completed'` **OU** a
última **data efetiva** `< CURRENT_DATE`. A data efetiva respeita a hierarquia de
eventos (ver §12.6): se o evento tem **filhos** (`parent_event_id`), usa
`MAX(date dos filhos)`; senão, o próprio `date` (o `date` do PAI multi_day/festival
não é fiável — fica com a data de criação).

**Implementação:** eventos passados → `pastCampaignSet` (campanhas com
`linked_event_id` passado). O Step A percorre `meta_ad_snapshot` (paginado, range
1000) e exclui os ads dessas campanhas. Um **criativo entra se aparecer em pelo
menos uma campanha NÃO passada** — só fica de fora o criativo cujas campanhas são
**TODAS** de eventos passados. Resto (re-host, parsers, `max_creatives_per_run`,
audit) intacto. Resposta inclui `exclude_past_events`, `past_event_count`,
`past_campaign_count`.

### 12.2 Fix do cron (jobid 30, Live-only)
O cron estava `active=false` E com a URL a apontar para o projeto **Test**
(`ukpuhoynrqobqtzdbysp`) em vez do **Live** (`sfohvvlqccmmebvjgibx`). Nota: o
mapeamento de projetos inverteu-se face às migrations de 2026-05 (churn de
duplicação) — o canónico **agora** é `sfohvvlqccmmebvjgibx`, confirmado em Live.

Script pronto a colar no Live SQL Editor:
[supabase/manual/fix_cron_meta_sync_creatives_live.sql](../../supabase/manual/fix_cron_meta_sync_creatives_live.sql).
Corrige a URL → Live, reativa (`cron.schedule` recria com `active=true`), põe
`max_creatives_per_run=100` (apanha o backlog sem arriscar timeout) e
`exclude_past_events=true` no body. Abordagem segura:
`unschedule`+`schedule` **por jobname** (gotchas de permissão com `cron.alter_job`).
Caveat: o re-host de 200 era borderline no wall-clock (~195s) — por isso baixou-se
para 100 (~100-150s, com folga); o set-diff incremental + upsert no fim garantem
que nada se perde se uma corrida estoirar.

> **Pré-requisito de permissões** (ver §12.4): o sync event-aware exige `GRANT
> SELECT` em `crm.meta_campaign_snapshot` e `public.events` ao `service_role`.

> Crons são **Live-only**: não versionar como migration. O ficheiro vive em
> `supabase/manual/` como referência; aplica-se à mão no Live SQL Editor.

### 12.3 Auto-link "Deive Leonardo - Lisboa" (investigação)
Evento ativo (01/10) com **0 campanhas ligadas**. Queries read-only de diagnóstico
em [supabase/manual/investigate_deive_leonardo_autolink.sql](../../supabase/manual/investigate_deive_leonardo_autolink.sql).
Hipótese provável: **falta de link** — existem campanhas Meta do Deive Leonardo
com `linked_event_id` NULL (nunca associadas), e não "evento ainda sem campanhas".
Fix proposto (NÃO aplicar sem revisão): `UPDATE crm.meta_campaign_snapshot SET
linked_event_id = <event_id> WHERE external_campaign_id IN (...)` com os ids
confirmados pelas queries. Enquanto não houver link, o sync event-aware não apanha
os criativos deste evento (é o comportamento correto: sem link, não há como saber
que pertencem a um evento ativo).

### 12.4 Incidente: `permission denied` + GRANTs necessários
Na primeira corrida real, o sync event-aware falhou com **`permission denied for
table meta_campaign_snapshot`**. Causa: o cron corre como role **`service_role`**,
que não tinha `SELECT` nas tabelas que o Step 0 consulta (`crm.meta_campaign_snapshot`
e `public.events`). Os syncs anteriores nunca expuseram isto porque só liam tabelas
onde o `service_role` já tinha GRANTs (`meta_creatives`, `meta_sync_state`).

**Fix** (aplicado em Live à mão; versionado em
[supabase/migrations/20260608010000_grant_sync_creatives_event_aware.sql](../../supabase/migrations/20260608010000_grant_sync_creatives_event_aware.sql)):
```sql
GRANT SELECT ON crm.meta_campaign_snapshot TO service_role;
GRANT SELECT ON public.events             TO service_role;
```
Reforça a Lição §5.1: **toda a tabela nova que uma edge function via `service_role`
passe a ler precisa de GRANT explícito** — não é herdado.

### 12.5 Backfill concluído
O backfill ficou **concluído**: **934 criativos** em `crm.meta_creatives` para o
tenant, dos quais **129 dos eventos ativos**. As corridas diárias do cron mantêm
este número a ~0 de backlog.

### 12.6 Tipos de evento + sync vs herança
`public.events.event_type` ∈ **{ `simple`, `multi_day`, `festival` }** (default
`simple`). Hierarquia via `parent_event_id`: um pai `multi_day`/`festival` agrupa
**filhos** (cada um com a **data real** da sua cidade/dia). O `date` do **PAI não
é fiável** — fica com a data de criação; a data real vive nos filhos. Daí a regra
da **última data efetiva**: `MAX(date dos filhos)` se houver filhos, senão o
próprio `date`.

**Sync ≠ herança** (distinção chave):
- **O sync** (`crm-meta-sync-creatives`) **não** filtra por evento — só exclui
  campanhas de eventos passados. Garante que os criativos existem em DB.
- **A herança** (criação de campanha do zero, Etapa 5 — `crm-meta-campaign-new-design`
  via `crm-meta-redesign-inventory` com `event_id`) **agrupa** criativos por evento,
  por osmose através da campanha (`linked_event_id`), para construir o pool de
  reaproveitamento de um evento concreto.

Detalhe completo: `.lovable/memory/features/mp-audience-event-types-sync.md`.

### 12.7 Re-host robusto (poison-pill batch) — Turnê Simone Mendes 2026
**Sintoma:** 9 criativos novos (8 `[VID]` + 1 `[Banner]`) das campanhas Simone
Mendes 2026 (28/04 e 11/05) nunca sincronizavam — consistente, lotes pequenos
(max 20) também não, logo **não era timeout**.

**Causa (por análise de código; logs de Live não acessíveis a partir do agente):**
o re-host inseria criativos *independentemente* do resultado (uma falha graciosa
de re-host NÃO impede o UPSERT). Portanto, para um criativo ficar **eternamente
"missing"**, a run tinha de **abortar antes do UPSERT**. Havia dois caminhos de
queda silenciosa que o provocam:
1. **Re-host a lançar exceção não isolada.** O loop `for (const row of rows)
   await rehostCreative(...)` **não** tinha `try/catch`, e `rehostCreative` —
   apesar do comentário "nunca lança" — não guardava `resp.arrayBuffer()` nem o
   `upload`. Um poster de vídeo cujo corpo falha a meio do download (CDN da Meta)
   fazia o handler lançar → **500** → **nada** persistido nessa run. Como o UPSERT
   é no fim, o lote inteiro (incl. estes 9) ficava por inserir e era re-tentado
   **idêntico** em cada run (poison-pill batch). Explica os 4 sintomas.
2. **Erro de asset individual na Graph silenciado.** Em `batchFetchCreatives`, um
   criativo devolvido como `{ error: {...} }` (asset sem permissão / vídeo em
   processamento) era descartado **sem log**; no loop principal `if (!creative)
   { skipped++; continue; }` não inseria a row → "missing" permanente.

**Fix (branch, sem deploy):**
- `rehostCreative` passa a guardar `arrayBuffer()` e `upload` → devolve `failed`
  (`download_body_threw` / `upload_threw`) em vez de lançar (honra o contrato).
- O loop de re-host no sync ganha `try/catch` por asset (cinto e suspensórios) —
  uma exceção nunca aborta a run; o criativo é inserido na mesma (com o URL
  original da Meta) e o re-host re-tenta noutra run.
- Diagnóstico: log `rehost_failed` (type + file_url + reason), log
  `graph_creative_error` (message/code/subcode por criativo) e log
  `graph_not_fetched` (ids pedidos que a Graph não devolveu). Na próxima run, os
  logs dizem **exatamente** qual o caminho (acesso vs formato vs leitura) destes 9.

**Ficheiros:** `supabase/functions/_shared/rehost-creative.ts`,
`supabase/functions/crm-meta-sync-creatives/index.ts`.

### 12.8 Shape Instagram (`object_story_spec` só com page_id/instagram_user_id)
**Sintoma:** ~58 criativos (Simone Mendes 2026 e outros eventos ativos; ex.
`120203119994160595`, `120203120168500595`, vídeos) caíam no fallback "Unknown
shape" do `parseCreativeFields` e nunca sincronizavam com imagem. **Não** era
re-host nem token — a Graph **devolve** o criativo; o parser é que não tinha caso.

**Shape:** `object_story_spec` contém **apenas** identidade (`page_id`,
`instagram_user_id` — por vezes `instagram_actor_id`), **sem** `video_data` /
`image_data` / `link_data` / `template_data`. É o formato de anúncios **Instagram
nativos / a partir de um post IG existente**: o asset visual **não está no spec**
— vive no **nível de topo** do creative (`video_id`, `image_hash`, `image_url`,
`thumbnail_url`) e/ou nas referências ao post/media IG
(`effective_object_story_id`, `source_instagram_media_id`).

> ⚠️ **Nota:** o fetch real à Graph para confirmar o JSON destes ids **não foi
> possível a partir do agente** (sem token Meta acessível). O caso foi
> implementado a partir do shape confirmado por logs + referência da Graph API,
> de forma **defensiva** (cobre topo e referências de post/media). Os logs da 1ª
> corrida pós-deploy confirmam o caminho real (ver contadores abaixo).

**Tratamento (caso dedicado nº 6 no `parseCreativeFields`):**
1. Deteção: `object_story_spec` tem identidade e **nenhuma** chave de media inline
   (as ricas já retornam antes) e sem `asset_feed_spec`.
2. Extrai do topo: `video_id`, `image_hash`, `file_url = image_url ?? thumbnail_url`.
   `type` = `video` se houver `video_id`; `image` se houver hash/url; senão a
   determinar.
3. Carrega as referências IG (`effective_object_story_id`, `source_instagram_media_id`).
4. Resolução do `file_url` **reusa** o que já existe + 1 resolver novo:
   - `resolveVideoThumbnail(video_id)` → poster do vídeo (caminho existente).
   - `resolveImageHashes(image_hash)` → imagem (caminho existente, passo 3b).
   - **`resolveStoryMediaUrl(ref)`** (novo, mesmo padrão de retry): quando o topo
     não trouxe nada, resolve o poster via `GET /{effective_object_story_id|
     source_instagram_media_id}?fields=full_picture,picture`. Se trouxer poster e
     o tipo estava indeterminado, fixa-o em `image`.
5. O **re-host subsequente corre na mesma** sobre o `file_url` resolvido (é uma
   imagem). `exclude_past_events` e o set-diff **não** foram tocados.

Novos campos pedidos à Graph (`CREATIVE_FIELDS`): `effective_object_story_id`,
`source_instagram_media_id`, `instagram_permalink_url`. Novos contadores em
`parse_stats`: `file_url_resolved_via_ig_story`, `meta_api_calls.ig_story_count`.

**Ficheiro:** `supabase/functions/crm-meta-sync-creatives/index.ts`.

---

## 11. Referências

- `INTEGRATIONS.md` (raiz) — catálogo curto de integrações; entrada do MCS deve ser adicionada.
- `meta-ads.md` (sibling) — integração OAuth + audiences + campaigns. MCS é sub-integração: consome connection + access_token configurado pelo flow OAuth documentado lá.
- `lovable-mcp.md` — para inspeção de DB durante debug (Lovable MCP esteve em outage 2026-05-16/17, fallback é SQL Editor directo).
- `crm-meta-campaign-redesign` (edge function) — consumidora a jusante: lê `crm.meta_creatives` para construir `inherited_creatives` no plano de redesign.
- `crm-meta-creative-analyze` (edge function) — consumidora futura (Backlog P1): correrá score IA sobre cada criativo sincronizado.
- [Meta Graph API — Ad Creative](https://developers.facebook.com/docs/marketing-api/reference/ad-creative) — versão pinada `v19.0`.
