# CAPI v2 — provas (19/10/2026 ~02:20 UTC)

## Migração
`drizzle/migrations/0200_capi_v2_consent_events.sql` aplicada com sucesso (aditiva; sem DROP/ALTER POLICY; types.ts regenerado).

## Verificações locais
- `deno check` capi-v2-send (index+handler): exit 0.
- `bunx tsgo`: exit 0.
- `bunx vitest run src/test/capi-v2.test.ts`: 21/21 passam.
- Suite completa: 1616 passam, 1 falha em `src/test/issue333-proof60.test.ts > relay rejects stale…` — flake de timing pré-existente (passa isolado, 6/6; ficheiros não tocados nesta tarefa).

## Deploy
`capi-v2-send` deployada; source_sha256 `c30150e5bd4a01c9f0954c1db291b9c3f0d04ff064d62187153bb90a2b474fea`.

## Boot-check (gateway)
- POST sem Authorization → `401 {"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}` (verify_jwt ativo).
- POST com JWT anon → `401 {"error":"service_role_only"}` (guarda em código ativa).
- health/dry_run reais exigem service_role, que não está disponível ao agente; o comportamento está coberto pelos 21 testes herméticos (dry_run nunca chama o Graph; health não envia).

## Prova SQL em Live (só SELECT)
- Elegíveis hoje por target: Coala `0`, Newgang `0` (ambos `enabled=false`, `start_at=NULL`).
- `capi_v2_events`: 0 linhas. `capi_v2_targets`: 2.
- lead_capture com `consent_event_id` nas últimas 24h: 6 (todas portal `mp`; Coala/Newgang ainda não integrados — passo (a) da reserva).
- Total histórico com prova: 17.
- `capi_dispatch_control.suspended = true` (inalterado).

## Não executado
Nenhum envio à Meta (nem test_event_code), nenhum cron, nenhuma alteração a #320/#332, sem Publish.
