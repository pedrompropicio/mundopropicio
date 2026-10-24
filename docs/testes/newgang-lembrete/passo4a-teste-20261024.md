# Lembrete Newgang — passo 4A (teste) — 24/10/2026 — concluído pelo 0·Cowork

## Origem e execução
HEAD registado na tentativa inicial do agente: `f11988f77965ff38e13d391e0b66c694603526fe` (então indicado como GitHub main). Antes dessa tentativa: `club_reminder_reservations = 0`; `email_send_log` com template `newgang_club_reminder = 0`.

A tentativa inicial do agente devolveu `403 {"error":"origin"}` por falta da credencial exigida pelo canal. Essa tentativa não criou reservas nem e-mails; não representa o estado final do passo.

**Correção do estado:** o dry_run e o teste foram executados pelo **0·Cowork via `net.http_post`, com a chave do cofre**. A chave e os tokens dos links não são reproduzidos. Origem desta atualização: relato do Pedro em 24/10/2026, 18:19 UTC, com medições do 0·Cowork por query em Live; o agente não repetiu chamadas nem queries neste fecho.

Pedro confirmou receção do e-mail, rodapé com as duas promotoras e que o botão abriu a página de confirmação. A reserva de teste é única; o reteste não autoriza repetir lembretes para outros membros. Tempo exato do dry_run, resposta integral, IDs completos dos dois `welcome_none`, `message_id` final completo e hora de envio do teste não foram disponibilizados neste relato; não são inventados.

## Lição 1 — deduplicação local pelo message_id
`process-email-queue` descarta sem enviar uma mensagem cujo `message_id` já tenha linha `sent` em `email_send_log`. O reteste do mesmo membro (9528) exigiu que o 0·Cowork renomeasse a linha `sent` antiga para `...-teste1` e apagasse a `pending` órfã. Registo histórico de uma intervenção já feita; este fecho não executa nem prescreve novo DML.

## Lição 2 — idempotência na Resend
A Resend devolve **409 `invalid_idempotent_request` durante 24 h** se a mesma chave de idempotência for reutilizada com corpo diferente. O reteste exigiu mudar a chave da mensagem na fila para `...-t2`. No envio em massa descrito não se aplica: uma chave por membro e corpo nunca alterado.

## Estado final comunicado às 18:19 UTC
- 1 reserva de teste, além de 1.674 reservas reais (`test=false`, todas `enqueued`).
- Envio real: 0 `failed/dlq` em `email_send_log`, 0 supressões novas.
- Canário de 300 às 16:45 UTC: 300 enviados, 0 falhas, 28 confirmações em cerca de 1 h.
- Tentativa de 500 às 17:42 UTC falhou antes de reservar/enviar (502, erro http2); zero efeitos desse lote.
- Lotes de até 300 às 17:50, 17:56, 18:02, 18:09 e 18:15 UTC, último com 174 candidatos: todos com 0 falhas.
- 64 confirmações desde as 16:44 UTC; 1.910 ainda por confirmar na consulta às 18:19 UTC.
- Excluídos: 5 suprimidos, 234 com menos de 48 h, 15 `welcome_not_sent`, 2 `welcome_none`. Recuperar os dois IDs completos da resposta original do dry_run, não de um prefixo incerto.

## Seguimento separado
Issue [#356](https://github.com/pedrompropicio/mundopropicio/issues/356), P2 · MP-CRM · R1: corrigir a busca que coloca os IDs na URL ou limitar `limit`; até lá, máximo operacional 300. Código não alterado neste fecho. Recentes são reavaliados depois por decisão do Pedro; sem cron nem novo envio autorizado aqui.
