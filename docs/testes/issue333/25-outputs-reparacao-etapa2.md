# #333 — outputs locais integrais da reparação

Sem credenciais, dados Live ou invocações externas de negócio.

## Testes focados (antes do último teste de marcador inválido)

```text

 RUN  v3.2.7 /dev-server

 ✓ src/lib/__tests__/standalone-capability-proposal.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/standalone-attempt-routing.test.ts (13 tests) 20ms
 ✓ src/test/standalone-compat-prepared.test.ts (26 tests) 29ms
stderr | src/components/data-entry/__tests__/DataEntryDialog.test.tsx > #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx (8 tests) 482ms
 ✓ src/components/data-entry/__tests__/DataEntryDialog.test.tsx (13 tests) 3077ms
   ✓ #333 DataEntryDialog > execução não validada: prévia visível, botão desativado mesmo após confirmação  345ms
   ✓ #333 DataEntryDialog > retoma nunca declara sucesso por cache; repõe campos, lê check, sem commit  368ms
   ✓ #333 DataEntryDialog > execução tardia após close não mostra sucesso e retoma só confere  305ms
   ✓ #333 DataEntryDialog > utilizador diferente não recebe retoma; contexto revalidado antes de execução  325ms

 Test Files  5 passed (5)
      Tests  63 passed (63)
   Start at  21:52:35
   Duration  6.77s (transform 608ms, setup 1.07s, collect 1.96s, tests 3.61s, environment 6.73s, prepare 938ms)


```

## Suite completa final

```text

 RUN  v3.2.7 /dev-server

 ✓ src/lib/__tests__/no-direct-transaction-document-remove.test.ts (3 tests) 602ms
   ✓ sem remoção directa em transaction-documents no frontend > nenhuma chamada directa a .remove nos 10 buckets contabilísticos  595ms
 ✓ src/lib/__tests__/postgrest-row-limit.test.ts (2 tests) 825ms
   ✓ barreira dos 1.000 registos do PostgREST > [Issue #289] nenhuma leitura de tabela grande sem paginação  820ms
 ✓ src/lib/__tests__/postgrest-embeds.test.ts (2 tests) 1026ms
   ✓ embeds do PostgREST em pares com FK duplicada > [Issue #288] nenhum embed ambíguo sem a FK nomeada  1008ms
stderr | src/pages/__tests__/ResetPassword.test.tsx > ResetPassword — token_hash flow > (a) não chama verifyOtp ao montar; só ao clicar Continuar
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/campaign-design-optional-roas.test.ts (15 tests) 442ms
 ✓ src/pages/__tests__/ResetPassword.test.tsx (3 tests) 435ms
 ✓ src/test/forecast-attachment-counts.test.tsx (1 test) 591ms
   ✓ anexos do BP — uma leitura por evento (#269) > 361 linhas → 1 pedido a event_forecast_attachments  585ms
 ✓ src/lib/__tests__/document-detect.test.ts (5 tests) 2434ms
   ✓ detectDocumentQuad > deteta A4 rodado 12°, centrado com erro < 3%  654ms
   ✓ detectDocumentQuad > deteta A4 rodado -18°, à esquerda com erro < 3%  467ms
   ✓ detectDocumentQuad > deteta A4 rodado 20°, canto sup. dir. com erro < 3%  679ms
   ✓ detectDocumentQuad > deteta A4 rodado 6°, grande com erro < 3%  363ms
 ✓ src/lib/__tests__/storage-multi-tenant.test.ts (14 tests) 1387ms
   ✓ multi-tenant storage helpers > useSetActiveCompany limpa a cache do storage > depois da troca, withCompanyPath prefixa com a empresa nova  1349ms
 ✓ src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx (9 tests) 876ms
   ✓ #333 intent interactions without egress > corrupt uncertainty marker also fails closed  301ms
stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Esc não fecha o modal sob outra janela
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Dialog separa cabeçalho e corpo e mantém o X fora do scroll
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 ✓ src/test/mobile-modal-dismiss.test.tsx (6 tests) 469ms
stderr | src/components/data-entry/__tests__/DataEntryDialog.test.tsx > #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

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

 ✓ src/lib/__tests__/overlay-layer.test.tsx (6 tests) 664ms
   ✓ pilha de camadas — aninhamentos reais > #260 classificação acima da Nova Transação recebe foco e confirma escolha  439ms
stderr | src/test/club-config-integration.test.tsx > #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

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

 ✓ src/components/__tests__/EventABTab.test.tsx (4 tests) 661ms
   ✓ EventABTab — UI smoke tests > renderiza sem crashar e mostra labels/inputs das zonas  379ms
 ✓ src/test/club-config-integration.test.tsx (7 tests) 1087ms
   ✓ #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa  537ms
 ✓ src/test/event-financial-card-render-loop.test.tsx (1 test) 1147ms
   ✓ EventFinancialCard — sem ciclo de redesenho (#269) > chama onEbitdaParcelsChange uma única vez com queries vazias  1133ms
 ✓ src/components/data-entry/__tests__/DataEntryDialog.test.tsx (13 tests) 4224ms
   ✓ #333 DataEntryDialog > execução não validada: prévia visível, botão desativado mesmo após confirmação  533ms
   ✓ #333 DataEntryDialog > execução validada: exige confirmação explícita e mostra a conferência com a observação  332ms
   ✓ #333 DataEntryDialog > editar depois da prévia exige nova prévia/hash antes de executar  501ms
   ✓ #333 DataEntryDialog > retoma nunca declara sucesso por cache; repõe campos, lê check, sem commit  522ms
   ✓ #333 DataEntryDialog > execução tardia após close não mostra sucesso e retoma só confere  378ms
   ✓ #333 DataEntryDialog > resposta tardia de upload após contexto alterado é descartada  374ms
   ✓ #333 DataEntryDialog > resposta tardia de preview após contexto alterado é descartada  393ms
   ✓ #333 DataEntryDialog > utilizador diferente não recebe retoma; contexto revalidado antes de execução  375ms
 ✓ src/test/edge-fn-guard.test.ts (4 tests) 205ms
 ✓ src/test/coala-meta-audience-handler.test.ts (3 tests) 215ms
 ✓ src/test/newgang-wallet-google.test.ts (12 tests) 228ms
 ✓ src/lib/__tests__/postgrest-large-tables-mirror.test.ts (1 test) 86ms
stderr | src/lib/__tests__/permissions-guards-f2b.test.tsx > #311 F2b — guardas por permissão > manager com excepção module.crm entra em /crm e vê o cartão CRM activo
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/permissions-guards-f2b.test.tsx (5 tests) 187ms
 ✓ src/components/__tests__/LinkBpLineDialog-layer.test.tsx (1 test) 232ms
 ✓ src/test/ticket-office-statement-documents.test.tsx (6 tests) 225ms
stderr | src/test/require-feature.test.tsx > visibilidade por company_features > rota bloqueada sem a chave
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/require-feature.test.tsx (4 tests) 186ms
 ✓ src/lib/__tests__/tickets-v2-properties.test.ts (19 tests) 71ms
 ✓ src/lib/__tests__/cache-percentage.test.tsx (4 tests) 112ms
 ✓ src/test/newgang-content.test.tsx (2 tests) 106ms
stderr | src/test/consent-contract-322.test.ts > portal-track handler > consent: timeout da RPC → 503 bloqueado
[portal-track] consent rpc threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > bind falha (throw): lead entra sem ids Meta
[portal-track] consent bind threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > insert falha → 500 (sem falso sucesso)
[portal-track] insert lead_capture [33m500[39m

 ✓ src/test/consent-contract-322.test.ts (38 tests) 59ms
 ✓ src/test/similar-suppliers-notice.test.tsx (4 tests) 83ms
 ✓ src/test/ticket-office-settlement-view.test.tsx (3 tests) 93ms
 ✓ src/lib/__tests__/cache-report.test.ts (13 tests) 39ms
 ✓ src/test/ticket-office-settlement-pdf.test.ts (1 test) 89ms
 ✓ src/lib/__tests__/partner-statement-doc.test.ts (29 tests) 92ms
 ✓ src/components/__tests__/EventStatusBadge.test.tsx (5 tests) 69ms
 ✓ src/test/approve-lock-and-core.test.ts (6 tests) 52ms
 ✓ src/components/__tests__/StatCard.test.tsx (4 tests) 79ms
 ✓ src/lib/__tests__/zone-price-turns.test.ts (3 tests) 21ms
stderr | src/lib/__tests__/cache-scope.test.tsx > ecrã do subevento usa a configuração do Master > mostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/cache-scope.test.tsx (4 tests) 211ms
 ✓ src/test/event-financials-invalidation.test.tsx (8 tests) 70ms
 ✓ src/test/ticket-office-settlement-card-date.test.tsx (1 test) 107ms
 ✓ src/lib/__tests__/combo-capacity.test.ts (9 tests) 37ms
 ✓ src/test/camarim-session-pdf-sanitize.test.ts (1 test) 39ms
 ✓ src/lib/__tests__/google-click-match.test.ts (17 tests) 34ms
 ✓ src/lib/__tests__/event-cost-basis-tour.test.ts (13 tests) 9ms
 ✓ src/lib/__tests__/partner-disbursement.test.ts (11 tests) 11ms
 ✓ src/lib/__tests__/event-settlement-engine.test.ts (27 tests) 29ms
 ✓ src/lib/__tests__/bp-formula.test.ts (8 tests) 31ms
 ✓ src/test/newgang-welcome-once.test.ts (7 tests) 30ms
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

 ✓ src/components/TicketOfficePositionCards.test.tsx (7 tests) 34ms
 ✓ src/lib/__tests__/help-manual-parser.test.ts (10 tests) 23ms
 ✓ src/lib/__tests__/iva.test.ts (22 tests) 14ms
 ✓ src/test/song-link-ssr.test.ts (24 tests) 34ms
 ✓ src/test/newgang-portal.test.ts (10 tests) 46ms
 ✓ src/lib/__tests__/bp-version-multi-diff.test.ts (10 tests) 28ms
 ✓ src/lib/__tests__/event-partner-mirror.test.ts (5 tests) 21ms
 ✓ src/lib/__tests__/validations.test.ts (17 tests) 22ms
 ✓ src/test/standalone-compat-prepared.test.ts (26 tests) 32ms
 ✓ src/lib/__tests__/multi-day-ticketing.test.ts (25 tests | 4 skipped) 18ms
 ✓ src/lib/cost-center-map.test.ts (6 tests) 24ms
 ✓ src/lib/__tests__/bp-tx-matching.test.ts (12 tests) 23ms
 ✓ src/lib/__tests__/forecast-undo.test.ts (2 tests) 9ms
 ✓ src/lib/__tests__/data-entry-contract.test.ts (8 tests) 23ms
 ✓ src/test/newgang-edition-photos.test.ts (5 tests) 22ms
 ✓ src/lib/__tests__/statement-grouping.test.ts (16 tests) 26ms
 ✓ src/lib/__tests__/utils.test.ts (8 tests) 14ms
 ✓ src/test/transaction-duplicate-check.test.ts (6 tests) 22ms
 ✓ src/lib/__tests__/club-config-source.test.ts (12 tests) 14ms
 ✓ src/lib/__tests__/event-simulator-calc.test.ts (35 tests) 22ms
 ✓ src/test/newgang-history.test.ts (6 tests) 10ms
 ✓ src/test/coala-meta-audience-sync.test.ts (5 tests) 27ms
 ✓ src/lib/__tests__/standalone-attempt-routing.test.ts (13 tests) 25ms
 ✓ src/lib/__tests__/tickets-v2-read-layer.test.ts (28 tests | 7 skipped) 22ms
 ✓ src/lib/__tests__/transitory-transactions.test.ts (7 tests) 11ms
 ✓ src/lib/__tests__/income-tax-out-of-event-result.test.ts (5 tests) 14ms
 ✓ src/lib/__tests__/split-adjustment.test.ts (37 tests) 14ms
 ✓ src/test/derp248-tiktok-event-trackers.test.ts (11 tests) 21ms
 ✓ src/test/newgang-edition-videos.test.ts (6 tests) 20ms
 ✓ src/lib/__tests__/event-ab-full-suite.test.ts (27 tests) 18ms
 ✓ src/test/newgang-missions.test.ts (5 tests) 18ms
 ✓ src/test/newgang-strict-audience-delivery.test.ts (4 tests) 14ms
 ✓ src/lib/__tests__/forecast-boost.test.ts (12 tests) 15ms
 ✓ src/test/capi-p1-guard.test.ts (22 tests) 21ms
 ✓ src/test/bol-m2-parser.test.ts (9 tests) 14ms
 ✓ src/lib/__tests__/camarim-bp-rules.test.ts (6 tests) 15ms
 ✓ src/lib/__tests__/tour-cache-sync.test.ts (8 tests) 10ms
 ✓ src/lib/__tests__/fecho-preconditions.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/ticket-office-settlement-calc.test.ts (22 tests) 12ms
 ✓ src/lib/__tests__/bp-line-review.test.ts (12 tests) 12ms
 ✓ src/test/newgang-portal-bundle.test.ts (5 tests) 10ms
 ✓ src/test/newgang-wallet-levels.test.ts (14 tests) 24ms
 ✓ src/lib/__tests__/permissions-per-company.test.ts (5 tests) 16ms
 ✓ src/lib/__tests__/refund-grouping.test.ts (5 tests) 10ms
 ✓ src/lib/__tests__/simulator-prior-curve.test.ts (4 tests) 11ms
 ✓ src/test/bol-daily-parser.test.ts (9 tests) 15ms
 ✓ src/lib/__tests__/settlement-participants.test.ts (10 tests) 11ms
 ✓ src/test/ticketline-import-format-transition.test.ts (2 tests) 19ms
 ✓ src/lib/__tests__/event-simulator-ab-scale.test.ts (8 tests) 18ms
 ✓ src/lib/__tests__/supplier-credits.test.ts (34 tests) 30ms
 ✓ src/lib/__tests__/overhead-proration.test.ts (11 tests) 27ms
 ✓ src/lib/__tests__/partner-settlement-internal-report.test.ts (12 tests) 16ms
 ✓ src/components/__tests__/bp-installments.test.ts (20 tests) 22ms
 ✓ src/lib/sepa/bank-execution.test.ts (7 tests) 15ms
 ✓ src/lib/__tests__/event-cost-basis.test.ts (5 tests) 13ms
 ✓ src/lib/__tests__/event-revenue-basis.test.ts (12 tests) 20ms
 ✓ src/lib/__tests__/report-event-cost.test.ts (7 tests) 12ms
 ✓ src/lib/__tests__/real-cache-deductions.test.ts (8 tests) 23ms
 ✓ src/lib/__tests__/event-ab-calc.test.ts (12 tests) 11ms
 ✓ src/lib/__tests__/forecast-edit-diff.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/partner-extras-union-148.test.ts (6 tests) 8ms
 ✓ src/test/crm-ingest-no-network.test.ts (12 tests) 9ms
 ✓ src/lib/__tests__/ticket-office-reconciliation.test.ts (7 tests) 18ms
 ✓ src/lib/__tests__/ebitda.test.ts (8 tests) 32ms
 ✓ src/lib/__tests__/combo-gating.test.ts (19 tests) 10ms
 ✓ src/lib/__tests__/camarim-cash-preview.test.ts (5 tests) 22ms
 ✓ src/lib/__tests__/settlement-seal.test.ts (6 tests) 16ms
 ✓ src/lib/__tests__/settlement-revenue.test.ts (6 tests) 19ms
 ✓ src/test/payment-method-domain.test.ts (8 tests) 17ms
 ✓ src/lib/__tests__/creative-media.test.ts (19 tests) 14ms
 ✓ src/test/supplier-similarity.test.ts (11 tests) 16ms
 ✓ src/test/capi-diag-no-secrets.test.ts (6 tests) 11ms
 ✓ src/test/silent-writes.test.ts (6 tests) 14ms
 ✓ src/lib/__tests__/permissions.test.ts (5 tests) 14ms
 ✓ src/lib/__tests__/dre-nature-divergence.test.ts (2 tests) 8ms
 ✓ src/lib/__tests__/zone-price-elasticity.test.ts (7 tests) 11ms
 ✓ src/test/crm-audience-live-count.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/event-realized.test.ts (6 tests) 9ms
 ✓ src/lib/__tests__/payment-settlement.test.ts (8 tests) 15ms
 ✓ src/test/newgang-crews.test.ts (3 tests) 8ms
 ✓ src/test/check-deploy.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/standalone-capability-proposal.test.ts (3 tests) 23ms
 ✓ src/lib/crm/creativeReelsCheck.test.ts (5 tests) 5ms
 ✓ src/lib/__tests__/event-nature.test.ts (4 tests) 7ms
 ✓ src/components/__tests__/PasswordStrengthIndicator.test.ts (7 tests) 7ms
 ✓ src/lib/__tests__/pl-category-matching.test.ts (5 tests) 5ms
 ✓ src/lib/__tests__/bp-line-required.test.ts (6 tests) 6ms
 ✓ src/lib/__tests__/ads-tour-split.test.ts (4 tests) 13ms
 ✓ src/test/contactos-list-paging.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/ticket-office-position.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/cache-tab-total.test.ts (4 tests) 8ms
 ✓ src/lib/__tests__/settlement-perimeter.test.ts (6 tests) 12ms
 ✓ src/test/newgang-profile-country.test.ts (2 tests) 6ms
 ✓ src/test/operation-key-domain.test.ts (4 tests) 9ms
 ✓ src/test/partner-statement-cards.test.ts (3 tests) 9ms
 ✓ src/lib/__tests__/zone-capacities.test.ts (2 tests) 6ms
 ✓ src/lib/__tests__/account-balance-settling.test.ts (2 tests) 6ms
 ✓ src/lib/__tests__/partner-extras-kind.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/partner-rebill-vat.test.ts (4 tests) 5ms
 ✓ src/lib/__tests__/ticket-office-effective-open.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/master-adopted-expense-proration.test.ts (3 tests) 12ms
 ✓ src/lib/__tests__/session-copy.test.ts (3 tests) 6ms
 ✓ src/test/coala-centro-custo-norm.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/camarim-integrate.test.ts (4 tests) 8ms
 ✓ src/lib/__tests__/settlement-doc-text.test.ts (5 tests) 6ms
 ✓ src/lib/__tests__/accountant-account-filter.test.ts (5 tests) 7ms
 ✓ src/lib/__tests__/bp-planilha-version.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/zone-on-sale.test.ts (3 tests) 4ms
 ✓ src/lib/__tests__/ticket-category.test.ts (4 tests) 6ms
 ✓ src/test/memory-index.test.ts (3 tests) 6ms
stdout | src/lib/__tests__/card-session-theoretical.test.ts > #275 saldo teórico da sessão = fecho > sem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[#275] teórico = 636.68 esperado = 636.68

 ✓ src/lib/__tests__/card-session-theoretical.test.ts (1 test) 7ms
 ✓ src/lib/__tests__/permissions-guards-proof.test.ts (1 test) 6ms
 ✓ src/lib/__tests__/event-ab-rounding.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/ticket-revenue-single-rule.test.ts (6 tests) 10ms
 ✓ src/test/transaction-edit-modal-operation-key.test.ts (3 tests) 5ms
 ✓ src/test/ticket-office-settlement-eligible.test.ts (5 tests) 6ms
 ✓ src/test/payment-list-revalidate.test.ts (2 tests) 4ms
 ✓ src/lib/__tests__/audit.test.ts (4 tests) 9ms
 ✓ src/lib/__tests__/standalone-invoices.test.ts (4 tests) 5ms
 ✓ src/test/example.test.ts (1 test) 4ms
 ↓ src/test/partner-statement-edge.test.ts (1 test | 1 skipped)
 ✓ src/test/format-integer-conversions.test.ts (3 tests) 5ms

 Test Files  168 passed | 1 skipped (169)
      Tests  1359 passed | 1 skipped | 11 todo (1371)
   Start at  21:56:48
   Duration  89.27s (transform 12.76s, setup 145.25s, collect 155.61s, tests 21.69s, environment 719.37s, prepare 122.47s)


```

## tsgo final (cópia isolada)

```text

```

## Vite build final (cópia isolada)

```text
vite v5.4.19 building for production...
transforming...
Browserslist: browsers data (caniuse-lite) is 7 months old. Please run:
  npx update-browserslist-db@latest
  Why you should do it regularly: https://github.com/browserslist/update-db#readme
✓ 6193 modules transformed.
rendering chunks...
[plugin:vite:reporter] [plugin vite:reporter] 
(!) /tmp/issue333-repair/copy/src/lib/storage.ts is dynamically imported by /tmp/issue333-repair/copy/src/contexts/AuthContext.tsx, /tmp/issue333-repair/copy/src/contexts/AuthContext.tsx, /tmp/issue333-repair/copy/src/hooks/useCompany.ts but also statically imported by /tmp/issue333-repair/copy/src/components/BPNotesAttachmentsModal.tsx, /tmp/issue333-repair/copy/src/components/CacheExtrasPanel.tsx, /tmp/issue333-repair/copy/src/components/EntityDocumentsSection.tsx, /tmp/issue333-repair/copy/src/components/EventABAttachmentsSection.tsx, /tmp/issue333-repair/copy/src/components/EventClosingCosts.tsx, /tmp/issue333-repair/copy/src/components/EventForecast.tsx, /tmp/issue333-repair/copy/src/components/PartnerExtrasPanel.tsx, /tmp/issue333-repair/copy/src/components/PaymentListReceipts.tsx, /tmp/issue333-repair/copy/src/components/SupplierCreditsPanel.tsx, /tmp/issue333-repair/copy/src/components/TicketOfficeSettlementModal.tsx, /tmp/issue333-repair/copy/src/components/TransactionDocumentsModal.tsx, /tmp/issue333-repair/copy/src/components/TransactionFormModal.tsx, /tmp/issue333-repair/copy/src/components/bank/BankLineDocumentsDialog.tsx, /tmp/issue333-repair/copy/src/components/camarim/CamarimItemAttachmentButton.tsx, /tmp/issue333-repair/copy/src/components/camarim/CamarimItemModal.tsx, /tmp/issue333-repair/copy/src/components/cards/NewCardExpenseModal.tsx, /tmp/issue333-repair/copy/src/components/supplier-credits/NewSupplierCreditModal.tsx, /tmp/issue333-repair/copy/src/components/supplier-credits/SupplierCreditsTab.tsx, /tmp/issue333-repair/copy/src/pages/BankReconciliation.tsx, /tmp/issue333-repair/copy/src/pages/EventImplementations.tsx, /tmp/issue333-repair/copy/src/pages/PartnerEventDetail.tsx, /tmp/issue333-repair/copy/src/pages/StandaloneInvoiceScanner.tsx, /tmp/issue333-repair/copy/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx, dynamic import will not move module into another chunk.

[bundle] inicial estático: 4540454 bytes
computing gzip size...
dist/manifest.webmanifest                                        0.47 kB
dist/index.html                                                  3.95 kB │ gzip:   1.29 kB
dist/assets/logo-horizontal-mvVEptKs.png                        45.85 kB
dist/bundle-report.json                                        807.25 kB │ gzip:  76.10 kB
dist/assets/transaction-lifecycle-DuCcaQBZ.jpg               1,175.46 kB
dist/assets/event-lifecycle-CvV3N1nA.jpg                     1,221.66 kB
dist/assets/pdf.worker.min-iDqQPrd3.mjs                      1,232.30 kB
dist/assets/user-roles-CevPcr3I.jpg                          1,241.98 kB
dist/assets/accounts-flow-BVCUzNuB.jpg                       1,252.59 kB
dist/assets/bp-workflow-EJGerC2n.jpg                         1,332.07 kB
dist/assets/StrategyPrint-CymDZpv5.css                           3.64 kB │ gzip:   1.24 kB
dist/assets/AudiencePrint-CdEbyEIQ.css                           5.16 kB │ gzip:   1.48 kB
dist/assets/index-CUszSXa7.css                                 171.29 kB │ gzip:  27.24 kB
dist/assets/vendor-handsontable-8wq-FOPh.css                   182.11 kB │ gzip:  21.62 kB
dist/assets/subDays-BR8n3PdH.js                                  0.09 kB │ gzip:   0.10 kB
dist/assets/differenceInMilliseconds-LLbDEX0K.js                 0.12 kB │ gzip:   0.13 kB
dist/assets/operacao-labels-Cq-Qt5BS.js                          0.13 kB │ gzip:   0.12 kB
dist/assets/useDisplayCurrency-B_KVa_Tq.js                       0.15 kB │ gzip:   0.15 kB
dist/assets/startOfMonth-CKCw-RWI.js                             0.15 kB │ gzip:   0.15 kB
dist/assets/constants-uO0lGu32.js                                0.16 kB │ gzip:   0.15 kB
dist/assets/bp-category-constraint-B8MCXqQh.js                   0.19 kB │ gzip:   0.15 kB
dist/assets/differenceInCalendarMonths-B7vAcVWO.js               0.19 kB │ gzip:   0.17 kB
dist/assets/endOfMonth-Bz2Gx-N-.js                               0.20 kB │ gzip:   0.18 kB
dist/assets/useDebouncedValue-BaxrCoFs.js                        0.20 kB │ gzip:   0.17 kB
dist/assets/pdf-text-CRO-dKNy.js                                 0.20 kB │ gzip:   0.17 kB
dist/assets/addDays-CklYSQT6.js                                  0.21 kB │ gzip:   0.19 kB
dist/assets/skeleton-B2agE0r-.js                                 0.21 kB │ gzip:   0.19 kB
dist/assets/country-BQyONak0.js                                  0.23 kB │ gzip:   0.19 kB
dist/assets/slug-Bzks-5QT.js                                     0.23 kB │ gzip:   0.19 kB
dist/assets/rateio-children-CukInAMc.js                          0.24 kB │ gzip:   0.16 kB
dist/assets/differenceInCalendarDays-CZO_y_Bc.js                 0.24 kB │ gzip:   0.20 kB
dist/assets/must-write-D6vQQ_6o.js                               0.28 kB │ gzip:   0.23 kB
dist/assets/eachDayOfInterval-BuSrMpJD.js                        0.30 kB │ gzip:   0.23 kB
dist/assets/backdropClose-DPZFa3bB.js                            0.30 kB │ gzip:   0.21 kB
dist/assets/relativeTime-CufnskKF.js                             0.30 kB │ gzip:   0.22 kB
dist/assets/addMonths-Dsh0EBap.js                                0.35 kB │ gzip:   0.25 kB
dist/assets/overlay-layer-BPOL8znc.js                            0.37 kB │ gzip:   0.28 kB
dist/assets/separator-D9F_efJ1.js                                0.40 kB │ gzip:   0.28 kB
dist/assets/strategy-status-if_xUdsk.js                          0.41 kB │ gzip:   0.24 kB
dist/assets/form-enter-guard-TC9TB5Pp.js                         0.43 kB │ gzip:   0.32 kB
dist/assets/IbanWarning-C5jCqgnJ.js                              0.43 kB │ gzip:   0.32 kB
dist/assets/traction-C6TeXKI5.js                                 0.45 kB │ gzip:   0.30 kB
dist/assets/string-similarity-B7WDu-Mk.js                        0.45 kB │ gzip:   0.31 kB
dist/assets/creative-media-DKNTK8AD.js                           0.50 kB │ gzip:   0.31 kB
dist/assets/differenceInDays-ChvF9Jc3.js                         0.54 kB │ gzip:   0.32 kB
dist/assets/budget-mode-DdeHuZOT.js                              0.56 kB │ gzip:   0.40 kB
dist/assets/useMyLeadFrenteIds-9u7FnY9I.js                       0.56 kB │ gzip:   0.39 kB
dist/assets/getTimezoneOffsetInMilliseconds-CEhzTjz1.js          0.58 kB │ gzip:   0.34 kB
dist/assets/audience-pdf-RQfvkLkz.js                             0.64 kB │ gzip:   0.41 kB
dist/assets/PriorityBadge-DqsaMSJT.js                            0.67 kB │ gzip:   0.43 kB
dist/assets/avatar-x_Icg45t.js                                   0.67 kB │ gzip:   0.34 kB
dist/assets/StaffList-CDMbXqKD.js                                0.69 kB │ gzip:   0.42 kB
dist/assets/IvaRateSelect-CZAFv_yY.js                            0.75 kB │ gzip:   0.49 kB
dist/assets/event-nature-BSQ-ezBD.js                             0.78 kB │ gzip:   0.45 kB
dist/assets/useRealtimeInvalidation-c9lGimD0.js                  0.78 kB │ gzip:   0.51 kB
dist/assets/useOperacaoFilters-Q5u6A-8L.js                       0.81 kB │ gzip:   0.49 kB
dist/assets/admin-window-1aRfKYxn.js                             0.85 kB │ gzip:   0.50 kB
dist/assets/scroll-area-Dc7eyDv3.js                              0.85 kB │ gzip:   0.45 kB
dist/assets/FeatureNotEnabledCard-4i3rj4vn.js                    0.87 kB │ gzip:   0.50 kB
dist/assets/money-input-xFhhASzG.js                              0.89 kB │ gzip:   0.52 kB
dist/assets/ReportArtistCachePage-Cra_Vohz.js                    0.90 kB │ gzip:   0.51 kB
dist/assets/card-account-balance-QO0Kvl6m.js                     0.92 kB │ gzip:   0.53 kB
dist/assets/account-balance-rpc-jz6B3UsL.js                      0.93 kB │ gzip:   0.50 kB
dist/assets/circuit-account-y4fpMRYg.js                          0.94 kB │ gzip:   0.59 kB
dist/assets/alert-BUm_xQ84.js                                    0.95 kB │ gzip:   0.49 kB
dist/assets/supplier-credits-ckLIs9xO.js                         0.98 kB │ gzip:   0.56 kB
dist/assets/EventNatureFilter-D-RTbaSy.js                        1.00 kB │ gzip:   0.59 kB
dist/assets/accordion-dILCLA_Z.js                                1.02 kB │ gzip:   0.52 kB
dist/assets/app-badge-Py8fBpPL.js                                1.04 kB │ gzip:   0.51 kB
dist/assets/PhaseBadge-DfdTbYln.js                               1.05 kB │ gzip:   0.56 kB
dist/assets/bank-link-date-DcRav5qG.js                           1.05 kB │ gzip:   0.53 kB
dist/assets/ReportAccountingExportPage-MZI-xLXx.js               1.17 kB │ gzip:   0.63 kB
dist/assets/ReportDocumentPendenciesPage-4NHq67ul.js             1.18 kB │ gzip:   0.63 kB
dist/assets/zone-capacities-FgCeRvav.js                          1.22 kB │ gzip:   0.56 kB
dist/assets/OperacaoStatusBadge-BTEy3mPG.js                      1.22 kB │ gzip:   0.52 kB
dist/assets/_LegalLayout-D-6fXKND.js                             1.23 kB │ gzip:   0.52 kB
dist/assets/card-session-helpers-B5HFVhsf.js                     1.31 kB │ gzip:   0.65 kB
dist/assets/FrenteLeadsAvatars-ghCM5g0y.js                       1.34 kB │ gzip:   0.72 kB
dist/assets/account-balance-CdgQ3usL.js                          1.36 kB │ gzip:   0.69 kB
dist/assets/MirrorAporteNotice-X6JpJr1n.js                       1.40 kB │ gzip:   0.78 kB
dist/assets/currency-DvXZV_Ot.js                                 1.43 kB │ gzip:   0.74 kB
dist/assets/accountant-reviews-B3Ng6IvY.js                       1.46 kB │ gzip:   0.60 kB
dist/assets/toggle-group-Cc1232pZ.js                             1.49 kB │ gzip:   0.67 kB
dist/assets/supplier-bank-C6_qe4Cz.js                            1.51 kB │ gzip:   0.70 kB
dist/assets/bp-line-relink-DjQYAMU2.js                           1.52 kB │ gzip:   0.59 kB
dist/assets/capital-branch-D3s76-gM.js                           1.67 kB │ gzip:   0.78 kB
dist/assets/EtapaAssigneeAvatars-BBz1ogfG.js                     1.68 kB │ gzip:   0.79 kB
dist/assets/ebitda-DVNydJzw.js                                   1.74 kB │ gzip:   0.76 kB
dist/assets/camarim-helpers-M1Vn5iD-.js                          1.76 kB │ gzip:   0.78 kB
dist/assets/AdAccounts-DvWpAuFa.js                               1.78 kB │ gzip:   0.78 kB
dist/assets/iban-BYOybSCJ.js                                     1.79 kB │ gzip:   0.95 kB
dist/assets/invoice-ocr-prepare-CcJft9v3.js                      1.85 kB │ gzip:   1.02 kB
dist/assets/bp-line-required-x9uCGZ5N.js                         1.88 kB │ gzip:   0.76 kB
dist/assets/NewStaffDialog-xP1tmN-Z.js                           1.89 kB │ gzip:   0.99 kB
dist/assets/AcceptInvite-ByemveiV.js                             1.97 kB │ gzip:   1.00 kB
dist/assets/dashboard-format-GnqOyAs1.js                         2.00 kB │ gzip:   0.92 kB
dist/assets/settlement-participants-Casf-xDA.js                  2.01 kB │ gzip:   0.80 kB
dist/assets/useEventIvaRates-D5ltWJkB.js                         2.01 kB │ gzip:   1.03 kB
dist/assets/StatCard-CZypfA8B.js                                 2.05 kB │ gzip:   0.85 kB
dist/assets/ReportCostSourceToggle-C2WrVT_E.js                   2.09 kB │ gzip:   0.93 kB
dist/assets/event-ab-calc-BxWHlvfV.js                            2.10 kB │ gzip:   0.74 kB
dist/assets/AudienceNew-AsRC6BTc.js                              2.12 kB │ gzip:   1.05 kB
dist/assets/date-picker-CMYPavoD.js                              2.24 kB │ gzip:   1.10 kB
dist/assets/ticket-office-reconciliation-B__M3G_P.js             2.25 kB │ gzip:   1.05 kB
dist/assets/useUserPreferences-DuZO1umZ.js                       2.30 kB │ gzip:   0.70 kB
dist/assets/formatDistanceToNow-CgGNwkFO.js                      2.32 kB │ gzip:   0.98 kB
dist/assets/partner-extras-DwDJ645E.js                           2.32 kB │ gzip:   0.97 kB
dist/assets/bp-tx-matching-BHd1Ixbn.js                           2.38 kB │ gzip:   0.97 kB
dist/assets/useScenarioForecasts-C9Rjfq2Z.js                     2.48 kB │ gzip:   1.22 kB
dist/assets/ImageUploader-pcZzpFXO.js                            2.51 kB │ gzip:   1.28 kB
dist/assets/SupplierBankDetails-DPN6eKVs.js                      2.56 kB │ gzip:   0.94 kB
dist/assets/parseISO-Cr0H38in.js                                 2.70 kB │ gzip:   1.19 kB
dist/assets/UserSettings-EruCXKJm.js                             2.99 kB │ gzip:   1.46 kB
dist/assets/MeusChamados-CmcprZci.js                             3.02 kB │ gzip:   1.36 kB
dist/assets/DiagnosisTest-B2bh3yQu.js                            3.18 kB │ gzip:   1.29 kB
dist/assets/real-cache-calc-zFpcn_as.js                          3.25 kB │ gzip:   1.48 kB
dist/assets/ChamadoNovo-BXqDx2Mk.js                              3.56 kB │ gzip:   1.56 kB
dist/assets/IbanDuplicates-C90XebyQ.js                           3.67 kB │ gzip:   1.72 kB
dist/assets/OperacaoHome-BZs3KR2p.js                             3.74 kB │ gzip:   1.64 kB
dist/assets/SimilarSuppliersReview-Di8wJKsu.js                   3.75 kB │ gzip:   1.66 kB
dist/assets/ReportSalesCurvePage-DRiEDT93.js                     3.91 kB │ gzip:   1.78 kB
dist/assets/SimilarSuppliersNotice-DiuQPtRD.js                   3.98 kB │ gzip:   1.66 kB
dist/assets/FrentesPanel-BFvva8hf.js                             3.99 kB │ gzip:   1.76 kB
dist/assets/ReportSalesComparisonPage-hg2ifSj9.js                4.00 kB │ gzip:   1.85 kB
dist/assets/FundHolderPicker-BJqEMwka.js                         4.07 kB │ gzip:   1.59 kB
dist/assets/ReportAgingPage-zmSBZRjp.js                          4.21 kB │ gzip:   1.78 kB
dist/assets/UploadCoalaFotos-CGO9UeKH.js                         4.21 kB │ gzip:   1.77 kB
dist/assets/ReportMonthlyEvolutionPage-Ci3Me2rx.js               4.24 kB │ gzip:   1.72 kB
dist/assets/OperacaoListShell-aKxjAd7x.js                        4.32 kB │ gzip:   1.92 kB
dist/assets/cache-tab-total-Cm_0U0bh.js                          4.35 kB │ gzip:   1.67 kB
dist/assets/FieldStaffSection-B8b6TvbC.js                        4.38 kB │ gzip:   1.80 kB
dist/assets/csv-export-Bp8nlkXR.js                               4.39 kB │ gzip:   1.57 kB
dist/assets/ReportRevenueMixPage-I1OkLgM5.js                     4.39 kB │ gzip:   1.77 kB
dist/assets/chart-CGgGpkao.js                                    4.57 kB │ gzip:   1.94 kB
dist/assets/BlogList-Dvr9AeNG.js                                 4.57 kB │ gzip:   1.76 kB
dist/assets/ReportSupplierConcentrationPage-Ds_l6Xl9.js          4.61 kB │ gzip:   1.85 kB
dist/assets/AuditDownloads-BAbddc9u.js                           4.61 kB │ gzip:   1.83 kB
dist/assets/MinhasTarefas-DCHMyFvM.js                            4.68 kB │ gzip:   1.92 kB
dist/assets/Atividade-DTVaET4J.js                                4.70 kB │ gzip:   2.05 kB
dist/assets/Strategies-3LeOhyRV.js                               4.72 kB │ gzip:   1.84 kB
dist/assets/ReportAccountCategoriesPage-CFvtrPF0.js              4.73 kB │ gzip:   1.85 kB
dist/assets/ReportOccupancyRatePage-sMlKFReM.js                  4.73 kB │ gzip:   1.92 kB
dist/assets/GoogleAdsAdmin-Ciw3WHNF.js                           4.95 kB │ gzip:   1.97 kB
dist/assets/export-ticket-office-settlement-pdf-Bl7I6QkL.js      5.00 kB │ gzip:   2.29 kB
dist/assets/SyncHealth-BWjMRDiB.js                               5.13 kB │ gzip:   1.92 kB
dist/assets/ManualGaps-DVKVvCSw.js                               5.19 kB │ gzip:   2.21 kB
dist/assets/ReportBudgetDeviationPage-CPMNE_BB.js                5.36 kB │ gzip:   2.18 kB
dist/assets/PaginasList-C1bs2RRJ.js                              5.38 kB │ gzip:   2.15 kB
dist/assets/Creatives-DE95cmL0.js                                5.39 kB │ gzip:   1.99 kB
dist/assets/ReportTreasuryProjectionPage-BupYy7eU.js             5.39 kB │ gzip:   2.16 kB
dist/assets/invoice-group-BCNdeF22.js                            5.43 kB │ gzip:   1.76 kB
dist/assets/event-format-CO8YtA3Q.js                             5.45 kB │ gzip:   2.27 kB
dist/assets/UserActivityLog-B5jL5vPS.js                          5.50 kB │ gzip:   2.04 kB
dist/assets/AudiencesList-XLzPLe_X.js                            5.56 kB │ gzip:   2.25 kB
dist/assets/NewEventoPage-BYGhZbFL.js                            5.70 kB │ gzip:   2.18 kB
dist/assets/ReportPendencyIndexPage-HsixtZg3.js                  5.70 kB │ gzip:   1.69 kB
dist/assets/workbox-window.prod.es5-BqEJf4Xk.js                  5.71 kB │ gzip:   2.34 kB
dist/assets/pt-BR-Dh5EWHbw.js                                    5.85 kB │ gzip:   2.10 kB
dist/assets/LinkBpLineDialog-jvm-BW5l.js                         5.85 kB │ gzip:   2.26 kB
dist/assets/BankLineDocumentsDialog-B2RsDsSq.js                  5.95 kB │ gzip:   2.41 kB
dist/assets/pt-B3dxR9FF.js                                       5.97 kB │ gzip:   2.02 kB
dist/assets/EndossarEventoPage-kXflj3LV.js                       6.15 kB │ gzip:   2.48 kB
dist/assets/RlsLegacyAudit-DSppOghS.js                           6.21 kB │ gzip:   2.21 kB
dist/assets/EndorsementEditor-Bsg7b2cU.js                        6.33 kB │ gzip:   2.33 kB
dist/assets/ReportSuppliersPage-D-_PGmqi.js                      6.45 kB │ gzip:   2.19 kB
dist/assets/ChamadoDetail-BkQXhT4T.js                            6.47 kB │ gzip:   2.49 kB
dist/assets/Onboarding-CmK5440L.js                               6.60 kB │ gzip:   2.44 kB
dist/assets/ReportProfitabilityPage-fAvV28ug.js                  6.61 kB │ gzip:   2.54 kB
dist/assets/AudienceEditor-ydSPU9IG.js                           6.66 kB │ gzip:   2.37 kB
dist/assets/CardItemDocumentsField-AC0GBiNB.js                   6.74 kB │ gzip:   2.65 kB
dist/assets/ContactDetailsSheet-B_eWR60R.js                      6.75 kB │ gzip:   2.19 kB
dist/assets/Notifications-CuCl4k-R.js                            6.76 kB │ gzip:   1.93 kB
dist/assets/Reminders-sfI8K6e5.js                                6.79 kB │ gzip:   2.45 kB
dist/assets/ClubeNewgang-ruwXhX5X.js                             6.79 kB │ gzip:   2.55 kB
dist/assets/parse-ticketline-zone-xlsx-BE-mc_t4.js               6.86 kB │ gzip:   2.59 kB
dist/assets/Terms-CGaVRTsw.js                                    6.95 kB │ gzip:   2.30 kB
dist/assets/About-BAFcU0_8.js                                    7.00 kB │ gzip:   2.19 kB
dist/assets/CrmDashboard-CNB1ZVxR.js                             7.01 kB │ gzip:   2.60 kB
dist/assets/EditCampaignPopover-Cy-7xG9S.js                      7.06 kB │ gzip:   2.81 kB
dist/assets/en-US-CpWK9ySR.js                                    7.19 kB │ gzip:   2.47 kB
dist/assets/Trash-BEem3A8C.js                                    7.19 kB │ gzip:   2.63 kB
dist/assets/CategoryFormModal-Dj5I7T-B.js                        7.28 kB │ gzip:   2.78 kB
dist/assets/InvoiceGroupAudit-D6Xzjrmr.js                        7.33 kB │ gzip:   2.69 kB
dist/assets/PaginaEditor-jP43jdWT.js                             7.48 kB │ gzip:   2.73 kB
dist/assets/useBPVersions-fQnBctSF.js                            7.53 kB │ gzip:   1.77 kB
dist/assets/ReportPartnerExpensesPage-BONtIISP.js                7.68 kB │ gzip:   2.69 kB
dist/assets/AdminPanel-DoCYSfaO.js                               7.80 kB │ gzip:   3.24 kB
dist/assets/AccountantPendencies-C1A0bgEa.js                     7.94 kB │ gzip:   2.88 kB
dist/assets/InvariantMonitor-CdyFUb07.js                         8.36 kB │ gzip:   2.77 kB
dist/assets/EditFrenteSheet-BvRoxRal.js                          8.45 kB │ gzip:   2.97 kB
dist/assets/AudiencePreviewCount-DJSoBg41.js                     8.55 kB │ gzip:   3.26 kB
dist/assets/RaiseBudgetDialog-C0pD5Nz8.js                        8.57 kB │ gzip:   2.99 kB
dist/assets/StrategyNew-CEAb2FP3.js                              8.81 kB │ gzip:   3.46 kB
dist/assets/PurchaseAudienceCard-CZFU5gBy.js                     8.84 kB │ gzip:   2.83 kB
dist/assets/StrategyPrint-D8BKlBJV.js                            8.95 kB │ gzip:   2.83 kB
dist/assets/ChamadosList-Bx-m0A8v.js                             9.18 kB │ gzip:   3.60 kB
dist/assets/PessoaDetail-DmdA2RDz.js                             9.22 kB │ gzip:   2.99 kB
dist/assets/BlogEditor-DMY_QsgO.js                               9.25 kB │ gzip:   3.22 kB
dist/assets/SalesBI-CRFx-zTO.js                                  9.26 kB │ gzip:   3.46 kB
dist/assets/EventImplementations-Ur8eZhwd.js                     9.29 kB │ gzip:   3.25 kB
dist/assets/EventosList-BaIHSh4Z.js                              9.29 kB │ gzip:   3.05 kB
dist/assets/PortalSettings-COIv9TAG.js                           9.36 kB │ gzip:   3.42 kB
dist/assets/VideosList-CR2BvZ_Y.js                               9.37 kB │ gzip:   3.44 kB
dist/assets/AccountCategories-D4qP8E0S.js                        9.38 kB │ gzip:   3.15 kB
dist/assets/CustomerMatchUpload-DUpeXDn9.js                      9.38 kB │ gzip:   3.36 kB
dist/assets/import-pl-xlsx-CLC12WGh.js                           9.39 kB │ gzip:   4.03 kB
dist/assets/Quotations-DLXc7s_M.js                               9.50 kB │ gzip:   3.16 kB
dist/assets/SupplierTransactions-CkHnm59y.js                     9.96 kB │ gzip:   3.14 kB
dist/assets/ReportDocumentPendencies-eNSAGlMq.js                10.03 kB │ gzip:   3.10 kB
dist/assets/PressList-Dg8SErgd.js                               10.07 kB │ gzip:   3.66 kB
dist/assets/useEventABScenarios-CKIan7b4.js                     10.09 kB │ gzip:   3.73 kB
dist/assets/Setup-Cizr6Ffc.js                                   10.12 kB │ gzip:   3.63 kB
dist/assets/useCitySimulator-BGDq8lPl.js                        10.99 kB │ gzip:   3.61 kB
dist/assets/MetaCapiMonitor-WfKOYFEB.js                         11.33 kB │ gzip:   3.27 kB
dist/assets/FrenteDetail-p3RzUMc_.js                            11.38 kB │ gzip:   3.84 kB
dist/assets/ReportCashFlowPage-DH6AaJMg.js                      11.59 kB │ gzip:   3.73 kB
dist/assets/ReportPartnerSettlementPage-C24ijWpm.js             11.71 kB │ gzip:   3.40 kB
dist/assets/StrategyNewDesign-AyyqpkNm.js                       12.00 kB │ gzip:   4.28 kB
dist/assets/Privacy-DgRZix9p.js                                 12.10 kB │ gzip:   3.75 kB
dist/assets/StrategyPlanCard-xZBF-I5f.js                        12.20 kB │ gzip:   3.43 kB
dist/assets/CamarimEquipa-iU1tIs42.js                           12.29 kB │ gzip:   4.29 kB
dist/assets/EtapaSuppliersPanel-CAwFFL2i.js                     12.39 kB │ gzip:   3.39 kB
dist/assets/ReportIvaAuditPage-BlFEPMsd.js                      12.53 kB │ gzip:   4.05 kB
dist/assets/DuelView-DKW3EyqL.js                                12.61 kB │ gzip:   4.23 kB
dist/assets/LeadsList-CE6jyR6E.js                               12.84 kB │ gzip:   4.06 kB
dist/assets/format-CGtoj5si.js                                  13.04 kB │ gzip:   3.48 kB
dist/assets/EventTrackersCard-DlTvtjpQ.js                       13.15 kB │ gzip:   3.66 kB
dist/assets/ReportDREEmpresarialPage-D0lfahzu.js                13.19 kB │ gzip:   4.60 kB
dist/assets/ContactosList-RHLTQlbZ.js                           13.25 kB │ gzip:   4.93 kB
dist/assets/CampaignFromScratch-BaI9d3hd.js                     13.43 kB │ gzip:   4.42 kB
dist/assets/ReportAccountingExport-Cekwi7oQ.js                  13.56 kB │ gzip:   4.24 kB
dist/assets/CreativeNew-BAtXsyNb.js                             13.62 kB │ gzip:   4.78 kB
dist/assets/FormalidadeAudit-iWrm13Uc.js                        13.78 kB │ gzip:   4.56 kB
dist/assets/CampoView-Cpfluaj-.js                               13.80 kB │ gzip:   4.61 kB
dist/assets/RecurringTransactions-BXduhF4K.js                   13.87 kB │ gzip:   4.20 kB
dist/assets/ReportDailySalesPage-BTxSna5l.js                    13.89 kB │ gzip:   4.65 kB
dist/assets/BolSync-CN3etYxx.js                                 14.16 kB │ gzip:   4.22 kB
dist/assets/Pixels-BxQXeblW.js                                  14.28 kB │ gzip:   3.57 kB
dist/assets/CardSessions-C-twsdIX.js                            14.80 kB │ gzip:   4.64 kB
dist/assets/ReconciliacaoBpTx-CYHqKc8N.js                       14.91 kB │ gzip:   4.51 kB
dist/assets/Insights-BXqnP3Pg.js                                15.19 kB │ gzip:   3.79 kB
dist/assets/TicketlineSync-DiS9iypQ.js                          15.37 kB │ gzip:   4.72 kB
dist/assets/Companies-Ct_dkMqw.js                               15.57 kB │ gzip:   4.68 kB
dist/assets/DataEntryDialog-08s4n5jN.js                         16.27 kB │ gzip:   5.59 kB
dist/assets/MetaAudiencesList-DUvRswbm.js                       16.30 kB │ gzip:   5.24 kB
dist/assets/IvaManagement-D8M0cEs_.js                           17.28 kB │ gzip:   4.35 kB
dist/assets/Connections-DGVNU9GN.js                             17.29 kB │ gzip:   5.58 kB
dist/assets/UserManagement-C_Rc-6UD.js                          17.66 kB │ gzip:   5.41 kB
dist/assets/EtapasList-D-bpp4IX.js                              18.11 kB │ gzip:   6.34 kB
dist/assets/ibantools--sXKtUqI.js                               18.29 kB │ gzip:   3.82 kB
dist/assets/ReportForecastPayablesPage-2KKD4SzR.js              18.71 kB │ gzip:   4.82 kB
dist/assets/CartaoEquipa-D-vl_suD.js                            18.88 kB │ gzip:   6.60 kB
dist/assets/FrenteManage-D9DOMGzj.js                            19.16 kB │ gzip:   5.66 kB
dist/assets/ReportContasPagarPage-BDNNk01t.js                   19.71 kB │ gzip:   5.79 kB
dist/assets/Dashboard-D2dQotDu.js                               19.93 kB │ gzip:   6.51 kB
dist/assets/EventSimulatorDemo-C8RDjEte.js                      20.64 kB │ gzip:   4.85 kB
dist/assets/FunnelTest-BpTtv8e-.js                              21.00 kB │ gzip:   6.57 kB
dist/assets/FeverSync-Bi26ZGpO.js                               21.18 kB │ gzip:   6.95 kB
dist/assets/Camarim-v1vhNsfU.js                                 21.22 kB │ gzip:   5.94 kB
dist/assets/Audit-iA07D8te.js                                   21.40 kB │ gzip:   5.62 kB
dist/assets/BatchPaymentModal-DzvcI1yd.js                       21.60 kB │ gzip:   7.69 kB
dist/assets/ReportArtistCache-D86BW_Rx.js                       21.99 kB │ gzip:   7.84 kB
dist/assets/ReportDREBrasilPage-3FbHJTkW.js                     22.18 kB │ gzip:   6.45 kB
dist/assets/TicketOfficeSettlementsOverview-DIF1jvYq.js         22.24 kB │ gzip:   5.75 kB
dist/assets/SalesBIDetail-BLNR2gt4.js                           22.25 kB │ gzip:   7.48 kB
dist/assets/EquipaView-BMwZFzc8.js                              22.27 kB │ gzip:   6.71 kB
dist/assets/parse-B9BIfq30.js                                   22.36 kB │ gzip:   4.64 kB
dist/assets/TransactionDocumentsModal-B4yhZ09B.js               22.41 kB │ gzip:   7.17 kB
dist/assets/SecurityDashboard-C4xvAO33.js                       22.74 kB │ gzip:   5.52 kB
dist/assets/CreativeView-uSjCCQbj.js                            23.03 kB │ gzip:   6.42 kB
dist/assets/ReportMovementReconciliationPage-957ZB6Bq.js        23.58 kB │ gzip:   6.82 kB
dist/assets/StrategyRedesign-BFebeMBQ.js                        25.07 kB │ gzip:   6.48 kB
dist/assets/EtapaDetail-CZPj-lVQ.js                             25.52 kB │ gzip:   7.58 kB
dist/assets/purify.es-8E279hYE.js                               25.61 kB │ gzip:   9.67 kB
dist/assets/ReportBPTransactionsPage-RHJFe6FO.js                26.47 kB │ gzip:   7.76 kB
dist/assets/ZonasList-BNwxocqO.js                               26.50 kB │ gzip:   8.46 kB
dist/assets/DatabaseBackups-DOCr2bZK.js                         26.54 kB │ gzip:   7.17 kB
dist/assets/ReportDREPage-DfhPPX1p.js                           26.79 kB │ gzip:   7.56 kB
dist/assets/AudienceGoogleAds-BnfO7Wxd.js                       27.91 kB │ gzip:   8.37 kB
dist/assets/ReportBankStatementPage-C30WHM-5.js                 29.05 kB │ gzip:   8.85 kB
dist/assets/BPPlanilha-CEJroRyb.js                              29.23 kB │ gzip:  11.13 kB
dist/assets/AccountantStandaloneInvoicesTab-BV1r9L6y.js         30.11 kB │ gzip:   9.88 kB
dist/assets/event-revenue-basis-fnpxXSj-.js                     30.57 kB │ gzip:  10.48 kB
dist/assets/StandaloneInvoiceScanner-D_uygndA.js                30.74 kB │ gzip:  10.88 kB
dist/assets/RegistroFeed-DYG6zlE0.js                            30.74 kB │ gzip:   8.62 kB
dist/assets/ReportPLPage-PajQ9gu8.js                            31.27 kB │ gzip:   9.04 kB
dist/assets/AdsInvoices-BSv7_GYU.js                             31.40 kB │ gzip:   9.47 kB
dist/assets/HelpCenter-qr11bQTO.js                              31.66 kB │ gzip:  11.53 kB
dist/assets/Reimbursements-B8MTBXXn.js                          32.30 kB │ gzip:   9.41 kB
dist/assets/AudiencePrint-TCy5f-7p.js                           34.53 kB │ gzip:   8.18 kB
dist/assets/calendar-CyBFdweX.js                                34.63 kB │ gzip:  10.98 kB
dist/assets/SalesBIEvent-CS09U5T6.js                            36.52 kB │ gzip:  10.19 kB
dist/assets/ReportTicketOfficeAuditPage-CiQ0ciiF.js             37.13 kB │ gzip:   9.71 kB
dist/assets/AccountantHome-BXoqU8eb.js                          37.30 kB │ gzip:  10.19 kB
dist/assets/EventCalendar-BKDsLxbt.js                           38.26 kB │ gzip:   9.58 kB
dist/assets/TicketOfficeSettlementModal-B3adYGyg.js             39.12 kB │ gzip:  11.28 kB
dist/assets/Events-ChZSy-E7.js                                  39.24 kB │ gzip:  10.17 kB
dist/assets/Suppliers-Dl17eKJu.js                               39.57 kB │ gzip:   9.86 kB
dist/assets/CoalaSync-DRxEzmST.js                               41.47 kB │ gzip:  12.21 kB
dist/assets/EventHub-BuBFkACm.js                                41.59 kB │ gzip:  11.10 kB
dist/assets/marked.esm-DiRRsLPS.js                              42.33 kB │ gzip:  12.79 kB
dist/assets/CamarimItemAttachmentButton-DbNMh76u.js             42.81 kB │ gzip:  14.19 kB
dist/assets/installment-guard-Df2tKPQg.js                       42.88 kB │ gzip:  12.59 kB
dist/assets/sortable.esm-BdKBcYgv.js                            45.88 kB │ gzip:  15.28 kB
dist/assets/AuditoriaContas-CLFI3hYO.js                         49.48 kB │ gzip:  13.84 kB
dist/assets/EventMarketingEditor-DdGTDsJ7.js                    55.62 kB │ gzip:  14.13 kB
dist/assets/FinancialAccounts-Dpos5BnX.js                       57.56 kB │ gzip:  14.17 kB
dist/assets/StrategyView-Cxwhrw61.js                            61.24 kB │ gzip:  14.94 kB
dist/assets/ManualSync-DL1PsBz4.js                              66.06 kB │ gzip:  21.78 kB
dist/assets/CamarimSessionDetail-SnPE-m1t.js                    68.25 kB │ gzip:  18.88 kB
dist/assets/SupplierFormModal-I_CDaXwk.js                       72.39 kB │ gzip:  17.87 kB
dist/assets/NewgangSite-ezfo0TDW.js                             77.05 kB │ gzip:  21.37 kB
dist/assets/BankReconciliation-BzJ-o-Uh.js                      81.01 kB │ gzip:  23.09 kB
dist/assets/CardSessionDetail-DTXUK7e8.js                       86.83 kB │ gzip:  22.99 kB
dist/assets/jszip.min-BXddsgIY.js                               97.24 kB │ gzip:  30.05 kB
dist/assets/EventImplementationDetail-D9ZGnpUp.js              110.42 kB │ gzip:  29.32 kB
dist/assets/ReportPaymentListsPage-BHd5v-5d.js                 125.00 kB │ gzip:  33.80 kB
dist/assets/Campaigns-BUPK9NAh.js                              127.24 kB │ gzip:  34.28 kB
dist/assets/ticket-office-settlement-form-B7gmLaxM.js          129.28 kB │ gzip:  35.67 kB
dist/assets/EventSimulator-N_vkvAyY.js                         145.00 kB │ gzip:  37.46 kB
dist/assets/Transactions-DlFNVXR6.js                           148.40 kB │ gzip:  38.76 kB
dist/assets/index.es-Cxdmbib3.js                               150.74 kB │ gzip:  51.38 kB
dist/assets/TicketOffices-p7xEgMT3.js                          167.82 kB │ gzip:  43.20 kB
dist/assets/TransactionEditModal-4E2Tb-Pe.js                   198.63 kB │ gzip:  48.63 kB
dist/assets/html2canvas.esm-CBrSDip1.js                        201.42 kB │ gzip:  47.70 kB
dist/assets/vendor-supabase-nJ43FdCp.js                        209.56 kB │ gzip:  54.23 kB
dist/assets/CampaignView-DcC3RgU8.js                           222.38 kB │ gzip:  57.72 kB
dist/assets/vendor-react-Bj70lyM-.js                           227.23 kB │ gzip:  71.76 kB
dist/assets/EventForecast-BSlusSQd.js                          409.57 kB │ gzip: 105.76 kB
dist/assets/vendor-pdf-CMNrZReg.js                             421.80 kB │ gzip: 137.18 kB
dist/assets/vendor-charts-Ck58b2Xc.js                          434.16 kB │ gzip: 114.66 kB
dist/assets/pdf-first-page-to-jpeg-M5CLsCvW.js                 458.53 kB │ gzip: 135.85 kB
dist/assets/EventDetail-BxgsS_vD.js                            592.74 kB │ gzip: 150.88 kB
dist/assets/index-C4IG4THQ.js                                  823.99 kB │ gzip: 234.87 kB
dist/assets/vendor-ui-BZftet6E.js                            1,068.89 kB │ gzip: 220.20 kB
dist/assets/heic2any-BrEjYmvs.js                             1,352.85 kB │ gzip: 341.38 kB
dist/assets/vendor-xlsx-DjxqIRzH.js                          1,369.76 kB │ gzip: 412.26 kB
dist/assets/vendor-handsontable-NF1t-OMG.js                  1,906.58 kB │ gzip: 453.88 kB
dist/assets/heic-to-lXPrQE7P.js                              2,995.46 kB │ gzip: 736.99 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 49.39s

PWA v1.3.0
mode      generateSW
precache  344 entries (18875.94 KiB)
files generated
  dist/sw.js
  dist/workbox-7caff1f5.js

```

## PostgreSQL local — tentativa1

```text
runuser: user postgres does not exist or the user entry does not contain all the required fields

```

## PostgreSQL local — tentativa2

```text
runuser: user nobody does not exist or the user entry does not contain all the required fields

```

## PostgreSQL local — tentativa3

```text
initdb: could not look up effective user ID 65534: user does not exist

```
