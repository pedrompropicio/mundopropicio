# #333 — outputs integrais da preparação local

Base arquivada 5ac214e5; gate recebido273ec0b2. Sem rede externa/credenciais/Live. Cópia /tmp/issue333-integrated-qpis4_bk /tree.

## apply

```text
COMMAND: patch --batch --forward -p1 -i /dev-server/patches/issue333/compatibility.PENDENTE.patch
patching file supabase/functions/_shared/standalone-identity.ts
patching file supabase/functions/_shared/standalone-compat.ts
patching file src/lib/standalone-identity-lookup.ts
patching file src/pages/StandaloneInvoiceScanner.tsx
patching file src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx
patching file supabase/functions/ingest-standalone-invoice/index.ts
patching file supabase/manual/20261017_issue333_core.PENDENTE.sql
patching file supabase/functions/_shared/standalone-attempt.ts
patching file src/lib/standalone-attempt-client.ts
patching file supabase/functions/standalone-attempt-333/handler.ts
patching file supabase/functions/standalone-attempt-333/index.ts
patching file supabase/config.toml
patching file supabase/functions/data-entry/handler.ts

EXIT: 0

```

## tsgo

```text
COMMAND: /root/.bun/install/cache/@typescript/native-preview-linux-x64/7.0.0-9b4cac1d418d8402@@@1/lib/tsgo -p tsconfig.app.json --noEmit

EXIT: 0

```

## deno

```text
COMMAND: /bin/deno check --no-remote --config deno-isolated.json supabase/functions/ingest-standalone-invoice/index.ts supabase/functions/_shared/standalone-compat.ts supabase/functions/standalone-attempt-333/handler.ts supabase/functions/standalone-attempt-333/index.ts supabase/functions/data-entry/handler.ts
[0m[32mCheck[0m supabase/functions/ingest-standalone-invoice/index.ts
[0m[32mCheck[0m supabase/functions/_shared/standalone-compat.ts
[0m[32mCheck[0m supabase/functions/standalone-attempt-333/handler.ts
[0m[32mCheck[0m supabase/functions/standalone-attempt-333/index.ts
[0m[32mCheck[0m supabase/functions/data-entry/handler.ts

EXIT: 0

```

## integrated

```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config docs/testes/issue333/vitest.integrated.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated-qpis4_bk/tree[39m

 [32m✓[39m docs/testes/issue333/integrated/endpoint.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 234[2mms[22m[39m
[90mstderr[2m | docs/testes/issue333/integrated/ui.test.tsx[2m > [22m[2mreal patched scanner/editor + fake client; not RLS acceptance[2m > [22m[2mscanner incomplete key lost response locks save; persistent query still works after local storage cleared
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | docs/testes/issue333/integrated/ui.test.tsx[2m > [22m[2mreal patched scanner/editor + fake client; not RLS acceptance[2m > [22m[2meditor own-ID exclusion allows update; lost response blocks repeat and keeps candidate
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | docs/testes/issue333/integrated/ui.test.tsx[2m > [22m[2mreal patched scanner/editor + fake client; not RLS acceptance[2m > [22m[2meditor 23505 is not a success and cannot repeat UPDATE
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 [32m✓[39m docs/testes/issue333/integrated/ui.test.tsx [2m([22m[2m10 tests[22m[2m)[22m[33m 1501[2mms[22m[39m
   [33m[2m✓[22m[39m real patched scanner/editor + fake client; not RLS acceptance[2m > [22mscanner incomplete key lost response locks save; persistent query still works after local storage cleared [33m 524[2mms[22m[39m
   [33m[2m✓[22m[39m real patched scanner/editor + fake client; not RLS acceptance[2m > [22meditor own-ID exclusion allows update; lost response blocks repeat and keeps candidate [33m 306[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m37 passed[39m[22m[90m (37)[39m
[2m   Start at [22m 19:32:21
[2m   Duration [22m 5.18s[2m (transform 684ms, setup 396ms, collect 1.41s, tests 1.73s, environment 2.09s, prepare 1.32s)[22m


EXIT: 0

```

## entry

```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config docs/testes/issue333/vitest.entry.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated-qpis4_bk/tree[39m

 [32m✓[39m docs/testes/issue333/integrated/attempt-entry.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 1853[2mms[22m[39m
   [33m[2m✓[22m[39m Chromium cross-origin fetch performs actual OPTIONS then POST using candidate entry headers [33m 1754[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m7 passed[39m[22m[90m (7)[39m
[2m   Start at [22m 19:32:27
[2m   Duration [22m 3.07s[2m (transform 139ms, setup 0ms, collect 86ms, tests 1.85s, environment 0ms, prepare 549ms)[22m


EXIT: 0

```

## pg

```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config docs/testes/issue333/vitest.pg.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated-qpis4_bk/tree[39m

 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts [2m([22m[2m36 tests[22m[2m)[22m[33m 7393[2mms[22m[39m
   [33m[2m✓[22m[39m #333 concorrência real entre duas ligações[2m > [22mmesmo lote/documento em duas ligações: a 2.ª espera e devolve o MESMO resultado; 1 avulsa [33m 433[2mms[22m[39m
   [33m[2m✓[22m[39m #333 concorrência real entre duas ligações[2m > [22mdois lotes com a mesma fatura: o lock serializa e o 2.º recebe 'já existe' [33m 451[2mms[22m[39m
   [33m[2m✓[22m[39m #333 concorrência real entre duas ligações[2m > [22mescritor legado com a MESMA grafia: o índice canónico bloqueia o 2.º (qualquer ordem) [33m 871[2mms[22m[39m
   [33m[2m✓[22m[39m #333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22massistant × adapted real legacy INSERT equivalent; legacy first=true [33m 421[2mms[22m[39m
   [33m[2m✓[22m[39m #333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22massistant × adapted real legacy INSERT equivalent; legacy first=false [33m 419[2mms[22m[39m
   [33m[2m✓[22m[39m #333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mlegacy × legacy INSERT both orders firstLower=true [33m 404[2mms[22m[39m
   [33m[2m✓[22m[39m #333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mlegacy × legacy INSERT both orders firstLower=false [33m 403[2mms[22m[39m
   [33m[2m✓[22m[39m #333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mlegacy INSERT × legacy UPDATE collision with barrier; insert first=true [33m 405[2mms[22m[39m
   [33m[2m✓[22m[39m #333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mlegacy INSERT × legacy UPDATE collision with barrier; insert first=false [33m 406[2mms[22m[39m
   [33m[2m✓[22m[39m #333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mstrong duplicate 23505 failure rollback permits waiting competitor, no duplicate audit [33m 404[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/attempts-pg.test.ts [2m([22m[2m24 tests[22m[2m)[22m[33m 2098[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m60 passed[39m[22m[90m (60)[39m
[2m   Start at [22m 19:32:31
[2m   Duration [22m 10.58s[2m (transform 212ms, setup 0ms, collect 306ms, tests 9.49s, environment 0ms, prepare 336ms)[22m


EXIT: 0

```

## handler

```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config docs/testes/issue333/vitest.handler.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated-qpis4_bk/tree[39m

 [32m✓[39m docs/testes/issue333/handler/handler.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 85[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m20 passed[39m[22m[90m (20)[39m
[2m   Start at [22m 19:32:42
[2m   Duration [22m 1.05s[2m (transform 103ms, setup 0ms, collect 119ms, tests 85ms, environment 0ms, prepare 381ms)[22m


EXIT: 0

```

## general

```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config vitest.offline.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated-qpis4_bk/tree[39m

 [32m✓[39m src/lib/__tests__/postgrest-embeds.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 244[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-row-limit.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 251[2mms[22m[39m
 [32m✓[39m src/test/campaign-design-optional-roas.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 289[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-handler.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 251[2mms[22m[39m
 [32m✓[39m src/test/forecast-attachment-counts.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 542[2mms[22m[39m
   [33m[2m✓[22m[39m anexos do BP — uma leitura por evento (#269)[2m > [22m361 linhas → 1 pedido a event_forecast_attachments [33m 536[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/document-detect.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 1867[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 12°, centrado com erro < 3% [33m 444[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado -18°, à esquerda com erro < 3% [33m 452[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 20°, canto sup. dir. com erro < 3% [33m 396[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 6°, grande com erro < 3% [33m 347[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/storage-multi-tenant.test.ts [2m([22m[2m14 tests[22m[2m)[22m[33m 1291[2mms[22m[39m
   [33m[2m✓[22m[39m multi-tenant storage helpers[2m > [22museSetActiveCompany limpa a cache do storage[2m > [22mdepois da troca, withCompanyPath prefixa com a empresa nova [33m 1261[2mms[22m[39m
[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mEsc não fecha o modal sob outra janela
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mDialog separa cabeçalho e corpo e mantém o X fora do scroll
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 [32m✓[39m src/test/mobile-modal-dismiss.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 386[2mms[22m[39m
[90mstderr[2m | src/pages/__tests__/ResetPassword.test.tsx[2m > [22m[2mResetPassword — token_hash flow[2m > [22m[2m(a) não chama verifyOtp ao montar; só ao clicar Continuar
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/pages/__tests__/ResetPassword.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[33m 313[2mms[22m[39m
 [32m✓[39m src/components/__tests__/LinkBpLineDialog-layer.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 215[2mms[22m[39m
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

 [32m✓[39m src/lib/__tests__/overlay-layer.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 464[2mms[22m[39m
[90mstderr[2m | src/components/data-entry/__tests__/DataEntryDialog.test.tsx[2m > [22m[2m#333 DataEntryDialog[2m > [22m[2mendpoint ausente: mostra indisponível e não oferece ações
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/components/__tests__/EventABTab.test.tsx[2m > [22m[2mEventABTab — UI smoke tests[2m > [22m[2mrenderiza sem crashar e mostra labels/inputs das zonas
[22m[39mWarning: Input contains an input of type undefined with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://reactjs.org/link/controlled-components
    at input
    at /tmp/issue333-integrated-qpis4_bk/tree/src/components/ui/input.tsx:8:6
    at div
    at div
    at /tmp/issue333-integrated-qpis4_bk/tree/src/components/ui/card.tsx:38:6
    at div
    at /tmp/issue333-integrated-qpis4_bk/tree/src/components/ui/card.tsx:7:50
    at div
    at EventABTab (/tmp/issue333-integrated-qpis4_bk/tree/src/components/EventABTab.tsx:151:23)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
    at Router (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1207:17)
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/test/club-config-integration.test.tsx[2m > [22m[2m#327 integration without network[2m > [22m[2mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/components/__tests__/EventABTab.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[33m 563[2mms[22m[39m
   [33m[2m✓[22m[39m EventABTab — UI smoke tests[2m > [22mrenderiza sem crashar e mostra labels/inputs das zonas [33m 339[2mms[22m[39m
 [32m✓[39m src/test/event-financial-card-render-loop.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 1128[2mms[22m[39m
   [33m[2m✓[22m[39m EventFinancialCard — sem ciclo de redesenho (#269)[2m > [22mchama onEbitdaParcelsChange uma única vez com queries vazias [33m 1126[2mms[22m[39m
 [32m✓[39m src/test/club-config-integration.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[33m 848[2mms[22m[39m
   [33m[2m✓[22m[39m #327 integration without network[2m > [22mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa [33m 410[2mms[22m[39m
 [32m✓[39m src/test/newgang-wallet-google.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 131[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/no-direct-transaction-document-remove.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 163[2mms[22m[39m
 [32m✓[39m src/components/data-entry/__tests__/DataEntryDialog.test.tsx [2m([22m[2m13 tests[22m[2m)[22m[33m 3236[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução não validada: prévia visível, botão desativado mesmo após confirmação [33m 369[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução validada: exige confirmação explícita e mostra a conferência com a observação [33m 307[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22meditar depois da prévia exige nova prévia/hash antes de executar [33m 327[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mretoma nunca declara sucesso por cache; repõe campos, lê check, sem commit [33m 329[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução tardia após close não mostra sucesso e retoma só confere [33m 313[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mresposta tardia de upload após contexto alterado é descartada [33m 303[2mms[22m[39m
 [32m✓[39m src/test/edge-fn-guard.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-report.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 40[2mms[22m[39m
[90mstderr[2m | src/test/require-feature.test.tsx[2m > [22m[2mvisibilidade por company_features[2m > [22m[2mrota bloqueada sem a chave
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/test/require-feature.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 176[2mms[22m[39m
[90mstderr[2m | src/lib/__tests__/permissions-guards-f2b.test.tsx[2m > [22m[2m#311 F2b — guardas por permissão[2m > [22m[2mmanager com excepção module.crm entra em /crm e vê o cartão CRM activo
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/lib/__tests__/permissions-guards-f2b.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 203[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-percentage.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 104[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-statement-documents.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[32m 183[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-properties.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-view.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 121[2mms[22m[39m
 [32m✓[39m src/test/camarim-session-pdf-sanitize.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m src/test/event-financials-invalidation.test.tsx [2m([22m[2m8 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m src/test/similar-suppliers-notice.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 70[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-pdf.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 60[2mms[22m[39m
 [32m✓[39m src/test/newgang-welcome-once.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/test/newgang-content.test.tsx [2m([22m[2m2 tests[22m[2m)[22m[32m 93[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-statement-doc.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 82[2mms[22m[39m
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

 [32m✓[39m src/components/TicketOfficePositionCards.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m src/components/__tests__/StatCard.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 84[2mms[22m[39m
 [32m✓[39m src/components/__tests__/EventStatusBadge.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 61[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-large-tables-mirror.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 31[2mms[22m[39m
[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mconsent: timeout da RPC → 503 bloqueado
[22m[39m[portal-track] consent rpc threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mbind falha (throw): lead entra sem ids Meta
[22m[39m[portal-track] consent bind threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2minsert falha → 500 (sem falso sucesso)
[22m[39m[portal-track] insert lead_capture [33m500[39m

 [32m✓[39m src/test/consent-contract-322.test.ts [2m([22m[2m38 tests[22m[2m)[22m[32m 63[2mms[22m[39m
[90mstderr[2m | src/lib/__tests__/cache-scope.test.tsx[2m > [22m[2mecrã do subevento usa a configuração do Master[2m > [22m[2mmostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/lib/__tests__/cache-scope.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 258[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-read-layer.test.ts [2m([22m[2m28 tests[22m[2m | [22m[33m7 skipped[39m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/test/approve-lock-and-core.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/google-click-match.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m src/test/song-link-ssr.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/club-config-source.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-calc.test.ts [2m([22m[2m35 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-settlement-engine.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-capacity.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-formula.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-sync.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/lib/cost-center-map.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-videos.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/test/transaction-duplicate-check.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/split-adjustment.test.ts [2m([22m[2m37 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-card-date.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 84[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/statement-grouping.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/data-entry-contract.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-perimeter.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-version-multi-diff.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/test/newgang-wallet-levels.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-turns.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/help-manual-parser.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/test/standalone-compat-prepared.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-photos.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-participants.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/multi-day-ticketing.test.ts [2m([22m[2m25 tests[22m[2m | [22m[33m4 skipped[39m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-tx-matching.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-reconciliation.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/supplier-credits.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 52[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/real-cache-deductions.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-disbursement.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-line-review.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-partner-mirror.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-bp-rules.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/lib/sepa/bank-execution.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/test/capi-p1-guard.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-rebill-vat.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/iva.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/test/payment-list-revalidate.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-settlement-calc.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/simulator-prior-curve.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/refund-grouping.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-full-suite.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/overhead-proration.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/newgang-strict-audience-delivery.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/test/derp248-tiktok-event-trackers.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal-bundle.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/validations.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/creative-media.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/utils.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/test/newgang-missions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-boost.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis-tour.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-per-company.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/test/bol-m2-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-calc.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/test/ticketline-import-format-transition.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-gating.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/audit.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/components/__tests__/PasswordStrengthIndicator.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ads-tour-split.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-revenue-basis.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-seal.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-settlement-internal-report.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-revenue.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-ab-scale.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/test/bol-daily-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ebitda.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/test/crm-audience-live-count.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tour-cache-sync.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/test/payment-method-domain.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/test/newgang-history.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/dre-nature-divergence.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/silent-writes.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/master-adopted-expense-proration.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/income-tax-out-of-event-result.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-rounding.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-cash-preview.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/report-event-cost.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-extras-union-148.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/test/crm-ingest-no-network.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-doc-text.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-undo.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/transitory-transactions.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/test/capi-diag-no-secrets.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/test/supplier-similarity.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-elasticity.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/test/example.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-tab-total.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/test/memory-index.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-nature.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/pl-category-matching.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-position.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/accountant-account-filter.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-revenue-single-rule.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/test/newgang-crews.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-on-sale.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-integrate.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-realized.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/components/__tests__/bp-installments.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m src/test/transaction-edit-modal-operation-key.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/test/partner-statement-cards.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/crm/creativeReelsCheck.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/test/operation-key-domain.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/fecho-preconditions.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-guards-proof.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/check-deploy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-planilha-version.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/session-copy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-capacities.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-effective-open.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/payment-settlement.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-edit-diff.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/test/format-integer-conversions.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-extras-kind.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
[90mstdout[2m | src/lib/__tests__/card-session-theoretical.test.ts[2m > [22m[2m#275 saldo teórico da sessão = fecho[2m > [22m[2msem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[22m[39m[#275] teórico = 636.68 esperado = 636.68

 [32m✓[39m src/lib/__tests__/card-session-theoretical.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/contactos-list-paging.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m src/test/newgang-profile-country.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/account-balance-settling.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-invoices.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-category.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/test/coala-centro-custo-norm.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-eligible.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [2m[90m↓[39m[22m src/test/partner-statement-edge.test.ts [2m([22m[2m1 test[22m[2m | [22m[33m1 skipped[39m[2m)[22m
 [32m✓[39m src/lib/__tests__/bp-line-required.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m

[2m Test Files [22m [1m[32m165 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (166)[39m
[2m      Tests [22m [1m[32m1334 passed[39m[22m[2m | [22m[33m1 skipped[39m[2m | [22m[90m11 todo[39m[90m (1346)[39m
[2m   Start at [22m 19:32:43
[2m   Duration [22m 89.04s[2m (transform 12.83s, setup 162.15s, collect 134.97s, tests 16.47s, environment 745.71s, prepare 126.58s)[22m


EXIT: 0

```

## build

```text
COMMAND: /dev-server/node_modules/.bin/vite build
[36mvite v5.4.19 [32mbuilding for production...[36m[39m
transforming...
Browserslist: browsers data (caniuse-lite) is 7 months old. Please run:
  npx update-browserslist-db@latest
  Why you should do it regularly: https://github.com/browserslist/update-db#readme
[32m✓[39m 6220 modules transformed.
rendering chunks...
[1m[33m[plugin:vite:reporter][39m[22m [33m[plugin vite:reporter] 
(!) /tmp/issue333-integrated-qpis4_bk/tree/src/lib/storage.ts is dynamically imported by /tmp/issue333-integrated-qpis4_bk/tree/src/contexts/AuthContext.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/contexts/AuthContext.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/hooks/useCompany.ts but also statically imported by /tmp/issue333-integrated-qpis4_bk/tree/src/components/BPNotesAttachmentsModal.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/CacheExtrasPanel.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/EntityDocumentsSection.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/EventABAttachmentsSection.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/EventClosingCosts.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/EventForecast.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/PartnerExtrasPanel.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/PaymentListReceipts.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/SupplierCreditsPanel.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/TicketOfficeSettlementModal.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/TransactionDocumentsModal.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/TransactionFormModal.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/bank/BankLineDocumentsDialog.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/camarim/CamarimItemAttachmentButton.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/camarim/CamarimItemModal.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/cards/NewCardExpenseModal.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/supplier-credits/NewSupplierCreditModal.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/components/supplier-credits/SupplierCreditsTab.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/pages/BankReconciliation.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/pages/EventImplementations.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/pages/PartnerEventDetail.tsx, /tmp/issue333-integrated-qpis4_bk/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx, dynamic import will not move module into another chunk.
[39m
[bundle] inicial estático: 5156275 bytes
computing gzip size...
[2mdist/[22m[32mmanifest.webmanifest                                    [39m[1m[2m    0.47 kB[22m[1m[22m
[2mdist/[22m[32mindex.html                                              [39m[1m[2m    3.95 kB[22m[1m[22m[2m │ gzip:   1.29 kB[22m
[2mdist/[22m[2massets/[22m[32mlogo-horizontal-mvVEptKs.png                     [39m[1m[2m   45.85 kB[22m[1m[22m
[2mdist/[22m[32mbundle-report.json                                      [39m[1m[2m  810.35 kB[22m[1m[22m[2m │ gzip:  76.93 kB[22m
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
[2mdist/[22m[2massets/[22m[36museDisplayCurrency-DfIRXLhE.js                   [39m[1m[2m    0.15 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
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
[2mdist/[22m[2massets/[22m[36mbackdropClose-BwKXC2bk.js                        [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.21 kB[22m
[2mdist/[22m[2massets/[22m[36mrelativeTime-CufnskKF.js                         [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.22 kB[22m
[2mdist/[22m[2massets/[22m[36mskeleton-DCHLydvA.js                             [39m[1m[2m    0.34 kB[22m[1m[22m[2m │ gzip:   0.27 kB[22m
[2mdist/[22m[2massets/[22m[36maddMonths-Dsh0EBap.js                            [39m[1m[2m    0.35 kB[22m[1m[22m[2m │ gzip:   0.25 kB[22m
[2mdist/[22m[2massets/[22m[36mstrategy-status-if_xUdsk.js                      [39m[1m[2m    0.41 kB[22m[1m[22m[2m │ gzip:   0.24 kB[22m
[2mdist/[22m[2massets/[22m[36mform-enter-guard-TC9TB5Pp.js                     [39m[1m[2m    0.43 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36mtraction-C6TeXKI5.js                             [39m[1m[2m    0.45 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
[2mdist/[22m[2massets/[22m[36mstring-similarity-B7WDu-Mk.js                    [39m[1m[2m    0.45 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
[2mdist/[22m[2massets/[22m[36mcreative-media-DKNTK8AD.js                       [39m[1m[2m    0.50 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
[2mdist/[22m[2massets/[22m[36moverlay-layer-Cnlrt_Mc.js                        [39m[1m[2m    0.51 kB[22m[1m[22m[2m │ gzip:   0.37 kB[22m
[2mdist/[22m[2massets/[22m[36mseparator-DGqCRkoF.js                            [39m[1m[2m    0.54 kB[22m[1m[22m[2m │ gzip:   0.37 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInDays-ChvF9Jc3.js                     [39m[1m[2m    0.54 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36mbudget-mode-DVrmuogs.js                          [39m[1m[2m    0.56 kB[22m[1m[22m[2m │ gzip:   0.40 kB[22m
[2mdist/[22m[2massets/[22m[36museMyLeadFrenteIds-DqKtb-lx.js                   [39m[1m[2m    0.56 kB[22m[1m[22m[2m │ gzip:   0.38 kB[22m
[2mdist/[22m[2massets/[22m[36mgetTimezoneOffsetInMilliseconds-CEhzTjz1.js      [39m[1m[2m    0.58 kB[22m[1m[22m[2m │ gzip:   0.34 kB[22m
[2mdist/[22m[2massets/[22m[36maudience-pdf-RQfvkLkz.js                         [39m[1m[2m    0.64 kB[22m[1m[22m[2m │ gzip:   0.41 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-nature-BSQ-ezBD.js                         [39m[1m[2m    0.78 kB[22m[1m[22m[2m │ gzip:   0.45 kB[22m
[2mdist/[22m[2massets/[22m[36museRealtimeInvalidation-Bp3-CGh1.js              [39m[1m[2m    0.78 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m
[2mdist/[22m[2massets/[22m[36mPriorityBadge-Cls6iIJP.js                        [39m[1m[2m    0.81 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36museOperacaoFilters-CTkRwTaA.js                   [39m[1m[2m    0.81 kB[22m[1m[22m[2m │ gzip:   0.49 kB[22m
[2mdist/[22m[2massets/[22m[36mIbanWarning-AQrJuSeb.js                          [39m[1m[2m    0.82 kB[22m[1m[22m[2m │ gzip:   0.43 kB[22m
[2mdist/[22m[2massets/[22m[36madmin-window-B26-xMRo.js                         [39m[1m[2m    0.85 kB[22m[1m[22m[2m │ gzip:   0.50 kB[22m
[2mdist/[22m[2massets/[22m[36mcard-account-balance-CEx4w5xr.js                 [39m[1m[2m    0.92 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36maccount-balance-rpc-SKkHhrpR.js                  [39m[1m[2m    0.93 kB[22m[1m[22m[2m │ gzip:   0.49 kB[22m
[2mdist/[22m[2massets/[22m[36mcircuit-account-BN7XJNu5.js                      [39m[1m[2m    0.94 kB[22m[1m[22m[2m │ gzip:   0.58 kB[22m
[2mdist/[22m[2massets/[22m[36msupplier-credits-CYrz9FS1.js                     [39m[1m[2m    0.98 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mmoney-input-GgXVZikz.js                          [39m[1m[2m    1.02 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
[2mdist/[22m[2massets/[22m[36mapp-badge-TV8NLhKB.js                            [39m[1m[2m    1.04 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m
[2mdist/[22m[2massets/[22m[36mbank-link-date-DcRav5qG.js                       [39m[1m[2m    1.05 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36mavatar-CDYJAnpJ.js                               [39m[1m[2m    1.07 kB[22m[1m[22m[2m │ gzip:   0.44 kB[22m
[2mdist/[22m[2massets/[22m[36mPhaseBadge-CFnZOa27.js                           [39m[1m[2m    1.20 kB[22m[1m[22m[2m │ gzip:   0.66 kB[22m
[2mdist/[22m[2massets/[22m[36mzone-capacities-rxfCaaM5.js                      [39m[1m[2m    1.22 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mStaffList-enNLXMF2.js                            [39m[1m[2m    1.22 kB[22m[1m[22m[2m │ gzip:   0.54 kB[22m
[2mdist/[22m[2massets/[22m[36mIvaRateSelect-Dp4wQ8tQ.js                        [39m[1m[2m    1.27 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
[2mdist/[22m[2massets/[22m[36mcard-session-helpers-BFxNki9A.js                 [39m[1m[2m    1.31 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m
[2mdist/[22m[2massets/[22m[36malert-BOkzfVZD.js                                [39m[1m[2m    1.34 kB[22m[1m[22m[2m │ gzip:   0.59 kB[22m
[2mdist/[22m[2massets/[22m[36maccount-balance-D6WhKmP0.js                      [39m[1m[2m    1.36 kB[22m[1m[22m[2m │ gzip:   0.69 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoStatusBadge-DPJc21gg.js                  [39m[1m[2m    1.36 kB[22m[1m[22m[2m │ gzip:   0.62 kB[22m
[2mdist/[22m[2massets/[22m[36mcurrency-DvXZV_Ot.js                             [39m[1m[2m    1.43 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36maccountant-reviews-CpRLfu1k.js                   [39m[1m[2m    1.46 kB[22m[1m[22m[2m │ gzip:   0.60 kB[22m
[2mdist/[22m[2massets/[22m[36msupplier-bank-5vwMk3tM.js                        [39m[1m[2m    1.51 kB[22m[1m[22m[2m │ gzip:   0.70 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-line-relink-SHImmUfI.js                       [39m[1m[2m    1.52 kB[22m[1m[22m[2m │ gzip:   0.58 kB[22m
[2mdist/[22m[2massets/[22m[36mscroll-area-mvMib7wf.js                          [39m[1m[2m    1.66 kB[22m[1m[22m[2m │ gzip:   0.57 kB[22m
[2mdist/[22m[2massets/[22m[36mcapital-branch-CJwzxRyH.js                       [39m[1m[2m    1.67 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36mReportArtistCachePage-DWxFr1ie.js                [39m[1m[2m    1.70 kB[22m[1m[22m[2m │ gzip:   0.63 kB[22m
[2mdist/[22m[2massets/[22m[36mebitda-nL3KomgC.js                               [39m[1m[2m    1.74 kB[22m[1m[22m[2m │ gzip:   0.76 kB[22m
[2mdist/[22m[2massets/[22m[36mcamarim-helpers-M1Vn5iD-.js                      [39m[1m[2m    1.76 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36miban-BYOybSCJ.js                                 [39m[1m[2m    1.79 kB[22m[1m[22m[2m │ gzip:   0.95 kB[22m
[2mdist/[22m[2massets/[22m[36maccordion-DW4V1lr1.js                            [39m[1m[2m    1.82 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m
[2mdist/[22m[2massets/[22m[36minvoice-ocr-prepare-CcJft9v3.js                  [39m[1m[2m    1.85 kB[22m[1m[22m[2m │ gzip:   1.02 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-line-required-B75a_wft.js                     [39m[1m[2m    1.88 kB[22m[1m[22m[2m │ gzip:   0.76 kB[22m
[2mdist/[22m[2massets/[22m[36mEventNatureFilter-ByeF9cUr.js                    [39m[1m[2m    1.95 kB[22m[1m[22m[2m │ gzip:   0.73 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountingExportPage-Cpkj9p-9.js           [39m[1m[2m    2.00 kB[22m[1m[22m[2m │ gzip:   0.75 kB[22m
[2mdist/[22m[2massets/[22m[36mdashboard-format-GnqOyAs1.js                     [39m[1m[2m    2.00 kB[22m[1m[22m[2m │ gzip:   0.92 kB[22m
[2mdist/[22m[2massets/[22m[36msettlement-participants-w8-SovyI.js              [39m[1m[2m    2.01 kB[22m[1m[22m[2m │ gzip:   0.79 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDocumentPendenciesPage-mQC75Vkm.js         [39m[1m[2m    2.02 kB[22m[1m[22m[2m │ gzip:   0.75 kB[22m
[2mdist/[22m[2massets/[22m[36mtoggle-group-Ds_ObkuS.js                         [39m[1m[2m    2.03 kB[22m[1m[22m[2m │ gzip:   0.79 kB[22m
[2mdist/[22m[2massets/[22m[36mMirrorAporteNotice-Cec1V555.js                   [39m[1m[2m    2.08 kB[22m[1m[22m[2m │ gzip:   0.90 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-ab-calc-BxWHlvfV.js                        [39m[1m[2m    2.10 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36mFeatureNotEnabledCard-Bcb9zqMl.js                [39m[1m[2m    2.13 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteLeadsAvatars-BWOnfwZY.js                   [39m[1m[2m    2.25 kB[22m[1m[22m[2m │ gzip:   0.87 kB[22m
[2mdist/[22m[2massets/[22m[36mticket-office-reconciliation-HF2eR9vG.js         [39m[1m[2m    2.25 kB[22m[1m[22m[2m │ gzip:   1.05 kB[22m
[2mdist/[22m[2massets/[22m[36museUserPreferences-MFHISzkq.js                   [39m[1m[2m    2.30 kB[22m[1m[22m[2m │ gzip:   0.70 kB[22m
[2mdist/[22m[2massets/[22m[36mformatDistanceToNow-CgGNwkFO.js                  [39m[1m[2m    2.32 kB[22m[1m[22m[2m │ gzip:   0.98 kB[22m
[2mdist/[22m[2massets/[22m[36mpartner-extras-CqYI4udy.js                       [39m[1m[2m    2.32 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-tx-matching-BHd1Ixbn.js                       [39m[1m[2m    2.38 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36museEventIvaRates-CQjy1onv.js                     [39m[1m[2m    2.68 kB[22m[1m[22m[2m │ gzip:   1.15 kB[22m
[2mdist/[22m[2massets/[22m[36mparseISO-Cr0H38in.js                             [39m[1m[2m    2.70 kB[22m[1m[22m[2m │ gzip:   1.19 kB[22m
[2mdist/[22m[2massets/[22m[36mReportCostSourceToggle-C135SrpD.js               [39m[1m[2m    2.93 kB[22m[1m[22m[2m │ gzip:   1.07 kB[22m
[2mdist/[22m[2massets/[22m[36m_LegalLayout-DMRSlcH4.js                         [39m[1m[2m    3.08 kB[22m[1m[22m[2m │ gzip:   0.69 kB[22m
[2mdist/[22m[2massets/[22m[36mreal-cache-calc-x5B7qdd_.js                      [39m[1m[2m    3.25 kB[22m[1m[22m[2m │ gzip:   1.48 kB[22m
[2mdist/[22m[2massets/[22m[36mdate-picker-DL5GwJlW.js                          [39m[1m[2m    3.32 kB[22m[1m[22m[2m │ gzip:   1.25 kB[22m
[2mdist/[22m[2massets/[22m[36mAcceptInvite-DjNCF9gg.js                         [39m[1m[2m    3.86 kB[22m[1m[22m[2m │ gzip:   1.17 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaAssigneeAvatars-DBgRfBxF.js                 [39m[1m[2m    3.89 kB[22m[1m[22m[2m │ gzip:   1.00 kB[22m
[2mdist/[22m[2massets/[22m[36mAdAccounts-D4kATF4f.js                           [39m[1m[2m    3.95 kB[22m[1m[22m[2m │ gzip:   0.98 kB[22m
[2mdist/[22m[2massets/[22m[36mcache-tab-total-XF_858Mu.js                      [39m[1m[2m    4.35 kB[22m[1m[22m[2m │ gzip:   1.67 kB[22m
[2mdist/[22m[2massets/[22m[36mcsv-export-Bp8nlkXR.js                           [39m[1m[2m    4.39 kB[22m[1m[22m[2m │ gzip:   1.57 kB[22m
[2mdist/[22m[2massets/[22m[36mNewStaffDialog-D_uVH4UQ.js                       [39m[1m[2m    4.45 kB[22m[1m[22m[2m │ gzip:   1.20 kB[22m
[2mdist/[22m[2massets/[22m[36mStatCard-BtSXM4YW.js                             [39m[1m[2m    4.47 kB[22m[1m[22m[2m │ gzip:   1.06 kB[22m
[2mdist/[22m[2massets/[22m[36mImageUploader-CyZqbui_.js                        [39m[1m[2m    4.73 kB[22m[1m[22m[2m │ gzip:   1.49 kB[22m
[2mdist/[22m[2massets/[22m[36museScenarioForecasts-B2N_B9m_.js                 [39m[1m[2m    4.86 kB[22m[1m[22m[2m │ gzip:   1.44 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceNew-WmAkkAWC.js                          [39m[1m[2m    4.88 kB[22m[1m[22m[2m │ gzip:   1.26 kB[22m
[2mdist/[22m[2massets/[22m[36mexport-ticket-office-settlement-pdf-BvlhA7Xw.js  [39m[1m[2m    5.00 kB[22m[1m[22m[2m │ gzip:   2.29 kB[22m
[2mdist/[22m[2massets/[22m[36mMeusChamados-BqVRuRkc.js                         [39m[1m[2m    5.31 kB[22m[1m[22m[2m │ gzip:   1.56 kB[22m
[2mdist/[22m[2massets/[22m[36minvoice-group-G7fZLDK4.js                        [39m[1m[2m    5.43 kB[22m[1m[22m[2m │ gzip:   1.76 kB[22m
[2mdist/[22m[2massets/[22m[36mUserSettings-D9Jw4snT.js                         [39m[1m[2m    5.53 kB[22m[1m[22m[2m │ gzip:   1.67 kB[22m
[2mdist/[22m[2massets/[22m[36mSimilarSuppliersNotice-0B-Dgado.js               [39m[1m[2m    5.66 kB[22m[1m[22m[2m │ gzip:   1.84 kB[22m
[2mdist/[22m[2massets/[22m[36mpt-BR-Dh5EWHbw.js                                [39m[1m[2m    5.85 kB[22m[1m[22m[2m │ gzip:   2.10 kB[22m
[2mdist/[22m[2massets/[22m[36mpt-B3dxR9FF.js                                   [39m[1m[2m    5.97 kB[22m[1m[22m[2m │ gzip:   2.02 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierBankDetails-DdAzSyA6.js                  [39m[1m[2m    6.14 kB[22m[1m[22m[2m │ gzip:   1.20 kB[22m
[2mdist/[22m[2massets/[22m[36mparse-ticketline-zone-xlsx-BcBXDVLy.js           [39m[1m[2m    6.86 kB[22m[1m[22m[2m │ gzip:   2.59 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoHome-DI05doQS.js                         [39m[1m[2m    7.07 kB[22m[1m[22m[2m │ gzip:   1.92 kB[22m
[2mdist/[22m[2massets/[22m[36men-US-CpWK9ySR.js                                [39m[1m[2m    7.19 kB[22m[1m[22m[2m │ gzip:   2.47 kB[22m
[2mdist/[22m[2massets/[22m[36mchart-C1uzX21h.js                                [39m[1m[2m    7.28 kB[22m[1m[22m[2m │ gzip:   2.19 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadoNovo-fEnWuYUX.js                          [39m[1m[2m    7.46 kB[22m[1m[22m[2m │ gzip:   1.85 kB[22m
[2mdist/[22m[2massets/[22m[36museBPVersions-BRuadThT.js                        [39m[1m[2m    7.53 kB[22m[1m[22m[2m │ gzip:   1.77 kB[22m
[2mdist/[22m[2massets/[22m[36mMinhasTarefas-8mxikl2n.js                        [39m[1m[2m    7.69 kB[22m[1m[22m[2m │ gzip:   2.16 kB[22m
[2mdist/[22m[2massets/[22m[36mDiagnosisTest-D13xMyuh.js                        [39m[1m[2m    7.99 kB[22m[1m[22m[2m │ gzip:   1.58 kB[22m
[2mdist/[22m[2massets/[22m[36mIbanDuplicates-CGE3_DBn.js                       [39m[1m[2m    8.11 kB[22m[1m[22m[2m │ gzip:   2.04 kB[22m
[2mdist/[22m[2massets/[22m[36mFrentesPanel-DRkyUdvm.js                         [39m[1m[2m    8.23 kB[22m[1m[22m[2m │ gzip:   2.07 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSalesComparisonPage-BaHhF0H4.js            [39m[1m[2m    8.36 kB[22m[1m[22m[2m │ gzip:   2.16 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-format-KaMeqJ61.js                         [39m[1m[2m    8.46 kB[22m[1m[22m[2m │ gzip:   2.52 kB[22m
[2mdist/[22m[2massets/[22m[36mSimilarSuppliersReview-BhcVlQJy.js               [39m[1m[2m    8.46 kB[22m[1m[22m[2m │ gzip:   1.98 kB[22m
[2mdist/[22m[2massets/[22m[36mAtividade-Bis11Pct.js                            [39m[1m[2m    8.54 kB[22m[1m[22m[2m │ gzip:   2.34 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoListShell-BAW1TVPI.js                    [39m[1m[2m    8.85 kB[22m[1m[22m[2m │ gzip:   2.22 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSalesCurvePage-D_JYz_iM.js                 [39m[1m[2m    8.91 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategies-DglOb7xV.js                           [39m[1m[2m    9.10 kB[22m[1m[22m[2m │ gzip:   2.15 kB[22m
[2mdist/[22m[2massets/[22m[36mUploadCoalaFotos-B_Ju4cTG.js                     [39m[1m[2m    9.14 kB[22m[1m[22m[2m │ gzip:   2.11 kB[22m
[2mdist/[22m[2massets/[22m[36mimport-pl-xlsx-OmAmMJsH.js                       [39m[1m[2m    9.39 kB[22m[1m[22m[2m │ gzip:   4.03 kB[22m
[2mdist/[22m[2massets/[22m[36mFieldStaffSection-DONVel0W.js                    [39m[1m[2m    9.58 kB[22m[1m[22m[2m │ gzip:   2.15 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAgingPage-DvecCmGZ.js                      [39m[1m[2m    9.67 kB[22m[1m[22m[2m │ gzip:   2.15 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountCategoriesPage-B9Pcmpjv.js          [39m[1m[2m    9.81 kB[22m[1m[22m[2m │ gzip:   2.18 kB[22m
[2mdist/[22m[2massets/[22m[36mFundHolderPicker-CYMopbPn.js                     [39m[1m[2m    9.83 kB[22m[1m[22m[2m │ gzip:   1.97 kB[22m
[2mdist/[22m[2massets/[22m[36museEventABScenarios-BY7XvfDW.js                  [39m[1m[2m   10.09 kB[22m[1m[22m[2m │ gzip:   3.72 kB[22m
[2mdist/[22m[2massets/[22m[36mReportRevenueMixPage-C2uOsDVF.js                 [39m[1m[2m   10.20 kB[22m[1m[22m[2m │ gzip:   2.16 kB[22m
[2mdist/[22m[2massets/[22m[36mBankLineDocumentsDialog-Dsdhf4GL.js              [39m[1m[2m   10.40 kB[22m[1m[22m[2m │ gzip:   2.74 kB[22m
[2mdist/[22m[2massets/[22m[36mReportMonthlyEvolutionPage-BFZB4sBq.js           [39m[1m[2m   10.44 kB[22m[1m[22m[2m │ gzip:   2.11 kB[22m
[2mdist/[22m[2massets/[22m[36mAuditDownloads-CUqG7mxb.js                       [39m[1m[2m   10.80 kB[22m[1m[22m[2m │ gzip:   2.19 kB[22m
[2mdist/[22m[2massets/[22m[36mReportOccupancyRatePage-CeFbWxSd.js              [39m[1m[2m   10.82 kB[22m[1m[22m[2m │ gzip:   2.31 kB[22m
[2mdist/[22m[2massets/[22m[36museCitySimulator-Sr01eqx8.js                     [39m[1m[2m   10.99 kB[22m[1m[22m[2m │ gzip:   3.61 kB[22m
[2mdist/[22m[2massets/[22m[36mCreatives-PdIe4MZq.js                            [39m[1m[2m   11.15 kB[22m[1m[22m[2m │ gzip:   2.37 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBudgetDeviationPage-C8YiIFzX.js            [39m[1m[2m   11.40 kB[22m[1m[22m[2m │ gzip:   2.57 kB[22m
[2mdist/[22m[2massets/[22m[36mReportTreasuryProjectionPage-CtoaZcYz.js         [39m[1m[2m   11.42 kB[22m[1m[22m[2m │ gzip:   2.52 kB[22m
[2mdist/[22m[2massets/[22m[36mUserActivityLog-Ca9OMwiW.js                      [39m[1m[2m   11.49 kB[22m[1m[22m[2m │ gzip:   2.45 kB[22m
[2mdist/[22m[2massets/[22m[36mCardItemDocumentsField-BhDzQS8R.js               [39m[1m[2m   11.67 kB[22m[1m[22m[2m │ gzip:   2.99 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSupplierConcentrationPage-CSZMIYAR.js      [39m[1m[2m   11.78 kB[22m[1m[22m[2m │ gzip:   2.27 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSuppliersPage-5vHFhLxR.js                  [39m[1m[2m   12.07 kB[22m[1m[22m[2m │ gzip:   2.55 kB[22m
[2mdist/[22m[2massets/[22m[36mLinkBpLineDialog-CAQ9cO7L.js                     [39m[1m[2m   12.12 kB[22m[1m[22m[2m │ gzip:   2.65 kB[22m
[2mdist/[22m[2massets/[22m[36mManualGaps-3QJCu92K.js                           [39m[1m[2m   12.14 kB[22m[1m[22m[2m │ gzip:   2.62 kB[22m
[2mdist/[22m[2massets/[22m[36mBlogList-ZfxuMema.js                             [39m[1m[2m   12.18 kB[22m[1m[22m[2m │ gzip:   2.21 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminPanel-B5T-ih2a.js                           [39m[1m[2m   12.30 kB[22m[1m[22m[2m │ gzip:   3.62 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadoDetail-CvuxBu9n.js                        [39m[1m[2m   12.34 kB[22m[1m[22m[2m │ gzip:   2.85 kB[22m
[2mdist/[22m[2massets/[22m[36mOnboarding-DO_RBrKX.js                           [39m[1m[2m   12.52 kB[22m[1m[22m[2m │ gzip:   2.82 kB[22m
[2mdist/[22m[2massets/[22m[36mReportProfitabilityPage-DoPEYjnO.js              [39m[1m[2m   12.58 kB[22m[1m[22m[2m │ gzip:   2.92 kB[22m
[2mdist/[22m[2massets/[22m[36mCrmDashboard-BZFr26fz.js                         [39m[1m[2m   12.62 kB[22m[1m[22m[2m │ gzip:   2.97 kB[22m
[2mdist/[22m[2massets/[22m[36mGoogleAdsAdmin-C41AbSuZ.js                       [39m[1m[2m   13.00 kB[22m[1m[22m[2m │ gzip:   2.43 kB[22m
[2mdist/[22m[2massets/[22m[36mformat-CGtoj5si.js                               [39m[1m[2m   13.04 kB[22m[1m[22m[2m │ gzip:   3.48 kB[22m
[2mdist/[22m[2massets/[22m[36mPaginasList-D1qUL8r7.js                          [39m[1m[2m   13.32 kB[22m[1m[22m[2m │ gzip:   2.60 kB[22m
[2mdist/[22m[2massets/[22m[36mEditCampaignPopover-DogRpYra.js                  [39m[1m[2m   13.56 kB[22m[1m[22m[2m │ gzip:   3.25 kB[22m
[2mdist/[22m[2massets/[22m[36mReminders-BBTdpjAS.js                            [39m[1m[2m   13.68 kB[22m[1m[22m[2m │ gzip:   2.90 kB[22m
[2mdist/[22m[2massets/[22m[36mSyncHealth-D-FKTEnR.js                           [39m[1m[2m   13.93 kB[22m[1m[22m[2m │ gzip:   2.43 kB[22m
[2mdist/[22m[2massets/[22m[36mEndossarEventoPage-DskCgEni.js                   [39m[1m[2m   14.00 kB[22m[1m[22m[2m │ gzip:   2.95 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPendencyIndexPage-mP2b6ipP.js              [39m[1m[2m   14.14 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencesList-kKKP5Ycn.js                        [39m[1m[2m   14.30 kB[22m[1m[22m[2m │ gzip:   2.76 kB[22m
[2mdist/[22m[2massets/[22m[36mCategoryFormModal-61Zm4SsW.js                    [39m[1m[2m   14.42 kB[22m[1m[22m[2m │ gzip:   3.24 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencePreviewCount-BHKzhSat.js                 [39m[1m[2m   14.54 kB[22m[1m[22m[2m │ gzip:   3.65 kB[22m
[2mdist/[22m[2massets/[22m[36mEndorsementEditor-BtmersqG.js                    [39m[1m[2m   14.58 kB[22m[1m[22m[2m │ gzip:   2.77 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceEditor-o6MmUqcq.js                       [39m[1m[2m   15.01 kB[22m[1m[22m[2m │ gzip:   2.82 kB[22m
[2mdist/[22m[2massets/[22m[36mTrash-8QKfQ0W3.js                                [39m[1m[2m   15.24 kB[22m[1m[22m[2m │ gzip:   3.14 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPartnerExpensesPage-B7ZKr_Qu.js            [39m[1m[2m   15.29 kB[22m[1m[22m[2m │ gzip:   3.12 kB[22m
[2mdist/[22m[2massets/[22m[36mNewEventoPage-CMyxLvY3.js                        [39m[1m[2m   15.35 kB[22m[1m[22m[2m │ gzip:   2.70 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadosList-CdbPqJbL.js                         [39m[1m[2m   15.69 kB[22m[1m[22m[2m │ gzip:   4.06 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBI-7PKdxUmn.js                              [39m[1m[2m   15.85 kB[22m[1m[22m[2m │ gzip:   3.88 kB[22m
[2mdist/[22m[2massets/[22m[36mContactDetailsSheet-CgKgh2DL.js                  [39m[1m[2m   15.85 kB[22m[1m[22m[2m │ gzip:   2.68 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantPendencies-DWWDOD6d.js                 [39m[1m[2m   15.92 kB[22m[1m[22m[2m │ gzip:   3.37 kB[22m
[2mdist/[22m[2massets/[22m[36mInvoiceGroupAudit-1V2zFLb5.js                    [39m[1m[2m   16.04 kB[22m[1m[22m[2m │ gzip:   3.20 kB[22m
[2mdist/[22m[2massets/[22m[36mRlsLegacyAudit-CARU0kpS.js                       [39m[1m[2m   16.21 kB[22m[1m[22m[2m │ gzip:   2.80 kB[22m
[2mdist/[22m[2massets/[22m[36mRaiseBudgetDialog-CDZc0nW9.js                    [39m[1m[2m   16.39 kB[22m[1m[22m[2m │ gzip:   3.48 kB[22m
[2mdist/[22m[2massets/[22m[36mEditFrenteSheet-Dr892979.js                      [39m[1m[2m   16.42 kB[22m[1m[22m[2m │ gzip:   3.44 kB[22m
[2mdist/[22m[2massets/[22m[36mPaginaEditor-C0bb9t7h.js                         [39m[1m[2m   16.92 kB[22m[1m[22m[2m │ gzip:   3.24 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierTransactions-DK-llVRj.js                 [39m[1m[2m   17.35 kB[22m[1m[22m[2m │ gzip:   3.59 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyNew-EcNn5ej4.js                          [39m[1m[2m   17.39 kB[22m[1m[22m[2m │ gzip:   4.00 kB[22m
[2mdist/[22m[2massets/[22m[36mPurchaseAudienceCard-BYfnM5EW.js                 [39m[1m[2m   17.62 kB[22m[1m[22m[2m │ gzip:   3.35 kB[22m
[2mdist/[22m[2massets/[22m[36mSetup-D_QmsBjW.js                                [39m[1m[2m   17.80 kB[22m[1m[22m[2m │ gzip:   4.13 kB[22m
[2mdist/[22m[2massets/[22m[36mPessoaDetail-07uOiBaB.js                         [39m[1m[2m   18.18 kB[22m[1m[22m[2m │ gzip:   3.52 kB[22m
[2mdist/[22m[2massets/[22m[36mibantools--sXKtUqI.js                            [39m[1m[2m   18.29 kB[22m[1m[22m[2m │ gzip:   3.82 kB[22m
[2mdist/[22m[2massets/[22m[36mInvariantMonitor-DqZTGlrH.js                     [39m[1m[2m   18.90 kB[22m[1m[22m[2m │ gzip:   3.35 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREEmpresarialPage-58jIdvzi.js             [39m[1m[2m   19.17 kB[22m[1m[22m[2m │ gzip:   5.01 kB[22m
[2mdist/[22m[2massets/[22m[36mClubeNewgang-CCuR9Qt1.js                         [39m[1m[2m   19.18 kB[22m[1m[22m[2m │ gzip:   3.16 kB[22m
[2mdist/[22m[2massets/[22m[36mTerms-BSfm1mIU.js                                [39m[1m[2m   19.48 kB[22m[1m[22m[2m │ gzip:   2.98 kB[22m
[2mdist/[22m[2massets/[22m[36mAbout-D6oaPrVt.js                                [39m[1m[2m   19.79 kB[22m[1m[22m[2m │ gzip:   2.88 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountCategories-BWzbpJJM.js                    [39m[1m[2m   19.94 kB[22m[1m[22m[2m │ gzip:   3.76 kB[22m
[2mdist/[22m[2massets/[22m[36mNotifications-C2hN_n9_.js                        [39m[1m[2m   20.06 kB[22m[1m[22m[2m │ gzip:   2.59 kB[22m
[2mdist/[22m[2massets/[22m[36mQuotations-BZgJK9MG.js                           [39m[1m[2m   20.40 kB[22m[1m[22m[2m │ gzip:   3.83 kB[22m
[2mdist/[22m[2massets/[22m[36mEventImplementations-gWNd_HhQ.js                 [39m[1m[2m   20.52 kB[22m[1m[22m[2m │ gzip:   3.92 kB[22m
[2mdist/[22m[2massets/[22m[36mVideosList-BqbUe9DD.js                           [39m[1m[2m   20.74 kB[22m[1m[22m[2m │ gzip:   4.07 kB[22m
[2mdist/[22m[2massets/[22m[36mBlogEditor-C5nNL6EO.js                           [39m[1m[2m   20.75 kB[22m[1m[22m[2m │ gzip:   3.86 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPartnerSettlementPage-CtVUtnZw.js          [39m[1m[2m   21.01 kB[22m[1m[22m[2m │ gzip:   3.90 kB[22m
[2mdist/[22m[2massets/[22m[36mPressList-BokAg6r0.js                            [39m[1m[2m   21.98 kB[22m[1m[22m[2m │ gzip:   4.32 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDocumentPendencies-CcJTNKga.js             [39m[1m[2m   22.30 kB[22m[1m[22m[2m │ gzip:   3.75 kB[22m
[2mdist/[22m[2massets/[22m[36mparse-B9BIfq30.js                                [39m[1m[2m   22.36 kB[22m[1m[22m[2m │ gzip:   4.64 kB[22m
[2mdist/[22m[2massets/[22m[36mDuelView-BELc22A0.js                             [39m[1m[2m   22.40 kB[22m[1m[22m[2m │ gzip:   4.80 kB[22m
[2mdist/[22m[2massets/[22m[36mPortalSettings-DCRJfzXf.js                       [39m[1m[2m   22.72 kB[22m[1m[22m[2m │ gzip:   4.15 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteDetail-Cmi5kMdv.js                         [39m[1m[2m   22.92 kB[22m[1m[22m[2m │ gzip:   4.55 kB[22m
[2mdist/[22m[2massets/[22m[36mEventosList-DIoKRzVc.js                          [39m[1m[2m   23.57 kB[22m[1m[22m[2m │ gzip:   3.78 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimEquipa-G445oKTI.js                        [39m[1m[2m   23.75 kB[22m[1m[22m[2m │ gzip:   4.97 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyNewDesign-BvDujeTL.js                    [39m[1m[2m   24.12 kB[22m[1m[22m[2m │ gzip:   4.97 kB[22m
[2mdist/[22m[2massets/[22m[36mCreativeNew-95ZCc5JL.js                          [39m[1m[2m   24.82 kB[22m[1m[22m[2m │ gzip:   5.42 kB[22m
[2mdist/[22m[2massets/[22m[36mCampoView-B9L0Kzf8.js                            [39m[1m[2m   24.94 kB[22m[1m[22m[2m │ gzip:   5.29 kB[22m
[2mdist/[22m[2massets/[22m[36mReportCashFlowPage-B1Fch0iD.js                   [39m[1m[2m   25.27 kB[22m[1m[22m[2m │ gzip:   4.52 kB[22m
[2mdist/[22m[2massets/[22m[36mReportIvaAuditPage-Cg9V8_kb.js                   [39m[1m[2m   25.61 kB[22m[1m[22m[2m │ gzip:   4.82 kB[22m
[2mdist/[22m[2massets/[22m[36mpurify.es-8E279hYE.js                            [39m[1m[2m   25.61 kB[22m[1m[22m[2m │ gzip:   9.67 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyPrint-B1KGkK2i.js                        [39m[1m[2m   25.70 kB[22m[1m[22m[2m │ gzip:   3.73 kB[22m
[2mdist/[22m[2massets/[22m[36mCustomerMatchUpload-C1GeiPtw.js                  [39m[1m[2m   25.93 kB[22m[1m[22m[2m │ gzip:   4.15 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyPlanCard-D-PKo9YU.js                     [39m[1m[2m   26.30 kB[22m[1m[22m[2m │ gzip:   4.19 kB[22m
[2mdist/[22m[2massets/[22m[36mEventTrackersCard-DKZgzkNN.js                    [39m[1m[2m   26.44 kB[22m[1m[22m[2m │ gzip:   4.40 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDailySalesPage-CWqqeGxb.js                 [39m[1m[2m   26.77 kB[22m[1m[22m[2m │ gzip:   5.41 kB[22m
[2mdist/[22m[2massets/[22m[36mCardSessions-W0G_shIk.js                         [39m[1m[2m   27.02 kB[22m[1m[22m[2m │ gzip:   5.39 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapasList-BF2CUYBi.js                           [39m[1m[2m   27.80 kB[22m[1m[22m[2m │ gzip:   6.96 kB[22m
[2mdist/[22m[2massets/[22m[36mReconciliacaoBpTx-ChiwtHi7.js                    [39m[1m[2m   27.82 kB[22m[1m[22m[2m │ gzip:   5.29 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountingExport-BaOCupX4.js               [39m[1m[2m   28.66 kB[22m[1m[22m[2m │ gzip:   5.05 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaignFromScratch-fHTCrq1F.js                  [39m[1m[2m   28.91 kB[22m[1m[22m[2m │ gzip:   5.26 kB[22m
[2mdist/[22m[2massets/[22m[36mPixels-AE-BbJ2s.js                               [39m[1m[2m   29.51 kB[22m[1m[22m[2m │ gzip:   4.43 kB[22m
[2mdist/[22m[2massets/[22m[36mRecurringTransactions-BsJw6IVL.js                [39m[1m[2m   29.69 kB[22m[1m[22m[2m │ gzip:   5.05 kB[22m
[2mdist/[22m[2massets/[22m[36mContactosList-CNJ43KuK.js                        [39m[1m[2m   30.16 kB[22m[1m[22m[2m │ gzip:   5.79 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-revenue-basis-CKj5H3xE.js                  [39m[1m[2m   30.57 kB[22m[1m[22m[2m │ gzip:  10.47 kB[22m
[2mdist/[22m[2massets/[22m[36mUserManagement-Desy6tA9.js                       [39m[1m[2m   30.94 kB[22m[1m[22m[2m │ gzip:   6.25 kB[22m
[2mdist/[22m[2massets/[22m[36mConnections-POKrhBOv.js                          [39m[1m[2m   31.08 kB[22m[1m[22m[2m │ gzip:   6.43 kB[22m
[2mdist/[22m[2massets/[22m[36mFormalidadeAudit-p3bpMEsy.js                     [39m[1m[2m   31.63 kB[22m[1m[22m[2m │ gzip:   5.57 kB[22m
[2mdist/[22m[2massets/[22m[36mDataEntryDialog-BpTCP2WL.js                      [39m[1m[2m   31.97 kB[22m[1m[22m[2m │ gzip:   6.25 kB[22m
[2mdist/[22m[2massets/[22m[36mLeadsList-Btns08dw.js                            [39m[1m[2m   32.09 kB[22m[1m[22m[2m │ gzip:   5.02 kB[22m
[2mdist/[22m[2massets/[22m[36mReportArtistCache-B2Ul4PtL.js                    [39m[1m[2m   32.80 kB[22m[1m[22m[2m │ gzip:   8.51 kB[22m
[2mdist/[22m[2massets/[22m[36mInsights-BBKjiwn8.js                             [39m[1m[2m   33.24 kB[22m[1m[22m[2m │ gzip:   4.81 kB[22m
[2mdist/[22m[2massets/[22m[36mCartaoEquipa-BEXtZ9H0.js                         [39m[1m[2m   33.44 kB[22m[1m[22m[2m │ gzip:   7.48 kB[22m
[2mdist/[22m[2massets/[22m[36mBolSync-Ck4-UIXQ.js                              [39m[1m[2m   33.53 kB[22m[1m[22m[2m │ gzip:   5.30 kB[22m
[2mdist/[22m[2massets/[22m[36mMetaCapiMonitor-Dp1SBw4_.js                      [39m[1m[2m   33.57 kB[22m[1m[22m[2m │ gzip:   4.34 kB[22m
[2mdist/[22m[2massets/[22m[36mBatchPaymentModal-CtV5mWbr.js                    [39m[1m[2m   33.67 kB[22m[1m[22m[2m │ gzip:   8.39 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaSuppliersPanel-DTK2UbSR.js                  [39m[1m[2m   33.97 kB[22m[1m[22m[2m │ gzip:   4.51 kB[22m
[2mdist/[22m[2massets/[22m[36mIvaManagement-DwlfDz5H.js                        [39m[1m[2m   34.72 kB[22m[1m[22m[2m │ gzip:   5.30 kB[22m
[2mdist/[22m[2massets/[22m[36mcalendar-CQ-sDLaB.js                             [39m[1m[2m   35.03 kB[22m[1m[22m[2m │ gzip:  11.08 kB[22m
[2mdist/[22m[2massets/[22m[36mPrivacy-DEKD9e0v.js                              [39m[1m[2m   35.05 kB[22m[1m[22m[2m │ gzip:   4.93 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBIDetail-CVKRJxFs.js                        [39m[1m[2m   35.06 kB[22m[1m[22m[2m │ gzip:   8.16 kB[22m
[2mdist/[22m[2massets/[22m[36mReportForecastPayablesPage-HHxShlrd.js           [39m[1m[2m   36.34 kB[22m[1m[22m[2m │ gzip:   5.74 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketlineSync-CtNYqxtH.js                       [39m[1m[2m   36.61 kB[22m[1m[22m[2m │ gzip:   5.88 kB[22m
[2mdist/[22m[2massets/[22m[36mFunnelTest-C1FC1hW5.js                           [39m[1m[2m   37.14 kB[22m[1m[22m[2m │ gzip:   7.54 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactionDocumentsModal-CSLANKZk.js            [39m[1m[2m   38.04 kB[22m[1m[22m[2m │ gzip:   7.91 kB[22m
[2mdist/[22m[2massets/[22m[36mReportContasPagarPage-UI6S_cR6.js                [39m[1m[2m   38.10 kB[22m[1m[22m[2m │ gzip:   6.78 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREBrasilPage-DBggtvW3.js                  [39m[1m[2m   38.35 kB[22m[1m[22m[2m │ gzip:   7.39 kB[22m
[2mdist/[22m[2massets/[22m[36mAudit-DasmXjGu.js                                [39m[1m[2m   39.28 kB[22m[1m[22m[2m │ gzip:   6.63 kB[22m
[2mdist/[22m[2massets/[22m[36mDashboard-BBFC8kKc.js                            [39m[1m[2m   39.53 kB[22m[1m[22m[2m │ gzip:   7.65 kB[22m
[2mdist/[22m[2massets/[22m[36mBPPlanilha-B1xHMh5E.js                           [39m[1m[2m   39.96 kB[22m[1m[22m[2m │ gzip:  11.61 kB[22m
[2mdist/[22m[2massets/[22m[36mHelpCenter-IjnyWlaM.js                           [39m[1m[2m   40.13 kB[22m[1m[22m[2m │ gzip:  12.09 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantStandaloneInvoicesTab-R4fi1Mz3.js      [39m[1m[2m   40.24 kB[22m[1m[22m[2m │ gzip:   8.23 kB[22m
[2mdist/[22m[2massets/[22m[36mCompanies-DTWIgH_X.js                            [39m[1m[2m   41.85 kB[22m[1m[22m[2m │ gzip:   6.11 kB[22m
[2mdist/[22m[2massets/[22m[36mmarked.esm-DiRRsLPS.js                           [39m[1m[2m   42.33 kB[22m[1m[22m[2m │ gzip:  12.79 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteManage-BbuA1CI_.js                         [39m[1m[2m   43.11 kB[22m[1m[22m[2m │ gzip:   6.97 kB[22m
[2mdist/[22m[2massets/[22m[36mMetaAudiencesList-D3tnfyXo.js                    [39m[1m[2m   43.38 kB[22m[1m[22m[2m │ gzip:   6.49 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREPage-DCHuOuuh.js                        [39m[1m[2m   44.48 kB[22m[1m[22m[2m │ gzip:   8.62 kB[22m
[2mdist/[22m[2massets/[22m[36mReportMovementReconciliationPage-FGxXqg64.js     [39m[1m[2m   44.80 kB[22m[1m[22m[2m │ gzip:   7.87 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOfficeSettlementsOverview-BrO_TH-h.js      [39m[1m[2m   45.49 kB[22m[1m[22m[2m │ gzip:   7.11 kB[22m
[2mdist/[22m[2massets/[22m[36msortable.esm-CvbFPBOB.js                         [39m[1m[2m   45.88 kB[22m[1m[22m[2m │ gzip:  15.28 kB[22m
[2mdist/[22m[2massets/[22m[36mFeverSync-CTTMDQRM.js                            [39m[1m[2m   46.58 kB[22m[1m[22m[2m │ gzip:   8.40 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarim-BkrnPbtt.js                              [39m[1m[2m   46.64 kB[22m[1m[22m[2m │ gzip:   7.36 kB[22m
[2mdist/[22m[2massets/[22m[36mSecurityDashboard-BjssXbcL.js                    [39m[1m[2m   47.37 kB[22m[1m[22m[2m │ gzip:   6.89 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBPTransactionsPage-DpOMIYix.js             [39m[1m[2m   48.18 kB[22m[1m[22m[2m │ gzip:   8.89 kB[22m
[2mdist/[22m[2massets/[22m[36mEquipaView-Dt2wZERw.js                           [39m[1m[2m   48.30 kB[22m[1m[22m[2m │ gzip:   8.16 kB[22m
[2mdist/[22m[2massets/[22m[36mStandaloneInvoiceScanner-BU8-mm0F.js             [39m[1m[2m   49.39 kB[22m[1m[22m[2m │ gzip:  11.63 kB[22m
[2mdist/[22m[2massets/[22m[36mZonasList-1x607nvZ.js                            [39m[1m[2m   51.74 kB[22m[1m[22m[2m │ gzip:  10.05 kB[22m
[2mdist/[22m[2massets/[22m[36mDatabaseBackups-C9JQT98I.js                      [39m[1m[2m   51.79 kB[22m[1m[22m[2m │ gzip:   8.63 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaDetail-CENNw_9y.js                          [39m[1m[2m   51.87 kB[22m[1m[22m[2m │ gzip:   9.15 kB[22m
[2mdist/[22m[2massets/[22m[36mEventSimulatorDemo-CENUSl8-.js                   [39m[1m[2m   52.26 kB[22m[1m[22m[2m │ gzip:   6.36 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPLPage-CjeFUUJq.js                         [39m[1m[2m   53.54 kB[22m[1m[22m[2m │ gzip:  10.35 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyRedesign-CAwJTI4B.js                     [39m[1m[2m   53.88 kB[22m[1m[22m[2m │ gzip:   8.08 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBankStatementPage-CKkN8gxh.js              [39m[1m[2m   54.00 kB[22m[1m[22m[2m │ gzip:  10.24 kB[22m
[2mdist/[22m[2massets/[22m[36mCreativeView-BtQ2g6lH.js                         [39m[1m[2m   54.63 kB[22m[1m[22m[2m │ gzip:   8.07 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceGoogleAds-Bsa-Vxnh.js                    [39m[1m[2m   57.26 kB[22m[1m[22m[2m │ gzip:  10.03 kB[22m
[2mdist/[22m[2massets/[22m[36mReimbursements-DTrEPoMm.js                       [39m[1m[2m   61.08 kB[22m[1m[22m[2m │ gzip:  11.30 kB[22m
[2mdist/[22m[2massets/[22m[36mRegistroFeed-Fig2fytz.js                         [39m[1m[2m   66.87 kB[22m[1m[22m[2m │ gzip:  10.96 kB[22m
[2mdist/[22m[2massets/[22m[36mAdsInvoices-C0IsT89m.js                          [39m[1m[2m   68.76 kB[22m[1m[22m[2m │ gzip:  11.71 kB[22m
[2mdist/[22m[2massets/[22m[36mEvents-DuFVp7l6.js                               [39m[1m[2m   69.16 kB[22m[1m[22m[2m │ gzip:  11.99 kB[22m
[2mdist/[22m[2massets/[22m[36mManualSync-NEjVkeQ7.js                           [39m[1m[2m   69.44 kB[22m[1m[22m[2m │ gzip:  22.06 kB[22m
[2mdist/[22m[2massets/[22m[36mReportTicketOfficeAuditPage-gn9KeRXb.js          [39m[1m[2m   70.30 kB[22m[1m[22m[2m │ gzip:  11.52 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimItemAttachmentButton-DtzBXdRw.js          [39m[1m[2m   70.39 kB[22m[1m[22m[2m │ gzip:  15.81 kB[22m
[2mdist/[22m[2massets/[22m[36mEventCalendar-Df9WbLmj.js                        [39m[1m[2m   70.98 kB[22m[1m[22m[2m │ gzip:  11.77 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBIEvent-BRvgFOFG.js                         [39m[1m[2m   71.46 kB[22m[1m[22m[2m │ gzip:  12.43 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOfficeSettlementModal-B5w5wJ8n.js          [39m[1m[2m   77.07 kB[22m[1m[22m[2m │ gzip:  13.48 kB[22m
[2mdist/[22m[2massets/[22m[36mSuppliers-B_ofCi6o.js                            [39m[1m[2m   79.99 kB[22m[1m[22m[2m │ gzip:  12.25 kB[22m
[2mdist/[22m[2massets/[22m[36minstallment-guard-DyMgEEZe.js                    [39m[1m[2m   84.56 kB[22m[1m[22m[2m │ gzip:  15.18 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierFormModal-BVIM32uY.js                    [39m[1m[2m   86.06 kB[22m[1m[22m[2m │ gzip:  18.67 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantHome-iSGQC8Fh.js                       [39m[1m[2m   86.51 kB[22m[1m[22m[2m │ gzip:  13.13 kB[22m
[2mdist/[22m[2massets/[22m[36mEventHub-BEnfwIjY.js                             [39m[1m[2m   86.77 kB[22m[1m[22m[2m │ gzip:  13.91 kB[22m
[2mdist/[22m[2massets/[22m[36mCoalaSync-fHfQpyAH.js                            [39m[1m[2m   89.50 kB[22m[1m[22m[2m │ gzip:  15.16 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencePrint-Dy-HHV9_.js                        [39m[1m[2m   89.94 kB[22m[1m[22m[2m │ gzip:  11.04 kB[22m
[2mdist/[22m[2massets/[22m[36mAuditoriaContas-B45Wb_1y.js                      [39m[1m[2m   94.02 kB[22m[1m[22m[2m │ gzip:  16.87 kB[22m
[2mdist/[22m[2massets/[22m[36mjszip.min-CnBbpjIO.js                            [39m[1m[2m   97.24 kB[22m[1m[22m[2m │ gzip:  30.05 kB[22m
[2mdist/[22m[2massets/[22m[36mFinancialAccounts-DDJcVtHv.js                    [39m[1m[2m  119.31 kB[22m[1m[22m[2m │ gzip:  18.28 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyView-lALP__Xb.js                         [39m[1m[2m  124.91 kB[22m[1m[22m[2m │ gzip:  19.05 kB[22m
[2mdist/[22m[2massets/[22m[36mEventMarketingEditor-TfLawlOu.js                 [39m[1m[2m  127.70 kB[22m[1m[22m[2m │ gzip:  18.27 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimSessionDetail-C8FYUDko.js                 [39m[1m[2m  135.08 kB[22m[1m[22m[2m │ gzip:  23.54 kB[22m
[2mdist/[22m[2massets/[22m[36mBankReconciliation-Bxvh2Jv9.js                   [39m[1m[2m  136.96 kB[22m[1m[22m[2m │ gzip:  26.81 kB[22m
[2mdist/[22m[2massets/[22m[36mCardSessionDetail-fXD3egBA.js                    [39m[1m[2m  150.04 kB[22m[1m[22m[2m │ gzip:  27.50 kB[22m
[2mdist/[22m[2massets/[22m[36mindex.es-DmsDyuHC.js                             [39m[1m[2m  150.74 kB[22m[1m[22m[2m │ gzip:  51.38 kB[22m
[2mdist/[22m[2massets/[22m[36mNewgangSite-Bxw5Yne0.js                          [39m[1m[2m  154.45 kB[22m[1m[22m[2m │ gzip:  26.69 kB[22m
[2mdist/[22m[2massets/[22m[36mhtml2canvas.esm-CBrSDip1.js                      [39m[1m[2m  201.42 kB[22m[1m[22m[2m │ gzip:  47.70 kB[22m
[2mdist/[22m[2massets/[22m[36mticket-office-settlement-form-BS89Wh4P.js        [39m[1m[2m  203.09 kB[22m[1m[22m[2m │ gzip:  40.73 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPaymentListsPage-CzrUSuwf.js               [39m[1m[2m  203.13 kB[22m[1m[22m[2m │ gzip:  39.52 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-supabase-3MT7AzyV.js                      [39m[1m[2m  209.56 kB[22m[1m[22m[2m │ gzip:  54.23 kB[22m
[2mdist/[22m[2massets/[22m[36mEventImplementationDetail-BHn4RIwU.js            [39m[1m[2m  228.98 kB[22m[1m[22m[2m │ gzip:  36.33 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaigns-B0ZAZtbA.js                            [39m[1m[2m  247.47 kB[22m[1m[22m[2m │ gzip:  42.77 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactions-jj_EDYQj.js                         [39m[1m[2m  265.63 kB[22m[1m[22m[2m │ gzip:  46.68 kB[22m
[2mdist/[22m[2massets/[22m[36mEventSimulator-DJ_YrSBK.js                       [39m[1m[2m  291.98 kB[22m[1m[22m[2m │ gzip:  46.27 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOffices-C5kPJkwC.js                        [39m[1m[2m  323.04 kB[22m[1m[22m[2m │ gzip:  53.35 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactionEditModal-T6p8-67u.js                 [39m[1m[2m  351.19 kB[22m[1m[22m[2m │ gzip:  59.73 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-pdf-Cg0OIXZi.js                           [39m[1m[2m  421.80 kB[22m[1m[22m[2m │ gzip: 137.18 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-react-KQt1rZym.js                         [39m[1m[2m  438.02 kB[22m[1m[22m[2m │ gzip: 134.70 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaignView-D-GAG6pr.js                         [39m[1m[2m  445.71 kB[22m[1m[22m[2m │ gzip:  72.93 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-charts-CvYs9c1O.js                        [39m[1m[2m  448.41 kB[22m[1m[22m[2m │ gzip: 119.60 kB[22m
[2mdist/[22m[2massets/[22m[36mpdf-first-page-to-jpeg-M5CLsCvW.js               [39m[1m[2m  458.53 kB[22m[1m[22m[2m │ gzip: 135.85 kB[22m
[2mdist/[22m[2massets/[22m[36mEventForecast-L74UnYkB.js                        [39m[1m[33m  758.89 kB[39m[22m[2m │ gzip: 129.10 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-ui-DC4k8uTt.js                            [39m[1m[33m1,068.27 kB[39m[22m[2m │ gzip: 220.41 kB[22m
[2mdist/[22m[2massets/[22m[36mEventDetail-DFmimIHK.js                          [39m[1m[33m1,096.98 kB[39m[22m[2m │ gzip: 185.01 kB[22m
[2mdist/[22m[2massets/[22m[36mindex-DBqmiFZz.js                                [39m[1m[33m1,215.39 kB[39m[22m[2m │ gzip: 265.65 kB[22m
[2mdist/[22m[2massets/[22m[36mheic2any-BcfgmVBS.js                             [39m[1m[33m1,352.85 kB[39m[22m[2m │ gzip: 341.38 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-xlsx-CIt_8dee.js                          [39m[1m[33m1,369.76 kB[39m[22m[2m │ gzip: 412.26 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-handsontable-CE0eIcQY.js                  [39m[1m[33m1,918.23 kB[39m[22m[2m │ gzip: 457.52 kB[22m
[2mdist/[22m[2massets/[22m[36mheic-to-lXPrQE7P.js                              [39m[1m[33m2,995.46 kB[39m[22m[2m │ gzip: 736.99 kB[22m
[33m
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
[32m✓ built in 1m 8s[39m

PWA v1.3.0
mode      generateSW
precache  343 entries (24401.99 KiB)
files generated
  dist/sw.js
  dist/workbox-52dea471.js

EXIT: 0

```

## Regressão UI adicional após congelar código (exit 0)

```text
COMMAND: vitest run --config docs/testes/issue333/vitest.integrated.config.ts

 RUN  v3.2.7 /tmp/issue333-integrated-qpis4_bk/tree

 ✓ docs/testes/issue333/integrated/endpoint.test.ts (27 tests) 199ms
stderr | docs/testes/issue333/integrated/ui.test.tsx > real patched scanner/editor + fake client; not RLS acceptance > scanner incomplete key lost response locks save; persistent query still works after local storage cleared
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

stderr | docs/testes/issue333/integrated/ui.test.tsx > real patched scanner/editor + fake client; not RLS acceptance > editor own-ID exclusion allows update; lost response blocks repeat and keeps candidate
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

stderr | docs/testes/issue333/integrated/ui.test.tsx > real patched scanner/editor + fake client; not RLS acceptance > editor 23505 is not a success and cannot repeat UPDATE
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 ✓ docs/testes/issue333/integrated/ui.test.tsx (11 tests) 1447ms
   ✓ real patched scanner/editor + fake client; not RLS acceptance > scanner incomplete key lost response locks save; persistent query still works after local storage cleared  418ms
   ✓ real patched scanner/editor + fake client; not RLS acceptance > editor own-ID exclusion allows update; lost response blocks repeat and keeps candidate  307ms

 Test Files  2 passed (2)
      Tests  38 passed (38)
   Start at  19:35:51
   Duration  4.88s (transform 517ms, setup 276ms, collect 1.17s, tests 1.65s, environment 2.00s, prepare 1.25s)


EXIT: 0
```

## Hashes finais e manifesto

```text
3b395f7a82de75b2118c2bf2e839447f69638e9804ce934cff75544ad98badcc  patches/issue333/compatibility.PENDENTE.patch
1ea42086b7ab746e2ce4fe582f98511ba42fa84bd0456341a50e2cceb46fbbb7  patches/issue333/base-sha256.txt
901c916373e3808a707494683d319cb4eee88acd56ab008a4eed039b6f644f8e  supabase/manual/20261017_issue333_attempts.PENDENTE.sql
9f8baeea0a19931c6b591aaf8f65d2429845bacd0c2a66004ef24b0501d8c3ef  patches/issue333/core.PENDENTE.sql
e6d85d294eefb9b764a2a1cb81469398f43e3c8cc7cf6900ead3acbe52cf39ab  supabase/manual/20261017_issue333_normalized_uniqueness.PROPOSTA.sql
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  BASE supabase/functions/_shared/standalone-identity.ts
9287577aad083ec17a4e94c430b62eb2bdbb50c3607689a9cd0d6406937c0603  PREPARED supabase/functions/_shared/standalone-identity.ts
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  BASE supabase/functions/_shared/standalone-compat.ts
9243bf160ce8e9d540c179e17d0c61fa2b498bef083899ac95f2b9e454a83e27  PREPARED supabase/functions/_shared/standalone-compat.ts
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  BASE src/lib/standalone-identity-lookup.ts
039341ca046e172bfccd55e01bbfed6e642ebf2d8193a6c45f73316396426827  PREPARED src/lib/standalone-identity-lookup.ts
6b200dcb4ed9055facc0539bdf4a5199766dbaff429d3f0e1b8d0b8cabb64970  BASE src/pages/StandaloneInvoiceScanner.tsx
28365c1763ea6e070d2ce60c1af620318210953bc153ef4a79b713a5e7c62eeb  PREPARED src/pages/StandaloneInvoiceScanner.tsx
738f51e755b4c5fad177cddada0ba8c57533e114c79bb7b259a359840a62a2e8  BASE src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx
77e4a70d02ff98b7e701a204491960d44ed53635ef7cd76c7e68d6a2f6ac0e1d  PREPARED src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx
12ebc712b09065072e503985ce1253f4916d4a03c68d30ee7a863964b2fa4621  BASE supabase/functions/ingest-standalone-invoice/index.ts
18265f2a3e9734e6cbad861306673d2b668450f45c48bec9eb6990819558a4bd  PREPARED supabase/functions/ingest-standalone-invoice/index.ts
4eeff2dfcf487f9ea211a0434d18a4a062c69e2a666744aa4954537ce592f8a3  BASE supabase/manual/20261017_issue333_core.PENDENTE.sql
9f8baeea0a19931c6b591aaf8f65d2429845bacd0c2a66004ef24b0501d8c3ef  PREPARED supabase/manual/20261017_issue333_core.PENDENTE.sql
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  BASE supabase/functions/_shared/standalone-attempt.ts
68a5068ce08493084e1ec0a64c8ad4ca0408fe10c45f1e5e81d510f3f390d690  PREPARED supabase/functions/_shared/standalone-attempt.ts
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  BASE src/lib/standalone-attempt-client.ts
626b7690b9cad2bb577c6abcd409cb820aed4fb77272539f480c77ac2302d1e9  PREPARED src/lib/standalone-attempt-client.ts
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  BASE supabase/functions/standalone-attempt-333/handler.ts
d89f91fcd6b32d70729af6b7469cd255963ed79d041458ab3c81118ca7c64c08  PREPARED supabase/functions/standalone-attempt-333/handler.ts
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  BASE supabase/functions/standalone-attempt-333/index.ts
ef9fbf60576e5cf4063868be8416f1e46c42d0b67c750cdd7dc14e1ab94a668a  PREPARED supabase/functions/standalone-attempt-333/index.ts
8c465509b4419514bba43cfcda3c61e7f2fcc21e8faa56d6f5fdd54d14dad19c  BASE supabase/config.toml
d06f66b98c5462248d081239cb478635efbe89e3374f2653be5d40824abeb847  PREPARED supabase/config.toml
901c916373e3808a707494683d319cb4eee88acd56ab008a4eed039b6f644f8e  BASE supabase/manual/20261017_issue333_attempts.PENDENTE.sql
901c916373e3808a707494683d319cb4eee88acd56ab008a4eed039b6f644f8e  PREPARED supabase/manual/20261017_issue333_attempts.PENDENTE.sql
fb051a8306001dff7a1256fa59a67b3bac4407d45215bb7064875818a5a50b72  BASE supabase/functions/data-entry/handler.ts
92c2a62a2b5b7edd505a5f6834cb80caf1961a1404e088dbac07a85e6565fb53  PREPARED supabase/functions/data-entry/handler.ts
```
