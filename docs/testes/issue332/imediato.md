# #332 imediato — preparação

Pedro autorizou17/10/2026 às10:50UTC. HEADs iguais9da07f1293c0c41cad0835867f4879b133fb9382; ancestralidadeexit0. Reserva mantida, #323 preservada.

SQL inerte: supabase/manual/20261017_issue332_immediate.PENDENTE.sql. AFTER INSERT apenas clube_newgang/processed=false chama collector canónico(1,ARRAY[NEW.id]); triggers membro/consentimento existentes intactos. Falhas/query_canceled isoladas, inscrição preservada; HTTPwelcome pós-commit não apaga membro.

Reserva: até3 tentativas totais,5min intervalo, apenas error_pre_send comprovado/retry_safe. Linhas antigas não recebem retry_safe retroativo. unknown/reserved/enqueued/legacy_sent bloqueados, sem DELETE de reserva. session INSERT verifica erro e renderização pré-fila gera PreSendError; enqueue incerto permanece unknown. Conteúdo/supressão intactos.

request_access: membro sent; sem membro/captura sourceclube_newgang na empresa do site ativo/processedfalse/últimos30min pending; resto not_member. RPCsóservice_role, sem dados pessoais/sessão/envio para pending. Limite20/IP/10min preservado.

Testes: PostgreSQL17.9 socketUnix/listen_addresses vazio/semnet/dblink:16/16 asserções com collector0169 e motor327/328 reais. Inclui membro/processamento imediato, CAPIblocked, reserva única, cooldown/retry2/3/quarta bloqueada, unknown bloqueado, reenvio, outras origens, falhaHTTP sem perder membro, pending30min, pontos inalterados. Reserva simultânea SQL ainda só testada como segunda chamada sequencial, não ligações concorrentes. Deno8/8; Vitestwelcome7/7; buildautomáticoOK11:02:21UTC.

Antes da aplicação: leitura10:53UTC club_points47linhas/4375pontos/hash170f71afecb51e61fbc879a979298008 (row_to_json ordenadoid). Reconsultar na aplicação; atividade real pode mudar. HashesLive collector3cf7656e97f52c5b991cda127534aec6; member0e73d48a654ee1e3e39bd66f92bc3054; consent190326652e71ab48f62473b7a76063ba.

Consulta manual:
```sql
SELECT member_id,site_id,attempt_count,updated_at,error
FROM public.club_welcome_reservations WHERE status='unknown' ORDER BY updated_at;
```

Falta: SQLconcorrente real, handler/rate-limit, consenttrigger0183, migração canónica/deploy, E2E@mundopropicio.com/tempos. Limpeza só após SQL+SimPedro. Nenhuma escritaLive/envio/Publish/cron nesta etapa.