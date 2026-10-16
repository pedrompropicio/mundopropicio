# #322 — correção após verificação independente (sem envios, sem PII, sem tokens)

Data 2026-10-16 · base HEAD 73b12f24d43272f461684010b4c45ab0de5df510

## Baseline (01:34:27 UTC)
sent_n 29550 · sent_hash c111af66a9ce9cdedce853d5a1374d09 · contacts 27088 · contacts_consent_hash 857f08c7ac9f974c62b02df87e958a1f · club_members 7 · leads 46069 · lead_capture 2980 · club_welcome_reservations 4 · suspended true · jobs 33/34/44/45 = 0.

## Migrações
- 0174_issue322_consent_fix_after_review — aplicada **só com comentário** por engano operacional (sem efeito).
- 0175_issue322_consent_fix_apply — DDL efetivo, Live.

## Reprodução do defeito e correção
`marketing_strip_meta_params('https://x.invalid/?fbclid=A&fbp=B&_fbc=C&id=7')` → antes `https://x.invalid/?fbp=B&id=7`; agora `https://x.invalid/?id=7`. Percent-encoded `%5Ffbc`, `%66bp`, `FBCLID`, fragmento `#k=1&fbclid=9` → `?utm_source=ig#k=1`. `raw` aninhado (landing_url, referrer, arrays) limpo.

## Teste SQL — `supabase/tests/marketing_consent_322_fix.sql`
Execução 1 (DO revertido): todas as asserções até à política retirada passaram; falhou `grant retirada` porque no mesmo DO `now()` é o início da transação (artefacto do teste). Ajustado para usar política já retirada antes da transação. Execução 2 (DO revertido) com os casos restantes: `ERROR: P0001: TEST322FIX_OK`. Cobertura: sanitização; token obrigatório; expected_revision obrigatório; bootstrap + retry com a mesma chave = mesmo sujeito e mesma decisão; 2.ª aba com outra chave → revision_conflict; recibo exato; só token não basta; recibo inventado; recibo com outro token; MP→Newgang; vínculo persistido sob service_role; revoke com client_seq menor vence; revoke nunca allowed; recibo antigo superseded; pendente bloqueado; replay de grant após revoke sem efeito; grant com seq futuro e revisão antiga recusado; regrant sem retroatividade nem upgrade de recibo; retry por client_event_id não reinterpreta; anon não forja e URLs limpas; política retirada após grant → expired_or_policy; política retirada/desconhecida → policy_invalid; deny aceite; CAPI suspensa; 0 pedidos `net`.
Fixtures só em marketing_consent_* e redirect_log (único trigger: guarda). Nunca lead_capture/leads.

## Endpoint/TS
`bunx vitest run src/test/consent-contract-322.test.ts` 38/38 · suite completa `Test Files 154 passed | 1 skipped (155)`, `Tests 1234 passed | 1 skipped | 11 todo (1246)` · `bunx tsgo --noEmit -p tsconfig.app.json` exit 0.
Limite: corrida entre duas ligações reais de BD não testada (sem dblink); serialização garantida por advisory locks e coberta só sequencialmente e por mocks.

## Deploy
portal-track source_sha256 6f2ed4790972276c5d65b42cd112c5411a630054bc8a4c0cba92e41bc61bf6dc. Smoke: POST de origem não permitida → 403; decisão sem subject_token → 400 `subject_invalid` (nada gravado). Sem Publish.

## Depois (01:44:45 UTC)
sent_n 29550 · sent_hash c111af66… · contacts 27088 · consent_hash 857f08c7… · club_members 7 · leads 46069 · welcome reservations 4 · suspended true · jobs 0 · events 0 · subjects 0 · leads com vínculo 0.
EXECUTE anon/authenticated/service_role = false/false/true em todas as funções marketing_* e capi_consent_proof.
md5(pg_get_functiondef): record d127c778… · bind f4897a68… · effective 13022a43… · binding_valid f9bfe518… · guard 1d1d5aef… · strip_params 44152ba1… · strip_json c236c643… · capi_consent_proof d3ce2c8b… (inalterada).
