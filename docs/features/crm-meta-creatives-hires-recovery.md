# Recuperação de criativos Meta em alta resolução

## Bug

O pipeline `crm-meta-sync-creatives` (v1) combinado com `_shared/rehost-creative.ts`
re-hospedava no bucket público `crm-meta-creatives` o `file_url` que vinha
no objeto creative do Graph API — esse URL aponta para uma **thumbnail
64x64**, não para a imagem original do `image_hash`.

Resultado em produção (company `7c858982-6ccd-47ca-bd65-e0dd3eebf01c`):

- Ficheiros no bucket `crm-meta-creatives/7c8.../*.{png,jpg}` com 64x64 px.
- `crm.meta_creatives.width / height / file_size_bytes` a `NULL`.
- `meta_image_hash` e `meta_creative_id` preenchidos correctamente.

Hashes afectados confirmados (2 imagens distintas, 4 linhas):

| Hash | Ficheiros |
|---|---|
| `3f446050828fc719b93093a965d3a7e3` | `2407881729687574.png`, `2093104824956271.png` |
| `7cc4972a386d8521b899fd1f24a0d479` | `4440196429599087.jpg`, `1462548035903434.jpg` |

## Correcção

Nova edge function **`crm-meta-creatives-recover-hires`** que:

1. Lê os hashes pedidos (default: os 2 acima).
2. Para cada hash chama
   `GET https://graph.facebook.com/v20.0/<ad_account>/adimages?hashes=["<hash>"]&fields=hash,url,permalink_url,width,height`
   usando o token Meta desencriptado por `crm_get_meta_decrypted_token`
   (mesmo padrão das outras `crm-meta-*`).
3. Usa o campo **`url`** (original full-res), nunca `permalink_url`.
4. **Valida `width >= 600`** — se a Meta devolver algo menor aborta o hash
   e regista `width_below_min` em `reason` (não regrava lixo por cima do
   que já lá está).
5. Faz overwrite (`upsert: true`) em **todos** os `storage_path`
   associados a esse `meta_image_hash` na company, para que as N linhas
   que partilham a mesma imagem fiquem coerentes.
6. Faz `UPDATE` em `crm.meta_creatives` com `width`, `height`,
   `file_size_bytes`, `file_mime_type`, `storage_bucket`.

Não apaga linhas. Não toca em criativos fora dos hashes pedidos.

## Marcador de versão

A função arranca com:

```
[crm-meta-creatives-recover-hires] boot 2026-06-16-v1-recover-hires
```

Procurar este marker nos logs de Live (após Publish) confirma o deploy.

## Como invocar

```bash
curl -X POST "https://<project>.functions.supabase.co/crm-meta-creatives-recover-hires" \
  -H "Authorization: Bearer <ACCESS_TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "connection_id": "<crm.ad_platform_connections.id>",
    "ad_account_id": "act_5094207367314169",
    "dry_run": true
  }'
```

Body completo:

```json
{
  "connection_id": "uuid da linha em crm.ad_platform_connections (platform=meta)",
  "ad_account_id": "act_5094207367314169",
  "image_hashes": ["3f446050828fc719b93093a965d3a7e3", "7cc4972a386d8521b899fd1f24a0d479"],
  "dry_run": false
}
```

Resposta (resumida):

```json
{
  "version": "2026-06-16-v1-recover-hires",
  "rehosted": 2,
  "failed": 0,
  "skipped": 0,
  "results": [
    { "hash": "...", "status": "rehosted", "width": 1200, "height": 1200,
      "file_size_bytes": 187234, "paths_overwritten": ["7c8.../2407...png", "7c8.../2093...png"],
      "rows_updated": 2 }
  ]
}
```

Recomendado correr primeiro com `dry_run: true` para confirmar as
dimensões devolvidas pela Meta antes de fazer overwrite.

## Bucket público versionado

O flag `public:true` do bucket `crm-meta-creatives` foi revertido em
publishes anteriores. Tentou-se versionar via migration
`supabase/migrations/...` mas o runner da Lovable **bloqueia SQL sobre
`storage.buckets`** (tanto via `supabase--migration` como via ficheiro
direto). Alternativa registada:

- **Test:** aplicado já via tool `supabase--storage_update_bucket` (idempotente).
- **Live:** correr `supabase/manual/crm_meta_creatives_public_bucket.sql`
  no SQL Editor do dashboard após cada Publish em que o bucket volte a
  ficar privado. Script é idempotente (`UPDATE ... WHERE public IS DISTINCT FROM true`).

## Não corrige o bug de origem

Esta função recupera apenas as imagens já partidas. O bug no sync
(`_shared/rehost-creative.ts` re-hospedar o `file_url` da thumbnail) fica
fora desta intervenção — sync futuro vai voltar a gravar 64x64 para
criativos novos enquanto não for refactorizado.
