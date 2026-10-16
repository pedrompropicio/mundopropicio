# Consentimento marketing por interação — #322 (etapa ERP, versão CORRIGIDA)

Estado: ERP aplicado em Live 16/10/2026 01:20 UTC (0173) e **corrigido** 01:44 UTC (0175) após verificação independente; aguarda revisão. Portais MP/Coala/Newgang **não** integrados. CAPI suspensa (`suspended=true`, jobs 33/34/44/45 ausentes, ticks SQL disabled). Os portais devem implementar **só esta versão** (a inicial, com `subject_token` emitido pelo servidor e ordem por `client_seq`, deixou de existir).

## Peças (ERP)
- Migrações: 0172 (vazia, engano), 0173 (ledger), 0174 (vazia, engano — só comentário), **0175** (correção efetiva).
- Configuração versionada: `supabase/manual/20261016_marketing_consent_policies_2026-10-v1.sql` (TTL 180 = técnico, não validado em rollout).
- Tabelas (só service_role): `marketing_consent_policies`, `marketing_consent_subjects` (só sha256 do token), `marketing_consent_events` (append-only; `revision` do servidor; `client_seq` informativo).
- Funções (EXECUTE só service_role): `marketing_consent_record(…13 args)`, `marketing_consent_bind(company,portal,token,receipt)`, `marketing_consent_effective`, `marketing_consent_binding_valid`, `marketing_consent_receipt`, `marketing_strip_meta_params`, `marketing_strip_meta_json`, `marketing_is_meta_key`, `marketing_filter_qs`, `marketing_pct_decode_key`, `capi_consent_proof` (inalterada).
- Triggers BEFORE INSERT: `trg_lead_capture_consent_guard`, `trg_redirect_log_consent_guard` (lock partilhado por sujeito; revalida; retry por `client_event_id` não muda o vínculo; sem prova retira fbc/fbp e limpa `raw` recursivo / referrer / destination_url), `trg_leads_copy_consent_binding`.
- Edge: `portal-track` = `index.ts` (Deno) + `handler.ts` (lógica testável) + `_shared/consent-contract.ts`.

## Contrato para os 3 portais
Endpoint `POST {SUPABASE_URL}/functions/v1/portal-track` (text/plain ou JSON). Empresa **e** portal vêm do Origin validado; MP e Newgang não partilham prova. O corpo nunca define empresa/portal/estado efetivo.

### Estado local (localStorage, nunca cookie, nunca a terceiros)
`mc_subject_token` (64 hex, gerado uma vez com `crypto.getRandomValues`), `mc_revision` (última `effective_revision` conhecida, inicial 0), `mc_receipt` (recibo da decisão em vigor ou ausente), `mc_seq`.

### Serialização entre abas
Toda a leitura/gravação do estado e o envio de decisões correm dentro de `navigator.locks.request("mc-consent", …)`. Sem Web Locks: **não** enviar grant (fica bloqueado); deny/revoke enviam-se na mesma. A primeira aba cria o token dentro do lock; as outras reutilizam-no.

### Registar decisão
```json
{ "kind": "consent", "payload": {
  "state": "granted", "purpose": "meta_ads",
  "policy_version": "2026-10-v1", "banner_version": "banner-2026-10",
  "subject_token": "<64 hex do cliente>",
  "expected_revision": 0,
  "client_seq": 1760577600000,
  "idempotency_key": "3f0c9d3e-0000-4000-8000-000000000001",
  "path": "/eventos/exemplo" } }
```
- `expected_revision` obrigatório em `granted` (= `mc_revision`); opcional em `denied`/`revoked`.
- `idempotency_key` nova por decisão do utilizador; **igual** em retries da mesma decisão.

200 (exemplo fictício):
```json
{ "ok": true, "receipt": { "decision_id": 41, "revision": 1, "replay": false, "recorded_state": "granted",
  "server_received_at": "2026-10-16T02:00:00Z", "effective_state": "granted", "effective_decision_id": 41,
  "effective_revision": 1, "marketing_allowed": true, "expires_at": "2027-04-14T02:00:00Z",
  "consent_receipt": "41.1.<64 hex>" } }
```
Revoke 200: `marketing_allowed:false`, `consent_receipt:null`, `effective_state:"revoked"` — sempre.

Erros (sempre `marketing_allowed:false`): 400 `state_invalid|purpose_invalid|version_invalid|seq_invalid|idempotency_key_required|expected_revision_required|policy_invalid|subject_invalid|invalid_payload`; 409 `idempotency_conflict` e `revision_conflict` (traz `effective_state`, `effective_revision`); 403 `forbidden_origin|origin_unscoped`; 503 `persist_failed`.

Regras do cliente:
- Marketing (pixel, `_fbc/_fbp`, guardar fbclid) só com `marketing_allowed===true` **e** recibo guardado. Até lá, em erro ou sem rede: bloqueado.
- Ao receber resposta: gravar `mc_revision = effective_revision`; `mc_receipt = consent_receipt` (ou apagar se null).
- `revision_conflict`: **não** reenviar o grant automaticamente; atualizar `mc_revision`, mostrar o estado efetivo e pedir nova ação explícita ao utilizador (que gera nova `idempotency_key`).
- Revogação/recusa: desligar logo localmente (parar pixel, apagar `_fbc/_fbp` controlados, apagar `mc_receipt`), enviar com retry e a mesma chave; só dizer "registado" com 200. Não tocar no `ng_ref`.
- `subject_invalid` com token presente: o token não pertence a este portal; apagar e gerar novo **só** se não houver grant local conhecido; havendo, manter bloqueado e voltar a perguntar.
- Retry de um grant antigo depois de um revoke devolve `replay:true, marketing_allowed:false` — nunca reabre.

### Leads e redirects
Acrescentar no topo do corpo `"consent_token": "<mc_subject_token>"` e `"consent_receipt": "<mc_receipt do momento em que a interação foi gerada>"`. O recibo fica preso à interação (guardar junto dela na fila de retries); retries usam o recibo original, nunca um mais recente. Resposta `{ "ok": true, "marketing_bound": false|true }` — `true` só se o vínculo ficou gravado. Sem prova (ou prova recusada/expirada/substituída) o registo entra na mesma no CRM/Clube, sem identificadores Meta. Clientes antigos sem estes campos continuam a funcionar.

### Sanitização (sem prova)
Retira chaves `fbclid, _fbc, _fbp, fbc, fbp` (comparadas após percent-decoding até 3 níveis, '+'→espaço, minúsculas) em query e fragmento de `referrer`, `destination_url` e de **qualquer string** dentro de `raw` (incl. `raw.landing_url`, `raw.referrer`, aninhados e arrays); remove essas chaves em `raw` a qualquer nível. Parâmetros funcionais mantêm-se na ordem original. TS e SQL têm a mesma regra.

## Validação temporal
`capi_consent_proof(lead, evento)` (inalterada) chama `marketing_consent_binding_valid`: decisão vinculada é grant do mesmo sujeito/empresa/portal; era a efetiva e válida (política vigente + TTL) na captura; **não existe nenhuma decisão posterior** (deny, revoke ou novo grant); e continua efetiva e válida agora (política ainda vigente). Novo grant nunca recupera interações antigas.

## Limitações conhecidas
- Perda do localStorage (limpeza, outro browser) cria sujeito novo; o grant antigo continua no ledger até expirar, mas sem token nenhuma interação nova o pode usar. Revogar num browser **não** revoga sujeitos de outros browsers: não alegar revogação global.
- Concorrência entre sessões de BD: serialização por advisory locks (exclusivo na decisão, partilhado na captura). Testada em sequência dentro de uma transação e com mocks no endpoint; **não** houve teste com duas ligações paralelas reais (dblink não instalado; não instalado nesta etapa).
- Token e recibo legíveis por scripts do portal; mitigação = nenhuma tag de terceiros antes do grant.
- gclid/ttclid não retirados (finalidade só `meta_ads`).
- Lead/InitiateCheckout continuam bloqueados em `capi-meta-events`; guardas próprias antes de retoma.
- `redirect_log` sem ingestão para leads.

## Testes (sem envios)
- `supabase/tests/marketing_consent_322_fix.sql` (DO revertido, `TEST322FIX_OK`). `marketing_consent_322.sql` ficou obsoleto (assinaturas antigas).
- `src/test/consent-contract-322.test.ts` (38 testes: helpers + handler→RPC→insert com fetch injetado; egress global bloqueado).
- Provas: `docs/testes/issue322/04-correcao.md`.

## Reversão (sem reativação)
`portal-track`: repor versão anterior e deploy. BD: `DROP TRIGGER` dos 3 triggers numa migração nova e repor `capi_consent_proof` para `SELECT false`. Tabelas/colunas ficam. Nada reabre o interruptor nem recria crons.
