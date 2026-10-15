# Issue #320 — verificação DEPOIS (Live, 2026-10-15 21:59:46 UTC)

Migração aplicada: drizzle/migrations/0164_issue320_capi_p1_guard.sql
Edge functions deployadas (sha256 da fonte submetida):
```
process-leads-capi   63927b06fd3b0bdd2273331e3de3dcc7901f4c2649faf7ccb0c15ffd6a0b83c6
process-lead-capture a55041303875d714e0fbb15125e13704f9696054886494bd3e0bddadc4866ce5
process-redirect-log 009922aa140f5a6baa5fe71c69ef598a045b13bb5d54fc8d9ec81507d8f07398
capi-meta-events     48a87fa75271bbc49105870f5fb222e4ae63a07b69fa052779a6066ccda89784
```

## Preservação (antes = depois)
```
leads_total        46060 = 46060
sent_n             29550 = 29550
sent_hash          b1738fd8ecdd96d7c54466ad7c81e112 = igual
leads_fields_hash  d775b562729be41f10c2ff1477b67057 = igual
leads_sent_at_hash 0e558c3efec379aa87bbfafb8c53641e = igual
events_hash        be4f6ea8de6a7d5116a9cb21d447244b = igual
contacts_hash      bb87e2aa3149ee5c18ceeadaf537c2bc = igual
suspended=true  capi_alerts=0  crons 33/34/44/45 presentes=0
```

## Classificação (kind | antes | depois | n)
```
redirect_click   | retry | blocked_wrong_kind | 6891
redirect_click   | null  | blocked_wrong_kind | 2
event_interest   | retry | expired            | 50
event_interest   | retry | blocked_no_consent | 31
pendentes restantes (NULL/retry/processing)   | 0
```
"retry" = tentativa falhada ou por fazer; nenhuma destas linhas foi marcada como enviada.

## Privilégios
Todas as funções (capi_dispatch_allowed, capi_consent_proof, capi_lead_block_reason, _capi_classify_lead,
capi_recover_processing, capi_record_meta_error, process_leads_capi_batch, portal_tick_lead_capture,
portal_tick_redirect_log, process_lead_captures_batch, process_redirect_logs_batch):
anon=false authenticated=false service_role=true, SECURITY DEFINER.
Tabelas capi_dispatch_control e capi_alerts: anon/authenticated sem SELECT; service_role sim.
Prova extra: chamar process_leads_capi_batch pela consola de leitura → "permission denied".

## Invocação directa (bloqueio sem saída externa — a suspensão é a primeira verificação, antes de ler token)
```
POST process-leads-capi   → 423 {"reason":"capi_dispatch_suspended","suspended":true}
POST capi-meta-events     → 423 idem
POST process-redirect-log → 423 idem
POST process-lead-capture → 423 idem
```

## Testes
vitest antes: 149 ficheiros, 1149 passam, 1 ignorado, 11 todo.
vitest depois: 150 ficheiros, 1169 passam (+20 de src/test/capi-p1-guard.test.ts), 1 ignorado, 11 todo. 0 falhas.
tsgo: sem erros.
