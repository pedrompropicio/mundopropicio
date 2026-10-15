# Issue #320 — fecho técnico (2026-10-15 ~22:25 UTC)

Sem Publish, envio ou retoma. Nenhum dado alterado (a migração 0165 só faz CREATE OR REPLACE com o mesmo corpo e um INSERT … ON CONFLICT DO NOTHING, no-op em Live).

## Comparação com o baseline (queries originais, executadas separadamente em Live)
```sql
SELECT count(*) AS sent_n, md5(string_agg(id::text||'|'||coalesce(capi_sent_at::text,'')||'|'||kind||'|'||created_at::text, ',' ORDER BY id)) AS sent_hash FROM public.leads WHERE capi_status='sent';
SELECT md5(string_agg(concat_ws('|',id,created_at,company_id,contact_id,event_id,kind,source,utm_source,utm_medium,utm_campaign,utm_content,mp_click_id,ip_inet,user_agent,fbc,fbp,geo_country,geo_city,geo_region),',' ORDER BY id)) FROM public.leads;
SELECT md5(string_agg(id::text||coalesce(capi_sent_at::text,''),',' ORDER BY id)) FROM public.leads;
```
```text
                    baseline                          agora                             resultado
sent_n              29550                             29550                             igual
sent_hash           b1738fd8ecdd96d7c54466ad7c81e112  b1738fd8ecdd96d7c54466ad7c81e112  igual
leads_fields_hash   d775b562729be41f10c2ff1477b67057  d775b562729be41f10c2ff1477b67057  igual
leads_sent_at_hash  0e558c3efec379aa87bbfafb8c53641e  0e558c3efec379aa87bbfafb8c53641e  igual
```

## Espelho das 6 funções-base (0165)
md5(pg_get_functiondef) antes e depois da 0165 — idênticos:
```text
_capi_classify_lead(uuid)                              43367a9b74abf51a0907351e03e3ce9c
capi_consent_proof(uuid,text)                          9eac954a1640af93ffae95b459bd7fb4
capi_dispatch_allowed()                                91524485f8dc950823ae26fa193f54d1
capi_lead_block_reason(uuid)                           fdb05ff418e7a8a3dc62e94e09996ef3
capi_record_meta_error(uuid,integer,integer,text,text) 97640acf9137a7ad995d504a63d0af00
capi_recover_processing(integer)                       728c073fcaa4a7f37cd9557bf9a7032e
```
has_function_privilege anon/authenticated/service_role: false/false/true nas 6. `capi_consent_proof` continua `SELECT false`.

## Instalação nova
- Ordem: 0164_gaps (tabelas, colunas, funções PL/pgSQL) → 0165 (6 funções-base + linha de controlo). As funções da 0164 que chamam as da 0165 são PL/pgSQL (resolução só em runtime), por isso a 0164 aplica sem elas; nada executa entre as duas.
- `capi_dispatch_control` nasce com `id=1, suspended=true` (INSERT da 0165).
- `capi_dispatch_allowed()` = `coalesce((SELECT NOT suspended … WHERE id=1), false)` → sem linha devolve `false` (fail-closed).
- Journal: 0164_issue320_capi_p1_gaps e 0165_issue320_capi_p1_foundations_mirror a seguir à 0163; nenhuma migração alheia renumerada.

## CI — pendência resolvida no fecho documental
CI confirmada independentemente pelo Claude e ChatGPT via conector GitHub: https://github.com/pedrompropicio/mundopropicio/actions/runs/38824514063, job `quality` `116728694956`, conclusion `success`, SHA `7b151756ad8060019de571b9295a6a978e0fbb1e` (confirmado no checkout do log). Ver `07-fecho-documental-ci.md`. A referência anterior a CI pendente descrevia esta etapa histórica, não o estado atual.
