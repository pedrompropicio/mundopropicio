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

---

## Correção resolução de imagem v5 (2026-06-22)

### Causa
Em `crm-meta-sync-creatives`, o parser do `object_story_spec` preenchia `file_url` com a **miniatura** (`link_data.picture`, `child_attachments[0].image_url/picture`, `image_data.image_url`, etc.) — imagens pequenas servidas pela Meta para preview. O bloco `3b` que resolve via `/adimages` só corria como **fallback** (`file_url === null`), pelo que para imagens onde o spec trazia miniatura, a versão em **alta resolução** nunca era usada. Diagnóstico via `crm-diag-image-resolution` confirmou: `/adimages` devolve 1080×1440 ~180–340 KB, enquanto o que era guardado era miniatura.

### Fix
- Para rows cujo `type ∈ {image, banner, carousel, dpa}` E que tenham `meta_image_hash`, o sync passa a chamar **sempre** `/adimages` e a usar esse URL como `file_url`, **mesmo que o parser já tivesse preenchido um** (miniatura). `/adimages` tem prioridade sobre o `picture` do spec para imagens com hash.
- `resolveImageHashes` agora pede também `width,height` e devolve `{ url, width, height }` por hash; quando aplicado, persiste `row.width`/`row.height` (antes ficavam `null`).
- **Vídeos não são afectados:** `type='video'` continua a usar o poster via `resolveVideoThumbnail`. A regra do bloco `3b` exclui `video`.
- `BUILD_VERSION=ig-native-v5` para validar deploy nos logs.

### Não alterado
- `_shared/rehost-creative.ts` (grava byte-a-byte o que recebe — já estava correcto).
- Tratamento de vídeos (poster mantém-se).
- Paginação, set-diff, event-scoping, cron.
- `file_size_bytes` continua `null` (HEAD por imagem fica para outra fase).
- Schema (`width`/`height` já existiam em `crm.meta_creatives`).

### Como aplicar à Ivete / criativos antigos
Re-sync controlado manualmente (`force_resync=true` via service_role) — não é feito automaticamente.
