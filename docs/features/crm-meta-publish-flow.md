# Fluxo de Publicação Meta (plano → adsets → ads)

> Documentação canónica do caminho real pelo qual uma campanha/anúncio Meta sai do MP Audience e chega ao Meta Ads.
> Criado em 29/jun/2026 para evitar reinvestigar isto em cada sessão.

## TL;DR (lê isto primeiro, antes de investigar publicação de criativos)
- A publicação de campanhas/anúncios no Meta é feita por **`crm-meta-publish-execute`**. **NÃO sobe vídeos na hora** (não há POST `/advideos` aqui).
- Um criativo de **VÍDEO** só é publicável pelo caminho oficial se tiver **`meta_video_id`** preenchido em `crm.meta_creatives`. Quem preenche isso: `crm-meta-upload-creative-v2` (no upload) e/ou `crm-meta-sync-creatives` (quando o spec do creative no Meta já traz `video_data.video_id`).
- Se um vídeo NÃO tem `meta_video_id` mas tem `meta_creative_id`, cai no ramo **"reused"** (`creative: { creative_id }`). Se não tem nenhum dos dois, é **saltado** (`aviso: creative_sem_meta_id`).
- `crm-meta-create-reels-ad` (publicação de Reels isolado) **USA O MESMO mecanismo**: `object_story_spec.video_data.video_id`. Não é um caminho novo, é uma cópia fiel do ramo vídeo de `buildSingleAssetCreative`.

## Regra de ouro
Antes de assumir que "não dá para publicar um vídeo", verifica se o criativo **em causa** tem `meta_video_id`.

Os criativos que **já estão publicados** numa campanha no ar **têm** `meta_video_id`. Criativos com `meta_video_id = NULL` na biblioteca são **órfãos** que nunca foram publicados — não confundir com os criativos em uso. Exemplo concreto auditado em 29/jun/2026: campanha "[MP Audience] Ivete Clareou 2026" (`meta_campaign_id=120255473280780595`, plano `93529702-76c7-491f-95dd-040ed7fcee25`, estado `publicado`) — os 3 criativos de vídeo referenciados nos `adsets→anuncios→creative_ids` têm `meta_video_id` preenchido; os criativos de vídeo com `meta_video_id NULL` que aparecem na biblioteca são outros, nunca entraram no plano publicado.

## O caminho real (com referências de código)

Tudo em `supabase/functions/crm-meta-publish-execute/index.ts`.

1. **Ler plano** — L135-141: `SELECT id, company_id, event_id, design_id, objetivo, orcamento_total_cents, moeda, link_destino, adsets, estado, meta_campaign_id, start_time, end_time FROM crm.meta_publish_plan WHERE id=…`. Valida `company_id` (L142) e bloqueia re-publicação se `estado='publicado'` (L143-145).

2. **Resolver criativos** — L250-281: percorre `adsets[].anuncios[].creative_ids[]` (uuids internos), faz uma query única a `crm.meta_creatives` e constrói um `Map<uuid, CreativeInfo>` com `{ meta_creative_id, meta_image_hash, meta_video_id, type, file_url, width, height }`. **Nesta fase NÃO há chamadas ao Graph para criativos** — tudo é lido da nossa BD.

3. **Decidir bucket por criativo** — L642-645 em `buildAdPayloads`:
   ```ts
   const tipo = (tipoLower === "image" && info.meta_image_hash) ? "image"
              : (tipoLower === "video" && info.meta_video_id)   ? "video"
              : "other";
   ```
   - `image` exige `meta_image_hash`.
   - `video` exige `meta_video_id` na nossa base.
   - Tudo o resto cai em `other`; se não tiver `meta_creative_id`, é descartado (L646).

4. **Agrupar** — `groupAssets` (L599-623): emparelha 1 feed + 1 vertical do mesmo tipo (multi-placement, `asset_feed_spec`); sobras viram single; `other` com `meta_creative_id` viram `reused`.

5. **Montar payload de cada ad** — `buildSingleAssetCreative` (L501-534) tem **três ramos**, por esta ordem:
   - **Imagem** (L506-517): `object_story_spec.link_data` com `image_hash`, `message`, `name`, `link`, `call_to_action`.
   - **Vídeo** (L518-528): `object_story_spec.video_data` com `video_id: info.meta_video_id`, `message`, `title`, `call_to_action`. Thumbnail é gerada pelo Meta a partir do `video_id` (comentário L525).
   - **Reused** (L530-531): `{ creative: { creative_id: info.meta_creative_id } }` — fallback final quando não há hash nem video_id. Aviso: `copy_e_link_nao_aplicados` (copy/link ficam os do adcreative original).
   - Sem nenhum dos três (L533): devolve `creative=null`, aviso `creative_sem_meta_id` → o ad é saltado.

6. **POST aos ads** — L675-694: cada grupo vira `{ name, adset_id, status: "PAUSED", creative }` e é enviado a `/<ad_account_id>/ads`. **`status="PAUSED"` é hardcoded** — ativação é decisão humana posterior (`crm-meta-publish-activate`).

7. **Persistência do estado** — L772-871: o plano é atualizado em `crm.meta_publish_plan` durante todo o processo (`estado='a_publicar'` no início, `'publicado'` no fim, ou `'falhado'` com `publish_error` em qualquer falha). Os `meta_ad_id`/`meta_ad_ids` reais devolvidos pelo Graph são gravados de volta no JSON `adsets`.

## Estrutura do plano (`crm.meta_publish_plan`)

Colunas reais:
- `id` (uuid), `company_id`, `event_id`, `design_id`
- `objetivo` (ex.: `OUTCOME_TRAFFIC`), `orcamento_total_cents`, `moeda`
- `link_destino` (URL único usado em todos os ads do plano)
- `adsets` (jsonb) — array de `{ … , anuncios: [ { headline, corpo, cta, creative_ids:[uuid], meta_ad_id?, meta_ad_ids?[] } ] }`
- `estado` (texto: `rascunho` → `a_publicar` → `publicado` | `falhado`)
- `meta_campaign_id` (preenchido após sucesso da campanha)
- `publish_started_at`, `publish_finished_at`, `publish_error`
- `published_at`, `activated_at`, `activated_by`, `activation_error`
- `start_time`, `end_time`, `created_by`, `created_at`, `updated_at`, `resumo`

Os criativos são referenciados **por uuid interno** (`crm.meta_creatives.id`), não por `meta_creative_id`. A resolução `uuid → CreativeInfo` é feita só no momento da publicação (passo 2 acima).

## Como preencher `meta_video_id` em falta

Quando um criativo de vídeo está na biblioteca com `meta_creative_id` preenchido mas `meta_video_id` NULL, há dois caminhos disponíveis (read-only — não há código novo a escrever):

- **`crm-meta-peek-video-ids`** (`supabase/functions/crm-meta-peek-video-ids/index.ts`) — read-only: aceita `{ company_id, meta_creative_ids: string[] }`, faz `GET /<creative_id>?fields=object_story_spec{video_data{video_id}},video_id` ao Graph (v21.0) e devolve `{ meta_creative_id, video_id, video_status, erro }` por id. **Não persiste** — só lê.
- **`crm-meta-upload-creative-v2`** — quando o vídeo é subido pela plataforma (POST `/advideos`), grava `meta_video_id` na linha de `crm.meta_creatives`. Caminho normal de novos criativos.
- **`crm-meta-sync-creatives`** — sync diário; persiste `meta_video_id` se o spec do creative no Meta já o trouxer.

Para desbloquear um criativo concreto sem mexer em código: correr `crm-meta-peek-video-ids` para o seu `meta_creative_id` e, com o resultado, fazer um `UPDATE` pontual em `crm.meta_creatives.meta_video_id`. A partir daí o caminho oficial (`buildSingleAssetCreative` ramo vídeo) funciona ponta-a-ponta.

## Funções relevantes (índice)

- **`crm-meta-publish-execute`** — publica um `meta_publish_plan` no Meta (campaign → adsets → ads, tudo `PAUSED`). Caminho canónico da Faixa B.
- **`crm-meta-create-reels-ad`** — publica UM anúncio de Reels num adset existente, reutilizando um criativo da biblioteca. Réplica fiel do ramo vídeo de `buildSingleAssetCreative` (L518-528 do publish-execute). `status="PAUSED"` hardcoded, `dry_run=true` por defeito.
- **`crm-meta-upload-creative-v2`** — sobe ficheiro (imagem ou vídeo) ao Meta e persiste `meta_image_hash` / `meta_video_id` em `crm.meta_creatives`. Única forma normal de obter `meta_video_id` num criativo novo.
- **`crm-meta-sync-creatives`** — sync diário que traz criativos existentes do Meta para `crm.meta_creatives`. Quando o spec já tem `video_data.video_id`, persiste.
- **`crm-meta-peek-video-ids`** — read-only: descobre `video_id` real de um `meta_creative_id` existente via Graph, sem escrever.
- **`crm-meta-publish-prepare`** — calcula o plano (audiences, budgets, ads) antes da publicação; produz o `meta_publish_plan`.
- **`crm-meta-publish-activate`** — ativação humana posterior dos ads/adsets que nasceram `PAUSED`.

## Anti-pattern

- **Não inventar caminho novo para "publicar vídeo sem `meta_video_id`"**. Se um vídeo não pode ser publicado, ou se preenche `meta_video_id` (peek/upload/sync), ou se aceita o ramo `reused` via `meta_creative_id` (copy/link do adcreative original ficam aplicados).
- **Não confundir biblioteca com publicado**: a `meta_video_id NULL` é uma propriedade do **registo na biblioteca**, não da campanha em execução.
