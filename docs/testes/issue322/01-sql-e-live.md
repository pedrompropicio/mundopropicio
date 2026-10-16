# #322 — testes SQL e verificação Live (sem envios, sem PII)

Data: 2026-10-16 · Base SHA: c599c67c96b5ba00fc4361f25a69e615d16655ab (início) / 64f1a6d5 (após migrações)

## Baseline (01:12:00 UTC)
leads 46069 · sent_n 29550 · sent_hash(md5 ids sent ordenados) c111af66a9ce9cdedce853d5a1374d09 · contacts 27088 · contacts_consent_hash 857f08c7ac9f974c62b02df87e958a1f · club_members 7 · lead_capture 2980 (0 pendentes) · redirect_log 43164 · suspended true · jobs 33/34/44/45 = 0.
Nota: o hash `b1738fd8…` da #320 usa outra fórmula; aqui compara-se a mesma fórmula antes/depois.

## Migrações
- 0172_issue322_marketing_consent_ledger — aplicada vazia por engano operacional (sem efeito).
- 0173_issue322_marketing_consent_ledger_apply — DDL efetivo, aplicado em Live.
- Configuração (DML): 3 linhas em marketing_consent_policies (`2026-10-v1`, TTL 180).

## Teste SQL — `supabase/tests/marketing_consent_322.sql`
Executado em Live num único DO que termina em `RAISE EXCEPTION 'TEST322_OK'` (rollback total). Resultado: `ERROR: P0001: TEST322_OK` (todas as asserções passaram). Cobre: tenant errado, só analytics, política inválida, estado desconhecido, seq futuro, recibo inventado, sem token, cookie `_fbc` legado, grant atual, token só em hash, MP→Newgang, MP→Coala, replay idempotente, conflito de idempotência, seq repetido, lead com prova, evento fora, CAPI suspensa (`capi_lead_block_reason=suspended`), portal errado no lead, recibo de outro vínculo, revogação após captura, grant atrasado vs revoke, regrant sem retroatividade, append-only, expiração TTL, guarda de inserção anon (não forja; URLs sanitizadas), service_role válido mantém, service_role com portal errado limpo, `capi_dispatch_allowed()=false`, 0 pedidos `net.http_request_queue`.
Tentativa via `psql` com o utilizador do sandbox: `permission denied for function marketing_consent_record` (confirma que não é público).

## Depois (01:20:43 UTC)
sent_n 29550 · sent_hash c111af66… (igual) · contacts 27088 · contacts_consent_hash 857f08c7… (igual) · club_members 7 · leads 46069 · lead_capture 2980 · suspended true · jobs 0 · marketing_consent_events 0 / subjects 0 (testes revertidos) · leads com vínculo 0.
Grants tabelas (anon/authenticated/service_role): events, subjects, policies = false/false/true.
EXECUTE: marketing_consent_record, marketing_consent_bind, capi_consent_proof, marketing_consent_binding_valid = false/false/true.
md5(pg_get_functiondef(capi_consent_proof)) = d3ce2c8b5292b4b19f157c95be153dee.

## Edge
`portal-track` deployada (source_sha256 e021e28d…); sem Publish. Nenhum pedido a Meta/Google/TikTok/Snap/Resend nem Test Events.
