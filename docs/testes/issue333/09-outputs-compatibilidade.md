# #333 — outputs locais integrais 17/10/2026

Sem Live/rede externa.

```text
179dacb611330c2d263b3dffe40ebe76fc79ac547ee9752a35e11f3dca998cb0  patches/issue333/compatibility.PENDENTE.patch
9f8baeea0a19931c6b591aaf8f65d2429845bacd0c2a66004ef24b0501d8c3ef  patches/issue333/core.PENDENTE.sql
e6d85d294eefb9b764a2a1cb81469398f43e3c8cc7cf6900ead3acbe52cf39ab  supabase/manual/20261017_issue333_normalized_uniqueness.PROPOSTA.sql
```

## bunx vitest run --config docs/testes/issue333/vitest.pg.config.ts

```text

 RUN  v3.2.7 /dev-server

 ✓ docs/testes/issue333/pg/data-entry-pg.test.ts (36 tests) 6880ms
   ✓ #333 concorrência real entre duas ligações > mesmo lote/documento em duas ligações: a 2.ª espera e devolve o MESMO resultado; 1 avulsa  437ms
   ✓ #333 concorrência real entre duas ligações > dois lotes com a mesma fatura: o lock serializa e o 2.º recebe 'já existe'  447ms
   ✓ #333 concorrência real entre duas ligações > escritor legado com a MESMA grafia: o índice canónico bloqueia o 2.º (qualquer ordem)  866ms
   ✓ #333 EXACT proposed index on real compatible standalone table (local ONLY) > assistant × adapted real legacy INSERT equivalent; legacy first=true  416ms
   ✓ #333 EXACT proposed index on real compatible standalone table (local ONLY) > assistant × adapted real legacy INSERT equivalent; legacy first=false  418ms
   ✓ #333 EXACT proposed index on real compatible standalone table (local ONLY) > legacy × legacy INSERT both orders firstLower=true  404ms
   ✓ #333 EXACT proposed index on real compatible standalone table (local ONLY) > legacy × legacy INSERT both orders firstLower=false  403ms
   ✓ #333 EXACT proposed index on real compatible standalone table (local ONLY) > legacy INSERT × legacy UPDATE collision with barrier; insert first=true  405ms
   ✓ #333 EXACT proposed index on real compatible standalone table (local ONLY) > legacy INSERT × legacy UPDATE collision with barrier; insert first=false  404ms
   ✓ #333 EXACT proposed index on real compatible standalone table (local ONLY) > strong duplicate 23505 failure rollback permits waiting competitor, no duplicate audit  404ms

 Test Files  1 passed (1)
      Tests  36 passed (36)
   Start at  17:58:10
   Duration  7.56s (transform 155ms, setup 0ms, collect 203ms, tests 6.88s, environment 0ms, prepare 157ms)


```

## bunx vitest run --config docs/testes/issue333/vitest.compat.config.ts

```text

 RUN  v3.2.7 /dev-server

 ✓ docs/testes/issue333/compatibility.test.ts (26 tests) 29ms

 Test Files  1 passed (1)
      Tests  26 passed (26)
   Start at  17:58:18
   Duration  1.16s (transform 93ms, setup 0ms, collect 101ms, tests 29ms, environment 0ms, prepare 464ms)


```

## bunx vitest run --config docs/testes/issue333/vitest.handler.config.ts

```text

 RUN  v3.2.7 /dev-server

 ✓ docs/testes/issue333/handler/handler.test.ts (20 tests) 103ms

 Test Files  1 passed (1)
      Tests  20 passed (20)
   Start at  17:51:39
   Duration  1.53s (transform 112ms, setup 0ms, collect 144ms, tests 103ms, environment 0ms, prepare 624ms)


```

## bunx vitest run [5 regression files; paths in proof08]

```text

 RUN  v3.2.7 /dev-server

 ✓ src/test/edge-fn-guard.test.ts (4 tests) 72ms
 ✓ src/lib/__tests__/standalone-invoices.test.ts (4 tests) 6ms
 ✓ src/test/transaction-duplicate-check.test.ts (6 tests) 21ms
 ✓ src/lib/__tests__/data-entry-contract.test.ts (8 tests) 26ms
stderr | src/components/data-entry/__tests__/DataEntryDialog.test.tsx > #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/components/data-entry/__tests__/DataEntryDialog.test.tsx (13 tests) 2774ms
   ✓ #333 DataEntryDialog > execução não validada: prévia visível, botão desativado mesmo após confirmação  348ms
   ✓ #333 DataEntryDialog > retoma nunca declara sucesso por cache; repõe campos, lê check, sem commit  313ms

 Test Files  5 passed (5)
      Tests  35 passed (35)
   Start at  17:51:42
   Duration  7.77s (transform 665ms, setup 1.48s, collect 1.72s, tests 2.90s, environment 10.82s, prepare 2.34s)


```

## bunx vitest run

```text

 RUN  v3.2.7 /dev-server

 ✓ src/test/newgang-wallet-google.test.ts (12 tests) 266ms
 ✓ src/lib/__tests__/no-direct-transaction-document-remove.test.ts (3 tests) 542ms
   ✓ sem remoção directa em transaction-documents no frontend > nenhuma chamada directa a .remove nos 10 buckets contabilísticos  537ms
 ✓ src/lib/__tests__/postgrest-embeds.test.ts (2 tests) 660ms
   ✓ embeds do PostgREST em pares com FK duplicada > [Issue #288] nenhum embed ambíguo sem a FK nomeada  648ms
 ✓ src/lib/__tests__/postgrest-row-limit.test.ts (2 tests) 712ms
   ✓ barreira dos 1.000 registos do PostgREST > [Issue #289] nenhuma leitura de tabela grande sem paginação  704ms
 ✓ src/test/campaign-design-optional-roas.test.ts (15 tests) 343ms
stderr | src/pages/__tests__/ResetPassword.test.tsx > ResetPassword — token_hash flow > (a) não chama verifyOtp ao montar; só ao clicar Continuar
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/forecast-attachment-counts.test.tsx (1 test) 415ms
   ✓ anexos do BP — uma leitura por evento (#269) > 361 linhas → 1 pedido a event_forecast_attachments  413ms
 ✓ src/pages/__tests__/ResetPassword.test.tsx (3 tests) 378ms
 ✓ src/lib/__tests__/document-detect.test.ts (5 tests) 1766ms
   ✓ detectDocumentQuad > deteta A4 rodado 12°, centrado com erro < 3%  489ms
   ✓ detectDocumentQuad > deteta A4 rodado -18°, à esquerda com erro < 3%  378ms
   ✓ detectDocumentQuad > deteta A4 rodado 20°, canto sup. dir. com erro < 3%  365ms
   ✓ detectDocumentQuad > deteta A4 rodado 6°, grande com erro < 3%  306ms
 ✓ src/lib/__tests__/storage-multi-tenant.test.ts (14 tests) 1336ms
   ✓ multi-tenant storage helpers > useSetActiveCompany limpa a cache do storage > depois da troca, withCompanyPath prefixa com a empresa nova  1302ms
stderr | src/components/data-entry/__tests__/DataEntryDialog.test.tsx > #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Esc não fecha o modal sob outra janela
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Dialog separa cabeçalho e corpo e mantém o X fora do scroll
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 ✓ src/test/mobile-modal-dismiss.test.tsx (6 tests) 450ms
stderr | src/components/__tests__/EventABTab.test.tsx > EventABTab — UI smoke tests > renderiza sem crashar e mostra labels/inputs das zonas
Warning: Input contains an input of type undefined with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://reactjs.org/link/controlled-components
    at input
    at /dev-server/src/components/ui/input.tsx:8:6
    at div
    at div
    at /dev-server/src/components/ui/card.tsx:38:6
    at div
    at /dev-server/src/components/ui/card.tsx:7:50
    at div
    at EventABTab (/dev-server/src/components/EventABTab.tsx:151:23)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
    at Router (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1207:17)
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

stderr | src/test/club-config-integration.test.tsx > #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/components/__tests__/EventABTab.test.tsx (4 tests) 462ms
 ✓ src/test/club-config-integration.test.tsx (7 tests) 794ms
   ✓ #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa  365ms
stderr | src/lib/__tests__/overlay-layer.test.tsx > pilha de camadas — aninhamentos reais > Dialog dentro de overlay manual fica por cima
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

stderr | src/lib/__tests__/overlay-layer.test.tsx > pilha de camadas — aninhamentos reais > AlertDialog dentro de Dialog fica por cima
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
`AlertDialogContent` requires a description for the component to be accessible for screen reader users.

You can add a description to the `AlertDialogContent` by passing a `AlertDialogDescription` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an `id` and passing the same value to the `aria-describedby` prop in `AlertDialogContent`. If the description is confusing or duplicative for sighted users, you can use the `@radix-ui/react-visually-hidden` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog
Warning: Missing `Description` or `aria-describedby={undefined}` for {AlertDialogContent}.

stderr | src/lib/__tests__/overlay-layer.test.tsx > pilha de camadas — aninhamentos reais > Select dentro de AlertDialog dentro de overlay manual fica por cima de tudo
`AlertDialogContent` requires a description for the component to be accessible for screen reader users.

You can add a description to the `AlertDialogContent` by passing a `AlertDialogDescription` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an `id` and passing the same value to the `aria-describedby` prop in `AlertDialogContent`. If the description is confusing or duplicative for sighted users, you can use the `@radix-ui/react-visually-hidden` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog
Warning: Missing `Description` or `aria-describedby={undefined}` for {AlertDialogContent}.

 ✓ src/lib/__tests__/overlay-layer.test.tsx (6 tests) 433ms
 ✓ src/test/event-financial-card-render-loop.test.tsx (1 test) 1111ms
   ✓ EventFinancialCard — sem ciclo de redesenho (#269) > chama onEbitdaParcelsChange uma única vez com queries vazias  1107ms
 ✓ src/components/data-entry/__tests__/DataEntryDialog.test.tsx (13 tests) 3437ms
   ✓ #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações  361ms
   ✓ #333 DataEntryDialog > execução não validada: prévia visível, botão desativado mesmo após confirmação  443ms
   ✓ #333 DataEntryDialog > execução validada: exige confirmação explícita e mostra a conferência com a observação  307ms
   ✓ #333 DataEntryDialog > retoma nunca declara sucesso por cache; repõe campos, lê check, sem commit  355ms
   ✓ #333 DataEntryDialog > execução tardia após close não mostra sucesso e retoma só confere  343ms
   ✓ #333 DataEntryDialog > execução tardia após company não mostra sucesso e retoma só confere  304ms
 ✓ src/test/edge-fn-guard.test.ts (4 tests) 216ms
 ✓ src/test/coala-meta-audience-handler.test.ts (3 tests) 174ms
stderr | src/lib/__tests__/permissions-guards-f2b.test.tsx > #311 F2b — guardas por permissão > manager com excepção module.crm entra em /crm e vê o cartão CRM activo
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/permissions-guards-f2b.test.tsx (5 tests) 135ms
 ✓ src/test/ticket-office-settlement-view.test.tsx (3 tests) 76ms
 ✓ src/lib/__tests__/cache-percentage.test.tsx (4 tests) 87ms
 ✓ src/components/__tests__/LinkBpLineDialog-layer.test.tsx (1 test) 157ms
 ✓ src/test/ticket-office-statement-documents.test.tsx (6 tests) 151ms
stderr | src/test/require-feature.test.tsx > visibilidade por company_features > rota bloqueada sem a chave
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/require-feature.test.tsx (4 tests) 140ms
 ✓ src/lib/__tests__/cache-report.test.ts (13 tests) 39ms
 ✓ src/components/__tests__/EventStatusBadge.test.tsx (5 tests) 65ms
 ✓ src/test/song-link-ssr.test.ts (24 tests) 25ms
 ✓ src/lib/__tests__/postgrest-large-tables-mirror.test.ts (1 test) 91ms
 ✓ src/lib/__tests__/event-simulator-ab-scale.test.ts (8 tests) 11ms
 ✓ src/test/newgang-content.test.tsx (2 tests) 120ms
 ✓ src/lib/__tests__/event-nature.test.ts (4 tests) 37ms
 ✓ src/lib/__tests__/tickets-v2-properties.test.ts (19 tests) 75ms
stderr | src/test/consent-contract-322.test.ts > portal-track handler > consent: timeout da RPC → 503 bloqueado
[portal-track] consent rpc threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > bind falha (throw): lead entra sem ids Meta
[portal-track] consent bind threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > insert falha → 500 (sem falso sucesso)
[portal-track] insert lead_capture [33m500[39m

 ✓ src/test/consent-contract-322.test.ts (38 tests) 63ms
 ✓ src/lib/__tests__/partner-statement-doc.test.ts (29 tests) 72ms
 ✓ src/test/similar-suppliers-notice.test.tsx (4 tests) 73ms
stderr | src/lib/__tests__/cache-scope.test.tsx > ecrã do subevento usa a configuração do Master > mostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/cache-scope.test.tsx (4 tests) 174ms
 ✓ src/test/ticket-office-settlement-pdf.test.ts (1 test) 70ms
 ✓ src/test/camarim-session-pdf-sanitize.test.ts (1 test) 43ms
 ✓ src/test/coala-centro-custo-norm.test.ts (2 tests) 6ms
 ✓ src/test/approve-lock-and-core.test.ts (6 tests) 50ms
 ✓ src/components/__tests__/StatCard.test.tsx (4 tests) 75ms
 ✓ src/test/ticket-office-settlement-card-date.test.tsx (1 test) 83ms
 ✓ src/lib/__tests__/transitory-transactions.test.ts (7 tests) 8ms
 ✓ src/test/event-financials-invalidation.test.tsx (8 tests) 48ms
 ✓ src/lib/__tests__/google-click-match.test.ts (17 tests) 35ms
 ✓ src/lib/__tests__/event-ab-full-suite.test.ts (27 tests) 13ms
stderr | src/components/TicketOfficePositionCards.test.tsx > TicketOfficePositionCards — observação condicional > omite observação abaixo de um cêntimo: 0
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

stderr | src/components/TicketOfficePositionCards.test.tsx > TicketOfficePositionCards — observação condicional > omite observação abaixo de um cêntimo: 0.009
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

stderr | src/components/TicketOfficePositionCards.test.tsx > TicketOfficePositionCards — observação condicional > omite observação abaixo de um cêntimo: -0.009
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

stderr | src/components/TicketOfficePositionCards.test.tsx > TicketOfficePositionCards — observação condicional > preserva observação a partir de um cêntimo: 0.01
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

stderr | src/components/TicketOfficePositionCards.test.tsx > TicketOfficePositionCards — observação condicional > preserva observação a partir de um cêntimo: -0.01
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

stderr | src/components/TicketOfficePositionCards.test.tsx > TicketOfficePositionCards — observação condicional > preserva observação a partir de um cêntimo: 265
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

stderr | src/components/TicketOfficePositionCards.test.tsx > TicketOfficePositionCards — observação condicional > preserva observação a partir de um cêntimo: -265
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

 ✓ src/components/TicketOfficePositionCards.test.tsx (7 tests) 35ms
 ✓ src/lib/__tests__/tickets-v2-read-layer.test.ts (28 tests | 7 skipped) 18ms
 ✓ src/test/newgang-portal.test.ts (10 tests) 29ms
 ✓ src/lib/__tests__/accountant-account-filter.test.ts (5 tests) 5ms
 ✓ src/lib/__tests__/bp-line-required.test.ts (6 tests) 5ms
 ✓ src/test/payment-method-domain.test.ts (8 tests) 8ms
 ✓ src/lib/__tests__/bp-formula.test.ts (8 tests) 21ms
 ✓ src/lib/__tests__/ads-tour-split.test.ts (4 tests) 7ms
 ✓ src/test/newgang-welcome-once.test.ts (7 tests) 32ms
 ✓ src/lib/__tests__/event-settlement-engine.test.ts (27 tests) 27ms
 ✓ src/lib/__tests__/combo-capacity.test.ts (9 tests) 33ms
 ✓ src/lib/__tests__/bp-line-review.test.ts (12 tests) 16ms
 ✓ src/lib/__tests__/supplier-credits.test.ts (34 tests) 11ms
 ✓ src/lib/__tests__/help-manual-parser.test.ts (10 tests) 21ms
 ✓ src/lib/__tests__/bp-version-multi-diff.test.ts (10 tests) 23ms
 ✓ src/test/transaction-duplicate-check.test.ts (6 tests) 18ms
 ✓ src/test/newgang-missions.test.ts (5 tests) 15ms
 ✓ src/lib/__tests__/data-entry-contract.test.ts (8 tests) 23ms
 ✓ src/lib/__tests__/statement-grouping.test.ts (16 tests) 25ms
 ✓ src/test/newgang-edition-photos.test.ts (5 tests) 18ms
 ✓ src/lib/__tests__/audit.test.ts (4 tests) 8ms
 ✓ src/lib/__tests__/multi-day-ticketing.test.ts (25 tests | 4 skipped) 18ms
 ✓ src/test/bol-m2-parser.test.ts (9 tests) 13ms
 ✓ src/test/crm-ingest-no-network.test.ts (12 tests) 8ms
 ✓ src/lib/__tests__/event-partner-mirror.test.ts (5 tests) 18ms
 ✓ src/lib/__tests__/utils.test.ts (8 tests) 15ms
 ✓ src/lib/__tests__/camarim-bp-rules.test.ts (6 tests) 11ms
 ✓ src/lib/__tests__/simulator-prior-curve.test.ts (4 tests) 8ms
 ✓ src/lib/__tests__/zone-price-turns.test.ts (3 tests) 17ms
 ✓ src/lib/__tests__/combo-gating.test.ts (19 tests) 7ms
 ✓ src/lib/cost-center-map.test.ts (6 tests) 22ms
 ✓ src/test/coala-meta-audience-sync.test.ts (5 tests) 19ms
 ✓ src/lib/__tests__/tour-cache-sync.test.ts (8 tests) 8ms
 ✓ src/lib/__tests__/refund-grouping.test.ts (5 tests) 9ms
 ✓ src/lib/crm/creativeReelsCheck.test.ts (5 tests) 6ms
 ✓ src/test/standalone-compat-prepared.test.ts (26 tests) 25ms
 ✓ src/lib/__tests__/ticket-office-settlement-calc.test.ts (22 tests) 12ms
 ✓ src/lib/__tests__/event-ab-rounding.test.ts (4 tests) 6ms
 ✓ src/test/bol-daily-parser.test.ts (9 tests) 11ms
 ✓ src/test/newgang-strict-audience-delivery.test.ts (4 tests) 12ms
 ✓ src/test/newgang-wallet-levels.test.ts (14 tests) 13ms
 ✓ src/lib/__tests__/event-simulator-calc.test.ts (35 tests) 17ms
stdout | src/lib/__tests__/card-session-theoretical.test.ts > #275 saldo teórico da sessão = fecho > sem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[#275] teórico = 636.68 esperado = 636.68

 ✓ src/lib/__tests__/card-session-theoretical.test.ts (1 test) 5ms
 ✓ src/lib/__tests__/ticket-office-reconciliation.test.ts (7 tests) 9ms
 ✓ src/test/payment-list-revalidate.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/partner-extras-kind.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/fecho-preconditions.test.ts (4 tests) 8ms
 ✓ src/test/check-deploy.test.ts (3 tests) 6ms
 ✓ src/test/derp248-tiktok-event-trackers.test.ts (11 tests) 14ms
 ✓ src/lib/__tests__/club-config-source.test.ts (12 tests) 11ms
 ✓ src/lib/__tests__/income-tax-out-of-event-result.test.ts (5 tests) 9ms
 ✓ src/lib/__tests__/iva.test.ts (22 tests) 13ms
 ✓ src/lib/__tests__/validations.test.ts (17 tests) 15ms
 ✓ src/lib/__tests__/creative-media.test.ts (19 tests) 9ms
 ✓ src/lib/__tests__/partner-disbursement.test.ts (11 tests) 10ms
 ✓ src/lib/__tests__/forecast-boost.test.ts (12 tests) 14ms
 ✓ src/lib/__tests__/event-cost-basis-tour.test.ts (13 tests) 11ms
 ✓ src/lib/__tests__/bp-tx-matching.test.ts (12 tests) 14ms
 ✓ src/lib/__tests__/master-adopted-expense-proration.test.ts (3 tests) 7ms
 ✓ src/test/newgang-edition-videos.test.ts (6 tests) 14ms
 ✓ src/lib/__tests__/overhead-proration.test.ts (11 tests) 11ms
 ✓ src/lib/__tests__/split-adjustment.test.ts (37 tests) 12ms
 ✓ src/lib/__tests__/permissions-per-company.test.ts (5 tests) 25ms
 ✓ src/lib/__tests__/ebitda.test.ts (8 tests) 11ms
 ✓ src/lib/__tests__/event-revenue-basis.test.ts (12 tests) 12ms
 ✓ src/lib/__tests__/partner-settlement-internal-report.test.ts (12 tests) 34ms
 ✓ src/test/newgang-crews.test.ts (3 tests) 10ms
 ✓ src/lib/__tests__/real-cache-deductions.test.ts (8 tests) 22ms
 ✓ src/test/crm-audience-live-count.test.ts (3 tests) 5ms
 ✓ src/test/newgang-portal-bundle.test.ts (5 tests) 17ms
 ✓ src/test/ticketline-import-format-transition.test.ts (2 tests) 9ms
 ✓ src/test/capi-p1-guard.test.ts (22 tests) 11ms
 ✓ src/lib/__tests__/payment-settlement.test.ts (8 tests) 9ms
 ✓ src/lib/__tests__/ticket-revenue-single-rule.test.ts (6 tests) 5ms
 ✓ src/test/supplier-similarity.test.ts (11 tests) 10ms
 ✓ src/lib/__tests__/settlement-seal.test.ts (6 tests) 16ms
 ✓ src/lib/__tests__/camarim-cash-preview.test.ts (5 tests) 11ms
 ✓ src/lib/sepa/bank-execution.test.ts (7 tests) 9ms
 ✓ src/test/newgang-history.test.ts (6 tests) 11ms
 ✓ src/lib/__tests__/cache-tab-total.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/forecast-undo.test.ts (2 tests) 10ms
 ✓ src/lib/__tests__/session-copy.test.ts (3 tests) 14ms
 ✓ src/lib/__tests__/settlement-doc-text.test.ts (5 tests) 6ms
 ✓ src/lib/__tests__/event-ab-calc.test.ts (12 tests) 12ms
 ✓ src/lib/__tests__/dre-nature-divergence.test.ts (2 tests) 11ms
 ✓ src/lib/__tests__/settlement-participants.test.ts (10 tests) 11ms
 ✓ src/lib/__tests__/report-event-cost.test.ts (7 tests) 13ms
 ✓ src/lib/__tests__/pl-category-matching.test.ts (5 tests) 8ms
 ✓ src/test/silent-writes.test.ts (6 tests) 12ms
 ✓ src/test/capi-diag-no-secrets.test.ts (6 tests) 9ms
 ✓ src/lib/__tests__/partner-extras-union-148.test.ts (6 tests) 7ms
 ✓ src/test/memory-index.test.ts (3 tests) 40ms
 ✓ src/lib/__tests__/settlement-perimeter.test.ts (6 tests) 6ms
 ✓ src/lib/__tests__/partner-rebill-vat.test.ts (4 tests) 4ms
 ✓ src/lib/__tests__/settlement-revenue.test.ts (6 tests) 11ms
 ✓ src/lib/__tests__/ticket-office-position.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/ticket-office-effective-open.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/zone-price-elasticity.test.ts (7 tests) 12ms
 ✓ src/lib/__tests__/permissions-guards-proof.test.ts (1 test) 4ms
 ✓ src/lib/__tests__/event-cost-basis.test.ts (5 tests) 9ms
 ✓ src/lib/__tests__/camarim-integrate.test.ts (4 tests) 9ms
 ✓ src/lib/__tests__/forecast-edit-diff.test.ts (3 tests) 5ms
 ✓ src/test/contactos-list-paging.test.ts (3 tests) 5ms
 ✓ src/components/__tests__/PasswordStrengthIndicator.test.ts (7 tests) 9ms
 ✓ src/components/__tests__/bp-installments.test.ts (20 tests) 17ms
 ✓ src/test/operation-key-domain.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/permissions.test.ts (5 tests) 11ms
 ✓ src/lib/__tests__/ticket-category.test.ts (4 tests) 5ms
 ✓ src/lib/__tests__/event-realized.test.ts (6 tests) 6ms
 ✓ src/test/transaction-edit-modal-operation-key.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/account-balance-settling.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/zone-capacities.test.ts (2 tests) 6ms
 ✓ src/lib/__tests__/bp-planilha-version.test.ts (2 tests) 5ms
 ✓ src/test/ticket-office-settlement-eligible.test.ts (5 tests) 6ms
 ✓ src/test/newgang-profile-country.test.ts (2 tests) 4ms
 ✓ src/test/format-integer-conversions.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/standalone-invoices.test.ts (4 tests) 5ms
 ✓ src/test/partner-statement-cards.test.ts (3 tests) 6ms
 ✓ src/test/example.test.ts (1 test) 4ms
 ✓ src/lib/__tests__/zone-on-sale.test.ts (3 tests) 4ms
 ↓ src/test/partner-statement-edge.test.ts (1 test | 1 skipped)

 Test Files  165 passed | 1 skipped (166)
      Tests  1334 passed | 1 skipped | 11 todo (1346)
   Start at  17:54:57
   Duration  64.92s (transform 9.69s, setup 102.75s, collect 119.85s, tests 16.97s, environment 518.92s, prepare 92.45s)


```

## patch --dry-run -p1 < patches/issue333/compatibility.PENDENTE.patch

```text
checking file supabase/functions/_shared/standalone-identity.ts
checking file supabase/functions/_shared/standalone-compat.ts
checking file src/lib/standalone-identity-lookup.ts
checking file src/pages/StandaloneInvoiceScanner.tsx
checking file src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx
checking file supabase/functions/ingest-standalone-invoice/index.ts
checking file supabase/manual/20261017_issue333_core.PENDENTE.sql

```
