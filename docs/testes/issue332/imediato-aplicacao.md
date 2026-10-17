# #332 imediato — aplicação em Live (17/10/2026)

Autorização Pedro 17/10/2026 ~11:27 UTC. HEADs iguais GitHub/Lovable: 67a9c7df467946a1665038ea3c08b01b24ad15c4 (ancestralidade OK).

## Aplicado
- Migração canónica `drizzle/migrations/0184_issue332_immediate_welcome.sql` (conteúdo de `supabase/manual/20261017_issue332_immediate.PENDENTE.sql`):
  - `club_welcome_reservations` + `attempt_count`, `next_attempt_at`, `retry_safe`;
  - `club_welcome_reserve`/`club_welcome_mark`: até 3 tentativas totais, intervalo 5 min, só `error_pre_send` com `retry_safe`; `unknown` nunca repetido automaticamente;
  - trigger `trg_club332_ingest_immediate` AFTER INSERT em `lead_capture` (`clube_newgang`/`processed=false`) → `crm_ingest_lead_captures(1,ARRAY[NEW.id])`; falhas isoladas por EXCEPTION, inscrição nunca falha;
  - `club_pending_capture_exists(site,email)` service_role, janela 30 min.
- Deploy apenas da edge `newgang-portal` (source sha256 d4ea74e16a324ddd1059800f69820e096f40bd6cd3c3c043195968e13bbb147f): `request_access` com email normalizado e estados sent/not_member/pending; welcome imediato via reserva.

## Medição ponta a ponta (Live)
Email de teste @mundopropicio.com:
- inscrição 11:28:31.292 UTC → membro criado 11:28:31.292 (mesmo instante, trigger) → boas-vindas enfileirado 11:28:31.965 UTC (**0,67 s**; antes: até ~5 min pelo cron */5).
- `email_send_log` status `sent`; reserva `enqueued`; 1 sessão; 1 welcome (sem duplicado).

## Preservação
- `club_points` antes e depois: 47 linhas / 4.375 pontos / hash 170f71afecb51e61fbc879a979298008 — inalterado por esta tarefa.
- Consentimentos, crons, P_NG27_LISTA, «Reativar», Wallet: intocados.

## Limpeza do teste (autorizada por Pedro, executada 11:29 UTC)
5 DELETEs na ordem apresentada (sessões, reservas, email_send_log, membro, captura). Verificação posterior: 0 linhas em todas as tabelas para o membro/captura do teste; club_points 47/4.375.

## Testes locais (antes da aplicação)
- SQL isolado PG17.9: 18/18 (`scripts/newgang-immediate/run.sh` + `scenario.sql`), incl. concorrência real 8 ligações (`concurrency.sh`): exatamente 1 retry, unknown bloqueado 8/8.
- Handler real: 7/7 (`run-handler.sh`/`handler_test.ts`); Deno `request-access_test.ts` 8/8; regressão handler 17/17; Vitest 1.281; build OK.

## Contrato final request_access
- 200 `{ok:true,status:"sent"}` membro (sessão criada + email); `"not_member"` sem membro nem captura pendente; `"pending"` captura clube_newgang processed=false nos últimos 30 min (sem sessão nem email).
- Limite 20 pedidos/IP/10 min → 429. Logs sem email em claro.

## Consulta manual (reservas unknown)
```sql
SELECT member_id,site_id,attempt_count,updated_at,error
FROM public.club_welcome_reservations WHERE status='unknown' ORDER BY updated_at;
```

## Pendências
- Comentário na Issue #332 (se conexão GitHub disponível); CI final não confirmado; portal separado não alterado (caixa de consentimento: marcada para granted de qualquer versão, versão visível — Publish por Pedro).
