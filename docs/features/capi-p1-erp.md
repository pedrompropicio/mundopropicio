# CAPI do ERP — P1 (Issue #320, D-ERP281)

Estado em 15/10/2026: **tudo suspenso**. Nenhum evento sai para a Meta a partir do ERP.

## Caminhos que enviam à Meta (inventário)
| Caminho | Evento | Como sai | Protecção P1 |
|---|---|---|---|
| cron 33 `portal_tick_lead_capture()` | Lead | `net.http_post` na BD | cron removido; função pára no topo se suspenso; consentimento antes do POST |
| cron 34 `portal_tick_redirect_log()` | InitiateCheckout | `net.http_post` na BD | idem |
| crons 44/45 `crm.tick_leads_capi` → edge `process-leads-capi` | ViewContent | fetch na edge | crons removidos; 423 se suspenso; regras na selecção SQL e antes do POST |
| edge `process-lead-capture` → `capi-meta-events` | Lead | fetch | 423 se suspenso; consentimento antes do envio |
| edge `process-redirect-log` → `capi-meta-events` | InitiateCheckout | fetch | idem |
| edge `capi-meta-events` (chamável directamente) | qualquer | fetch | 423 se suspenso; 403 sem prova de consentimento |
| edge `song-link-event` (smart links de artista) | — | fetch | **fora do âmbito #320, não alterado** |

## Peças
- `public.capi_dispatch_control` (1 linha, `suspended`): interruptor persistente lido por SQL e edge. Erro de leitura = suspenso.
- `public.capi_consent_proof(lead, evento)`: prova de consentimento marketing por interacção. **No P1 devolve sempre false**: não existe registo dessa prova (o `consent_email` do `lead_capture` é newsletter; cookies, fbc/fbp e email não contam).
- `public.capi_lead_block_reason(lead)` e `_capi_classify_lead(lead)`: regras únicas — `redirect_click` nunca gera ViewContent (`blocked_wrong_kind`), > 7 dias `expired`, sem prova `blocked_no_consent`. Nunca tocam em `sent`.
- `public.capi_recover_processing(min)`: `processing` antigo passa pelas mesmas regras; com suspensão nada é reaberto.
- `public.capi_record_meta_error(...)`: Meta 100/33 → `error_meta_access` terminal + linha em `public.capi_alerts` (sem mensagens externas).
- Colunas de rasto em `leads`: `capi_status_before`, `capi_block_reason`, `capi_classified_at`.
- Lógica pura partilhada: `supabase/functions/_shared/capi-guard.ts` (testes em `src/test/capi-p1-guard.test.ts`, rede bloqueada).
- Tudo só `service_role`.

## Reversão (manual, sem retoma automática; só por ordem do Pedro)
1. Retomar exige DUAS acções explícitas: `update public.capi_dispatch_control set suspended=false, updated_by='<quem>', reason='<porquê>' where id=1;` **e** recriar os crons (comandos em `claude-outputs/2026-10-15-2150-issue320-crons-antes.md`).
2. Mesmo retomado, nada sai enquanto `capi_consent_proof` devolver false — falta a captura do consentimento (P2/P3).
3. As classificações não se desfazem automaticamente; `capi_status_before` guarda o valor anterior de cada linha.
4. Voltar ao código anterior das edge functions = repor os 4 ficheiros a partir do commit anterior ao desta demanda e redeploy (não recomendado: perde a trava contra chamada directa).

## Pendente para P2/P3 (não implementado)
Registo de consentimento marketing por interacção, com revogação: tabela append-only (ex.: `marketing_consent_events`: interaction_id = `client_event_id`, subject, purpose='meta_capi', granted bool, policy_version, captured_at, origem), escrita pelo portal no momento do clique/formulário, e `capi_consent_proof` a ler o último registo dessa interacção. Exige alteração ao portal (outro projecto) — por decidir.
