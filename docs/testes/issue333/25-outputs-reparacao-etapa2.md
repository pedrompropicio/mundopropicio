# #333 — outputs locais integrais da reparação

Sem credenciais, dados Live ou invocações externas de negócio.

## Testes focados finais

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

 ✓ src/lib/__tests__/no-direct-transaction-document-remove.test.ts (3 tests) 440ms
   ✓ sem remoção directa em transaction-documents no frontend > nenhuma chamada directa a .remove nos 10 buckets contabilísticos  435ms
 ✓ src/lib/__tests__/postgrest-embeds.test.ts (2 tests) 728ms
   ✓ embeds do PostgREST em pares com FK duplicada > [Issue #288] nenhum embed ambíguo sem a FK nomeada  721ms
 ✓ src/lib/__tests__/postgrest-row-limit.test.ts (2 tests) 677ms
   ✓ barreira dos 1.000 registos do PostgREST > [Issue #289] nenhuma leitura de tabela grande sem paginação  666ms
 ✓ src/test/campaign-design-optional-roas.test.ts (15 tests) 260ms
 ✓ src/test/forecast-attachment-counts.test.tsx (1 test) 429ms
   ✓ anexos do BP — uma leitura por evento (#269) > 361 linhas → 1 pedido a event_forecast_attachments  427ms
 ✓ src/lib/__tests__/storage-multi-tenant.test.ts (14 tests) 1408ms
   ✓ multi-tenant storage helpers > useSetActiveCompany limpa a cache do storage > depois da troca, withCompanyPath prefixa com a empresa nova  1390ms
stderr | src/pages/__tests__/ResetPassword.test.tsx > ResetPassword — token_hash flow > (a) não chama verifyOtp ao montar; só ao clicar Continuar
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/document-detect.test.ts (5 tests) 2009ms
   ✓ detectDocumentQuad > deteta A4 rodado 12°, centrado com erro < 3%  568ms
   ✓ detectDocumentQuad > deteta A4 rodado -18°, à esquerda com erro < 3%  329ms
   ✓ detectDocumentQuad > deteta A4 rodado 20°, canto sup. dir. com erro < 3%  369ms
   ✓ detectDocumentQuad > deteta A4 rodado 6°, grande com erro < 3%  478ms
 ✓ src/pages/__tests__/ResetPassword.test.tsx (3 tests) 424ms
   ✓ ResetPassword — token_hash flow > (a) não chama verifyOtp ao montar; só ao clicar Continuar  308ms
 ✓ src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx (8 tests) 1085ms
   ✓ #333 intent interactions without egress > company event invalidates confirmation before context props refresh  312ms
stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Esc não fecha o modal sob outra janela
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Dialog separa cabeçalho e corpo e mantém o X fora do scroll
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 ✓ src/test/mobile-modal-dismiss.test.tsx (6 tests) 534ms
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

 ✓ src/lib/__tests__/overlay-layer.test.tsx (6 tests) 691ms
   ✓ pilha de camadas — aninhamentos reais > #260 classificação acima da Nova Transação recebe foco e confirma escolha  433ms
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

 ✓ src/components/__tests__/EventABTab.test.tsx (4 tests) 671ms
   ✓ EventABTab — UI smoke tests > renderiza sem crashar e mostra labels/inputs das zonas  442ms
 ✓ src/test/club-config-integration.test.tsx (7 tests) 1117ms
   ✓ #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa  572ms
 ✓ src/test/event-financial-card-render-loop.test.tsx (1 test) 1144ms
   ✓ EventFinancialCard — sem ciclo de redesenho (#269) > chama onEbitdaParcelsChange uma única vez com queries vazias  1141ms
 ✓ src/components/data-entry/__tests__/DataEntryDialog.test.tsx (13 tests) 4378ms
   ✓ #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações  410ms
   ✓ #333 DataEntryDialog > execução não validada: prévia visível, botão desativado mesmo após confirmação  628ms
   ✓ #333 DataEntryDialog > execução validada: exige confirmação explícita e mostra a conferência com a observação  491ms
   ✓ #333 DataEntryDialog > editar depois da prévia exige nova prévia/hash antes de executar  469ms
   ✓ #333 DataEntryDialog > retoma nunca declara sucesso por cache; repõe campos, lê check, sem commit  419ms
   ✓ #333 DataEntryDialog > execução tardia após close não mostra sucesso e retoma só confere  378ms
   ✓ #333 DataEntryDialog > execução tardia após company não mostra sucesso e retoma só confere  323ms
   ✓ #333 DataEntryDialog > resposta tardia de upload após contexto alterado é descartada  350ms
   ✓ #333 DataEntryDialog > resposta tardia de preview após contexto alterado é descartada  334ms
   ✓ #333 DataEntryDialog > utilizador diferente não recebe retoma; contexto revalidado antes de execução  334ms
 ✓ src/test/edge-fn-guard.test.ts (4 tests) 206ms
 ✓ src/test/coala-meta-audience-handler.test.ts (3 tests) 216ms
 ✓ src/test/newgang-wallet-google.test.ts (12 tests) 152ms
stderr | src/lib/__tests__/permissions-guards-f2b.test.tsx > #311 F2b — guardas por permissão > manager com excepção module.crm entra em /crm e vê o cartão CRM activo
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/permissions-guards-f2b.test.tsx (5 tests) 186ms
 ✓ src/test/similar-suppliers-notice.test.tsx (4 tests) 94ms
stderr | src/test/require-feature.test.tsx > visibilidade por company_features > rota bloqueada sem a chave
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/require-feature.test.tsx (4 tests) 152ms
 ✓ src/components/__tests__/LinkBpLineDialog-layer.test.tsx (1 test) 228ms
 ✓ src/test/ticket-office-statement-documents.test.tsx (6 tests) 234ms
 ✓ src/lib/__tests__/tickets-v2-properties.test.ts (19 tests) 118ms
 ✓ src/lib/__tests__/google-click-match.test.ts (17 tests) 36ms
 ✓ src/lib/__tests__/cache-percentage.test.tsx (4 tests) 110ms
 ✓ src/lib/__tests__/postgrest-large-tables-mirror.test.ts (1 test) 129ms
 ✓ src/test/newgang-content.test.tsx (2 tests) 146ms
 ✓ src/test/approve-lock-and-core.test.ts (6 tests) 60ms
 ✓ src/lib/__tests__/partner-statement-doc.test.ts (29 tests) 124ms
stderr | src/test/consent-contract-322.test.ts > portal-track handler > consent: timeout da RPC → 503 bloqueado
[portal-track] consent rpc threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > bind falha (throw): lead entra sem ids Meta
[portal-track] consent bind threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > insert falha → 500 (sem falso sucesso)
[portal-track] insert lead_capture [33m500[39m

 ✓ src/test/consent-contract-322.test.ts (38 tests) 81ms
 ✓ src/lib/__tests__/data-entry-contract.test.ts (8 tests) 24ms
 ✓ src/test/ticket-office-settlement-pdf.test.ts (1 test) 67ms
 ✓ src/components/__tests__/StatCard.test.tsx (4 tests) 92ms
 ✓ src/test/ticket-office-settlement-view.test.tsx (3 tests) 83ms
 ✓ src/components/__tests__/EventStatusBadge.test.tsx (5 tests) 75ms
stderr | src/lib/__tests__/cache-scope.test.tsx > ecrã do subevento usa a configuração do Master > mostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/transaction-duplicate-check.test.ts (6 tests) 22ms
 ✓ src/lib/__tests__/cache-scope.test.tsx (4 tests) 194ms
 ✓ src/test/event-financials-invalidation.test.tsx (8 tests) 62ms
 ✓ src/test/camarim-session-pdf-sanitize.test.ts (1 test) 43ms
 ✓ src/lib/__tests__/bp-line-review.test.ts (12 tests) 13ms
 ✓ src/lib/__tests__/combo-capacity.test.ts (9 tests) 45ms
 ✓ src/lib/__tests__/bp-formula.test.ts (8 tests) 32ms
 ✓ src/test/newgang-missions.test.ts (5 tests) 17ms
 ✓ src/test/coala-meta-audience-sync.test.ts (5 tests) 20ms
 ✓ src/test/ticket-office-settlement-card-date.test.tsx (1 test) 125ms
 ✓ src/lib/__tests__/help-manual-parser.test.ts (10 tests) 32ms
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
 ✓ src/lib/__tests__/cache-report.test.ts (13 tests) 64ms
 ✓ src/test/newgang-welcome-once.test.ts (7 tests) 34ms
 ✓ src/test/newgang-portal.test.ts (10 tests) 31ms
 ✓ src/test/standalone-compat-prepared.test.ts (26 tests) 28ms
 ✓ src/lib/__tests__/event-settlement-engine.test.ts (27 tests) 34ms
 ✓ src/test/newgang-edition-photos.test.ts (5 tests) 23ms
 ✓ src/lib/__tests__/bp-version-multi-diff.test.ts (10 tests) 29ms
 ✓ src/test/newgang-edition-videos.test.ts (6 tests) 18ms
 ✓ src/test/song-link-ssr.test.ts (24 tests) 32ms
 ✓ src/lib/__tests__/tickets-v2-read-layer.test.ts (28 tests | 7 skipped) 20ms
 ✓ src/lib/__tests__/tour-cache-sync.test.ts (8 tests) 14ms
 ✓ src/lib/cost-center-map.test.ts (6 tests) 26ms
 ✓ src/lib/__tests__/event-ab-full-suite.test.ts (27 tests) 17ms
 ✓ src/lib/__tests__/ticket-office-settlement-calc.test.ts (22 tests) 13ms
 ✓ src/lib/__tests__/settlement-revenue.test.ts (6 tests) 10ms
 ✓ src/lib/__tests__/event-partner-mirror.test.ts (5 tests) 29ms
 ✓ src/lib/__tests__/club-config-source.test.ts (12 tests) 21ms
 ✓ src/test/newgang-portal-bundle.test.ts (5 tests) 13ms
 ✓ src/lib/__tests__/standalone-attempt-routing.test.ts (13 tests) 20ms
 ✓ src/lib/__tests__/statement-grouping.test.ts (16 tests) 22ms
 ✓ src/lib/__tests__/real-cache-deductions.test.ts (8 tests) 11ms
 ✓ src/lib/__tests__/multi-day-ticketing.test.ts (25 tests | 4 skipped) 27ms
 ✓ src/test/newgang-history.test.ts (6 tests) 21ms
 ✓ src/lib/__tests__/settlement-participants.test.ts (10 tests) 12ms
 ✓ src/lib/__tests__/settlement-perimeter.test.ts (6 tests) 7ms
 ✓ src/lib/__tests__/income-tax-out-of-event-result.test.ts (5 tests) 18ms
 ✓ src/lib/__tests__/camarim-bp-rules.test.ts (6 tests) 15ms
 ✓ src/lib/__tests__/partner-disbursement.test.ts (11 tests) 32ms
 ✓ src/test/bol-m2-parser.test.ts (9 tests) 14ms
 ✓ src/lib/__tests__/validations.test.ts (17 tests) 29ms
 ✓ src/lib/__tests__/iva.test.ts (22 tests) 32ms
 ✓ src/test/derp248-tiktok-event-trackers.test.ts (11 tests) 18ms
 ✓ src/test/payment-method-domain.test.ts (8 tests) 10ms
 ✓ src/lib/__tests__/forecast-boost.test.ts (12 tests) 16ms
 ✓ src/lib/__tests__/transitory-transactions.test.ts (7 tests) 20ms
 ✓ src/lib/__tests__/utils.test.ts (8 tests) 22ms
 ✓ src/lib/__tests__/zone-price-turns.test.ts (3 tests) 58ms
 ✓ src/lib/__tests__/event-simulator-calc.test.ts (35 tests) 21ms
 ✓ src/test/newgang-strict-audience-delivery.test.ts (4 tests) 15ms
 ✓ src/lib/__tests__/bp-tx-matching.test.ts (12 tests) 25ms
 ✓ src/test/operation-key-domain.test.ts (4 tests) 6ms
 ✓ src/lib/sepa/bank-execution.test.ts (7 tests) 11ms
 ✓ src/test/newgang-wallet-levels.test.ts (14 tests) 13ms
 ✓ src/lib/__tests__/settlement-seal.test.ts (6 tests) 10ms
 ✓ src/test/capi-p1-guard.test.ts (22 tests) 15ms
 ✓ src/lib/__tests__/overhead-proration.test.ts (11 tests) 11ms
 ✓ src/lib/__tests__/split-adjustment.test.ts (37 tests) 18ms
 ✓ src/test/crm-ingest-no-network.test.ts (12 tests) 10ms
 ✓ src/lib/__tests__/creative-media.test.ts (19 tests) 10ms
 ✓ src/lib/__tests__/partner-settlement-internal-report.test.ts (12 tests) 11ms
 ✓ src/lib/__tests__/permissions-per-company.test.ts (5 tests) 12ms
 ✓ src/lib/__tests__/audit.test.ts (4 tests) 4ms
 ✓ src/lib/__tests__/event-cost-basis-tour.test.ts (13 tests) 32ms
 ✓ src/components/__tests__/bp-installments.test.ts (20 tests) 48ms
 ✓ src/test/ticketline-import-format-transition.test.ts (2 tests) 11ms
 ✓ src/lib/__tests__/event-ab-calc.test.ts (12 tests) 10ms
 ✓ src/lib/__tests__/supplier-credits.test.ts (34 tests) 12ms
 ✓ src/test/bol-daily-parser.test.ts (9 tests) 12ms
 ✓ src/lib/__tests__/refund-grouping.test.ts (5 tests) 12ms
 ✓ src/lib/__tests__/camarim-cash-preview.test.ts (5 tests) 10ms
 ✓ src/test/capi-diag-no-secrets.test.ts (6 tests) 9ms
 ✓ src/lib/__tests__/report-event-cost.test.ts (7 tests) 11ms
 ✓ src/lib/__tests__/event-revenue-basis.test.ts (12 tests) 11ms
 ✓ src/lib/__tests__/ticket-office-reconciliation.test.ts (7 tests) 10ms
 ✓ src/test/partner-statement-cards.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/simulator-prior-curve.test.ts (4 tests) 12ms
 ✓ src/lib/__tests__/event-realized.test.ts (6 tests) 8ms
 ✓ src/lib/__tests__/forecast-undo.test.ts (2 tests) 26ms
 ✓ src/lib/__tests__/zone-price-elasticity.test.ts (7 tests) 8ms
 ✓ src/lib/__tests__/ebitda.test.ts (8 tests) 10ms
 ✓ src/lib/__tests__/cache-tab-total.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/ticket-office-effective-open.test.ts (4 tests) 6ms
 ✓ src/test/silent-writes.test.ts (6 tests) 9ms
 ✓ src/test/supplier-similarity.test.ts (11 tests) 9ms
 ✓ src/lib/__tests__/ads-tour-split.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/combo-gating.test.ts (19 tests) 10ms
 ✓ src/components/__tests__/PasswordStrengthIndicator.test.ts (7 tests) 7ms
 ✓ src/lib/__tests__/partner-extras-union-148.test.ts (6 tests) 11ms
 ✓ src/lib/__tests__/bp-line-required.test.ts (6 tests) 7ms
 ✓ src/lib/__tests__/camarim-integrate.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/event-simulator-ab-scale.test.ts (8 tests) 12ms
 ✓ src/lib/__tests__/permissions.test.ts (5 tests) 9ms
 ✓ src/lib/__tests__/fecho-preconditions.test.ts (4 tests) 14ms
 ✓ src/lib/__tests__/ticket-revenue-single-rule.test.ts (6 tests) 5ms
 ✓ src/test/ticket-office-settlement-eligible.test.ts (5 tests) 5ms
 ✓ src/lib/__tests__/zone-capacities.test.ts (2 tests) 6ms
 ✓ src/test/newgang-crews.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/event-nature.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/standalone-capability-proposal.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/payment-settlement.test.ts (8 tests) 8ms
 ✓ src/lib/__tests__/master-adopted-expense-proration.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/pl-category-matching.test.ts (5 tests) 7ms
 ✓ src/lib/__tests__/bp-planilha-version.test.ts (2 tests) 6ms
 ✓ src/lib/crm/creativeReelsCheck.test.ts (5 tests) 7ms
 ✓ src/lib/__tests__/forecast-edit-diff.test.ts (3 tests) 11ms
 ✓ src/lib/__tests__/ticket-office-position.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/dre-nature-divergence.test.ts (2 tests) 9ms
 ✓ src/lib/__tests__/settlement-doc-text.test.ts (5 tests) 6ms
stdout | src/lib/__tests__/card-session-theoretical.test.ts > #275 saldo teórico da sessão = fecho > sem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[#275] teórico = 636.68 esperado = 636.68

 ✓ src/lib/__tests__/card-session-theoretical.test.ts (1 test) 5ms
 ✓ src/lib/__tests__/event-ab-rounding.test.ts (4 tests) 5ms
 ✓ src/lib/__tests__/partner-rebill-vat.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/standalone-invoices.test.ts (4 tests) 4ms
 ✓ src/test/crm-audience-live-count.test.ts (3 tests) 8ms
 ✓ src/test/check-deploy.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/partner-extras-kind.test.ts (3 tests) 6ms
 ✓ src/test/newgang-profile-country.test.ts (2 tests) 6ms
 ✓ src/lib/__tests__/permissions-guards-proof.test.ts (1 test) 5ms
 ✓ src/lib/__tests__/event-cost-basis.test.ts (5 tests) 11ms
 ✓ src/test/memory-index.test.ts (3 tests) 5ms
 ✓ src/test/coala-centro-custo-norm.test.ts (2 tests) 6ms
 ✓ src/lib/__tests__/session-copy.test.ts (3 tests) 6ms
 ✓ src/test/payment-list-revalidate.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/ticket-category.test.ts (4 tests) 5ms
 ✓ src/test/transaction-edit-modal-operation-key.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/accountant-account-filter.test.ts (5 tests) 6ms
 ✓ src/test/contactos-list-paging.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/account-balance-settling.test.ts (2 tests) 6ms
 ✓ src/lib/__tests__/zone-on-sale.test.ts (3 tests) 5ms
 ✓ src/test/example.test.ts (1 test) 4ms
 ↓ src/test/partner-statement-edge.test.ts (1 test | 1 skipped)
 ✓ src/test/format-integer-conversions.test.ts (3 tests) 5ms

 Test Files  168 passed | 1 skipped (169)
      Tests  1358 passed | 1 skipped | 11 todo (1370)
   Start at  21:53:01
   Duration  83.71s (transform 13.35s, setup 134.87s, collect 153.55s, tests 20.91s, environment 663.95s, prepare 120.59s)


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

[bundle] inicial estático: 4539520 bytes
computing gzip size...
dist/manifest.webmanifest                                        0.47 kB
dist/index.html                                                  3.95 kB │ gzip:   1.29 kB
dist/assets/logo-horizontal-mvVEptKs.png                        45.85 kB
dist/bundle-report.json                                        807.25 kB │ gzip:  76.15 kB
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
dist/assets/useDisplayCurrency-BnKSHvol.js                       0.15 kB │ gzip:   0.15 kB
dist/assets/startOfMonth-CKCw-RWI.js                             0.15 kB │ gzip:   0.15 kB
dist/assets/constants-uO0lGu32.js                                0.16 kB │ gzip:   0.15 kB
dist/assets/bp-category-constraint-B8MCXqQh.js                   0.19 kB │ gzip:   0.15 kB
dist/assets/differenceInCalendarMonths-B7vAcVWO.js               0.19 kB │ gzip:   0.17 kB
dist/assets/endOfMonth-Bz2Gx-N-.js                               0.20 kB │ gzip:   0.18 kB
dist/assets/useDebouncedValue-6wBCubDY.js                        0.20 kB │ gzip:   0.17 kB
dist/assets/pdf-text-CRO-dKNy.js                                 0.20 kB │ gzip:   0.17 kB
dist/assets/addDays-CklYSQT6.js                                  0.21 kB │ gzip:   0.19 kB
dist/assets/skeleton-DliSfeh4.js                                 0.21 kB │ gzip:   0.18 kB
dist/assets/country-BQyONak0.js                                  0.23 kB │ gzip:   0.19 kB
dist/assets/slug-Bzks-5QT.js                                     0.23 kB │ gzip:   0.19 kB
dist/assets/rateio-children-CukInAMc.js                          0.24 kB │ gzip:   0.16 kB
dist/assets/differenceInCalendarDays-CZO_y_Bc.js                 0.24 kB │ gzip:   0.20 kB
dist/assets/must-write-D6vQQ_6o.js                               0.28 kB │ gzip:   0.23 kB
dist/assets/eachDayOfInterval-BuSrMpJD.js                        0.30 kB │ gzip:   0.23 kB
dist/assets/backdropClose-CcMOTrMU.js                            0.30 kB │ gzip:   0.21 kB
dist/assets/relativeTime-CufnskKF.js                             0.30 kB │ gzip:   0.22 kB
dist/assets/addMonths-Dsh0EBap.js                                0.35 kB │ gzip:   0.25 kB
dist/assets/overlay-layer-UZsRFqZX.js                            0.37 kB │ gzip:   0.28 kB
dist/assets/separator-C5pnsbui.js                                0.41 kB │ gzip:   0.28 kB
dist/assets/strategy-status-if_xUdsk.js                          0.41 kB │ gzip:   0.24 kB
dist/assets/form-enter-guard-TC9TB5Pp.js                         0.43 kB │ gzip:   0.32 kB
dist/assets/IbanWarning-BOwRvdax.js                              0.43 kB │ gzip:   0.32 kB
dist/assets/traction-C6TeXKI5.js                                 0.45 kB │ gzip:   0.30 kB
dist/assets/string-similarity-B7WDu-Mk.js                        0.45 kB │ gzip:   0.31 kB
dist/assets/creative-media-DKNTK8AD.js                           0.50 kB │ gzip:   0.31 kB
dist/assets/differenceInDays-ChvF9Jc3.js                         0.54 kB │ gzip:   0.32 kB
dist/assets/budget-mode-B5QTFuSW.js                              0.56 kB │ gzip:   0.40 kB
dist/assets/useMyLeadFrenteIds-DqMf-dt8.js                       0.56 kB │ gzip:   0.38 kB
dist/assets/getTimezoneOffsetInMilliseconds-CEhzTjz1.js          0.58 kB │ gzip:   0.34 kB
dist/assets/audience-pdf-RQfvkLkz.js                             0.64 kB │ gzip:   0.41 kB
dist/assets/PriorityBadge-jdO5_B43.js                            0.67 kB │ gzip:   0.43 kB
dist/assets/avatar-DbFxMJ13.js                                   0.68 kB │ gzip:   0.33 kB
dist/assets/StaffList-CM229KDi.js                                0.69 kB │ gzip:   0.43 kB
dist/assets/IvaRateSelect-CrbVBWPD.js                            0.75 kB │ gzip:   0.49 kB
dist/assets/event-nature-BSQ-ezBD.js                             0.78 kB │ gzip:   0.45 kB
dist/assets/useRealtimeInvalidation-DeowAbiH.js                  0.78 kB │ gzip:   0.51 kB
dist/assets/useOperacaoFilters-BQ7Ejlxz.js                       0.81 kB │ gzip:   0.49 kB
dist/assets/admin-window-y7fSdr6Q.js                             0.85 kB │ gzip:   0.49 kB
dist/assets/scroll-area-tRz3lP_M.js                              0.85 kB │ gzip:   0.44 kB
dist/assets/FeatureNotEnabledCard-BlvxPo_2.js                    0.87 kB │ gzip:   0.50 kB
dist/assets/money-input-Ct8RzR-X.js                              0.89 kB │ gzip:   0.52 kB
dist/assets/ReportArtistCachePage-gtviE1yT.js                    0.90 kB │ gzip:   0.51 kB
dist/assets/card-account-balance-Ct0CgITv.js                     0.92 kB │ gzip:   0.53 kB
dist/assets/account-balance-rpc-ByIHxS8e.js                      0.93 kB │ gzip:   0.49 kB
dist/assets/circuit-account-CfaPptrF.js                          0.94 kB │ gzip:   0.58 kB
dist/assets/alert-Du5KP_th.js                                    0.95 kB │ gzip:   0.49 kB
dist/assets/supplier-credits-C34pR4pJ.js                         0.98 kB │ gzip:   0.56 kB
dist/assets/EventNatureFilter-B6u9cvgN.js                        1.00 kB │ gzip:   0.59 kB
dist/assets/accordion-DUJloAwx.js                                1.02 kB │ gzip:   0.52 kB
dist/assets/app-badge-EpFH5g2s.js                                1.04 kB │ gzip:   0.51 kB
dist/assets/PhaseBadge-S9LM2MKC.js                               1.05 kB │ gzip:   0.56 kB
dist/assets/bank-link-date-DcRav5qG.js                           1.05 kB │ gzip:   0.53 kB
dist/assets/ReportAccountingExportPage-BFhL9Uf8.js               1.17 kB │ gzip:   0.63 kB
dist/assets/ReportDocumentPendenciesPage-CgG1OodW.js             1.18 kB │ gzip:   0.63 kB
dist/assets/zone-capacities-BjN-Yswn.js                          1.22 kB │ gzip:   0.55 kB
dist/assets/OperacaoStatusBadge-EG_lkXtz.js                      1.22 kB │ gzip:   0.52 kB
dist/assets/_LegalLayout-B2TwH1v3.js                             1.23 kB │ gzip:   0.52 kB
dist/assets/card-session-helpers-kwzvnJEf.js                     1.31 kB │ gzip:   0.65 kB
dist/assets/FrenteLeadsAvatars-DuJQt5kr.js                       1.34 kB │ gzip:   0.72 kB
dist/assets/account-balance-B5ynwhF7.js                          1.36 kB │ gzip:   0.69 kB
dist/assets/MirrorAporteNotice-NCRvR-na.js                       1.40 kB │ gzip:   0.77 kB
dist/assets/currency-DvXZV_Ot.js                                 1.43 kB │ gzip:   0.74 kB
dist/assets/accountant-reviews-3cZUd8TZ.js                       1.46 kB │ gzip:   0.60 kB
dist/assets/toggle-group-DGpJmHLd.js                             1.49 kB │ gzip:   0.67 kB
dist/assets/supplier-bank-BASHhkWX.js                            1.51 kB │ gzip:   0.69 kB
dist/assets/bp-line-relink-BoR7X5iI.js                           1.52 kB │ gzip:   0.58 kB
dist/assets/capital-branch-BAlJ6hwb.js                           1.67 kB │ gzip:   0.78 kB
dist/assets/EtapaAssigneeAvatars-DAgH0_gO.js                     1.68 kB │ gzip:   0.79 kB
dist/assets/ebitda-BXmx5F0i.js                                   1.74 kB │ gzip:   0.75 kB
dist/assets/camarim-helpers-M1Vn5iD-.js                          1.76 kB │ gzip:   0.78 kB
dist/assets/AdAccounts-CRLkSRrr.js                               1.78 kB │ gzip:   0.78 kB
dist/assets/iban-BYOybSCJ.js                                     1.79 kB │ gzip:   0.95 kB
dist/assets/invoice-ocr-prepare-CcJft9v3.js                      1.85 kB │ gzip:   1.02 kB
dist/assets/bp-line-required-CO5W9dvI.js                         1.88 kB │ gzip:   0.76 kB
dist/assets/NewStaffDialog-C54WQQ23.js                           1.89 kB │ gzip:   0.99 kB
dist/assets/AcceptInvite-B3sN92Xv.js                             1.97 kB │ gzip:   0.99 kB
dist/assets/dashboard-format-GnqOyAs1.js                         2.00 kB │ gzip:   0.92 kB
dist/assets/settlement-participants-CdPu0hLm.js                  2.01 kB │ gzip:   0.79 kB
dist/assets/useEventIvaRates-RL2qJXfZ.js                         2.01 kB │ gzip:   1.02 kB
dist/assets/StatCard-DjfzbgRF.js                                 2.05 kB │ gzip:   0.84 kB
dist/assets/ReportCostSourceToggle-CCZ0b1pi.js                   2.09 kB │ gzip:   0.93 kB
dist/assets/event-ab-calc-BxWHlvfV.js                            2.10 kB │ gzip:   0.74 kB
dist/assets/AudienceNew-DN6tS8Mm.js                              2.12 kB │ gzip:   1.05 kB
dist/assets/date-picker-BgiitF2X.js                              2.24 kB │ gzip:   1.10 kB
dist/assets/ticket-office-reconciliation-Db_Ydp-c.js             2.25 kB │ gzip:   1.05 kB
dist/assets/useUserPreferences-DZaUx8js.js                       2.30 kB │ gzip:   0.70 kB
dist/assets/formatDistanceToNow-CgGNwkFO.js                      2.32 kB │ gzip:   0.98 kB
dist/assets/partner-extras-R6mT2Txz.js                           2.32 kB │ gzip:   0.97 kB
dist/assets/bp-tx-matching-BHd1Ixbn.js                           2.38 kB │ gzip:   0.97 kB
dist/assets/useScenarioForecasts-CsMF4L3D.js                     2.48 kB │ gzip:   1.22 kB
dist/assets/ImageUploader-iZJpOQFh.js                            2.51 kB │ gzip:   1.28 kB
dist/assets/SupplierBankDetails-CZKqARGy.js                      2.56 kB │ gzip:   0.94 kB
dist/assets/parseISO-Cr0H38in.js                                 2.70 kB │ gzip:   1.19 kB
dist/assets/UserSettings-sMX6ugoL.js                             2.99 kB │ gzip:   1.45 kB
dist/assets/MeusChamados-i_50iP3P.js                             3.02 kB │ gzip:   1.36 kB
dist/assets/DiagnosisTest-hWwb-yS_.js                            3.18 kB │ gzip:   1.29 kB
dist/assets/real-cache-calc-39J2LSHE.js                          3.25 kB │ gzip:   1.47 kB
dist/assets/ChamadoNovo-BLDoINDN.js                              3.56 kB │ gzip:   1.56 kB
dist/assets/IbanDuplicates-DdTxTXgj.js                           3.67 kB │ gzip:   1.72 kB
dist/assets/OperacaoHome-yjskM56u.js                             3.74 kB │ gzip:   1.64 kB
dist/assets/SimilarSuppliersReview-T3ng6-AT.js                   3.75 kB │ gzip:   1.66 kB
dist/assets/ReportSalesCurvePage-DPKb_zE7.js                     3.91 kB │ gzip:   1.79 kB
dist/assets/SimilarSuppliersNotice-DD2m0zQx.js                   3.98 kB │ gzip:   1.66 kB
dist/assets/FrentesPanel-BSpG-bCj.js                             3.99 kB │ gzip:   1.76 kB
dist/assets/ReportSalesComparisonPage-BgmU7dVg.js                4.00 kB │ gzip:   1.85 kB
dist/assets/FundHolderPicker-CogyTPFS.js                         4.07 kB │ gzip:   1.59 kB
dist/assets/ReportAgingPage-IQEw7TOa.js                          4.21 kB │ gzip:   1.78 kB
dist/assets/UploadCoalaFotos-CZo5qlQo.js                         4.22 kB │ gzip:   1.77 kB
dist/assets/ReportMonthlyEvolutionPage-Cl3e9rmw.js               4.24 kB │ gzip:   1.72 kB
dist/assets/OperacaoListShell-BpV8z7W4.js                        4.32 kB │ gzip:   1.92 kB
dist/assets/cache-tab-total-BwiFup5r.js                          4.35 kB │ gzip:   1.67 kB
dist/assets/FieldStaffSection-DGnHftwi.js                        4.38 kB │ gzip:   1.80 kB
dist/assets/csv-export-Bp8nlkXR.js                               4.39 kB │ gzip:   1.57 kB
dist/assets/ReportRevenueMixPage-BVbCfhUo.js                     4.39 kB │ gzip:   1.77 kB
dist/assets/chart-7kA3i7JW.js                                    4.57 kB │ gzip:   1.93 kB
dist/assets/BlogList-DR3Ou2fB.js                                 4.57 kB │ gzip:   1.76 kB
dist/assets/ReportSupplierConcentrationPage-C_CM227o.js          4.61 kB │ gzip:   1.85 kB
dist/assets/AuditDownloads-BOJ2CRYx.js                           4.61 kB │ gzip:   1.83 kB
dist/assets/MinhasTarefas-Bx8kIuu6.js                            4.68 kB │ gzip:   1.91 kB
dist/assets/Atividade-DkS8OGBR.js                                4.70 kB │ gzip:   2.05 kB
dist/assets/Strategies-DSfEKAzh.js                               4.72 kB │ gzip:   1.83 kB
dist/assets/ReportAccountCategoriesPage-CAP_nKIs.js              4.73 kB │ gzip:   1.84 kB
dist/assets/ReportOccupancyRatePage-Ba8mdhn-.js                  4.73 kB │ gzip:   1.92 kB
dist/assets/GoogleAdsAdmin-SW3u_x0v.js                           4.95 kB │ gzip:   1.97 kB
dist/assets/export-ticket-office-settlement-pdf-CFN163qR.js      5.00 kB │ gzip:   2.29 kB
dist/assets/SyncHealth-BNXUJUYx.js                               5.13 kB │ gzip:   1.92 kB
dist/assets/ManualGaps-3d8tXme3.js                               5.19 kB │ gzip:   2.21 kB
dist/assets/ReportBudgetDeviationPage-DYmUW866.js                5.36 kB │ gzip:   2.17 kB
dist/assets/PaginasList--Wuf-mu1.js                              5.38 kB │ gzip:   2.14 kB
dist/assets/Creatives-Cy3MI1gM.js                                5.39 kB │ gzip:   1.99 kB
dist/assets/ReportTreasuryProjectionPage-BptNgQBq.js             5.39 kB │ gzip:   2.16 kB
dist/assets/invoice-group-CxEKBfV5.js                            5.43 kB │ gzip:   1.75 kB
dist/assets/event-format-qvNX3MX5.js                             5.45 kB │ gzip:   2.27 kB
dist/assets/UserActivityLog-TAkqFSne.js                          5.50 kB │ gzip:   2.04 kB
dist/assets/AudiencesList-D5dQnXkf.js                            5.56 kB │ gzip:   2.25 kB
dist/assets/NewEventoPage-Cokl0CQj.js                            5.70 kB │ gzip:   2.18 kB
dist/assets/ReportPendencyIndexPage-KNo-TuWe.js                  5.70 kB │ gzip:   1.68 kB
dist/assets/workbox-window.prod.es5-BqEJf4Xk.js                  5.71 kB │ gzip:   2.34 kB
dist/assets/pt-BR-Dh5EWHbw.js                                    5.85 kB │ gzip:   2.10 kB
dist/assets/LinkBpLineDialog-BRmwTMi6.js                         5.85 kB │ gzip:   2.26 kB
dist/assets/BankLineDocumentsDialog-BQ-C5aPK.js                  5.95 kB │ gzip:   2.41 kB
dist/assets/pt-B3dxR9FF.js                                       5.97 kB │ gzip:   2.02 kB
dist/assets/EndossarEventoPage-BXBN4y3e.js                       6.15 kB │ gzip:   2.48 kB
dist/assets/RlsLegacyAudit-Bi6WYwN-.js                           6.21 kB │ gzip:   2.21 kB
dist/assets/EndorsementEditor-ClT2NJjo.js                        6.33 kB │ gzip:   2.32 kB
dist/assets/ReportSuppliersPage-DmvpzV_3.js                      6.45 kB │ gzip:   2.19 kB
dist/assets/ChamadoDetail-tsA06-k6.js                            6.47 kB │ gzip:   2.48 kB
dist/assets/Onboarding-1SYzlzk5.js                               6.60 kB │ gzip:   2.44 kB
dist/assets/ReportProfitabilityPage-CYRgEHxe.js                  6.61 kB │ gzip:   2.54 kB
dist/assets/AudienceEditor-CMbMTvhn.js                           6.66 kB │ gzip:   2.37 kB
dist/assets/CardItemDocumentsField-BsmpGtGK.js                   6.74 kB │ gzip:   2.64 kB
dist/assets/ContactDetailsSheet-BUNUJHSG.js                      6.75 kB │ gzip:   2.19 kB
dist/assets/Notifications-BaX2bSt-.js                            6.76 kB │ gzip:   1.93 kB
dist/assets/Reminders-CosmRZ2z.js                                6.79 kB │ gzip:   2.45 kB
dist/assets/ClubeNewgang-CjbSwv7N.js                             6.80 kB │ gzip:   2.56 kB
dist/assets/parse-ticketline-zone-xlsx-Dyx3vJLS.js               6.86 kB │ gzip:   2.59 kB
dist/assets/Terms-S0sc3BYX.js                                    6.95 kB │ gzip:   2.30 kB
dist/assets/About-CVtGjUkA.js                                    7.00 kB │ gzip:   2.19 kB
dist/assets/CrmDashboard-DiCjEcxm.js                             7.01 kB │ gzip:   2.60 kB
dist/assets/EditCampaignPopover-BKW3Vl1w.js                      7.06 kB │ gzip:   2.80 kB
dist/assets/en-US-CpWK9ySR.js                                    7.19 kB │ gzip:   2.47 kB
dist/assets/Trash-DbpaKRYD.js                                    7.19 kB │ gzip:   2.63 kB
dist/assets/CategoryFormModal-BrEiKmmn.js                        7.28 kB │ gzip:   2.78 kB
dist/assets/InvoiceGroupAudit-CBW2XXrf.js                        7.33 kB │ gzip:   2.69 kB
dist/assets/PaginaEditor-1KN6nz7D.js                             7.48 kB │ gzip:   2.72 kB
dist/assets/useBPVersions-TOS53oLN.js                            7.53 kB │ gzip:   1.77 kB
dist/assets/ReportPartnerExpensesPage-DzOyiwH2.js                7.68 kB │ gzip:   2.69 kB
dist/assets/AdminPanel-BnNNaRsg.js                               7.80 kB │ gzip:   3.24 kB
dist/assets/AccountantPendencies-DkwO1ugP.js                     7.94 kB │ gzip:   2.88 kB
dist/assets/InvariantMonitor-CAnkmTdU.js                         8.36 kB │ gzip:   2.76 kB
dist/assets/EditFrenteSheet-ClZz5sll.js                          8.46 kB │ gzip:   2.97 kB
dist/assets/AudiencePreviewCount-aFCnkXxD.js                     8.55 kB │ gzip:   3.26 kB
dist/assets/RaiseBudgetDialog--6X_kbW0.js                        8.57 kB │ gzip:   2.99 kB
dist/assets/StrategyNew-BUVhKP3A.js                              8.81 kB │ gzip:   3.46 kB
dist/assets/PurchaseAudienceCard-BP4LEtFa.js                     8.84 kB │ gzip:   2.82 kB
dist/assets/StrategyPrint-DqSeYKbl.js                            8.95 kB │ gzip:   2.83 kB
dist/assets/ChamadosList-DwGrSePi.js                             9.18 kB │ gzip:   3.60 kB
dist/assets/PessoaDetail-D_BPMW0i.js                             9.22 kB │ gzip:   2.99 kB
dist/assets/BlogEditor-D_CjEliM.js                               9.25 kB │ gzip:   3.22 kB
dist/assets/SalesBI-BWDu_agH.js                                  9.26 kB │ gzip:   3.46 kB
dist/assets/EventImplementations-DxiWHNu8.js                     9.29 kB │ gzip:   3.25 kB
dist/assets/EventosList-BneADHLF.js                              9.29 kB │ gzip:   3.05 kB
dist/assets/PortalSettings-CO-Lh6zk.js                           9.36 kB │ gzip:   3.43 kB
dist/assets/VideosList-CGMOIhI1.js                               9.37 kB │ gzip:   3.45 kB
dist/assets/AccountCategories-Nli0qmH2.js                        9.38 kB │ gzip:   3.15 kB
dist/assets/CustomerMatchUpload-BsUm0iBZ.js                      9.38 kB │ gzip:   3.35 kB
dist/assets/import-pl-xlsx-BqgWwH8J.js                           9.39 kB │ gzip:   4.03 kB
dist/assets/Quotations-0pUlCLbo.js                               9.50 kB │ gzip:   3.16 kB
dist/assets/SupplierTransactions-DTtWeCmy.js                     9.96 kB │ gzip:   3.14 kB
dist/assets/ReportDocumentPendencies-DyhzPFH-.js                10.03 kB │ gzip:   3.10 kB
dist/assets/PressList-sULlCOBg.js                               10.07 kB │ gzip:   3.66 kB
dist/assets/useEventABScenarios-BZQTcsck.js                     10.09 kB │ gzip:   3.72 kB
dist/assets/Setup-DOsFHZO6.js                                   10.12 kB │ gzip:   3.62 kB
dist/assets/useCitySimulator-CYIWYsdW.js                        10.99 kB │ gzip:   3.60 kB
dist/assets/MetaCapiMonitor-xNTD6klq.js                         11.34 kB │ gzip:   3.27 kB
dist/assets/FrenteDetail-BU1TmP_Y.js                            11.38 kB │ gzip:   3.83 kB
dist/assets/ReportCashFlowPage-iho_KbN9.js                      11.59 kB │ gzip:   3.74 kB
dist/assets/ReportPartnerSettlementPage-BqPa6iKf.js             11.71 kB │ gzip:   3.40 kB
dist/assets/StrategyNewDesign-sWDOWf6H.js                       12.00 kB │ gzip:   4.28 kB
dist/assets/Privacy-INyhK2tu.js                                 12.10 kB │ gzip:   3.75 kB
dist/assets/StrategyPlanCard-C6noucZS.js                        12.20 kB │ gzip:   3.43 kB
dist/assets/CamarimEquipa-CuD2GNZ0.js                           12.29 kB │ gzip:   4.29 kB
dist/assets/EtapaSuppliersPanel-cNo1ZMTO.js                     12.40 kB │ gzip:   3.39 kB
dist/assets/ReportIvaAuditPage-C-NgQpZw.js                      12.53 kB │ gzip:   4.04 kB
dist/assets/DuelView-CLq_RC9i.js                                12.61 kB │ gzip:   4.23 kB
dist/assets/LeadsList-BY6D93VF.js                               12.85 kB │ gzip:   4.06 kB
dist/assets/format-CGtoj5si.js                                  13.04 kB │ gzip:   3.48 kB
dist/assets/EventTrackersCard-DK0rTqsY.js                       13.15 kB │ gzip:   3.66 kB
dist/assets/ReportDREEmpresarialPage-D0fOBaC4.js                13.19 kB │ gzip:   4.60 kB
dist/assets/ContactosList-ChYkSzsi.js                           13.25 kB │ gzip:   4.93 kB
dist/assets/CampaignFromScratch-C15RfUi4.js                     13.43 kB │ gzip:   4.41 kB
dist/assets/ReportAccountingExport-DjAqp19Y.js                  13.55 kB │ gzip:   4.24 kB
dist/assets/CreativeNew-BnrWhoDO.js                             13.62 kB │ gzip:   4.78 kB
dist/assets/FormalidadeAudit-BV1fy7B3.js                        13.78 kB │ gzip:   4.56 kB
dist/assets/CampoView-Cwt2iGJ8.js                               13.80 kB │ gzip:   4.61 kB
dist/assets/RecurringTransactions-IOwWLsjo.js                   13.87 kB │ gzip:   4.20 kB
dist/assets/ReportDailySalesPage-ByqK1gNW.js                    13.89 kB │ gzip:   4.65 kB
dist/assets/BolSync-CLo8BhI_.js                                 14.16 kB │ gzip:   4.22 kB
dist/assets/Pixels-B3bREyrs.js                                  14.28 kB │ gzip:   3.56 kB
dist/assets/CardSessions-DKDwflY2.js                            14.80 kB │ gzip:   4.64 kB
dist/assets/ReconciliacaoBpTx-BUQanU5F.js                       14.91 kB │ gzip:   4.51 kB
dist/assets/Insights-BPJNpnxG.js                                15.19 kB │ gzip:   3.79 kB
dist/assets/TicketlineSync-CP93RUHX.js                          15.37 kB │ gzip:   4.72 kB
dist/assets/Companies-C-lNgR__.js                               15.57 kB │ gzip:   4.67 kB
dist/assets/DataEntryDialog-CGbtEp28.js                         16.27 kB │ gzip:   5.59 kB
dist/assets/MetaAudiencesList-NOAN4bOI.js                       16.30 kB │ gzip:   5.24 kB
dist/assets/IvaManagement-C-wJJIuw.js                           17.28 kB │ gzip:   4.35 kB
dist/assets/Connections-DWN62nDe.js                             17.29 kB │ gzip:   5.58 kB
dist/assets/UserManagement-DBvily4X.js                          17.66 kB │ gzip:   5.40 kB
dist/assets/EtapasList-CWNNov_o.js                              18.11 kB │ gzip:   6.34 kB
dist/assets/ibantools--sXKtUqI.js                               18.29 kB │ gzip:   3.82 kB
dist/assets/ReportForecastPayablesPage-BLl_Zvkh.js              18.71 kB │ gzip:   4.82 kB
dist/assets/CartaoEquipa-CWLqkxxQ.js                            18.88 kB │ gzip:   6.60 kB
dist/assets/FrenteManage-BCIAdhTq.js                            19.16 kB │ gzip:   5.66 kB
dist/assets/ReportContasPagarPage-hcT7Zyn7.js                   19.71 kB │ gzip:   5.79 kB
dist/assets/Dashboard-BH7dZACE.js                               19.93 kB │ gzip:   6.51 kB
dist/assets/EventSimulatorDemo-BFTlbU8Q.js                      20.64 kB │ gzip:   4.84 kB
dist/assets/FunnelTest-ChALMp5y.js                              21.00 kB │ gzip:   6.57 kB
dist/assets/FeverSync-Bj13aHDp.js                               21.17 kB │ gzip:   6.95 kB
dist/assets/Camarim-DOZFCM4o.js                                 21.22 kB │ gzip:   5.94 kB
dist/assets/Audit-D_GL5J5C.js                                   21.40 kB │ gzip:   5.61 kB
dist/assets/BatchPaymentModal-Cm1NahTF.js                       21.60 kB │ gzip:   7.69 kB
dist/assets/ReportArtistCache-BP9a9TlC.js                       21.99 kB │ gzip:   7.84 kB
dist/assets/ReportDREBrasilPage-C0SszbIr.js                     22.18 kB │ gzip:   6.45 kB
dist/assets/TicketOfficeSettlementsOverview-5Ie9r4Jd.js         22.24 kB │ gzip:   5.74 kB
dist/assets/SalesBIDetail-C8PblMju.js                           22.25 kB │ gzip:   7.48 kB
dist/assets/EquipaView-jTrlwx_8.js                              22.27 kB │ gzip:   6.70 kB
dist/assets/parse-B9BIfq30.js                                   22.36 kB │ gzip:   4.64 kB
dist/assets/TransactionDocumentsModal-Bra-_DDL.js               22.41 kB │ gzip:   7.17 kB
dist/assets/SecurityDashboard-GjZRWW3x.js                       22.75 kB │ gzip:   5.52 kB
dist/assets/CreativeView-DHv6aSmu.js                            23.03 kB │ gzip:   6.41 kB
dist/assets/ReportMovementReconciliationPage-B5tCX6DB.js        23.58 kB │ gzip:   6.82 kB
dist/assets/StrategyRedesign-DCUWvR-T.js                        25.07 kB │ gzip:   6.48 kB
dist/assets/EtapaDetail-DpA4Nkyr.js                             25.52 kB │ gzip:   7.59 kB
dist/assets/purify.es-8E279hYE.js                               25.61 kB │ gzip:   9.67 kB
dist/assets/ReportBPTransactionsPage-D5bsEEKu.js                26.47 kB │ gzip:   7.76 kB
dist/assets/ZonasList-IhCtFvvF.js                               26.50 kB │ gzip:   8.46 kB
dist/assets/DatabaseBackups-DsyRtPDN.js                         26.54 kB │ gzip:   7.17 kB
dist/assets/ReportDREPage-sHfPEPg4.js                           26.79 kB │ gzip:   7.56 kB
dist/assets/AudienceGoogleAds-CfN-r2QT.js                       27.91 kB │ gzip:   8.38 kB
dist/assets/ReportBankStatementPage-CImdZNXR.js                 29.05 kB │ gzip:   8.84 kB
dist/assets/BPPlanilha-CJrFLYT8.js                              29.23 kB │ gzip:  11.13 kB
dist/assets/AccountantStandaloneInvoicesTab-BOY-F_M6.js         30.02 kB │ gzip:   9.85 kB
dist/assets/event-revenue-basis-BSU-eN1V.js                     30.57 kB │ gzip:  10.48 kB
dist/assets/StandaloneInvoiceScanner-Hj6uPyqj.js                30.74 kB │ gzip:  10.87 kB
dist/assets/RegistroFeed-DdNjnHSF.js                            30.74 kB │ gzip:   8.62 kB
dist/assets/ReportPLPage-aUzPTWBm.js                            31.27 kB │ gzip:   9.04 kB
dist/assets/AdsInvoices-DYk-t10j.js                             31.40 kB │ gzip:   9.47 kB
dist/assets/HelpCenter-D6nYKvle.js                              31.66 kB │ gzip:  11.53 kB
dist/assets/Reimbursements-BpQTK7gv.js                          32.30 kB │ gzip:   9.41 kB
dist/assets/AudiencePrint-C2OaAucg.js                           34.53 kB │ gzip:   8.18 kB
dist/assets/calendar-xDp0_5Vf.js                                34.63 kB │ gzip:  10.98 kB
dist/assets/SalesBIEvent-Da-N6HU_.js                            36.52 kB │ gzip:  10.20 kB
dist/assets/ReportTicketOfficeAuditPage-BI_pUQq7.js             37.13 kB │ gzip:   9.71 kB
dist/assets/AccountantHome-DLMY91U7.js                          37.30 kB │ gzip:  10.20 kB
dist/assets/EventCalendar-DWAxuLSE.js                           38.26 kB │ gzip:   9.58 kB
dist/assets/TicketOfficeSettlementModal-BEud3Kbj.js             39.12 kB │ gzip:  11.28 kB
dist/assets/Events-BF0okeyh.js                                  39.24 kB │ gzip:  10.17 kB
dist/assets/Suppliers-BH1Ur7oo.js                               39.57 kB │ gzip:   9.86 kB
dist/assets/CoalaSync-BNX5NXc8.js                               41.47 kB │ gzip:  12.21 kB
dist/assets/EventHub-DvyHFH1s.js                                41.59 kB │ gzip:  11.10 kB
dist/assets/marked.esm-DiRRsLPS.js                              42.33 kB │ gzip:  12.79 kB
dist/assets/CamarimItemAttachmentButton-Cuw-NV3G.js             42.81 kB │ gzip:  14.19 kB
dist/assets/installment-guard-BmzhN5dE.js                       42.88 kB │ gzip:  12.58 kB
dist/assets/sortable.esm-C2wju2-N.js                            45.88 kB │ gzip:  15.28 kB
dist/assets/AuditoriaContas-E3fq-uw1.js                         49.48 kB │ gzip:  13.84 kB
dist/assets/EventMarketingEditor-D89qcxMD.js                    55.62 kB │ gzip:  14.13 kB
dist/assets/FinancialAccounts-DfYeKaVL.js                       57.56 kB │ gzip:  14.17 kB
dist/assets/StrategyView-BgWDNAcL.js                            61.24 kB │ gzip:  14.94 kB
dist/assets/ManualSync-D3SWc9sB.js                              66.06 kB │ gzip:  21.78 kB
dist/assets/CamarimSessionDetail-CfiFxmec.js                    68.25 kB │ gzip:  18.87 kB
dist/assets/SupplierFormModal-6J1YntJR.js                       72.39 kB │ gzip:  17.87 kB
dist/assets/NewgangSite-BUyXAGfa.js                             77.05 kB │ gzip:  21.38 kB
dist/assets/BankReconciliation-BzPu_RZ1.js                      81.01 kB │ gzip:  23.08 kB
dist/assets/CardSessionDetail-DYNXp_mJ.js                       86.83 kB │ gzip:  22.99 kB
dist/assets/jszip.min-DjaQLip6.js                               97.24 kB │ gzip:  30.05 kB
dist/assets/EventImplementationDetail-BPg8yb-7.js              110.42 kB │ gzip:  29.32 kB
dist/assets/ReportPaymentListsPage-DQXxnt-F.js                 125.00 kB │ gzip:  33.79 kB
dist/assets/Campaigns-Bzt9PF4O.js                              127.24 kB │ gzip:  34.28 kB
dist/assets/ticket-office-settlement-form-D1PmuBvS.js          129.28 kB │ gzip:  35.67 kB
dist/assets/EventSimulator-BXnlmOm0.js                         145.00 kB │ gzip:  37.46 kB
dist/assets/Transactions-Bq_8lNuA.js                           148.40 kB │ gzip:  38.76 kB
dist/assets/index.es-C-gnJdc0.js                               150.74 kB │ gzip:  51.38 kB
dist/assets/TicketOffices-D8kJetfo.js                          167.82 kB │ gzip:  43.20 kB
dist/assets/TransactionEditModal-DNIDEF9B.js                   198.63 kB │ gzip:  48.63 kB
dist/assets/html2canvas.esm-CBrSDip1.js                        201.42 kB │ gzip:  47.70 kB
dist/assets/vendor-supabase-C83P-B5T.js                        209.56 kB │ gzip:  54.23 kB
dist/assets/CampaignView-DjFbzKER.js                           222.38 kB │ gzip:  57.72 kB
dist/assets/vendor-react-DYLj_lXh.js                           227.69 kB │ gzip:  71.86 kB
dist/assets/EventForecast-BAXIG0IB.js                          409.57 kB │ gzip: 105.77 kB
dist/assets/vendor-pdf-DR7krn7Q.js                             421.80 kB │ gzip: 137.18 kB
dist/assets/vendor-charts-BdNZb--m.js                          434.16 kB │ gzip: 114.66 kB
dist/assets/pdf-first-page-to-jpeg-M5CLsCvW.js                 458.53 kB │ gzip: 135.85 kB
dist/assets/EventDetail-CeAstdik.js                            592.74 kB │ gzip: 150.88 kB
dist/assets/index-19Plrvre.js                                  823.93 kB │ gzip: 234.86 kB
dist/assets/vendor-ui-BwmvK_hi.js                            1,067.56 kB │ gzip: 220.12 kB
dist/assets/heic2any-DZzk1OQ_.js                             1,352.85 kB │ gzip: 341.38 kB
dist/assets/vendor-xlsx-BK2YhLPP.js                          1,369.76 kB │ gzip: 412.26 kB
dist/assets/vendor-handsontable-Dd3DQzR3.js                  1,906.58 kB │ gzip: 453.88 kB
dist/assets/heic-to-lXPrQE7P.js                              2,995.46 kB │ gzip: 736.99 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 44.85s

PWA v1.3.0
mode      generateSW
precache  344 entries (18875.01 KiB)
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
