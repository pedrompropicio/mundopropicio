# #321 — retoma contínua do Clube Newgang (16/10/2026)

Autorização: Pedro, 00:34 UTC. Base SHA `c8d80e08aedf76302ef91e3f4cc369e9d32e2648`. Sem PII abaixo.

## Alteração
- Migrações `0168_issue321_crm_ingest_clube_continuo.sql` e `0169_issue321_crm_ingest_counters_on_success.sql` (CREATE OR REPLACE de `crm_ingest_lead_captures`; versão em vigor = 0169).
- `clube_newgang` entra em `MP_SOURCES` (só empresa MP; Coala não). Exige site `newgang` activo da empresa e email.
- Marcar `processed=true` dispara o trigger existente `trg_club_from_lead_capture` → `club_upsert_member` + `notify_member` (email normal de confirmação). Sem código, texto ou canal novo.
- Se o trigger não deixar membro (ele engole erros), a subtransação reverte: nada gravado, `processed=false`, `processing_error='clube#321: membro não criado…'`. Sem retry cego (o item fica para a corrida seguinte, visível no erro).
- Mesma pessoa duas vezes no mesmo lote: só a 1.ª passa; a 2.ª fica pendente e entra na corrida seguinte, quando o membro já tem >1 min e o trigger não volta a notificar.
- Dedupe de email existente mantido: `notifyPending` salta membros com `email_send_log` `newgang_club_welcome`; message_id `ng-welcome-<membro>`; índice único em `email_send_log(message_id) WHERE status='sent'`. Membros já existentes não recebem nada (trigger só notifica membros `formulario` criados há <1 min e por confirmar).
- Anti-starvation: fora de âmbito marcados à parte (CTE `oos`, até 1000/corrida, só `processing_error`), fora do lote; itens com erro vão para o fim da fila.
- Contadores só somam após sucesso (0169).
- `crm_ingest_clube_captures_by_ids` (0167) fica compatível e sem uso necessário. Cron 2398 mantido, sem alterações.

## Testes revertidos (dados `@example.invalid`, `session_replication_role=replica`, RAISE final)
```
TEST321_OK r1={"errors":1,"leads_new":3,"processed":4,"quarantine":2,"contacts_new":3,"clube_processed":0,"invite_no_interaction":1,"clube_deferred_same_email":0} r2={"errors":1,"leads_new":0,"processed":0,"quarantine":1,"contacts_new":0,...} r3={"errors":0,"leads_new":1,"processed":1,...} net=0->0
TEST321C_OK r1={"errors":0,"leads_new":1,"processed":1,"quarantine":1000,"contacts_new":0,"clube_processed":1,"clube_deferred_same_email":1} r2={"errors":1,"leads_new":1,"processed":1,"quarantine":201,"contacts_new":0,"clube_processed":1} net=0->0
```
Provado: isolamento MP/Coala; consentimento/origem do contacto existente intactos; leads `blocked_no_consent`; convite Coala sem lead; idempotência; retry após ambiguidade; clube sem membro → não processed e sem contacto; mesma pessoa 2x → 1 contacto, 0 membros novos; 1200 fora de âmbito antigos não bloqueiam o lote; 0 pedidos de rede; `capi_dispatch_allowed()=false`.
Limitação: com triggers desligados, o caminho real trigger → `notify_member` não é exercido no teste (por desenho: efeitos externos).

## Live
| | antes 00:36:13 | depois 00:41:16 |
|---|---|---|
| sent_n / sent_hash (#320) | 29550 / b1738fd8… | 29550 / b1738fd8ecdd96d7c54466ad7c81e112 |
| suspended / jobs 33,34,44,45 | true / 0 | true / 0 |
| lead_capture por processar (clube) | 0 (0) | 0 (0) |
| club_members / welcome log / contacts | 7 / 14 / 27088 | 7 / 14 / 27088 |

Função em Live: md5 do corpo `3cf7656e97f52c5b991cda127534aec6`; EXECUTE anon=false, authenticated=false, service_role=true. Ciclo real do cron 2398 já com a função nova: 00:40:00 `succeeded`. Sem inscrições Clube pendentes → 0 processadas, 0 emails.

## vitest dirigido
```
$ bunx vitest run src/test/crm-ingest-no-network.test.ts
 Test Files  1 passed (1)
      Tests  12 passed (12)
$ bunx tsgo --noEmit -p tsconfig.app.json   -> exit 0
```
Build: a cargo do harness (só SQL e testes mudaram).
