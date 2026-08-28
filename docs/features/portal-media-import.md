# portal-media-import

Importa uma imagem a partir de um URL público (ex.: link directo do Google Drive)
para o bucket `portal-marketing-images` e grava o URL público no slot
correspondente de `event_marketing`. Evita o passo manual de descarregar e voltar
a subir pelo ImageUploader do CRM.

| Peça | Caminho |
| --- | --- |
| Edge function | `supabase/functions/portal-media-import/index.ts` |
| Bucket | `portal-marketing-images` (público) |
| Tabela alvo | `public.event_marketing` |

## Contrato

`POST /functions/v1/portal-media-import`

```json
{ "event_id": "<uuid>", "slot": "poster" | "hero" | "og", "source_url": "https://..." }
```

Slots → colunas:

- `poster` → `poster_vertical_url`
- `hero` → `hero_image_url`
- `og` → `og_image_url`

Resposta OK:

```json
{ "ok": true, "slot": "poster", "url": "https://.../poster-1756...jpg", "bytes": 482113, "content_type": "image/jpeg" }
```

Regras e erros:

- `source_url` tem de ser **https**; redirects são seguidos (o
  `uc?export=download` do Drive redirecciona para `googleusercontent.com`).
- Só `image/jpeg`, `image/png`, `image/webp` (415 caso contrário).
- Máximo **15 MB** (413).
- Se o Drive devolver a página de confirmação (`text/html`), a resposta é 422 com
  mensagem explícita a pedir um link directo.
- Evento inexistente → 404. Sem row de `event_marketing` → 409 (a função **não**
  cria a row).

## Autorização

`verify_jwt = true` no `config.toml` **e** comparação explícita do
`Authorization: Bearer` com `SUPABASE_SERVICE_ROLE_KEY`. Não há acesso anónimo
nem por JWT de utilizador — só service_role.

Chamada a partir da BD com a key do Vault:

```sql
select net.http_post(
  url := (select value from public.app_secrets where name = 'project_functions_base_url')
         || '/functions/v1/portal-media-import',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                   where name = 'email_queue_service_role_key')
  ),
  body := jsonb_build_object(
    'event_id', '<uuid>',
    'slot', 'poster',
    'source_url', 'https://drive.google.com/uc?export=download&id=<file-id>'
  )
);
```

## Nota crítica — path por empresa

O path do ficheiro é
`${company_id}/events/${event_id}/${slot}-${timestamp}.${ext}`.

O **primeiro segmento tem de ser o `company_id`**: as policies do bucket fazem
isolamento por path (`storage_path_belongs_to_current_company` / prefixo da
empresa). Alterar o padrão do path quebra o acesso multi-tenant.
