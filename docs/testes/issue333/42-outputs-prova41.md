# Outputs integrais sanitizados #333 prova41

2026-10-18 02:23:28 UTC

## pg
```text

 RUN  v3.2.7 /dev-server

stdout | docs/testes/issue333/pg/hash-check-pending.test.ts > reapply55000; rollback exact40001/source/ACL/data; candidate reapplies locally
PASS: exact0190–0192/candidate/rollback, all table count+hash and function ACL/metadata unchanged; zero Cloud

 ✓ docs/testes/issue333/pg/hash-check-pending.test.ts (22 tests) 2371ms

 Test Files  1 passed (1)
      Tests  22 passed (22)
   Start at  02:19:06
   Duration  2.93s (transform 58ms, setup 0ms, collect 70ms, tests 2.37s, environment 0ms, prepare 178ms)


```
## handler
```text

 RUN  v3.2.7 /dev-server

 ✓ src/lib/__tests__/standalone-hash-check-pending.test.ts (3 tests) 15ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  02:19:10
   Duration  1.73s (transform 92ms, setup 87ms, collect 81ms, tests 15ms, environment 516ms, prepare 408ms)


```
## http
```text
{"scope": "LOCAL PostgREST16.4 + PostgreSQL17.9; NOT Cloud", "rows": [{"case": "local correct before", "http": 200, "sqlstate": null, "seconds": 0.0179}, {"case": "local divergent before", "http": 500, "sqlstate": "40001", "seconds": 0.0081}, {"case": "local divergent after", "http": 403, "sqlstate": "42501", "seconds": 0.006}, {"case": "local anonymous after", "http": 401, "sqlstate": "42501", "seconds": 0.0055}, {"case": "local correct after", "http": 200, "sqlstate": null, "seconds": 0.0059}, {"case": "local divergent rollback", "http": 500, "sqlstate": "40001", "seconds": 0.007}], "row_and_acl_unchanged": true, "result": "PASS"}

```
## tsgo
```text

```
## vitest-before
```text

 RUN  v3.2.7 /dev-server

 ✓ src/lib/__tests__/split-adjustment.test.ts (37 tests) 15ms
 ✓ src/lib/__tests__/event-simulator-calc.test.ts (35 tests) 23ms
 ✓ src/lib/__tests__/ticket-office-settlement-calc.test.ts (22 tests) 25ms
 ✓ src/lib/__tests__/tickets-v2-properties.test.ts (19 tests) 74ms
 ✓ src/lib/__tests__/event-ab-full-suite.test.ts (27 tests) 21ms
 ✓ src/lib/__tests__/supplier-credits.test.ts (34 tests) 19ms
 ✓ src/lib/__tests__/statement-grouping.test.ts (16 tests) 35ms
 ✓ src/lib/__tests__/multi-day-ticketing.test.ts (25 tests | 4 skipped) 56ms
stderr | src/test/consent-contract-322.test.ts > portal-track handler > consent: timeout da RPC → 503 bloqueado
[portal-track] consent rpc threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > bind falha (throw): lead entra sem ids Meta
[portal-track] consent bind threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > insert falha → 500 (sem falso sucesso)
[portal-track] insert lead_capture [33m500[39m

 ✓ src/test/consent-contract-322.test.ts (38 tests) 151ms
 ✓ src/lib/__tests__/event-settlement-engine.test.ts (27 tests) 42ms
stderr | src/components/data-entry/__tests__/DataEntryDialog.test.tsx > #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/storage-multi-tenant.test.ts (14 tests) 2289ms
   ✓ multi-tenant storage helpers > useSetActiveCompany limpa a cache do storage > depois da troca, withCompanyPath prefixa com a empresa nova  2263ms
stderr | src/test/club-config-integration.test.tsx > #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/club-config-integration.test.tsx (7 tests) 840ms
   ✓ #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa  409ms
 ✓ src/lib/__tests__/forecast-boost.test.ts (12 tests) 14ms
 ✓ src/lib/__tests__/bp-version-multi-diff.test.ts (10 tests) 28ms
 ✓ src/lib/__tests__/tickets-v2-read-layer.test.ts (28 tests | 7 skipped) 22ms
 ✓ src/components/data-entry/__tests__/DataEntryDialog.test.tsx (13 tests) 3508ms
   ✓ #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações  330ms
   ✓ #333 DataEntryDialog > execução não validada: prévia visível, botão desativado mesmo após confirmação  401ms
   ✓ #333 DataEntryDialog > execução validada: exige confirmação explícita e mostra a conferência com a observação  391ms
   ✓ #333 DataEntryDialog > editar depois da prévia exige nova prévia/hash antes de executar  379ms
   ✓ #333 DataEntryDialog > retoma nunca declara sucesso por cache; repõe campos, lê check, sem commit  349ms
   ✓ #333 DataEntryDialog > execução tardia após close não mostra sucesso e retoma só confere  326ms
   ✓ #333 DataEntryDialog > resposta tardia de upload após contexto alterado é descartada  307ms
   ✓ #333 DataEntryDialog > utilizador diferente não recebe retoma; contexto revalidado antes de execução  316ms
 ✓ src/lib/__tests__/partner-settlement-internal-report.test.ts (12 tests) 19ms
 ✓ src/lib/__tests__/iva.test.ts (22 tests) 26ms
 ✓ src/test/newgang-wallet-google.test.ts (12 tests) 448ms
 ✓ src/lib/__tests__/partner-statement-doc.test.ts (29 tests) 105ms
 ✓ src/lib/__tests__/cache-report.test.ts (13 tests) 49ms
 ✓ src/lib/__tests__/event-revenue-basis.test.ts (12 tests) 13ms
 ✓ src/lib/__tests__/event-ab-calc.test.ts (12 tests) 21ms
 ✓ src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx (9 tests) 562ms
 ✓ src/test/bol-m2-parser.test.ts (9 tests) 13ms
 ✓ src/test/ticketline-import-format-transition.test.ts (2 tests) 10ms
 ✓ src/test/newgang-portal.test.ts (10 tests) 30ms
 ✓ src/test/bol-daily-parser.test.ts (9 tests) 11ms
 ✓ src/lib/__tests__/postgrest-embeds.test.ts (2 tests) 530ms
   ✓ embeds do PostgREST em pares com FK duplicada > [Issue #288] nenhum embed ambíguo sem a FK nomeada  527ms
 ✓ src/lib/__tests__/postgrest-row-limit.test.ts (2 tests) 538ms
   ✓ barreira dos 1.000 registos do PostgREST > [Issue #289] nenhuma leitura de tabela grande sem paginação  533ms
 ✓ src/lib/__tests__/bp-tx-matching.test.ts (12 tests) 13ms
 ✓ src/lib/__tests__/overhead-proration.test.ts (11 tests) 15ms
 ✓ src/lib/__tests__/combo-gating.test.ts (19 tests) 9ms
 ✓ src/test/event-financials-invalidation.test.tsx (8 tests) 54ms
 ✓ src/test/derp248-tiktok-event-trackers.test.ts (11 tests) 17ms
 ✓ src/test/ticket-office-statement-documents.test.tsx (6 tests) 172ms
 ✓ src/lib/__tests__/standalone-attempt-routing.test.ts (13 tests) 22ms
 ✓ src/lib/__tests__/event-cost-basis-tour.test.ts (13 tests) 8ms
 ✓ src/lib/__tests__/help-manual-parser.test.ts (10 tests) 25ms
 ✓ src/lib/__tests__/partner-disbursement.test.ts (11 tests) 12ms
 ✓ src/test/edge-fn-guard.test.ts (4 tests) 219ms
 ✓ src/test/newgang-portal-bundle.test.ts (5 tests) 10ms
 ✓ src/lib/__tests__/ebitda.test.ts (8 tests) 11ms
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

 ✓ src/lib/sepa/bank-execution.test.ts (7 tests) 15ms
 ✓ src/components/__tests__/EventABTab.test.tsx (4 tests) 497ms
 ✓ src/lib/__tests__/combo-capacity.test.ts (9 tests) 33ms
 ✓ src/lib/__tests__/creative-media.test.ts (19 tests) 13ms
 ✓ src/test/partner-statement-cards.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/settlement-participants.test.ts (10 tests) 14ms
 ✓ src/lib/__tests__/transitory-transactions.test.ts (7 tests) 27ms
 ✓ src/test/newgang-welcome-once.test.ts (7 tests) 46ms
 ✓ src/lib/__tests__/data-entry-contract.test.ts (8 tests) 31ms
 ✓ src/lib/__tests__/real-cache-deductions.test.ts (8 tests) 9ms
 ✓ src/lib/__tests__/bp-line-review.test.ts (12 tests) 28ms
stderr | src/lib/__tests__/overlay-layer.test.tsx > pilha de camadas — aninhamentos reais > Dialog dentro de overlay manual fica por cima
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 ✓ src/lib/__tests__/google-click-match.test.ts (17 tests) 60ms
stderr | src/lib/__tests__/overlay-layer.test.tsx > pilha de camadas — aninhamentos reais > AlertDialog dentro de Dialog fica por cima
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
`AlertDialogContent` requires a description for the component to be accessible for screen reader users.

You can add a description to the `AlertDialogContent` by passing a `AlertDialogDescription` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an `id` and passing the same value to the `aria-describedby` prop in `AlertDialogContent`. If the description is confusing or duplicative for sighted users, you can use the `@radix-ui/react-visually-hidden` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog
Warning: Missing `Description` or `aria-describedby={undefined}` for {AlertDialogContent}.

 ✓ src/test/newgang-edition-videos.test.ts (6 tests) 16ms
stderr | src/lib/__tests__/overlay-layer.test.tsx > pilha de camadas — aninhamentos reais > Select dentro de AlertDialog dentro de overlay manual fica por cima de tudo
`AlertDialogContent` requires a description for the component to be accessible for screen reader users.

You can add a description to the `AlertDialogContent` by passing a `AlertDialogDescription` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an `id` and passing the same value to the `aria-describedby` prop in `AlertDialogContent`. If the description is confusing or duplicative for sighted users, you can use the `@radix-ui/react-visually-hidden` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog
Warning: Missing `Description` or `aria-describedby={undefined}` for {AlertDialogContent}.

 ✓ src/test/campaign-design-optional-roas.test.ts (15 tests) 433ms
 ✓ src/lib/__tests__/overlay-layer.test.tsx (6 tests) 637ms
   ✓ pilha de camadas — aninhamentos reais > #260 classificação acima da Nova Transação recebe foco e confirma escolha  424ms
 ✓ src/lib/__tests__/settlement-seal.test.ts (6 tests) 10ms
stderr | src/lib/__tests__/permissions-guards-f2b.test.tsx > #311 F2b — guardas por permissão > manager com excepção module.crm entra em /crm e vê o cartão CRM activo
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/permissions-guards-f2b.test.tsx (5 tests) 162ms
 ✓ src/lib/__tests__/event-simulator-ab-scale.test.ts (8 tests) 7ms
 ✓ src/components/__tests__/bp-installments.test.ts (20 tests) 15ms
 ✓ src/lib/__tests__/bp-formula.test.ts (8 tests) 36ms
 ✓ src/test/newgang-history.test.ts (6 tests) 14ms
 ✓ src/lib/__tests__/camarim-bp-rules.test.ts (6 tests) 12ms
 ✓ src/test/transaction-duplicate-check.test.ts (6 tests) 21ms
 ✓ src/lib/__tests__/income-tax-out-of-event-result.test.ts (5 tests) 9ms
 ✓ src/lib/__tests__/cache-tab-total.test.ts (4 tests) 8ms
 ✓ src/lib/__tests__/settlement-revenue.test.ts (6 tests) 12ms
 ✓ src/lib/__tests__/ticket-revenue-single-rule.test.ts (6 tests) 6ms
 ✓ src/test/payment-method-domain.test.ts (8 tests) 15ms
 ✓ src/test/coala-meta-audience-handler.test.ts (3 tests) 201ms
 ✓ src/lib/__tests__/zone-price-elasticity.test.ts (7 tests) 10ms
 ✓ src/lib/__tests__/document-detect.test.ts (5 tests) 1913ms
   ✓ detectDocumentQuad > deteta A4 rodado 12°, centrado com erro < 3%  645ms
   ✓ detectDocumentQuad > deteta A4 rodado -18°, à esquerda com erro < 3%  401ms
   ✓ detectDocumentQuad > deteta A4 rodado 20°, canto sup. dir. com erro < 3%  371ms
 ✓ src/test/coala-meta-audience-sync.test.ts (5 tests) 20ms
 ✓ src/test/newgang-missions.test.ts (5 tests) 16ms
 ✓ src/lib/__tests__/validations.test.ts (17 tests) 21ms
 ✓ src/test/approve-lock-and-core.test.ts (6 tests) 52ms
 ✓ src/lib/__tests__/tour-cache-sync.test.ts (8 tests) 14ms
 ✓ src/lib/__tests__/standalone-capabilities.test.ts (9 tests) 29ms
 ✓ src/lib/__tests__/club-config-source.test.ts (12 tests) 18ms
 ✓ src/lib/__tests__/report-event-cost.test.ts (7 tests) 9ms
 ✓ src/test/newgang-edition-photos.test.ts (5 tests) 23ms
stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Esc não fecha o modal sob outra janela
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Dialog separa cabeçalho e corpo e mantém o X fora do scroll
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 ✓ src/test/mobile-modal-dismiss.test.tsx (6 tests) 344ms
 ✓ src/test/capi-p1-guard.test.ts (22 tests) 13ms
stderr | src/pages/__tests__/ResetPassword.test.tsx > ResetPassword — token_hash flow > (a) não chama verifyOtp ao montar; só ao clicar Continuar
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/pages/__tests__/ResetPassword.test.tsx (3 tests) 271ms
 ✓ src/components/standalone/__tests__/StandaloneReservedExecution.test.tsx (9 tests) 332ms
 ✓ src/lib/__tests__/permissions-per-company.test.ts (5 tests) 11ms
 ✓ src/test/crm-ingest-no-network.test.ts (12 tests) 9ms
 ✓ src/lib/__tests__/ticket-office-effective-open.test.ts (4 tests) 44ms
 ✓ src/lib/__tests__/refund-grouping.test.ts (5 tests) 80ms
 ✓ src/test/newgang-wallet-levels.test.ts (14 tests) 20ms
 ✓ src/lib/__tests__/settlement-doc-text.test.ts (5 tests) 16ms
 ✓ src/lib/__tests__/event-partner-mirror.test.ts (5 tests) 20ms
 ✓ src/lib/__tests__/no-direct-transaction-document-remove.test.ts (3 tests) 621ms
   ✓ sem remoção directa em transaction-documents no frontend > nenhuma chamada directa a .remove nos 10 buckets contabilísticos  604ms
 ✓ src/lib/__tests__/event-ab-rounding.test.ts (4 tests) 17ms
 ✓ src/test/ticket-office-settlement-pdf.test.ts (1 test) 97ms
 ✓ src/lib/__tests__/ticket-office-reconciliation.test.ts (7 tests) 11ms
 ✓ src/lib/__tests__/cache-percentage.test.tsx (4 tests) 195ms
 ✓ src/test/song-link-ssr.test.ts (24 tests) 58ms
 ✓ src/lib/__tests__/payment-settlement.test.ts (8 tests) 7ms
 ✓ src/test/newgang-strict-audience-delivery.test.ts (4 tests) 34ms
 ✓ src/lib/__tests__/standalone-snapshot.test.ts (4 tests) 14ms
 ✓ src/lib/cost-center-map.test.ts (6 tests) 30ms
 ✓ src/lib/__tests__/master-adopted-expense-proration.test.ts (3 tests) 14ms
 ✓ src/test/camarim-session-pdf-sanitize.test.ts (1 test) 99ms
stderr | src/lib/__tests__/cache-scope.test.tsx > ecrã do subevento usa a configuração do Master > mostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/camarim-cash-preview.test.ts (5 tests) 13ms
 ✓ src/lib/__tests__/cache-scope.test.tsx (4 tests) 283ms
 ✓ src/lib/__tests__/ads-tour-split.test.ts (4 tests) 37ms
 ✓ src/lib/__tests__/camarim-integrate.test.ts (4 tests) 9ms
 ✓ src/lib/__tests__/partner-extras-union-148.test.ts (6 tests) 7ms
 ✓ src/test/ticket-office-settlement-eligible.test.ts (5 tests) 6ms
stdout | src/lib/__tests__/card-session-theoretical.test.ts > #275 saldo teórico da sessão = fecho > sem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[#275] teórico = 636.68 esperado = 636.68

 ✓ src/lib/__tests__/card-session-theoretical.test.ts (1 test) 9ms
 ✓ src/lib/crm/creativeReelsCheck.test.ts (5 tests) 14ms
 ✓ src/lib/__tests__/simulator-prior-curve.test.ts (4 tests) 9ms
 ✓ src/test/newgang-crews.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/event-nature.test.ts (4 tests) 13ms
 ✓ src/lib/__tests__/forecast-undo.test.ts (2 tests) 9ms
 ✓ src/test/capi-diag-no-secrets.test.ts (6 tests) 31ms
 ✓ src/test/silent-writes.test.ts (6 tests) 13ms
 ✓ src/lib/__tests__/permissions.test.ts (5 tests) 12ms
 ✓ src/test/similar-suppliers-notice.test.tsx (4 tests) 86ms
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

 ✓ src/components/TicketOfficePositionCards.test.tsx (7 tests) 39ms
 ✓ src/test/event-financial-card-render-loop.test.tsx (1 test) 1113ms
   ✓ EventFinancialCard — sem ciclo de redesenho (#269) > chama onEbitdaParcelsChange uma única vez com queries vazias  1111ms
 ✓ src/test/ticket-office-settlement-view.test.tsx (3 tests) 83ms
 ↓ src/test/partner-statement-edge.test.ts (1 test | 1 skipped)
stderr | src/test/require-feature.test.tsx > visibilidade por company_features > rota bloqueada sem a chave
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/require-feature.test.tsx (4 tests) 142ms
 ✓ src/test/operation-key-domain.test.ts (4 tests) 11ms
 ✓ src/lib/__tests__/pl-category-matching.test.ts (5 tests) 11ms
 ✓ src/test/memory-index.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/ticket-office-position.test.ts (3 tests) 11ms
 ✓ src/lib/__tests__/permissions-guards-proof.test.ts (1 test) 6ms
 ✓ src/lib/__tests__/account-balance-settling.test.ts (2 tests) 15ms
 ✓ src/test/ticket-office-settlement-card-date.test.tsx (1 test) 183ms
 ✓ src/lib/__tests__/event-cost-basis.test.ts (5 tests) 22ms
 ✓ src/lib/__tests__/session-copy.test.ts (3 tests) 9ms
 ✓ src/lib/__tests__/bp-line-required.test.ts (6 tests) 6ms
 ✓ src/lib/__tests__/dre-nature-divergence.test.ts (2 tests) 7ms
 ✓ src/lib/__tests__/partner-extras-kind.test.ts (3 tests) 16ms
 ✓ src/lib/__tests__/utils.test.ts (8 tests) 16ms
 ✓ src/lib/__tests__/settlement-perimeter.test.ts (6 tests) 8ms
 ✓ src/lib/__tests__/partner-rebill-vat.test.ts (4 tests) 8ms
 ✓ src/lib/__tests__/fecho-preconditions.test.ts (4 tests) 15ms
 ✓ src/test/supplier-similarity.test.ts (11 tests) 21ms
 ✓ src/test/forecast-attachment-counts.test.tsx (1 test) 468ms
   ✓ anexos do BP — uma leitura por evento (#269) > 361 linhas → 1 pedido a event_forecast_attachments  466ms
 ✓ src/lib/__tests__/zone-capacities.test.ts (2 tests) 5ms
 ✓ src/test/transaction-edit-modal-operation-key.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/ticket-category.test.ts (4 tests) 4ms
 ✓ src/test/contactos-list-paging.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/postgrest-large-tables-mirror.test.ts (1 test) 118ms
 ✓ src/lib/__tests__/standalone-capability-proposal.test.ts (3 tests) 22ms
 ✓ src/lib/__tests__/standalone-invoices.test.ts (4 tests) 8ms
 ✓ src/test/newgang-profile-country.test.ts (2 tests) 7ms
 ✓ src/test/crm-audience-live-count.test.ts (3 tests) 12ms
 ✓ src/lib/__tests__/event-realized.test.ts (6 tests) 6ms
 ✓ src/lib/__tests__/zone-price-turns.test.ts (3 tests) 22ms
 ✓ src/components/__tests__/PasswordStrengthIndicator.test.ts (7 tests) 13ms
 ✓ src/test/check-deploy.test.ts (3 tests) 9ms
 ✓ src/test/coala-centro-custo-norm.test.ts (2 tests) 6ms
 ✓ src/components/__tests__/StatCard.test.tsx (4 tests) 84ms
 ✓ src/components/__tests__/LinkBpLineDialog-layer.test.tsx (1 test) 186ms
 ✓ src/lib/__tests__/forecast-edit-diff.test.ts (3 tests) 14ms
 ✓ src/lib/__tests__/accountant-account-filter.test.ts (5 tests) 6ms
 ✓ src/test/newgang-content.test.tsx (2 tests) 116ms
 ✓ src/lib/__tests__/bp-planilha-version.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/zone-on-sale.test.ts (3 tests) 4ms
 ✓ src/test/payment-list-revalidate.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/audit.test.ts (4 tests) 5ms
 ✓ src/components/__tests__/EventStatusBadge.test.tsx (5 tests) 59ms
 ✓ src/test/example.test.ts (1 test) 6ms
 ✓ src/test/standalone-compat-prepared.test.ts (26 tests) 30ms
 ✓ src/test/format-integer-conversions.test.ts (3 tests) 5ms

 Test Files  171 passed | 1 skipped (172)
      Tests  1381 passed | 1 skipped | 11 todo (1393)
   Start at  02:15:43
   Duration  87.00s (transform 12.62s, setup 131.50s, collect 154.59s, tests 20.54s, environment 690.02s, prepare 122.00s)


```
## vitest-after
```text

 RUN  v3.2.7 /dev-server

 ✓ src/test/newgang-wallet-google.test.ts (12 tests) 237ms
 ✓ src/lib/__tests__/no-direct-transaction-document-remove.test.ts (3 tests) 368ms
   ✓ sem remoção directa em transaction-documents no frontend > nenhuma chamada directa a .remove nos 10 buckets contabilísticos  363ms
 ✓ src/lib/__tests__/postgrest-row-limit.test.ts (2 tests) 601ms
   ✓ barreira dos 1.000 registos do PostgREST > [Issue #289] nenhuma leitura de tabela grande sem paginação  594ms
 ✓ src/test/campaign-design-optional-roas.test.ts (15 tests) 235ms
 ✓ src/lib/__tests__/document-detect.test.ts (5 tests) 1698ms
   ✓ detectDocumentQuad > deteta A4 rodado 12°, centrado com erro < 3%  452ms
   ✓ detectDocumentQuad > deteta A4 rodado -18°, à esquerda com erro < 3%  323ms
   ✓ detectDocumentQuad > deteta A4 rodado 20°, canto sup. dir. com erro < 3%  322ms
   ✓ detectDocumentQuad > deteta A4 rodado 6°, grande com erro < 3%  362ms
 ✓ src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx (9 tests) 829ms
 ✓ src/lib/__tests__/postgrest-embeds.test.ts (2 tests) 635ms
   ✓ embeds do PostgREST em pares com FK duplicada > [Issue #288] nenhum embed ambíguo sem a FK nomeada  625ms
 ✓ src/lib/__tests__/storage-multi-tenant.test.ts (14 tests) 1496ms
   ✓ multi-tenant storage helpers > useSetActiveCompany limpa a cache do storage > depois da troca, withCompanyPath prefixa com a empresa nova  1474ms
 ✓ src/test/forecast-attachment-counts.test.tsx (1 test) 514ms
   ✓ anexos do BP — uma leitura por evento (#269) > 361 linhas → 1 pedido a event_forecast_attachments  508ms
stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Esc não fecha o modal sob outra janela
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Dialog separa cabeçalho e corpo e mantém o X fora do scroll
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 ✓ src/test/mobile-modal-dismiss.test.tsx (6 tests) 404ms
stderr | src/components/data-entry/__tests__/DataEntryDialog.test.tsx > #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

stderr | src/test/club-config-integration.test.tsx > #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
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

 ✓ src/lib/__tests__/overlay-layer.test.tsx (6 tests) 519ms
   ✓ pilha de camadas — aninhamentos reais > #260 classificação acima da Nova Transação recebe foco e confirma escolha  315ms
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

 ✓ src/test/club-config-integration.test.tsx (7 tests) 1230ms
   ✓ #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa  575ms
 ✓ src/components/__tests__/EventABTab.test.tsx (4 tests) 688ms
   ✓ EventABTab — UI smoke tests > renderiza sem crashar e mostra labels/inputs das zonas  452ms
 ✓ src/test/event-financial-card-render-loop.test.tsx (1 test) 1196ms
   ✓ EventFinancialCard — sem ciclo de redesenho (#269) > chama onEbitdaParcelsChange uma única vez com queries vazias  1195ms
 ✓ src/components/data-entry/__tests__/DataEntryDialog.test.tsx (13 tests) 4394ms
   ✓ #333 DataEntryDialog > execução não validada: prévia visível, botão desativado mesmo após confirmação  555ms
   ✓ #333 DataEntryDialog > execução validada: exige confirmação explícita e mostra a conferência com a observação  464ms
   ✓ #333 DataEntryDialog > editar depois da prévia exige nova prévia/hash antes de executar  542ms
   ✓ #333 DataEntryDialog > retoma nunca declara sucesso por cache; repõe campos, lê check, sem commit  448ms
   ✓ #333 DataEntryDialog > execução tardia após close não mostra sucesso e retoma só confere  468ms
   ✓ #333 DataEntryDialog > execução tardia após company não mostra sucesso e retoma só confere  365ms
   ✓ #333 DataEntryDialog > resposta tardia de upload após contexto alterado é descartada  419ms
   ✓ #333 DataEntryDialog > utilizador diferente não recebe retoma; contexto revalidado antes de execução  336ms
 ✓ src/test/edge-fn-guard.test.ts (4 tests) 221ms
 ✓ src/test/coala-meta-audience-handler.test.ts (3 tests) 208ms
 ✓ src/components/standalone/__tests__/StandaloneReservedExecution.test.tsx (9 tests) 378ms
stderr | src/pages/__tests__/ResetPassword.test.tsx > ResetPassword — token_hash flow > (a) não chama verifyOtp ao montar; só ao clicar Continuar
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/pages/__tests__/ResetPassword.test.tsx (3 tests) 269ms
 ✓ src/lib/__tests__/cache-percentage.test.tsx (4 tests) 211ms
stderr | src/test/consent-contract-322.test.ts > portal-track handler > consent: timeout da RPC → 503 bloqueado
[portal-track] consent rpc threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > bind falha (throw): lead entra sem ids Meta
[portal-track] consent bind threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > insert falha → 500 (sem falso sucesso)
[portal-track] insert lead_capture [33m500[39m

 ✓ src/test/consent-contract-322.test.ts (38 tests) 67ms
 ✓ src/lib/__tests__/postgrest-large-tables-mirror.test.ts (1 test) 68ms
stderr | src/lib/__tests__/permissions-guards-f2b.test.tsx > #311 F2b — guardas por permissão > manager com excepção module.crm entra em /crm e vê o cartão CRM activo
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/permissions-guards-f2b.test.tsx (5 tests) 156ms
 ✓ src/components/__tests__/LinkBpLineDialog-layer.test.tsx (1 test) 198ms
 ✓ src/test/ticket-office-statement-documents.test.tsx (6 tests) 162ms
stderr | src/test/require-feature.test.tsx > visibilidade por company_features > rota bloqueada sem a chave
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/require-feature.test.tsx (4 tests) 135ms
 ✓ src/test/camarim-session-pdf-sanitize.test.ts (1 test) 56ms
 ✓ src/test/ticket-office-settlement-pdf.test.ts (1 test) 59ms
 ✓ src/test/similar-suppliers-notice.test.tsx (4 tests) 73ms
 ✓ src/lib/__tests__/refund-grouping.test.ts (5 tests) 10ms
 ✓ src/test/ticket-office-settlement-card-date.test.tsx (1 test) 87ms
 ✓ src/lib/__tests__/tickets-v2-properties.test.ts (19 tests) 79ms
stderr | src/lib/__tests__/cache-scope.test.tsx > ecrã do subevento usa a configuração do Master > mostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/google-click-match.test.ts (17 tests) 33ms
 ✓ src/lib/__tests__/cache-scope.test.tsx (4 tests) 197ms
 ✓ src/test/ticket-office-settlement-view.test.tsx (3 tests) 88ms
 ✓ src/lib/__tests__/partner-statement-doc.test.ts (29 tests) 92ms
 ✓ src/components/__tests__/StatCard.test.tsx (4 tests) 96ms
 ✓ src/test/newgang-content.test.tsx (2 tests) 152ms
 ✓ src/test/song-link-ssr.test.ts (24 tests) 40ms
 ✓ src/components/__tests__/EventStatusBadge.test.tsx (5 tests) 66ms
 ✓ src/lib/__tests__/multi-day-ticketing.test.ts (25 tests | 4 skipped) 19ms
 ✓ src/test/approve-lock-and-core.test.ts (6 tests) 50ms
 ✓ src/lib/__tests__/cache-report.test.ts (13 tests) 58ms
 ✓ src/test/newgang-welcome-once.test.ts (7 tests) 37ms
 ✓ src/lib/__tests__/ticket-office-effective-open.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/event-settlement-engine.test.ts (27 tests) 41ms
 ✓ src/lib/__tests__/ads-tour-split.test.ts (4 tests) 12ms
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

 ✓ src/components/TicketOfficePositionCards.test.tsx (7 tests) 36ms
 ✓ src/test/event-financials-invalidation.test.tsx (8 tests) 71ms
 ✓ src/lib/__tests__/bp-formula.test.ts (8 tests) 44ms
 ✓ src/lib/__tests__/statement-grouping.test.ts (16 tests) 49ms
 ✓ src/test/newgang-strict-audience-delivery.test.ts (4 tests) 28ms
 ✓ src/lib/__tests__/combo-capacity.test.ts (9 tests) 50ms
 ✓ src/test/capi-diag-no-secrets.test.ts (6 tests) 8ms
 ✓ src/lib/__tests__/data-entry-contract.test.ts (8 tests) 30ms
 ✓ src/test/newgang-portal.test.ts (10 tests) 45ms
 ✓ src/lib/cost-center-map.test.ts (6 tests) 25ms
 ✓ src/lib/__tests__/standalone-capabilities.test.ts (9 tests) 34ms
 ✓ src/test/standalone-compat-prepared.test.ts (26 tests) 56ms
 ✓ src/lib/__tests__/bp-line-review.test.ts (12 tests) 39ms
 ✓ src/lib/__tests__/bp-version-multi-diff.test.ts (10 tests) 47ms
 ✓ src/lib/__tests__/transitory-transactions.test.ts (7 tests) 31ms
 ✓ src/lib/__tests__/iva.test.ts (22 tests) 16ms
 ✓ src/lib/__tests__/ticket-office-settlement-calc.test.ts (22 tests) 21ms
 ✓ src/test/newgang-edition-photos.test.ts (5 tests) 33ms
 ✓ src/lib/__tests__/help-manual-parser.test.ts (10 tests) 68ms
 ✓ src/lib/__tests__/event-simulator-calc.test.ts (35 tests) 25ms
 ✓ src/lib/__tests__/zone-price-turns.test.ts (3 tests) 33ms
 ✓ src/lib/__tests__/tickets-v2-read-layer.test.ts (28 tests | 7 skipped) 48ms
 ✓ src/lib/__tests__/standalone-attempt-routing.test.ts (13 tests) 23ms
 ✓ src/lib/__tests__/event-ab-calc.test.ts (12 tests) 16ms
 ✓ src/lib/__tests__/event-cost-basis.test.ts (5 tests) 12ms
 ✓ src/lib/__tests__/standalone-capability-proposal.test.ts (3 tests) 10ms
 ✓ src/test/supplier-similarity.test.ts (11 tests) 27ms
 ✓ src/lib/__tests__/event-ab-full-suite.test.ts (27 tests) 29ms
 ✓ src/test/transaction-duplicate-check.test.ts (6 tests) 25ms
 ✓ src/lib/__tests__/validations.test.ts (17 tests) 37ms
 ✓ src/lib/__tests__/event-partner-mirror.test.ts (5 tests) 38ms
 ✓ src/test/coala-meta-audience-sync.test.ts (5 tests) 26ms
 ✓ src/test/newgang-wallet-levels.test.ts (14 tests) 13ms
 ✓ src/lib/__tests__/partner-settlement-internal-report.test.ts (12 tests) 14ms
 ✓ src/lib/__tests__/supplier-credits.test.ts (34 tests) 30ms
 ✓ src/lib/__tests__/club-config-source.test.ts (12 tests) 11ms
 ✓ src/lib/__tests__/event-ab-rounding.test.ts (4 tests) 8ms
 ✓ src/test/newgang-missions.test.ts (5 tests) 17ms
 ✓ src/lib/__tests__/settlement-doc-text.test.ts (5 tests) 7ms
 ✓ src/lib/__tests__/partner-extras-kind.test.ts (3 tests) 13ms
 ✓ src/lib/__tests__/utils.test.ts (8 tests) 24ms
 ✓ src/test/newgang-edition-videos.test.ts (6 tests) 24ms
 ✓ src/lib/__tests__/overhead-proration.test.ts (11 tests) 15ms
 ✓ src/test/derp248-tiktok-event-trackers.test.ts (11 tests) 36ms
 ✓ src/lib/sepa/bank-execution.test.ts (7 tests) 10ms
 ✓ src/lib/__tests__/account-balance-settling.test.ts (2 tests) 21ms
 ✓ src/test/payment-method-domain.test.ts (8 tests) 8ms
 ✓ src/lib/__tests__/standalone-hash-check-pending.test.ts (3 tests) 24ms
 ✓ src/lib/__tests__/split-adjustment.test.ts (37 tests) 16ms
 ✓ src/lib/__tests__/fecho-preconditions.test.ts (4 tests) 22ms
 ✓ src/lib/__tests__/forecast-boost.test.ts (12 tests) 19ms
 ✓ src/lib/__tests__/forecast-edit-diff.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/master-adopted-expense-proration.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/settlement-participants.test.ts (10 tests) 10ms
 ✓ src/lib/crm/creativeReelsCheck.test.ts (5 tests) 6ms
 ✓ src/lib/__tests__/standalone-snapshot.test.ts (4 tests) 8ms
 ✓ src/lib/__tests__/tour-cache-sync.test.ts (8 tests) 19ms
 ✓ src/test/newgang-history.test.ts (6 tests) 11ms
 ✓ src/lib/__tests__/camarim-cash-preview.test.ts (5 tests) 37ms
 ✓ src/lib/__tests__/event-nature.test.ts (4 tests) 7ms
 ✓ src/test/silent-writes.test.ts (6 tests) 9ms
 ✓ src/test/bol-m2-parser.test.ts (9 tests) 13ms
 ✓ src/components/__tests__/PasswordStrengthIndicator.test.ts (7 tests) 8ms
 ✓ src/lib/__tests__/creative-media.test.ts (19 tests) 10ms
 ✓ src/test/capi-p1-guard.test.ts (22 tests) 23ms
 ✓ src/lib/__tests__/bp-tx-matching.test.ts (12 tests) 31ms
 ✓ src/lib/__tests__/event-revenue-basis.test.ts (12 tests) 20ms
 ✓ src/lib/__tests__/settlement-revenue.test.ts (6 tests) 18ms
 ✓ src/lib/__tests__/permissions.test.ts (5 tests) 9ms
 ✓ src/lib/__tests__/partner-disbursement.test.ts (11 tests) 10ms
 ✓ src/lib/__tests__/camarim-bp-rules.test.ts (6 tests) 16ms
 ✓ src/lib/__tests__/ticket-office-position.test.ts (3 tests) 6ms
 ✓ src/test/crm-audience-live-count.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/permissions-per-company.test.ts (5 tests) 30ms
 ✓ src/lib/__tests__/pl-category-matching.test.ts (5 tests) 8ms
 ✓ src/test/bol-daily-parser.test.ts (9 tests) 12ms
 ✓ src/lib/__tests__/ebitda.test.ts (8 tests) 10ms
 ✓ src/lib/__tests__/ticket-office-reconciliation.test.ts (7 tests) 9ms
 ✓ src/test/operation-key-domain.test.ts (4 tests) 9ms
 ✓ src/lib/__tests__/zone-price-elasticity.test.ts (7 tests) 22ms
 ✓ src/lib/__tests__/settlement-seal.test.ts (6 tests) 52ms
 ✓ src/test/newgang-portal-bundle.test.ts (5 tests) 18ms
stdout | src/lib/__tests__/card-session-theoretical.test.ts > #275 saldo teórico da sessão = fecho > sem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[#275] teórico = 636.68 esperado = 636.68

 ✓ src/lib/__tests__/card-session-theoretical.test.ts (1 test) 8ms
 ✓ src/test/ticketline-import-format-transition.test.ts (2 tests) 13ms
 ✓ src/test/check-deploy.test.ts (3 tests) 14ms
 ✓ src/lib/__tests__/session-copy.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/real-cache-deductions.test.ts (8 tests) 27ms
 ✓ src/lib/__tests__/income-tax-out-of-event-result.test.ts (5 tests) 36ms
 ✓ src/lib/__tests__/report-event-cost.test.ts (7 tests) 24ms
 ✓ src/lib/__tests__/simulator-prior-curve.test.ts (4 tests) 16ms
 ✓ src/lib/__tests__/camarim-integrate.test.ts (4 tests) 18ms
 ✓ src/lib/__tests__/forecast-undo.test.ts (2 tests) 13ms
 ✓ src/test/crm-ingest-no-network.test.ts (12 tests) 15ms
 ✓ src/lib/__tests__/combo-gating.test.ts (19 tests) 13ms
 ✓ src/lib/__tests__/event-cost-basis-tour.test.ts (13 tests) 12ms
 ✓ src/lib/__tests__/partner-rebill-vat.test.ts (4 tests) 16ms
 ✓ src/lib/__tests__/cache-tab-total.test.ts (4 tests) 17ms
 ✓ src/lib/__tests__/settlement-perimeter.test.ts (6 tests) 12ms
 ✓ src/components/__tests__/bp-installments.test.ts (20 tests) 18ms
 ✓ src/test/newgang-crews.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/standalone-invoices.test.ts (4 tests) 8ms
 ✓ src/test/contactos-list-paging.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/dre-nature-divergence.test.ts (2 tests) 14ms
 ✓ src/test/transaction-edit-modal-operation-key.test.ts (3 tests) 23ms
 ✓ src/test/newgang-profile-country.test.ts (2 tests) 17ms
 ✓ src/lib/__tests__/payment-settlement.test.ts (8 tests) 18ms
 ✓ src/lib/__tests__/partner-extras-union-148.test.ts (6 tests) 14ms
 ✓ src/test/memory-index.test.ts (3 tests) 10ms
 ✓ src/lib/__tests__/event-simulator-ab-scale.test.ts (8 tests) 10ms
 ✓ src/lib/__tests__/ticket-revenue-single-rule.test.ts (6 tests) 45ms
 ✓ src/test/example.test.ts (1 test) 8ms
 ✓ src/test/partner-statement-cards.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/permissions-guards-proof.test.ts (1 test) 11ms
 ✓ src/lib/__tests__/accountant-account-filter.test.ts (5 tests) 6ms
 ✓ src/test/coala-centro-custo-norm.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/bp-line-required.test.ts (6 tests) 7ms
 ✓ src/test/ticket-office-settlement-eligible.test.ts (5 tests) 5ms
 ✓ src/lib/__tests__/event-realized.test.ts (6 tests) 22ms
 ✓ src/lib/__tests__/zone-capacities.test.ts (2 tests) 6ms
 ✓ src/lib/__tests__/bp-planilha-version.test.ts (2 tests) 20ms
 ✓ src/test/payment-list-revalidate.test.ts (2 tests) 16ms
 ✓ src/lib/__tests__/ticket-category.test.ts (4 tests) 9ms
 ✓ src/lib/__tests__/audit.test.ts (4 tests) 5ms
 ✓ src/lib/__tests__/zone-on-sale.test.ts (3 tests) 5ms
 ↓ src/test/partner-statement-edge.test.ts (1 test | 1 skipped)
 ✓ src/test/format-integer-conversions.test.ts (3 tests) 6ms

 Test Files  172 passed | 1 skipped (173)
      Tests  1384 passed | 1 skipped | 11 todo (1396)
   Start at  02:20:38
   Duration  100.48s (transform 12.57s, setup 163.96s, collect 141.48s, tests 20.93s, environment 829.23s, prepare 138.79s)


```
