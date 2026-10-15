# Issue #320 — correção das lacunas da verificação independente (2026-10-15 ~22:15 UTC)

Sem Publish, sem retoma, sem pedidos à Meta. Interruptor `capi_dispatch_control.suspended=true`; crons 33/34/44/45 ausentes.

## Nota de rastreabilidade
Na sessão desta correção, o repositório não continha a migração 0164 inicial, o `_shared/capi-guard.ts`,
o teste nem as alterações às 4 edge functions descritas em 03-depois-0164-inicial.md (o journal parava na 0163;
Live tinha os objectos). Foi tudo recriado: a migração `drizzle/migrations/0164_issue320_capi_p1_gaps.sql`
reproduz de forma idempotente as tabelas/colunas da 0164 em Live e acrescenta as correções. As funções SQL
`_capi_classify_lead`, `capi_consent_proof`, `capi_dispatch_allowed`, `capi_lead_block_reason`,
`capi_record_meta_error`, `capi_recover_processing` naquela etapa existiam em Live sem DDL original no repo. Lacuna resolvida pela 0165: ver `05-fecho-tecnico.md` (espelho fiel via pg_get_functiondef).

## Queries exactas (pós-correção)
```sql
select (select count(*) from leads where capi_status='sent') sent_n,
(select md5(string_agg(id::text||'|'||created_at::text||'|'||coalesce(capi_sent_at::text,''),',' order by id)) from leads where capi_status='sent') sent_hash,
(select md5(string_agg(concat_ws('|',id,created_at,company_id,contact_id,event_id,kind,fbc,fbp),',' order by id)) from leads) leads_fields_hash,
(select json_object_agg(st,n) from (select coalesce(capi_status,'null') st, count(*) n from leads group by 1) s) por_status;
```
```text
sent_n=29550 sent_hash=6533a3e4f7bde10f68d4e6608c6a8fac leads_fields_hash=3b0b85b7befdc071a2291f99ded95985
por_status: sent 29550 · blocked_wrong_kind 6893 · skipped_old 4339 · skipped_no_pixel 3692 ·
error_insufficient_data 1505 · expired 50 · blocked_no_consent 31
```
Comparação com o baseline: ver 05-fecho-tecnico.md (queries originais re-executadas, iguais).

```sql
-- estado e privilégios
select suspended from capi_dispatch_control where id=1;           -- true
select count(*) from cron.job where jobid in (33,34,44,45);       -- 0
select count(*) from leads where capi_status is null or capi_status in ('retry','processing'); -- 0
select count(*) from capi_alerts;                                  -- 0
-- has_function_privilege anon/authenticated/service_role:
-- capi_guard_lead_dispatch, capi_classify_pending_blocked, process_leads_capi_batch,
-- portal_tick_lead_capture, portal_tick_redirect_log, capi_record_meta_error, capi_recover_processing
-- → false/false/true em todas
```
WHERE de `process_leads_capi_batch` contém `kind IS DISTINCT FROM 'redirect_click'` e `created_at >= now()-7d` (pg_get_functiondef verificado).

## Invocação directa (relato histórico; resposta preservada em 03-depois-0164-inicial.md)
As 4 funções devolvem 423 `capi_dispatch_control` antes de token, batch ou fetch.

## Provas versionadas e correção do relato
Nesta etapa foram relatados tsgo exit 0, vitest 1171 passam e build exit 0, mas os `.txt` em `logs/` eram ignorados pelo Git: não eram provas versionadas. A alegação de disponibilidade desses `.txt` fica anulada; preserva-se o rasto do incidente. Provas Markdown posteriores verificadas no commit: `06-tsgo.md`, `06-vitest.md`, `06-build.md`.

A pendência de CI desta etapa foi resolvida pela confirmação independente: CI confirmada independentemente pelo Claude e ChatGPT via conector GitHub: https://github.com/pedrompropicio/mundopropicio/actions/runs/38824514063, job `quality` `116728694956`, conclusion `success`, SHA `7b151756ad8060019de571b9295a6a978e0fbb1e` (confirmado no checkout do log). Ver `07-fecho-documental-ci.md`.
