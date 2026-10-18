# #333 — Prova46: preflight do canal oficial BLOQUEADO

Verificação: 2026-10-18 02:48:42 UTC. HEAD observado `8328be6c6f61b1605074ad53b6b8a387dca1fb97`; ancestralidade da base autorizada exit0. INDEX, QUADRO, estado-plataforma-e-infra, memória document-entry-assistant e provas41/43/44/45 lidos. #333 aberta/reservada; #323 e DECISIONS preservadas.

## Resultado finito

A ferramenta oficial `supabase--run_sql` foi carregada, mas NÃO invocada. A descrição disponível diz literalmente:

```text
Change data in the Supabase database with a SQL query that only inserts, updates or deletes. Runs unauthenticated, so auth.uid() is NULL — don't reference it.
```

A consulta ao catálogo de conhecimento não encontrou documentação adicional que suporte SELECT neste mesmo canal. O facto de o argumento `query` ser uma string não documenta suporte a SELECT. A descrição de `auth.uid()` NULL é contrato documental, NÃO observação runtime.

A condição técnica do controlador naquele pedido determinava parar se SELECT não fosse suportado/documentado; não era uma nova regra de Pedro. Portanto não executei SELECT por run_sql nem substituí o canal por read_query, psql, Data API ou sessão administrativa. Também não usei SET ROLE, escrita inócua, RPC/helper, GRANT ou autenticação como contorno.

## Matriz de evidência

- Documentação do canal: PASS na identificação; suporta somente INSERT/UPDATE/DELETE.
- current_user/session_user/auth.uid no runtime run_sql: NÃO EXECUTADO / BLOQUEADO pelo contrato documental.
- UPDATE user_roles / INSERT standalone_attempts_333 / SELECT profiles: privilégios efetivos NÃO DEMONSTRADOS neste canal.
- Viabilidade real da preparação da fixture: BLOQUEADA; não inferir de AuthAdmin, de read_query ou do privilégio nominal service_role.
- SQL integral de preparação / runner futuro / validação PostgreSQL com auditoria: NÃO PREPARADOS nesta entrega, por paragem explícita no primeiro preflight. Não anunciar roteiro executável ou local PASS.
- Contas, login, roles, profiles, reservas e pedidos negativos Cloud: ZERO operações nesta entrega. Nenhum baseline Live novo; evidência43/44 preservada, não repetida.

## Consulta pretendida — INERTE, NÃO SUBMETIDA

Somente se o MESMO canal vier a documentar suporte a SELECT, a consulta de preflight deverá observar a identidade e os privilégios sem trocar de papel:

```sql
SELECT current_user AS effective_sql_role,
       session_user AS session_sql_role,
       auth.uid() AS authenticated_user,
       has_schema_privilege(current_user, 'public', 'USAGE') AS public_usage,
       has_table_privilege(current_user, 'public.user_roles', 'SELECT') AS roles_select,
       has_table_privilege(current_user, 'public.user_roles', 'UPDATE') AS roles_update,
       has_table_privilege(current_user, 'public.standalone_attempts_333', 'SELECT') AS attempts_select,
       has_table_privilege(current_user, 'public.standalone_attempts_333', 'INSERT') AS attempts_insert,
       has_table_privilege(current_user, 'public.profiles', 'SELECT') AS profiles_select,
       has_table_privilege(current_user, 'auth.users', 'SELECT') AS fixture_identity_select,
       has_table_privilege(current_user, 'storage.objects', 'SELECT') AS objects_select;
```

Mesmo privilégios de tabela positivos não bastam para certificar execução: é preciso conferir RLS, triggers e pré-condições no mesmo canal suportado antes de consumir qualquer conta. Esta consulta é um artefacto de revisão, não SQL de preparação e não autorização de escrita.

## CI e limites

Consulta pública efetiva: CI39090966400 `completed/success`, SHA `f55385511195eb82f00f2c917155299c2b1cefc4`, updated_at `2026-10-18T02:43:33Z`. Isto confirma a entrega43, não a CI final do HEAD8328 nem deste documento. Resultado final desta entrega depende do autocommit/CI posterior; não declarar verde antes da observação.

Nenhum produto, regra, AGENTS, SQL aplicado, ACL, configuração ou dado alterado. Sem testes Cloud, conta nova, upload, fatura, efeitos financeiros, deploy ou Publish. Fase6 e os dois HTTP continuam pendentes; causa do timeout antigo não demonstrada.

## Retificação e desbloqueio pelo controlador (18/10/2026 02:51UTC)

A condição SELECT no run_sql era do controlador, não uma regra nova de Pedro. O controlador comunicou observação real no seu conector Lovable query_database: current_user=postgres; UPDATE user_roles=true; INSERT standalone_attempts_333=true. Nenhum dado alterado nesse preflight. Esta observação pertence ao canal do controlador e não ao run_sql/agente; não foi repetida pelo agente. O requisito anterior foi retirado. Preparação integral local/inertizada na prova47 para execução futura pelo controlador, sem investigar novamente run_sql nem alterar grants. Nenhuma decisão de negócio nova.