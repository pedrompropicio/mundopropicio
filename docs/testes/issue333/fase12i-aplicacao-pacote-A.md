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

## Deploy — AGUARDA CI
Não feito nesta sessão: o CI do SHA com esta alteração só corre depois do commit. Próximo passo (controller): CI verde no novo SHA → deploy SÓ `data-entry`. Efeito esperado: assistente continua 503 (ASSISTANT_ENABLED=false) e SQL recusa (gates false, âmbito vazio).

## A5 endpoint (versão atualmente deployada)
OPTIONS 200; POST sem Authorization 401 `UNAUTHORIZED_NO_AUTH_HEADER`; POST com chave anon 401 `Sessão inválida`. Sem login, provider ou Gmail reais.

## Reversão A
Deploy com os dois flags false; `executor.ROLLBACK-INERTE.sql` depois `review.ROLLBACK-INERTE.sql` (recusam se houver registos). Nenhum DROP feito.

## Pendente
- tosl_guard (corrida no apuramento) continua pendente de decisão: executor fica efetivamente fechado até lá.
