# CAPI P1 no ERP — Issue #320 (por verificar independentemente)

Provas versionadas: `docs/testes/issue320/` (01 crons antes + reversão, 02 baseline, 03 depois inicial, 04 correção de lacunas, 05 fecho técnico, logs/). Decisão: D-ERP281. DDL: migrações 0164_issue320_capi_p1_gaps e 0165_issue320_capi_p1_foundations_mirror (espelho fiel das 6 funções-base).

## Estado
- `capi_dispatch_control.suspended = true`; crons 33/34/44/45 removidos; **sem retoma automática**.
- `capi_consent_proof()` devolve sempre `false` (não há prova de consentimento marketing por interação; P2/P3 por implementar). Logo, nenhum envio é possível mesmo que o interruptor seja aberto.

## Caminhos e guardas
| Caminho | Guardas |
|---|---|
| `process_leads_capi_batch` (SQL, ViewContent) | interruptor; WHERE exclui `redirect_click` e > 7 dias; guarda interna no loop classifica (`_capi_classify_lead`) |
| `capi_classify_pending_blocked(limit)` | via técnica separada: classifica redirect_click/expirados pendentes; não envia |
| `process-leads-capi` (edge) | interruptor antes de tudo; recuperação via `capi_recover_processing` (reaplica tipo/prazo/consentimento; erro → 500); **imediatamente antes do POST** `capi_guard_lead_dispatch(lead_id,'ViewContent')` com dados do servidor (estado `processing`, tipo, prazo, consentimento); `event_time` do servidor; 100/33 → `capi_record_meta_error` com verificação do retorno; falha do alerta ou de update de estado → resposta 500 com contadores `alert_failures`/`status_update_failures` |
| `capi-meta-events` (edge, wrapper) | interruptor; exige `lead_id` válido e passa pela mesma guarda servidor; ignora kind/data/evento do cliente; sem identidade → 403 `no_identity`; evento ≠ ViewContent → `wrong_event`; 100/33 → alerta com `alert_recorded` verdadeiro só se a RPC confirmar |
| `process-lead-capture` / `process-redirect-log` (edge, Lead/InitiateCheckout) | interruptor antes de consumir o batch; os payloads passam por `capi-meta-events`, que os bloqueia sempre (`no_identity`/`wrong_event`) — não há guarda por interação para estes eventos até P2/P3 |
| `portal_tick_lead_capture` / `portal_tick_redirect_log` (SQL) | **desactivados de forma dura**: devolvem `disabled` sem chamar batch nem `net.http_post`. `net.http_post` é assíncrono e não permite tratar 100/33; não podem ser retomados sem nova migração que implemente leitura de resposta |

Fora de âmbito: `song-link-event` (envia Meta, não coberto pela #320).

## Efeito colateral
Com os ticks/edge suspensos, a ingestão lead_capture/redirect_log → contacts/leads também está parada (dados guardados nas tabelas de origem). Não separado nesta tarefa.

## Reversão (manual, sem retoma)
Ver `docs/testes/issue320/01-crons-antes-e-reversao.md`. Reabrir o interruptor não envia nada enquanto `capi_consent_proof` for `false`; os ticks SQL exigem migração nova.
