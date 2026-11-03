# Issue #394 — E2b: URL configurável do alerta Early Bird

Data: 03/11/2026. Base local: `372427d08d24fb845c0b93f0472e31873cf9e2cc`.
Entrega de código e testes com preparação R2: ficheiros preparados, **não aplicados**.

## Fontes e âmbito

Foram lidos `docs/INDEX.md`, a secção de execução de `docs/QUADRO.md`,
`docs/estado/estado-coala-portal.md`, `.lovable/memory/features/coala-eb-invite.md`,
`.lovable/memory/features/vip-coupon-email.md`, `docs/features/vip-coupon-email.md`
(«Multi-ambiente») e `docs/procedimentos/PROC-promocao.md`.
O despacho E2b fornecido na tarefa prevalece sobre o corpo original da Issue.

A entrega altera exclusivamente estes seis caminhos:

- `drizzle/migrations/0306_issue394_eb_open_alert_base_url.sql`.
- `supabase/manual/0306_issue394_eb_open_alert_base_url.sql`.
- `supabase/manual/rollback_0306_issue394_eb_open_alert_base_url_comentado.sql`.
- `src/test/issue394-eb-open-alert-base-url.test.ts`.
- `docs/testes/issue394-url-config-20261103.md`.
- `.executor/resumo.md`.

Não foram lidos comentários remotos nem consultados ambientes externos.

## Alteração preparada

A função `public.coala_send_eb_open_alert(integer, boolean, text[])` conserva a
definição da 0292, exceto o cabeçalho documental e estas três alterações:

1. Declaração de `v_base text`.
2. Resolução por `public.vip_coupon_functions_base_url()` antes do loop, após as
   guardas existentes e o cálculo do teto diário. Base nula ou vazia provoca
   `raise exception 'project_functions_base_url esta vazio em app_secrets.'`.
3. Composição de `unsubscribe_http_url` com `rtrim(v_base, '/')`, o caminho
   `/functions/v1/handle-email-unsubscribe?token=` e o token existente.

O accessor canónico lê `value` em `public.app_secrets` para a chave
`project_functions_base_url`; a sua definição não é alterada nem duplicada na
migração. Não se cria nem preenche qualquer segredo. A guarda nova mantém o
retorno antecipado do dry run e a precedência da guarda de `early_bird.fever_url`.
Seleção de destinatários, teto, reenvios, textos PT/EN e restantes links são os da 0292.

A 0292 local não contém instruções `REVOKE/GRANT`; a 0306 também não as acrescenta.
`CREATE OR REPLACE` mantém os privilégios existentes, a assinatura, os defaults,
`SECURITY DEFINER` e `search_path`. O teste semeia uma ACL restrita e verifica a
sua preservação; não faz afirmações sobre a ACL atual de Live.

O rollback contém integralmente a definição da 0292, linha a linha comentada,
com o host substituído pelo marcador `<host Live>`. É documentação inerte: uma
eventual execução exige resolver esse marcador em contexto autorizado e seguir
o PROC-promocao com Sim próprio. Não se executou o rollback.

## Numeração e integridade

Existe colisão prévia de numeração, preservada sem correção:

- `drizzle/migrations/0305_issue486_ads_invoice_generation.sql`.
- `drizzle/migrations/0305_issue498_supplier_columns_acl.sql`.

Esta entrega usa **0306**. Não altera o journal nem metadados de migração.
As cópias Drizzle/manual são byte a byte iguais. Os três SQL novos não contêm o
sufixo de domínio pesquisado no teste, nem qualquer host de Live.

| Artefacto | Bytes | SHA-256 |
|---|---:|---|
| 0306 Drizzle e cópia manual | 8303 cada | `16aef2d7d1975a15918b7c501c2a05e1bff68caa5912e81aae12bdb979133a64` |
| Rollback comentado | 8535 | `9bff895553bebc3c1a5360853c2553902eca1523d2bec52450665dd2f71419b8` |

`grep -c "supabase.co"` devolveu **0 para cada um dos três SQL** (exit 1,
esperado quando não há correspondências).

## Prova sintética e validação

O teste usa exclusivamente PGlite em memória, relações mínimas sintéticas e um
stub de `enqueue_email` que só grava o payload numa tabela local. A fonte do
loop é uma relação sintética com a forma de `coala_list_members`; não se copia
nem altera a vista real. O accessor carregado é o trecho canónico de
`supabase/migrations/20260820135937_cd9ae973-08cf-4884-a1d2-4dd9f477baf4.sql`,
incluindo as revogações e excluindo o seed de ambiente.

Os 11 casos cobrem:

- Base sintética `https://x` e `https://x/`, nos destinatários PT e EN, produzindo
  exatamente o caminho HTTP esperado e o token devolvido pelo stub.
- Chave ausente, valor nulo e valor vazio, com a mensagem de exceção exigida e
  sem efeitos persistidos em tokens, fila ou registo de envio.
- Dry run sem chave e precedência da guarda anterior de `fever_url`.
- Preservação de atributos e ACL restrita preexistente em PGlite.
- Comparação integral do corpo com as três substituições autorizadas sobre a 0292.
- Ausência do domínio de projeto nos três SQL e identidade binária das cópias.
- Rollback inteiramente comentado e igual à 0292 após sanitização do host.

O teste focado passou: **11/11**, sem skips. A execução global final também
passou os 11 casos novos. Validações completas, ambas com exit 0:

| Comando | Antes | Depois |
|---|---|---|
| `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` | Sem erros | Sem erros |
| `bunx vitest run` | 4406 passaram; 375 ficheiros passaram; 233,14 s | 4417 passaram; 376 ficheiros passaram; 217,18 s |

Não houve falhas antes ou depois. Os 6 testes skipped, 11 todo e 2 ficheiros
skipped preexistentes mantiveram-se; esta entrega não acrescenta skips ou todo.
A conferência do corpo integral, do rollback, dos hashes e dos caminhos novos
confirmou o recorte dos seis ficheiros autorizados. A verificação de whitespace
incluiu os ficheiros novos com `git diff --no-index --check`.

## Não feito / limites da prova

- A migração não foi aplicada em homologação ou Live; a promoção fica para o
  PROC-promocao, com Sim próprio.
- Não foi confirmado o preenchimento da chave em Live nem a funcionalidade do
  endpoint real; a prova de composição do payload é sintética.
- Não foram enviados emails nem executados SQL fora do PGlite sintético.
- `public.club_from_lead_capture` (0266, linha 637) mantém-se para Issue própria.
- Outras funções, edge functions e o replay #352 não foram alterados.
- CI remoto não foi executado nem confirmado nesta sessão local.

## Inventário textual local de literais restantes

O inventário abaixo é do repositório, não do catálogo de Live. A pesquisa cobre
os ficheiros SQL visíveis por `rg` no checkout, excluindo dependências e edge
functions, e inclui históricos, duplicados manuais, rollbacks, comentários,
placeholders, seeds e comandos de cron. A presença textual não demonstra que
uma definição esteja atualmente instalada. Só são registados nomes de ficheiros
e números de linha, sem transcrever hosts ou valores.

As referências da frente são `public.coala_send_eb_open_alert` (0153 e 0292),
`public.coala_send_eb_invite_batch` (0152) e `public.club_from_lead_capture`
(0129, 0140, 0143, 0176 e 0266). A 0306 substitui apenas o corpo do alerta quando
for aplicada; não reescreve os históricos listados. O seed do accessor também
aparece na pesquisa, fora do corpo da função.

Pesquisa local: **64 ficheiros, 69 linhas com ocorrência textual**.

| Ficheiro | Linhas |
|---|---|
| `docs/modelos/triagem-de-issues/queries.sql` | 9 |
| `docs/pending-migrations/20260927002500_ticketing_sync_health_result_checks.sql` | 362 |
| `drizzle/migrations/0129_0129_newgang_f2_immediate_welcome.sql` | 282 |
| `drizzle/migrations/0140_derp271_club_terms.sql` | 90 |
| `drizzle/migrations/0143_derp274_club_crews.sql` | 192 |
| `drizzle/migrations/0152_coala_eb_invite_d_invite_batch.sql` | 90 |
| `drizzle/migrations/0153_coala_eb_invite_e_open_alert.sql` | 77 |
| `drizzle/migrations/0176_issue328_club_identity_crew_pending.sql` | 143 |
| `drizzle/migrations/0266_issue314_fase1_versoes_idade_real.sql` | 637 |
| `drizzle/migrations/0292_issue359_eb_open_authorisations_link.sql` | 93 |
| `supabase/manual/0266_issue314_fase1_versoes_idade.sql` | 637 |
| `supabase/manual/0292_issue359_eb_open_authorisations_link.sql` | 93 |
| `supabase/manual/20261016_issue328.PENDENTE.sql` | 162 |
| `supabase/manual/20261016_issue328.ROLLBACK.sql` | 79 |
| `supabase/manual/cron_carreira_s4a_audience_live.sql` | 4 |
| `supabase/manual/cron_carreira_soundcharts_referencias_diario_live.sql` | 6 |
| `supabase/manual/cron_carreira_tiktok_ads_sync_live.sql` | 4 |
| `supabase/manual/cron_carreira_youtube_public_live.sql` | 10 |
| `supabase/manual/cron_crm_meta_insights_hourly_live.sql` | 38 |
| `supabase/manual/cron_google_sync_campaigns_live.sql` | 42 |
| `supabase/manual/cron_ticketline_crosscheck_live.sql` | 5 |
| `supabase/manual/fix_cron_meta_sync_creatives_live.sql` | 70 |
| `supabase/manual/portal_cron_jobs.sql` | 25, 48 |
| `supabase/manual/rollback_0266_issue314_fase1.sql` | 618 |
| `supabase/manual/rollback_0292_issue359_eb_open_authorisations_link_comentado.sql` | 93 |
| `supabase/migrations/20260515033243_98b35018-d0b8-4d47-9fd6-f040d8f56b80.sql` | 75 |
| `supabase/migrations/20260516042414_3315239e-3d51-48eb-b70a-62dfa217d470.sql` | 118 |
| `supabase/migrations/20260517020000_fix_notify_sync_action_needed_supabase_url.sql` | 23 |
| `supabase/migrations/20260519003747_eb9655d1-abfe-4518-89cf-3448a5dca8a6.sql` | 13 |
| `supabase/migrations/20260519004823_de0c7b02-f647-4aea-8b80-664ea8bca321.sql` | 6 |
| `supabase/migrations/20260522120039_029a6059-76fb-4eaf-ba70-9c9ab567b6bf.sql` | 35 |
| `supabase/migrations/20260529104023_fix_cron_meta_sync_creatives_status.sql` | 57 |
| `supabase/migrations/20260531130227_lower_sync_creatives_max_to_40.sql` | 52 |
| `supabase/migrations/20260604120000_portal_cron_inline_dispatch.sql` | 44, 90 |
| `supabase/migrations/20260604123938_419175a3-92f4-4754-96cc-e6e062052391.sql` | 17, 67 |
| `supabase/migrations/20260605223343_435eaeb5-bd38-4f7f-8edd-29de8fdc7a96.sql` | 281, 326 |
| `supabase/migrations/20260625031235_365f3a33-07fa-4698-ac2d-2b5c42138dcb.sql` | 39 |
| `supabase/migrations/20260628194341_23bb862a-36d0-44cd-8aea-f6471cce13ee.sql` | 30 |
| `supabase/migrations/20260812175545_5c261731-848b-4115-885b-96789707568d.sql` | 45 |
| `supabase/migrations/20260812192102_b12c23fd-3c78-4bd7-b01c-7c633cbe2918.sql` | 9 |
| `supabase/migrations/20260815135332_5bc4396e-5a6c-4bec-8722-18c86a6d7fb4.sql` | 2 |
| `supabase/migrations/20260815135438_9bc573d3-fdce-4699-a386-57a539f22ecb.sql` | 2 |
| `supabase/migrations/20260815135542_6debe2a5-df1b-403a-97bf-9f2fd500d021.sql` | 2 |
| `supabase/migrations/20260815135640_763f35e7-56d6-4b34-a2c5-6d1eecef6c68.sql` | 2 |
| `supabase/migrations/20260815135744_a549cddd-766f-4c9c-b203-ab83f6b14f9f.sql` | 2 |
| `supabase/migrations/20260815135818_a1d38bc0-654c-4b4e-90ea-8156b0f3ce05.sql` | 2 |
| `supabase/migrations/20260815135907_9a6d70f3-2ad3-43ee-8878-10fbf681e9f5.sql` | 2 |
| `supabase/migrations/20260815135947_4c0a5545-b765-42bd-b694-4e456e5406f3.sql` | 2 |
| `supabase/migrations/20260815140013_c93a8e26-d17d-4014-ba50-30fbc8eb9100.sql` | 2 |
| `supabase/migrations/20260815140105_90ba06f3-eafb-4b66-8bb3-52c6a1daffcb.sql` | 2 |
| `supabase/migrations/20260815140315_396250a8-0b9f-4e47-8b69-3a7d03e77f9e.sql` | 2 |
| `supabase/migrations/20260815140520_24d0653e-ab20-421b-a803-9bc4fe6aa786.sql` | 2 |
| `supabase/migrations/20260820135937_cd9ae973-08cf-4884-a1d2-4dd9f477baf4.sql` | 42 |
| `supabase/migrations/20260820140110_f382b163-31b4-4da8-bb51-9765cff4e1cd.sql` | 2 |
| `supabase/migrations/20260823175646_aceeb06f-06c8-4c67-accf-b0ab7368117f.sql` | 47 |
| `supabase/migrations/20260917232930_4e42aa8e-6dc5-4de1-b875-c538e79818a3.sql` | 12 |
| `supabase/migrations/20260918145430_572d41cb-3fa2-4285-bc20-1f7f4a11e234.sql` | 226 |
| `supabase/migrations/20260918163626_328d9fc7-2581-42ff-b9a5-16d9851ae9bc.sql` | 15, 319 |
| `supabase/migrations/20260918191209_905ec732-f85b-40f2-8e4f-2f54a28e17fc.sql` | 240 |
| `supabase/migrations/20260920220454_fe6472d9-ea3b-413c-9dc1-bdda46fe986b.sql` | 56 |
| `supabase/migrations/20260930165649_13c9996b-7e74-4755-a920-cb0facf0fa81.sql` | 309 |
| `supabase/migrations/20261001203639_401f5dd5-3aba-43c4-bde8-173b99d514fc.sql` | 294 |
| `supabase/migrations/20261002104613_97c7794e-9110-4dea-8875-253ec3a30e10.sql` | 294 |
| `supabase/migrations/20261013040000_0129_newgang_f2_immediate_welcome.sql` | 282 |
