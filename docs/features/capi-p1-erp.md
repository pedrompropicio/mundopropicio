# CAPI P1 no ERP — Issue #320 (P1 validado; fecho documental autorizado)

Provas versionadas: `docs/testes/issue320/` (01 crons antes + reversão, 02 baseline, 03 depois inicial, 04 correção de lacunas, 05 fecho técnico, 06 provas Markdown de testes/build, 07 fecho documental e CI). Decisão: D-ERP281. DDL: migrações 0164_issue320_capi_p1_gaps e 0165_issue320_capi_p1_foundations_mirror (espelho fiel das 6 funções-base).

## Estado
- P1 validado independentemente; fecho documental autorizado pelo Pedro em 15/10/2026, 23:49 UTC. Não significa conclusão de todo o projeto CAPI. Pedro fecha a Issue pelo conector após a entrega; reserva libertada no fecho documental.
- CI confirmada independentemente pelo Claude e ChatGPT via conector GitHub: https://github.com/pedrompropicio/mundopropicio/actions/runs/38824514063, job `quality` `116728694956`, conclusion `success`, SHA `7b151756ad8060019de571b9295a6a978e0fbb1e` (confirmado no checkout do log). Prova: `docs/testes/issue320/07-fecho-documental-ci.md`.
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

## Diagnóstico sem segredos (15/10/2026, 23:3x UTC)
`capi-meta-events` deixou de devolver `srk_prefix`, `srk_len` e `rpc_body_preview` no `missing_capi_token`, e o log de arranque deixou de mostrar o comprimento do token. O diagnóstico vem de `buildMissingTokenDiag` (`_shared/capi-guard.ts`): só `srk_present`, `supabase_url_present`, `env_token_present`, `rpc_http_status`, `vault_fetch_failed`. Os outros 3 consumidores não tinham este padrão. Teste: `src/test/capi-diag-no-secrets.test.ts`, que também verifica o código-fonte dos 4. Função publicada de novo (deploy da edge function, sem Publish); o interruptor continua suspenso.
Provas: `docs/testes/issue320/06-tsgo.md`, `06-vitest.md`, `06-build.md`. Os `.txt` em `logs/` são ignorados pelo `.gitignore` (regra `logs`), por isso não estão no Git; contam como provas só os `.md`.

## Verificação independente e fecho documental (15/10/2026, 23:49 UTC)
11 corpos de funções SQL comparados repo × Live iguais; grants anon/authenticated false, service_role true. `sent_n=29550`, `sent_hash=b1738fd8ecdd96d7c54466ad7c81e112` preservados; suspensão true e quatro jobs ausentes. Diagnóstico sensível removido confirmado por leitura.

CI: tsgo, vitest, canário runtime verify_jwt e build verdes; 151 ficheiros aprovados + 1 skipped; 1177 testes aprovados + 1 skipped + 11 todo. Canário `crm-meta-create-purchase-audience` → `UNAUTHORIZED_LEGACY_JWT Invalid JWT [401]`: recusa esperada, não falha de qualidade. Confirmação fornecida pelo Pedro, verificada independentemente pelo Claude e ChatGPT; não se repetiram testes nem se investigou a CI nesta sessão.

Os relatos anteriores de CI pendente e de `.txt` versionados ficam anulados pelo resultado consolidado em `docs/testes/issue320/07-fecho-documental-ci.md`. Provas válidas são os Markdown; os `.txt` ignorados não contam. Este fecho não alterou código, migrações, SQL, dados, fila, crons ou configurações e não fez deploy, Publish, pedidos à Meta, envios ou retoma. Publish automático permanece DESLIGADO. P2/P3 fora do âmbito; a ingestão continua suspensa e a retoma exige autorização própria.
