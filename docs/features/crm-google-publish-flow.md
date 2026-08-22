# Fluxo de Publicação Google Ads (Pesquisa)

> Memória técnica — criado a 22/ago/2026 com o publicador. Antes de reinvestigar,
> ler este ficheiro. Espelho do `docs/features/crm-meta-publish-flow.md`.

## TL;DR

- Só **campanhas de Pesquisa** (Search). PMax/Demand Gen/YouTube ficam fora de âmbito.
- **Tudo nasce PAUSED**: orçamento, campanha, grupo de anúncios e anúncio.
- `dry_run` é o **default**; só escreve no Google com `dry_run: false` explícito.
- Motor **idempotente**: cada `resource_name` é gravado no plano imediatamente após o
  `:mutate`. Re-correr salta o que já existe — nunca duplica.
- Rejeição do Google **nunca** devolve non-2xx: `200 { ok:false, error_user_msg }`.
- Requer `GOOGLE_SA_KEY_JSON` + `GOOGLE_ADS_DEVELOPER_TOKEN` (+ `GOOGLE_ADS_LOGIN_CUSTOMER_ID`
  como fallback do MCC). Sem o primeiro, F0/F4/F5 não são testáveis.

## Peças

| Peça | Papel |
|---|---|
| `crm.google_publish_plan` | Plano por evento: configuração + `resource_name` de cada objeto criado + estado. |
| `crm.google_conversion_action` | Espelho das metas de conversão da conta (dropdown do painel). |
| `supabase/functions/_shared/google-ads.ts` | Auth service account (scope `adwords`) + `googleAdsPost` / `googleAdsSearch` + `mensagemErroGoogle`. |
| `supabase/functions/_shared/google-rsa-validation.ts` | Cópia Deno da validação RSA (`src/lib/google-rsa-validation.ts`). Manter as duas em sincronia. |
| `crm-google-publish-lookups` | READ-ONLY: metas de conversão (GAQL) e `geoTargetConstants:suggest`. |
| `crm-google-publish-execute` | Dry-run + criação idempotente da cadeia completa. |
| `crm-google-publish-activate` | `PAUSED ↔ ENABLED` (ativar bottom-up, pausar top-down). |
| `src/components/crm/GooglePublishPanel.tsx` | Painel em `MP Audience → Google Ads → Publicar campanha`. |

## Cadeia de recursos (API v24)

Todos os pedidos: `POST /v24/customers/{cid}/<serviço>:mutate`, headers `developer-token`,
`login-customer-id`, `Authorization: Bearer`.

| # | Recurso | Endpoint | Guardado em |
|---|---|---|---|
| 1 | Orçamento | `campaignBudgets:mutate` | `google_budget_resource` |
| 2 | Campanha (`SEARCH`, `PAUSED`) | `campaigns:mutate` | `google_campaign_resource` + `google_campaign_id` |
| 3 | Grupo (`SEARCH_STANDARD`, `PAUSED`) | `adGroups:mutate` | `ad_groups[i].google_ad_group_resource` |
| 4 | Palavras-chave e negativas | `adGroupCriteria:mutate` (`partialFailure`) | `...keywords[j].google_criterion_resource` |
| 5 | Geo + idioma | `campaignCriteria:mutate` | `campaign_criteria[]` |
| 6 | Anúncio responsivo (`PAUSED`) | `adGroupAds:mutate` | `...ads[k].google_ad_resource` |

Notas:
- `campaign.startDate`/`endDate` na **criação** são `YYYYMMDD` (no *reporting* v24 são
  `start_date_time`).
- `MAXIMIZE_CONVERSIONS` + `selectiveOptimization.conversionActions[]` liga a campanha à
  mesma conversion action que o `crm-google-conversion-upload` usa. Sem meta → `targetSpend`
  (maximizar cliques).
- `networkSettings`: só Google Search (parceiros e Display desligados).
- Constantes de idioma: pt=1014, es=1003, en=1000, fr=1002.

## Idempotência e retoma

1. `persist()` grava o plano **após cada** `:mutate` — um timeout deixa gravado tudo o que existe.
2. Cada passo salta se já tiver `resource_name`.
3. Estados de entrada retomáveis: `rascunho | pronto_a_publicar | a_publicar | falhado`
   (`a_publicar` NÃO fica preso, ao contrário do que aconteceu no Meta).
4. Lock anti-corrida: `UPDATE ... WHERE id=$1 AND (estado <> 'a_publicar' OR publish_started_at < now()-5min)`.
   Sem linha → "Publicação já em curso".
5. Match por `uid` interno em grupos/keywords/anúncios — nunca por texto nem por índice.
6. `partialFailure` nas keywords: só o `resourceName` efetivamente devolvido é guardado;
   as restantes ficam com `erro`.

## Validação RSA

3–15 títulos (≤30), 2–4 descrições (≤90), `path1/path2` ≤15, `final_url` http(s).
Contagem em grafemas. O painel valida em tempo real **e** a edge re-valida antes de qualquer
`:mutate` — nunca cria orçamento/campanha para falhar no anúncio.

## Estados do plano

`rascunho → pronto_a_publicar → a_publicar → publicado → ativo ↔ pausado`,
com `falhado` e `cancelado`. O CHECK inclui todos desde a primeira migration (lição da
Fase 3 do Meta, onde faltavam `ativo/pausado/cancelado`).

## Fora de âmbito (por decisão)

Performance Max, Demand Gen, extensões de anúncio, audiências no grupo, edição/otimização
de campanhas já publicadas, geração de copy por LLM, orçamentos partilhados, experiências A/B
e sincronização do plano com o estado real (isso é o `crm-google-sync-campaigns`).
