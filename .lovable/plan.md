# Publicador de campanhas no Google Ads (espelho do Meta)

Objetivo: criar campanhas no Google Ads a partir do ERP, com o mesmo desenho do publicador Meta (`crm-meta-publish-prepare` → `crm-meta-publish-execute` → `crm-meta-publish-activate` + `MetaPublishPanel`), nascendo sempre EM PAUSA, com dry-run por defeito e motor idempotente desde o primeiro dia.

## 1. Âmbito da fase 1 — concordo: só Pesquisa

Concordo com Pesquisa, por três razões concretas:
- Cadeia de recursos determinística e pequena (5 passos, todos criáveis por API sem criativos de imagem/vídeo).
- Não depende da biblioteca de criativos nem de `meta_video_id`-equivalente (no Google, Performance Max exige asset groups com imagens/logos/vídeos e limites de rácio — é o mesmo pântano que nos morde no Meta).
- Intenção de compra já existente ("bilhetes ivete cascais") é o caso de bilheteira; PMax é para escala depois de haver conversões a alimentar o bidding.

Fora de âmbito nesta fase: Performance Max, Demand Gen, YouTube, Display, extensões de anúncio (sitelinks/callouts), audiências/Customer Match no adgroup, e edição de campanhas já publicadas (só criar + ativar/pausar).

## 2. Cadeia de recursos — Google Ads API v24, pela ordem exacta

Todas as chamadas: `POST https://googleads.googleapis.com/v24/customers/{customer_id}/<serviço>:mutate`, com headers `developer-token`, `login-customer-id` (MCC) e `Authorization: Bearer` — exactamente o padrão já usado em `crm-google-sync-campaigns` e `crm-google-conversion-upload`.

| # | Recurso | Endpoint | Guardar o `resource_name` em |
|---|---|---|---|
| 1 | Orçamento | `campaignBudgets:mutate` | `google_budget_resource` |
| 2 | Campanha (`SEARCH`, `status: PAUSED`, `campaign_budget`, bidding, geo/idioma no passo 5/6, `network_settings` só Search+partners off) | `campaigns:mutate` | `google_campaign_resource` + `google_campaign_id` |
| 3 | Grupo de anúncios (`status: PAUSED`) | `adGroups:mutate` | `ad_groups[i].google_ad_group_resource` |
| 4 | Palavras-chave (`AdGroupCriterion`, `keyword.text` + `match_type`) e negativas | `adGroupCriteria:mutate` (operações em lote) | `ad_groups[i].keywords[j].google_criterion_resource` |
| 5 | Critérios de campanha: geo (`location`), idioma (`language`), e negativas de campanha | `campaignCriteria:mutate` | `campaign_criteria[]` com `{tipo, valor, resource_name}` |
| 6 | Anúncio de pesquisa responsivo (`AdGroupAd`, `status: PAUSED`, `responsive_search_ad` com headlines/descriptions + `final_urls`, `path1/path2`) | `adGroupAds:mutate` | `ad_groups[i].ads[k].google_ad_resource` |

Notas de API que o motor tem de respeitar:
- Cada `:mutate` devolve `results[].resourceName`; é esse (não um id numérico) que serve de chave de idempotência.
- `partial_failure: true` nos lotes de keywords, para uma keyword rejeitada não abortar as restantes; os erros por índice vão para o log do plano.
- Bidding inicial: `maximize_conversions` sem tCPA (ou `target_spend`/Maximize Clicks se a conta ainda não tiver conversões suficientes — decisão do painel, campo `estrategia_lance`).
- `campaign.start_date` / `end_date` no formato `YYYY-MM-DD` (atenção: no *reporting* v24 os campos são `start_date_time`; na criação continua `start_date`).

## 3. Schema — `crm.google_publish_plan`

Uma migration nova em `supabase/migrations/` (nunca SQL Editor em Live), aplicada em Test pelo agente e depois Publish pelo Pedro.

```
crm.google_publish_plan
  id uuid pk default gen_random_uuid()
  company_id uuid not null
  event_id uuid not null
  design_id uuid null            -- opcional nesta fase (não há gerador LLM de plano)
  customer_id text not null      -- conta Google Ads usada
  login_customer_id text null
  objetivo text                  -- 'CONVERSIONS' | 'TRAFFIC'
  estrategia_lance text          -- 'MAXIMIZE_CONVERSIONS' | 'MAXIMIZE_CLICKS'
  conversion_action_ref text     -- meta da campanha (ver §5)
  orcamento_diario_micros bigint not null
  moeda text not null default 'EUR'
  link_destino text not null
  start_date date, end_date date
  geo jsonb                      -- { location_ids:[], paises:['PT'], raio_km, cidade }
  idiomas jsonb                  -- ['pt']
  ad_groups jsonb not null       -- ver forma abaixo
  estado text not null default 'rascunho'
  google_budget_resource text
  google_campaign_resource text
  google_campaign_id text
  campaign_criteria jsonb
  resumo jsonb, publish_error jsonb, activation_error jsonb
  publish_started_at, publish_finished_at, published_at,
  activated_at timestamptz, activated_by uuid
  created_by uuid, created_at, updated_at timestamptz default now()
```

`ad_groups` (jsonb):
```
[{ nome, cpc_max_micros?, google_ad_group_resource?,
   keywords:[{ text, match_type, google_criterion_resource?, erro? }],
   negativas:[{ text, match_type, google_criterion_resource? }],
   ads:[{ headlines:[..], descriptions:[..], path1, path2,
          final_url, google_ad_resource?, erro? }] }]
```

Estados (`CHECK` explícito, com a lição da Fase 3 do Meta: incluir todos desde o início):
`rascunho | pronto_a_publicar | a_publicar | publicado | falhado | ativo | pausado | cancelado`.

RLS igual ao padrão `crm.*`: `tenant_isolation_{select,insert,update}` por `company_id = public.current_company_id()` + `service_role_bypass`; GRANT `USAGE` no schema `crm` e `SELECT/INSERT/UPDATE` a `authenticated` e `service_role`.

Não crio tabelas novas para espelho — `crm.google_campaign` / `google_ad_group` / `google_keyword` já existem e são preenchidas pelo sync (hoje: 2 campanhas, 1 ad group, 25 keywords; `google_asset_group` vazio). O publicador escreve só no plano; o sync continua a ser a leitura do estado real.

## 4. Idempotência e retoma (o ponto crítico)

Princípios, todos herdados do que custou caro no Meta:

1. **Todo o `resource_name` é persistido no plano imediatamente após cada `:mutate` bem-sucedido**, antes de avançar para o passo seguinte. Um timeout a meio deixa gravado tudo o que já existe.
2. **Cada passo começa por verificar se já tem `resource_name`**; se sim, salta. Ordem de verificação: orçamento → campanha → por ad group → por keyword → por ad. Re-correr nunca duplica.
3. **Nada de estado terminal preso**: o `estado` passa a `a_publicar` no arranque, mas a retoma aceita `a_publicar` como estado de entrada (o Meta só conseguiu isto com UPDATE manual — aqui nasce assim). Estados reutilizáveis: `rascunho, pronto_a_publicar, a_publicar, falhado`.
4. **Lock anti-corrida**: `UPDATE ... SET estado='a_publicar', publish_started_at=now() WHERE id=$1 AND (estado <> 'a_publicar' OR publish_started_at < now() - interval '5 minutes') RETURNING id`. Sem linha devolvida = já há corrida a decorrer → devolve `200 { ok:false, error_user_msg:"Publicação já em curso" }`. O painel nunca dispara prepare/regenerar em estados bloqueados (guard no-op, como o `publish-prepare-v8`).
5. **Chaves estáveis** para o merge de plano: cada ad group, keyword e ad recebe um `uid` interno (uuid) na criação do rascunho. O bug das idades 22-65 do Meta veio de match por campo instável — aqui o match é por `uid`, nunca por texto nem por índice.
6. **Falha nunca devolve non-2xx por rejeição do Google**: grava `publish_error`, persiste o parcial, devolve `200 { ok:false, error_user_msg, resultado:[...] }` (padrão da `crm-meta-publish-activate`).
7. **`dry_run` default `true`**: só escreve no Google com `dry_run:false` explícito.
8. **Validação a montante** (§7) corre antes de qualquer chamada, para não criar campanha e falhar no anúncio.

## 5. Objetivo de conversão

O que sei: `crm-google-conversion-upload` envia `uploadClickConversions` com `conversionAction` derivado de `crm.google_conversion.conversion_action_ref` (`customers/{cid}/conversionActions/{id}`), e `crm.google_conversion` tem 0 linhas — nunca correu com dados reais.

O que **não** sei sem credencial: que conversion actions existem na conta e o seu estado. Passo 0 da implementação: adicionar ao `crm-google-sync-campaigns` (ou função de leitura própria) uma query GAQL `SELECT conversion_action.resource_name, name, type, status, category FROM conversion_action`, guardar em `crm.google_conversion_action` (tabela pequena nova) e mostrar no painel como *dropdown* de meta da campanha.

Ligação: o `conversion_action_ref` escolhido no plano é o mesmo valor que o upload offline usa, logo a campanha otimiza exactamente para as compras que enviamos por GCLID. Se a conta não tiver nenhuma conversion action utilizável, fase 1 publica com `MAXIMIZE_CLICKS` e o painel avisa que a otimização por conversões fica indisponível — não bloqueia a publicação.

## 6. Segmentação mínima

- **Geografia**: do evento no ERP (`events` → cidade/país, `cities.country`). O mapa `PT/BR/ES` já existe em `src/lib/country.ts`. País → `geoTargetConstants` de país; cidade → resolvida por `GeoTargetConstantService:suggest` (nome + código de país) e guardada em `geo.location_ids` no plano, com raio opcional. Default proposto: cidade do evento + raio 50 km; fallback país inteiro se a cidade não resolver.
- **Idioma**: derivado do país (`PT`/`BR` → `pt`, `ES` → `es`), editável no painel.
- **Networks**: só Google Search, `search_network`/`content_network` desligados (evita gasto em parceiros sem controlo).

## 7. Validações antes de publicar (RSA)

Limites duros do Google para o anúncio de pesquisa responsivo: 3–15 títulos com ≤30 caracteres, 2–4 descrições com ≤90 caracteres, `path1`/`path2` ≤15, `final_url` com domínio a coincidir com o exibido.

Onde vive: um módulo partilhado de validação (`src/lib/google-rsa-validation.ts`) usado pelo painel **e** re-executado na edge function antes de qualquer `:mutate` — o painel não é fonte de verdade.
- Painel: erros por campo em tempo real, botão "Publicar" desativado enquanto houver erro.
- Edge: se falhar, devolve `200 { ok:false, error_user_msg, erros:[{caminho, motivo}] }` **sem criar nada**.
- Rejeições do próprio Google (policy) chegam depois da criação: gravadas em `publish_error` e mostradas no painel; o anúncio fica criado mas em pausa, sem gasto.

Nota: contagem de caracteres em unidades de código visíveis (emoji/acentos) — validar com `Intl.Segmenter` para não passar um título de 31 ao Google.

## 8. UI

Espelhar o `MetaPublishPanel` na mecânica, mais simples no conteúdo (não há criativos nem gerador LLM nesta fase):
- Novo `GooglePublishPanel.tsx` com: cabeçalho de estado (rascunho/pronto/a publicar/publicado/ativo/pausado), formulário (orçamento diário, datas, meta de conversão, geo/idioma pré-preenchidos do evento, ad groups com keywords e RSA), botão "Pré-visualizar (dry-run)" e "Publicar em pausa", e depois o cartão âmbar "Publicada em PAUSA" com modal de confirmação + checkbox obrigatória para ativar, e kill switch "Pausar" quando ativa.
- Ao abrir: **carrega o plano existente** por `event_id`; nunca regenera automaticamente (é a correção v7 do Meta).
- Onde vive: `MP Audience → Google Ads` (`/audience/google-ads`, já existe `AudienceGoogleAds.tsx`), como aba "Publicar campanha". `/crm/google-ads` fica só Customer Match, como está documentado.

## 9. Fases de entrega (cada uma verificável isoladamente)

- **F0 — Leitura de conversion actions + geo suggest.** Migration da tabela pequena `crm.google_conversion_action` + leitura na conta. Verificável: lista real de conversion actions e o `location_id` de Cascais. *Bloqueada por `GOOGLE_SA_KEY_JSON`.*
- **F1 — Schema.** Migration `crm.google_publish_plan` + RLS/GRANTs. Verificável sem credencial: insert/select como `authenticated` de outra empresa falha.
- **F2 — Validação RSA + painel de rascunho.** Painel cria e guarda plano, valida limites, sem tocar no Google. Verificável sem credencial.
- **F3 — `crm-google-publish-execute` em dry-run.** Devolve os 6 payloads pela ordem exacta. Verificável sem credencial.
- **F4 — Execute real, idempotente.** Publica em pausa; testes: correr 2× seguidas (nada duplica), matar a meio e retomar. *Precisa de credencial.*
- **F5 — `crm-google-publish-activate`.** Flips `PAUSED↔ENABLED` bottom-up/top-down com `estado` por objeto, como a Fase 3 do Meta.
- **F6 — Doc** `docs/features/crm-google-publish-flow.md`, no formato do doc do Meta.

## 10. O que pode correr mal / o que não faço nesta fase

Riscos:
- **Sem `GOOGLE_SA_KEY_JSON` nada de F0/F4/F5 pode ser testado a sério** — F1–F3 avançam mesmo assim.
- **Developer token em Basic vs Standard**: Basic tem limites de operações/dia; criação de campanhas é pouco pesada, mas se estiver em Test-account access nada funciona em contas reais. Só se sabe com a credencial.
- **Conta sem histórico de conversões** → `MAXIMIZE_CONVERSIONS` arranca cego; mitigado pelo fallback a cliques.
- **Reprovação de políticas** (bilheteira/eventos costuma passar, mas títulos com superlativos não) — fica visível no painel, sem gasto porque está em pausa.
- **Resolução de cidade errada** (há vários "Cascais" no mundo): o `suggest` é feito com país e o painel mostra o nome canónico devolvido para confirmação humana.
- **`partial_failure` mal lido** pode dar a ilusão de keywords criadas; o plano só guarda `resource_name` de resultados efetivos.

Não faço nesta fase: Performance Max/Demand Gen, extensões de anúncio, audiências no ad group, edição/otimização de campanhas existentes, geração de copy por LLM, orçamentos partilhados, experiências A/B, e sincronização automática do plano com o estado real (isso é o sync que já existe).
