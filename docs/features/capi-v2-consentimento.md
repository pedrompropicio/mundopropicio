# CAPI v2 — remetente por prova de consentimento (#322 opção A)

Estado: código + migração aplicados e função deployada, tudo INERTE. Nenhum envio à Meta foi feito nem é possível sem decisões do Pedro. Suspensão #320 intacta (`capi_dispatch_control.suspended = true`).

## Peças
- Migração `0200_capi_v2_consent_events` (aditiva):
  - `capi_v2_targets` (event_slug PK, portal, pixel_id, enabled=false, start_at=NULL). Seeds: Coala `coala-festival-portugal-2027` → pixel `1142136723579970`; Newgang `newgang-festival-2027` → pixel `1158654246468410`. `start_at` NULL = nada elegível; só linhas criadas DEPOIS dele entram (sem reprocessamento histórico).
  - `capi_v2_events` (fila/estado): status `pending|sent|retry|failed_terminal|expired|skipped_no_consent`, `UNIQUE(pixel_id, event_name, event_id)` (idempotência), sem PII (error_code é código, não mensagem).
  - RPC `capi_v2_enqueue(p_limit)` — service_role apenas: após 0201, enfileira só `Lead` no Coala; no Newgang mantém `Lead` + `CompleteRegistration` no cadastro (lead_capture com `consent_event_id` e `client_event_id`, target enabled, `created_at >= start_at`, ≤6 dias). `ClubeConfirmado` mantém-se inalterado (membro Newgang confirmado com lead_capture com prova por email normalizado).
  - RPC `capi_v2_newgang_ads_ok(p_email)` — service_role apenas: true se a pessoa tem consentimento de anúncios `meta_ads` (#332) concedido e em vigor.
  - RLS fechada nas duas tabelas (sem policies); grants só service_role; EXECUTE revogado de PUBLIC/anon/authenticated.
- Migração `0201_capi_v2_coala_lead_only` (19/10/2026, SQL aprovado pelo Pedro): substitui apenas `capi_v2_enqueue(integer)`, acrescentando o portal ao candidato e filtrando `CompleteRegistration` quando `portal = 'coala'`. Não executa o enfileiramento nem altera linhas existentes, targets, suspensão, permissões ou o ramo `ClubeConfirmado`. Sem novo deploy.
- Edge function `capi-v2-send` (`verify_jwt = true` + `isServiceRoleRequest` — só service_role):
  - `health`: configuração, contagens por estado, presença do token (booleano), suspensão. Nunca chama o Graph.
  - `dry_run`: payloads que SERIAM enviados (em/ph só como SHA-256, sem token). Nunca chama o Graph.
  - `send`: recusa `{refused:true, reason:'suspended'}` (423) se `capi_dispatch_allowed()` for false. `test_event_code` só com `confirm_test:true`; override da suspensão só com `confirm_test:true` + `override_suspension_for_test:true` (uso exclusivo com ordem expressa do Pedro).

## Regras de envio
- Prova revalidada NO MOMENTO do envio via `marketing_consent_binding_valid` (grant efetivo, válido e sem decisão posterior); revogação entre captura e envio → `skipped_no_consent`, nunca enviado.
- Idade máx. 6 dias (Meta rejeita >7) → `expired`.
- **Coala: só `Lead` por CAPI**, com `event_id = client_event_id`. O browser dispara `CompleteRegistration` apenas na confirmação do email, com um novo `event_id`: esse evento fica exclusivamente no browser até haver um `event_id` partilhado para deduplicação. Não enfileirar `CompleteRegistration` do Coala no cadastro.
- **Newgang:** `Lead` e `CompleteRegistration` no cadastro mantêm `event_id = client_event_id`, igual ao browser. `ClubeConfirmado` mantém `event_id = clube_confirmado_<member_no>` e `event_time = confirmed_at`.
- user_data: fbc/fbp/IP/UA sempre que existem (só existem com prova). em/ph em SHA-256 (email trim+lowercase; telefone só dígitos E.164): Coala inclui quando existem; Newgang só com `capi_v2_newgang_ads_ok` — caso contrário o evento segue sem em/ph.
- Payload Graph v25.0: `action_source:"website"`, `event_source_url` = origem do portal + path (sem query), `event_time` epoch s, token do vault `META_CAPI_ACCESS_TOKEN` (nunca no código/logs). Lotes ≤100, 1 pixel por pedido.
- Resposta síncrona: `events_received === enviados` → `sent` + fbtrace_id; 429/5xx/rede → `retry` com backoff 1/5/15/60/180 min (máx. 5 tentativas → `failed_terminal`); 4xx → `failed_terminal` + linha em `capi_alerts` (sem PII: pixel, código, fbtrace).
- **Dois Business Managers**: Coala BM 309116999253914, Newgang BM 661222725105902. O token pode não ter acesso aos dois pixels; uma recusa 4xx é terminal só para esse pixel e não afeta o outro. `health` reporta `pixel_access_verified_only_on_send` — o acesso real só se confirma num envio (modo teste).

## O que falta para ligar (tudo exige decisão do Pedro)
1. Definir `start_at` e `enabled=true` por target (UPDATE em `capi_v2_targets`).
2. Confirmar acesso do token a cada pixel com envio em modo teste (`confirm_test` + `override_suspension_for_test`, ordem expressa).
3. Levantar a suspensão #320 (`capi_dispatch_control`) com 'Sim' do Pedro.
4. Só depois: cron que chame `capi_v2_enqueue` + `capi-v2-send` (não existe nenhum cron nesta etapa).

## Não alterado (regras duras)
`capi_dispatch_control`, `process-leads-capi`, `process_leads_capi_batch`, fila antiga `public.leads`, crons, audiências Meta, #332. Sem Publish de frontend.

## Testes
`src/test/capi-v2.test.ts` — 25 testes herméticos (sem rede nem Cloud): os 21 testes do remetente com fetch simulado e quatro regressões da função SQL 0201 executada em PostgreSQL local em memória (PGlite): Coala só Lead, Newgang Lead + CompleteRegistration com client_event_id, ClubeConfirmado inalterado e segunda execução sem duplicação.
