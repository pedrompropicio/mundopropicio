# Tarefa91 — aplicação autorizada pacote90 (19/10/2026 ~12:25 UTC)

Autorização: Pedro SIM 09:17 Fortaleza; controller CI416 SUCCESS; HEAD base 03d0708a9bf2b729c466f6c09e2ba042d66c1056.

## Pré-check imediato (read_query)
registry 204 linhas/maxid204; objetos control/audit333 ausentes; 0 funções `data_entry_analysis_%_333`.

## Aplicação (canal oficial lov_database--migration)
- Fonte: `supabase/manual/issue333_tarefa90_application.INERTE.sql` sha256 ff47d3bd…148e.
- Transformação única: removidas linha3 `BEGIN;` e última `COMMIT;` (canal gere a transação). Corpo restante idêntico (diff = só newline final).
- Registado: `drizzle/migrations/0203_issue333_analysis_control.sql`, registry id205, hash ef1530a26106b4f373f442139450d0161e6878a9844c725d836933054eb49704. Barreiras ACL internas não abortaram.

## Readback (SELECT)
- control: revision1 closed, enabled/reviewed false, claim NULL, stage idle, reason closed.
- audit: 1 linha revision1 idle/closed, sem admin_action.
- Tabelas: owner postgres, RLS on, ACL `postgres=arwdDxtm, service_role=r`; service_role só SELECT (DML false); anon/authenticated sem qualquer direito.
- transition_333: SECDEF, owner postgres, search_path pg_catalog,public, EXECUTE só service_role. responsible_333: INVOKER, ACL só postgres; service/anon/auth false.
- Legado: data_entry_settings 0/0 abertos; pilot8_allowlist 0/0; standalone_attempt_settings_333 0/0; pg_default_acl intacto (não alterado).

## Deploy
Só `data-entry`, source_sha256 233d2174b94ee7ca36ecbaeae970fe13ed9933a44cfda3a7822d95565d23abd9. Gates no código: ANALYSIS_ENABLED=false, ANALYSIS_PROVIDER_REVIEWED=false, uploadEnabled=false, pilotScoped=true.
Recusas: OPTIONS 200; POST sem auth 401 UNAUTHORIZED_NO_AUTH_HEADER; anon 401 "Sessão inválida". Sem login/conta/documento/chamada provider.

Não feito (fora da autorização): reopen/confer, flags true, janela nominal, modelo, Publish.
