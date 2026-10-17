# #333 — outputs integrais da cópia isolada

Base arquivada: 12dd324ea4c7ee2d9f1d3e61543a2d06cf8633e8. Sem envprod/deployhooks/credenciais.

## apply.log

```text
patching file supabase/functions/_shared/standalone-identity.ts
patching file supabase/functions/_shared/standalone-compat.ts
patching file src/lib/standalone-identity-lookup.ts
patching file src/pages/StandaloneInvoiceScanner.tsx
patching file src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx
patching file supabase/functions/ingest-standalone-invoice/index.ts
patching file supabase/manual/20261017_issue333_core.PENDENTE.sql

exit=0

```

## apply-revised.log

```text
patching file supabase/functions/_shared/standalone-identity.ts
patching file supabase/functions/_shared/standalone-compat.ts
patching file src/lib/standalone-identity-lookup.ts
patching file src/pages/StandaloneInvoiceScanner.tsx
patching file src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx
patching file supabase/functions/ingest-standalone-invoice/index.ts
patching file supabase/manual/20261017_issue333_core.PENDENTE.sql

exit=0

```

## apply-final.log

```text
patching file supabase/functions/_shared/standalone-identity.ts
patching file supabase/functions/_shared/standalone-compat.ts
patching file src/lib/standalone-identity-lookup.ts
patching file src/pages/StandaloneInvoiceScanner.tsx
patching file src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx
patching file supabase/functions/ingest-standalone-invoice/index.ts
patching file supabase/manual/20261017_issue333_core.PENDENTE.sql

EXIT: 0

```

## hashes.log

```text
316d9e0ffa9ccd6dd46648d3b9220587c3eeb44df1c8df3104952c37b533bd5c  patches/issue333/compatibility.PENDENTE.patch
9f8baeea0a19931c6b591aaf8f65d2429845bacd0c2a66004ef24b0501d8c3ef  patches/issue333/core.PENDENTE.sql
e6d85d294eefb9b764a2a1cb81469398f43e3c8cc7cf6900ead3acbe52cf39ab  supabase/manual/20261017_issue333_normalized_uniqueness.PROPOSTA.sql
7 BASE and 7 PREPARED hashes verified; active main destinations unchanged

```

## integrated.log

```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config docs/testes/issue333/vitest.integrated.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated/tree[39m

 [32m✓[39m docs/testes/issue333/integrated/endpoint.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 177[2mms[22m[39m
[90mstderr[2m | docs/testes/issue333/integrated/ui.test.tsx[2m > [22m[2mreal patched scanner/editor + fake client; not RLS acceptance[2m > [22m[2mscanner incomplete key lost response locks save/retake, survives remount; no blind retry
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | docs/testes/issue333/integrated/ui.test.tsx[2m > [22m[2mreal patched scanner/editor + fake client; not RLS acceptance[2m > [22m[2meditor own-ID exclusion allows update; lost response blocks repeat and keeps file
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 [32m✓[39m docs/testes/issue333/integrated/ui.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[33m 1279[2mms[22m[39m
   [33m[2m✓[22m[39m real patched scanner/editor + fake client; not RLS acceptance[2m > [22mscanner incomplete key lost response locks save/retake, survives remount; no blind retry [33m 583[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m29 passed[39m[22m[90m (29)[39m
[2m   Start at [22m 18:14:16
[2m   Duration [22m 4.71s[2m (transform 584ms, setup 389ms, collect 1.22s, tests 1.46s, environment 1.86s, prepare 1.41s)[22m


EXIT: 0

```

## integrated-final.log

```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config docs/testes/issue333/vitest.integrated.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated/tree[39m

 [32m✓[39m docs/testes/issue333/integrated/endpoint.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 180[2mms[22m[39m
[90mstderr[2m | docs/testes/issue333/integrated/ui.test.tsx[2m > [22m[2mreal patched scanner/editor + fake client; not RLS acceptance[2m > [22m[2mscanner incomplete key lost response locks save/retake, survives remount; no blind retry
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | docs/testes/issue333/integrated/ui.test.tsx[2m > [22m[2mreal patched scanner/editor + fake client; not RLS acceptance[2m > [22m[2meditor own-ID exclusion allows update; lost response blocks repeat and keeps file
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 [32m✓[39m docs/testes/issue333/integrated/ui.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[33m 1233[2mms[22m[39m
   [33m[2m✓[22m[39m real patched scanner/editor + fake client; not RLS acceptance[2m > [22mscanner incomplete key lost response locks save/retake, survives remount; no blind retry [33m 547[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m29 passed[39m[22m[90m (29)[39m
[2m   Start at [22m 18:24:39
[2m   Duration [22m 4.28s[2m (transform 439ms, setup 315ms, collect 1.03s, tests 1.41s, environment 1.71s, prepare 1.16s)[22m


EXIT: 0

```

## pg.log

```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config docs/testes/issue333/vitest.pg.config.ts --reporter=verbose

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated/tree[39m

 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 identidade canónica (current_company_id + _effective_permissions_for)[2m > [22mpapel de outra empresa não vale: manager em A, viewer em B activa → recusado[32m 35[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 identidade canónica (current_company_id + _effective_permissions_for)[2m > [22mactive_company sem membership cai para a empresa canónica (A) e aí é manager[32m 9[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 identidade canónica (current_company_id + _effective_permissions_for)[2m > [22meditor (permitido na avulsa legada) é recusado pelo #333; platform_admin aceite na empresa activa[32m 6[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 identidade canónica (current_company_id + _effective_permissions_for)[2m > [22mlote de outro utilizador é inacessível[32m 7[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 grants e ACL[2m > [22manon sem nada; authenticated só RPC de sessão; receipt só service_role; tabelas fechadas[32m 6[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 validação na fronteira SQL[2m > [22mrecusa campo extra, valor em texto, moeda não-EUR, dia inexistente, 3 casas, pagador de outra empresa, NIF do destinatário errado[32m 37[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 validação na fronteira SQL[2m > [22mdocumento sem recibo de armazenamento conferido não entra[32m 5[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 validação na fronteira SQL[2m > [22mo mesmo ficheiro no mesmo lote é reutilizado, não duplicado[32m 8[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 validação na fronteira SQL[2m > [22msnapshot_hash é SHA-256 real (pgcrypto) do snapshot[32m 14[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 execução, autorização e conferência[2m > [22mexecução fechada sem configuração validada[32m 15[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 execução, autorização e conferência[2m > [22mhash diferente ou prévia antiga invalida a autorização[32m 19[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 execução, autorização e conferência[2m > [22msem recibo do arquivo final não grava[32m 11[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 execução, autorização e conferência[2m > [22mgrava 1 avulsa com observação do utilizador autenticado e a conferência compara o persistido[32m 22[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 execução, autorização e conferência[2m > [22mconferência completa detecta cada campo prometido; estado processado legítimo é atual separado[32m 78[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 execução, autorização e conferência[2m > [22mtabelas financeiras proibidas ficam intactas (triggers fariam falhar qualquer escrita)[32m 2[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 concorrência real entre duas ligações[2m > [22mmesmo lote/documento em duas ligações: a 2.ª espera e devolve o MESMO resultado; 1 avulsa[33m 435[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 concorrência real entre duas ligações[2m > [22mdois lotes com a mesma fatura: o lock serializa e o 2.º recebe 'já existe'[33m 451[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 concorrência real entre duas ligações[2m > [22mescritor legado com a MESMA grafia: o índice canónico bloqueia o 2.º (qualquer ordem)[33m 877[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 concorrência real entre duas ligações[2m > [22mLIMITAÇÃO comprovada: legado com grafia normalizada diferente NÃO é bloqueado pelo índice actual[32m 34[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 falhas, rollback e retoma[2m > [22mfalha injectada após INSERT e antes da auditoria: nada fica; retoma grava uma vez[32m 24[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 falhas, rollback e retoma[2m > [22mresposta perdida após COMMIT: retoma devolve o mesmo resultado e a conferência confere o persistido[32m 20[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 falhas, rollback e retoma[2m > [22mregistos técnicos são imutáveis[32m 2[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 handler + PostgreSQL real + storage fake: interleaving final partilhado[2m > [22mP1 suspenso, P2 nova versão COMMIT, P1 40001: bytes e 1 avulsa/auditoria intactos[32m 55[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 handler + PostgreSQL real + storage fake: interleaving final partilhado[2m > [22mP1 suspenso, P2 nova versão COMMIT, P1 08006: bytes e 1 avulsa/auditoria intactos[32m 38[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mindex valid/ready; proposed strong function matches JS bytes with prefixes/separators/nonASCII[32m 7[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22massistant × adapted real legacy INSERT equivalent; legacy first=true[33m 420[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22massistant × adapted real legacy INSERT equivalent; legacy first=false[33m 423[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mlegacy × legacy INSERT both orders firstLower=true[33m 407[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mlegacy × legacy INSERT both orders firstLower=false[33m 404[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mUPDATE metadata key collision rolls back fields, status and file reference[32m 8[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mlegacy INSERT × legacy UPDATE collision with barrier; insert first=true[33m 404[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mlegacy INSERT × legacy UPDATE collision with barrier; insert first=false[33m 407[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mFT1/23 vs FT12/3 and AB-12 vs AB1-2 DISTINCT; no similarity identity[32m 39[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mNULL/SPACE empty repeat; prefixes/zeros/separators/company independently preserved[32m 11[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mstrong duplicate 23505 failure rollback permits waiting competitor, no duplicate audit[33m 405[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts[2m > [22m#333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mprepared real ingest adapter × PostgreSQL index + fake bytes: 23505/document conflict/unknown, preserved files[32m 17[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m36 passed[39m[22m[90m (36)[39m
[2m   Start at [22m 18:18:13
[2m   Duration [22m 8.31s[2m (transform 215ms, setup 0ms, collect 278ms, tests 7.41s, environment 0ms, prepare 311ms)[22m


EXIT: 0

```

## handler.log

```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config docs/testes/issue333/vitest.handler.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated/tree[39m

 [32m✓[39m docs/testes/issue333/handler/handler.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 127[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m20 passed[39m[22m[90m (20)[39m
[2m   Start at [22m 18:24:44
[2m   Duration [22m 1.61s[2m (transform 152ms, setup 0ms, collect 175ms, tests 127ms, environment 0ms, prepare 765ms)[22m


EXIT: 0

```

## tsgo.log

```text
COMMAND: /root/.bun/install/cache/@typescript/native-preview-linux-x64/7.0.0-9b4cac1d418d8402@@@1/lib/tsgo -p tsconfig.app.json --noEmit

EXIT: 0

```

## tsgo-final.log

```text
COMMAND: /root/.bun/install/cache/@typescript/native-preview-linux-x64/7.0.0-9b4cac1d418d8402@@@1/lib/tsgo -p tsconfig.app.json --noEmit

EXIT: 0

```

## deno.log

```text
COMMAND: /nix/store/xxa0s0pixj84ail4ngll2y9zg8y7lmap-deno-2.6.10/bin/deno check --no-remote --config deno-isolated.json supabase/functions/ingest-standalone-invoice/index.ts supabase/functions/_shared/standalone-compat.ts
[0m[32mCheck[0m supabase/functions/ingest-standalone-invoice/index.ts
[0m[32mCheck[0m supabase/functions/_shared/standalone-compat.ts

EXIT: 0

```

## deno-final.log

```text
COMMAND: /nix/store/xxa0s0pixj84ail4ngll2y9zg8y7lmap-deno-2.6.10/bin/deno check --no-remote --config deno-isolated.json supabase/functions/ingest-standalone-invoice/index.ts supabase/functions/_shared/standalone-compat.ts
[0m[32mCheck[0m supabase/functions/ingest-standalone-invoice/index.ts
[0m[32mCheck[0m supabase/functions/_shared/standalone-compat.ts

EXIT: 0

```

## general-no-fixture-env.log

```text
COMMAND: /dev-server/node_modules/.bin/vitest run

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated/tree[39m

 [32m✓[39m src/lib/__tests__/no-direct-transaction-document-remove.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 142[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-embeds.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 352[2mms[22m[39m
   [33m[2m✓[22m[39m embeds do PostgREST em pares com FK duplicada[2m > [22m[Issue #288] nenhum embed ambíguo sem a FK nomeada [33m 348[2mms[22m[39m
 [32m✓[39m src/test/newgang-wallet-google.test.ts [2m([22m[2m12 tests[22m[2m)[22m[33m 371[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-row-limit.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 320[2mms[22m[39m
   [33m[2m✓[22m[39m barreira dos 1.000 registos do PostgREST[2m > [22m[Issue #289] nenhuma leitura de tabela grande sem paginação [33m 312[2mms[22m[39m
 [32m✓[39m src/test/campaign-design-optional-roas.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 285[2mms[22m[39m
[90mstderr[2m | src/pages/__tests__/ResetPassword.test.tsx[2m > [22m[2mResetPassword — token_hash flow[2m > [22m[2m(a) não chama verifyOtp ao montar; só ao clicar Continuar
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/pages/__tests__/ResetPassword.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 263[2mms[22m[39m
 [32m✓[39m src/test/forecast-attachment-counts.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 416[2mms[22m[39m
   [33m[2m✓[22m[39m anexos do BP — uma leitura por evento (#269)[2m > [22m361 linhas → 1 pedido a event_forecast_attachments [33m 409[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/document-detect.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 1737[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 12°, centrado com erro < 3% [33m 560[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado -18°, à esquerda com erro < 3% [33m 341[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 20°, canto sup. dir. com erro < 3% [33m 314[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 6°, grande com erro < 3% [33m 317[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/storage-multi-tenant.test.ts [2m([22m[2m14 tests[22m[2m)[22m[33m 1324[2mms[22m[39m
   [33m[2m✓[22m[39m multi-tenant storage helpers[2m > [22museSetActiveCompany limpa a cache do storage[2m > [22mdepois da troca, withCompanyPath prefixa com a empresa nova [33m 1305[2mms[22m[39m
[90mstderr[2m | src/components/data-entry/__tests__/DataEntryDialog.test.tsx[2m > [22m[2m#333 DataEntryDialog[2m > [22m[2mendpoint ausente: mostra indisponível e não oferece ações
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mEsc não fecha o modal sob outra janela
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mDialog separa cabeçalho e corpo e mantém o X fora do scroll
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 [32m✓[39m src/test/mobile-modal-dismiss.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 336[2mms[22m[39m
[90mstderr[2m | src/test/club-config-integration.test.tsx[2m > [22m[2m#327 integration without network[2m > [22m[2mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/components/__tests__/EventABTab.test.tsx[2m > [22m[2mEventABTab — UI smoke tests[2m > [22m[2mrenderiza sem crashar e mostra labels/inputs das zonas
[22m[39mWarning: Input contains an input of type undefined with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://reactjs.org/link/controlled-components
    at input
    at /tmp/issue333-integrated/tree/src/components/ui/input.tsx:8:6
    at div
    at div
    at /tmp/issue333-integrated/tree/src/components/ui/card.tsx:38:6
    at div
    at /tmp/issue333-integrated/tree/src/components/ui/card.tsx:7:50
    at div
    at EventABTab (/tmp/issue333-integrated/tree/src/components/EventABTab.tsx:151:23)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
    at Router (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1207:17)
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mDialog dentro de overlay manual fica por cima
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mAlertDialog dentro de Dialog fica por cima
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
`AlertDialogContent` requires a description for the component to be accessible for screen reader users.

You can add a description to the `AlertDialogContent` by passing a `AlertDialogDescription` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an `id` and passing the same value to the `aria-describedby` prop in `AlertDialogContent`. If the description is confusing or duplicative for sighted users, you can use the `@radix-ui/react-visually-hidden` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog
Warning: Missing `Description` or `aria-describedby={undefined}` for {AlertDialogContent}.

[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mSelect dentro de AlertDialog dentro de overlay manual fica por cima de tudo
[22m[39m`AlertDialogContent` requires a description for the component to be accessible for screen reader users.

You can add a description to the `AlertDialogContent` by passing a `AlertDialogDescription` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an `id` and passing the same value to the `aria-describedby` prop in `AlertDialogContent`. If the description is confusing or duplicative for sighted users, you can use the `@radix-ui/react-visually-hidden` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog
Warning: Missing `Description` or `aria-describedby={undefined}` for {AlertDialogContent}.

 [32m✓[39m src/lib/__tests__/overlay-layer.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 487[2mms[22m[39m
   [33m[2m✓[22m[39m pilha de camadas — aninhamentos reais[2m > [22m#260 classificação acima da Nova Transação recebe foco e confirma escolha [33m 326[2mms[22m[39m
 [32m✓[39m src/components/__tests__/EventABTab.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[33m 582[2mms[22m[39m
   [33m[2m✓[22m[39m EventABTab — UI smoke tests[2m > [22mrenderiza sem crashar e mostra labels/inputs das zonas [33m 376[2mms[22m[39m
 [32m✓[39m src/test/club-config-integration.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[33m 883[2mms[22m[39m
   [33m[2m✓[22m[39m #327 integration without network[2m > [22mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa [33m 434[2mms[22m[39m
 [32m✓[39m src/test/event-financial-card-render-loop.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 1123[2mms[22m[39m
   [33m[2m✓[22m[39m EventFinancialCard — sem ciclo de redesenho (#269)[2m > [22mchama onEbitdaParcelsChange uma única vez com queries vazias [33m 1119[2mms[22m[39m
 [32m✓[39m src/components/data-entry/__tests__/DataEntryDialog.test.tsx [2m([22m[2m13 tests[22m[2m)[22m[33m 4014[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução não validada: prévia visível, botão desativado mesmo após confirmação [33m 393[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução validada: exige confirmação explícita e mostra a conferência com a observação [33m 380[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22meditar depois da prévia exige nova prévia/hash antes de executar [33m 438[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mretoma nunca declara sucesso por cache; repõe campos, lê check, sem commit [33m 392[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução tardia após close não mostra sucesso e retoma só confere [33m 391[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mresposta tardia de upload após contexto alterado é descartada [33m 352[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mresposta tardia de preview após contexto alterado é descartada [33m 406[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mutilizador diferente não recebe retoma; contexto revalidado antes de execução [33m 410[2mms[22m[39m
 [32m✓[39m src/test/edge-fn-guard.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 98[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-handler.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 197[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-large-tables-mirror.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 35[2mms[22m[39m
[90mstderr[2m | src/lib/__tests__/permissions-guards-f2b.test.tsx[2m > [22m[2m#311 F2b — guardas por permissão[2m > [22m[2mmanager com excepção module.crm entra em /crm e vê o cartão CRM activo
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/lib/__tests__/permissions-guards-f2b.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 183[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-properties.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 75[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-percentage.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 97[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-statement-documents.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[32m 184[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-view.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 125[2mms[22m[39m
 [32m✓[39m src/test/newgang-content.test.tsx [2m([22m[2m2 tests[22m[2m)[22m[32m 163[2mms[22m[39m
 [32m✓[39m src/test/similar-suppliers-notice.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 77[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-pdf.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 90[2mms[22m[39m
[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mconsent: timeout da RPC → 503 bloqueado
[22m[39m[portal-track] consent rpc threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mbind falha (throw): lead entra sem ids Meta
[22m[39m[portal-track] consent bind threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2minsert falha → 500 (sem falso sucesso)
[22m[39m[portal-track] insert lead_capture [33m500[39m

 [32m✓[39m src/test/consent-contract-322.test.ts [2m([22m[2m38 tests[22m[2m)[22m[32m 63[2mms[22m[39m
 [32m✓[39m src/test/approve-lock-and-core.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 61[2mms[22m[39m
 [32m✓[39m src/components/__tests__/EventStatusBadge.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 64[2mms[22m[39m
 [32m✓[39m src/test/memory-index.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/camarim-session-pdf-sanitize.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 59[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-report.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 69[2mms[22m[39m
[90mstderr[2m | src/lib/__tests__/cache-scope.test.tsx[2m > [22m[2mecrã do subevento usa a configuração do Master[2m > [22m[2mmostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/lib/__tests__/cache-scope.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[33m 607[2mms[22m[39m
   [33m[2m✓[22m[39m ecrã do subevento usa a configuração do Master[2m > [22mmostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs [33m 583[2mms[22m[39m
 [32m✓[39m src/test/event-financials-invalidation.test.tsx [2m([22m[2m8 tests[22m[2m)[22m[32m 95[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-card-date.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 152[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-statement-doc.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 180[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-nature.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/google-click-match.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-settlement-internal-report.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 14[2mms[22m[39m
[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2momite observação abaixo de um cêntimo: 0
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2momite observação abaixo de um cêntimo: 0.009
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2momite observação abaixo de um cêntimo: -0.009
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: 0.01
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: -0.01
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: 265
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: -265
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

 [32m✓[39m src/components/TicketOfficePositionCards.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-capacity.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m src/test/newgang-welcome-once.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-settlement-engine.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/test/song-link-ssr.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/statement-grouping.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/test/standalone-compat-prepared.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-per-company.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-version-multi-diff.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/data-entry-contract.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/real-cache-deductions.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/cost-center-map.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-formula.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-sync.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/help-manual-parser.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-read-layer.test.ts [2m([22m[2m28 tests[22m[2m | [22m[33m7 skipped[39m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/multi-day-ticketing.test.ts [2m([22m[2m25 tests[22m[2m | [22m[33m4 skipped[39m[2m)[22m[32m 134[2mms[22m[39m
 [32m✓[39m src/test/transaction-duplicate-check.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-photos.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal-bundle.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-partner-mirror.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-turns.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-calc.test.ts [2m([22m[2m35 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-seal.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-line-review.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/validations.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/utils.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/test/newgang-missions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-tx-matching.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-videos.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/session-copy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-boost.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/report-event-cost.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-full-suite.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m src/test/newgang-wallet-levels.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/iva.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/test/bol-m2-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-calc.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-settlement-calc.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/test/silent-writes.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/split-adjustment.test.ts [2m([22m[2m37 tests[22m[2m)[22m[32m 88[2mms[22m[39m
 [32m✓[39m src/test/newgang-strict-audience-delivery.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-elasticity.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-cash-preview.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis-tour.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ebitda.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/test/bol-daily-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/overhead-proration.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/test/newgang-history.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-revenue.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-ab-scale.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/supplier-credits.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/test/capi-p1-guard.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/dre-nature-divergence.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-bp-rules.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/club-config-source.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-undo.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/supplier-similarity.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/test/newgang-crews.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-disbursement.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/income-tax-out-of-event-result.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/components/__tests__/PasswordStrengthIndicator.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/sepa/bank-execution.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/refund-grouping.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/creative-media.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/test/capi-diag-no-secrets.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-reconciliation.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/ticketline-import-format-transition.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-integrate.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/payment-settlement.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/test/crm-ingest-no-network.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/transaction-edit-modal-operation-key.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tour-cache-sync.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/pl-category-matching.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/test/payment-method-domain.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/simulator-prior-curve.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/fecho-preconditions.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/transitory-transactions.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ads-tour-split.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-gating.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-tab-total.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/master-adopted-expense-proration.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/check-deploy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-effective-open.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-perimeter.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/operation-key-domain.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-doc-text.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-eligible.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/coala-centro-custo-norm.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/partner-statement-cards.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/crm/creativeReelsCheck.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-realized.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-position.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-rounding.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-revenue-single-rule.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/account-balance-settling.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/crm-audience-live-count.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/format-integer-conversions.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
[90mstdout[2m | src/lib/__tests__/card-session-theoretical.test.ts[2m > [22m[2m#275 saldo teórico da sessão = fecho[2m > [22m[2msem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[22m[39m[#275] teórico = 636.68 esperado = 636.68

 [32m✓[39m src/lib/__tests__/card-session-theoretical.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-invoices.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/accountant-account-filter.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-edit-diff.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-category.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-planilha-version.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-rebill-vat.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/example.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-guards-proof.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-on-sale.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m src/test/newgang-profile-country.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [2m[90m↓[39m[22m src/test/partner-statement-edge.test.ts [2m([22m[2m1 test[22m[2m | [22m[33m1 skipped[39m[2m)[22m

[31m⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Suites 14 [49m[22m[31m⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m src/test/contactos-list-paging.test.ts[2m [ src/test/contactos-list-paging.test.ts ][22m
[31m[1mError[22m: supabaseUrl is required.[39m
[90m [2m❯[22m validateSupabaseUrl ../../../dev-server/node_modules/@supabase/supabase-js/src/lib/helpers.ts:[2m111:11[22m[39m
[90m [2m❯[22m new SupabaseClient ../../../dev-server/node_modules/@supabase/supabase-js/src/SupabaseClient.ts:[2m291:21[22m[39m
[90m [2m❯[22m Module.createClient ../../../dev-server/node_modules/@supabase/supabase-js/src/index.ts:[2m65:10[22m[39m
[36m [2m❯[22m src/integrations/supabase/client.ts:[2m12:25[22m[39m
    [90m 10| [39m[90m// import { supabase } from "@/integrations/supabase/client";[39m
    [90m 11| [39m
    [90m 12| [39mexport const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_…
    [90m   | [39m                        [31m^[39m
    [90m 13| [39m  auth[33m:[39m {
    [90m 14| [39m    storage[33m:[39m [34mbrokeredPreviewStorage[39m()[33m,[39m
[90m [2m❯[22m src/pages/crm-admin/contactos/contactsQuery.ts:[2m1:1[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/14]⎯[22m[39m

[41m[1m FAIL [22m[49m src/test/derp248-tiktok-event-trackers.test.ts[2m [ src/test/derp248-tiktok-event-trackers.test.ts ][22m
[31m[1mError[22m: supabaseUrl is required.[39m
[90m [2m❯[22m validateSupabaseUrl ../../../dev-server/node_modules/@supabase/supabase-js/src/lib/helpers.ts:[2m111:11[22m[39m
[90m [2m❯[22m new SupabaseClient ../../../dev-server/node_modules/@supabase/supabase-js/src/SupabaseClient.ts:[2m291:21[22m[39m
[90m [2m❯[22m Module.createClient ../../../dev-server/node_modules/@supabase/supabase-js/src/index.ts:[2m65:10[22m[39m
[36m [2m❯[22m src/integrations/supabase/client.ts:[2m12:25[22m[39m
    [90m 10| [39m[90m// import { supabase } from "@/integrations/supabase/client";[39m
    [90m 11| [39m
    [90m 12| [39mexport const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_…
    [90m   | [39m                        [31m^[39m
    [90m 13| [39m  auth[33m:[39m {
    [90m 14| [39m    storage[33m:[39m [34mbrokeredPreviewStorage[39m()[33m,[39m
[90m [2m❯[22m src/lib/crm/tiktok-queries.ts:[2m3:31[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/14]⎯[22m[39m

[41m[1m FAIL [22m[49m src/test/payment-list-revalidate.test.ts[2m [ src/test/payment-list-revalidate.test.ts ][22m
[31m[1mError[22m: supabaseUrl is required.[39m
[90m [2m❯[22m validateSupabaseUrl ../../../dev-server/node_modules/@supabase/supabase-js/src/lib/helpers.ts:[2m111:11[22m[39m
[90m [2m❯[22m new SupabaseClient ../../../dev-server/node_modules/@supabase/supabase-js/src/SupabaseClient.ts:[2m291:21[22m[39m
[90m [2m❯[22m Module.createClient ../../../dev-server/node_modules/@supabase/supabase-js/src/index.ts:[2m65:10[22m[39m
[36m [2m❯[22m src/integrations/supabase/client.ts:[2m12:25[22m[39m
    [90m 10| [39m[90m// import { supabase } from "@/integrations/supabase/client";[39m
    [90m 11| [39m
    [90m 12| [39mexport const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_…
    [90m   | [39m                        [31m^[39m
    [90m 13| [39m  auth[33m:[39m {
    [90m 14| [39m    storage[33m:[39m [34mbrokeredPreviewStorage[39m()[33m,[39m
[90m [2m❯[22m src/lib/payment-list-revalidate.ts:[2m1:1[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/14]⎯[22m[39m

[41m[1m FAIL [22m[49m src/test/require-feature.test.tsx[2m [ src/test/require-feature.test.tsx ][22m
[31m[1mError[22m: supabaseUrl is required.[39m
[90m [2m❯[22m validateSupabaseUrl ../../../dev-server/node_modules/@supabase/supabase-js/src/lib/helpers.ts:[2m111:11[22m[39m
[90m [2m❯[22m new SupabaseClient ../../../dev-server/node_modules/@supabase/supabase-js/src/SupabaseClient.ts:[2m291:21[22m[39m
[90m [2m❯[22m Module.createClient ../../../dev-server/node_modules/@supabase/supabase-js/src/index.ts:[2m65:10[22m[39m
[36m [2m❯[22m src/integrations/supabase/client.ts:[2m12:25[22m[39m
    [90m 10| [39m[90m// import { supabase } from "@/integrations/supabase/client";[39m
    [90m 11| [39m
    [90m 12| [39mexport const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_…
    [90m   | [39m                        [31m^[39m
    [90m 13| [39m  auth[33m:[39m {
    [90m 14| [39m    storage[33m:[39m [34mbrokeredPreviewStorage[39m()[33m,[39m
[90m [2m❯[22m src/components/ChangePasswordModal.tsx:[2m3:31[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/14]⎯[22m[39m

[41m[1m FAIL [22m[49m src/components/__tests__/LinkBpLineDialog-layer.test.tsx[2m [ src/components/__tests__/LinkBpLineDialog-layer.test.tsx ][22m
[31m[1mError[22m: supabaseUrl is required.[39m
[90m [2m❯[22m validateSupabaseUrl ../../../dev-server/node_modules/@supabase/supabase-js/src/lib/helpers.ts:[2m111:11[22m[39m
[90m [2m❯[22m new SupabaseClient ../../../dev-server/node_modules/@supabase/supabase-js/src/SupabaseClient.ts:[2m291:21[22m[39m
[90m [2m❯[22m Module.createClient ../../../dev-server/node_modules/@supabase/supabase-js/src/index.ts:[2m65:10[22m[39m
[36m [2m❯[22m src/integrations/supabase/client.ts:[2m12:25[22m[39m
    [90m 10| [39m[90m// import { supabase } from "@/integrations/supabase/client";[39m
    [90m 11| [39m
    [90m 12| [39mexport const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_…
    [90m   | [39m                        [31m^[39m
    [90m 13| [39m  auth[33m:[39m {
    [90m 14| [39m    storage[33m:[39m [34mbrokeredPreviewStorage[39m()[33m,[39m
[90m [2m❯[22m src/components/LinkBpLineDialog.tsx:[2m4:31[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/14]⎯[22m[39m

[41m[1m FAIL [22m[49m src/components/__tests__/StatCard.test.tsx[2m [ src/components/__tests__/StatCard.test.tsx ][22m
[31m[1mError[22m: supabaseUrl is required.[39m
[90m [2m❯[22m validateSupabaseUrl ../../../dev-server/node_modules/@supabase/supabase-js/src/lib/helpers.ts:[2m111:11[22m[39m
[90m [2m❯[22m new SupabaseClient ../../../dev-server/node_modules/@supabase/supabase-js/src/SupabaseClient.ts:[2m291:21[22m[39m
[90m [2m❯[22m Module.createClient ../../../dev-server/node_modules/@supabase/supabase-js/src/index.ts:[2m65:10[22m[39m
[36m [2m❯[22m src/integrations/supabase/client.ts:[2m12:25[22m[39m
    [90m 10| [39m[90m// import { supabase } from "@/integrations/supabase/client";[39m
    [90m 11| [39m
    [90m 12| [39mexport const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_…
    [90m   | [39m                        [31m^[39m
    [90m 13| [39m  auth[33m:[39m {
    [90m 14| [39m    storage[33m:[39m [34mbrokeredPreviewStorage[39m()[33m,[39m
[90m [2m❯[22m src/hooks/useHelpManual.ts:[2m2:31[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/14]⎯[22m[39m

[41m[1m FAIL [22m[49m src/components/__tests__/bp-installments.test.ts[2m [ src/components/__tests__/bp-installments.test.ts ][22m
[31m[1mError[22m: supabaseUrl is required.[39m
[90m [2m❯[22m validateSupabaseUrl ../../../dev-server/node_modules/@supabase/supabase-js/src/lib/helpers.ts:[2m111:11[22m[39m
[90m [2m❯[22m new SupabaseClient ../../../dev-server/node_modules/@supabase/supabase-js/src/SupabaseClient.ts:[2m291:21[22m[39m
[90m [2m❯[22m Module.createClient ../../../dev-server/node_modules/@supabase/supabase-js/src/index.ts:[2m65:10[22m[39m
[36m [2m❯[22m src/integrations/supabase/client.ts:[2m12:25[22m[39m
    [90m 10| [39m[90m// import { supabase } from "@/integrations/supabase/client";[39m
    [90m 11| [39m
    [90m 12| [39mexport const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_…
    [90m   | [39m                        [31m^[39m
    [90m 13| [39m  auth[33m:[39m {
    [90m 14| [39m    storage[33m:[39m [34mbrokeredPreviewStorage[39m()[33m,[39m
[90m [2m❯[22m src/lib/forecast-amount.ts:[2m1:1[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/14]⎯[22m[39m

[41m[1m FAIL [22m[49m src/lib/__tests__/audit.test.ts[2m [ src/lib/__tests__/audit.test.ts ][22m
[31m[1mError[22m: supabaseUrl is required.[39m
[90m [2m❯[22m validateSupabaseUrl ../../../dev-server/node_modules/@supabase/supabase-js/src/lib/helpers.ts:[2m111:11[22m[39m
[90m [2m❯[22m new SupabaseClient ../../../dev-server/node_modules/@supabase/supabase-js/src/SupabaseClient.ts:[2m291:21[22m[39m
[90m [2m❯[22m Module.createClient ../../../dev-server/node_modules/@supabase/supabase-js/src/index.ts:[2m65:10[22m[39m
[36m [2m❯[22m src/integrations/supabase/client.ts:[2m12:25[22m[39m
    [90m 10| [39m[90m// import { supabase } from "@/integrations/supabase/client";[39m
    [90m 11| [39m
    [90m 12| [39mexport const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_…
    [90m   | [39m                        [31m^[39m
    [90m 13| [39m  auth[33m:[39m {
    [90m 14| [39m    storage[33m:[39m [34mbrokeredPreviewStorage[39m()[33m,[39m
[90m [2m❯[22m src/lib/audit.ts:[2m1:1[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/14]⎯[22m[39m

[41m[1m FAIL [22m[49m src/lib/__tests__/bp-line-required.test.ts[2m [ src/lib/__tests__/bp-line-required.test.ts ][22m
[31m[1mError[22m: supabaseUrl is required.[39m
[90m [2m❯[22m validateSupabaseUrl ../../../dev-server/node_modules/@supabase/supabase-js/src/lib/helpers.ts:[2m111:11[22m[39m
[90m [2m❯[22m new SupabaseClient ../../../dev-server/node_modules/@supabase/supabase-js/src/SupabaseClient.ts:[2m291:21[22m[39m
[90m [2m❯[22m Module.createClient ../../../dev-server/node_modules/@supabase/supabase-js/src/index.ts:[2m65:10[22m[39m
[36m [2m❯[22m src/integrations/supabase/client.ts:[2m12:25[22m[39m
    [90m 10| [39m[90m// import { supabase } from "@/integrations/supabase/client";[39m
    [90m 11| [39m
    [90m 12| [39mexport const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_…
    [90m   | [39m                        [31m^[39m
    [90m 13| [39m  auth[33m:[39m {
    [90m 14| [39m    storage[33m:[39m [34mbrokeredPreviewStorage[39m()[33m,[39m
[90m [2m❯[22m src/lib/bp-line-required.ts:[2m1:1[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/14]⎯[22m[39m

[41m[1m FAIL [22m[49m src/lib/__tests__/event-revenue-basis.test.ts[2m [ src/lib/__tests__/event-revenue-basis.test.ts ][22m
[31m[1mError[22m: supabaseUrl is required.[39m
[90m [2m❯[22m validateSupabaseUrl ../../../dev-server/node_modules/@supabase/supabase-js/src/lib/helpers.ts:[2m111:11[22m[39m
[90m [2m❯[22m new SupabaseClient ../../../dev-server/node_modules/@supabase/supabase-js/src/SupabaseClient.ts:[2m291:21[22m[39m
[90m [2m❯[22m Module.createClient ../../../dev-server/node_modules/@supabase/supabase-js/src/index.ts:[2m65:10[22m[39m
[36m [2m❯[22m src/integrations/supabase/client.ts:[2m12:25[22m[39m
    [90m 10| [39m[90m// import { supabase } from "@/integrations/supabase/client";[39m
    [90m 11| [39m
    [90m 12| [39mexport const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_…
    [90m   | [39m                        [31m^[39m
    [90m 13| [39m  auth[33m:[39m {
    [90m 14| [39m    storage[33m:[39m [34mbrokeredPreviewStorage[39m()[33m,[39m
[90m [2m❯[22m src/lib/event-revenue-basis.ts:[2m1:1[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/14]⎯[22m[39m

[41m[1m FAIL [22m[49m src/lib/__tests__/partner-extras-kind.test.ts[2m [ src/lib/__tests__/partner-extras-kind.test.ts ][22m
[41m[1m FAIL [22m[49m src/lib/__tests__/partner-extras-union-148.test.ts[2m [ src/lib/__tests__/partner-extras-union-148.test.ts ][22m
[31m[1mError[22m: supabaseUrl is required.[39m
[90m [2m❯[22m validateSupabaseUrl ../../../dev-server/node_modules/@supabase/supabase-js/src/lib/helpers.ts:[2m111:11[22m[39m
[90m [2m❯[22m new SupabaseClient ../../../dev-server/node_modules/@supabase/supabase-js/src/SupabaseClient.ts:[2m291:21[22m[39m
[90m [2m❯[22m Module.createClient ../../../dev-server/node_modules/@supabase/supabase-js/src/index.ts:[2m65:10[22m[39m
[36m [2m❯[22m src/integrations/supabase/client.ts:[2m12:25[22m[39m
    [90m 10| [39m[90m// import { supabase } from "@/integrations/supabase/client";[39m
    [90m 11| [39m
    [90m 12| [39mexport const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_…
    [90m   | [39m                        [31m^[39m
    [90m 13| [39m  auth[33m:[39m {
    [90m 14| [39m    storage[33m:[39m [34mbrokeredPreviewStorage[39m()[33m,[39m
[90m [2m❯[22m src/lib/partner-extras.ts:[2m1:1[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/14]⎯[22m[39m

[41m[1m FAIL [22m[49m src/lib/__tests__/settlement-participants.test.ts[2m [ src/lib/__tests__/settlement-participants.test.ts ][22m
[31m[1mError[22m: supabaseUrl is required.[39m
[90m [2m❯[22m validateSupabaseUrl ../../../dev-server/node_modules/@supabase/supabase-js/src/lib/helpers.ts:[2m111:11[22m[39m
[90m [2m❯[22m new SupabaseClient ../../../dev-server/node_modules/@supabase/supabase-js/src/SupabaseClient.ts:[2m291:21[22m[39m
[90m [2m❯[22m Module.createClient ../../../dev-server/node_modules/@supabase/supabase-js/src/index.ts:[2m65:10[22m[39m
[36m [2m❯[22m src/integrations/supabase/client.ts:[2m12:25[22m[39m
    [90m 10| [39m[90m// import { supabase } from "@/integrations/supabase/client";[39m
    [90m 11| [39m
    [90m 12| [39mexport const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_…
    [90m   | [39m                        [31m^[39m
    [90m 13| [39m  auth[33m:[39m {
    [90m 14| [39m    storage[33m:[39m [34mbrokeredPreviewStorage[39m()[33m,[39m
[90m [2m❯[22m src/lib/settlement-participants.ts:[2m1:1[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/14]⎯[22m[39m

[41m[1m FAIL [22m[49m src/lib/__tests__/zone-capacities.test.ts[2m [ src/lib/__tests__/zone-capacities.test.ts ][22m
[31m[1mError[22m: supabaseUrl is required.[39m
[90m [2m❯[22m validateSupabaseUrl ../../../dev-server/node_modules/@supabase/supabase-js/src/lib/helpers.ts:[2m111:11[22m[39m
[90m [2m❯[22m new SupabaseClient ../../../dev-server/node_modules/@supabase/supabase-js/src/SupabaseClient.ts:[2m291:21[22m[39m
[90m [2m❯[22m Module.createClient ../../../dev-server/node_modules/@supabase/supabase-js/src/index.ts:[2m65:10[22m[39m
[36m [2m❯[22m src/integrations/supabase/client.ts:[2m12:25[22m[39m
    [90m 10| [39m[90m// import { supabase } from "@/integrations/supabase/client";[39m
    [90m 11| [39m
    [90m 12| [39mexport const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_…
    [90m   | [39m                        [31m^[39m
    [90m 13| [39m  auth[33m:[39m {
    [90m 14| [39m    storage[33m:[39m [34mbrokeredPreviewStorage[39m()[33m,[39m
[90m [2m❯[22m src/lib/zone-capacities.ts:[2m1:1[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/14]⎯[22m[39m


[2m Test Files [22m [1m[31m14 failed[39m[22m[2m | [22m[1m[32m151 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (166)[39m
[2m      Tests [22m [1m[32m1246 passed[39m[22m[2m | [22m[33m1 skipped[39m[2m | [22m[90m11 todo[39m[90m (1258)[39m
[2m   Start at [22m 18:18:40
[2m   Duration [22m 83.91s[2m (transform 9.80s, setup 141.94s, collect 102.29s, tests 17.34s, environment 715.01s, prepare 126.16s)[22m


EXIT: 1

```

## general.log

```text
COMMAND: /dev-server/node_modules/.bin/vitest run

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated/tree[39m

 [32m✓[39m src/lib/__tests__/zone-capacities.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/contactos-list-paging.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-line-required.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-participants.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-extras-kind.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/audit.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/payment-list-revalidate.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-extras-union-148.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-revenue-basis.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/test/derp248-tiktok-event-trackers.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 12[2mms[22m[39m
[90mstderr[2m | src/test/require-feature.test.tsx[2m > [22m[2mvisibilidade por company_features[2m > [22m[2mrota bloqueada sem a chave
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/test/require-feature.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 136[2mms[22m[39m
 [32m✓[39m src/components/__tests__/StatCard.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 73[2mms[22m[39m
 [32m✓[39m src/components/__tests__/LinkBpLineDialog-layer.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 186[2mms[22m[39m
[90mstderr[2m | src/components/data-entry/__tests__/DataEntryDialog.test.tsx[2m > [22m[2m#333 DataEntryDialog[2m > [22m[2mendpoint ausente: mostra indisponível e não oferece ações
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/test/newgang-wallet-google.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 193[2mms[22m[39m
 [32m✓[39m src/components/data-entry/__tests__/DataEntryDialog.test.tsx [2m([22m[2m13 tests[22m[2m)[22m[33m 3096[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução não validada: prévia visível, botão desativado mesmo após confirmação [33m 336[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução validada: exige confirmação explícita e mostra a conferência com a observação [33m 303[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução tardia após close não mostra sucesso e retoma só confere [33m 341[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/document-detect.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 1469[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 12°, centrado com erro < 3% [33m 380[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado -18°, à esquerda com erro < 3% [33m 323[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/storage-multi-tenant.test.ts [2m([22m[2m14 tests[22m[2m)[22m[33m 1100[2mms[22m[39m
   [33m[2m✓[22m[39m multi-tenant storage helpers[2m > [22museSetActiveCompany limpa a cache do storage[2m > [22mdepois da troca, withCompanyPath prefixa com a empresa nova [33m 1086[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-embeds.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 208[2mms[22m[39m
 [32m✓[39m src/test/forecast-attachment-counts.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 400[2mms[22m[39m
   [33m[2m✓[22m[39m anexos do BP — uma leitura por evento (#269)[2m > [22m361 linhas → 1 pedido a event_forecast_attachments [33m 397[2mms[22m[39m
[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mDialog dentro de overlay manual fica por cima
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mAlertDialog dentro de Dialog fica por cima
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
`AlertDialogContent` requires a description for the component to be accessible for screen reader users.

You can add a description to the `AlertDialogContent` by passing a `AlertDialogDescription` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an `id` and passing the same value to the `aria-describedby` prop in `AlertDialogContent`. If the description is confusing or duplicative for sighted users, you can use the `@radix-ui/react-visually-hidden` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog
Warning: Missing `Description` or `aria-describedby={undefined}` for {AlertDialogContent}.

[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mSelect dentro de AlertDialog dentro de overlay manual fica por cima de tudo
[22m[39m`AlertDialogContent` requires a description for the component to be accessible for screen reader users.

You can add a description to the `AlertDialogContent` by passing a `AlertDialogDescription` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an `id` and passing the same value to the `aria-describedby` prop in `AlertDialogContent`. If the description is confusing or duplicative for sighted users, you can use the `@radix-ui/react-visually-hidden` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog
Warning: Missing `Description` or `aria-describedby={undefined}` for {AlertDialogContent}.

[90mstderr[2m | src/test/club-config-integration.test.tsx[2m > [22m[2m#327 integration without network[2m > [22m[2mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/lib/__tests__/overlay-layer.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 470[2mms[22m[39m
   [33m[2m✓[22m[39m pilha de camadas — aninhamentos reais[2m > [22m#260 classificação acima da Nova Transação recebe foco e confirma escolha [33m 304[2mms[22m[39m
[90mstderr[2m | src/components/__tests__/EventABTab.test.tsx[2m > [22m[2mEventABTab — UI smoke tests[2m > [22m[2mrenderiza sem crashar e mostra labels/inputs das zonas
[22m[39mWarning: Input contains an input of type undefined with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://reactjs.org/link/controlled-components
    at input
    at /tmp/issue333-integrated/tree/src/components/ui/input.tsx:8:6
    at div
    at div
    at /tmp/issue333-integrated/tree/src/components/ui/card.tsx:38:6
    at div
    at /tmp/issue333-integrated/tree/src/components/ui/card.tsx:7:50
    at div
    at EventABTab (/tmp/issue333-integrated/tree/src/components/EventABTab.tsx:151:23)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
    at Router (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1207:17)
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/lib/__tests__/postgrest-row-limit.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 221[2mms[22m[39m
 [32m✓[39m src/components/__tests__/EventABTab.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[33m 490[2mms[22m[39m
 [32m✓[39m src/test/club-config-integration.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[33m 847[2mms[22m[39m
   [33m[2m✓[22m[39m #327 integration without network[2m > [22mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa [33m 385[2mms[22m[39m
 [32m✓[39m src/test/event-financial-card-render-loop.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 1102[2mms[22m[39m
   [33m[2m✓[22m[39m EventFinancialCard — sem ciclo de redesenho (#269)[2m > [22mchama onEbitdaParcelsChange uma única vez com queries vazias [33m 1100[2mms[22m[39m
 [32m✓[39m src/test/campaign-design-optional-roas.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 236[2mms[22m[39m
[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mEsc não fecha o modal sob outra janela
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mDialog separa cabeçalho e corpo e mantém o X fora do scroll
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 [32m✓[39m src/test/mobile-modal-dismiss.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 377[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-handler.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 236[2mms[22m[39m
[90mstderr[2m | src/pages/__tests__/ResetPassword.test.tsx[2m > [22m[2mResetPassword — token_hash flow[2m > [22m[2m(a) não chama verifyOtp ao montar; só ao clicar Continuar
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/pages/__tests__/ResetPassword.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 240[2mms[22m[39m
[90mstderr[2m | src/lib/__tests__/permissions-guards-f2b.test.tsx[2m > [22m[2m#311 F2b — guardas por permissão[2m > [22m[2mmanager com excepção module.crm entra em /crm e vê o cartão CRM activo
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/lib/__tests__/permissions-guards-f2b.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 143[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/multi-day-ticketing.test.ts [2m([22m[2m25 tests[22m[2m | [22m[33m4 skipped[39m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/no-direct-transaction-document-remove.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 129[2mms[22m[39m
[90mstderr[2m | src/lib/__tests__/cache-scope.test.tsx[2m > [22m[2mecrã do subevento usa a configuração do Master[2m > [22m[2mmostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/lib/__tests__/cache-scope.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 238[2mms[22m[39m
 [32m✓[39m src/test/edge-fn-guard.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 107[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-statement-documents.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[32m 193[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-percentage.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 93[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-view.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 70[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-statement-doc.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 84[2mms[22m[39m
 [32m✓[39m src/test/newgang-content.test.tsx [2m([22m[2m2 tests[22m[2m)[22m[32m 84[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/split-adjustment.test.ts [2m([22m[2m37 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-pdf.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 64[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-properties.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 72[2mms[22m[39m
 [32m✓[39m src/test/event-financials-invalidation.test.tsx [2m([22m[2m8 tests[22m[2m)[22m[32m 50[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-report.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m src/test/similar-suppliers-notice.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 75[2mms[22m[39m
[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mconsent: timeout da RPC → 503 bloqueado
[22m[39m[portal-track] consent rpc threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mbind falha (throw): lead entra sem ids Meta
[22m[39m[portal-track] consent bind threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2minsert falha → 500 (sem falso sucesso)
[22m[39m[portal-track] insert lead_capture [33m500[39m

 [32m✓[39m src/test/consent-contract-322.test.ts [2m([22m[2m38 tests[22m[2m)[22m[32m 63[2mms[22m[39m
 [32m✓[39m src/test/approve-lock-and-core.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 50[2mms[22m[39m
 [32m✓[39m src/components/__tests__/EventStatusBadge.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 77[2mms[22m[39m
 [32m✓[39m src/components/__tests__/bp-installments.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-card-date.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 99[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-read-layer.test.ts [2m([22m[2m28 tests[22m[2m | [22m[33m7 skipped[39m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/test/camarim-session-pdf-sanitize.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 69[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-formula.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m src/test/silent-writes.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/standalone-compat-prepared.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m src/test/newgang-missions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-version-multi-diff.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-capacity.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-large-tables-mirror.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tour-cache-sync.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 15[2mms[22m[39m
[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2momite observação abaixo de um cêntimo: 0
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2momite observação abaixo de um cêntimo: 0.009
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2momite observação abaixo de um cêntimo: -0.009
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: 0.01
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: -0.01
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: 265
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: -265
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

 [32m✓[39m src/components/TicketOfficePositionCards.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/help-manual-parser.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m src/test/newgang-welcome-once.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/test/newgang-crews.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/transaction-duplicate-check.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/lib/cost-center-map.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-settlement-engine.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/test/newgang-strict-audience-delivery.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/google-click-match.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-settlement-calc.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/test/song-link-ssr.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-full-suite.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-photos.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/statement-grouping.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/test/bol-m2-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-boost.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis-tour.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-elasticity.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/validations.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-partner-mirror.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-sync.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-disbursement.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-per-company.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/test/capi-p1-guard.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-turns.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-line-review.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 55[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ebitda.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal-bundle.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/refund-grouping.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/data-entry-contract.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 54[2mms[22m[39m
 [32m✓[39m src/test/supplier-similarity.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/sepa/bank-execution.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/iva.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-bp-rules.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-tx-matching.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/utils.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-calc.test.ts [2m([22m[2m35 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/test/ticketline-import-format-transition.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/supplier-credits.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/test/capi-diag-no-secrets.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-settlement-internal-report.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/crm/creativeReelsCheck.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-videos.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/creative-media.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-calc.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-invoices.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/bol-daily-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/club-config-source.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-rounding.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/income-tax-out-of-event-result.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/components/__tests__/PasswordStrengthIndicator.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/overhead-proration.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/test/newgang-wallet-levels.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/report-event-cost.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-position.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-cash-preview.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-revenue.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/simulator-prior-curve.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-reconciliation.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-nature.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/test/newgang-history.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-undo.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/test/payment-method-domain.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/account-balance-settling.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-integrate.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-gating.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-seal.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/real-cache-deductions.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-rebill-vat.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/transitory-transactions.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-category.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ads-tour-split.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-effective-open.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/session-copy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/fecho-preconditions.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/pl-category-matching.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/payment-settlement.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
[90mstdout[2m | src/lib/__tests__/card-session-theoretical.test.ts[2m > [22m[2m#275 saldo teórico da sessão = fecho[2m > [22m[2msem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[22m[39m[#275] teórico = 636.68 esperado = 636.68

 [32m✓[39m src/lib/__tests__/card-session-theoretical.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/example.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/test/operation-key-domain.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/test/crm-ingest-no-network.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/master-adopted-expense-proration.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-edit-diff.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-revenue-single-rule.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/transaction-edit-modal-operation-key.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-ab-scale.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-perimeter.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/partner-statement-cards.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-realized.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-doc-text.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/crm-audience-live-count.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/dre-nature-divergence.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-planilha-version.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-eligible.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/check-deploy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-tab-total.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/memory-index.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/accountant-account-filter.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/test/coala-centro-custo-norm.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-guards-proof.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/newgang-profile-country.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-on-sale.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/test/format-integer-conversions.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [2m[90m↓[39m[22m src/test/partner-statement-edge.test.ts [2m([22m[2m1 test[22m[2m | [22m[33m1 skipped[39m[2m)[22m

[2m Test Files [22m [1m[32m165 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (166)[39m
[2m      Tests [22m [1m[32m1334 passed[39m[22m[2m | [22m[33m1 skipped[39m[2m | [22m[90m11 todo[39m[90m (1346)[39m
[2m   Start at [22m 18:21:18
[2m   Duration [22m 74.64s[2m (transform 9.50s, setup 126.41s, collect 121.47s, tests 14.89s, environment 629.98s, prepare 109.95s)[22m


EXIT: 0

```

## general-offline.log

```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config vitest.offline.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated/tree[39m

 [32m✓[39m src/lib/__tests__/postgrest-embeds.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 330[2mms[22m[39m
   [33m[2m✓[22m[39m embeds do PostgREST em pares com FK duplicada[2m > [22m[Issue #288] nenhum embed ambíguo sem a FK nomeada [33m 326[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-row-limit.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 271[2mms[22m[39m
 [32m✓[39m src/test/campaign-design-optional-roas.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 264[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-handler.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 198[2mms[22m[39m
[90mstderr[2m | src/pages/__tests__/ResetPassword.test.tsx[2m > [22m[2mResetPassword — token_hash flow[2m > [22m[2m(a) não chama verifyOtp ao montar; só ao clicar Continuar
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/pages/__tests__/ResetPassword.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 249[2mms[22m[39m
 [32m✓[39m src/test/forecast-attachment-counts.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 388[2mms[22m[39m
   [33m[2m✓[22m[39m anexos do BP — uma leitura por evento (#269)[2m > [22m361 linhas → 1 pedido a event_forecast_attachments [33m 383[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/storage-multi-tenant.test.ts [2m([22m[2m14 tests[22m[2m)[22m[33m 1098[2mms[22m[39m
   [33m[2m✓[22m[39m multi-tenant storage helpers[2m > [22museSetActiveCompany limpa a cache do storage[2m > [22mdepois da troca, withCompanyPath prefixa com a empresa nova [33m 1075[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/document-detect.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 1744[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 12°, centrado com erro < 3% [33m 499[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado -18°, à esquerda com erro < 3% [33m 402[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 20°, canto sup. dir. com erro < 3% [33m 313[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 6°, grande com erro < 3% [33m 309[2mms[22m[39m
[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mEsc não fecha o modal sob outra janela
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mDialog separa cabeçalho e corpo e mantém o X fora do scroll
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 [32m✓[39m src/test/mobile-modal-dismiss.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 465[2mms[22m[39m
[90mstderr[2m | src/components/data-entry/__tests__/DataEntryDialog.test.tsx[2m > [22m[2m#333 DataEntryDialog[2m > [22m[2mendpoint ausente: mostra indisponível e não oferece ações
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mDialog dentro de overlay manual fica por cima
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mAlertDialog dentro de Dialog fica por cima
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
`AlertDialogContent` requires a description for the component to be accessible for screen reader users.

You can add a description to the `AlertDialogContent` by passing a `AlertDialogDescription` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an `id` and passing the same value to the `aria-describedby` prop in `AlertDialogContent`. If the description is confusing or duplicative for sighted users, you can use the `@radix-ui/react-visually-hidden` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog
Warning: Missing `Description` or `aria-describedby={undefined}` for {AlertDialogContent}.

[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mSelect dentro de AlertDialog dentro de overlay manual fica por cima de tudo
[22m[39m`AlertDialogContent` requires a description for the component to be accessible for screen reader users.

You can add a description to the `AlertDialogContent` by passing a `AlertDialogDescription` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an `id` and passing the same value to the `aria-describedby` prop in `AlertDialogContent`. If the description is confusing or duplicative for sighted users, you can use the `@radix-ui/react-visually-hidden` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog
Warning: Missing `Description` or `aria-describedby={undefined}` for {AlertDialogContent}.

 [32m✓[39m src/lib/__tests__/overlay-layer.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 701[2mms[22m[39m
   [33m[2m✓[22m[39m pilha de camadas — aninhamentos reais[2m > [22m#260 classificação acima da Nova Transação recebe foco e confirma escolha [33m 493[2mms[22m[39m
[90mstderr[2m | src/components/__tests__/EventABTab.test.tsx[2m > [22m[2mEventABTab — UI smoke tests[2m > [22m[2mrenderiza sem crashar e mostra labels/inputs das zonas
[22m[39mWarning: Input contains an input of type undefined with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://reactjs.org/link/controlled-components
    at input
    at /tmp/issue333-integrated/tree/src/components/ui/input.tsx:8:6
    at div
    at div
    at /tmp/issue333-integrated/tree/src/components/ui/card.tsx:38:6
    at div
    at /tmp/issue333-integrated/tree/src/components/ui/card.tsx:7:50
    at div
    at EventABTab (/tmp/issue333-integrated/tree/src/components/EventABTab.tsx:151:23)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
    at Router (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1207:17)
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/test/club-config-integration.test.tsx[2m > [22m[2m#327 integration without network[2m > [22m[2mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/test/event-financial-card-render-loop.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 1305[2mms[22m[39m
   [33m[2m✓[22m[39m EventFinancialCard — sem ciclo de redesenho (#269)[2m > [22mchama onEbitdaParcelsChange uma única vez com queries vazias [33m 1300[2mms[22m[39m
 [32m✓[39m src/components/__tests__/EventABTab.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[33m 790[2mms[22m[39m
   [33m[2m✓[22m[39m EventABTab — UI smoke tests[2m > [22mrenderiza sem crashar e mostra labels/inputs das zonas [33m 498[2mms[22m[39m
 [32m✓[39m src/test/club-config-integration.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[33m 1179[2mms[22m[39m
   [33m[2m✓[22m[39m #327 integration without network[2m > [22mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa [33m 589[2mms[22m[39m
 [32m✓[39m src/components/data-entry/__tests__/DataEntryDialog.test.tsx [2m([22m[2m13 tests[22m[2m)[22m[33m 4421[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mendpoint ausente: mostra indisponível e não oferece ações [33m 342[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução não validada: prévia visível, botão desativado mesmo após confirmação [33m 610[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução validada: exige confirmação explícita e mostra a conferência com a observação [33m 371[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22meditar depois da prévia exige nova prévia/hash antes de executar [33m 654[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mretoma nunca declara sucesso por cache; repõe campos, lê check, sem commit [33m 466[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução tardia após close não mostra sucesso e retoma só confere [33m 474[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução tardia após company não mostra sucesso e retoma só confere [33m 351[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mresposta tardia de upload após contexto alterado é descartada [33m 331[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mutilizador diferente não recebe retoma; contexto revalidado antes de execução [33m 311[2mms[22m[39m
 [32m✓[39m src/test/newgang-wallet-google.test.ts [2m([22m[2m12 tests[22m[2m)[22m[33m 304[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/no-direct-transaction-document-remove.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 125[2mms[22m[39m
 [32m✓[39m src/test/edge-fn-guard.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 67[2mms[22m[39m
[90mstderr[2m | src/lib/__tests__/permissions-guards-f2b.test.tsx[2m > [22m[2m#311 F2b — guardas por permissão[2m > [22m[2mmanager com excepção module.crm entra em /crm e vê o cartão CRM activo
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/lib/__tests__/permissions-guards-f2b.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 139[2mms[22m[39m
[90mstderr[2m | src/test/require-feature.test.tsx[2m > [22m[2mvisibilidade por company_features[2m > [22m[2mrota bloqueada sem a chave
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/test/require-feature.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 129[2mms[22m[39m
 [32m✓[39m src/components/__tests__/LinkBpLineDialog-layer.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 180[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-statement-documents.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[32m 180[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-percentage.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 97[2mms[22m[39m
[90mstderr[2m | src/lib/__tests__/cache-scope.test.tsx[2m > [22m[2mecrã do subevento usa a configuração do Master[2m > [22m[2mmostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/lib/__tests__/cache-scope.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 196[2mms[22m[39m
 [32m✓[39m src/components/__tests__/EventStatusBadge.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 70[2mms[22m[39m
 [32m✓[39m src/test/similar-suppliers-notice.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 80[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-properties.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 112[2mms[22m[39m
 [32m✓[39m src/test/camarim-session-pdf-sanitize.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 70[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-statement-doc.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 120[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-turns.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 18[2mms[22m[39m
[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mconsent: timeout da RPC → 503 bloqueado
[22m[39m[portal-track] consent rpc threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mbind falha (throw): lead entra sem ids Meta
[22m[39m[portal-track] consent bind threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2minsert falha → 500 (sem falso sucesso)
[22m[39m[portal-track] insert lead_capture [33m500[39m

 [32m✓[39m src/test/consent-contract-322.test.ts [2m([22m[2m38 tests[22m[2m)[22m[32m 79[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-pdf.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 81[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-line-review.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/test/newgang-content.test.tsx [2m([22m[2m2 tests[22m[2m)[22m[32m 112[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/data-entry-contract.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m src/components/__tests__/StatCard.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 71[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-view.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 84[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-card-date.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 104[2mms[22m[39m
 [32m✓[39m src/test/approve-lock-and-core.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 52[2mms[22m[39m
 [32m✓[39m src/test/event-financials-invalidation.test.tsx [2m([22m[2m8 tests[22m[2m)[22m[32m 59[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-formula.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 51[2mms[22m[39m
[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2momite observação abaixo de um cêntimo: 0
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2momite observação abaixo de um cêntimo: 0.009
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2momite observação abaixo de um cêntimo: -0.009
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: 0.01
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: -0.01
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: 265
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: -265
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

 [32m✓[39m src/components/TicketOfficePositionCards.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[32m 93[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal-bundle.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/help-manual-parser.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 52[2mms[22m[39m
 [32m✓[39m src/test/newgang-wallet-levels.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/google-click-match.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-capacity.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-report.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/test/standalone-compat-prepared.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 67[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-large-tables-mirror.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-boost.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/test/song-link-ssr.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/statement-grouping.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-version-multi-diff.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-sync.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m src/test/newgang-welcome-once.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/test/newgang-missions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-full-suite.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/refund-grouping.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/test/transaction-duplicate-check.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-settlement-engine.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-read-layer.test.ts [2m([22m[2m28 tests[22m[2m | [22m[33m7 skipped[39m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-videos.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/cost-center-map.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-partner-mirror.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-settlement-calc.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/multi-day-ticketing.test.ts [2m([22m[2m25 tests[22m[2m | [22m[33m4 skipped[39m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/report-event-cost.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/newgang-strict-audience-delivery.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/supplier-credits.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ebitda.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/utils.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/test/contactos-list-paging.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-calc.test.ts [2m([22m[2m35 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-revenue-basis.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-photos.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-tx-matching.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-bp-rules.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis-tour.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/iva.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tour-cache-sync.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/validations.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/test/supplier-similarity.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/test/bol-m2-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-cash-preview.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-calc.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/split-adjustment.test.ts [2m([22m[2m37 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m src/test/bol-daily-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/overhead-proration.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/test/payment-method-domain.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/ticketline-import-format-transition.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/test/capi-p1-guard.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-participants.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-nature.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/operation-key-domain.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-per-company.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/pl-category-matching.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-realized.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/club-config-source.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-undo.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/derp248-tiktok-event-trackers.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-disbursement.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/real-cache-deductions.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-settlement-internal-report.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-revenue.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/simulator-prior-curve.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-seal.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/sepa/bank-execution.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-line-required.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/test/silent-writes.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/income-tax-out-of-event-result.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-reconciliation.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/test/newgang-history.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/creative-media.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/crm-ingest-no-network.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/components/__tests__/PasswordStrengthIndicator.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/newgang-crews.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/payment-settlement.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/capi-diag-no-secrets.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-gating.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-capacities.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-tab-total.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/session-copy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-elasticity.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/master-adopted-expense-proration.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-effective-open.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-extras-union-148.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-integrate.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/newgang-profile-country.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ads-tour-split.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-position.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/transitory-transactions.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/fecho-preconditions.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/dre-nature-divergence.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-extras-kind.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/partner-statement-cards.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-revenue-single-rule.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-invoices.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/components/__tests__/bp-installments.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-doc-text.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-ab-scale.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-rounding.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/payment-list-revalidate.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-eligible.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/check-deploy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-rebill-vat.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-perimeter.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
[90mstdout[2m | src/lib/__tests__/card-session-theoretical.test.ts[2m > [22m[2m#275 saldo teórico da sessão = fecho[2m > [22m[2msem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[22m[39m[#275] teórico = 636.68 esperado = 636.68

 [32m✓[39m src/lib/__tests__/card-session-theoretical.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/audit.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/test/memory-index.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/account-balance-settling.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/test/crm-audience-live-count.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/crm/creativeReelsCheck.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-edit-diff.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-guards-proof.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-category.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/example.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/test/coala-centro-custo-norm.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/accountant-account-filter.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-on-sale.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/test/transaction-edit-modal-operation-key.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-planilha-version.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [2m[90m↓[39m[22m src/test/partner-statement-edge.test.ts [2m([22m[2m1 test[22m[2m | [22m[33m1 skipped[39m[2m)[22m
 [32m✓[39m src/test/format-integer-conversions.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 3[2mms[22m[39m

[2m Test Files [22m [1m[32m165 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (166)[39m
[2m      Tests [22m [1m[32m1334 passed[39m[22m[2m | [22m[33m1 skipped[39m[2m | [22m[90m11 todo[39m[90m (1346)[39m
[2m   Start at [22m 18:22:57
[2m   Duration [22m 81.86s[2m (transform 11.30s, setup 144.89s, collect 125.76s, tests 17.95s, environment 681.72s, prepare 121.43s)[22m


EXIT: 0

```

## build.log

```text
COMMAND: /dev-server/node_modules/.bin/vite build
[36mvite v5.4.19 [32mbuilding for production...[36m[39m
transforming...
Browserslist: browsers data (caniuse-lite) is 7 months old. Please run:
  npx update-browserslist-db@latest
  Why you should do it regularly: https://github.com/browserslist/update-db#readme
[32m✓[39m 6218 modules transformed.
rendering chunks...
[1m[33m[plugin:vite:reporter][39m[22m [33m[plugin vite:reporter] 
(!) /tmp/issue333-integrated/tree/src/lib/storage.ts is dynamically imported by /tmp/issue333-integrated/tree/src/contexts/AuthContext.tsx, /tmp/issue333-integrated/tree/src/contexts/AuthContext.tsx, /tmp/issue333-integrated/tree/src/hooks/useCompany.ts but also statically imported by /tmp/issue333-integrated/tree/src/components/BPNotesAttachmentsModal.tsx, /tmp/issue333-integrated/tree/src/components/CacheExtrasPanel.tsx, /tmp/issue333-integrated/tree/src/components/EntityDocumentsSection.tsx, /tmp/issue333-integrated/tree/src/components/EventABAttachmentsSection.tsx, /tmp/issue333-integrated/tree/src/components/EventClosingCosts.tsx, /tmp/issue333-integrated/tree/src/components/EventForecast.tsx, /tmp/issue333-integrated/tree/src/components/PartnerExtrasPanel.tsx, /tmp/issue333-integrated/tree/src/components/PaymentListReceipts.tsx, /tmp/issue333-integrated/tree/src/components/SupplierCreditsPanel.tsx, /tmp/issue333-integrated/tree/src/components/TicketOfficeSettlementModal.tsx, /tmp/issue333-integrated/tree/src/components/TransactionDocumentsModal.tsx, /tmp/issue333-integrated/tree/src/components/TransactionFormModal.tsx, /tmp/issue333-integrated/tree/src/components/bank/BankLineDocumentsDialog.tsx, /tmp/issue333-integrated/tree/src/components/camarim/CamarimItemAttachmentButton.tsx, /tmp/issue333-integrated/tree/src/components/camarim/CamarimItemModal.tsx, /tmp/issue333-integrated/tree/src/components/cards/NewCardExpenseModal.tsx, /tmp/issue333-integrated/tree/src/components/supplier-credits/NewSupplierCreditModal.tsx, /tmp/issue333-integrated/tree/src/components/supplier-credits/SupplierCreditsTab.tsx, /tmp/issue333-integrated/tree/src/pages/BankReconciliation.tsx, /tmp/issue333-integrated/tree/src/pages/EventImplementations.tsx, /tmp/issue333-integrated/tree/src/pages/PartnerEventDetail.tsx, /tmp/issue333-integrated/tree/src/pages/StandaloneInvoiceScanner.tsx, /tmp/issue333-integrated/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx, dynamic import will not move module into another chunk.
[39m
[bundle] inicial estático: 5131242 bytes
computing gzip size...
[2mdist/[22m[32mmanifest.webmanifest                                    [39m[1m[2m    0.47 kB[22m[1m[22m
[2mdist/[22m[32mindex.html                                              [39m[1m[2m    3.95 kB[22m[1m[22m[2m │ gzip:   1.29 kB[22m
[2mdist/[22m[2massets/[22m[32mlogo-horizontal-mvVEptKs.png                     [39m[1m[2m   45.85 kB[22m[1m[22m
[2mdist/[22m[32mbundle-report.json                                      [39m[1m[2m  810.14 kB[22m[1m[22m[2m │ gzip:  76.44 kB[22m
[2mdist/[22m[2massets/[22m[32mtransaction-lifecycle-DuCcaQBZ.jpg               [39m[1m[2m1,175.46 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32mevent-lifecycle-CvV3N1nA.jpg                     [39m[1m[2m1,221.66 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32mpdf.worker.min-iDqQPrd3.mjs                      [39m[1m[2m1,232.30 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32muser-roles-CevPcr3I.jpg                          [39m[1m[2m1,241.98 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32maccounts-flow-BVCUzNuB.jpg                       [39m[1m[2m1,252.59 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32mbp-workflow-EJGerC2n.jpg                         [39m[1m[2m1,332.07 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[35mStrategyPrint-CymDZpv5.css                       [39m[1m[2m    3.64 kB[22m[1m[22m[2m │ gzip:   1.24 kB[22m
[2mdist/[22m[2massets/[22m[35mAudiencePrint-CdEbyEIQ.css                       [39m[1m[2m    5.16 kB[22m[1m[22m[2m │ gzip:   1.48 kB[22m
[2mdist/[22m[2massets/[22m[35mindex-CUszSXa7.css                               [39m[1m[2m  171.29 kB[22m[1m[22m[2m │ gzip:  27.24 kB[22m
[2mdist/[22m[2massets/[22m[35mvendor-handsontable-8wq-FOPh.css                 [39m[1m[2m  182.11 kB[22m[1m[22m[2m │ gzip:  21.62 kB[22m
[2mdist/[22m[2massets/[22m[36msubDays-BR8n3PdH.js                              [39m[1m[2m    0.09 kB[22m[1m[22m[2m │ gzip:   0.10 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInMilliseconds-LLbDEX0K.js             [39m[1m[2m    0.12 kB[22m[1m[22m[2m │ gzip:   0.13 kB[22m
[2mdist/[22m[2massets/[22m[36moperacao-labels-Cq-Qt5BS.js                      [39m[1m[2m    0.13 kB[22m[1m[22m[2m │ gzip:   0.12 kB[22m
[2mdist/[22m[2massets/[22m[36museDisplayCurrency-Xt_mbZag.js                   [39m[1m[2m    0.15 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
[2mdist/[22m[2massets/[22m[36mstartOfMonth-CKCw-RWI.js                         [39m[1m[2m    0.15 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
[2mdist/[22m[2massets/[22m[36mconstants-uO0lGu32.js                            [39m[1m[2m    0.16 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-category-constraint-B8MCXqQh.js               [39m[1m[2m    0.19 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInCalendarMonths-B7vAcVWO.js           [39m[1m[2m    0.19 kB[22m[1m[22m[2m │ gzip:   0.17 kB[22m
[2mdist/[22m[2massets/[22m[36mendOfMonth-Bz2Gx-N-.js                           [39m[1m[2m    0.20 kB[22m[1m[22m[2m │ gzip:   0.18 kB[22m
[2mdist/[22m[2massets/[22m[36museDebouncedValue-BRJMxObC.js                    [39m[1m[2m    0.20 kB[22m[1m[22m[2m │ gzip:   0.17 kB[22m
[2mdist/[22m[2massets/[22m[36mpdf-text-CRO-dKNy.js                             [39m[1m[2m    0.20 kB[22m[1m[22m[2m │ gzip:   0.17 kB[22m
[2mdist/[22m[2massets/[22m[36maddDays-CklYSQT6.js                              [39m[1m[2m    0.21 kB[22m[1m[22m[2m │ gzip:   0.19 kB[22m
[2mdist/[22m[2massets/[22m[36mcountry-BQyONak0.js                              [39m[1m[2m    0.23 kB[22m[1m[22m[2m │ gzip:   0.19 kB[22m
[2mdist/[22m[2massets/[22m[36mslug-Bzks-5QT.js                                 [39m[1m[2m    0.23 kB[22m[1m[22m[2m │ gzip:   0.19 kB[22m
[2mdist/[22m[2massets/[22m[36mrateio-children-CukInAMc.js                      [39m[1m[2m    0.24 kB[22m[1m[22m[2m │ gzip:   0.16 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInCalendarDays-CZO_y_Bc.js             [39m[1m[2m    0.24 kB[22m[1m[22m[2m │ gzip:   0.20 kB[22m
[2mdist/[22m[2massets/[22m[36mmust-write-D6vQQ_6o.js                           [39m[1m[2m    0.28 kB[22m[1m[22m[2m │ gzip:   0.23 kB[22m
[2mdist/[22m[2massets/[22m[36meachDayOfInterval-BuSrMpJD.js                    [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.23 kB[22m
[2mdist/[22m[2massets/[22m[36mbackdropClose-DhAmLxNF.js                        [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.21 kB[22m
[2mdist/[22m[2massets/[22m[36mrelativeTime-CufnskKF.js                         [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.22 kB[22m
[2mdist/[22m[2massets/[22m[36mskeleton-CmbXJshe.js                             [39m[1m[2m    0.33 kB[22m[1m[22m[2m │ gzip:   0.27 kB[22m
[2mdist/[22m[2massets/[22m[36maddMonths-Dsh0EBap.js                            [39m[1m[2m    0.35 kB[22m[1m[22m[2m │ gzip:   0.25 kB[22m
[2mdist/[22m[2massets/[22m[36mstrategy-status-if_xUdsk.js                      [39m[1m[2m    0.41 kB[22m[1m[22m[2m │ gzip:   0.24 kB[22m
[2mdist/[22m[2massets/[22m[36mform-enter-guard-TC9TB5Pp.js                     [39m[1m[2m    0.43 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36mtraction-C6TeXKI5.js                             [39m[1m[2m    0.45 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
[2mdist/[22m[2massets/[22m[36mstring-similarity-B7WDu-Mk.js                    [39m[1m[2m    0.45 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
[2mdist/[22m[2massets/[22m[36moverlay-layer-CQoMP7fS.js                        [39m[1m[2m    0.50 kB[22m[1m[22m[2m │ gzip:   0.36 kB[22m
[2mdist/[22m[2massets/[22m[36mcreative-media-DKNTK8AD.js                       [39m[1m[2m    0.50 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
[2mdist/[22m[2massets/[22m[36mseparator-DQuQAOoZ.js                            [39m[1m[2m    0.53 kB[22m[1m[22m[2m │ gzip:   0.36 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInDays-ChvF9Jc3.js                     [39m[1m[2m    0.54 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36mbudget-mode-J-0WADxM.js                          [39m[1m[2m    0.56 kB[22m[1m[22m[2m │ gzip:   0.40 kB[22m
[2mdist/[22m[2massets/[22m[36museMyLeadFrenteIds-DuPxjF26.js                   [39m[1m[2m    0.56 kB[22m[1m[22m[2m │ gzip:   0.38 kB[22m
[2mdist/[22m[2massets/[22m[36mgetTimezoneOffsetInMilliseconds-CEhzTjz1.js      [39m[1m[2m    0.58 kB[22m[1m[22m[2m │ gzip:   0.34 kB[22m
[2mdist/[22m[2massets/[22m[36maudience-pdf-RQfvkLkz.js                         [39m[1m[2m    0.64 kB[22m[1m[22m[2m │ gzip:   0.41 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-nature-BSQ-ezBD.js                         [39m[1m[2m    0.78 kB[22m[1m[22m[2m │ gzip:   0.45 kB[22m
[2mdist/[22m[2massets/[22m[36museRealtimeInvalidation-BTTq6xbq.js              [39m[1m[2m    0.78 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m
[2mdist/[22m[2massets/[22m[36mIbanWarning-CPdWIX-y.js                          [39m[1m[2m    0.80 kB[22m[1m[22m[2m │ gzip:   0.42 kB[22m
[2mdist/[22m[2massets/[22m[36mPriorityBadge-QAVXkug3.js                        [39m[1m[2m    0.80 kB[22m[1m[22m[2m │ gzip:   0.52 kB[22m
[2mdist/[22m[2massets/[22m[36museOperacaoFilters-CTkRwTaA.js                   [39m[1m[2m    0.81 kB[22m[1m[22m[2m │ gzip:   0.49 kB[22m
[2mdist/[22m[2massets/[22m[36madmin-window-L7piFHGo.js                         [39m[1m[2m    0.85 kB[22m[1m[22m[2m │ gzip:   0.50 kB[22m
[2mdist/[22m[2massets/[22m[36mcard-account-balance-BheO1faF.js                 [39m[1m[2m    0.92 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36maccount-balance-rpc-cKs6Rfzk.js                  [39m[1m[2m    0.93 kB[22m[1m[22m[2m │ gzip:   0.49 kB[22m
[2mdist/[22m[2massets/[22m[36mcircuit-account-FywyBolH.js                      [39m[1m[2m    0.94 kB[22m[1m[22m[2m │ gzip:   0.59 kB[22m
[2mdist/[22m[2massets/[22m[36msupplier-credits-C7SR29ej.js                     [39m[1m[2m    0.98 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mmoney-input-D2bYGcUo.js                          [39m[1m[2m    1.01 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
[2mdist/[22m[2massets/[22m[36mapp-badge-DYUSuryV.js                            [39m[1m[2m    1.04 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m
[2mdist/[22m[2massets/[22m[36mavatar-BmT7eXMm.js                               [39m[1m[2m    1.04 kB[22m[1m[22m[2m │ gzip:   0.43 kB[22m
[2mdist/[22m[2massets/[22m[36mbank-link-date-DcRav5qG.js                       [39m[1m[2m    1.05 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36mStaffList-BNoSt-Ib.js                            [39m[1m[2m    1.18 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36mPhaseBadge-B95hjWYw.js                           [39m[1m[2m    1.19 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m
[2mdist/[22m[2massets/[22m[36mzone-capacities-ClvWj-Ek.js                      [39m[1m[2m    1.22 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mIvaRateSelect-BaoeMoNs.js                        [39m[1m[2m    1.23 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
[2mdist/[22m[2massets/[22m[36mcard-session-helpers-CHiLCbOl.js                 [39m[1m[2m    1.31 kB[22m[1m[22m[2m │ gzip:   0.66 kB[22m
[2mdist/[22m[2massets/[22m[36malert-Lo3QjC7m.js                                [39m[1m[2m    1.31 kB[22m[1m[22m[2m │ gzip:   0.59 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoStatusBadge-DncR76ZF.js                  [39m[1m[2m    1.35 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
[2mdist/[22m[2massets/[22m[36maccount-balance-BvweOQFt.js                      [39m[1m[2m    1.36 kB[22m[1m[22m[2m │ gzip:   0.69 kB[22m
[2mdist/[22m[2massets/[22m[36mcurrency-DvXZV_Ot.js                             [39m[1m[2m    1.43 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36maccountant-reviews-CX_wKtJC.js                   [39m[1m[2m    1.46 kB[22m[1m[22m[2m │ gzip:   0.60 kB[22m
[2mdist/[22m[2massets/[22m[36msupplier-bank-_Nlt6tXv.js                        [39m[1m[2m    1.51 kB[22m[1m[22m[2m │ gzip:   0.70 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-line-relink-DDmtZphk.js                       [39m[1m[2m    1.52 kB[22m[1m[22m[2m │ gzip:   0.59 kB[22m
[2mdist/[22m[2massets/[22m[36mscroll-area-CRsSzDif.js                          [39m[1m[2m    1.61 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mReportArtistCachePage-CeQDMKWz.js                [39m[1m[2m    1.65 kB[22m[1m[22m[2m │ gzip:   0.63 kB[22m
[2mdist/[22m[2massets/[22m[36mcapital-branch-CJwzxRyH.js                       [39m[1m[2m    1.67 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36mebitda-CRgcR9fY.js                               [39m[1m[2m    1.74 kB[22m[1m[22m[2m │ gzip:   0.76 kB[22m
[2mdist/[22m[2massets/[22m[36mcamarim-helpers-M1Vn5iD-.js                      [39m[1m[2m    1.76 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36maccordion-CHK37azY.js                            [39m[1m[2m    1.76 kB[22m[1m[22m[2m │ gzip:   0.64 kB[22m
[2mdist/[22m[2massets/[22m[36miban-BYOybSCJ.js                                 [39m[1m[2m    1.79 kB[22m[1m[22m[2m │ gzip:   0.95 kB[22m
[2mdist/[22m[2massets/[22m[36minvoice-ocr-prepare-CcJft9v3.js                  [39m[1m[2m    1.85 kB[22m[1m[22m[2m │ gzip:   1.02 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-line-required-rOjM6E06.js                     [39m[1m[2m    1.88 kB[22m[1m[22m[2m │ gzip:   0.76 kB[22m
[2mdist/[22m[2massets/[22m[36mEventNatureFilter-cpDO_Jad.js                    [39m[1m[2m    1.88 kB[22m[1m[22m[2m │ gzip:   0.73 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountingExportPage-BHvgg8Cl.js           [39m[1m[2m    1.95 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDocumentPendenciesPage-CepLURbe.js         [39m[1m[2m    1.97 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36mtoggle-group-BMi2R-ZW.js                         [39m[1m[2m    1.99 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36mdashboard-format-GnqOyAs1.js                     [39m[1m[2m    2.00 kB[22m[1m[22m[2m │ gzip:   0.92 kB[22m
[2mdist/[22m[2massets/[22m[36msettlement-participants-DrUQYof3.js              [39m[1m[2m    2.01 kB[22m[1m[22m[2m │ gzip:   0.79 kB[22m
[2mdist/[22m[2massets/[22m[36mMirrorAporteNotice-Bys3yJLv.js                   [39m[1m[2m    2.04 kB[22m[1m[22m[2m │ gzip:   0.90 kB[22m
[2mdist/[22m[2massets/[22m[36mFeatureNotEnabledCard-B3NiLfGN.js                [39m[1m[2m    2.05 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-ab-calc-BxWHlvfV.js                        [39m[1m[2m    2.10 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteLeadsAvatars-DicZuEga.js                   [39m[1m[2m    2.20 kB[22m[1m[22m[2m │ gzip:   0.86 kB[22m
[2mdist/[22m[2massets/[22m[36mticket-office-reconciliation-BqitH3oe.js         [39m[1m[2m    2.25 kB[22m[1m[22m[2m │ gzip:   1.05 kB[22m
[2mdist/[22m[2massets/[22m[36museUserPreferences-CFyTKgz2.js                   [39m[1m[2m    2.30 kB[22m[1m[22m[2m │ gzip:   0.70 kB[22m
[2mdist/[22m[2massets/[22m[36mformatDistanceToNow-CgGNwkFO.js                  [39m[1m[2m    2.32 kB[22m[1m[22m[2m │ gzip:   0.98 kB[22m
[2mdist/[22m[2massets/[22m[36mpartner-extras-BXdLWNIL.js                       [39m[1m[2m    2.32 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-tx-matching-BHd1Ixbn.js                       [39m[1m[2m    2.38 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36museEventIvaRates-CTy7Q5LQ.js                     [39m[1m[2m    2.64 kB[22m[1m[22m[2m │ gzip:   1.14 kB[22m
[2mdist/[22m[2massets/[22m[36mparseISO-Cr0H38in.js                             [39m[1m[2m    2.70 kB[22m[1m[22m[2m │ gzip:   1.19 kB[22m
[2mdist/[22m[2massets/[22m[36mReportCostSourceToggle-uYJyMVwd.js               [39m[1m[2m    2.88 kB[22m[1m[22m[2m │ gzip:   1.06 kB[22m
[2mdist/[22m[2massets/[22m[36m_LegalLayout-DPRxrbWD.js                         [39m[1m[2m    2.95 kB[22m[1m[22m[2m │ gzip:   0.68 kB[22m
[2mdist/[22m[2massets/[22m[36mdate-picker-9GnG8FCx.js                          [39m[1m[2m    3.25 kB[22m[1m[22m[2m │ gzip:   1.24 kB[22m
[2mdist/[22m[2massets/[22m[36mreal-cache-calc-Cmd02Ike.js                      [39m[1m[2m    3.25 kB[22m[1m[22m[2m │ gzip:   1.48 kB[22m
[2mdist/[22m[2massets/[22m[36mAcceptInvite-BJrWysR5.js                         [39m[1m[2m    3.74 kB[22m[1m[22m[2m │ gzip:   1.16 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaAssigneeAvatars-dXaH7isq.js                 [39m[1m[2m    3.76 kB[22m[1m[22m[2m │ gzip:   0.99 kB[22m
[2mdist/[22m[2massets/[22m[36mAdAccounts-CeqdGWSV.js                           [39m[1m[2m    3.80 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36mNewStaffDialog-BrghDgCX.js                       [39m[1m[2m    4.29 kB[22m[1m[22m[2m │ gzip:   1.19 kB[22m
[2mdist/[22m[2massets/[22m[36mStatCard-DgzkkdDo.js                             [39m[1m[2m    4.30 kB[22m[1m[22m[2m │ gzip:   1.05 kB[22m
[2mdist/[22m[2massets/[22m[36mcache-tab-total-DjHng9Ro.js                      [39m[1m[2m    4.35 kB[22m[1m[22m[2m │ gzip:   1.67 kB[22m
[2mdist/[22m[2massets/[22m[36mcsv-export-Bp8nlkXR.js                           [39m[1m[2m    4.39 kB[22m[1m[22m[2m │ gzip:   1.57 kB[22m
[2mdist/[22m[2massets/[22m[36mImageUploader-CV9_ENAJ.js                        [39m[1m[2m    4.60 kB[22m[1m[22m[2m │ gzip:   1.48 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceNew-B2L40bym.js                          [39m[1m[2m    4.71 kB[22m[1m[22m[2m │ gzip:   1.26 kB[22m
[2mdist/[22m[2massets/[22m[36museScenarioForecasts-D4nSKJIM.js                 [39m[1m[2m    4.72 kB[22m[1m[22m[2m │ gzip:   1.43 kB[22m
[2mdist/[22m[2massets/[22m[36mexport-ticket-office-settlement-pdf-CUBtX1rO.js  [39m[1m[2m    5.00 kB[22m[1m[22m[2m │ gzip:   2.28 kB[22m
[2mdist/[22m[2massets/[22m[36mMeusChamados-BiIlEjEJ.js                         [39m[1m[2m    5.16 kB[22m[1m[22m[2m │ gzip:   1.55 kB[22m
[2mdist/[22m[2massets/[22m[36mUserSettings-L5CNFot4.js                         [39m[1m[2m    5.35 kB[22m[1m[22m[2m │ gzip:   1.66 kB[22m
[2mdist/[22m[2massets/[22m[36minvoice-group-2x3RfHOj.js                        [39m[1m[2m    5.43 kB[22m[1m[22m[2m │ gzip:   1.76 kB[22m
[2mdist/[22m[2massets/[22m[36mSimilarSuppliersNotice-DzuLVpjU.js               [39m[1m[2m    5.56 kB[22m[1m[22m[2m │ gzip:   1.83 kB[22m
[2mdist/[22m[2massets/[22m[36mpt-BR-Dh5EWHbw.js                                [39m[1m[2m    5.85 kB[22m[1m[22m[2m │ gzip:   2.10 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierBankDetails-CgQn9nM9.js                  [39m[1m[2m    5.91 kB[22m[1m[22m[2m │ gzip:   1.19 kB[22m
[2mdist/[22m[2massets/[22m[36mpt-B3dxR9FF.js                                   [39m[1m[2m    5.97 kB[22m[1m[22m[2m │ gzip:   2.02 kB[22m
[2mdist/[22m[2massets/[22m[36mparse-ticketline-zone-xlsx-BcBXDVLy.js           [39m[1m[2m    6.86 kB[22m[1m[22m[2m │ gzip:   2.59 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoHome-QaDwpebV.js                         [39m[1m[2m    6.87 kB[22m[1m[22m[2m │ gzip:   1.91 kB[22m
[2mdist/[22m[2massets/[22m[36mchart-DOv_UKLK.js                                [39m[1m[2m    7.10 kB[22m[1m[22m[2m │ gzip:   2.18 kB[22m
[2mdist/[22m[2massets/[22m[36men-US-CpWK9ySR.js                                [39m[1m[2m    7.19 kB[22m[1m[22m[2m │ gzip:   2.47 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadoNovo-BE5-HHVT.js                          [39m[1m[2m    7.19 kB[22m[1m[22m[2m │ gzip:   1.83 kB[22m
[2mdist/[22m[2massets/[22m[36mMinhasTarefas-dPtIYFaf.js                        [39m[1m[2m    7.49 kB[22m[1m[22m[2m │ gzip:   2.15 kB[22m
[2mdist/[22m[2massets/[22m[36museBPVersions-B_gEGzVY.js                        [39m[1m[2m    7.53 kB[22m[1m[22m[2m │ gzip:   1.77 kB[22m
[2mdist/[22m[2massets/[22m[36mDiagnosisTest-CBQrWVIb.js                        [39m[1m[2m    7.66 kB[22m[1m[22m[2m │ gzip:   1.57 kB[22m
[2mdist/[22m[2massets/[22m[36mIbanDuplicates-B5HPTEmU.js                       [39m[1m[2m    7.82 kB[22m[1m[22m[2m │ gzip:   2.03 kB[22m
[2mdist/[22m[2massets/[22m[36mFrentesPanel-ByIkxHvJ.js                         [39m[1m[2m    7.97 kB[22m[1m[22m[2m │ gzip:   2.06 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSalesComparisonPage-CrB6ms4M.js            [39m[1m[2m    8.08 kB[22m[1m[22m[2m │ gzip:   2.16 kB[22m
[2mdist/[22m[2massets/[22m[36mSimilarSuppliersReview-BqO5qk_k.js               [39m[1m[2m    8.16 kB[22m[1m[22m[2m │ gzip:   1.98 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-format-DMtb1AT2.js                         [39m[1m[2m    8.26 kB[22m[1m[22m[2m │ gzip:   2.51 kB[22m
[2mdist/[22m[2massets/[22m[36mAtividade-B-TTYVus.js                            [39m[1m[2m    8.28 kB[22m[1m[22m[2m │ gzip:   2.32 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoListShell-CueI6z2F.js                    [39m[1m[2m    8.57 kB[22m[1m[22m[2m │ gzip:   2.21 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSalesCurvePage-DX30SgG-.js                 [39m[1m[2m    8.57 kB[22m[1m[22m[2m │ gzip:   2.13 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategies-DErOSlra.js                           [39m[1m[2m    8.79 kB[22m[1m[22m[2m │ gzip:   2.13 kB[22m
[2mdist/[22m[2massets/[22m[36mUploadCoalaFotos-BNPQ-9vC.js                     [39m[1m[2m    8.82 kB[22m[1m[22m[2m │ gzip:   2.10 kB[22m
[2mdist/[22m[2massets/[22m[36mFieldStaffSection-ChcjqK3h.js                    [39m[1m[2m    9.28 kB[22m[1m[22m[2m │ gzip:   2.13 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAgingPage-DCLe-_cj.js                      [39m[1m[2m    9.29 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mimport-pl-xlsx-BgUfuKLh.js                       [39m[1m[2m    9.39 kB[22m[1m[22m[2m │ gzip:   4.03 kB[22m
[2mdist/[22m[2massets/[22m[36mFundHolderPicker-bOlbSBMc.js                     [39m[1m[2m    9.47 kB[22m[1m[22m[2m │ gzip:   1.96 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountCategoriesPage-BSQYCSHY.js          [39m[1m[2m    9.48 kB[22m[1m[22m[2m │ gzip:   2.17 kB[22m
[2mdist/[22m[2massets/[22m[36mReportRevenueMixPage-CZo7fj_D.js                 [39m[1m[2m    9.81 kB[22m[1m[22m[2m │ gzip:   2.15 kB[22m
[2mdist/[22m[2massets/[22m[36mReportMonthlyEvolutionPage-BcdlyNpD.js           [39m[1m[2m   10.06 kB[22m[1m[22m[2m │ gzip:   2.11 kB[22m
[2mdist/[22m[2massets/[22m[36museEventABScenarios-YHUb-WNH.js                  [39m[1m[2m   10.09 kB[22m[1m[22m[2m │ gzip:   3.72 kB[22m
[2mdist/[22m[2massets/[22m[36mBankLineDocumentsDialog-C8elMJsb.js              [39m[1m[2m   10.13 kB[22m[1m[22m[2m │ gzip:   2.73 kB[22m
[2mdist/[22m[2massets/[22m[36mAuditDownloads-DtlBbKmg.js                       [39m[1m[2m   10.38 kB[22m[1m[22m[2m │ gzip:   2.18 kB[22m
[2mdist/[22m[2massets/[22m[36mReportOccupancyRatePage-D_gHcYJa.js              [39m[1m[2m   10.43 kB[22m[1m[22m[2m │ gzip:   2.30 kB[22m
[2mdist/[22m[2massets/[22m[36mCreatives-CQLB7GeC.js                            [39m[1m[2m   10.74 kB[22m[1m[22m[2m │ gzip:   2.36 kB[22m
[2mdist/[22m[2massets/[22m[36museCitySimulator-BwQDUtTl.js                     [39m[1m[2m   10.99 kB[22m[1m[22m[2m │ gzip:   3.61 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBudgetDeviationPage-1pxjYd5w.js            [39m[1m[2m   11.01 kB[22m[1m[22m[2m │ gzip:   2.56 kB[22m
[2mdist/[22m[2massets/[22m[36mReportTreasuryProjectionPage-BQdBo30R.js         [39m[1m[2m   11.05 kB[22m[1m[22m[2m │ gzip:   2.51 kB[22m
[2mdist/[22m[2massets/[22m[36mUserActivityLog-BV6ERQcX.js                      [39m[1m[2m   11.08 kB[22m[1m[22m[2m │ gzip:   2.44 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSupplierConcentrationPage-BgXqsAok.js      [39m[1m[2m   11.33 kB[22m[1m[22m[2m │ gzip:   2.26 kB[22m
[2mdist/[22m[2massets/[22m[36mCardItemDocumentsField-C4QJnlPx.js               [39m[1m[2m   11.37 kB[22m[1m[22m[2m │ gzip:   2.98 kB[22m
[2mdist/[22m[2massets/[22m[36mManualGaps-2Md9CTFE.js                           [39m[1m[2m   11.67 kB[22m[1m[22m[2m │ gzip:   2.61 kB[22m
[2mdist/[22m[2massets/[22m[36mBlogList-DqZZu8M3.js                             [39m[1m[2m   11.68 kB[22m[1m[22m[2m │ gzip:   2.19 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSuppliersPage-DNtNfsYN.js                  [39m[1m[2m   11.69 kB[22m[1m[22m[2m │ gzip:   2.54 kB[22m
[2mdist/[22m[2massets/[22m[36mLinkBpLineDialog-zyjpo6FS.js                     [39m[1m[2m   11.70 kB[22m[1m[22m[2m │ gzip:   2.64 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadoDetail-B5ibpTVr.js                        [39m[1m[2m   11.95 kB[22m[1m[22m[2m │ gzip:   2.84 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminPanel-C5npxFDF.js                           [39m[1m[2m   12.00 kB[22m[1m[22m[2m │ gzip:   3.61 kB[22m
[2mdist/[22m[2massets/[22m[36mOnboarding-BPaMidlc.js                           [39m[1m[2m   12.12 kB[22m[1m[22m[2m │ gzip:   2.80 kB[22m
[2mdist/[22m[2massets/[22m[36mReportProfitabilityPage-DvRgTqB1.js              [39m[1m[2m   12.19 kB[22m[1m[22m[2m │ gzip:   2.91 kB[22m
[2mdist/[22m[2massets/[22m[36mCrmDashboard-CFO7WtiF.js                         [39m[1m[2m   12.25 kB[22m[1m[22m[2m │ gzip:   2.95 kB[22m
[2mdist/[22m[2massets/[22m[36mGoogleAdsAdmin-hfW25UMj.js                       [39m[1m[2m   12.53 kB[22m[1m[22m[2m │ gzip:   2.42 kB[22m
[2mdist/[22m[2massets/[22m[36mPaginasList-CbPJt_pX.js                          [39m[1m[2m   12.82 kB[22m[1m[22m[2m │ gzip:   2.59 kB[22m
[2mdist/[22m[2massets/[22m[36mformat-CGtoj5si.js                               [39m[1m[2m   13.04 kB[22m[1m[22m[2m │ gzip:   3.48 kB[22m
[2mdist/[22m[2massets/[22m[36mEditCampaignPopover-BYbyHvkZ.js                  [39m[1m[2m   13.17 kB[22m[1m[22m[2m │ gzip:   3.24 kB[22m
[2mdist/[22m[2massets/[22m[36mReminders-D8ktQPKo.js                            [39m[1m[2m   13.21 kB[22m[1m[22m[2m │ gzip:   2.90 kB[22m
[2mdist/[22m[2massets/[22m[36mSyncHealth-BTtSMHgi.js                           [39m[1m[2m   13.32 kB[22m[1m[22m[2m │ gzip:   2.43 kB[22m
[2mdist/[22m[2massets/[22m[36mEndossarEventoPage-DWKB9pKi.js                   [39m[1m[2m   13.53 kB[22m[1m[22m[2m │ gzip:   2.94 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPendencyIndexPage-DvJ3d614.js              [39m[1m[2m   13.59 kB[22m[1m[22m[2m │ gzip:   2.13 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencesList-C1Ry4ctY.js                        [39m[1m[2m   13.76 kB[22m[1m[22m[2m │ gzip:   2.74 kB[22m
[2mdist/[22m[2massets/[22m[36mCategoryFormModal-BtIIlWpS.js                    [39m[1m[2m   13.95 kB[22m[1m[22m[2m │ gzip:   3.22 kB[22m
[2mdist/[22m[2massets/[22m[36mEndorsementEditor-D3y_5MRU.js                    [39m[1m[2m   14.08 kB[22m[1m[22m[2m │ gzip:   2.75 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencePreviewCount-CHWtpKvS.js                 [39m[1m[2m   14.18 kB[22m[1m[22m[2m │ gzip:   3.64 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceEditor-6pkhm9NC.js                       [39m[1m[2m   14.50 kB[22m[1m[22m[2m │ gzip:   2.81 kB[22m
[2mdist/[22m[2massets/[22m[36mTrash-yOaM4Vr2.js                                [39m[1m[2m   14.64 kB[22m[1m[22m[2m │ gzip:   3.12 kB[22m
[2mdist/[22m[2massets/[22m[36mNewEventoPage-CPeCuzKh.js                        [39m[1m[2m   14.75 kB[22m[1m[22m[2m │ gzip:   2.68 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPartnerExpensesPage-DCjMy-Ri.js            [39m[1m[2m   14.80 kB[22m[1m[22m[2m │ gzip:   3.11 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadosList-Ch8xzz74.js                         [39m[1m[2m   15.30 kB[22m[1m[22m[2m │ gzip:   4.04 kB[22m
[2mdist/[22m[2massets/[22m[36mContactDetailsSheet-y67M3RaR.js                  [39m[1m[2m   15.32 kB[22m[1m[22m[2m │ gzip:   2.67 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBI-B8eTJ6wU.js                              [39m[1m[2m   15.36 kB[22m[1m[22m[2m │ gzip:   3.87 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantPendencies-ZI92nf4M.js                 [39m[1m[2m   15.39 kB[22m[1m[22m[2m │ gzip:   3.36 kB[22m
[2mdist/[22m[2massets/[22m[36mInvoiceGroupAudit-CTsA5jfo.js                    [39m[1m[2m   15.48 kB[22m[1m[22m[2m │ gzip:   3.18 kB[22m
[2mdist/[22m[2massets/[22m[36mRlsLegacyAudit-Zif3z6T7.js                       [39m[1m[2m   15.55 kB[22m[1m[22m[2m │ gzip:   2.79 kB[22m
[2mdist/[22m[2massets/[22m[36mRaiseBudgetDialog-Mt9HM8gI.js                    [39m[1m[2m   15.87 kB[22m[1m[22m[2m │ gzip:   3.47 kB[22m
[2mdist/[22m[2massets/[22m[36mEditFrenteSheet-D9GJpG4x.js                      [39m[1m[2m   15.94 kB[22m[1m[22m[2m │ gzip:   3.42 kB[22m
[2mdist/[22m[2massets/[22m[36mPaginaEditor-CvCtL6eG.js                         [39m[1m[2m   16.33 kB[22m[1m[22m[2m │ gzip:   3.23 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyNew-DT6lhhpd.js                          [39m[1m[2m   16.80 kB[22m[1m[22m[2m │ gzip:   3.99 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierTransactions-BVKi9OUv.js                 [39m[1m[2m   16.87 kB[22m[1m[22m[2m │ gzip:   3.57 kB[22m
[2mdist/[22m[2massets/[22m[36mPurchaseAudienceCard-nZpKQquB.js                 [39m[1m[2m   17.08 kB[22m[1m[22m[2m │ gzip:   3.33 kB[22m
[2mdist/[22m[2massets/[22m[36mSetup-PQgHp09a.js                                [39m[1m[2m   17.24 kB[22m[1m[22m[2m │ gzip:   4.12 kB[22m
[2mdist/[22m[2massets/[22m[36mPessoaDetail-CI8ldYl9.js                         [39m[1m[2m   17.58 kB[22m[1m[22m[2m │ gzip:   3.51 kB[22m
[2mdist/[22m[2massets/[22m[36mInvariantMonitor-vJSgLT8w.js                     [39m[1m[2m   18.21 kB[22m[1m[22m[2m │ gzip:   3.33 kB[22m
[2mdist/[22m[2massets/[22m[36mibantools--sXKtUqI.js                            [39m[1m[2m   18.29 kB[22m[1m[22m[2m │ gzip:   3.82 kB[22m
[2mdist/[22m[2massets/[22m[36mClubeNewgang-BwI-TJkb.js                         [39m[1m[2m   18.45 kB[22m[1m[22m[2m │ gzip:   3.15 kB[22m
[2mdist/[22m[2massets/[22m[36mTerms-Bbctn9fQ.js                                [39m[1m[2m   18.58 kB[22m[1m[22m[2m │ gzip:   2.97 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREEmpresarialPage-X_iMDzhq.js             [39m[1m[2m   18.79 kB[22m[1m[22m[2m │ gzip:   5.00 kB[22m
[2mdist/[22m[2massets/[22m[36mAbout-DFsWUxr4.js                                [39m[1m[2m   18.87 kB[22m[1m[22m[2m │ gzip:   2.87 kB[22m
[2mdist/[22m[2massets/[22m[36mNotifications-DlgtZyNu.js                        [39m[1m[2m   19.17 kB[22m[1m[22m[2m │ gzip:   2.57 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountCategories-D123hEE3.js                    [39m[1m[2m   19.22 kB[22m[1m[22m[2m │ gzip:   3.75 kB[22m
[2mdist/[22m[2massets/[22m[36mQuotations-BolFxLcl.js                           [39m[1m[2m   19.61 kB[22m[1m[22m[2m │ gzip:   3.82 kB[22m
[2mdist/[22m[2massets/[22m[36mEventImplementations-nM-NPXyW.js                 [39m[1m[2m   19.77 kB[22m[1m[22m[2m │ gzip:   3.90 kB[22m
[2mdist/[22m[2massets/[22m[36mBlogEditor-DUIGlAoR.js                           [39m[1m[2m   20.02 kB[22m[1m[22m[2m │ gzip:   3.84 kB[22m
[2mdist/[22m[2massets/[22m[36mVideosList-CoJG2lzF.js                           [39m[1m[2m   20.02 kB[22m[1m[22m[2m │ gzip:   4.07 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPartnerSettlementPage-Dm-dxYXS.js          [39m[1m[2m   20.43 kB[22m[1m[22m[2m │ gzip:   3.89 kB[22m
[2mdist/[22m[2massets/[22m[36mPressList-BQIJoiUO.js                            [39m[1m[2m   21.22 kB[22m[1m[22m[2m │ gzip:   4.32 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDocumentPendencies-CmNZumE3.js             [39m[1m[2m   21.54 kB[22m[1m[22m[2m │ gzip:   3.73 kB[22m
[2mdist/[22m[2massets/[22m[36mDuelView-CasXfjZH.js                             [39m[1m[2m   21.70 kB[22m[1m[22m[2m │ gzip:   4.79 kB[22m
[2mdist/[22m[2massets/[22m[36mPortalSettings-CEbtwTbx.js                       [39m[1m[2m   21.94 kB[22m[1m[22m[2m │ gzip:   4.12 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteDetail-CBtFZns5.js                         [39m[1m[2m   22.17 kB[22m[1m[22m[2m │ gzip:   4.53 kB[22m
[2mdist/[22m[2massets/[22m[36mparse-B9BIfq30.js                                [39m[1m[2m   22.36 kB[22m[1m[22m[2m │ gzip:   4.64 kB[22m
[2mdist/[22m[2massets/[22m[36mEventosList-B1gmVDpm.js                          [39m[1m[2m   22.68 kB[22m[1m[22m[2m │ gzip:   3.78 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimEquipa-aL41ASf8.js                        [39m[1m[2m   22.98 kB[22m[1m[22m[2m │ gzip:   4.96 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyNewDesign-NF811csm.js                    [39m[1m[2m   23.32 kB[22m[1m[22m[2m │ gzip:   4.96 kB[22m
[2mdist/[22m[2massets/[22m[36mCreativeNew-CzxzdRnK.js                          [39m[1m[2m   24.05 kB[22m[1m[22m[2m │ gzip:   5.41 kB[22m
[2mdist/[22m[2massets/[22m[36mCampoView-CU3Koa9-.js                            [39m[1m[2m   24.18 kB[22m[1m[22m[2m │ gzip:   5.27 kB[22m
[2mdist/[22m[2massets/[22m[36mReportCashFlowPage-B4sO1KU3.js                   [39m[1m[2m   24.35 kB[22m[1m[22m[2m │ gzip:   4.49 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyPrint-CCLVh1IK.js                        [39m[1m[2m   24.56 kB[22m[1m[22m[2m │ gzip:   3.71 kB[22m
[2mdist/[22m[2massets/[22m[36mReportIvaAuditPage-CMBnxYAo.js                   [39m[1m[2m   24.76 kB[22m[1m[22m[2m │ gzip:   4.80 kB[22m
[2mdist/[22m[2massets/[22m[36mCustomerMatchUpload-Bv2d2RjB.js                  [39m[1m[2m   25.00 kB[22m[1m[22m[2m │ gzip:   4.14 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyPlanCard-CcDf4UcF.js                     [39m[1m[2m   25.39 kB[22m[1m[22m[2m │ gzip:   4.18 kB[22m
[2mdist/[22m[2massets/[22m[36mEventTrackersCard-Q0GhCT9z.js                    [39m[1m[2m   25.60 kB[22m[1m[22m[2m │ gzip:   4.40 kB[22m
[2mdist/[22m[2massets/[22m[36mpurify.es-8E279hYE.js                            [39m[1m[2m   25.61 kB[22m[1m[22m[2m │ gzip:   9.67 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDailySalesPage-BOVD8Inj.js                 [39m[1m[2m   25.92 kB[22m[1m[22m[2m │ gzip:   5.39 kB[22m
[2mdist/[22m[2massets/[22m[36mCardSessions-BXoUtMqN.js                         [39m[1m[2m   26.22 kB[22m[1m[22m[2m │ gzip:   5.38 kB[22m
[2mdist/[22m[2massets/[22m[36mReconciliacaoBpTx-Cbcsj3Rm.js                    [39m[1m[2m   26.94 kB[22m[1m[22m[2m │ gzip:   5.27 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapasList-zcZa3arl.js                           [39m[1m[2m   27.20 kB[22m[1m[22m[2m │ gzip:   6.95 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountingExport-CBVWnYEO.js               [39m[1m[2m   27.71 kB[22m[1m[22m[2m │ gzip:   5.04 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaignFromScratch-BJTQfyPh.js                  [39m[1m[2m   27.90 kB[22m[1m[22m[2m │ gzip:   5.24 kB[22m
[2mdist/[22m[2massets/[22m[36mPixels-wAOua5wP.js                               [39m[1m[2m   28.41 kB[22m[1m[22m[2m │ gzip:   4.42 kB[22m
[2mdist/[22m[2massets/[22m[36mRecurringTransactions-C5n1eXnx.js                [39m[1m[2m   28.65 kB[22m[1m[22m[2m │ gzip:   5.02 kB[22m
[2mdist/[22m[2massets/[22m[36mContactosList-hS001H1I.js                        [39m[1m[2m   29.14 kB[22m[1m[22m[2m │ gzip:   5.77 kB[22m
[2mdist/[22m[2massets/[22m[36mUserManagement-B1OmyJpV.js                       [39m[1m[2m   30.03 kB[22m[1m[22m[2m │ gzip:   6.24 kB[22m
[2mdist/[22m[2massets/[22m[36mConnections-DWbrbBDg.js                          [39m[1m[2m   30.11 kB[22m[1m[22m[2m │ gzip:   6.41 kB[22m
[2mdist/[22m[2massets/[22m[36mFormalidadeAudit-k-USK9Nb.js                     [39m[1m[2m   30.41 kB[22m[1m[22m[2m │ gzip:   5.56 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-revenue-basis-dyTUkdYs.js                  [39m[1m[2m   30.57 kB[22m[1m[22m[2m │ gzip:  10.48 kB[22m
[2mdist/[22m[2massets/[22m[36mLeadsList-CWPqHTQy.js                            [39m[1m[2m   30.85 kB[22m[1m[22m[2m │ gzip:   5.01 kB[22m
[2mdist/[22m[2massets/[22m[36mDataEntryDialog-CANObVAV.js                      [39m[1m[2m   30.97 kB[22m[1m[22m[2m │ gzip:   6.22 kB[22m
[2mdist/[22m[2massets/[22m[36mInsights-B2W4jUFH.js                             [39m[1m[2m   31.96 kB[22m[1m[22m[2m │ gzip:   4.81 kB[22m
[2mdist/[22m[2massets/[22m[36mReportArtistCache-DpVKeM2C.js                    [39m[1m[2m   32.09 kB[22m[1m[22m[2m │ gzip:   8.49 kB[22m
[2mdist/[22m[2massets/[22m[36mBolSync-ZK6OYeUV.js                              [39m[1m[2m   32.17 kB[22m[1m[22m[2m │ gzip:   5.29 kB[22m
[2mdist/[22m[2massets/[22m[36mMetaCapiMonitor-B6tTxQFs.js                      [39m[1m[2m   32.24 kB[22m[1m[22m[2m │ gzip:   4.31 kB[22m
[2mdist/[22m[2massets/[22m[36mCartaoEquipa-YmvLzhJC.js                         [39m[1m[2m   32.47 kB[22m[1m[22m[2m │ gzip:   7.47 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaSuppliersPanel-Q_ccwcEy.js                  [39m[1m[2m   32.76 kB[22m[1m[22m[2m │ gzip:   4.49 kB[22m
[2mdist/[22m[2massets/[22m[36mBatchPaymentModal-D5NgfZ9H.js                    [39m[1m[2m   32.88 kB[22m[1m[22m[2m │ gzip:   8.37 kB[22m
[2mdist/[22m[2massets/[22m[36mPrivacy-BIBWso0Q.js                              [39m[1m[2m   33.43 kB[22m[1m[22m[2m │ gzip:   4.92 kB[22m
[2mdist/[22m[2massets/[22m[36mIvaManagement-Db8-zOIx.js                        [39m[1m[2m   33.50 kB[22m[1m[22m[2m │ gzip:   5.29 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBIDetail-CvHCpGHp.js                        [39m[1m[2m   34.16 kB[22m[1m[22m[2m │ gzip:   8.15 kB[22m
[2mdist/[22m[2massets/[22m[36mcalendar-B3a-qBjW.js                             [39m[1m[2m   35.00 kB[22m[1m[22m[2m │ gzip:  11.08 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantStandaloneInvoicesTab-C_jPTJkg.js      [39m[1m[2m   35.02 kB[22m[1m[22m[2m │ gzip:   6.96 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketlineSync-D3szGsYv.js                       [39m[1m[2m   35.20 kB[22m[1m[22m[2m │ gzip:   5.85 kB[22m
[2mdist/[22m[2massets/[22m[36mReportForecastPayablesPage-C0lSgL23.js           [39m[1m[2m   35.23 kB[22m[1m[22m[2m │ gzip:   5.74 kB[22m
[2mdist/[22m[2massets/[22m[36mFunnelTest-D8jpYyFo.js                           [39m[1m[2m   36.02 kB[22m[1m[22m[2m │ gzip:   7.53 kB[22m
[2mdist/[22m[2massets/[22m[36mReportContasPagarPage-DUNHMXJU.js                [39m[1m[2m   36.90 kB[22m[1m[22m[2m │ gzip:   6.76 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactionDocumentsModal-B41vYEte.js            [39m[1m[2m   37.00 kB[22m[1m[22m[2m │ gzip:   7.88 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREBrasilPage-D5nA1L8s.js                  [39m[1m[2m   37.27 kB[22m[1m[22m[2m │ gzip:   7.37 kB[22m
[2mdist/[22m[2massets/[22m[36mAudit-BVRpv-MG.js                                [39m[1m[2m   37.98 kB[22m[1m[22m[2m │ gzip:   6.61 kB[22m
[2mdist/[22m[2massets/[22m[36mDashboard-DFlvnsPE.js                            [39m[1m[2m   38.23 kB[22m[1m[22m[2m │ gzip:   7.63 kB[22m
[2mdist/[22m[2massets/[22m[36mBPPlanilha-BajQqDn0.js                           [39m[1m[2m   39.19 kB[22m[1m[22m[2m │ gzip:  11.57 kB[22m
[2mdist/[22m[2massets/[22m[36mHelpCenter-XTsrfXCP.js                           [39m[1m[2m   39.52 kB[22m[1m[22m[2m │ gzip:  12.08 kB[22m
[2mdist/[22m[2massets/[22m[36mCompanies-DyMAm5aN.js                            [39m[1m[2m   40.04 kB[22m[1m[22m[2m │ gzip:   6.10 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteManage-BQW_GIrl.js                         [39m[1m[2m   41.63 kB[22m[1m[22m[2m │ gzip:   6.94 kB[22m
[2mdist/[22m[2massets/[22m[36mMetaAudiencesList-HRj_yPhZ.js                    [39m[1m[2m   41.84 kB[22m[1m[22m[2m │ gzip:   6.48 kB[22m
[2mdist/[22m[2massets/[22m[36mmarked.esm-DiRRsLPS.js                           [39m[1m[2m   42.33 kB[22m[1m[22m[2m │ gzip:  12.79 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREPage-DU9E3d23.js                        [39m[1m[2m   43.25 kB[22m[1m[22m[2m │ gzip:   8.61 kB[22m
[2mdist/[22m[2massets/[22m[36mReportMovementReconciliationPage-DiQzaD1O.js     [39m[1m[2m   43.52 kB[22m[1m[22m[2m │ gzip:   7.85 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOfficeSettlementsOverview-DFEdt_bH.js      [39m[1m[2m   43.96 kB[22m[1m[22m[2m │ gzip:   7.04 kB[22m
[2mdist/[22m[2massets/[22m[36mFeverSync-CWxz54vU.js                            [39m[1m[2m   44.82 kB[22m[1m[22m[2m │ gzip:   8.35 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarim-CJDUd9IA.js                              [39m[1m[2m   45.03 kB[22m[1m[22m[2m │ gzip:   7.34 kB[22m
[2mdist/[22m[2massets/[22m[36mSecurityDashboard-CVURS23j.js                    [39m[1m[2m   45.68 kB[22m[1m[22m[2m │ gzip:   6.86 kB[22m
[2mdist/[22m[2massets/[22m[36mStandaloneInvoiceScanner-vmKSN5aj.js             [39m[1m[2m   45.86 kB[22m[1m[22m[2m │ gzip:  11.17 kB[22m
[2mdist/[22m[2massets/[22m[36msortable.esm-CvbFPBOB.js                         [39m[1m[2m   45.88 kB[22m[1m[22m[2m │ gzip:  15.28 kB[22m
[2mdist/[22m[2massets/[22m[36mEquipaView-BbeNO35J.js                           [39m[1m[2m   46.71 kB[22m[1m[22m[2m │ gzip:   8.12 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBPTransactionsPage-C2E6xU2n.js             [39m[1m[2m   46.79 kB[22m[1m[22m[2m │ gzip:   8.87 kB[22m
[2mdist/[22m[2massets/[22m[36mDatabaseBackups-psOycoKh.js                      [39m[1m[2m   50.10 kB[22m[1m[22m[2m │ gzip:   8.60 kB[22m
[2mdist/[22m[2massets/[22m[36mEventSimulatorDemo-Cx8U2EXT.js                   [39m[1m[2m   50.13 kB[22m[1m[22m[2m │ gzip:   6.32 kB[22m
[2mdist/[22m[2massets/[22m[36mZonasList-BC4BR3YQ.js                            [39m[1m[2m   50.18 kB[22m[1m[22m[2m │ gzip:  10.03 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaDetail-Y78V33ky.js                          [39m[1m[2m   50.18 kB[22m[1m[22m[2m │ gzip:   9.08 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyRedesign-KZadipTX.js                     [39m[1m[2m   51.97 kB[22m[1m[22m[2m │ gzip:   8.06 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPLPage-C1_WVxE-.js                         [39m[1m[2m   51.99 kB[22m[1m[22m[2m │ gzip:  10.34 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBankStatementPage-Bj7i1Ucy.js              [39m[1m[2m   52.39 kB[22m[1m[22m[2m │ gzip:  10.21 kB[22m
[2mdist/[22m[2massets/[22m[36mCreativeView-BOozX_cp.js                         [39m[1m[2m   52.46 kB[22m[1m[22m[2m │ gzip:   8.05 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceGoogleAds-T-0pXJ7u.js                    [39m[1m[2m   55.40 kB[22m[1m[22m[2m │ gzip:  10.01 kB[22m
[2mdist/[22m[2massets/[22m[36mReimbursements-CK8VVzau.js                       [39m[1m[2m   59.24 kB[22m[1m[22m[2m │ gzip:  11.25 kB[22m
[2mdist/[22m[2massets/[22m[36mRegistroFeed-DtUrP8J2.js                         [39m[1m[2m   64.66 kB[22m[1m[22m[2m │ gzip:  10.92 kB[22m
[2mdist/[22m[2massets/[22m[36mAdsInvoices-xX0r_jy7.js                          [39m[1m[2m   66.19 kB[22m[1m[22m[2m │ gzip:  11.67 kB[22m
[2mdist/[22m[2massets/[22m[36mEvents-B-oL5rnI.js                               [39m[1m[2m   66.94 kB[22m[1m[22m[2m │ gzip:  11.96 kB[22m
[2mdist/[22m[2massets/[22m[36mReportTicketOfficeAuditPage-DKwadFic.js          [39m[1m[2m   68.23 kB[22m[1m[22m[2m │ gzip:  11.49 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimItemAttachmentButton-BLDyKYTk.js          [39m[1m[2m   68.60 kB[22m[1m[22m[2m │ gzip:  15.76 kB[22m
[2mdist/[22m[2massets/[22m[36mEventCalendar-CuogtGWL.js                        [39m[1m[2m   68.83 kB[22m[1m[22m[2m │ gzip:  11.72 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBIEvent-BWKbctRj.js                         [39m[1m[2m   69.09 kB[22m[1m[22m[2m │ gzip:  12.37 kB[22m
[2mdist/[22m[2massets/[22m[36mManualSync-96ZS1Y2d.js                           [39m[1m[2m   69.21 kB[22m[1m[22m[2m │ gzip:  22.05 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOfficeSettlementModal-C8lzA4e9.js          [39m[1m[2m   74.74 kB[22m[1m[22m[2m │ gzip:  13.44 kB[22m
[2mdist/[22m[2massets/[22m[36mSuppliers-C9DaAoqn.js                            [39m[1m[2m   77.35 kB[22m[1m[22m[2m │ gzip:  12.18 kB[22m
[2mdist/[22m[2massets/[22m[36minstallment-guard-BYr2Fb7M.js                    [39m[1m[2m   81.95 kB[22m[1m[22m[2m │ gzip:  15.14 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantHome-BJ5e6spN.js                       [39m[1m[2m   83.54 kB[22m[1m[22m[2m │ gzip:  13.08 kB[22m
[2mdist/[22m[2massets/[22m[36mEventHub-Bbe39VRL.js                             [39m[1m[2m   83.99 kB[22m[1m[22m[2m │ gzip:  13.87 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierFormModal-DbM1nqBW.js                    [39m[1m[2m   85.17 kB[22m[1m[22m[2m │ gzip:  18.65 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencePrint-BikYBEhr.js                        [39m[1m[2m   86.16 kB[22m[1m[22m[2m │ gzip:  10.99 kB[22m
[2mdist/[22m[2massets/[22m[36mCoalaSync-C81AgSWl.js                            [39m[1m[2m   86.24 kB[22m[1m[22m[2m │ gzip:  15.07 kB[22m
[2mdist/[22m[2massets/[22m[36mAuditoriaContas-HC5V-jom.js                      [39m[1m[2m   90.95 kB[22m[1m[22m[2m │ gzip:  16.82 kB[22m
[2mdist/[22m[2massets/[22m[36mjszip.min-CnBbpjIO.js                            [39m[1m[2m   97.24 kB[22m[1m[22m[2m │ gzip:  30.05 kB[22m
[2mdist/[22m[2massets/[22m[36mFinancialAccounts-hUYgYlOG.js                    [39m[1m[2m  115.29 kB[22m[1m[22m[2m │ gzip:  18.14 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyView-Bd2faDMs.js                         [39m[1m[2m  120.56 kB[22m[1m[22m[2m │ gzip:  18.84 kB[22m
[2mdist/[22m[2massets/[22m[36mEventMarketingEditor-Dlaofm6u.js                 [39m[1m[2m  123.43 kB[22m[1m[22m[2m │ gzip:  18.16 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimSessionDetail-BSi38N8v.js                 [39m[1m[2m  130.83 kB[22m[1m[22m[2m │ gzip:  23.40 kB[22m
[2mdist/[22m[2massets/[22m[36mBankReconciliation-BoDtGa5k.js                   [39m[1m[2m  133.28 kB[22m[1m[22m[2m │ gzip:  26.72 kB[22m
[2mdist/[22m[2massets/[22m[36mCardSessionDetail-Di1fGMiS.js                    [39m[1m[2m  145.97 kB[22m[1m[22m[2m │ gzip:  27.40 kB[22m
[2mdist/[22m[2massets/[22m[36mNewgangSite-BLWYm8-1.js                          [39m[1m[2m  149.58 kB[22m[1m[22m[2m │ gzip:  26.57 kB[22m
[2mdist/[22m[2massets/[22m[36mindex.es-DmsDyuHC.js                             [39m[1m[2m  150.74 kB[22m[1m[22m[2m │ gzip:  51.38 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPaymentListsPage-DV_BDTtU.js               [39m[1m[2m  197.96 kB[22m[1m[22m[2m │ gzip:  39.38 kB[22m
[2mdist/[22m[2massets/[22m[36mticket-office-settlement-form-CP3AEpSm.js        [39m[1m[2m  198.37 kB[22m[1m[22m[2m │ gzip:  40.64 kB[22m
[2mdist/[22m[2massets/[22m[36mhtml2canvas.esm-CBrSDip1.js                      [39m[1m[2m  201.42 kB[22m[1m[22m[2m │ gzip:  47.70 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-supabase-3MT7AzyV.js                      [39m[1m[2m  209.56 kB[22m[1m[22m[2m │ gzip:  54.23 kB[22m
[2mdist/[22m[2massets/[22m[36mEventImplementationDetail-CEIBua7B.js            [39m[1m[2m  221.68 kB[22m[1m[22m[2m │ gzip:  36.25 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaigns-BBcSrFOS.js                            [39m[1m[2m  240.17 kB[22m[1m[22m[2m │ gzip:  42.60 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactions-Dpjox4Eb.js                         [39m[1m[2m  257.85 kB[22m[1m[22m[2m │ gzip:  46.56 kB[22m
[2mdist/[22m[2massets/[22m[36mEventSimulator-CZnrciQA.js                       [39m[1m[2m  282.42 kB[22m[1m[22m[2m │ gzip:  46.20 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOffices-B7zBVd4l.js                        [39m[1m[2m  313.16 kB[22m[1m[22m[2m │ gzip:  53.14 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactionEditModal-CYnsom_l.js                 [39m[1m[2m  341.61 kB[22m[1m[22m[2m │ gzip:  59.47 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-pdf-Cg0OIXZi.js                           [39m[1m[2m  421.80 kB[22m[1m[22m[2m │ gzip: 137.18 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaignView-WDYZkC1i.js                         [39m[1m[2m  431.44 kB[22m[1m[22m[2m │ gzip:  72.67 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-react-KQt1rZym.js                         [39m[1m[2m  438.02 kB[22m[1m[22m[2m │ gzip: 134.70 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-charts-CvYs9c1O.js                        [39m[1m[2m  448.41 kB[22m[1m[22m[2m │ gzip: 119.60 kB[22m
[2mdist/[22m[2massets/[22m[36mpdf-first-page-to-jpeg-M5CLsCvW.js               [39m[1m[2m  458.53 kB[22m[1m[22m[2m │ gzip: 135.85 kB[22m
[2mdist/[22m[2massets/[22m[36mEventForecast-CDWPM-_2.js                        [39m[1m[33m  736.67 kB[39m[22m[2m │ gzip: 128.49 kB[22m
[2mdist/[22m[2massets/[22m[36mEventDetail-C2Qh5RGv.js                          [39m[1m[33m1,064.54 kB[39m[22m[2m │ gzip: 184.26 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-ui-DC4k8uTt.js                            [39m[1m[33m1,068.27 kB[39m[22m[2m │ gzip: 220.41 kB[22m
[2mdist/[22m[2massets/[22m[36mindex-Bp870MZB.js                                [39m[1m[33m1,190.35 kB[39m[22m[2m │ gzip: 265.00 kB[22m
[2mdist/[22m[2massets/[22m[36mheic2any-BcfgmVBS.js                             [39m[1m[33m1,352.85 kB[39m[22m[2m │ gzip: 341.38 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-xlsx-CIt_8dee.js                          [39m[1m[33m1,369.76 kB[39m[22m[2m │ gzip: 412.26 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-handsontable-CE0eIcQY.js                  [39m[1m[33m1,918.23 kB[39m[22m[2m │ gzip: 457.52 kB[22m
[2mdist/[22m[2massets/[22m[36mheic-to-lXPrQE7P.js                              [39m[1m[33m2,995.46 kB[39m[22m[2m │ gzip: 736.99 kB[22m
[33m
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
[32m✓ built in 55.56s[39m

PWA v1.3.0
mode      generateSW
precache  343 entries (24052.63 KiB)
files generated
  dist/sw.js
  dist/workbox-52dea471.js

EXIT: 0

```

## build-final.log

```text
COMMAND: /dev-server/node_modules/.bin/vite build
[36mvite v5.4.19 [32mbuilding for production...[36m[39m
transforming...
Browserslist: browsers data (caniuse-lite) is 7 months old. Please run:
  npx update-browserslist-db@latest
  Why you should do it regularly: https://github.com/browserslist/update-db#readme
[32m✓[39m 6218 modules transformed.
rendering chunks...
[1m[33m[plugin:vite:reporter][39m[22m [33m[plugin vite:reporter] 
(!) /tmp/issue333-integrated/tree/src/lib/storage.ts is dynamically imported by /tmp/issue333-integrated/tree/src/contexts/AuthContext.tsx, /tmp/issue333-integrated/tree/src/contexts/AuthContext.tsx, /tmp/issue333-integrated/tree/src/hooks/useCompany.ts but also statically imported by /tmp/issue333-integrated/tree/src/components/BPNotesAttachmentsModal.tsx, /tmp/issue333-integrated/tree/src/components/CacheExtrasPanel.tsx, /tmp/issue333-integrated/tree/src/components/EntityDocumentsSection.tsx, /tmp/issue333-integrated/tree/src/components/EventABAttachmentsSection.tsx, /tmp/issue333-integrated/tree/src/components/EventClosingCosts.tsx, /tmp/issue333-integrated/tree/src/components/EventForecast.tsx, /tmp/issue333-integrated/tree/src/components/PartnerExtrasPanel.tsx, /tmp/issue333-integrated/tree/src/components/PaymentListReceipts.tsx, /tmp/issue333-integrated/tree/src/components/SupplierCreditsPanel.tsx, /tmp/issue333-integrated/tree/src/components/TicketOfficeSettlementModal.tsx, /tmp/issue333-integrated/tree/src/components/TransactionDocumentsModal.tsx, /tmp/issue333-integrated/tree/src/components/TransactionFormModal.tsx, /tmp/issue333-integrated/tree/src/components/bank/BankLineDocumentsDialog.tsx, /tmp/issue333-integrated/tree/src/components/camarim/CamarimItemAttachmentButton.tsx, /tmp/issue333-integrated/tree/src/components/camarim/CamarimItemModal.tsx, /tmp/issue333-integrated/tree/src/components/cards/NewCardExpenseModal.tsx, /tmp/issue333-integrated/tree/src/components/supplier-credits/NewSupplierCreditModal.tsx, /tmp/issue333-integrated/tree/src/components/supplier-credits/SupplierCreditsTab.tsx, /tmp/issue333-integrated/tree/src/pages/BankReconciliation.tsx, /tmp/issue333-integrated/tree/src/pages/EventImplementations.tsx, /tmp/issue333-integrated/tree/src/pages/PartnerEventDetail.tsx, /tmp/issue333-integrated/tree/src/pages/StandaloneInvoiceScanner.tsx, /tmp/issue333-integrated/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx, dynamic import will not move module into another chunk.
[39m
[bundle] inicial estático: 5131242 bytes
computing gzip size...
[2mdist/[22m[32mmanifest.webmanifest                                    [39m[1m[2m    0.47 kB[22m[1m[22m
[2mdist/[22m[32mindex.html                                              [39m[1m[2m    3.95 kB[22m[1m[22m[2m │ gzip:   1.29 kB[22m
[2mdist/[22m[2massets/[22m[32mlogo-horizontal-mvVEptKs.png                     [39m[1m[2m   45.85 kB[22m[1m[22m
[2mdist/[22m[32mbundle-report.json                                      [39m[1m[2m  810.14 kB[22m[1m[22m[2m │ gzip:  76.42 kB[22m
[2mdist/[22m[2massets/[22m[32mtransaction-lifecycle-DuCcaQBZ.jpg               [39m[1m[2m1,175.46 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32mevent-lifecycle-CvV3N1nA.jpg                     [39m[1m[2m1,221.66 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32mpdf.worker.min-iDqQPrd3.mjs                      [39m[1m[2m1,232.30 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32muser-roles-CevPcr3I.jpg                          [39m[1m[2m1,241.98 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32maccounts-flow-BVCUzNuB.jpg                       [39m[1m[2m1,252.59 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32mbp-workflow-EJGerC2n.jpg                         [39m[1m[2m1,332.07 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[35mStrategyPrint-CymDZpv5.css                       [39m[1m[2m    3.64 kB[22m[1m[22m[2m │ gzip:   1.24 kB[22m
[2mdist/[22m[2massets/[22m[35mAudiencePrint-CdEbyEIQ.css                       [39m[1m[2m    5.16 kB[22m[1m[22m[2m │ gzip:   1.48 kB[22m
[2mdist/[22m[2massets/[22m[35mindex-CUszSXa7.css                               [39m[1m[2m  171.29 kB[22m[1m[22m[2m │ gzip:  27.24 kB[22m
[2mdist/[22m[2massets/[22m[35mvendor-handsontable-8wq-FOPh.css                 [39m[1m[2m  182.11 kB[22m[1m[22m[2m │ gzip:  21.62 kB[22m
[2mdist/[22m[2massets/[22m[36msubDays-BR8n3PdH.js                              [39m[1m[2m    0.09 kB[22m[1m[22m[2m │ gzip:   0.10 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInMilliseconds-LLbDEX0K.js             [39m[1m[2m    0.12 kB[22m[1m[22m[2m │ gzip:   0.13 kB[22m
[2mdist/[22m[2massets/[22m[36moperacao-labels-Cq-Qt5BS.js                      [39m[1m[2m    0.13 kB[22m[1m[22m[2m │ gzip:   0.12 kB[22m
[2mdist/[22m[2massets/[22m[36museDisplayCurrency-5GTFLWv6.js                   [39m[1m[2m    0.15 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
[2mdist/[22m[2massets/[22m[36mstartOfMonth-CKCw-RWI.js                         [39m[1m[2m    0.15 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
[2mdist/[22m[2massets/[22m[36mconstants-uO0lGu32.js                            [39m[1m[2m    0.16 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-category-constraint-B8MCXqQh.js               [39m[1m[2m    0.19 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInCalendarMonths-B7vAcVWO.js           [39m[1m[2m    0.19 kB[22m[1m[22m[2m │ gzip:   0.17 kB[22m
[2mdist/[22m[2massets/[22m[36mendOfMonth-Bz2Gx-N-.js                           [39m[1m[2m    0.20 kB[22m[1m[22m[2m │ gzip:   0.18 kB[22m
[2mdist/[22m[2massets/[22m[36museDebouncedValue-BRJMxObC.js                    [39m[1m[2m    0.20 kB[22m[1m[22m[2m │ gzip:   0.17 kB[22m
[2mdist/[22m[2massets/[22m[36mpdf-text-CRO-dKNy.js                             [39m[1m[2m    0.20 kB[22m[1m[22m[2m │ gzip:   0.17 kB[22m
[2mdist/[22m[2massets/[22m[36maddDays-CklYSQT6.js                              [39m[1m[2m    0.21 kB[22m[1m[22m[2m │ gzip:   0.19 kB[22m
[2mdist/[22m[2massets/[22m[36mcountry-BQyONak0.js                              [39m[1m[2m    0.23 kB[22m[1m[22m[2m │ gzip:   0.19 kB[22m
[2mdist/[22m[2massets/[22m[36mslug-Bzks-5QT.js                                 [39m[1m[2m    0.23 kB[22m[1m[22m[2m │ gzip:   0.19 kB[22m
[2mdist/[22m[2massets/[22m[36mrateio-children-CukInAMc.js                      [39m[1m[2m    0.24 kB[22m[1m[22m[2m │ gzip:   0.16 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInCalendarDays-CZO_y_Bc.js             [39m[1m[2m    0.24 kB[22m[1m[22m[2m │ gzip:   0.20 kB[22m
[2mdist/[22m[2massets/[22m[36mmust-write-D6vQQ_6o.js                           [39m[1m[2m    0.28 kB[22m[1m[22m[2m │ gzip:   0.23 kB[22m
[2mdist/[22m[2massets/[22m[36meachDayOfInterval-BuSrMpJD.js                    [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.23 kB[22m
[2mdist/[22m[2massets/[22m[36mbackdropClose-B6S94Cw7.js                        [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.21 kB[22m
[2mdist/[22m[2massets/[22m[36mrelativeTime-CufnskKF.js                         [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.22 kB[22m
[2mdist/[22m[2massets/[22m[36mskeleton-D6IxvqIg.js                             [39m[1m[2m    0.33 kB[22m[1m[22m[2m │ gzip:   0.27 kB[22m
[2mdist/[22m[2massets/[22m[36maddMonths-Dsh0EBap.js                            [39m[1m[2m    0.35 kB[22m[1m[22m[2m │ gzip:   0.25 kB[22m
[2mdist/[22m[2massets/[22m[36mstrategy-status-if_xUdsk.js                      [39m[1m[2m    0.41 kB[22m[1m[22m[2m │ gzip:   0.24 kB[22m
[2mdist/[22m[2massets/[22m[36mform-enter-guard-TC9TB5Pp.js                     [39m[1m[2m    0.43 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36mtraction-C6TeXKI5.js                             [39m[1m[2m    0.45 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
[2mdist/[22m[2massets/[22m[36mstring-similarity-B7WDu-Mk.js                    [39m[1m[2m    0.45 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
[2mdist/[22m[2massets/[22m[36moverlay-layer-VIcJ2qbc.js                        [39m[1m[2m    0.50 kB[22m[1m[22m[2m │ gzip:   0.36 kB[22m
[2mdist/[22m[2massets/[22m[36mcreative-media-DKNTK8AD.js                       [39m[1m[2m    0.50 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
[2mdist/[22m[2massets/[22m[36mseparator-Btq8KMu7.js                            [39m[1m[2m    0.53 kB[22m[1m[22m[2m │ gzip:   0.36 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInDays-ChvF9Jc3.js                     [39m[1m[2m    0.54 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36mbudget-mode-u2mWzi7D.js                          [39m[1m[2m    0.56 kB[22m[1m[22m[2m │ gzip:   0.40 kB[22m
[2mdist/[22m[2massets/[22m[36museMyLeadFrenteIds-D6KozVhd.js                   [39m[1m[2m    0.56 kB[22m[1m[22m[2m │ gzip:   0.38 kB[22m
[2mdist/[22m[2massets/[22m[36mgetTimezoneOffsetInMilliseconds-CEhzTjz1.js      [39m[1m[2m    0.58 kB[22m[1m[22m[2m │ gzip:   0.34 kB[22m
[2mdist/[22m[2massets/[22m[36maudience-pdf-RQfvkLkz.js                         [39m[1m[2m    0.64 kB[22m[1m[22m[2m │ gzip:   0.41 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-nature-BSQ-ezBD.js                         [39m[1m[2m    0.78 kB[22m[1m[22m[2m │ gzip:   0.45 kB[22m
[2mdist/[22m[2massets/[22m[36museRealtimeInvalidation-qXjp_zQk.js              [39m[1m[2m    0.78 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m
[2mdist/[22m[2massets/[22m[36mIbanWarning-CPdWIX-y.js                          [39m[1m[2m    0.80 kB[22m[1m[22m[2m │ gzip:   0.42 kB[22m
[2mdist/[22m[2massets/[22m[36mPriorityBadge-BOa4mnva.js                        [39m[1m[2m    0.80 kB[22m[1m[22m[2m │ gzip:   0.52 kB[22m
[2mdist/[22m[2massets/[22m[36museOperacaoFilters-CTkRwTaA.js                   [39m[1m[2m    0.81 kB[22m[1m[22m[2m │ gzip:   0.49 kB[22m
[2mdist/[22m[2massets/[22m[36madmin-window-CkAIwH0n.js                         [39m[1m[2m    0.85 kB[22m[1m[22m[2m │ gzip:   0.50 kB[22m
[2mdist/[22m[2massets/[22m[36mcard-account-balance-AMZkgyLK.js                 [39m[1m[2m    0.92 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36maccount-balance-rpc-Dd9HPNBz.js                  [39m[1m[2m    0.93 kB[22m[1m[22m[2m │ gzip:   0.49 kB[22m
[2mdist/[22m[2massets/[22m[36mcircuit-account-Bd4yV5Or.js                      [39m[1m[2m    0.94 kB[22m[1m[22m[2m │ gzip:   0.58 kB[22m
[2mdist/[22m[2massets/[22m[36msupplier-credits-BJfRSeQW.js                     [39m[1m[2m    0.98 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mmoney-input-IXszAvLz.js                          [39m[1m[2m    1.01 kB[22m[1m[22m[2m │ gzip:   0.60 kB[22m
[2mdist/[22m[2massets/[22m[36mapp-badge-CUFGCSpm.js                            [39m[1m[2m    1.04 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m
[2mdist/[22m[2massets/[22m[36mavatar-Bvoomywt.js                               [39m[1m[2m    1.04 kB[22m[1m[22m[2m │ gzip:   0.43 kB[22m
[2mdist/[22m[2massets/[22m[36mbank-link-date-DcRav5qG.js                       [39m[1m[2m    1.05 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36mStaffList-_cWtsiP6.js                            [39m[1m[2m    1.18 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36mPhaseBadge-BysMpkHj.js                           [39m[1m[2m    1.19 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m
[2mdist/[22m[2massets/[22m[36mzone-capacities-xDn32blY.js                      [39m[1m[2m    1.22 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mIvaRateSelect-BeS-nUaH.js                        [39m[1m[2m    1.23 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
[2mdist/[22m[2massets/[22m[36mcard-session-helpers-CgtrYG4G.js                 [39m[1m[2m    1.31 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m
[2mdist/[22m[2massets/[22m[36malert-CRjboeST.js                                [39m[1m[2m    1.31 kB[22m[1m[22m[2m │ gzip:   0.59 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoStatusBadge-BlKzYrN7.js                  [39m[1m[2m    1.35 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
[2mdist/[22m[2massets/[22m[36maccount-balance-DDi5Fzq6.js                      [39m[1m[2m    1.36 kB[22m[1m[22m[2m │ gzip:   0.69 kB[22m
[2mdist/[22m[2massets/[22m[36mcurrency-DvXZV_Ot.js                             [39m[1m[2m    1.43 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36maccountant-reviews-hKRlLfQ9.js                   [39m[1m[2m    1.46 kB[22m[1m[22m[2m │ gzip:   0.60 kB[22m
[2mdist/[22m[2massets/[22m[36msupplier-bank-D2XCfuD0.js                        [39m[1m[2m    1.51 kB[22m[1m[22m[2m │ gzip:   0.70 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-line-relink-C_YnqKaK.js                       [39m[1m[2m    1.52 kB[22m[1m[22m[2m │ gzip:   0.58 kB[22m
[2mdist/[22m[2massets/[22m[36mscroll-area-dDN_IPN6.js                          [39m[1m[2m    1.61 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mReportArtistCachePage-B0d4vv_1.js                [39m[1m[2m    1.65 kB[22m[1m[22m[2m │ gzip:   0.63 kB[22m
[2mdist/[22m[2massets/[22m[36mcapital-branch-CJwzxRyH.js                       [39m[1m[2m    1.67 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36mebitda-9YglU7HX.js                               [39m[1m[2m    1.74 kB[22m[1m[22m[2m │ gzip:   0.76 kB[22m
[2mdist/[22m[2massets/[22m[36mcamarim-helpers-M1Vn5iD-.js                      [39m[1m[2m    1.76 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36maccordion-CCsYICy9.js                            [39m[1m[2m    1.76 kB[22m[1m[22m[2m │ gzip:   0.64 kB[22m
[2mdist/[22m[2massets/[22m[36miban-BYOybSCJ.js                                 [39m[1m[2m    1.79 kB[22m[1m[22m[2m │ gzip:   0.95 kB[22m
[2mdist/[22m[2massets/[22m[36minvoice-ocr-prepare-CcJft9v3.js                  [39m[1m[2m    1.85 kB[22m[1m[22m[2m │ gzip:   1.02 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-line-required-meA-AobX.js                     [39m[1m[2m    1.88 kB[22m[1m[22m[2m │ gzip:   0.76 kB[22m
[2mdist/[22m[2massets/[22m[36mEventNatureFilter-BlJilMEB.js                    [39m[1m[2m    1.88 kB[22m[1m[22m[2m │ gzip:   0.73 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountingExportPage-CRWRs3x9.js           [39m[1m[2m    1.95 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDocumentPendenciesPage-BeMPfG_y.js         [39m[1m[2m    1.97 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36mtoggle-group-BWYQ2XhB.js                         [39m[1m[2m    1.99 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36mdashboard-format-GnqOyAs1.js                     [39m[1m[2m    2.00 kB[22m[1m[22m[2m │ gzip:   0.92 kB[22m
[2mdist/[22m[2massets/[22m[36msettlement-participants-Bmq-_-TA.js              [39m[1m[2m    2.01 kB[22m[1m[22m[2m │ gzip:   0.79 kB[22m
[2mdist/[22m[2massets/[22m[36mMirrorAporteNotice-BkNn2ywE.js                   [39m[1m[2m    2.04 kB[22m[1m[22m[2m │ gzip:   0.90 kB[22m
[2mdist/[22m[2massets/[22m[36mFeatureNotEnabledCard-D2XyRUeW.js                [39m[1m[2m    2.05 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-ab-calc-BxWHlvfV.js                        [39m[1m[2m    2.10 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteLeadsAvatars-CibOj2j_.js                   [39m[1m[2m    2.20 kB[22m[1m[22m[2m │ gzip:   0.86 kB[22m
[2mdist/[22m[2massets/[22m[36mticket-office-reconciliation-DnU_gZbO.js         [39m[1m[2m    2.25 kB[22m[1m[22m[2m │ gzip:   1.05 kB[22m
[2mdist/[22m[2massets/[22m[36museUserPreferences-5M_R-cff.js                   [39m[1m[2m    2.30 kB[22m[1m[22m[2m │ gzip:   0.70 kB[22m
[2mdist/[22m[2massets/[22m[36mformatDistanceToNow-CgGNwkFO.js                  [39m[1m[2m    2.32 kB[22m[1m[22m[2m │ gzip:   0.98 kB[22m
[2mdist/[22m[2massets/[22m[36mpartner-extras-DaAcPIXW.js                       [39m[1m[2m    2.32 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-tx-matching-BHd1Ixbn.js                       [39m[1m[2m    2.38 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36museEventIvaRates-BpFfGPGn.js                     [39m[1m[2m    2.64 kB[22m[1m[22m[2m │ gzip:   1.14 kB[22m
[2mdist/[22m[2massets/[22m[36mparseISO-Cr0H38in.js                             [39m[1m[2m    2.70 kB[22m[1m[22m[2m │ gzip:   1.19 kB[22m
[2mdist/[22m[2massets/[22m[36mReportCostSourceToggle-Cp1A0OZ6.js               [39m[1m[2m    2.88 kB[22m[1m[22m[2m │ gzip:   1.06 kB[22m
[2mdist/[22m[2massets/[22m[36m_LegalLayout-DPRxrbWD.js                         [39m[1m[2m    2.95 kB[22m[1m[22m[2m │ gzip:   0.68 kB[22m
[2mdist/[22m[2massets/[22m[36mdate-picker-l2TGauGj.js                          [39m[1m[2m    3.25 kB[22m[1m[22m[2m │ gzip:   1.24 kB[22m
[2mdist/[22m[2massets/[22m[36mreal-cache-calc-nEbvT0CW.js                      [39m[1m[2m    3.25 kB[22m[1m[22m[2m │ gzip:   1.47 kB[22m
[2mdist/[22m[2massets/[22m[36mAcceptInvite-DW0GoIFt.js                         [39m[1m[2m    3.74 kB[22m[1m[22m[2m │ gzip:   1.16 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaAssigneeAvatars-CzCKC00k.js                 [39m[1m[2m    3.76 kB[22m[1m[22m[2m │ gzip:   0.99 kB[22m
[2mdist/[22m[2massets/[22m[36mAdAccounts-Cr2_-nua.js                           [39m[1m[2m    3.80 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36mNewStaffDialog-CDS5IWGn.js                       [39m[1m[2m    4.29 kB[22m[1m[22m[2m │ gzip:   1.19 kB[22m
[2mdist/[22m[2massets/[22m[36mStatCard-DMYYsXxc.js                             [39m[1m[2m    4.30 kB[22m[1m[22m[2m │ gzip:   1.05 kB[22m
[2mdist/[22m[2massets/[22m[36mcache-tab-total-Dp22RUVA.js                      [39m[1m[2m    4.35 kB[22m[1m[22m[2m │ gzip:   1.67 kB[22m
[2mdist/[22m[2massets/[22m[36mcsv-export-Bp8nlkXR.js                           [39m[1m[2m    4.39 kB[22m[1m[22m[2m │ gzip:   1.57 kB[22m
[2mdist/[22m[2massets/[22m[36mImageUploader-KMOi_yPk.js                        [39m[1m[2m    4.60 kB[22m[1m[22m[2m │ gzip:   1.48 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceNew-Dhja5vSo.js                          [39m[1m[2m    4.71 kB[22m[1m[22m[2m │ gzip:   1.25 kB[22m
[2mdist/[22m[2massets/[22m[36museScenarioForecasts-CpT9vzyD.js                 [39m[1m[2m    4.72 kB[22m[1m[22m[2m │ gzip:   1.43 kB[22m
[2mdist/[22m[2massets/[22m[36mexport-ticket-office-settlement-pdf-B9nCnYRZ.js  [39m[1m[2m    5.00 kB[22m[1m[22m[2m │ gzip:   2.28 kB[22m
[2mdist/[22m[2massets/[22m[36mMeusChamados-D2iw70Sv.js                         [39m[1m[2m    5.16 kB[22m[1m[22m[2m │ gzip:   1.55 kB[22m
[2mdist/[22m[2massets/[22m[36mUserSettings-Dg0W_HSv.js                         [39m[1m[2m    5.35 kB[22m[1m[22m[2m │ gzip:   1.66 kB[22m
[2mdist/[22m[2massets/[22m[36minvoice-group-BgcX563Z.js                        [39m[1m[2m    5.43 kB[22m[1m[22m[2m │ gzip:   1.76 kB[22m
[2mdist/[22m[2massets/[22m[36mSimilarSuppliersNotice-DPxe5XYT.js               [39m[1m[2m    5.56 kB[22m[1m[22m[2m │ gzip:   1.83 kB[22m
[2mdist/[22m[2massets/[22m[36mpt-BR-Dh5EWHbw.js                                [39m[1m[2m    5.85 kB[22m[1m[22m[2m │ gzip:   2.10 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierBankDetails-CgQn9nM9.js                  [39m[1m[2m    5.91 kB[22m[1m[22m[2m │ gzip:   1.19 kB[22m
[2mdist/[22m[2massets/[22m[36mpt-B3dxR9FF.js                                   [39m[1m[2m    5.97 kB[22m[1m[22m[2m │ gzip:   2.02 kB[22m
[2mdist/[22m[2massets/[22m[36mparse-ticketline-zone-xlsx-BcBXDVLy.js           [39m[1m[2m    6.86 kB[22m[1m[22m[2m │ gzip:   2.59 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoHome-BObK21PY.js                         [39m[1m[2m    6.87 kB[22m[1m[22m[2m │ gzip:   1.91 kB[22m
[2mdist/[22m[2massets/[22m[36mchart-DAlwhjrQ.js                                [39m[1m[2m    7.10 kB[22m[1m[22m[2m │ gzip:   2.18 kB[22m
[2mdist/[22m[2massets/[22m[36men-US-CpWK9ySR.js                                [39m[1m[2m    7.19 kB[22m[1m[22m[2m │ gzip:   2.47 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadoNovo-DAe7SC7-.js                          [39m[1m[2m    7.19 kB[22m[1m[22m[2m │ gzip:   1.83 kB[22m
[2mdist/[22m[2massets/[22m[36mMinhasTarefas-D2WqaeVf.js                        [39m[1m[2m    7.49 kB[22m[1m[22m[2m │ gzip:   2.15 kB[22m
[2mdist/[22m[2massets/[22m[36museBPVersions-DOCoNlvM.js                        [39m[1m[2m    7.53 kB[22m[1m[22m[2m │ gzip:   1.77 kB[22m
[2mdist/[22m[2massets/[22m[36mDiagnosisTest-Dh2XyCkj.js                        [39m[1m[2m    7.66 kB[22m[1m[22m[2m │ gzip:   1.57 kB[22m
[2mdist/[22m[2massets/[22m[36mIbanDuplicates-CoklJDcA.js                       [39m[1m[2m    7.82 kB[22m[1m[22m[2m │ gzip:   2.03 kB[22m
[2mdist/[22m[2massets/[22m[36mFrentesPanel-BN1BTeMm.js                         [39m[1m[2m    7.97 kB[22m[1m[22m[2m │ gzip:   2.06 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSalesComparisonPage-BXV2HRvm.js            [39m[1m[2m    8.08 kB[22m[1m[22m[2m │ gzip:   2.15 kB[22m
[2mdist/[22m[2massets/[22m[36mSimilarSuppliersReview-CvIKvVtw.js               [39m[1m[2m    8.16 kB[22m[1m[22m[2m │ gzip:   1.98 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-format-CNTEF_TT.js                         [39m[1m[2m    8.26 kB[22m[1m[22m[2m │ gzip:   2.51 kB[22m
[2mdist/[22m[2massets/[22m[36mAtividade-CxVvWwXo.js                            [39m[1m[2m    8.28 kB[22m[1m[22m[2m │ gzip:   2.32 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoListShell-DzIZTBHY.js                    [39m[1m[2m    8.57 kB[22m[1m[22m[2m │ gzip:   2.21 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSalesCurvePage-CXpBTAXb.js                 [39m[1m[2m    8.57 kB[22m[1m[22m[2m │ gzip:   2.13 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategies-DAMJOpdz.js                           [39m[1m[2m    8.79 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mUploadCoalaFotos-DjsPAECM.js                     [39m[1m[2m    8.82 kB[22m[1m[22m[2m │ gzip:   2.10 kB[22m
[2mdist/[22m[2massets/[22m[36mFieldStaffSection-BmWzdE_-.js                    [39m[1m[2m    9.28 kB[22m[1m[22m[2m │ gzip:   2.13 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAgingPage-DYaETKJV.js                      [39m[1m[2m    9.29 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mimport-pl-xlsx-GPlEycpy.js                       [39m[1m[2m    9.39 kB[22m[1m[22m[2m │ gzip:   4.03 kB[22m
[2mdist/[22m[2massets/[22m[36mFundHolderPicker-CFOgubQG.js                     [39m[1m[2m    9.47 kB[22m[1m[22m[2m │ gzip:   1.96 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountCategoriesPage-DSZTVBKy.js          [39m[1m[2m    9.48 kB[22m[1m[22m[2m │ gzip:   2.17 kB[22m
[2mdist/[22m[2massets/[22m[36mReportRevenueMixPage-D5cTxRa6.js                 [39m[1m[2m    9.81 kB[22m[1m[22m[2m │ gzip:   2.15 kB[22m
[2mdist/[22m[2massets/[22m[36mReportMonthlyEvolutionPage-C9i7w7pO.js           [39m[1m[2m   10.06 kB[22m[1m[22m[2m │ gzip:   2.11 kB[22m
[2mdist/[22m[2massets/[22m[36museEventABScenarios-DeS5sz5-.js                  [39m[1m[2m   10.09 kB[22m[1m[22m[2m │ gzip:   3.72 kB[22m
[2mdist/[22m[2massets/[22m[36mBankLineDocumentsDialog-C20iTmJn.js              [39m[1m[2m   10.13 kB[22m[1m[22m[2m │ gzip:   2.73 kB[22m
[2mdist/[22m[2massets/[22m[36mAuditDownloads-Bbt0ih_6.js                       [39m[1m[2m   10.38 kB[22m[1m[22m[2m │ gzip:   2.18 kB[22m
[2mdist/[22m[2massets/[22m[36mReportOccupancyRatePage-CF8B9jRF.js              [39m[1m[2m   10.43 kB[22m[1m[22m[2m │ gzip:   2.30 kB[22m
[2mdist/[22m[2massets/[22m[36mCreatives-CmaUFQ88.js                            [39m[1m[2m   10.74 kB[22m[1m[22m[2m │ gzip:   2.37 kB[22m
[2mdist/[22m[2massets/[22m[36museCitySimulator-BoYf1oNJ.js                     [39m[1m[2m   10.99 kB[22m[1m[22m[2m │ gzip:   3.61 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBudgetDeviationPage-DEIXLCne.js            [39m[1m[2m   11.01 kB[22m[1m[22m[2m │ gzip:   2.56 kB[22m
[2mdist/[22m[2massets/[22m[36mReportTreasuryProjectionPage-DsStXBz0.js         [39m[1m[2m   11.05 kB[22m[1m[22m[2m │ gzip:   2.51 kB[22m
[2mdist/[22m[2massets/[22m[36mUserActivityLog-CmiejNIR.js                      [39m[1m[2m   11.08 kB[22m[1m[22m[2m │ gzip:   2.44 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSupplierConcentrationPage-BiHqfzpZ.js      [39m[1m[2m   11.33 kB[22m[1m[22m[2m │ gzip:   2.26 kB[22m
[2mdist/[22m[2massets/[22m[36mCardItemDocumentsField-C1yhHg-f.js               [39m[1m[2m   11.37 kB[22m[1m[22m[2m │ gzip:   2.98 kB[22m
[2mdist/[22m[2massets/[22m[36mManualGaps-n4wcYGGR.js                           [39m[1m[2m   11.67 kB[22m[1m[22m[2m │ gzip:   2.61 kB[22m
[2mdist/[22m[2massets/[22m[36mBlogList-HeHKPUrl.js                             [39m[1m[2m   11.68 kB[22m[1m[22m[2m │ gzip:   2.19 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSuppliersPage-Cqkut0Ci.js                  [39m[1m[2m   11.69 kB[22m[1m[22m[2m │ gzip:   2.54 kB[22m
[2mdist/[22m[2massets/[22m[36mLinkBpLineDialog-DXioSOF-.js                     [39m[1m[2m   11.70 kB[22m[1m[22m[2m │ gzip:   2.64 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadoDetail-EMqjohtt.js                        [39m[1m[2m   11.95 kB[22m[1m[22m[2m │ gzip:   2.83 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminPanel-DAoDDf9o.js                           [39m[1m[2m   12.00 kB[22m[1m[22m[2m │ gzip:   3.61 kB[22m
[2mdist/[22m[2massets/[22m[36mOnboarding-BBvS7Dd1.js                           [39m[1m[2m   12.12 kB[22m[1m[22m[2m │ gzip:   2.80 kB[22m
[2mdist/[22m[2massets/[22m[36mReportProfitabilityPage-CSNVgoJ9.js              [39m[1m[2m   12.19 kB[22m[1m[22m[2m │ gzip:   2.91 kB[22m
[2mdist/[22m[2massets/[22m[36mCrmDashboard-D82kp8AQ.js                         [39m[1m[2m   12.25 kB[22m[1m[22m[2m │ gzip:   2.95 kB[22m
[2mdist/[22m[2massets/[22m[36mGoogleAdsAdmin-BfkB77ix.js                       [39m[1m[2m   12.53 kB[22m[1m[22m[2m │ gzip:   2.42 kB[22m
[2mdist/[22m[2massets/[22m[36mPaginasList-MW27Wyll.js                          [39m[1m[2m   12.82 kB[22m[1m[22m[2m │ gzip:   2.59 kB[22m
[2mdist/[22m[2massets/[22m[36mformat-CGtoj5si.js                               [39m[1m[2m   13.04 kB[22m[1m[22m[2m │ gzip:   3.48 kB[22m
[2mdist/[22m[2massets/[22m[36mEditCampaignPopover-C80LKlGl.js                  [39m[1m[2m   13.17 kB[22m[1m[22m[2m │ gzip:   3.24 kB[22m
[2mdist/[22m[2massets/[22m[36mReminders-Xv_76i3L.js                            [39m[1m[2m   13.21 kB[22m[1m[22m[2m │ gzip:   2.90 kB[22m
[2mdist/[22m[2massets/[22m[36mSyncHealth-D6KXm9on.js                           [39m[1m[2m   13.32 kB[22m[1m[22m[2m │ gzip:   2.43 kB[22m
[2mdist/[22m[2massets/[22m[36mEndossarEventoPage-DOET7SyH.js                   [39m[1m[2m   13.53 kB[22m[1m[22m[2m │ gzip:   2.93 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPendencyIndexPage-BXWWeoqw.js              [39m[1m[2m   13.59 kB[22m[1m[22m[2m │ gzip:   2.13 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencesList-MVvYbWkL.js                        [39m[1m[2m   13.76 kB[22m[1m[22m[2m │ gzip:   2.74 kB[22m
[2mdist/[22m[2massets/[22m[36mCategoryFormModal-DMo98tSo.js                    [39m[1m[2m   13.95 kB[22m[1m[22m[2m │ gzip:   3.23 kB[22m
[2mdist/[22m[2massets/[22m[36mEndorsementEditor-CymnqTo_.js                    [39m[1m[2m   14.08 kB[22m[1m[22m[2m │ gzip:   2.75 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencePreviewCount-kfeb9Lgp.js                 [39m[1m[2m   14.18 kB[22m[1m[22m[2m │ gzip:   3.64 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceEditor-Bc0Mu-Wb.js                       [39m[1m[2m   14.50 kB[22m[1m[22m[2m │ gzip:   2.81 kB[22m
[2mdist/[22m[2massets/[22m[36mTrash-D15g_il7.js                                [39m[1m[2m   14.64 kB[22m[1m[22m[2m │ gzip:   3.12 kB[22m
[2mdist/[22m[2massets/[22m[36mNewEventoPage-Bl7EF-Ov.js                        [39m[1m[2m   14.75 kB[22m[1m[22m[2m │ gzip:   2.68 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPartnerExpensesPage-CcWpkoyD.js            [39m[1m[2m   14.80 kB[22m[1m[22m[2m │ gzip:   3.11 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadosList-Cj7ZtavI.js                         [39m[1m[2m   15.30 kB[22m[1m[22m[2m │ gzip:   4.04 kB[22m
[2mdist/[22m[2massets/[22m[36mContactDetailsSheet-C7uiylXm.js                  [39m[1m[2m   15.32 kB[22m[1m[22m[2m │ gzip:   2.67 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBI-LN0QSxpb.js                              [39m[1m[2m   15.36 kB[22m[1m[22m[2m │ gzip:   3.87 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantPendencies-ftmyJ3p1.js                 [39m[1m[2m   15.39 kB[22m[1m[22m[2m │ gzip:   3.36 kB[22m
[2mdist/[22m[2massets/[22m[36mInvoiceGroupAudit-IVsy3XGf.js                    [39m[1m[2m   15.48 kB[22m[1m[22m[2m │ gzip:   3.18 kB[22m
[2mdist/[22m[2massets/[22m[36mRlsLegacyAudit-DzIgdrFI.js                       [39m[1m[2m   15.55 kB[22m[1m[22m[2m │ gzip:   2.79 kB[22m
[2mdist/[22m[2massets/[22m[36mRaiseBudgetDialog-Cpv5WwId.js                    [39m[1m[2m   15.87 kB[22m[1m[22m[2m │ gzip:   3.47 kB[22m
[2mdist/[22m[2massets/[22m[36mEditFrenteSheet-BVP2mF9S.js                      [39m[1m[2m   15.94 kB[22m[1m[22m[2m │ gzip:   3.42 kB[22m
[2mdist/[22m[2massets/[22m[36mPaginaEditor-A2A61IT0.js                         [39m[1m[2m   16.33 kB[22m[1m[22m[2m │ gzip:   3.23 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyNew-CZJw8AJE.js                          [39m[1m[2m   16.80 kB[22m[1m[22m[2m │ gzip:   3.99 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierTransactions-DnkrxfjK.js                 [39m[1m[2m   16.87 kB[22m[1m[22m[2m │ gzip:   3.57 kB[22m
[2mdist/[22m[2massets/[22m[36mPurchaseAudienceCard-ClpfPSQT.js                 [39m[1m[2m   17.08 kB[22m[1m[22m[2m │ gzip:   3.33 kB[22m
[2mdist/[22m[2massets/[22m[36mSetup-B5i_z_If.js                                [39m[1m[2m   17.24 kB[22m[1m[22m[2m │ gzip:   4.12 kB[22m
[2mdist/[22m[2massets/[22m[36mPessoaDetail-BLfzomVW.js                         [39m[1m[2m   17.58 kB[22m[1m[22m[2m │ gzip:   3.51 kB[22m
[2mdist/[22m[2massets/[22m[36mInvariantMonitor-DQGbNgPf.js                     [39m[1m[2m   18.21 kB[22m[1m[22m[2m │ gzip:   3.33 kB[22m
[2mdist/[22m[2massets/[22m[36mibantools--sXKtUqI.js                            [39m[1m[2m   18.29 kB[22m[1m[22m[2m │ gzip:   3.82 kB[22m
[2mdist/[22m[2massets/[22m[36mClubeNewgang-D0TcFmGn.js                         [39m[1m[2m   18.45 kB[22m[1m[22m[2m │ gzip:   3.15 kB[22m
[2mdist/[22m[2massets/[22m[36mTerms-Bbctn9fQ.js                                [39m[1m[2m   18.58 kB[22m[1m[22m[2m │ gzip:   2.97 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREEmpresarialPage-mQLg6BHP.js             [39m[1m[2m   18.79 kB[22m[1m[22m[2m │ gzip:   5.00 kB[22m
[2mdist/[22m[2massets/[22m[36mAbout-DFsWUxr4.js                                [39m[1m[2m   18.87 kB[22m[1m[22m[2m │ gzip:   2.87 kB[22m
[2mdist/[22m[2massets/[22m[36mNotifications-DbeIgbeH.js                        [39m[1m[2m   19.17 kB[22m[1m[22m[2m │ gzip:   2.57 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountCategories-DhB7OsEr.js                    [39m[1m[2m   19.22 kB[22m[1m[22m[2m │ gzip:   3.75 kB[22m
[2mdist/[22m[2massets/[22m[36mQuotations-CcDns1oA.js                           [39m[1m[2m   19.61 kB[22m[1m[22m[2m │ gzip:   3.82 kB[22m
[2mdist/[22m[2massets/[22m[36mEventImplementations-Buyco5Mn.js                 [39m[1m[2m   19.77 kB[22m[1m[22m[2m │ gzip:   3.90 kB[22m
[2mdist/[22m[2massets/[22m[36mBlogEditor-CRV4KjW3.js                           [39m[1m[2m   20.02 kB[22m[1m[22m[2m │ gzip:   3.84 kB[22m
[2mdist/[22m[2massets/[22m[36mVideosList-ql7V-6QL.js                           [39m[1m[2m   20.02 kB[22m[1m[22m[2m │ gzip:   4.07 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPartnerSettlementPage-B_8VRel_.js          [39m[1m[2m   20.43 kB[22m[1m[22m[2m │ gzip:   3.89 kB[22m
[2mdist/[22m[2massets/[22m[36mPressList-BeUlluWb.js                            [39m[1m[2m   21.22 kB[22m[1m[22m[2m │ gzip:   4.31 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDocumentPendencies-25Tg0GBy.js             [39m[1m[2m   21.54 kB[22m[1m[22m[2m │ gzip:   3.73 kB[22m
[2mdist/[22m[2massets/[22m[36mDuelView-Cw1irOq5.js                             [39m[1m[2m   21.70 kB[22m[1m[22m[2m │ gzip:   4.79 kB[22m
[2mdist/[22m[2massets/[22m[36mPortalSettings-C2cK0GW9.js                       [39m[1m[2m   21.94 kB[22m[1m[22m[2m │ gzip:   4.12 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteDetail--Gxpja1F.js                         [39m[1m[2m   22.17 kB[22m[1m[22m[2m │ gzip:   4.53 kB[22m
[2mdist/[22m[2massets/[22m[36mparse-B9BIfq30.js                                [39m[1m[2m   22.36 kB[22m[1m[22m[2m │ gzip:   4.64 kB[22m
[2mdist/[22m[2massets/[22m[36mEventosList-rMSpKbWB.js                          [39m[1m[2m   22.68 kB[22m[1m[22m[2m │ gzip:   3.78 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimEquipa-Cwj96KnD.js                        [39m[1m[2m   22.98 kB[22m[1m[22m[2m │ gzip:   4.95 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyNewDesign-B2aPpre6.js                    [39m[1m[2m   23.32 kB[22m[1m[22m[2m │ gzip:   4.96 kB[22m
[2mdist/[22m[2massets/[22m[36mCreativeNew-DRcWj7xr.js                          [39m[1m[2m   24.05 kB[22m[1m[22m[2m │ gzip:   5.41 kB[22m
[2mdist/[22m[2massets/[22m[36mCampoView-wv-xCcgX.js                            [39m[1m[2m   24.18 kB[22m[1m[22m[2m │ gzip:   5.27 kB[22m
[2mdist/[22m[2massets/[22m[36mReportCashFlowPage-mIlM6bIk.js                   [39m[1m[2m   24.35 kB[22m[1m[22m[2m │ gzip:   4.49 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyPrint-DvoHAZHU.js                        [39m[1m[2m   24.56 kB[22m[1m[22m[2m │ gzip:   3.71 kB[22m
[2mdist/[22m[2massets/[22m[36mReportIvaAuditPage-njPMgCuM.js                   [39m[1m[2m   24.76 kB[22m[1m[22m[2m │ gzip:   4.80 kB[22m
[2mdist/[22m[2massets/[22m[36mCustomerMatchUpload-C7nnRdfQ.js                  [39m[1m[2m   25.00 kB[22m[1m[22m[2m │ gzip:   4.14 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyPlanCard-BV6VXmOI.js                     [39m[1m[2m   25.39 kB[22m[1m[22m[2m │ gzip:   4.18 kB[22m
[2mdist/[22m[2massets/[22m[36mEventTrackersCard-Dz8-J5sk.js                    [39m[1m[2m   25.60 kB[22m[1m[22m[2m │ gzip:   4.40 kB[22m
[2mdist/[22m[2massets/[22m[36mpurify.es-8E279hYE.js                            [39m[1m[2m   25.61 kB[22m[1m[22m[2m │ gzip:   9.67 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDailySalesPage-DNlpRMzB.js                 [39m[1m[2m   25.92 kB[22m[1m[22m[2m │ gzip:   5.40 kB[22m
[2mdist/[22m[2massets/[22m[36mCardSessions-CT7ytzaj.js                         [39m[1m[2m   26.22 kB[22m[1m[22m[2m │ gzip:   5.38 kB[22m
[2mdist/[22m[2massets/[22m[36mReconciliacaoBpTx-CzldaxMH.js                    [39m[1m[2m   26.94 kB[22m[1m[22m[2m │ gzip:   5.27 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapasList-tVdWyAK9.js                           [39m[1m[2m   27.20 kB[22m[1m[22m[2m │ gzip:   6.95 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountingExport-DMUwlznn.js               [39m[1m[2m   27.71 kB[22m[1m[22m[2m │ gzip:   5.04 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaignFromScratch-B0meONzE.js                  [39m[1m[2m   27.90 kB[22m[1m[22m[2m │ gzip:   5.24 kB[22m
[2mdist/[22m[2massets/[22m[36mPixels-Tni-F90g.js                               [39m[1m[2m   28.41 kB[22m[1m[22m[2m │ gzip:   4.42 kB[22m
[2mdist/[22m[2massets/[22m[36mRecurringTransactions-DDfzVrFo.js                [39m[1m[2m   28.65 kB[22m[1m[22m[2m │ gzip:   5.02 kB[22m
[2mdist/[22m[2massets/[22m[36mContactosList-BH4PxOuG.js                        [39m[1m[2m   29.14 kB[22m[1m[22m[2m │ gzip:   5.77 kB[22m
[2mdist/[22m[2massets/[22m[36mUserManagement-CIQB3Ag7.js                       [39m[1m[2m   30.03 kB[22m[1m[22m[2m │ gzip:   6.24 kB[22m
[2mdist/[22m[2massets/[22m[36mConnections-DnkVKiz-.js                          [39m[1m[2m   30.11 kB[22m[1m[22m[2m │ gzip:   6.41 kB[22m
[2mdist/[22m[2massets/[22m[36mFormalidadeAudit-C1J7Jc_w.js                     [39m[1m[2m   30.41 kB[22m[1m[22m[2m │ gzip:   5.56 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-revenue-basis-BzIpeS0y.js                  [39m[1m[2m   30.57 kB[22m[1m[22m[2m │ gzip:  10.47 kB[22m
[2mdist/[22m[2massets/[22m[36mLeadsList-CACoqxvW.js                            [39m[1m[2m   30.85 kB[22m[1m[22m[2m │ gzip:   5.01 kB[22m
[2mdist/[22m[2massets/[22m[36mDataEntryDialog-7HfsF0O-.js                      [39m[1m[2m   30.97 kB[22m[1m[22m[2m │ gzip:   6.22 kB[22m
[2mdist/[22m[2massets/[22m[36mInsights-DUQpgjtB.js                             [39m[1m[2m   31.96 kB[22m[1m[22m[2m │ gzip:   4.81 kB[22m
[2mdist/[22m[2massets/[22m[36mReportArtistCache-DjcZlUO1.js                    [39m[1m[2m   32.09 kB[22m[1m[22m[2m │ gzip:   8.49 kB[22m
[2mdist/[22m[2massets/[22m[36mBolSync-vdM_b_go.js                              [39m[1m[2m   32.17 kB[22m[1m[22m[2m │ gzip:   5.29 kB[22m
[2mdist/[22m[2massets/[22m[36mMetaCapiMonitor-Z5iGW7tW.js                      [39m[1m[2m   32.24 kB[22m[1m[22m[2m │ gzip:   4.31 kB[22m
[2mdist/[22m[2massets/[22m[36mCartaoEquipa-pXQ-403Y.js                         [39m[1m[2m   32.47 kB[22m[1m[22m[2m │ gzip:   7.47 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaSuppliersPanel-CKaInU1A.js                  [39m[1m[2m   32.76 kB[22m[1m[22m[2m │ gzip:   4.49 kB[22m
[2mdist/[22m[2massets/[22m[36mBatchPaymentModal-Or0bcgYL.js                    [39m[1m[2m   32.88 kB[22m[1m[22m[2m │ gzip:   8.37 kB[22m
[2mdist/[22m[2massets/[22m[36mPrivacy-BIBWso0Q.js                              [39m[1m[2m   33.43 kB[22m[1m[22m[2m │ gzip:   4.92 kB[22m
[2mdist/[22m[2massets/[22m[36mIvaManagement-o9kugXBs.js                        [39m[1m[2m   33.50 kB[22m[1m[22m[2m │ gzip:   5.29 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBIDetail-Dud8aF47.js                        [39m[1m[2m   34.16 kB[22m[1m[22m[2m │ gzip:   8.15 kB[22m
[2mdist/[22m[2massets/[22m[36mcalendar-blz2gnon.js                             [39m[1m[2m   35.00 kB[22m[1m[22m[2m │ gzip:  11.08 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantStandaloneInvoicesTab-BX8Zgfoz.js      [39m[1m[2m   35.02 kB[22m[1m[22m[2m │ gzip:   6.96 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketlineSync-D5CezkI2.js                       [39m[1m[2m   35.20 kB[22m[1m[22m[2m │ gzip:   5.84 kB[22m
[2mdist/[22m[2massets/[22m[36mReportForecastPayablesPage-D-Yl0pzr.js           [39m[1m[2m   35.23 kB[22m[1m[22m[2m │ gzip:   5.74 kB[22m
[2mdist/[22m[2massets/[22m[36mFunnelTest-BNiBffZa.js                           [39m[1m[2m   36.02 kB[22m[1m[22m[2m │ gzip:   7.53 kB[22m
[2mdist/[22m[2massets/[22m[36mReportContasPagarPage-DuNfUr0Z.js                [39m[1m[2m   36.90 kB[22m[1m[22m[2m │ gzip:   6.75 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactionDocumentsModal-DmyBsuE0.js            [39m[1m[2m   37.00 kB[22m[1m[22m[2m │ gzip:   7.88 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREBrasilPage-D9bZNeb_.js                  [39m[1m[2m   37.27 kB[22m[1m[22m[2m │ gzip:   7.38 kB[22m
[2mdist/[22m[2massets/[22m[36mAudit-NrC4CQrQ.js                                [39m[1m[2m   37.98 kB[22m[1m[22m[2m │ gzip:   6.61 kB[22m
[2mdist/[22m[2massets/[22m[36mDashboard-Dcr1g0Vc.js                            [39m[1m[2m   38.23 kB[22m[1m[22m[2m │ gzip:   7.62 kB[22m
[2mdist/[22m[2massets/[22m[36mBPPlanilha-CIEWxhjX.js                           [39m[1m[2m   39.19 kB[22m[1m[22m[2m │ gzip:  11.57 kB[22m
[2mdist/[22m[2massets/[22m[36mHelpCenter-DlMB7G8p.js                           [39m[1m[2m   39.52 kB[22m[1m[22m[2m │ gzip:  12.08 kB[22m
[2mdist/[22m[2massets/[22m[36mCompanies-xSpIjV2r.js                            [39m[1m[2m   40.04 kB[22m[1m[22m[2m │ gzip:   6.10 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteManage-Cvnkb_Ft.js                         [39m[1m[2m   41.63 kB[22m[1m[22m[2m │ gzip:   6.94 kB[22m
[2mdist/[22m[2massets/[22m[36mMetaAudiencesList-BaufvA1Y.js                    [39m[1m[2m   41.84 kB[22m[1m[22m[2m │ gzip:   6.49 kB[22m
[2mdist/[22m[2massets/[22m[36mmarked.esm-DiRRsLPS.js                           [39m[1m[2m   42.33 kB[22m[1m[22m[2m │ gzip:  12.79 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREPage-CKF1jq0E.js                        [39m[1m[2m   43.25 kB[22m[1m[22m[2m │ gzip:   8.61 kB[22m
[2mdist/[22m[2massets/[22m[36mReportMovementReconciliationPage-ExUVW7gA.js     [39m[1m[2m   43.52 kB[22m[1m[22m[2m │ gzip:   7.86 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOfficeSettlementsOverview--U5ltyoZ.js      [39m[1m[2m   43.96 kB[22m[1m[22m[2m │ gzip:   7.04 kB[22m
[2mdist/[22m[2massets/[22m[36mFeverSync-D8Bssakw.js                            [39m[1m[2m   44.82 kB[22m[1m[22m[2m │ gzip:   8.35 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarim-DbQRTBkI.js                              [39m[1m[2m   45.03 kB[22m[1m[22m[2m │ gzip:   7.34 kB[22m
[2mdist/[22m[2massets/[22m[36mSecurityDashboard-D4bL5aC-.js                    [39m[1m[2m   45.68 kB[22m[1m[22m[2m │ gzip:   6.86 kB[22m
[2mdist/[22m[2massets/[22m[36mStandaloneInvoiceScanner-DoEjiIoo.js             [39m[1m[2m   45.87 kB[22m[1m[22m[2m │ gzip:  11.18 kB[22m
[2mdist/[22m[2massets/[22m[36msortable.esm-CvbFPBOB.js                         [39m[1m[2m   45.88 kB[22m[1m[22m[2m │ gzip:  15.28 kB[22m
[2mdist/[22m[2massets/[22m[36mEquipaView-B7UK93me.js                           [39m[1m[2m   46.71 kB[22m[1m[22m[2m │ gzip:   8.12 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBPTransactionsPage-C4n-NCvi.js             [39m[1m[2m   46.79 kB[22m[1m[22m[2m │ gzip:   8.87 kB[22m
[2mdist/[22m[2massets/[22m[36mDatabaseBackups-DEPfS3Kq.js                      [39m[1m[2m   50.10 kB[22m[1m[22m[2m │ gzip:   8.60 kB[22m
[2mdist/[22m[2massets/[22m[36mEventSimulatorDemo-DvvuebSv.js                   [39m[1m[2m   50.13 kB[22m[1m[22m[2m │ gzip:   6.32 kB[22m
[2mdist/[22m[2massets/[22m[36mZonasList-Bbl7Thtz.js                            [39m[1m[2m   50.18 kB[22m[1m[22m[2m │ gzip:  10.03 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaDetail-DvIY3mbc.js                          [39m[1m[2m   50.18 kB[22m[1m[22m[2m │ gzip:   9.08 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyRedesign-CIR0FE6x.js                     [39m[1m[2m   51.97 kB[22m[1m[22m[2m │ gzip:   8.05 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPLPage-BgfsXIKS.js                         [39m[1m[2m   51.99 kB[22m[1m[22m[2m │ gzip:  10.33 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBankStatementPage-CC2sT37U.js              [39m[1m[2m   52.39 kB[22m[1m[22m[2m │ gzip:  10.21 kB[22m
[2mdist/[22m[2massets/[22m[36mCreativeView-C36Y_iWg.js                         [39m[1m[2m   52.46 kB[22m[1m[22m[2m │ gzip:   8.05 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceGoogleAds-C4va-48J.js                    [39m[1m[2m   55.40 kB[22m[1m[22m[2m │ gzip:  10.00 kB[22m
[2mdist/[22m[2massets/[22m[36mReimbursements-BxCDwNHz.js                       [39m[1m[2m   59.24 kB[22m[1m[22m[2m │ gzip:  11.25 kB[22m
[2mdist/[22m[2massets/[22m[36mRegistroFeed-C1_cotBb.js                         [39m[1m[2m   64.66 kB[22m[1m[22m[2m │ gzip:  10.92 kB[22m
[2mdist/[22m[2massets/[22m[36mAdsInvoices-CMLGN7uj.js                          [39m[1m[2m   66.19 kB[22m[1m[22m[2m │ gzip:  11.67 kB[22m
[2mdist/[22m[2massets/[22m[36mEvents-CmTeBi6i.js                               [39m[1m[2m   66.94 kB[22m[1m[22m[2m │ gzip:  11.95 kB[22m
[2mdist/[22m[2massets/[22m[36mReportTicketOfficeAuditPage-BOlgjU3H.js          [39m[1m[2m   68.23 kB[22m[1m[22m[2m │ gzip:  11.49 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimItemAttachmentButton-Dond6FqP.js          [39m[1m[2m   68.60 kB[22m[1m[22m[2m │ gzip:  15.75 kB[22m
[2mdist/[22m[2massets/[22m[36mEventCalendar-DH2u9fXb.js                        [39m[1m[2m   68.83 kB[22m[1m[22m[2m │ gzip:  11.72 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBIEvent-DLxMIDON.js                         [39m[1m[2m   69.09 kB[22m[1m[22m[2m │ gzip:  12.37 kB[22m
[2mdist/[22m[2massets/[22m[36mManualSync-C7riSyFO.js                           [39m[1m[2m   69.21 kB[22m[1m[22m[2m │ gzip:  22.05 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOfficeSettlementModal-Ce7_oa-C.js          [39m[1m[2m   74.74 kB[22m[1m[22m[2m │ gzip:  13.44 kB[22m
[2mdist/[22m[2massets/[22m[36mSuppliers-DmFqtl19.js                            [39m[1m[2m   77.35 kB[22m[1m[22m[2m │ gzip:  12.18 kB[22m
[2mdist/[22m[2massets/[22m[36minstallment-guard-BHqbya2y.js                    [39m[1m[2m   81.95 kB[22m[1m[22m[2m │ gzip:  15.14 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantHome-BcrQudB0.js                       [39m[1m[2m   83.54 kB[22m[1m[22m[2m │ gzip:  13.08 kB[22m
[2mdist/[22m[2massets/[22m[36mEventHub-D_kyqAjS.js                             [39m[1m[2m   83.99 kB[22m[1m[22m[2m │ gzip:  13.86 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierFormModal-DgpkWtuK.js                    [39m[1m[2m   85.17 kB[22m[1m[22m[2m │ gzip:  18.65 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencePrint-CRsp6rwG.js                        [39m[1m[2m   86.16 kB[22m[1m[22m[2m │ gzip:  10.99 kB[22m
[2mdist/[22m[2massets/[22m[36mCoalaSync-DSG91vHo.js                            [39m[1m[2m   86.24 kB[22m[1m[22m[2m │ gzip:  15.07 kB[22m
[2mdist/[22m[2massets/[22m[36mAuditoriaContas-CXtYLXy0.js                      [39m[1m[2m   90.95 kB[22m[1m[22m[2m │ gzip:  16.81 kB[22m
[2mdist/[22m[2massets/[22m[36mjszip.min-CnBbpjIO.js                            [39m[1m[2m   97.24 kB[22m[1m[22m[2m │ gzip:  30.05 kB[22m
[2mdist/[22m[2massets/[22m[36mFinancialAccounts-BM6cN1fd.js                    [39m[1m[2m  115.29 kB[22m[1m[22m[2m │ gzip:  18.14 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyView-CgBxYXxy.js                         [39m[1m[2m  120.56 kB[22m[1m[22m[2m │ gzip:  18.84 kB[22m
[2mdist/[22m[2massets/[22m[36mEventMarketingEditor-pNp_tXLv.js                 [39m[1m[2m  123.43 kB[22m[1m[22m[2m │ gzip:  18.16 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimSessionDetail-BRwo4AB_.js                 [39m[1m[2m  130.83 kB[22m[1m[22m[2m │ gzip:  23.40 kB[22m
[2mdist/[22m[2massets/[22m[36mBankReconciliation-C3eI6WtA.js                   [39m[1m[2m  133.28 kB[22m[1m[22m[2m │ gzip:  26.72 kB[22m
[2mdist/[22m[2massets/[22m[36mCardSessionDetail-BjmK5Ftc.js                    [39m[1m[2m  145.97 kB[22m[1m[22m[2m │ gzip:  27.40 kB[22m
[2mdist/[22m[2massets/[22m[36mNewgangSite-BV1xe_qL.js                          [39m[1m[2m  149.58 kB[22m[1m[22m[2m │ gzip:  26.57 kB[22m
[2mdist/[22m[2massets/[22m[36mindex.es-DmsDyuHC.js                             [39m[1m[2m  150.74 kB[22m[1m[22m[2m │ gzip:  51.38 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPaymentListsPage-DXDZyF2Q.js               [39m[1m[2m  197.96 kB[22m[1m[22m[2m │ gzip:  39.37 kB[22m
[2mdist/[22m[2massets/[22m[36mticket-office-settlement-form-BjX1xdj7.js        [39m[1m[2m  198.37 kB[22m[1m[22m[2m │ gzip:  40.64 kB[22m
[2mdist/[22m[2massets/[22m[36mhtml2canvas.esm-CBrSDip1.js                      [39m[1m[2m  201.42 kB[22m[1m[22m[2m │ gzip:  47.70 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-supabase-3MT7AzyV.js                      [39m[1m[2m  209.56 kB[22m[1m[22m[2m │ gzip:  54.23 kB[22m
[2mdist/[22m[2massets/[22m[36mEventImplementationDetail-x3YyAYtX.js            [39m[1m[2m  221.68 kB[22m[1m[22m[2m │ gzip:  36.25 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaigns-BgtTCnry.js                            [39m[1m[2m  240.17 kB[22m[1m[22m[2m │ gzip:  42.60 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactions-BWjTDX7H.js                         [39m[1m[2m  257.85 kB[22m[1m[22m[2m │ gzip:  46.56 kB[22m
[2mdist/[22m[2massets/[22m[36mEventSimulator-B3cZaExe.js                       [39m[1m[2m  282.42 kB[22m[1m[22m[2m │ gzip:  46.19 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOffices-CswA-vz3.js                        [39m[1m[2m  313.16 kB[22m[1m[22m[2m │ gzip:  53.14 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactionEditModal-kf_-r0Yg.js                 [39m[1m[2m  341.61 kB[22m[1m[22m[2m │ gzip:  59.48 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-pdf-Cg0OIXZi.js                           [39m[1m[2m  421.80 kB[22m[1m[22m[2m │ gzip: 137.18 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaignView-BjfKRtwh.js                         [39m[1m[2m  431.44 kB[22m[1m[22m[2m │ gzip:  72.68 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-react-KQt1rZym.js                         [39m[1m[2m  438.02 kB[22m[1m[22m[2m │ gzip: 134.70 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-charts-CvYs9c1O.js                        [39m[1m[2m  448.41 kB[22m[1m[22m[2m │ gzip: 119.60 kB[22m
[2mdist/[22m[2massets/[22m[36mpdf-first-page-to-jpeg-M5CLsCvW.js               [39m[1m[2m  458.53 kB[22m[1m[22m[2m │ gzip: 135.85 kB[22m
[2mdist/[22m[2massets/[22m[36mEventForecast-knjfGNYE.js                        [39m[1m[33m  736.67 kB[39m[22m[2m │ gzip: 128.49 kB[22m
[2mdist/[22m[2massets/[22m[36mEventDetail-BKBwfjtg.js                          [39m[1m[33m1,064.54 kB[39m[22m[2m │ gzip: 184.26 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-ui-DC4k8uTt.js                            [39m[1m[33m1,068.27 kB[39m[22m[2m │ gzip: 220.41 kB[22m
[2mdist/[22m[2massets/[22m[36mindex-BQJgkmdT.js                                [39m[1m[33m1,190.35 kB[39m[22m[2m │ gzip: 264.96 kB[22m
[2mdist/[22m[2massets/[22m[36mheic2any-BcfgmVBS.js                             [39m[1m[33m1,352.85 kB[39m[22m[2m │ gzip: 341.38 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-xlsx-CIt_8dee.js                          [39m[1m[33m1,369.76 kB[39m[22m[2m │ gzip: 412.26 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-handsontable-CE0eIcQY.js                  [39m[1m[33m1,918.23 kB[39m[22m[2m │ gzip: 457.52 kB[22m
[2mdist/[22m[2massets/[22m[36mheic-to-lXPrQE7P.js                              [39m[1m[33m2,995.46 kB[39m[22m[2m │ gzip: 736.99 kB[22m
[33m
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
[32m✓ built in 52.69s[39m

PWA v1.3.0
mode      generateSW
precache  343 entries (24052.64 KiB)
files generated
  dist/sw.js
  dist/workbox-52dea471.js

EXIT: 0

```

