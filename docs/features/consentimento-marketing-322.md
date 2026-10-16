# Consentimento marketing por interação — #322 (etapa ERP)

Estado: ERP aplicado em Live 16/10/2026 ~01:20 UTC, aguarda verificação independente. Portais MP/Coala/Newgang **não** integrados. CAPI continua suspensa (`capi_dispatch_control.suspended=true`, jobs 33/34/44/45 ausentes, ticks SQL disabled).

## Peças (ERP)
- Migrações: `0172_issue322_marketing_consent_ledger` (vazia por engano operacional, sem efeito) e `0173_issue322_marketing_consent_ledger_apply` (DDL efetivo).
- Dados de configuração (fora da migração): política `2026-10-v1` para mp/coala/newgang, TTL 180 dias, `valid_from` 16/10/2026 01:1x UTC.
- Tabelas (RLS ligada, sem policies; só service_role): `marketing_consent_policies`, `marketing_consent_subjects` (guarda só sha256 do token), `marketing_consent_events` (append-only por trigger).
- Funções (EXECUTE só service_role): `marketing_consent_record`, `marketing_consent_bind`, `marketing_consent_effective`, `marketing_consent_binding_valid`, `marketing_consent_scope_ok`, `marketing_strip_meta_params`, `capi_consent_proof` (substituída).
- Triggers BEFORE INSERT: `trg_lead_capture_consent_guard`, `trg_redirect_log_consent_guard` (vínculo só aceite de service_role e revalidado; sem vínculo retira fbc/fbp, `raw.{fbc,fbp,_fbc,_fbp,fbclid}` e `fbclid/_fbc/_fbp/fbc/fbp` de referrer/destination_url), `trg_leads_copy_consent_binding` (copia o vínculo de lead_capture para leads na ingestão #321, sem tocar na função de ingestão).
- Colunas aditivas nullable: lead_capture/leads `consent_subject_id, consent_event_id, consent_portal`; redirect_log idem + `consent_company_id`.
- Edge: `portal-track` (deploy, sem Publish), lógica pura em `supabase/functions/_shared/consent-contract.ts`.

## Contrato comum para os 3 portais
Endpoint: `POST {SUPABASE_URL}/functions/v1/portal-track` (text/plain ou JSON). Empresa **e** portal derivados do Origin validado (MP e Newgang = mesma empresa, portais distintos; prova não cruza). Corpo nunca define empresa/portal/estado efetivo.

### Registar decisão
```
{ "kind": "consent", "payload": {
  "state": "granted" | "denied" | "revoked",
  "purpose": "meta_ads",
  "policy_version": "2026-10-v1", "banner_version": "<versão do banner>",
  "client_seq": <inteiro, max(Date.now(), último+1) partilhado entre abas via localStorage>,
  "client_decided_at": "<ISO opcional>",
  "idempotency_key": "<uuid novo por decisão; repetir o mesmo em retries>",
  "subject_token": "<64 hex devolvido antes, ou omitido na 1.ª decisão>",
  "path": "/..." } }
```
200: `{ ok:true, receipt:{ decision_id, replay, recorded_state, server_received_at, effective_state, effective_decision_id, marketing_allowed, expires_at, subject_token } }` — `subject_token` só vem na criação; guardar em localStorage (não em cookie, não enviar a terceiros).
Erros: 400 `state_invalid|purpose_invalid|version_invalid|seq_invalid|idempotency_key_required|policy_invalid|subject_invalid|invalid_payload`; 409 `idempotency_conflict|seq_conflict`; 403 `forbidden_origin|origin_unscoped`; 503 `persist_failed`. Em todos os erros `marketing_allowed:false`.

Regras do cliente:
- Marketing (pixel, `_fbc/_fbp`, fbclid) só ativa quando `receipt.marketing_allowed===true`. Até lá e em qualquer erro/falha de rede: bloqueado.
- Revogação/recusa: desligar já localmente (parar pixel, apagar `_fbc/_fbp` controlados, não guardar fbclid), enviar a decisão com retry e a mesma `idempotency_key`; só afirmar "registado" com 200. Não tocar no `ng_ref` (Clube).
- `subject_invalid`: apagar o token local e reenviar sem token (novo sujeito).
- Grant com política desconhecida é recusado; deny/revoke são sempre aceites.
- Ordenação: `client_seq` maior vence; empate → id do servidor. Grant atrasado com seq menor não vence revoke.

### Leads e redirects
Acrescentar `"consent_token": "<subject_token>"` ao nível de topo dos corpos `kind:"lead"` e `kind:"redirect"` (clientes antigos sem este campo continuam a funcionar). Resposta: `{ ok:true, marketing_bound:boolean }`. Sem prova válida o registo entra na mesma (CRM/Clube intactos), sem identificadores Meta. InitiateCheckout continua com o mesmo `client_event_id` browser/redirect.

## Validação temporal
`capi_consent_proof(lead, evento)` só é true se: evento ∈ {ViewContent, Lead, InitiateCheckout}; vínculo do lead aponta para um grant do mesmo sujeito/empresa/portal; esse grant era o efetivo e válido (política + TTL) no `created_at` do lead; não existe deny/revoke posterior (por seq ou por chegada); e o estado efetivo atual é grant válido. Novo grant nunca recupera interações antigas. Antes, `capi_lead_block_reason` continua a devolver `suspended`.

## Testes (sem envios)
- `supabase/tests/marketing_consent_322.sql` — DO revertido (`TEST322_OK`), 0 pedidos `net`. Prova: `docs/testes/issue322/01-sql-e-live.md`.
- `src/test/consent-contract-322.test.ts` (23 testes). tsgo/vitest: `02-tsgo.md`, `03-vitest.md`.

## Pendências
- Portais MP, Coala, Newgang (uma etapa cada, com verificação).
- Lead/InitiateCheckout: `capi-meta-events` continua a bloqueá-los (`wrong_event`/`no_identity`); faltam guardas específicas por interação antes de qualquer retoma.
- redirect_log não tem ingestão para leads; vínculo fica só na linha de origem.
- Identificadores Google/TikTok (gclid, ttclid…) não são retirados nesta etapa (finalidade `meta_ads` apenas; pipelines Google não mudam). Decisão de finalidades adicionais com o Pedro.
- `song-link-event` envia à Meta sem esta prova — lacuna fora do âmbito, não alterada.
- TTL 180 dias e versão `2026-10-v1` adotados pelo agente; confirmar com o Pedro.
- O token fica legível por scripts do portal (localStorage); mitigação = não carregar tags de terceiros antes do grant.

## Reversão (sem reativação)
`portal-track`: repor versão anterior (git) e deploy. BD: `DROP TRIGGER` dos 3 triggers novos e repor `capi_consent_proof` para `SELECT false` numa migração nova. Tabelas/colunas ficam (aditivas). Nada disto reabre o interruptor nem recria crons.
