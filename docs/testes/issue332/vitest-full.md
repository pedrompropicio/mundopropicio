# Vitest completo

```text

 RUN  v3.2.7 /dev-server

 ✓ src/test/edge-fn-guard.test.ts (4 tests) 141ms
 ✓ src/lib/__tests__/no-direct-transaction-document-remove.test.ts (3 tests) 297ms
 ✓ src/lib/__tests__/postgrest-embeds.test.ts (2 tests) 429ms
   ✓ embeds do PostgREST em pares com FK duplicada > [Issue #288] nenhum embed ambíguo sem a FK nomeada  426ms
 ✓ src/lib/__tests__/storage-multi-tenant.test.ts (14 tests) 144ms
stderr | src/pages/__tests__/ResetPassword.test.tsx > ResetPassword — token_hash flow > (a) não chama verifyOtp ao montar; só ao clicar Continuar
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/pages/__tests__/ResetPassword.test.tsx (3 tests) 215ms
 ✓ src/test/forecast-attachment-counts.test.tsx (1 test) 371ms
   ✓ anexos do BP — uma leitura por evento (#269) > 361 linhas → 1 pedido a event_forecast_attachments  369ms
 ✓ src/lib/__tests__/document-detect.test.ts (5 tests) 1016ms
 ✓ src/test/campaign-design-optional-roas.test.ts (15 tests) 162ms
 ✓ src/test/mobile-modal-dismiss.test.tsx (6 tests) 236ms
 ✓ src/lib/__tests__/postgrest-row-limit.test.ts (2 tests) 377ms
   ✓ barreira dos 1.000 registos do PostgREST > [Issue #289] nenhuma leitura de tabela grande sem paginação  374ms
 ✓ src/test/ticket-office-statement-documents.test.tsx (6 tests) 156ms
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
    at QueryClientProvider (file:///dev-server/node_modules/.deno/@tanstack+react-query@5.104.3/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:41:32)
    at Router (/dev-server/node_modules/.deno/react-router@6.30.6/node_modules/react-router/dist/umd/react-router.development.js:1203:17)
    at MemoryRouter (/dev-server/node_modules/.deno/react-router@6.30.6/node_modules/react-router/dist/umd/react-router.development.js:1097:7)
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/components/__tests__/EventABTab.test.tsx (4 tests) 328ms
 ✓ src/test/club-config-integration.test.tsx (7 tests) 727ms
   ✓ #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa  338ms
 ✓ src/lib/__tests__/overlay-layer.test.tsx (6 tests) 305ms
 ✓ src/test/event-financial-card-render-loop.test.tsx (1 test) 1075ms
   ✓ EventFinancialCard — sem ciclo de redesenho (#269) > chama onEbitdaParcelsChange uma única vez com queries vazias  1073ms
 ✓ src/test/newgang-wallet-google.test.ts (12 tests) 132ms
 ✓ src/test/coala-meta-audience-handler.test.ts (3 tests) 140ms
stderr | src/lib/__tests__/permissions-guards-f2b.test.tsx > #311 F2b — guardas por permissão > manager com excepção module.crm entra em /crm e vê o cartão CRM activo
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/permissions-guards-f2b.test.tsx (5 tests) 86ms
stderr | src/test/require-feature.test.tsx > visibilidade por company_features > rota bloqueada sem a chave
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/require-feature.test.tsx (4 tests) 115ms
 ✓ src/lib/__tests__/cache-percentage.test.tsx (4 tests) 75ms
 ✓ src/components/__tests__/LinkBpLineDialog-layer.test.tsx (1 test) 168ms
 ✓ src/test/similar-suppliers-notice.test.tsx (4 tests) 57ms
 ✓ src/test/ticket-office-settlement-view.test.tsx (3 tests) 54ms
 ✓ src/components/__tests__/EventStatusBadge.test.tsx (5 tests) 46ms
 ✓ src/lib/__tests__/postgrest-large-tables-mirror.test.ts (1 test) 53ms
 ✓ src/test/newgang-content.test.tsx (2 tests) 70ms
 ✓ src/test/approve-lock-and-core.test.ts (6 tests) 47ms
stderr | src/test/consent-contract-322.test.ts > portal-track handler > consent: timeout da RPC → 503 bloqueado
[portal-track] consent rpc threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > bind falha (throw): lead entra sem ids Meta
[portal-track] consent bind threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > insert falha → 500 (sem falso sucesso)
[portal-track] insert lead_capture [33m500[39m

 ✓ src/test/consent-contract-322.test.ts (38 tests) 39ms
 ✓ src/test/ticket-office-settlement-card-date.test.tsx (1 test) 63ms
 ✓ src/lib/__tests__/tickets-v2-properties.test.ts (19 tests) 71ms
stderr | src/lib/__tests__/cache-scope.test.tsx > ecrã do subevento usa a configuração do Master > mostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/cache-scope.test.tsx (4 tests) 128ms
 ✓ src/components/__tests__/StatCard.test.tsx (4 tests) 36ms
 ✓ src/test/event-financials-invalidation.test.tsx (8 tests) 37ms
 ✓ src/test/ticket-office-settlement-pdf.test.ts (1 test) 44ms
 ✓ src/lib/__tests__/cache-report.test.ts (13 tests) 28ms
 ✓ src/lib/__tests__/google-click-match.test.ts (17 tests) 27ms
 ✓ src/lib/__tests__/partner-statement-doc.test.ts (29 tests) 48ms
 ✓ src/test/camarim-session-pdf-sanitize.test.ts (1 test) 34ms
 ✓ src/test/newgang-welcome-once.test.ts (7 tests) 25ms
 ✓ src/lib/__tests__/combo-capacity.test.ts (9 tests) 17ms
 ✓ src/lib/__tests__/event-settlement-engine.test.ts (27 tests) 15ms
 ✓ src/test/song-link-ssr.test.ts (24 tests) 23ms
stderr | src/components/TicketOfficePositionCards.test.tsx > TicketOfficePositionCards — observação condicional > omite observação abaixo de um cêntimo: 0
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/.deno/react-router@6.30.6/node_modules/react-router/dist/umd/react-router.development.js:1097:7)

stderr | src/components/TicketOfficePositionCards.test.tsx > TicketOfficePositionCards — observação condicional > omite observação abaixo de um cêntimo: 0.009
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/.deno/react-router@6.30.6/node_modules/react-router/dist/umd/react-router.development.js:1097:7)

stderr | src/components/TicketOfficePositionCards.test.tsx > TicketOfficePositionCards — observação condicional > omite observação abaixo de um cêntimo: -0.009
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/.deno/react-router@6.30.6/node_modules/react-router/dist/umd/react-router.development.js:1097:7)

stderr | src/components/TicketOfficePositionCards.test.tsx > TicketOfficePositionCards — observação condicional > preserva observação a partir de um cêntimo: 0.01
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/.deno/react-router@6.30.6/node_modules/react-router/dist/umd/react-router.development.js:1097:7)

stderr | src/components/TicketOfficePositionCards.test.tsx > TicketOfficePositionCards — observação condicional > preserva observação a partir de um cêntimo: -0.01
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/.deno/react-router@6.30.6/node_modules/react-router/dist/umd/react-router.development.js:1097:7)

stderr | src/components/TicketOfficePositionCards.test.tsx > TicketOfficePositionCards — observação condicional > preserva observação a partir de um cêntimo: 265
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/.deno/react-router@6.30.6/node_modules/react-router/dist/umd/react-router.development.js:1097:7)

stderr | src/components/TicketOfficePositionCards.test.tsx > TicketOfficePositionCards — observação condicional > preserva observação a partir de um cêntimo: -265
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/.deno/react-router@6.30.6/node_modules/react-router/dist/umd/react-router.development.js:1097:7)

 ✓ src/components/TicketOfficePositionCards.test.tsx (7 tests) 29ms
 ✓ src/test/newgang-portal.test.ts (10 tests) 15ms
 ✓ src/lib/__tests__/bp-formula.test.ts (8 tests) 21ms
 ✓ src/lib/__tests__/bp-version-multi-diff.test.ts (10 tests) 16ms
 ✓ src/lib/__tests__/tickets-v2-read-layer.test.ts (28 tests | 7 skipped) 15ms
 ✓ src/lib/__tests__/help-manual-parser.test.ts (10 tests) 18ms
 ✓ src/lib/__tests__/statement-grouping.test.ts (16 tests) 21ms
 ✓ src/lib/__tests__/event-ab-full-suite.test.ts (27 tests) 14ms
 ✓ src/lib/__tests__/event-partner-mirror.test.ts (5 tests) 12ms
 ✓ src/test/transaction-duplicate-check.test.ts (6 tests) 12ms
 ✓ src/test/newgang-edition-photos.test.ts (5 tests) 16ms
 ✓ src/test/coala-meta-audience-sync.test.ts (5 tests) 16ms
 ✓ src/lib/cost-center-map.test.ts (6 tests) 14ms
 ✓ src/lib/__tests__/zone-price-turns.test.ts (3 tests) 11ms
 ✓ src/test/newgang-edition-videos.test.ts (6 tests) 13ms
 ✓ src/test/capi-p1-guard.test.ts (22 tests) 8ms
 ✓ src/lib/__tests__/split-adjustment.test.ts (37 tests) 9ms
 ✓ src/lib/__tests__/multi-day-ticketing.test.ts (25 tests | 4 skipped) 14ms
 ✓ src/lib/__tests__/partner-settlement-internal-report.test.ts (12 tests) 10ms
 ✓ src/test/derp248-tiktok-event-trackers.test.ts (11 tests) 9ms
 ✓ src/lib/__tests__/iva.test.ts (22 tests) 11ms
 ✓ src/lib/__tests__/bp-line-review.test.ts (12 tests) 11ms
 ✓ src/lib/__tests__/bp-tx-matching.test.ts (12 tests) 10ms
 ✓ src/lib/__tests__/event-simulator-calc.test.ts (35 tests) 12ms
 ✓ src/lib/__tests__/permissions-per-company.test.ts (5 tests) 7ms
 ✓ src/lib/__tests__/supplier-credits.test.ts (34 tests) 10ms
 ✓ src/lib/__tests__/validations.test.ts (17 tests) 14ms
 ✓ src/lib/__tests__/partner-disbursement.test.ts (11 tests) 9ms
 ✓ src/lib/__tests__/ebitda.test.ts (8 tests) 7ms
 ✓ src/lib/__tests__/report-event-cost.test.ts (7 tests) 5ms
 ✓ src/lib/__tests__/settlement-seal.test.ts (6 tests) 11ms
 ✓ src/test/newgang-portal-bundle.test.ts (5 tests) 8ms
 ✓ src/lib/sepa/bank-execution.test.ts (7 tests) 7ms
 ✓ src/lib/__tests__/forecast-boost.test.ts (12 tests) 11ms
 ✓ src/lib/__tests__/forecast-undo.test.ts (2 tests) 5ms
 ✓ src/test/bol-m2-parser.test.ts (9 tests) 8ms
 ✓ src/test/newgang-history.test.ts (6 tests) 5ms
 ✓ src/lib/__tests__/utils.test.ts (8 tests) 8ms
 ✓ src/lib/__tests__/tour-cache-sync.test.ts (8 tests) 8ms
 ✓ src/lib/__tests__/camarim-cash-preview.test.ts (5 tests) 6ms
 ✓ src/test/crm-ingest-no-network.test.ts (12 tests) 4ms
 ✓ src/lib/__tests__/camarim-bp-rules.test.ts (6 tests) 7ms
 ✓ src/test/capi-diag-no-secrets.test.ts (6 tests) 6ms
 ✓ src/lib/__tests__/refund-grouping.test.ts (5 tests) 7ms
 ✓ src/lib/__tests__/settlement-participants.test.ts (10 tests) 10ms
 ✓ src/test/newgang-missions.test.ts (5 tests) 10ms
 ✓ src/test/ticketline-import-format-transition.test.ts (2 tests) 6ms
 ✓ src/lib/__tests__/payment-settlement.test.ts (8 tests) 7ms
 ✓ src/lib/__tests__/club-config-source.test.ts (12 tests) 10ms
 ✓ src/test/bol-daily-parser.test.ts (9 tests) 10ms
 ✓ src/lib/__tests__/overhead-proration.test.ts (11 tests) 11ms
 ✓ src/lib/__tests__/combo-gating.test.ts (19 tests) 8ms
 ✓ src/test/newgang-wallet-levels.test.ts (14 tests) 9ms
 ✓ src/lib/__tests__/event-ab-calc.test.ts (12 tests) 9ms
 ✓ src/lib/__tests__/ticket-office-reconciliation.test.ts (7 tests) 7ms
 ✓ src/test/silent-writes.test.ts (6 tests) 6ms
 ✓ src/test/payment-method-domain.test.ts (8 tests) 8ms
 ✓ src/components/__tests__/PasswordStrengthIndicator.test.ts (7 tests) 7ms
 ✓ src/lib/__tests__/fecho-preconditions.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/income-tax-out-of-event-result.test.ts (5 tests) 6ms
 ✓ src/lib/__tests__/ticket-office-settlement-calc.test.ts (22 tests) 9ms
 ✓ src/lib/__tests__/event-simulator-ab-scale.test.ts (8 tests) 6ms
 ✓ src/test/partner-statement-cards.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/zone-price-elasticity.test.ts (7 tests) 6ms
 ✓ src/test/check-deploy.test.ts (3 tests) 4ms
 ✓ src/lib/__tests__/event-nature.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/transitory-transactions.test.ts (7 tests) 7ms
 ✓ src/lib/__tests__/event-revenue-basis.test.ts (12 tests) 9ms
stdout | src/lib/__tests__/card-session-theoretical.test.ts > #275 saldo teórico da sessão = fecho > sem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[#275] teórico = 636.68 esperado = 636.68

 ✓ src/lib/__tests__/card-session-theoretical.test.ts (1 test) 5ms
 ✓ src/lib/__tests__/pl-category-matching.test.ts (5 tests) 4ms
 ✓ src/lib/__tests__/permissions.test.ts (5 tests) 7ms
 ✓ src/lib/__tests__/ads-tour-split.test.ts (4 tests) 4ms
 ✓ src/components/__tests__/bp-installments.test.ts (20 tests) 14ms
 ✓ src/lib/__tests__/real-cache-deductions.test.ts (8 tests) 6ms
 ✓ src/lib/__tests__/ticket-category.test.ts (4 tests) 3ms
 ✓ src/test/memory-index.test.ts (3 tests) 4ms
 ✓ src/lib/__tests__/partner-extras-union-148.test.ts (6 tests) 4ms
 ✓ src/lib/__tests__/settlement-revenue.test.ts (6 tests) 7ms
 ✓ src/test/crm-audience-live-count.test.ts (3 tests) 4ms
 ✓ src/lib/__tests__/creative-media.test.ts (19 tests) 5ms
 ✓ src/lib/__tests__/simulator-prior-curve.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/event-realized.test.ts (6 tests) 4ms
 ✓ src/lib/__tests__/cache-tab-total.test.ts (4 tests) 5ms
 ✓ src/test/newgang-crews.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/event-cost-basis-tour.test.ts (13 tests) 5ms
 ✓ src/lib/__tests__/settlement-doc-text.test.ts (5 tests) 5ms
 ✓ src/lib/__tests__/dre-nature-divergence.test.ts (2 tests) 3ms
 ✓ src/lib/__tests__/account-balance-settling.test.ts (2 tests) 3ms
 ✓ src/test/supplier-similarity.test.ts (11 tests) 8ms
 ✓ src/lib/__tests__/audit.test.ts (4 tests) 4ms
 ✓ src/lib/__tests__/accountant-account-filter.test.ts (5 tests) 3ms
 ✓ src/lib/__tests__/permissions-guards-proof.test.ts (1 test) 4ms
 ✓ src/lib/__tests__/ticket-office-position.test.ts (3 tests) 3ms
 ✓ src/lib/crm/creativeReelsCheck.test.ts (5 tests) 3ms
 ✓ src/lib/__tests__/zone-capacities.test.ts (2 tests) 5ms
 ✓ src/test/format-integer-conversions.test.ts (3 tests) 4ms
 ✓ src/lib/__tests__/partner-rebill-vat.test.ts (4 tests) 4ms
 ✓ src/lib/__tests__/ticket-office-effective-open.test.ts (4 tests) 4ms
 ✓ src/lib/__tests__/master-adopted-expense-proration.test.ts (3 tests) 5ms
 ✓ src/test/operation-key-domain.test.ts (4 tests) 3ms
 ✓ src/test/coala-centro-custo-norm.test.ts (2 tests) 4ms
 ✓ src/lib/__tests__/camarim-integrate.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/partner-extras-kind.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/settlement-perimeter.test.ts (6 tests) 4ms
 ✓ src/lib/__tests__/event-ab-rounding.test.ts (4 tests) 4ms
 ✓ src/lib/__tests__/event-cost-basis.test.ts (5 tests) 6ms
 ✓ src/test/transaction-edit-modal-operation-key.test.ts (3 tests) 4ms
 ✓ src/lib/__tests__/forecast-edit-diff.test.ts (3 tests) 4ms
 ✓ src/lib/__tests__/ticket-revenue-single-rule.test.ts (6 tests) 4ms
 ✓ src/lib/__tests__/bp-line-required.test.ts (6 tests) 3ms
 ✓ src/lib/__tests__/session-copy.test.ts (3 tests) 4ms
 ✓ src/lib/__tests__/bp-planilha-version.test.ts (2 tests) 3ms
 ✓ src/lib/__tests__/zone-on-sale.test.ts (3 tests) 3ms
 ✓ src/lib/__tests__/standalone-invoices.test.ts (4 tests) 4ms
 ✓ src/test/example.test.ts (1 test) 2ms
 ✓ src/test/payment-list-revalidate.test.ts (2 tests) 4ms
 ✓ src/test/ticket-office-settlement-eligible.test.ts (5 tests) 3ms
 ↓ src/test/partner-statement-edge.test.ts (1 test | 1 skipped)
 ✓ src/test/contactos-list-paging.test.ts (3 tests) 5ms

 Test Files  160 passed | 1 skipped (161)
      Tests  1281 passed | 1 skipped | 11 todo (1293)
   Start at  02:38:11
   Duration  68.00s (transform 6.14s, setup 177.15s, collect 89.84s, tests 8.56s, environment 534.43s, prepare 102.88s)


```
