---
name: MP Audience — rehost falhado não rebenta sync de criativos
description: Fix 23502 NOT NULL storage_bucket em crm.meta_creatives quando rehost falha (CDN Instagram expirada)
type: feature
---

## Contexto
Full Sync da UI passou a invocar `crm-meta-sync-creatives` (max 2000/run). Na Siriguella o passo devolvia 500 com Postgres `23502`:
`null value in column "storage_bucket" of relation "meta_creatives" violates not-null constraint`.

## Causa
Em `supabase/functions/crm-meta-sync-creatives/index.ts`:
- Linha ~819: `row.storage_bucket = REHOST_BUCKET` só era atribuído no branch `rehosted`.
- Linhas 823–840: quando o rehost falhava (típico em criativos antigos com URLs CDN Instagram expiradas, ex.: Fortal 2023), o código deliberadamente mantinha a row no batch para inserir com `file_url` original do Meta, mas `storage_bucket` ficava `null`.
- DB: `crm.meta_creatives.storage_bucket` é NOT NULL (default `'crm-meta-creatives'`). O UPSERT do chunk rebentava e a função devolvia 500, perdendo o batch todo (mesmo os criativos com rehost OK).

## Fix
Inicializar `storage_bucket: REHOST_BUCKET` na construção do `row` (linha ~755), garantindo que nenhum caminho chega ao UPSERT com null. O branch de sucesso continua a sobrepor com o mesmo valor + `storage_path` real. `storage_path` continua `null` quando rehost falha (coluna nullable).

## Não alterado
- `onConflict` do upsert (UNIQUE total).
- Paginação / set-diff.
- Comportamento de `file_url` original do Meta em falhas de rehost.
- Cron diário.
