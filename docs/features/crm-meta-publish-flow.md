# Fluxo de Publicação Meta (plano → adsets → ads)

> Memória técnica — levantado a 29/jun/2026 a partir do código real.
> Objectivo: nunca mais reinvestigar este fluxo do zero.
>
> **Alvo: evento OU artista+música (D-ERP95, 19/09/2026).** `crm.meta_publish_plan`
> aceita `event_id` XOR (`artist_id`+`song_id`+`connection_id`); CHECK
> `meta_publish_plan_one_target` + trigger `trg_song_target_coherent`. A F1 é só
> schema — o comportamento para evento está inalterado byte a byte; o alvo música
> entra nas fases F2/F3.

## TL;DR (a regra que nos morde sempre)
- Um criativo de **vídeo** só é publicável pelo caminho oficial se tiver **`meta_video_id`** preenchido em `crm.meta_creatives`.
- Um criativo de **imagem** precisa de **`meta_image_hash`**.
- Se faltarem ambos mas houver **`meta_creative_id`**, cai no ramo **"reused"** (`creative: { creative_id }`) — reutiliza o adcreative inteiro.
- Se não houver nada disto, o criativo **NÃO é publicável** (é saltado com aviso `creative_sem_meta_id`).
- O `publish-execute` **NÃO sobe vídeos na hora** (não chama `/advideos`). Quem preenche `meta_video_id` é o `crm-meta-upload-creative-v2` (no upload) e/ou o `crm-meta-sync-creatives` (quando lê o spec do Meta).
- **ARMADILHA:** a tabela `crm.meta_creatives` tem muitos vídeos com `meta_video_id` NULL — esses **nunca foram publicados**. Os que estão em uso numa campanha publicada **têm** `meta_video_id`. Não confundir "está na biblioteca" com "está publicável".

## Funções envolvidas

| Função | Papel |
|---|---|
| `supabase/functions/crm-meta-publish-execute/index.ts` | Lê o plano (`crm.meta_publish_plan`), resolve `creative_ids` → `CreativeInfo`, monta payloads e faz `POST /<ad_account>/ads`. Todos os ads nascem `status: "PAUSED"`. |
| `supabase/functions/crm-meta-upload-creative-v2/index.ts` | Sobe ficheiro ao Meta (vídeo → `/advideos`, imagem → `/adimages`) e **grava** `meta_video_id` / `meta_image_hash` de volta em `crm.meta_creatives`. |
| `supabase/functions/crm-meta-sync-creatives/index.ts` | Lê creatives do Meta e persiste metadados (inclui `meta_video_id` quando o spec o traz). |
| `supabase/functions/crm-meta-peek-video-ids/index.ts` | **READ-ONLY**. Extrai `video_id` de um `meta_creative_id` existente (`GET ?fields=object_story_spec{video_data{video_id}}`). |
| `supabase/functions/crm-meta-create-reels-ad/index.ts` | Cria UM ad de Reels num adset existente. Usa o **mesmo** mecanismo do publish-execute (`object_story_spec.video_data.video_id`). Nasce `PAUSED`. Tem `dry_run` default `true`. |

## Sequência real do `publish-execute`

1. **L134-138** — `SELECT` em `crm.meta_publish_plan` por `id` (colunas: `id, company_id, event_id, design_id, objetivo, orcamento_total_cents, moeda, link_destino, adsets, estado, meta_campaign_id, start_time, end_time`).
2. **L143-148** — guarda de estado: rejeita se já `publicado`; aceita `rascunho | pronto_a_publicar | a_publicar | falhado`.
3. **L150-158** — regra de orçamento: com `end_time` → `lifetime_budget` (exige `start_time`); sem → `daily_budget`.
4. **L250-283** — recolhe todos os `creative_id` (uuid interno) dos `adsets[].anuncios[].creative_ids[]` e faz UMA query a `crm.meta_creatives` que devolve `CreativeInfo { meta_creative_id, meta_image_hash, meta_video_id, type, file_url, width, height }`.
5. **L629-697 `buildAdPayloads`** — para cada anúncio, classifica os criativos, agrupa (feed+vertical do mesmo tipo → multi-placement; resto → single ou reused), e devolve N payloads `{ name, adset_id, status: "PAUSED", creative }`.
6. **L782-790** — cria a campanha (`POST /<ad_account>/campaigns`) se ainda não existir, persiste `meta_campaign_id`.
7. Cria adsets e depois `POST /<ad_account>/ads` com cada payload (status sempre `PAUSED`).

## Estrutura do plano (`crm.meta_publish_plan`)

Colunas reais (lidas em L136):
- `id`, `company_id`, `event_id`, `design_id`
- `objetivo` (ex. `OUTCOME_TRAFFIC`, `OUTCOME_SALES`…)
- `orcamento_total_cents`, `moeda`
- `link_destino`
- `adsets` (jsonb) — array de adsets, cada um com `anuncios[]`, cada anúncio com `creative_ids[]` (uuids internos), `cta`, `headline`, `corpo`
- `estado` (`rascunho` | `pronto_a_publicar` | `a_publicar` | `publicado` | `falhado`)
- `meta_campaign_id` (preenchido após criar no Meta)
- `start_time`, `end_time`

## Como é montado o campo `creative` (os 3 ramos)

Em `buildSingleAssetCreative` (cita L518-533):

1. **Imagem** (L506-516 acima do excerto): `object_story_spec` com `link_data { image_hash, name, link, call_to_action }` + `page_id` (+ `instagram_actor_id` opcional). Precisa `meta_image_hash`.
2. **Vídeo** (L518-528): `object_story_spec` com `video_data { video_id, message, title, call_to_action }` + `page_id` (+ `instagram_actor_id`). Precisa `meta_video_id`. Capa é gerada pelo Meta a partir do `video_id` (não enviamos thumbnail). Devolve aviso `video_em_processamento`.
3. **Reused** (L530-531): `{ creative: { creative_id: info.meta_creative_id } }`. Reutiliza o adcreative inteiro — **não permite sobrepor copy/link** (aviso `copy_e_link_nao_aplicados`).
4. **Sem caminho** (L533): `creative: null` + aviso `creative_sem_meta_id` — o ad não é criado.

A classificação que decide o ramo está em L642-645:

```ts
const tipo: "image" | "video" | "other" =
  (tipoLower === "image" && info.meta_image_hash) ? "image" :
  (tipoLower === "video" && info.meta_video_id)   ? "video" : "other";
if (tipo === "other" && !info.meta_creative_id) continue; // saltado
```

POST final em L678/L690: `{ name, adset_id, status: "PAUSED", creative }`.

## Placements / Reels

Placements vivem no **ADSET**, não no ad. O `publish-execute` **não toca em placements**. Um adcreative de vídeo 9:16 serve para Reels desde que o adset tenha o placement Reels habilitado. O mesmo `meta_creative_id` (via ramo reused) pode ser servido em Feed e Reels — a decisão é do delivery do Meta.

## Armadilhas conhecidas (histórico)

- **`meta_video_id` NULL em muitos vídeos da biblioteca** = criativos que nunca passaram pelo upload/sync completo. Não é bug; só nunca foram publicados. Para os tornar publicáveis sem novo upload: correr `crm-meta-peek-video-ids` contra o `meta_creative_id` correspondente e persistir o `video_id` de volta.
- **`meta_campaign_snapshot` / `meta_adset_snapshot`** andam cronicamente dessincronizados do estado real do Meta — **não confiar neles como fonte de verdade**. Para estado real, ler o Meta directamente.
- **Recomendações da Graph API** só são expostas ao nível da **CONTA** (`/act_<id>/recommendations`), não por campanha/adset/ad.
- **`object_story_spec` no ramo vídeo** omite propositadamente `image_url`/`image_hash` (L525) — o `file_url` é o `.mp4` e não serve como imagem. Meta gera capa do `video_id`.
- **Tecto de 50 ads/adset** (L655) — `buildAdPayloads` trunca com aviso `ads_truncados_limite_meta`.

## Onde isto foi investigado

Levantado a **29/jun/2026** no contexto da construção de `crm-meta-create-reels-ad` e do `ReelsCreativePickerDialog`, depois de confusão repetida sobre porque é que certos vídeos da biblioteca não publicavam. Doc criado para servir de memória persistente — antes de reinvestigar, ler este ficheiro.

## Contrato do plano de alvo MÚSICA (D-ERP95 F2a, 19/09/2026)

Planos de música criam-se por RPC (`public.artist_ads_plan_create(p_artist_id, p_song_id,
p_connection_id, p_plan jsonb)`) e editam-se por `public.artist_ads_plan_update(p_plan_id,
p_plan jsonb)` — só em `rascunho` ou `falhado`. `design_id` fica NULL (o CHECK
`meta_publish_plan_event_needs_design` só exige desenho quando há `event_id`).

O jsonb segue o MESMO contrato de `adsets` que o `crm-meta-publish-execute` já consome:

```json
{
  "objetivo": "TRAFFIC",              // AWARENESS | TRAFFIC | ENGAGEMENT (conversões NÃO)
  "orcamento_total_cents": 30000,
  "link_destino": "https://...",      // em falta, usa artist_songs.smart_link_url
  "start_time": "2026-09-25T10:00:00Z",
  "end_time": null,                    // com end_time o motor usa lifetime_budget
  "resumo": { },
  "adsets": [
    {
      "trigger_nome": "frio-br",
      "orcamento_cents": 10000,        // > 0, obrigatório
      "link_destino": "https://...",  // opcional, override do adset
      "publico_sugerido": {            // segmentação do conjunto
        "geo": ["BR"],                 // OBRIGATÓRIO no alvo música (ISO-2 ou nome do país)
        "idade_min": 18,               // opcional (default 18)
        "idade_max": 65                // opcional (default 65)
      },
      "anuncios": [
        { "headline": "…", "corpo": "…", "cta": "LISTEN_NOW",
          "creative_ids": ["<uuid crm.meta_creatives>"] },
        { "headline": "…", "corpo": "…", "cta": "LISTEN_NOW",
          "existing_post": { "post_ref": "…", "kind": "object_story" } }
      ]
    }
  ]
}
```

Cada anúncio indica **`creative_ids` (biblioteca) OU `existing_post`**
(`kind: 'object_story' | 'instagram_media'`). Na F2a o `existing_post` é apenas
**guardado** — a publicação de post existente é F2b. Candidatos a `post_ref` vêm de
`public.artist_ads_promotable_posts(p_artist_id)`, que só marca `meta_ready=true` quando o
identificador é utilizável pela Marketing API.

Validações da RPC (erros legíveis, ERRCODE 22023): objectivo válido, ≥1 adset, cada adset
com orçamento diário > 0 e ≥1 anúncio, e `link_destino` `https://` obrigatório quando o
objectivo é `TRAFFIC`. A coerência música↔artista↔connection é garantida pelo trigger
`crm.assert_song_target_coherent` (F1). A moeda do plano é a da conta da connection.

**Dry-run.** `POST { company_id, plan_id, dry_run: true }` devolve
`{ ok:true, dry_run:true, estado_plano, payloads:{campaign, adsets, ads}, avisos }` sem
tocar na Graph API nem em nenhuma tabela, em QUALQUER estado do plano (incluindo
`publicado`). Default de `dry_run` é **TRUE**: só publica com `dry_run:false` explícito.
Plano com `song_id` devolve `200 { ok:false, error:'alvo_musica_f2b' }`.

## Ramo MÚSICA na publicação (D-ERP95 F2b, 19/09/2026)

`crm-meta-publish-execute` aceita agora `{ company_id, plan_id, dry_run?, preflight? }`
e serve dois alvos. O alvo é resolvido por `_shared/campaign-target.ts`
(`resolveTarget`) — para `event_id` é uma extracção literal do caminho antigo, com as
mesmas queries, ordem e erros. Alvo música (`song_id`):

- **Conta/token/Página/Instagram** da ligação do plano (`connection_scope='artist'`,
  `status='active'`, `selected_ad_account_id` obrigatório). Sem pixel. `page_id` em
  falta é derivado do prefixo de `effective_object_story_id` mais frequente em
  `crm.meta_ad_snapshot`; `instagram_user_id` em falta é resolvido pela Graph API.
  Ambos são gravados na ligação — nunca em `dry_run`.
- **Autorização:** dry_run/preflight aceitam sessão ou service_role; publicar exige
  sessão + `artist_ads_assert_write` (service_role não publica música).
- **Teto obrigatório** em `crm.artist_ads_budget_caps` (erros `sem_teto`,
  `acima_do_teto`, `moeda_do_teto_diferente`).
- **Objectivos:** `AWARENESS`→`OUTCOME_AWARENESS`/`REACH`; `TRAFFIC`→`OUTCOME_TRAFFIC`/`LINK_CLICKS`/`destination_type=WEBSITE`;
  `ENGAGEMENT`→`OUTCOME_ENGAGEMENT`/`THRUPLAY`/`destination_type=ON_VIDEO`. Outro → `objetivo_invalido`.
- **Naming:** campanha `[MP] [TÍTULO-BASE] [Alcance|Tráfego|Visualizações] AAAA-MM-DD`;
  conjuntos e anúncios com prefixo `[MP] `.
- **UTMs:** `url_tags` gerado pelo motor (`utm_source=meta&utm_medium=paid&utm_campaign=…&utm_content=…`).
- **Post existente:** `existing_post { post_ref, kind:'object_story'|'instagram_media' }`
  → `object_story_id` ou `source_instagram_media_id` + `instagram_user_id`; recusado
  com `post_nao_promovivel` se não vier de `artist_ads_promotable_posts` com `meta_ready=true`.
- **Estado:** tudo nasce `PAUSED`. **Lock:** `ja_em_publicacao` (409) com
  `estado='a_publicar'` e `publish_started_at` < 5 min.
- **Espelho:** upsert em `crm.meta_campaign_snapshot` com `linked_song_id` +
  `linked_song_locked=true` logo após criar a campanha.
- **Log:** criações em `crm.meta_entity_actions_log` com `action='create'`.
- **Activação:** `crm-meta-publish-activate` devolve `alvo_musica_f3`.

**Modo `preflight:true`** (ambos os alvos): só GETs, devolve
`{ ok, preflight:true, checks:[{check, ok, detail}] }` — token/`ads_management`, conta
activa e moeda, Página, Instagram, posts promovíveis, teto.

**Lacunas do alvo evento (registadas, não alteradas):** publicar não verifica papel,
não há lock anti-corrida e não são geradas UTMs.
