# #333 fase12i — aplicação do pacote A (esquema fechado) — 20/10/2026 ~17:15 UTC

Autorização: Pedro, 20/10/2026 14:10 Fortaleza ("Sim": instalar pacote no ERP + deploy só data-entry, assistente e execução financeira desligados). Base main=Lovable d46e991c6b07a1b9267afbe1e577fae975082c9f, CI run39459064285 SUCCESS. Pacote B NÃO ativado.

## A0 preflight (psql read-only oficial, antes de escrever)
- SHA-256 fontes = relatório 12h: review b071c52d689740b17a9d3f4072ff6576e19bc3ba69c3f94f70623c20e650a4d0, executor 93c813a2ba18f0f8a629d5625e67d5a74e9f13c4ec3245548b6dc849be028983.
- Objetos #333 review/executor: 0 tabelas, 0 funções (ausentes).
- Journal drizzle terminava em 0210 → 0211/0212 livres; a ferramenta oficial atribuiu exatamente esses números.
- md5 writers = canon12f (confirm 2e868bc2…, save 08b121ed…, create_transfer 01c9f9d4…, materialize ea609d67…, _derive 18a8b97b…, guard 081f6b20…, installments 4b361558…, tosl_guard 4cb7d3b7…, current_company_id f857f027…, _effective_permissions_for a6c16467…); owner postgres, SECDEF.
- Triggers: 39 (transactions+transaction_payments); 42 nas 5 tabelas do fecho (digest nome-a-nome 2dce8deb…; fórmula diferente da do 12h, contagem igual).

## A1/A2 aplicação (lov_database--migration, transação gerida pela ferramenta)
| id | ficheiro | sha256 aplicado | conteúdo |
|---|---|---|---|
| 0211 | drizzle/migrations/0211_issue333_assistant_review.sql | 6c348bb0d52f37842f5e9bfd729c52b10dda6a8c1ec6dcdab49145839d33d2a4 | = fonte sem `BEGIN;`/`COMMIT;` (diff: só newline final) |
| 0212 | drizzle/migrations/0212_issue333_assistant_executor.sql | d582d55c28b41761a54937dd8fc2bcf47bb8dc482ca57f23255c695ca99c5d5a | idem |
`SET LOCAL lock_timeout='5s'` mantido. Nenhuma alteração a tosl_guard, writers ou tabelas existentes.

## A3 readback
- 7 tabelas _333 novas: RLS on, ACL `{postgres=arwdDxtm, service_role=r}`, sem ACL de coluna, sem policies (só service_role lê).
- review_333: SECDEF, EXECUTE postgres+service_role; execute_333: SECDEF, EXECUTE postgres+authenticated; _de333_canon/_immutable/_cents/_req/_closing_check: sem grantees. anon sem EXECUTE em nenhuma.
- Triggers de imutabilidade: de333_versions_immutable/no_truncate, de333_auth_immutable/no_truncate, de333_exec_immutable/no_truncate.
- md5 prosrc: review_333 7b77c11c…, execute_333 8fac87cd…, closing_check b8548739…, cents 632fc483…, req 5c99de70…, canon d4a7d83e…, immutable 8e31b7bc….
- Gates: review_settings.enabled=false, executor_settings.enabled=false; scope=0; reviews=0, versions=0, authorizations=0, executions=0.
- Writers md5 e 39/42 triggers depois = antes.

## A4 código
`supabase/functions/data-entry/index.ts`: REVIEW_SCHEMA_REVIEWED=true, EXECUTOR_SCHEMA_REVIEWED=true. Mantidos: ASSISTANT_ENABLED=false, ASSISTANT_REVIEWED_SCOPES vazio, ANALYSIS_ENABLED=false, ANALYSIS_PROVIDER_REVIEWED=false, controlo durável fechado. Testes data-entry: 24 ficheiros / 219 PASS.

## Deploy — CONCLUÍDO 20/10/2026 ~17:34 UTC
Autorização Pedro 14:10 Fortaleza reiterada 14:32 (“Pode avançar”). Controller confirmou agentFinished=true, main=Lovable=5b29366ebe8a767da03f37c43b93cf168eda2dca e CI run39464824239 quality SUCCESS. HEAD local igual ao informado. Nenhum código funcional editado antes ou depois do deploy; migrações não reaplicadas.

Ferramenta oficial `supabase.deploy_edge_functions`, argumento exato `{"function_names":["data-entry"]}`: `Successfully deployed edge functions: data-entry`.
- SHA-256 submetido (files and settings): `e5478d0481ed423e3b2938acd2aa1b7c8bf092f0f8f538e04aaa3f488ebb93f9`.
- SHA-256 do index.ts validado: `68d26d5fd13411cc49c807f5df8398d37d713248175e6502554ca457d81bc2b6`.
- Deployment ID/versão da edge: não devolvidos pela ferramenta. Consulta oficial de logs mostrou boot às 17:34:45Z/17:34:47Z; analytics não retornou linhas e CLI info não expõe estes campos. Não inventado; hash submetido não é uma prova independente de hash live.
- Flags fonte: REVIEW_SCHEMA_REVIEWED=true, EXECUTOR_SCHEMA_REVIEWED=true; ASSISTANT_ENABLED=false, scopes vazio, ANALYSIS_ENABLED=false, ANALYSIS_PROVIDER_REVIEWED=false, uploadEnabled=false, pilotScoped=true.

### Readback oficial pós-deploy
`supabase.read_query`: review_enabled=false, executor_enabled=false; scope/reviews/review_versions/authorizations/executions=0; global_open/scoped_open/attempt_open=0. Controlo durável revision=16, state=closed, enabled=false, reviewed=false, active_claim=NULL, stage=idle. A primeira consulta usou por engano o nome inexistente `data_entry_assistant_versions_333` (42P01); corrigido para o nome instalado `data_entry_assistant_review_versions_333`, sem qualquer escrita.

7 tabelas próprias: owner postgres, RLS=true, ACL `{postgres=arwdDxtm/postgres,service_role=r/postgres}`, ACLs de coluna=0, policies=0. Seis triggers de imutabilidade/no_truncate habilitados (`O`). RPC review e executor contêm versão `333-12f`, owner postgres, SECDEF, search_path public/pg_temp, EXECUTE review só postgres/service_role e executor só postgres/authenticated. Helpers só postgres; anon sem grant.

MD5 prosrc completo pós-deploy:
- review: `7b77c11ce2dee7e4d72bbb358a3a2799`
- executor: `8fac87cdc99023cd9302ffae94cbdde8`
- closing_check: `b854873900780f8879638115d7b9a8da`
- cents: `632fc48322926f014808931d04744124`
- req: `5c99de7039f3670527db7c5a561c6273`
- canon: `d4a7d83ec0f654672c3f2b9f427a15a0`
- immutable: `8e31b7bc52905a0e46b1814bc3aa2f81`

## A5 endpoint pós-deploy
OPTIONS 200 (corpo vazio); POST sem Authorization 401 `{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}`; POST com chave anon 401 `{"error":"Sessão inválida"}`. Pedidos sem conta/login; nenhuma sessão injetada. Assistente efetivamente fechado por fonte+gates+scope+controlo; resposta autenticada 503/capabilities NÃO testada. Sem provider/Gmail reais, DDL/DML, alteração de flags/controlos ou Publish global. Pacote B não ativado.

Checklist: instalação0211/0212 previamente concluída; deploy somente data-entry concluído; endpoint200/401/401 e readback fechado conferidos; reserva própria333 libertada, #322/#323 preservadas. Única lacuna documental deste deploy: deployment ID não exposto pelos canais consultados. A pendência tosl_guard não foi investigada nem alterada.

## Reversão A
Deploy com os dois flags false; `executor.ROLLBACK-INERTE.sql` depois `review.ROLLBACK-INERTE.sql` (recusam se houver registos). Nenhum DROP feito.

## Pendente
- tosl_guard (corrida no apuramento) continua pendente de decisão: executor fica efetivamente fechado até lá.
