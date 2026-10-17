# #333 — outputs integrais da validação isolada final (decisões A–D + gate fechado)

Base 7be0095f76476f51d84150df71d0fb0bf62b0eaa (archive) + patch inerte; cópia descartável sem credenciais/rede. Saídas brutas sem edição.

## apply.log
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

## tsgo.log
```text
COMMAND: /nix/store/bfdb6m7h90ylv0min5ssby14snk6kp95-sandbox-global-tools-node-modules-1.0.0/node_modules/@typescript/native-preview/bin/tsgo.js -p tsconfig.app.json --noEmit

EXIT: 0
```

## deno.log
```text
COMMAND: /bin/deno check --no-remote --config deno-isolated.json supabase/functions/ingest-standalone-invoice/index.ts supabase/functions/_shared/standalone-compat.ts supabase/functions/standalone-attempt-333/handler.ts supabase/functions/standalone-attempt-333/index.ts supabase/functions/data-entry/handler.ts
[0m[32mCheck[0m supabase/functions/ingest-standalone-invoice/index.ts
[0m[32mCheck[0m supabase/functions/_shared/standalone-compat.ts
[0m[32mCheck[0m supabase/functions/standalone-attempt-333/handler.ts
[0m[32mCheck[0m supabase/functions/standalone-attempt-333/index.ts
[0m[32mCheck[0m supabase/functions/data-entry/handler.ts

EXIT: 0
```

## integrated.log
```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config docs/testes/issue333/vitest.integrated.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated-e5jwzn52/tree[39m

 [32m✓[39m docs/testes/issue333/integrated/endpoint.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 181[2mms[22m[39m
[90mstderr[2m | docs/testes/issue333/integrated/ui.test.tsx[2m > [22m[2mreal patched scanner/editor + fake client; not RLS acceptance[2m > [22m[2mscanner incomplete key lost response locks save; persistent query still works after local storage cleared
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | docs/testes/issue333/integrated/ui.test.tsx[2m > [22m[2mreal patched scanner/editor + fake client; not RLS acceptance[2m > [22m[2meditor own-ID exclusion allows update; lost response blocks repeat and keeps candidate
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | docs/testes/issue333/integrated/ui.test.tsx[2m > [22m[2mreal patched scanner/editor + fake client; not RLS acceptance[2m > [22m[2meditor 23505 is not a success and cannot repeat UPDATE
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 [32m✓[39m docs/testes/issue333/integrated/ui.test.tsx [2m([22m[2m11 tests[22m[2m)[22m[33m 1322[2mms[22m[39m
   [33m[2m✓[22m[39m real patched scanner/editor + fake client; not RLS acceptance[2m > [22mscanner incomplete key lost response locks save; persistent query still works after local storage cleared [33m 388[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m38 passed[39m[22m[90m (38)[39m
[2m   Start at [22m 20:19:54
[2m   Duration [22m 4.23s[2m (transform 460ms, setup 330ms, collect 1.06s, tests 1.50s, environment 1.56s, prepare 1.16s)[22m


EXIT: 0
```

## entry.log
```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config docs/testes/issue333/vitest.entry.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated-e5jwzn52/tree[39m

 [32m✓[39m docs/testes/issue333/integrated/attempt-entry.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 1212[2mms[22m[39m
   [33m[2m✓[22m[39m Chromium cross-origin fetch performs actual OPTIONS then POST using candidate entry headers [33m 1132[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m7 passed[39m[22m[90m (7)[39m
[2m   Start at [22m 20:19:59
[2m   Duration [22m 2.21s[2m (transform 112ms, setup 0ms, collect 81ms, tests 1.21s, environment 0ms, prepare 461ms)[22m


EXIT: 0
```

## pg.log
```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config docs/testes/issue333/vitest.pg.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated-e5jwzn52/tree[39m

 [32m✓[39m docs/testes/issue333/pg/data-entry-pg.test.ts [2m([22m[2m36 tests[22m[2m)[22m[33m 7270[2mms[22m[39m
   [33m[2m✓[22m[39m #333 concorrência real entre duas ligações[2m > [22mmesmo lote/documento em duas ligações: a 2.ª espera e devolve o MESMO resultado; 1 avulsa [33m 433[2mms[22m[39m
   [33m[2m✓[22m[39m #333 concorrência real entre duas ligações[2m > [22mdois lotes com a mesma fatura: o lock serializa e o 2.º recebe 'já existe' [33m 454[2mms[22m[39m
   [33m[2m✓[22m[39m #333 concorrência real entre duas ligações[2m > [22mescritor legado com a MESMA grafia: o índice canónico bloqueia o 2.º (qualquer ordem) [33m 879[2mms[22m[39m
   [33m[2m✓[22m[39m #333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22massistant × adapted real legacy INSERT equivalent; legacy first=true [33m 421[2mms[22m[39m
   [33m[2m✓[22m[39m #333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22massistant × adapted real legacy INSERT equivalent; legacy first=false [33m 422[2mms[22m[39m
   [33m[2m✓[22m[39m #333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mlegacy × legacy INSERT both orders firstLower=true [33m 404[2mms[22m[39m
   [33m[2m✓[22m[39m #333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mlegacy × legacy INSERT both orders firstLower=false [33m 403[2mms[22m[39m
   [33m[2m✓[22m[39m #333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mlegacy INSERT × legacy UPDATE collision with barrier; insert first=true [33m 407[2mms[22m[39m
   [33m[2m✓[22m[39m #333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mlegacy INSERT × legacy UPDATE collision with barrier; insert first=false [33m 405[2mms[22m[39m
   [33m[2m✓[22m[39m #333 EXACT proposed index on real compatible standalone table (local ONLY)[2m > [22mstrong duplicate 23505 failure rollback permits waiting competitor, no duplicate audit [33m 404[2mms[22m[39m
 [32m✓[39m docs/testes/issue333/pg/attempts-pg.test.ts [2m([22m[2m31 tests[22m[2m)[22m[33m 2662[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m67 passed[39m[22m[90m (67)[39m
[2m   Start at [22m 20:20:02
[2m   Duration [22m 11.00s[2m (transform 201ms, setup 0ms, collect 295ms, tests 9.93s, environment 0ms, prepare 345ms)[22m


EXIT: 0
```

## handler.log
```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config docs/testes/issue333/vitest.handler.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated-e5jwzn52/tree[39m

 [32m✓[39m docs/testes/issue333/handler/handler.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 103[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m20 passed[39m[22m[90m (20)[39m
[2m   Start at [22m 20:20:13
[2m   Duration [22m 1.55s[2m (transform 150ms, setup 0ms, collect 180ms, tests 103ms, environment 0ms, prepare 606ms)[22m


EXIT: 0
```

## general.log
```text
COMMAND: /dev-server/node_modules/.bin/vitest run --config vitest.offline.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-integrated-e5jwzn52/tree[39m

 [32m✓[39m src/lib/__tests__/supplier-credits.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/statement-grouping.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/split-adjustment.test.ts [2m([22m[2m37 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-settlement-calc.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-properties.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 71[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/multi-day-ticketing.test.ts [2m([22m[2m25 tests[22m[2m | [22m[33m4 skipped[39m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-calc.test.ts [2m([22m[2m35 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-full-suite.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 20[2mms[22m[39m
[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mconsent: timeout da RPC → 503 bloqueado
[22m[39m[portal-track] consent rpc threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mbind falha (throw): lead entra sem ids Meta
[22m[39m[portal-track] consent bind threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2minsert falha → 500 (sem falso sucesso)
[22m[39m[portal-track] insert lead_capture [33m500[39m

 [32m✓[39m src/test/consent-contract-322.test.ts [2m([22m[2m38 tests[22m[2m)[22m[32m 66[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-settlement-engine.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 38[2mms[22m[39m
[90mstderr[2m | src/components/data-entry/__tests__/DataEntryDialog.test.tsx[2m > [22m[2m#333 DataEntryDialog[2m > [22m[2mendpoint ausente: mostra indisponível e não oferece ações
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/lib/__tests__/storage-multi-tenant.test.ts [2m([22m[2m14 tests[22m[2m)[22m[33m 1502[2mms[22m[39m
   [33m[2m✓[22m[39m multi-tenant storage helpers[2m > [22museSetActiveCompany limpa a cache do storage[2m > [22mdepois da troca, withCompanyPath prefixa com a empresa nova [33m 1486[2mms[22m[39m
[90mstderr[2m | src/test/club-config-integration.test.tsx[2m > [22m[2m#327 integration without network[2m > [22m[2mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/test/club-config-integration.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[33m 819[2mms[22m[39m
   [33m[2m✓[22m[39m #327 integration without network[2m > [22mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa [33m 390[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-boost.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-read-layer.test.ts [2m([22m[2m28 tests[22m[2m | [22m[33m7 skipped[39m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/test/newgang-wallet-google.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 129[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-calc.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-settlement-internal-report.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-report.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/iva.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/components/data-entry/__tests__/DataEntryDialog.test.tsx [2m([22m[2m13 tests[22m[2m)[22m[33m 3017[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução não validada: prévia visível, botão desativado mesmo após confirmação [33m 365[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução tardia após close não mostra sucesso e retoma só confere [33m 305[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-version-multi-diff.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-revenue-basis.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-statement-doc.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 80[2mms[22m[39m
 [32m✓[39m src/test/event-financials-invalidation.test.tsx [2m([22m[2m8 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-embeds.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 186[2mms[22m[39m
 [32m✓[39m src/test/ticketline-import-format-transition.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/bol-m2-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-tx-matching.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/test/bol-daily-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-row-limit.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 182[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-gating.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/overhead-proration.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis-tour.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/derp248-tiktok-event-trackers.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-statement-documents.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[32m 172[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/help-manual-parser.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-disbursement.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/test/edge-fn-guard.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 88[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal-bundle.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/sepa/bank-execution.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ebitda.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/creative-media.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-capacity.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 52[2mms[22m[39m
[90mstderr[2m | src/components/__tests__/EventABTab.test.tsx[2m > [22m[2mEventABTab — UI smoke tests[2m > [22m[2mrenderiza sem crashar e mostra labels/inputs das zonas
[22m[39mWarning: Input contains an input of type undefined with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://reactjs.org/link/controlled-components
    at input
    at /tmp/issue333-integrated-e5jwzn52/tree/src/components/ui/input.tsx:8:6
    at div
    at div
    at /tmp/issue333-integrated-e5jwzn52/tree/src/components/ui/card.tsx:38:6
    at div
    at /tmp/issue333-integrated-e5jwzn52/tree/src/components/ui/card.tsx:7:50
    at div
    at EventABTab (/tmp/issue333-integrated-e5jwzn52/tree/src/components/EventABTab.tsx:151:23)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
    at Router (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1207:17)
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/components/__tests__/EventABTab.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[33m 512[2mms[22m[39m
   [33m[2m✓[22m[39m EventABTab — UI smoke tests[2m > [22mrenderiza sem crashar e mostra labels/inputs das zonas [33m 325[2mms[22m[39m
 [32m✓[39m src/test/partner-statement-cards.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-participants.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/test/campaign-design-optional-roas.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 216[2mms[22m[39m
 [32m✓[39m src/test/newgang-welcome-once.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/real-cache-deductions.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/data-entry-contract.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/transitory-transactions.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-line-review.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/google-click-match.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 34[2mms[22m[39m
[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mDialog dentro de overlay manual fica por cima
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mAlertDialog dentro de Dialog fica por cima
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
`AlertDialogContent` requires a description for the component to be accessible for screen reader users.

You can add a description to the `AlertDialogContent` by passing a `AlertDialogDescription` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an `id` and passing the same value to the `aria-describedby` prop in `AlertDialogContent`. If the description is confusing or duplicative for sighted users, you can use the `@radix-ui/react-visually-hidden` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog
Warning: Missing `Description` or `aria-describedby={undefined}` for {AlertDialogContent}.

 [32m✓[39m src/test/newgang-edition-videos.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m
[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mSelect dentro de AlertDialog dentro de overlay manual fica por cima de tudo
[22m[39m`AlertDialogContent` requires a description for the component to be accessible for screen reader users.

You can add a description to the `AlertDialogContent` by passing a `AlertDialogDescription` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an `id` and passing the same value to the `aria-describedby` prop in `AlertDialogContent`. If the description is confusing or duplicative for sighted users, you can use the `@radix-ui/react-visually-hidden` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog
Warning: Missing `Description` or `aria-describedby={undefined}` for {AlertDialogContent}.

 [32m✓[39m src/lib/__tests__/overlay-layer.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 436[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-seal.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
[90mstderr[2m | src/lib/__tests__/permissions-guards-f2b.test.tsx[2m > [22m[2m#311 F2b — guardas por permissão[2m > [22m[2mmanager com excepção module.crm entra em /crm e vê o cartão CRM activo
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/lib/__tests__/permissions-guards-f2b.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 138[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-ab-scale.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/components/__tests__/bp-installments.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-formula.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/test/newgang-history.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-bp-rules.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/income-tax-out-of-event-result.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/transaction-duplicate-check.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/test/payment-method-domain.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-tab-total.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-revenue.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-handler.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 247[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-revenue-single-rule.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/document-detect.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 1542[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 12°, centrado com erro < 3% [33m 440[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado -18°, à esquerda com erro < 3% [33m 325[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 6°, grande com erro < 3% [33m 313[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-elasticity.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-sync.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/test/newgang-missions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/test/approve-lock-and-core.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/validations.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tour-cache-sync.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/club-config-source.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/report-event-cost.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-photos.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 56[2mms[22m[39m
 [32m✓[39m src/test/capi-p1-guard.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 13[2mms[22m[39m
[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mEsc não fecha o modal sob outra janela
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mDialog separa cabeçalho e corpo e mantém o X fora do scroll
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 [32m✓[39m src/test/mobile-modal-dismiss.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 349[2mms[22m[39m
[90mstderr[2m | src/pages/__tests__/ResetPassword.test.tsx[2m > [22m[2mResetPassword — token_hash flow[2m > [22m[2m(a) não chama verifyOtp ao montar; só ao clicar Continuar
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/pages/__tests__/ResetPassword.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 257[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-per-company.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/test/crm-ingest-no-network.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-effective-open.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/newgang-wallet-levels.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/refund-grouping.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-doc-text.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/no-direct-transaction-document-remove.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 149[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-partner-mirror.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-rounding.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-pdf.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-reconciliation.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/payment-settlement.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/song-link-ssr.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-percentage.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 102[2mms[22m[39m
 [32m✓[39m src/test/newgang-strict-audience-delivery.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/cost-center-map.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/test/camarim-session-pdf-sanitize.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 45[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/master-adopted-expense-proration.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-cash-preview.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ads-tour-split.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-extras-union-148.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-integrate.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-eligible.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/crm/creativeReelsCheck.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
[90mstderr[2m | src/lib/__tests__/cache-scope.test.tsx[2m > [22m[2mecrã do subevento usa a configuração do Master[2m > [22m[2mmostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstdout[2m | src/lib/__tests__/card-session-theoretical.test.ts[2m > [22m[2m#275 saldo teórico da sessão = fecho[2m > [22m[2msem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[22m[39m[#275] teórico = 636.68 esperado = 636.68

 [32m✓[39m src/lib/__tests__/card-session-theoretical.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-scope.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 203[2mms[22m[39m
 [32m✓[39m src/test/newgang-crews.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/simulator-prior-curve.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-undo.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-nature.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/capi-diag-no-secrets.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/silent-writes.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/event-financial-card-render-loop.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 1105[2mms[22m[39m
   [33m[2m✓[22m[39m EventFinancialCard — sem ciclo de redesenho (#269)[2m > [22mchama onEbitdaParcelsChange uma única vez com queries vazias [33m 1103[2mms[22m[39m
 [2m[90m↓[39m[22m src/test/partner-statement-edge.test.ts [2m([22m[2m1 test[22m[2m | [22m[33m1 skipped[39m[2m)[22m
 [32m✓[39m src/test/operation-key-domain.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
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

 [32m✓[39m src/components/TicketOfficePositionCards.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[32m 52[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-view.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 95[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/pl-category-matching.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/test/similar-suppliers-notice.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 84[2mms[22m[39m
[90mstderr[2m | src/test/require-feature.test.tsx[2m > [22m[2mvisibilidade por company_features[2m > [22m[2mrota bloqueada sem a chave
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 [32m✓[39m src/test/require-feature.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 142[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-guards-proof.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/memory-index.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-position.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/account-balance-settling.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-card-date.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 85[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/session-copy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-line-required.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-extras-kind.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/dre-nature-divergence.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-perimeter.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-rebill-vat.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/utils.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/test/forecast-attachment-counts.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 394[2mms[22m[39m
   [33m[2m✓[22m[39m anexos do BP — uma leitura por evento (#269)[2m > [22m361 linhas → 1 pedido a event_forecast_attachments [33m 392[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-capacities.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/fecho-preconditions.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/test/supplier-similarity.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/transaction-edit-modal-operation-key.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-category.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/test/contactos-list-paging.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-large-tables-mirror.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-invoices.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/newgang-profile-country.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/crm-audience-live-count.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-realized.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-turns.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/components/__tests__/PasswordStrengthIndicator.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/check-deploy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/components/__tests__/StatCard.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 81[2mms[22m[39m
 [32m✓[39m src/test/coala-centro-custo-norm.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/components/__tests__/LinkBpLineDialog-layer.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 157[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-edit-diff.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/accountant-account-filter.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/payment-list-revalidate.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-planilha-version.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/newgang-content.test.tsx [2m([22m[2m2 tests[22m[2m)[22m[32m 77[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-on-sale.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/audit.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m src/components/__tests__/EventStatusBadge.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 53[2mms[22m[39m
 [32m✓[39m src/test/example.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m src/test/standalone-compat-prepared.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/test/format-integer-conversions.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m

[2m Test Files [22m [1m[32m165 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (166)[39m
[2m      Tests [22m [1m[32m1334 passed[39m[22m[2m | [22m[33m1 skipped[39m[2m | [22m[90m11 todo[39m[90m (1346)[39m
[2m   Start at [22m 20:20:16
[2m   Duration [22m 64.74s[2m (transform 11.04s, setup 109.37s, collect 113.08s, tests 14.65s, environment 519.05s, prepare 99.75s)[22m


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
[32m✓[39m 6220 modules transformed.
rendering chunks...
[1m[33m[plugin:vite:reporter][39m[22m [33m[plugin vite:reporter] 
(!) /tmp/issue333-integrated-e5jwzn52/tree/src/lib/storage.ts is dynamically imported by /tmp/issue333-integrated-e5jwzn52/tree/src/contexts/AuthContext.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/contexts/AuthContext.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/hooks/useCompany.ts but also statically imported by /tmp/issue333-integrated-e5jwzn52/tree/src/components/BPNotesAttachmentsModal.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/CacheExtrasPanel.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/EntityDocumentsSection.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/EventABAttachmentsSection.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/EventClosingCosts.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/EventForecast.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/PartnerExtrasPanel.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/PaymentListReceipts.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/SupplierCreditsPanel.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/TicketOfficeSettlementModal.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/TransactionDocumentsModal.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/TransactionFormModal.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/bank/BankLineDocumentsDialog.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/camarim/CamarimItemAttachmentButton.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/camarim/CamarimItemModal.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/cards/NewCardExpenseModal.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/supplier-credits/NewSupplierCreditModal.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/components/supplier-credits/SupplierCreditsTab.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/pages/BankReconciliation.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/pages/EventImplementations.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/pages/PartnerEventDetail.tsx, /tmp/issue333-integrated-e5jwzn52/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx, dynamic import will not move module into another chunk.
[39m
[bundle] inicial estático: 5156275 bytes
computing gzip size...
[2mdist/[22m[32mmanifest.webmanifest                                    [39m[1m[2m    0.47 kB[22m[1m[22m
[2mdist/[22m[32mindex.html                                              [39m[1m[2m    3.95 kB[22m[1m[22m[2m │ gzip:   1.29 kB[22m
[2mdist/[22m[2massets/[22m[32mlogo-horizontal-mvVEptKs.png                     [39m[1m[2m   45.85 kB[22m[1m[22m
[2mdist/[22m[32mbundle-report.json                                      [39m[1m[2m  810.35 kB[22m[1m[22m[2m │ gzip:  76.94 kB[22m
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
[2mdist/[22m[2massets/[22m[36museDisplayCurrency-BRkItdwP.js                   [39m[1m[2m    0.15 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
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
[2mdist/[22m[2massets/[22m[36mbackdropClose-BFc5m7FG.js                        [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.21 kB[22m
[2mdist/[22m[2massets/[22m[36mrelativeTime-CufnskKF.js                         [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.22 kB[22m
[2mdist/[22m[2massets/[22m[36mskeleton-i7e3AjZH.js                             [39m[1m[2m    0.34 kB[22m[1m[22m[2m │ gzip:   0.28 kB[22m
[2mdist/[22m[2massets/[22m[36maddMonths-Dsh0EBap.js                            [39m[1m[2m    0.35 kB[22m[1m[22m[2m │ gzip:   0.25 kB[22m
[2mdist/[22m[2massets/[22m[36mstrategy-status-if_xUdsk.js                      [39m[1m[2m    0.41 kB[22m[1m[22m[2m │ gzip:   0.24 kB[22m
[2mdist/[22m[2massets/[22m[36mform-enter-guard-TC9TB5Pp.js                     [39m[1m[2m    0.43 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36mtraction-C6TeXKI5.js                             [39m[1m[2m    0.45 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
[2mdist/[22m[2massets/[22m[36mstring-similarity-B7WDu-Mk.js                    [39m[1m[2m    0.45 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
[2mdist/[22m[2massets/[22m[36mcreative-media-DKNTK8AD.js                       [39m[1m[2m    0.50 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
[2mdist/[22m[2massets/[22m[36moverlay-layer-B05zgL9f.js                        [39m[1m[2m    0.51 kB[22m[1m[22m[2m │ gzip:   0.37 kB[22m
[2mdist/[22m[2massets/[22m[36mseparator-B6Ho12Ih.js                            [39m[1m[2m    0.54 kB[22m[1m[22m[2m │ gzip:   0.37 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInDays-ChvF9Jc3.js                     [39m[1m[2m    0.54 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36mbudget-mode-Ctf94k-w.js                          [39m[1m[2m    0.56 kB[22m[1m[22m[2m │ gzip:   0.40 kB[22m
[2mdist/[22m[2massets/[22m[36museMyLeadFrenteIds-DwVIG9p7.js                   [39m[1m[2m    0.56 kB[22m[1m[22m[2m │ gzip:   0.38 kB[22m
[2mdist/[22m[2massets/[22m[36mgetTimezoneOffsetInMilliseconds-CEhzTjz1.js      [39m[1m[2m    0.58 kB[22m[1m[22m[2m │ gzip:   0.34 kB[22m
[2mdist/[22m[2massets/[22m[36maudience-pdf-RQfvkLkz.js                         [39m[1m[2m    0.64 kB[22m[1m[22m[2m │ gzip:   0.41 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-nature-BSQ-ezBD.js                         [39m[1m[2m    0.78 kB[22m[1m[22m[2m │ gzip:   0.45 kB[22m
[2mdist/[22m[2massets/[22m[36museRealtimeInvalidation-Brbhzpuk.js              [39m[1m[2m    0.78 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m
[2mdist/[22m[2massets/[22m[36mPriorityBadge-CFjOGHbj.js                        [39m[1m[2m    0.81 kB[22m[1m[22m[2m │ gzip:   0.52 kB[22m
[2mdist/[22m[2massets/[22m[36museOperacaoFilters-CTkRwTaA.js                   [39m[1m[2m    0.81 kB[22m[1m[22m[2m │ gzip:   0.49 kB[22m
[2mdist/[22m[2massets/[22m[36mIbanWarning-BRQqlwFS.js                          [39m[1m[2m    0.82 kB[22m[1m[22m[2m │ gzip:   0.43 kB[22m
[2mdist/[22m[2massets/[22m[36madmin-window-CQi0t7E0.js                         [39m[1m[2m    0.85 kB[22m[1m[22m[2m │ gzip:   0.50 kB[22m
[2mdist/[22m[2massets/[22m[36mcard-account-balance-CprnykOs.js                 [39m[1m[2m    0.92 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36maccount-balance-rpc-BitayQ36.js                  [39m[1m[2m    0.93 kB[22m[1m[22m[2m │ gzip:   0.49 kB[22m
[2mdist/[22m[2massets/[22m[36mcircuit-account-Dbcagn9A.js                      [39m[1m[2m    0.94 kB[22m[1m[22m[2m │ gzip:   0.58 kB[22m
[2mdist/[22m[2massets/[22m[36msupplier-credits-B56GlkWg.js                     [39m[1m[2m    0.98 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mmoney-input-DIvPuSFX.js                          [39m[1m[2m    1.02 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
[2mdist/[22m[2massets/[22m[36mapp-badge-CFYyvbyu.js                            [39m[1m[2m    1.04 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m
[2mdist/[22m[2massets/[22m[36mbank-link-date-DcRav5qG.js                       [39m[1m[2m    1.05 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36mavatar-Bd6PD032.js                               [39m[1m[2m    1.07 kB[22m[1m[22m[2m │ gzip:   0.44 kB[22m
[2mdist/[22m[2massets/[22m[36mPhaseBadge-eRJJ2WXa.js                           [39m[1m[2m    1.20 kB[22m[1m[22m[2m │ gzip:   0.66 kB[22m
[2mdist/[22m[2massets/[22m[36mzone-capacities-BaBoafZY.js                      [39m[1m[2m    1.22 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mStaffList-CYPAmJ-z.js                            [39m[1m[2m    1.22 kB[22m[1m[22m[2m │ gzip:   0.54 kB[22m
[2mdist/[22m[2massets/[22m[36mIvaRateSelect-CTeJo2SY.js                        [39m[1m[2m    1.27 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
[2mdist/[22m[2massets/[22m[36mcard-session-helpers-CRD9cu8U.js                 [39m[1m[2m    1.31 kB[22m[1m[22m[2m │ gzip:   0.66 kB[22m
[2mdist/[22m[2massets/[22m[36malert-D8t7pV2P.js                                [39m[1m[2m    1.34 kB[22m[1m[22m[2m │ gzip:   0.59 kB[22m
[2mdist/[22m[2massets/[22m[36maccount-balance-Bh4UtZ46.js                      [39m[1m[2m    1.36 kB[22m[1m[22m[2m │ gzip:   0.69 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoStatusBadge-Kj_IVTCh.js                  [39m[1m[2m    1.36 kB[22m[1m[22m[2m │ gzip:   0.62 kB[22m
[2mdist/[22m[2massets/[22m[36mcurrency-DvXZV_Ot.js                             [39m[1m[2m    1.43 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36maccountant-reviews-BoyaK1ZT.js                   [39m[1m[2m    1.46 kB[22m[1m[22m[2m │ gzip:   0.60 kB[22m
[2mdist/[22m[2massets/[22m[36msupplier-bank-Bj4NM3tZ.js                        [39m[1m[2m    1.51 kB[22m[1m[22m[2m │ gzip:   0.70 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-line-relink-D_zgCaUF.js                       [39m[1m[2m    1.52 kB[22m[1m[22m[2m │ gzip:   0.58 kB[22m
[2mdist/[22m[2massets/[22m[36mscroll-area-s-mHifoM.js                          [39m[1m[2m    1.65 kB[22m[1m[22m[2m │ gzip:   0.57 kB[22m
[2mdist/[22m[2massets/[22m[36mcapital-branch-CJwzxRyH.js                       [39m[1m[2m    1.67 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36mReportArtistCachePage-C_GSfE4I.js                [39m[1m[2m    1.70 kB[22m[1m[22m[2m │ gzip:   0.63 kB[22m
[2mdist/[22m[2massets/[22m[36mebitda-BKmlk6J1.js                               [39m[1m[2m    1.74 kB[22m[1m[22m[2m │ gzip:   0.76 kB[22m
[2mdist/[22m[2massets/[22m[36mcamarim-helpers-M1Vn5iD-.js                      [39m[1m[2m    1.76 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36miban-BYOybSCJ.js                                 [39m[1m[2m    1.79 kB[22m[1m[22m[2m │ gzip:   0.95 kB[22m
[2mdist/[22m[2massets/[22m[36maccordion-CDZHSL2F.js                            [39m[1m[2m    1.82 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m
[2mdist/[22m[2massets/[22m[36minvoice-ocr-prepare-CcJft9v3.js                  [39m[1m[2m    1.85 kB[22m[1m[22m[2m │ gzip:   1.02 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-line-required-BjOnouAu.js                     [39m[1m[2m    1.88 kB[22m[1m[22m[2m │ gzip:   0.76 kB[22m
[2mdist/[22m[2massets/[22m[36mEventNatureFilter-BvKiUBib.js                    [39m[1m[2m    1.95 kB[22m[1m[22m[2m │ gzip:   0.73 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountingExportPage-C1-Ahybi.js           [39m[1m[2m    2.00 kB[22m[1m[22m[2m │ gzip:   0.75 kB[22m
[2mdist/[22m[2massets/[22m[36mdashboard-format-GnqOyAs1.js                     [39m[1m[2m    2.00 kB[22m[1m[22m[2m │ gzip:   0.92 kB[22m
[2mdist/[22m[2massets/[22m[36msettlement-participants-DWvHspGm.js              [39m[1m[2m    2.01 kB[22m[1m[22m[2m │ gzip:   0.79 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDocumentPendenciesPage-Bu4oMQ95.js         [39m[1m[2m    2.02 kB[22m[1m[22m[2m │ gzip:   0.75 kB[22m
[2mdist/[22m[2massets/[22m[36mtoggle-group-GGjho_YD.js                         [39m[1m[2m    2.03 kB[22m[1m[22m[2m │ gzip:   0.79 kB[22m
[2mdist/[22m[2massets/[22m[36mMirrorAporteNotice-GhqWnaCH.js                   [39m[1m[2m    2.08 kB[22m[1m[22m[2m │ gzip:   0.90 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-ab-calc-BxWHlvfV.js                        [39m[1m[2m    2.10 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36mFeatureNotEnabledCard-DScoX3xo.js                [39m[1m[2m    2.13 kB[22m[1m[22m[2m │ gzip:   0.66 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteLeadsAvatars-9MUPP1ad.js                   [39m[1m[2m    2.25 kB[22m[1m[22m[2m │ gzip:   0.87 kB[22m
[2mdist/[22m[2massets/[22m[36mticket-office-reconciliation-CEkO5kIn.js         [39m[1m[2m    2.25 kB[22m[1m[22m[2m │ gzip:   1.05 kB[22m
[2mdist/[22m[2massets/[22m[36museUserPreferences-DNvgit0-.js                   [39m[1m[2m    2.30 kB[22m[1m[22m[2m │ gzip:   0.70 kB[22m
[2mdist/[22m[2massets/[22m[36mformatDistanceToNow-CgGNwkFO.js                  [39m[1m[2m    2.32 kB[22m[1m[22m[2m │ gzip:   0.98 kB[22m
[2mdist/[22m[2massets/[22m[36mpartner-extras-jfHOM6ap.js                       [39m[1m[2m    2.32 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-tx-matching-BHd1Ixbn.js                       [39m[1m[2m    2.38 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36museEventIvaRates-NYbATvQg.js                     [39m[1m[2m    2.68 kB[22m[1m[22m[2m │ gzip:   1.15 kB[22m
[2mdist/[22m[2massets/[22m[36mparseISO-Cr0H38in.js                             [39m[1m[2m    2.70 kB[22m[1m[22m[2m │ gzip:   1.19 kB[22m
[2mdist/[22m[2massets/[22m[36mReportCostSourceToggle-Csh9M3GZ.js               [39m[1m[2m    2.93 kB[22m[1m[22m[2m │ gzip:   1.07 kB[22m
[2mdist/[22m[2massets/[22m[36m_LegalLayout-hwOdkp-a.js                         [39m[1m[2m    3.08 kB[22m[1m[22m[2m │ gzip:   0.69 kB[22m
[2mdist/[22m[2massets/[22m[36mreal-cache-calc-BWhtBwwB.js                      [39m[1m[2m    3.25 kB[22m[1m[22m[2m │ gzip:   1.48 kB[22m
[2mdist/[22m[2massets/[22m[36mdate-picker-gZaSeWJW.js                          [39m[1m[2m    3.32 kB[22m[1m[22m[2m │ gzip:   1.25 kB[22m
[2mdist/[22m[2massets/[22m[36mAcceptInvite-BIcrU4Kf.js                         [39m[1m[2m    3.86 kB[22m[1m[22m[2m │ gzip:   1.17 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaAssigneeAvatars-DkpqD6bi.js                 [39m[1m[2m    3.89 kB[22m[1m[22m[2m │ gzip:   1.00 kB[22m
[2mdist/[22m[2massets/[22m[36mAdAccounts-DSY9m8ll.js                           [39m[1m[2m    3.95 kB[22m[1m[22m[2m │ gzip:   0.98 kB[22m
[2mdist/[22m[2massets/[22m[36mcache-tab-total-mBjLMTZ_.js                      [39m[1m[2m    4.35 kB[22m[1m[22m[2m │ gzip:   1.67 kB[22m
[2mdist/[22m[2massets/[22m[36mcsv-export-Bp8nlkXR.js                           [39m[1m[2m    4.39 kB[22m[1m[22m[2m │ gzip:   1.57 kB[22m
[2mdist/[22m[2massets/[22m[36mNewStaffDialog-CASfJjh0.js                       [39m[1m[2m    4.45 kB[22m[1m[22m[2m │ gzip:   1.20 kB[22m
[2mdist/[22m[2massets/[22m[36mStatCard-D_JlF188.js                             [39m[1m[2m    4.47 kB[22m[1m[22m[2m │ gzip:   1.06 kB[22m
[2mdist/[22m[2massets/[22m[36mImageUploader-Ck6R7q4w.js                        [39m[1m[2m    4.73 kB[22m[1m[22m[2m │ gzip:   1.49 kB[22m
[2mdist/[22m[2massets/[22m[36museScenarioForecasts-TYPSGs3k.js                 [39m[1m[2m    4.86 kB[22m[1m[22m[2m │ gzip:   1.44 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceNew-DLrAQeCA.js                          [39m[1m[2m    4.88 kB[22m[1m[22m[2m │ gzip:   1.27 kB[22m
[2mdist/[22m[2massets/[22m[36mexport-ticket-office-settlement-pdf-D-TXHhHu.js  [39m[1m[2m    5.00 kB[22m[1m[22m[2m │ gzip:   2.28 kB[22m
[2mdist/[22m[2massets/[22m[36mMeusChamados-n767RL4Z.js                         [39m[1m[2m    5.31 kB[22m[1m[22m[2m │ gzip:   1.56 kB[22m
[2mdist/[22m[2massets/[22m[36minvoice-group-BP9QGWFS.js                        [39m[1m[2m    5.43 kB[22m[1m[22m[2m │ gzip:   1.76 kB[22m
[2mdist/[22m[2massets/[22m[36mUserSettings-4Z2O22DD.js                         [39m[1m[2m    5.53 kB[22m[1m[22m[2m │ gzip:   1.67 kB[22m
[2mdist/[22m[2massets/[22m[36mSimilarSuppliersNotice-EfQB2aTD.js               [39m[1m[2m    5.66 kB[22m[1m[22m[2m │ gzip:   1.83 kB[22m
[2mdist/[22m[2massets/[22m[36mpt-BR-Dh5EWHbw.js                                [39m[1m[2m    5.85 kB[22m[1m[22m[2m │ gzip:   2.10 kB[22m
[2mdist/[22m[2massets/[22m[36mpt-B3dxR9FF.js                                   [39m[1m[2m    5.97 kB[22m[1m[22m[2m │ gzip:   2.02 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierBankDetails-DIqcNvjp.js                  [39m[1m[2m    6.14 kB[22m[1m[22m[2m │ gzip:   1.20 kB[22m
[2mdist/[22m[2massets/[22m[36mparse-ticketline-zone-xlsx-BcBXDVLy.js           [39m[1m[2m    6.86 kB[22m[1m[22m[2m │ gzip:   2.59 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoHome-B2Jq8UNW.js                         [39m[1m[2m    7.07 kB[22m[1m[22m[2m │ gzip:   1.91 kB[22m
[2mdist/[22m[2massets/[22m[36men-US-CpWK9ySR.js                                [39m[1m[2m    7.19 kB[22m[1m[22m[2m │ gzip:   2.47 kB[22m
[2mdist/[22m[2massets/[22m[36mchart-D9ES87Uj.js                                [39m[1m[2m    7.28 kB[22m[1m[22m[2m │ gzip:   2.18 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadoNovo-DAiZ7Ivy.js                          [39m[1m[2m    7.46 kB[22m[1m[22m[2m │ gzip:   1.85 kB[22m
[2mdist/[22m[2massets/[22m[36museBPVersions-B5xZIclB.js                        [39m[1m[2m    7.53 kB[22m[1m[22m[2m │ gzip:   1.77 kB[22m
[2mdist/[22m[2massets/[22m[36mMinhasTarefas-B0wL5r0Y.js                        [39m[1m[2m    7.69 kB[22m[1m[22m[2m │ gzip:   2.16 kB[22m
[2mdist/[22m[2massets/[22m[36mDiagnosisTest-CnxWJ7_k.js                        [39m[1m[2m    7.99 kB[22m[1m[22m[2m │ gzip:   1.58 kB[22m
[2mdist/[22m[2massets/[22m[36mIbanDuplicates-1gRe7T6Q.js                       [39m[1m[2m    8.12 kB[22m[1m[22m[2m │ gzip:   2.04 kB[22m
[2mdist/[22m[2massets/[22m[36mFrentesPanel-Blfmm4bO.js                         [39m[1m[2m    8.23 kB[22m[1m[22m[2m │ gzip:   2.07 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSalesComparisonPage-rzkoOCP1.js            [39m[1m[2m    8.36 kB[22m[1m[22m[2m │ gzip:   2.16 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-format-QffJ_mte.js                         [39m[1m[2m    8.46 kB[22m[1m[22m[2m │ gzip:   2.52 kB[22m
[2mdist/[22m[2massets/[22m[36mSimilarSuppliersReview-CMUZK88X.js               [39m[1m[2m    8.46 kB[22m[1m[22m[2m │ gzip:   1.98 kB[22m
[2mdist/[22m[2massets/[22m[36mAtividade-DAQv2jE0.js                            [39m[1m[2m    8.54 kB[22m[1m[22m[2m │ gzip:   2.34 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoListShell-BI1keVVU.js                    [39m[1m[2m    8.85 kB[22m[1m[22m[2m │ gzip:   2.22 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSalesCurvePage-DMIm3kKe.js                 [39m[1m[2m    8.91 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategies-CIqktrOX.js                           [39m[1m[2m    9.09 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mUploadCoalaFotos-DGS-nw2h.js                     [39m[1m[2m    9.14 kB[22m[1m[22m[2m │ gzip:   2.11 kB[22m
[2mdist/[22m[2massets/[22m[36mimport-pl-xlsx-CUsk2ElI.js                       [39m[1m[2m    9.39 kB[22m[1m[22m[2m │ gzip:   4.03 kB[22m
[2mdist/[22m[2massets/[22m[36mFieldStaffSection-BKsoXRmF.js                    [39m[1m[2m    9.58 kB[22m[1m[22m[2m │ gzip:   2.15 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAgingPage-B-EElrPx.js                      [39m[1m[2m    9.67 kB[22m[1m[22m[2m │ gzip:   2.15 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountCategoriesPage-BXV4DQO8.js          [39m[1m[2m    9.81 kB[22m[1m[22m[2m │ gzip:   2.18 kB[22m
[2mdist/[22m[2massets/[22m[36mFundHolderPicker-BRdCdcGM.js                     [39m[1m[2m    9.82 kB[22m[1m[22m[2m │ gzip:   1.97 kB[22m
[2mdist/[22m[2massets/[22m[36museEventABScenarios-Btvm6pqP.js                  [39m[1m[2m   10.09 kB[22m[1m[22m[2m │ gzip:   3.72 kB[22m
[2mdist/[22m[2massets/[22m[36mReportRevenueMixPage-B_kFAK-i.js                 [39m[1m[2m   10.20 kB[22m[1m[22m[2m │ gzip:   2.16 kB[22m
[2mdist/[22m[2massets/[22m[36mBankLineDocumentsDialog-CigF8FOT.js              [39m[1m[2m   10.40 kB[22m[1m[22m[2m │ gzip:   2.74 kB[22m
[2mdist/[22m[2massets/[22m[36mReportMonthlyEvolutionPage-DxLSUsh9.js           [39m[1m[2m   10.45 kB[22m[1m[22m[2m │ gzip:   2.11 kB[22m
[2mdist/[22m[2massets/[22m[36mAuditDownloads-BZS702UQ.js                       [39m[1m[2m   10.80 kB[22m[1m[22m[2m │ gzip:   2.19 kB[22m
[2mdist/[22m[2massets/[22m[36mReportOccupancyRatePage-DLuUrHOt.js              [39m[1m[2m   10.82 kB[22m[1m[22m[2m │ gzip:   2.32 kB[22m
[2mdist/[22m[2massets/[22m[36museCitySimulator-C_MD3EWr.js                     [39m[1m[2m   10.99 kB[22m[1m[22m[2m │ gzip:   3.61 kB[22m
[2mdist/[22m[2massets/[22m[36mCreatives-BLQMH5Nv.js                            [39m[1m[2m   11.15 kB[22m[1m[22m[2m │ gzip:   2.37 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBudgetDeviationPage-BEZjV1bm.js            [39m[1m[2m   11.40 kB[22m[1m[22m[2m │ gzip:   2.57 kB[22m
[2mdist/[22m[2massets/[22m[36mReportTreasuryProjectionPage-H5yy-Fps.js         [39m[1m[2m   11.42 kB[22m[1m[22m[2m │ gzip:   2.52 kB[22m
[2mdist/[22m[2massets/[22m[36mUserActivityLog-CIZsdbYd.js                      [39m[1m[2m   11.49 kB[22m[1m[22m[2m │ gzip:   2.45 kB[22m
[2mdist/[22m[2massets/[22m[36mCardItemDocumentsField-1k506j5H.js               [39m[1m[2m   11.67 kB[22m[1m[22m[2m │ gzip:   2.99 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSupplierConcentrationPage-Draj2DXn.js      [39m[1m[2m   11.78 kB[22m[1m[22m[2m │ gzip:   2.27 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSuppliersPage-0GXoD34c.js                  [39m[1m[2m   12.07 kB[22m[1m[22m[2m │ gzip:   2.55 kB[22m
[2mdist/[22m[2massets/[22m[36mLinkBpLineDialog-BzrALdFy.js                     [39m[1m[2m   12.12 kB[22m[1m[22m[2m │ gzip:   2.66 kB[22m
[2mdist/[22m[2massets/[22m[36mManualGaps-CQLGsrsn.js                           [39m[1m[2m   12.15 kB[22m[1m[22m[2m │ gzip:   2.62 kB[22m
[2mdist/[22m[2massets/[22m[36mBlogList-CH-ncpO4.js                             [39m[1m[2m   12.18 kB[22m[1m[22m[2m │ gzip:   2.21 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminPanel-C4Jnd7yA.js                           [39m[1m[2m   12.30 kB[22m[1m[22m[2m │ gzip:   3.62 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadoDetail-C9cUEyff.js                        [39m[1m[2m   12.34 kB[22m[1m[22m[2m │ gzip:   2.85 kB[22m
[2mdist/[22m[2massets/[22m[36mOnboarding-zusy_nke.js                           [39m[1m[2m   12.52 kB[22m[1m[22m[2m │ gzip:   2.82 kB[22m
[2mdist/[22m[2massets/[22m[36mReportProfitabilityPage-BoSUbTsB.js              [39m[1m[2m   12.58 kB[22m[1m[22m[2m │ gzip:   2.93 kB[22m
[2mdist/[22m[2massets/[22m[36mCrmDashboard-CEn8P3XD.js                         [39m[1m[2m   12.63 kB[22m[1m[22m[2m │ gzip:   2.97 kB[22m
[2mdist/[22m[2massets/[22m[36mGoogleAdsAdmin-COmp9zQe.js                       [39m[1m[2m   13.00 kB[22m[1m[22m[2m │ gzip:   2.43 kB[22m
[2mdist/[22m[2massets/[22m[36mformat-CGtoj5si.js                               [39m[1m[2m   13.04 kB[22m[1m[22m[2m │ gzip:   3.48 kB[22m
[2mdist/[22m[2massets/[22m[36mPaginasList-DEBuZGot.js                          [39m[1m[2m   13.32 kB[22m[1m[22m[2m │ gzip:   2.61 kB[22m
[2mdist/[22m[2massets/[22m[36mEditCampaignPopover-TfaIAN5n.js                  [39m[1m[2m   13.56 kB[22m[1m[22m[2m │ gzip:   3.25 kB[22m
[2mdist/[22m[2massets/[22m[36mReminders-D74_NnFf.js                            [39m[1m[2m   13.69 kB[22m[1m[22m[2m │ gzip:   2.91 kB[22m
[2mdist/[22m[2massets/[22m[36mSyncHealth-D9S9umAp.js                           [39m[1m[2m   13.93 kB[22m[1m[22m[2m │ gzip:   2.43 kB[22m
[2mdist/[22m[2massets/[22m[36mEndossarEventoPage-CK6uPMEL.js                   [39m[1m[2m   14.00 kB[22m[1m[22m[2m │ gzip:   2.95 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPendencyIndexPage-mIRgk57e.js              [39m[1m[2m   14.14 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencesList-Cav5_MlC.js                        [39m[1m[2m   14.30 kB[22m[1m[22m[2m │ gzip:   2.76 kB[22m
[2mdist/[22m[2massets/[22m[36mCategoryFormModal-DHPBwGsk.js                    [39m[1m[2m   14.41 kB[22m[1m[22m[2m │ gzip:   3.23 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencePreviewCount-Bv2WjQp0.js                 [39m[1m[2m   14.54 kB[22m[1m[22m[2m │ gzip:   3.65 kB[22m
[2mdist/[22m[2massets/[22m[36mEndorsementEditor-C94q6xDx.js                    [39m[1m[2m   14.59 kB[22m[1m[22m[2m │ gzip:   2.77 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceEditor-vVhzV34R.js                       [39m[1m[2m   15.01 kB[22m[1m[22m[2m │ gzip:   2.82 kB[22m
[2mdist/[22m[2massets/[22m[36mTrash-BOG17l2U.js                                [39m[1m[2m   15.24 kB[22m[1m[22m[2m │ gzip:   3.14 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPartnerExpensesPage-B1sKtLDn.js            [39m[1m[2m   15.29 kB[22m[1m[22m[2m │ gzip:   3.12 kB[22m
[2mdist/[22m[2massets/[22m[36mNewEventoPage-DehiZhl5.js                        [39m[1m[2m   15.35 kB[22m[1m[22m[2m │ gzip:   2.69 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadosList-CEF0Keb1.js                         [39m[1m[2m   15.69 kB[22m[1m[22m[2m │ gzip:   4.06 kB[22m
[2mdist/[22m[2massets/[22m[36mContactDetailsSheet-hNsJyLkq.js                  [39m[1m[2m   15.85 kB[22m[1m[22m[2m │ gzip:   2.68 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBI-uFWjdgcI.js                              [39m[1m[2m   15.85 kB[22m[1m[22m[2m │ gzip:   3.88 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantPendencies-Cy9KPCTd.js                 [39m[1m[2m   15.92 kB[22m[1m[22m[2m │ gzip:   3.38 kB[22m
[2mdist/[22m[2massets/[22m[36mInvoiceGroupAudit-CkwaKhgt.js                    [39m[1m[2m   16.04 kB[22m[1m[22m[2m │ gzip:   3.20 kB[22m
[2mdist/[22m[2massets/[22m[36mRlsLegacyAudit-CaZzpNiL.js                       [39m[1m[2m   16.21 kB[22m[1m[22m[2m │ gzip:   2.80 kB[22m
[2mdist/[22m[2massets/[22m[36mRaiseBudgetDialog-CsejYhco.js                    [39m[1m[2m   16.39 kB[22m[1m[22m[2m │ gzip:   3.49 kB[22m
[2mdist/[22m[2massets/[22m[36mEditFrenteSheet-BvLeu2En.js                      [39m[1m[2m   16.42 kB[22m[1m[22m[2m │ gzip:   3.44 kB[22m
[2mdist/[22m[2massets/[22m[36mPaginaEditor-DE21onu8.js                         [39m[1m[2m   16.92 kB[22m[1m[22m[2m │ gzip:   3.24 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierTransactions-DMaVnDlU.js                 [39m[1m[2m   17.35 kB[22m[1m[22m[2m │ gzip:   3.59 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyNew-Btn_3MQF.js                          [39m[1m[2m   17.39 kB[22m[1m[22m[2m │ gzip:   4.00 kB[22m
[2mdist/[22m[2massets/[22m[36mPurchaseAudienceCard-CiL4iqQb.js                 [39m[1m[2m   17.62 kB[22m[1m[22m[2m │ gzip:   3.35 kB[22m
[2mdist/[22m[2massets/[22m[36mSetup-CRdAHJfu.js                                [39m[1m[2m   17.80 kB[22m[1m[22m[2m │ gzip:   4.13 kB[22m
[2mdist/[22m[2massets/[22m[36mPessoaDetail-C2cWKa0q.js                         [39m[1m[2m   18.18 kB[22m[1m[22m[2m │ gzip:   3.53 kB[22m
[2mdist/[22m[2massets/[22m[36mibantools--sXKtUqI.js                            [39m[1m[2m   18.29 kB[22m[1m[22m[2m │ gzip:   3.82 kB[22m
[2mdist/[22m[2massets/[22m[36mInvariantMonitor-C9aRMCng.js                     [39m[1m[2m   18.90 kB[22m[1m[22m[2m │ gzip:   3.35 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREEmpresarialPage-luetZ4p7.js             [39m[1m[2m   19.17 kB[22m[1m[22m[2m │ gzip:   5.01 kB[22m
[2mdist/[22m[2massets/[22m[36mClubeNewgang-BRc04ByR.js                         [39m[1m[2m   19.18 kB[22m[1m[22m[2m │ gzip:   3.16 kB[22m
[2mdist/[22m[2massets/[22m[36mTerms-DVIgwJnd.js                                [39m[1m[2m   19.48 kB[22m[1m[22m[2m │ gzip:   2.98 kB[22m
[2mdist/[22m[2massets/[22m[36mAbout-CWnEtxcz.js                                [39m[1m[2m   19.79 kB[22m[1m[22m[2m │ gzip:   2.88 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountCategories-6vEBvOOU.js                    [39m[1m[2m   19.93 kB[22m[1m[22m[2m │ gzip:   3.76 kB[22m
[2mdist/[22m[2massets/[22m[36mNotifications-DhmB7jA0.js                        [39m[1m[2m   20.06 kB[22m[1m[22m[2m │ gzip:   2.59 kB[22m
[2mdist/[22m[2massets/[22m[36mQuotations-CTkkoc6D.js                           [39m[1m[2m   20.40 kB[22m[1m[22m[2m │ gzip:   3.82 kB[22m
[2mdist/[22m[2massets/[22m[36mEventImplementations-Cjp0qjVV.js                 [39m[1m[2m   20.52 kB[22m[1m[22m[2m │ gzip:   3.92 kB[22m
[2mdist/[22m[2massets/[22m[36mVideosList-Buajkojo.js                           [39m[1m[2m   20.74 kB[22m[1m[22m[2m │ gzip:   4.07 kB[22m
[2mdist/[22m[2massets/[22m[36mBlogEditor-RZfQfdTw.js                           [39m[1m[2m   20.75 kB[22m[1m[22m[2m │ gzip:   3.86 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPartnerSettlementPage-DmVYGMso.js          [39m[1m[2m   21.01 kB[22m[1m[22m[2m │ gzip:   3.90 kB[22m
[2mdist/[22m[2massets/[22m[36mPressList-Ffk3_Z_c.js                            [39m[1m[2m   21.98 kB[22m[1m[22m[2m │ gzip:   4.33 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDocumentPendencies-BBqhk_-G.js             [39m[1m[2m   22.30 kB[22m[1m[22m[2m │ gzip:   3.74 kB[22m
[2mdist/[22m[2massets/[22m[36mparse-B9BIfq30.js                                [39m[1m[2m   22.36 kB[22m[1m[22m[2m │ gzip:   4.64 kB[22m
[2mdist/[22m[2massets/[22m[36mDuelView-DGNWorvP.js                             [39m[1m[2m   22.40 kB[22m[1m[22m[2m │ gzip:   4.80 kB[22m
[2mdist/[22m[2massets/[22m[36mPortalSettings-z--QTLoX.js                       [39m[1m[2m   22.72 kB[22m[1m[22m[2m │ gzip:   4.15 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteDetail-DB3sJQgB.js                         [39m[1m[2m   22.92 kB[22m[1m[22m[2m │ gzip:   4.56 kB[22m
[2mdist/[22m[2massets/[22m[36mEventosList-BoJkkdeD.js                          [39m[1m[2m   23.57 kB[22m[1m[22m[2m │ gzip:   3.78 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimEquipa-Dyj8JTVR.js                        [39m[1m[2m   23.75 kB[22m[1m[22m[2m │ gzip:   4.97 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyNewDesign-Coe5Httr.js                    [39m[1m[2m   24.12 kB[22m[1m[22m[2m │ gzip:   4.97 kB[22m
[2mdist/[22m[2massets/[22m[36mCreativeNew-B9cGlVbm.js                          [39m[1m[2m   24.82 kB[22m[1m[22m[2m │ gzip:   5.42 kB[22m
[2mdist/[22m[2massets/[22m[36mCampoView-Cg9XvDBH.js                            [39m[1m[2m   24.94 kB[22m[1m[22m[2m │ gzip:   5.29 kB[22m
[2mdist/[22m[2massets/[22m[36mReportCashFlowPage-B_qiGQGS.js                   [39m[1m[2m   25.27 kB[22m[1m[22m[2m │ gzip:   4.51 kB[22m
[2mdist/[22m[2massets/[22m[36mReportIvaAuditPage-CGz7-G41.js                   [39m[1m[2m   25.61 kB[22m[1m[22m[2m │ gzip:   4.82 kB[22m
[2mdist/[22m[2massets/[22m[36mpurify.es-8E279hYE.js                            [39m[1m[2m   25.61 kB[22m[1m[22m[2m │ gzip:   9.67 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyPrint-CK-1-f7o.js                        [39m[1m[2m   25.70 kB[22m[1m[22m[2m │ gzip:   3.73 kB[22m
[2mdist/[22m[2massets/[22m[36mCustomerMatchUpload-7WlqrmNo.js                  [39m[1m[2m   25.94 kB[22m[1m[22m[2m │ gzip:   4.15 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyPlanCard-CN96QgCr.js                     [39m[1m[2m   26.30 kB[22m[1m[22m[2m │ gzip:   4.19 kB[22m
[2mdist/[22m[2massets/[22m[36mEventTrackersCard-DAWX5h_r.js                    [39m[1m[2m   26.44 kB[22m[1m[22m[2m │ gzip:   4.40 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDailySalesPage-C6pcaUqR.js                 [39m[1m[2m   26.77 kB[22m[1m[22m[2m │ gzip:   5.41 kB[22m
[2mdist/[22m[2massets/[22m[36mCardSessions-CcH3RzN8.js                         [39m[1m[2m   27.03 kB[22m[1m[22m[2m │ gzip:   5.39 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapasList-DVOLZGRr.js                           [39m[1m[2m   27.80 kB[22m[1m[22m[2m │ gzip:   6.96 kB[22m
[2mdist/[22m[2massets/[22m[36mReconciliacaoBpTx-DNOZqKP7.js                    [39m[1m[2m   27.82 kB[22m[1m[22m[2m │ gzip:   5.29 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountingExport-DiB1SqgM.js               [39m[1m[2m   28.66 kB[22m[1m[22m[2m │ gzip:   5.05 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaignFromScratch-BtBzaJA6.js                  [39m[1m[2m   28.91 kB[22m[1m[22m[2m │ gzip:   5.26 kB[22m
[2mdist/[22m[2massets/[22m[36mPixels-BJtPtmEd.js                               [39m[1m[2m   29.51 kB[22m[1m[22m[2m │ gzip:   4.43 kB[22m
[2mdist/[22m[2massets/[22m[36mRecurringTransactions-D99V1gI4.js                [39m[1m[2m   29.69 kB[22m[1m[22m[2m │ gzip:   5.05 kB[22m
[2mdist/[22m[2massets/[22m[36mContactosList-CjSpz9fs.js                        [39m[1m[2m   30.16 kB[22m[1m[22m[2m │ gzip:   5.79 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-revenue-basis-BqZehoug.js                  [39m[1m[2m   30.57 kB[22m[1m[22m[2m │ gzip:  10.47 kB[22m
[2mdist/[22m[2massets/[22m[36mUserManagement-CtwaDLnZ.js                       [39m[1m[2m   30.94 kB[22m[1m[22m[2m │ gzip:   6.25 kB[22m
[2mdist/[22m[2massets/[22m[36mConnections-BsiFw1mv.js                          [39m[1m[2m   31.08 kB[22m[1m[22m[2m │ gzip:   6.43 kB[22m
[2mdist/[22m[2massets/[22m[36mFormalidadeAudit-BrnF-gzm.js                     [39m[1m[2m   31.63 kB[22m[1m[22m[2m │ gzip:   5.57 kB[22m
[2mdist/[22m[2massets/[22m[36mDataEntryDialog-B4WlsmCg.js                      [39m[1m[2m   31.97 kB[22m[1m[22m[2m │ gzip:   6.25 kB[22m
[2mdist/[22m[2massets/[22m[36mLeadsList-DuQpiV_t.js                            [39m[1m[2m   32.09 kB[22m[1m[22m[2m │ gzip:   5.02 kB[22m
[2mdist/[22m[2massets/[22m[36mReportArtistCache-OCuFeMdX.js                    [39m[1m[2m   32.80 kB[22m[1m[22m[2m │ gzip:   8.51 kB[22m
[2mdist/[22m[2massets/[22m[36mInsights-D8gbLXzK.js                             [39m[1m[2m   33.23 kB[22m[1m[22m[2m │ gzip:   4.81 kB[22m
[2mdist/[22m[2massets/[22m[36mCartaoEquipa-iro_4KVG.js                         [39m[1m[2m   33.44 kB[22m[1m[22m[2m │ gzip:   7.48 kB[22m
[2mdist/[22m[2massets/[22m[36mBolSync-F-vTGMVE.js                              [39m[1m[2m   33.53 kB[22m[1m[22m[2m │ gzip:   5.31 kB[22m
[2mdist/[22m[2massets/[22m[36mMetaCapiMonitor-CSx_4RNl.js                      [39m[1m[2m   33.57 kB[22m[1m[22m[2m │ gzip:   4.34 kB[22m
[2mdist/[22m[2massets/[22m[36mBatchPaymentModal-WavMIyHP.js                    [39m[1m[2m   33.67 kB[22m[1m[22m[2m │ gzip:   8.39 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaSuppliersPanel-D4PWzv6g.js                  [39m[1m[2m   33.97 kB[22m[1m[22m[2m │ gzip:   4.50 kB[22m
[2mdist/[22m[2massets/[22m[36mIvaManagement-C_KVay06.js                        [39m[1m[2m   34.72 kB[22m[1m[22m[2m │ gzip:   5.30 kB[22m
[2mdist/[22m[2massets/[22m[36mcalendar-x88BWkut.js                             [39m[1m[2m   35.03 kB[22m[1m[22m[2m │ gzip:  11.08 kB[22m
[2mdist/[22m[2massets/[22m[36mPrivacy-CIvfI7x4.js                              [39m[1m[2m   35.05 kB[22m[1m[22m[2m │ gzip:   4.93 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBIDetail-BrhhFGaW.js                        [39m[1m[2m   35.06 kB[22m[1m[22m[2m │ gzip:   8.16 kB[22m
[2mdist/[22m[2massets/[22m[36mReportForecastPayablesPage-jVrvKjbq.js           [39m[1m[2m   36.34 kB[22m[1m[22m[2m │ gzip:   5.74 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketlineSync-Bno2RvwN.js                       [39m[1m[2m   36.61 kB[22m[1m[22m[2m │ gzip:   5.87 kB[22m
[2mdist/[22m[2massets/[22m[36mFunnelTest-C4rgUbez.js                           [39m[1m[2m   37.14 kB[22m[1m[22m[2m │ gzip:   7.54 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactionDocumentsModal-BQfM8MCf.js            [39m[1m[2m   38.04 kB[22m[1m[22m[2m │ gzip:   7.90 kB[22m
[2mdist/[22m[2massets/[22m[36mReportContasPagarPage-lNqVFvfi.js                [39m[1m[2m   38.10 kB[22m[1m[22m[2m │ gzip:   6.78 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREBrasilPage-B9OzatEo.js                  [39m[1m[2m   38.35 kB[22m[1m[22m[2m │ gzip:   7.39 kB[22m
[2mdist/[22m[2massets/[22m[36mAudit-CaPPeLSR.js                                [39m[1m[2m   39.28 kB[22m[1m[22m[2m │ gzip:   6.64 kB[22m
[2mdist/[22m[2massets/[22m[36mDashboard-BljF_rEq.js                            [39m[1m[2m   39.53 kB[22m[1m[22m[2m │ gzip:   7.65 kB[22m
[2mdist/[22m[2massets/[22m[36mBPPlanilha-DWJUsafo.js                           [39m[1m[2m   39.96 kB[22m[1m[22m[2m │ gzip:  11.60 kB[22m
[2mdist/[22m[2massets/[22m[36mHelpCenter-DfPZDwHp.js                           [39m[1m[2m   40.13 kB[22m[1m[22m[2m │ gzip:  12.09 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantStandaloneInvoicesTab-B0geXdKM.js      [39m[1m[2m   40.24 kB[22m[1m[22m[2m │ gzip:   8.23 kB[22m
[2mdist/[22m[2massets/[22m[36mCompanies-BEXnUIdK.js                            [39m[1m[2m   41.85 kB[22m[1m[22m[2m │ gzip:   6.11 kB[22m
[2mdist/[22m[2massets/[22m[36mmarked.esm-DiRRsLPS.js                           [39m[1m[2m   42.33 kB[22m[1m[22m[2m │ gzip:  12.79 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteManage-BrVkd1ET.js                         [39m[1m[2m   43.11 kB[22m[1m[22m[2m │ gzip:   6.98 kB[22m
[2mdist/[22m[2massets/[22m[36mMetaAudiencesList-DEfnBEdo.js                    [39m[1m[2m   43.38 kB[22m[1m[22m[2m │ gzip:   6.49 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREPage-C8OeosL2.js                        [39m[1m[2m   44.48 kB[22m[1m[22m[2m │ gzip:   8.63 kB[22m
[2mdist/[22m[2massets/[22m[36mReportMovementReconciliationPage-cV4Y8bDD.js     [39m[1m[2m   44.80 kB[22m[1m[22m[2m │ gzip:   7.87 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOfficeSettlementsOverview-CosVqX7c.js      [39m[1m[2m   45.49 kB[22m[1m[22m[2m │ gzip:   7.10 kB[22m
[2mdist/[22m[2massets/[22m[36msortable.esm-CvbFPBOB.js                         [39m[1m[2m   45.88 kB[22m[1m[22m[2m │ gzip:  15.28 kB[22m
[2mdist/[22m[2massets/[22m[36mFeverSync-Of7M0izk.js                            [39m[1m[2m   46.58 kB[22m[1m[22m[2m │ gzip:   8.40 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarim-2_FdSIGG.js                              [39m[1m[2m   46.64 kB[22m[1m[22m[2m │ gzip:   7.36 kB[22m
[2mdist/[22m[2massets/[22m[36mSecurityDashboard-DTsRhbyn.js                    [39m[1m[2m   47.37 kB[22m[1m[22m[2m │ gzip:   6.89 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBPTransactionsPage-BLXMwxU7.js             [39m[1m[2m   48.18 kB[22m[1m[22m[2m │ gzip:   8.89 kB[22m
[2mdist/[22m[2massets/[22m[36mEquipaView-enTuQ__G.js                           [39m[1m[2m   48.30 kB[22m[1m[22m[2m │ gzip:   8.15 kB[22m
[2mdist/[22m[2massets/[22m[36mStandaloneInvoiceScanner-DxdO4IBc.js             [39m[1m[2m   49.39 kB[22m[1m[22m[2m │ gzip:  11.63 kB[22m
[2mdist/[22m[2massets/[22m[36mZonasList-B5W5S6WY.js                            [39m[1m[2m   51.74 kB[22m[1m[22m[2m │ gzip:  10.05 kB[22m
[2mdist/[22m[2massets/[22m[36mDatabaseBackups-BDc1HDvt.js                      [39m[1m[2m   51.79 kB[22m[1m[22m[2m │ gzip:   8.63 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaDetail-BmrKVJ50.js                          [39m[1m[2m   51.87 kB[22m[1m[22m[2m │ gzip:   9.16 kB[22m
[2mdist/[22m[2massets/[22m[36mEventSimulatorDemo-CrEsjP5S.js                   [39m[1m[2m   52.26 kB[22m[1m[22m[2m │ gzip:   6.36 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPLPage-iIlLTC-_.js                         [39m[1m[2m   53.54 kB[22m[1m[22m[2m │ gzip:  10.35 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyRedesign-EfKnh3S5.js                     [39m[1m[2m   53.88 kB[22m[1m[22m[2m │ gzip:   8.08 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBankStatementPage-p4x0TU9V.js              [39m[1m[2m   54.00 kB[22m[1m[22m[2m │ gzip:  10.23 kB[22m
[2mdist/[22m[2massets/[22m[36mCreativeView-DEJGZL3q.js                         [39m[1m[2m   54.64 kB[22m[1m[22m[2m │ gzip:   8.07 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceGoogleAds-C4xpm8Yf.js                    [39m[1m[2m   57.26 kB[22m[1m[22m[2m │ gzip:  10.03 kB[22m
[2mdist/[22m[2massets/[22m[36mReimbursements-BPkGNxuP.js                       [39m[1m[2m   61.08 kB[22m[1m[22m[2m │ gzip:  11.30 kB[22m
[2mdist/[22m[2massets/[22m[36mRegistroFeed-CQKo9kIV.js                         [39m[1m[2m   66.87 kB[22m[1m[22m[2m │ gzip:  10.96 kB[22m
[2mdist/[22m[2massets/[22m[36mAdsInvoices-B9q38zJ-.js                          [39m[1m[2m   68.76 kB[22m[1m[22m[2m │ gzip:  11.71 kB[22m
[2mdist/[22m[2massets/[22m[36mEvents-DMFvoTGU.js                               [39m[1m[2m   69.16 kB[22m[1m[22m[2m │ gzip:  11.99 kB[22m
[2mdist/[22m[2massets/[22m[36mManualSync-BrgsoREd.js                           [39m[1m[2m   69.44 kB[22m[1m[22m[2m │ gzip:  22.06 kB[22m
[2mdist/[22m[2massets/[22m[36mReportTicketOfficeAuditPage-BtkpbxpI.js          [39m[1m[2m   70.30 kB[22m[1m[22m[2m │ gzip:  11.52 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimItemAttachmentButton-D3sDV1yh.js          [39m[1m[2m   70.39 kB[22m[1m[22m[2m │ gzip:  15.80 kB[22m
[2mdist/[22m[2massets/[22m[36mEventCalendar-Bqu8SI_4.js                        [39m[1m[2m   70.98 kB[22m[1m[22m[2m │ gzip:  11.76 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBIEvent-DPAdBGYc.js                         [39m[1m[2m   71.46 kB[22m[1m[22m[2m │ gzip:  12.43 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOfficeSettlementModal-C9Mnj9di.js          [39m[1m[2m   77.07 kB[22m[1m[22m[2m │ gzip:  13.49 kB[22m
[2mdist/[22m[2massets/[22m[36mSuppliers-PsW2BDmH.js                            [39m[1m[2m   79.99 kB[22m[1m[22m[2m │ gzip:  12.25 kB[22m
[2mdist/[22m[2massets/[22m[36minstallment-guard-D_vxH_eC.js                    [39m[1m[2m   84.56 kB[22m[1m[22m[2m │ gzip:  15.18 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierFormModal-B4CsQaCG.js                    [39m[1m[2m   86.06 kB[22m[1m[22m[2m │ gzip:  18.67 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantHome-IhTk0D40.js                       [39m[1m[2m   86.51 kB[22m[1m[22m[2m │ gzip:  13.13 kB[22m
[2mdist/[22m[2massets/[22m[36mEventHub-LvJj2kxp.js                             [39m[1m[2m   86.77 kB[22m[1m[22m[2m │ gzip:  13.90 kB[22m
[2mdist/[22m[2massets/[22m[36mCoalaSync-DJxevFZo.js                            [39m[1m[2m   89.50 kB[22m[1m[22m[2m │ gzip:  15.16 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencePrint-B2-ZWs9z.js                        [39m[1m[2m   89.94 kB[22m[1m[22m[2m │ gzip:  11.04 kB[22m
[2mdist/[22m[2massets/[22m[36mAuditoriaContas-DW1A9Jce.js                      [39m[1m[2m   94.02 kB[22m[1m[22m[2m │ gzip:  16.86 kB[22m
[2mdist/[22m[2massets/[22m[36mjszip.min-CnBbpjIO.js                            [39m[1m[2m   97.24 kB[22m[1m[22m[2m │ gzip:  30.05 kB[22m
[2mdist/[22m[2massets/[22m[36mFinancialAccounts-BdJJ-Cil.js                    [39m[1m[2m  119.31 kB[22m[1m[22m[2m │ gzip:  18.28 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyView-DPA0m8-p.js                         [39m[1m[2m  124.91 kB[22m[1m[22m[2m │ gzip:  19.06 kB[22m
[2mdist/[22m[2massets/[22m[36mEventMarketingEditor-dUneOvsR.js                 [39m[1m[2m  127.70 kB[22m[1m[22m[2m │ gzip:  18.27 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimSessionDetail-CWySuliR.js                 [39m[1m[2m  135.07 kB[22m[1m[22m[2m │ gzip:  23.54 kB[22m
[2mdist/[22m[2massets/[22m[36mBankReconciliation-BVEqTC-1.js                   [39m[1m[2m  136.96 kB[22m[1m[22m[2m │ gzip:  26.81 kB[22m
[2mdist/[22m[2massets/[22m[36mCardSessionDetail-CbdKnmC3.js                    [39m[1m[2m  150.04 kB[22m[1m[22m[2m │ gzip:  27.50 kB[22m
[2mdist/[22m[2massets/[22m[36mindex.es-DmsDyuHC.js                             [39m[1m[2m  150.74 kB[22m[1m[22m[2m │ gzip:  51.38 kB[22m
[2mdist/[22m[2massets/[22m[36mNewgangSite-tAi7OTMC.js                          [39m[1m[2m  154.45 kB[22m[1m[22m[2m │ gzip:  26.70 kB[22m
[2mdist/[22m[2massets/[22m[36mhtml2canvas.esm-CBrSDip1.js                      [39m[1m[2m  201.42 kB[22m[1m[22m[2m │ gzip:  47.70 kB[22m
[2mdist/[22m[2massets/[22m[36mticket-office-settlement-form-BxxNe0bl.js        [39m[1m[2m  203.09 kB[22m[1m[22m[2m │ gzip:  40.72 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPaymentListsPage-DeBVBAN0.js               [39m[1m[2m  203.13 kB[22m[1m[22m[2m │ gzip:  39.52 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-supabase-3MT7AzyV.js                      [39m[1m[2m  209.56 kB[22m[1m[22m[2m │ gzip:  54.23 kB[22m
[2mdist/[22m[2massets/[22m[36mEventImplementationDetail-Cj94sA4z.js            [39m[1m[2m  228.98 kB[22m[1m[22m[2m │ gzip:  36.32 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaigns-R2VpxiXq.js                            [39m[1m[2m  247.47 kB[22m[1m[22m[2m │ gzip:  42.77 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactions-CwSJ6pnS.js                         [39m[1m[2m  265.63 kB[22m[1m[22m[2m │ gzip:  46.66 kB[22m
[2mdist/[22m[2massets/[22m[36mEventSimulator-CA0oSLIZ.js                       [39m[1m[2m  291.98 kB[22m[1m[22m[2m │ gzip:  46.27 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOffices-DeAD-9bX.js                        [39m[1m[2m  323.04 kB[22m[1m[22m[2m │ gzip:  53.34 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactionEditModal-CGnOsckV.js                 [39m[1m[2m  351.19 kB[22m[1m[22m[2m │ gzip:  59.73 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-pdf-Cg0OIXZi.js                           [39m[1m[2m  421.80 kB[22m[1m[22m[2m │ gzip: 137.18 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-react-KQt1rZym.js                         [39m[1m[2m  438.02 kB[22m[1m[22m[2m │ gzip: 134.70 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaignView-DLEpUB1l.js                         [39m[1m[2m  445.72 kB[22m[1m[22m[2m │ gzip:  72.95 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-charts-CvYs9c1O.js                        [39m[1m[2m  448.41 kB[22m[1m[22m[2m │ gzip: 119.60 kB[22m
[2mdist/[22m[2massets/[22m[36mpdf-first-page-to-jpeg-M5CLsCvW.js               [39m[1m[2m  458.53 kB[22m[1m[22m[2m │ gzip: 135.85 kB[22m
[2mdist/[22m[2massets/[22m[36mEventForecast-CD2v5L0p.js                        [39m[1m[33m  758.89 kB[39m[22m[2m │ gzip: 129.07 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-ui-DC4k8uTt.js                            [39m[1m[33m1,068.27 kB[39m[22m[2m │ gzip: 220.41 kB[22m
[2mdist/[22m[2massets/[22m[36mEventDetail-BB5RKJyP.js                          [39m[1m[33m1,096.98 kB[39m[22m[2m │ gzip: 185.03 kB[22m
[2mdist/[22m[2massets/[22m[36mindex-pXoBG2w1.js                                [39m[1m[33m1,215.39 kB[39m[22m[2m │ gzip: 265.62 kB[22m
[2mdist/[22m[2massets/[22m[36mheic2any-BcfgmVBS.js                             [39m[1m[33m1,352.85 kB[39m[22m[2m │ gzip: 341.38 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-xlsx-CIt_8dee.js                          [39m[1m[33m1,369.76 kB[39m[22m[2m │ gzip: 412.26 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-handsontable-CE0eIcQY.js                  [39m[1m[33m1,918.23 kB[39m[22m[2m │ gzip: 457.52 kB[22m
[2mdist/[22m[2massets/[22m[36mheic-to-lXPrQE7P.js                              [39m[1m[33m2,995.46 kB[39m[22m[2m │ gzip: 736.99 kB[22m
[33m
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
[32m✓ built in 50.85s[39m

PWA v1.3.0
mode      generateSW
precache  343 entries (24401.99 KiB)
files generated
  dist/sw.js
  dist/workbox-52dea471.js

EXIT: 0
```
