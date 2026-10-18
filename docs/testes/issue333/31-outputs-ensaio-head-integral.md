# #333 — outputs integrais da retoma

Data: 2026-10-18T00:09:16Z
Comando: python3 docs/testes/issue333/run-head-isolated.py

## /tmp/issue333-head-01jg9liz/head-integration.log

```text
COMMAND: node /tmp/issue333-head-01jg9liz/tree/node_modules/vitest/vitest.mjs run --config docs/testes/issue333/vitest.head.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-01jg9liz/tree[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [2mno tests[22m
[2m   Start at [22m 23:41:34
[2m   Duration [22m 968ms[2m (transform 31ms, setup 0ms, collect 0ms, tests 0ms, environment 470ms, prepare 202ms)[22m


[31m⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Suites 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m [ docs/testes/issue333/head/flows.test.tsx ][22m
[31m[1mReferenceError[22m: expect is not defined[39m
[36m [2m❯[22m ../../../dev-server/node_modules/@testing-library/jest-dom/dist/index.mjs:[2m9:1[22m[39m
    [90m  7| [39m[35mimport[39m [32m'css.escape'[39m[33m;[39m
    [90m  8| [39m
    [90m  9| [39mexpect[33m.[39m[34mextend[39m(extensions)[33m;[39m
    [90m   | [39m[31m^[39m
    [90m 10| [39m
[90m [2m❯[22m src/test/setup.ts:[2m1:1[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


EXIT: 1

```
## /tmp/issue333-head-4xrksqf3/general.log

```text
COMMAND: node /tmp/issue333-head-4xrksqf3/tree/node_modules/vitest/vitest.mjs run --config vitest.offline.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-4xrksqf3/tree[39m

 [32m✓[39m src/lib/__tests__/supplier-credits.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-calc.test.ts [2m([22m[2m35 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/split-adjustment.test.ts [2m([22m[2m37 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/statement-grouping.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-full-suite.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-settlement-calc.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-properties.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 51[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/multi-day-ticketing.test.ts [2m([22m[2m25 tests[22m[2m | [22m[33m4 skipped[39m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/test/consent-contract-322.test.ts [2m([22m[2m38 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-settlement-engine.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/storage-multi-tenant.test.ts [2m([22m[2m14 tests[22m[2m)[22m[33m 1362[2mms[22m[39m
   [33m[2m✓[22m[39m multi-tenant storage helpers[2m > [22museSetActiveCompany limpa a cache do storage[2m > [22mdepois da troca, withCompanyPath prefixa com a empresa nova [33m 1350[2mms[22m[39m
 [32m✓[39m src/test/club-config-integration.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[33m 656[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-calc.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-read-layer.test.ts [2m([22m[2m28 tests[22m[2m | [22m[33m7 skipped[39m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/iva.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-boost.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-version-multi-diff.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/test/newgang-wallet-google.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 154[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-statement-doc.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 64[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-settlement-internal-report.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-report.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-revenue-basis.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/components/data-entry/__tests__/DataEntryDialog.test.tsx [2m([22m[2m13 tests[22m[2m)[22m[33m 2382[2mms[22m[39m
 [32m✓[39m src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx [2m([22m[2m9 tests[22m[2m)[22m[33m 432[2mms[22m[39m
 [32m✓[39m src/test/bol-m2-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/ticketline-import-format-transition.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-embeds.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 156[2mms[22m[39m
 [32m✓[39m src/test/bol-daily-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-row-limit.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 152[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-tx-matching.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/overhead-proration.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/test/event-financials-invalidation.test.tsx [2m([22m[2m8 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-gating.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/test/derp248-tiktok-event-trackers.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-statement-documents.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[32m 121[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-attempt-routing.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis-tour.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-disbursement.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal-bundle.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/edge-fn-guard.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 61[2mms[22m[39m
 [32m✓[39m src/lib/sepa/bank-execution.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ebitda.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/creative-media.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/components/__tests__/EventABTab.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[33m 339[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-capacity.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m src/test/partner-statement-cards.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/newgang-welcome-once.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-participants.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/transitory-transactions.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/real-cache-deductions.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/data-entry-contract.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-line-review.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-videos.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/test/campaign-design-optional-roas.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 165[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/overlay-layer.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 330[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-guards-f2b.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 109[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/google-click-match.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-seal.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-ab-scale.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/components/__tests__/bp-installments.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-formula.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-bp-rules.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/newgang-history.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/income-tax-out-of-event-result.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/transaction-duplicate-check.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/test/payment-method-domain.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-tab-total.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-revenue.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-handler.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 148[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-revenue-single-rule.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-elasticity.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-sync.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/document-detect.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 1297[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 12°, centrado com erro < 3% [33m 350[2mms[22m[39m
 [32m✓[39m src/test/newgang-missions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/test/approve-lock-and-core.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/validations.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tour-cache-sync.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-capabilities.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/club-config-source.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/report-event-cost.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/pages/__tests__/ResetPassword.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 186[2mms[22m[39m
 [32m✓[39m src/test/mobile-modal-dismiss.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[32m 252[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-photos.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/test/capi-p1-guard.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-per-company.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/crm-ingest-no-network.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-effective-open.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/test/newgang-wallet-levels.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/refund-grouping.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-doc-text.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/no-direct-transaction-document-remove.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 109[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-partner-mirror.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-rounding.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/song-link-ssr.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-reconciliation.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-percentage.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 81[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-pdf.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 63[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/payment-settlement.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/test/newgang-strict-audience-delivery.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/test/camarim-session-pdf-sanitize.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/lib/cost-center-map.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-cash-preview.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/master-adopted-expense-proration.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-extras-union-148.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ads-tour-split.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-integrate.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-eligible.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 4[2mms[22m[39m
[90mstdout[2m | src/lib/__tests__/card-session-theoretical.test.ts[2m > [22m[2m#275 saldo teórico da sessão = fecho[2m > [22m[2msem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[22m[39m[#275] teórico = 636.68 esperado = 636.68

 [32m✓[39m src/lib/__tests__/card-session-theoretical.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/crm/creativeReelsCheck.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-scope.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 161[2mms[22m[39m
 [32m✓[39m src/test/newgang-crews.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/simulator-prior-curve.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-undo.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/capi-diag-no-secrets.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-nature.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/silent-writes.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/operation-key-domain.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/components/TicketOfficePositionCards.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [2m[90m↓[39m[22m src/test/partner-statement-edge.test.ts [2m([22m[2m1 test[22m[2m | [22m[33m1 skipped[39m[2m)[22m
 [32m✓[39m src/test/event-financial-card-render-loop.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 1116[2mms[22m[39m
   [33m[2m✓[22m[39m EventFinancialCard — sem ciclo de redesenho (#269)[2m > [22mchama onEbitdaParcelsChange uma única vez com queries vazias [33m 1113[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-view.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 78[2mms[22m[39m
 [32m✓[39m src/test/similar-suppliers-notice.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 60[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/pl-category-matching.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/require-feature.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 111[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-position.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-guards-proof.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/account-balance-settling.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-card-date.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 82[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/session-copy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-line-required.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-extras-kind.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/dre-nature-divergence.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-perimeter.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-rebill-vat.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/supplier-similarity.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/utils.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/fecho-preconditions.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/transaction-edit-modal-operation-key.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-capacities.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/test/forecast-attachment-counts.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 394[2mms[22m[39m
   [33m[2m✓[22m[39m anexos do BP — uma leitura por evento (#269)[2m > [22m361 linhas → 1 pedido a event_forecast_attachments [33m 392[2mms[22m[39m
 [32m✓[39m src/test/contactos-list-paging.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-category.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-large-tables-mirror.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-invoices.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/newgang-profile-country.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/crm-audience-live-count.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-realized.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-turns.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/components/__tests__/PasswordStrengthIndicator.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/check-deploy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/components/__tests__/LinkBpLineDialog-layer.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 247[2mms[22m[39m
 [32m✓[39m src/components/__tests__/StatCard.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 120[2mms[22m[39m
 [32m✓[39m src/test/coala-centro-custo-norm.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-edit-diff.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/accountant-account-filter.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/newgang-content.test.tsx [2m([22m[2m2 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [32m✓[39m src/test/payment-list-revalidate.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-planilha-version.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-on-sale.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/audit.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/test/example.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m src/components/__tests__/EventStatusBadge.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m src/test/format-integer-conversions.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 3[2mms[22m[39m

[2m Test Files [22m [1m[31m4 failed[39m[22m[2m | [22m[1m[32m165 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (170)[39m
[2m      Tests [22m [1m[32m1326 passed[39m[22m[2m | [22m[33m1 skipped[39m[2m | [22m[90m11 todo[39m[90m (1338)[39m
[2m   Start at [22m 23:49:27
[2m   Duration [22m 56.32s[2m (transform 7.59s, setup 96.39s, collect 99.01s, tests 12.68s, environment 463.26s, prepare 81.33s)[22m

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mconsent: timeout da RPC → 503 bloqueado
[22m[39m[portal-track] consent rpc threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mbind falha (throw): lead entra sem ids Meta
[22m[39m[portal-track] consent bind threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2minsert falha → 500 (sem falso sucesso)
[22m[39m[portal-track] insert lead_capture [33m500[39m

[90mstderr[2m | src/components/data-entry/__tests__/DataEntryDialog.test.tsx[2m > [22m[2m#333 DataEntryDialog[2m > [22m[2mendpoint ausente: mostra indisponível e não oferece ações
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/test/club-config-integration.test.tsx[2m > [22m[2m#327 integration without network[2m > [22m[2mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/components/__tests__/EventABTab.test.tsx[2m > [22m[2mEventABTab — UI smoke tests[2m > [22m[2mrenderiza sem crashar e mostra labels/inputs das zonas
[22m[39mWarning: Input contains an input of type undefined with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://reactjs.org/link/controlled-components
    at input
    at /tmp/issue333-head-4xrksqf3/tree/src/components/ui/input.tsx:8:6
    at div
    at div
    at /tmp/issue333-head-4xrksqf3/tree/src/components/ui/card.tsx:38:6
    at div
    at /tmp/issue333-head-4xrksqf3/tree/src/components/ui/card.tsx:7:50
    at div
    at EventABTab (/tmp/issue333-head-4xrksqf3/tree/src/components/EventABTab.tsx:151:23)
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

[90mstderr[2m | src/lib/__tests__/permissions-guards-f2b.test.tsx[2m > [22m[2m#311 F2b — guardas por permissão[2m > [22m[2mmanager com excepção module.crm entra em /crm e vê o cartão CRM activo
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/pages/__tests__/ResetPassword.test.tsx[2m > [22m[2mResetPassword — token_hash flow[2m > [22m[2m(a) não chama verifyOtp ao montar; só ao clicar Continuar
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mEsc não fecha o modal sob outra janela
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mDialog separa cabeçalho e corpo e mantém o X fora do scroll
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/lib/__tests__/cache-scope.test.tsx[2m > [22m[2mecrã do subevento usa a configuração do Master[2m > [22m[2mmostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

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

[90mstderr[2m | src/test/require-feature.test.tsx[2m > [22m[2mvisibilidade por company_features[2m > [22m[2mrota bloqueada sem a chave
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.


[31m⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Suites 4 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m src/test/memory-index.test.ts[2m [ src/test/memory-index.test.ts ][22m
[31m[1mError[22m: ENOENT: no such file or directory, scandir '/tmp/issue333-head-4xrksqf3/tree/.lovable/memory'[39m
[36m [2m❯[22m walk scripts/memory-index-lib.mjs:[2m15:22[22m[39m
    [90m 13| [39m[35mfunction[39m [34mwalk[39m(dir) {
    [90m 14| [39m  [35mconst[39m out [33m=[39m [][33m;[39m
    [90m 15| [39m  [35mfor[39m ([35mconst[39m e [35mof[39m fs[33m.[39m[34mreaddirSync[39m(dir[33m,[39m { withFileTypes[33m:[39m [35mtrue[39m })) {
    [90m   | [39m                     [31m^[39m
    [90m 16| [39m    [35mconst[39m p [33m=[39m path[33m.[39m[34mjoin[39m(dir[33m,[39m e[33m.[39mname)[33m;[39m
    [90m 17| [39m    [35mif[39m (e[33m.[39m[34misDirectory[39m()) out[33m.[39m[34mpush[39m([33m...[39m[34mwalk[39m(p))[33m;[39m
[90m [2m❯[22m Module.listMemoryFiles scripts/memory-index-lib.mjs:[2m37:10[22m[39m
[90m [2m❯[22m src/test/memory-index.test.ts:[2m10:28[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯[22m[39m

[41m[1m FAIL [22m[49m src/test/standalone-compat-prepared.test.ts[2m [ src/test/standalone-compat-prepared.test.ts ][22m
[31m[1mError[22m: Failed to resolve import "../../../patches/issue333/identity" from "docs/testes/issue333/compatibility.test.ts". Does the file exist?[39m
  Plugin: [35mvite:import-analysis[39m
  File: [36m/tmp/issue333-head-4xrksqf3/tree/docs/testes/issue333/compatibility.test.ts[39m:2:91
[33m  1  |  import { describe, it, expect, vi } from "vitest";
  2  |  import { ambiguousIdentity, sameIdentity, strongPart } from "../../../patches/issue333/identity";
     |                                                               ^
  3  |  import { findStrongCandidates, persistInvoice } from "../../../patches/issue333/compat";
  4  |  import { standaloneWriteError } from "../../../patches/issue333/frontend-lookup";[39m
[90m [2m❯[22m TransformPluginContext._formatError ../../../dev-server/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:[2m49258:41[22m[39m
[90m [2m❯[22m TransformPluginContext.error ../../../dev-server/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:[2m49253:16[22m[39m
[90m [2m❯[22m normalizeUrl ../../../dev-server/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:[2m64291:23[22m[39m
[90m [2m❯[22m ../../../dev-server/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:[2m64423:39[22m[39m
[90m [2m❯[22m TransformPluginContext.transform ../../../dev-server/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:[2m64350:7[22m[39m
[90m [2m❯[22m PluginContainer.transform ../../../dev-server/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:[2m49099:18[22m[39m
[90m [2m❯[22m loadAndTransform ../../../dev-server/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:[2m51977:27[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯[22m[39m

[41m[1m FAIL [22m[49m src/lib/__tests__/help-manual-parser.test.ts[2m [ src/lib/__tests__/help-manual-parser.test.ts ][22m
[31m[1mError[22m: ENOENT: no such file or directory, open 'docs/manual/rateios.md'[39m
[36m [2m❯[22m src/lib/__tests__/help-manual-parser.test.ts:[2m5:17[22m[39m
    [90m  3| [39mimport { parseHelpArticle, chunkArticle, CHUNK_TARGET_CHARS } from "..…
    [90m  4| [39m
    [90m  5| [39m[35mconst[39m rateios [33m=[39m [34mreadFileSync[39m([32m"docs/manual/rateios.md"[39m[33m,[39m [32m"utf8"[39m)[33m;[39m
    [90m   | [39m                [31m^[39m
    [90m  6| [39m
    [90m  7| [39m[34mdescribe[39m([32m"parseHelpArticle"[39m[33m,[39m () [33m=>[39m {

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯[22m[39m

[41m[1m FAIL [22m[49m src/lib/__tests__/standalone-capability-proposal.test.ts[2m [ src/lib/__tests__/standalone-capability-proposal.test.ts ][22m
[31m[1mError[22m: Failed to resolve import "../../../patches/issue333/capability-reader.PROPOSTA" from "src/lib/__tests__/standalone-capability-proposal.test.ts". Does the file exist?[39m
  Plugin: [35mvite:import-analysis[39m
  File: [36m/tmp/issue333-head-4xrksqf3/tree/src/lib/__tests__/standalone-capability-proposal.test.ts[39m:2:37
[33m  1  |  import { describe, expect, it, vi } from "vitest";
  2  |  import { proposedCapabilities } from "../../../patches/issue333/capability-reader.PROPOSTA";
     |                                        ^
  3  |  describe("#333 inert service capability integration proposal", () => {
  4  |    it("absent/unavailable/malformed server response stays closed", async () => {[39m
[90m [2m❯[22m TransformPluginContext._formatError ../../../dev-server/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:[2m49258:41[22m[39m
[90m [2m❯[22m TransformPluginContext.error ../../../dev-server/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:[2m49253:16[22m[39m
[90m [2m❯[22m normalizeUrl ../../../dev-server/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:[2m64291:23[22m[39m
[90m [2m❯[22m ../../../dev-server/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:[2m64423:39[22m[39m
[90m [2m❯[22m TransformPluginContext.transform ../../../dev-server/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:[2m64350:7[22m[39m
[90m [2m❯[22m PluginContainer.transform ../../../dev-server/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:[2m49099:18[22m[39m
[90m [2m❯[22m loadAndTransform ../../../dev-server/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:[2m51977:27[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯[22m[39m


EXIT: 1

```
## /tmp/issue333-head-9ggwlvqk/build.log

```text
COMMAND: node /tmp/issue333-head-9ggwlvqk/tree/node_modules/vite/bin/vite.js build
[36mvite v5.4.19 [32mbuilding for production...[36m[39m
transforming...
[32m✓[39m 6222 modules transformed.
rendering chunks...
[bundle] inicial estático: 5139620 bytes
computing gzip size...
[2mdist/[22m[32mmanifest.webmanifest                                    [39m[1m[2m    0.47 kB[22m[1m[22m
[2mdist/[22m[32mindex.html                                              [39m[1m[2m    3.95 kB[22m[1m[22m[2m │ gzip:   1.29 kB[22m
[2mdist/[22m[2massets/[22m[32mlogo-horizontal-mvVEptKs.png                     [39m[1m[2m   45.85 kB[22m[1m[22m
[2mdist/[22m[32mbundle-report.json                                      [39m[1m[2m  810.64 kB[22m[1m[22m[2m │ gzip:  76.93 kB[22m
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
[2mdist/[22m[2massets/[22m[36museDisplayCurrency-CRHkYBXH.js                   [39m[1m[2m    0.15 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
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
[2mdist/[22m[2massets/[22m[36mbackdropClose-B6lp4WDX.js                        [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.21 kB[22m
[2mdist/[22m[2massets/[22m[36mrelativeTime-CufnskKF.js                         [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.22 kB[22m
[2mdist/[22m[2massets/[22m[36mskeleton-BZCLGvF5.js                             [39m[1m[2m    0.34 kB[22m[1m[22m[2m │ gzip:   0.27 kB[22m
[2mdist/[22m[2massets/[22m[36maddMonths-Dsh0EBap.js                            [39m[1m[2m    0.35 kB[22m[1m[22m[2m │ gzip:   0.25 kB[22m
[2mdist/[22m[2massets/[22m[36mstrategy-status-if_xUdsk.js                      [39m[1m[2m    0.41 kB[22m[1m[22m[2m │ gzip:   0.24 kB[22m
[2mdist/[22m[2massets/[22m[36mform-enter-guard-TC9TB5Pp.js                     [39m[1m[2m    0.43 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36mtraction-C6TeXKI5.js                             [39m[1m[2m    0.45 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
[2mdist/[22m[2massets/[22m[36mstring-similarity-B7WDu-Mk.js                    [39m[1m[2m    0.45 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
[2mdist/[22m[2massets/[22m[36moverlay-layer-j5Te-yW2.js                        [39m[1m[2m    0.50 kB[22m[1m[22m[2m │ gzip:   0.36 kB[22m
[2mdist/[22m[2massets/[22m[36mcreative-media-DKNTK8AD.js                       [39m[1m[2m    0.50 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
[2mdist/[22m[2massets/[22m[36mseparator-DEFw6bXM.js                            [39m[1m[2m    0.54 kB[22m[1m[22m[2m │ gzip:   0.37 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInDays-ChvF9Jc3.js                     [39m[1m[2m    0.54 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36mbudget-mode-JwiRs48U.js                          [39m[1m[2m    0.56 kB[22m[1m[22m[2m │ gzip:   0.40 kB[22m
[2mdist/[22m[2massets/[22m[36museMyLeadFrenteIds-DePf_Epw.js                   [39m[1m[2m    0.56 kB[22m[1m[22m[2m │ gzip:   0.38 kB[22m
[2mdist/[22m[2massets/[22m[36mgetTimezoneOffsetInMilliseconds-CEhzTjz1.js      [39m[1m[2m    0.58 kB[22m[1m[22m[2m │ gzip:   0.34 kB[22m
[2mdist/[22m[2massets/[22m[36maudience-pdf-RQfvkLkz.js                         [39m[1m[2m    0.64 kB[22m[1m[22m[2m │ gzip:   0.41 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-nature-BSQ-ezBD.js                         [39m[1m[2m    0.78 kB[22m[1m[22m[2m │ gzip:   0.45 kB[22m
[2mdist/[22m[2massets/[22m[36museRealtimeInvalidation-BaveKFvq.js              [39m[1m[2m    0.78 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m
[2mdist/[22m[2massets/[22m[36mPriorityBadge-CQBwtQPc.js                        [39m[1m[2m    0.80 kB[22m[1m[22m[2m │ gzip:   0.52 kB[22m
[2mdist/[22m[2massets/[22m[36mIbanWarning-CVrnbaRI.js                          [39m[1m[2m    0.81 kB[22m[1m[22m[2m │ gzip:   0.42 kB[22m
[2mdist/[22m[2massets/[22m[36museOperacaoFilters-CTkRwTaA.js                   [39m[1m[2m    0.81 kB[22m[1m[22m[2m │ gzip:   0.49 kB[22m
[2mdist/[22m[2massets/[22m[36madmin-window-BzTsb4Jf.js                         [39m[1m[2m    0.85 kB[22m[1m[22m[2m │ gzip:   0.50 kB[22m
[2mdist/[22m[2massets/[22m[36mcard-account-balance-Ds_INnn5.js                 [39m[1m[2m    0.92 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36maccount-balance-rpc-zGa2fHgW.js                  [39m[1m[2m    0.93 kB[22m[1m[22m[2m │ gzip:   0.49 kB[22m
[2mdist/[22m[2massets/[22m[36mcircuit-account-70-i12BG.js                      [39m[1m[2m    0.94 kB[22m[1m[22m[2m │ gzip:   0.58 kB[22m
[2mdist/[22m[2massets/[22m[36msupplier-credits-We_dde7F.js                     [39m[1m[2m    0.98 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mmoney-input-m8PjQW3X.js                          [39m[1m[2m    1.01 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
[2mdist/[22m[2massets/[22m[36mapp-badge-l-YFIXoD.js                            [39m[1m[2m    1.04 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m
[2mdist/[22m[2massets/[22m[36mavatar-BLonjJkz.js                               [39m[1m[2m    1.05 kB[22m[1m[22m[2m │ gzip:   0.43 kB[22m
[2mdist/[22m[2massets/[22m[36mbank-link-date-DcRav5qG.js                       [39m[1m[2m    1.05 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36mPhaseBadge-CzTC6zOF.js                           [39m[1m[2m    1.19 kB[22m[1m[22m[2m │ gzip:   0.66 kB[22m
[2mdist/[22m[2massets/[22m[36mStaffList-qFjuMksw.js                            [39m[1m[2m    1.19 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36mzone-capacities-DXM7Nogs.js                      [39m[1m[2m    1.22 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mIvaRateSelect-DgsWesHC.js                        [39m[1m[2m    1.24 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
[2mdist/[22m[2massets/[22m[36mcard-session-helpers-CdbIjfZ7.js                 [39m[1m[2m    1.31 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m
[2mdist/[22m[2massets/[22m[36malert-_wOHY5mq.js                                [39m[1m[2m    1.32 kB[22m[1m[22m[2m │ gzip:   0.59 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoStatusBadge-CIi67ZHU.js                  [39m[1m[2m    1.36 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
[2mdist/[22m[2massets/[22m[36maccount-balance-CXcdmJLd.js                      [39m[1m[2m    1.36 kB[22m[1m[22m[2m │ gzip:   0.69 kB[22m
[2mdist/[22m[2massets/[22m[36mcurrency-DvXZV_Ot.js                             [39m[1m[2m    1.43 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36maccountant-reviews-Dc_e4YU4.js                   [39m[1m[2m    1.46 kB[22m[1m[22m[2m │ gzip:   0.60 kB[22m
[2mdist/[22m[2massets/[22m[36msupplier-bank-D2nupgGY.js                        [39m[1m[2m    1.51 kB[22m[1m[22m[2m │ gzip:   0.70 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-line-relink-ZDGdB-rw.js                       [39m[1m[2m    1.52 kB[22m[1m[22m[2m │ gzip:   0.58 kB[22m
[2mdist/[22m[2massets/[22m[36mscroll-area-BEKoATPz.js                          [39m[1m[2m    1.62 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mReportArtistCachePage-CrtY6ySv.js                [39m[1m[2m    1.67 kB[22m[1m[22m[2m │ gzip:   0.63 kB[22m
[2mdist/[22m[2massets/[22m[36mcapital-branch-CJwzxRyH.js                       [39m[1m[2m    1.67 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36mebitda-QSjbJPWp.js                               [39m[1m[2m    1.74 kB[22m[1m[22m[2m │ gzip:   0.75 kB[22m
[2mdist/[22m[2massets/[22m[36mcamarim-helpers-M1Vn5iD-.js                      [39m[1m[2m    1.76 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36maccordion-C5SPr8ZB.js                            [39m[1m[2m    1.78 kB[22m[1m[22m[2m │ gzip:   0.64 kB[22m
[2mdist/[22m[2massets/[22m[36miban-BYOybSCJ.js                                 [39m[1m[2m    1.79 kB[22m[1m[22m[2m │ gzip:   0.95 kB[22m
[2mdist/[22m[2massets/[22m[36minvoice-ocr-prepare-CcJft9v3.js                  [39m[1m[2m    1.85 kB[22m[1m[22m[2m │ gzip:   1.02 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-line-required-D03Jfwa_.js                     [39m[1m[2m    1.88 kB[22m[1m[22m[2m │ gzip:   0.76 kB[22m
[2mdist/[22m[2massets/[22m[36mEventNatureFilter-BRtOn17B.js                    [39m[1m[2m    1.90 kB[22m[1m[22m[2m │ gzip:   0.73 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountingExportPage-wJxFm_uB.js           [39m[1m[2m    1.97 kB[22m[1m[22m[2m │ gzip:   0.75 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDocumentPendenciesPage-BOANoV4p.js         [39m[1m[2m    1.99 kB[22m[1m[22m[2m │ gzip:   0.75 kB[22m
[2mdist/[22m[2massets/[22m[36mtoggle-group-DTytEyXu.js                         [39m[1m[2m    2.00 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36mdashboard-format-GnqOyAs1.js                     [39m[1m[2m    2.00 kB[22m[1m[22m[2m │ gzip:   0.92 kB[22m
[2mdist/[22m[2massets/[22m[36msettlement-participants-7PWKMk_i.js              [39m[1m[2m    2.01 kB[22m[1m[22m[2m │ gzip:   0.79 kB[22m
[2mdist/[22m[2massets/[22m[36mMirrorAporteNotice-wK0XY01I.js                   [39m[1m[2m    2.05 kB[22m[1m[22m[2m │ gzip:   0.90 kB[22m
[2mdist/[22m[2massets/[22m[36mFeatureNotEnabledCard-CmppVq_8.js                [39m[1m[2m    2.08 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-ab-calc-BxWHlvfV.js                        [39m[1m[2m    2.10 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteLeadsAvatars-yWVLP-Dp.js                   [39m[1m[2m    2.21 kB[22m[1m[22m[2m │ gzip:   0.87 kB[22m
[2mdist/[22m[2massets/[22m[36mticket-office-reconciliation-DvqxvsJY.js         [39m[1m[2m    2.25 kB[22m[1m[22m[2m │ gzip:   1.05 kB[22m
[2mdist/[22m[2massets/[22m[36museUserPreferences-DHI9HMrw.js                   [39m[1m[2m    2.30 kB[22m[1m[22m[2m │ gzip:   0.69 kB[22m
[2mdist/[22m[2massets/[22m[36mformatDistanceToNow-CgGNwkFO.js                  [39m[1m[2m    2.32 kB[22m[1m[22m[2m │ gzip:   0.98 kB[22m
[2mdist/[22m[2massets/[22m[36mpartner-extras-BH25kntu.js                       [39m[1m[2m    2.32 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-tx-matching-BHd1Ixbn.js                       [39m[1m[2m    2.38 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36museEventIvaRates-CZTdo7T-.js                     [39m[1m[2m    2.65 kB[22m[1m[22m[2m │ gzip:   1.15 kB[22m
[2mdist/[22m[2massets/[22m[36mparseISO-Cr0H38in.js                             [39m[1m[2m    2.70 kB[22m[1m[22m[2m │ gzip:   1.19 kB[22m
[2mdist/[22m[2massets/[22m[36mReportCostSourceToggle-mXaqtf-i.js               [39m[1m[2m    2.90 kB[22m[1m[22m[2m │ gzip:   1.06 kB[22m
[2mdist/[22m[2massets/[22m[36m_LegalLayout-1HLoFOFz.js                         [39m[1m[2m    2.99 kB[22m[1m[22m[2m │ gzip:   0.69 kB[22m
[2mdist/[22m[2massets/[22m[36mreal-cache-calc-BBi_nBnX.js                      [39m[1m[2m    3.25 kB[22m[1m[22m[2m │ gzip:   1.47 kB[22m
[2mdist/[22m[2massets/[22m[36mdate-picker-BayVkXuY.js                          [39m[1m[2m    3.27 kB[22m[1m[22m[2m │ gzip:   1.24 kB[22m
[2mdist/[22m[2massets/[22m[36mAcceptInvite-r_fp8Ftv.js                         [39m[1m[2m    3.78 kB[22m[1m[22m[2m │ gzip:   1.17 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaAssigneeAvatars-Crl83qFg.js                 [39m[1m[2m    3.80 kB[22m[1m[22m[2m │ gzip:   0.99 kB[22m
[2mdist/[22m[2massets/[22m[36mAdAccounts-Ls2PrVEb.js                           [39m[1m[2m    3.85 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36mcache-tab-total-D5L9cKp-.js                      [39m[1m[2m    4.35 kB[22m[1m[22m[2m │ gzip:   1.66 kB[22m
[2mdist/[22m[2massets/[22m[36mNewStaffDialog-uAlaKAnV.js                       [39m[1m[2m    4.35 kB[22m[1m[22m[2m │ gzip:   1.19 kB[22m
[2mdist/[22m[2massets/[22m[36mStatCard-DcHspymH.js                             [39m[1m[2m    4.35 kB[22m[1m[22m[2m │ gzip:   1.05 kB[22m
[2mdist/[22m[2massets/[22m[36mcsv-export-Bp8nlkXR.js                           [39m[1m[2m    4.39 kB[22m[1m[22m[2m │ gzip:   1.57 kB[22m
[2mdist/[22m[2massets/[22m[36mImageUploader-B2gmt9pS.js                        [39m[1m[2m    4.64 kB[22m[1m[22m[2m │ gzip:   1.48 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceNew-DtgUuryt.js                          [39m[1m[2m    4.76 kB[22m[1m[22m[2m │ gzip:   1.26 kB[22m
[2mdist/[22m[2massets/[22m[36museScenarioForecasts-MdrWuAbp.js                 [39m[1m[2m    4.77 kB[22m[1m[22m[2m │ gzip:   1.43 kB[22m
[2mdist/[22m[2massets/[22m[36mexport-ticket-office-settlement-pdf-Cg6LWSWu.js  [39m[1m[2m    5.00 kB[22m[1m[22m[2m │ gzip:   2.28 kB[22m
[2mdist/[22m[2massets/[22m[36mMeusChamados-CUb7j4_D.js                         [39m[1m[2m    5.21 kB[22m[1m[22m[2m │ gzip:   1.56 kB[22m
[2mdist/[22m[2massets/[22m[36mUserSettings-DTY9ceVQ.js                         [39m[1m[2m    5.40 kB[22m[1m[22m[2m │ gzip:   1.66 kB[22m
[2mdist/[22m[2massets/[22m[36minvoice-group-CyzCayZn.js                        [39m[1m[2m    5.43 kB[22m[1m[22m[2m │ gzip:   1.76 kB[22m
[2mdist/[22m[2massets/[22m[36mSimilarSuppliersNotice-btRhrZ1V.js               [39m[1m[2m    5.59 kB[22m[1m[22m[2m │ gzip:   1.83 kB[22m
[2mdist/[22m[2massets/[22m[36mpt-BR-Dh5EWHbw.js                                [39m[1m[2m    5.85 kB[22m[1m[22m[2m │ gzip:   2.10 kB[22m
[2mdist/[22m[2massets/[22m[36mpt-B3dxR9FF.js                                   [39m[1m[2m    5.97 kB[22m[1m[22m[2m │ gzip:   2.02 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierBankDetails-MhTxgR83.js                  [39m[1m[2m    5.99 kB[22m[1m[22m[2m │ gzip:   1.19 kB[22m
[2mdist/[22m[2massets/[22m[36mparse-ticketline-zone-xlsx-BcBXDVLy.js           [39m[1m[2m    6.86 kB[22m[1m[22m[2m │ gzip:   2.59 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoHome-CzD1wE3f.js                         [39m[1m[2m    6.94 kB[22m[1m[22m[2m │ gzip:   1.91 kB[22m
[2mdist/[22m[2massets/[22m[36mchart-1Mf5yrvc.js                                [39m[1m[2m    7.16 kB[22m[1m[22m[2m │ gzip:   2.18 kB[22m
[2mdist/[22m[2massets/[22m[36men-US-CpWK9ySR.js                                [39m[1m[2m    7.19 kB[22m[1m[22m[2m │ gzip:   2.47 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadoNovo-DT_iTa5Y.js                          [39m[1m[2m    7.28 kB[22m[1m[22m[2m │ gzip:   1.84 kB[22m
[2mdist/[22m[2massets/[22m[36museBPVersions-CXCxwzzQ.js                        [39m[1m[2m    7.53 kB[22m[1m[22m[2m │ gzip:   1.77 kB[22m
[2mdist/[22m[2massets/[22m[36mMinhasTarefas-VMddOJuR.js                        [39m[1m[2m    7.56 kB[22m[1m[22m[2m │ gzip:   2.15 kB[22m
[2mdist/[22m[2massets/[22m[36mDiagnosisTest-DaTzslTf.js                        [39m[1m[2m    7.77 kB[22m[1m[22m[2m │ gzip:   1.57 kB[22m
[2mdist/[22m[2massets/[22m[36mIbanDuplicates-9BL13jvM.js                       [39m[1m[2m    7.92 kB[22m[1m[22m[2m │ gzip:   2.04 kB[22m
[2mdist/[22m[2massets/[22m[36mFrentesPanel-DwyRZbUY.js                         [39m[1m[2m    8.06 kB[22m[1m[22m[2m │ gzip:   2.07 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSalesComparisonPage-BX2Z6rEk.js            [39m[1m[2m    8.17 kB[22m[1m[22m[2m │ gzip:   2.16 kB[22m
[2mdist/[22m[2massets/[22m[36mSimilarSuppliersReview-B1NS6vji.js               [39m[1m[2m    8.27 kB[22m[1m[22m[2m │ gzip:   1.98 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-format-DL_G7ZZj.js                         [39m[1m[2m    8.33 kB[22m[1m[22m[2m │ gzip:   2.52 kB[22m
[2mdist/[22m[2massets/[22m[36mAtividade-DvRj3Kn6.js                            [39m[1m[2m    8.36 kB[22m[1m[22m[2m │ gzip:   2.33 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoListShell-mL0plFwv.js                    [39m[1m[2m    8.66 kB[22m[1m[22m[2m │ gzip:   2.22 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSalesCurvePage-Bl47ize6.js                 [39m[1m[2m    8.68 kB[22m[1m[22m[2m │ gzip:   2.13 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategies-SWUSlHxN.js                           [39m[1m[2m    8.89 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mUploadCoalaFotos-Ct_fZgI6.js                     [39m[1m[2m    8.93 kB[22m[1m[22m[2m │ gzip:   2.11 kB[22m
[2mdist/[22m[2massets/[22m[36mFieldStaffSection-BBfbz1Q-.js                    [39m[1m[2m    9.38 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mimport-pl-xlsx-_mw7deKG.js                       [39m[1m[2m    9.39 kB[22m[1m[22m[2m │ gzip:   4.03 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAgingPage-BE6ikL9c.js                      [39m[1m[2m    9.42 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mFundHolderPicker-Dkmaz-NX.js                     [39m[1m[2m    9.59 kB[22m[1m[22m[2m │ gzip:   1.97 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountCategoriesPage-BouucfhM.js          [39m[1m[2m    9.59 kB[22m[1m[22m[2m │ gzip:   2.18 kB[22m
[2mdist/[22m[2massets/[22m[36mReportRevenueMixPage-oEIkRRFq.js                 [39m[1m[2m    9.94 kB[22m[1m[22m[2m │ gzip:   2.15 kB[22m
[2mdist/[22m[2massets/[22m[36museEventABScenarios-D2XD6ldB.js                  [39m[1m[2m   10.09 kB[22m[1m[22m[2m │ gzip:   3.72 kB[22m
[2mdist/[22m[2massets/[22m[36mReportMonthlyEvolutionPage-fpsnScRF.js           [39m[1m[2m   10.19 kB[22m[1m[22m[2m │ gzip:   2.11 kB[22m
[2mdist/[22m[2massets/[22m[36mBankLineDocumentsDialog-BqGdNE-0.js              [39m[1m[2m   10.22 kB[22m[1m[22m[2m │ gzip:   2.73 kB[22m
[2mdist/[22m[2massets/[22m[36mAuditDownloads-De2dzQ9u.js                       [39m[1m[2m   10.52 kB[22m[1m[22m[2m │ gzip:   2.19 kB[22m
[2mdist/[22m[2massets/[22m[36mReportOccupancyRatePage-lre08MfR.js              [39m[1m[2m   10.55 kB[22m[1m[22m[2m │ gzip:   2.31 kB[22m
[2mdist/[22m[2massets/[22m[36mCreatives-VoHHtMPX.js                            [39m[1m[2m   10.88 kB[22m[1m[22m[2m │ gzip:   2.37 kB[22m
[2mdist/[22m[2massets/[22m[36museCitySimulator-xS1oVWuo.js                     [39m[1m[2m   10.99 kB[22m[1m[22m[2m │ gzip:   3.61 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBudgetDeviationPage-BZzPmeyD.js            [39m[1m[2m   11.14 kB[22m[1m[22m[2m │ gzip:   2.56 kB[22m
[2mdist/[22m[2massets/[22m[36mReportTreasuryProjectionPage-CE5gfGkN.js         [39m[1m[2m   11.18 kB[22m[1m[22m[2m │ gzip:   2.52 kB[22m
[2mdist/[22m[2massets/[22m[36mUserActivityLog-D2MDUyP7.js                      [39m[1m[2m   11.21 kB[22m[1m[22m[2m │ gzip:   2.44 kB[22m
[2mdist/[22m[2massets/[22m[36mCardItemDocumentsField-Defbnu0q.js               [39m[1m[2m   11.47 kB[22m[1m[22m[2m │ gzip:   2.98 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSupplierConcentrationPage-DUY88vhv.js      [39m[1m[2m   11.48 kB[22m[1m[22m[2m │ gzip:   2.26 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSuppliersPage-CxNeCuLt.js                  [39m[1m[2m   11.82 kB[22m[1m[22m[2m │ gzip:   2.54 kB[22m
[2mdist/[22m[2massets/[22m[36mManualGaps-25UwexkR.js                           [39m[1m[2m   11.83 kB[22m[1m[22m[2m │ gzip:   2.61 kB[22m
[2mdist/[22m[2massets/[22m[36mLinkBpLineDialog-Cqr8UhLH.js                     [39m[1m[2m   11.84 kB[22m[1m[22m[2m │ gzip:   2.65 kB[22m
[2mdist/[22m[2massets/[22m[36mBlogList-BYeQEQDY.js                             [39m[1m[2m   11.85 kB[22m[1m[22m[2m │ gzip:   2.20 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadoDetail-B99u2198.js                        [39m[1m[2m   12.08 kB[22m[1m[22m[2m │ gzip:   2.85 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminPanel-vnH-C1AW.js                           [39m[1m[2m   12.10 kB[22m[1m[22m[2m │ gzip:   3.61 kB[22m
[2mdist/[22m[2massets/[22m[36mOnboarding-uLmvr2HM.js                           [39m[1m[2m   12.25 kB[22m[1m[22m[2m │ gzip:   2.81 kB[22m
[2mdist/[22m[2massets/[22m[36mReportProfitabilityPage-d00b60y7.js              [39m[1m[2m   12.32 kB[22m[1m[22m[2m │ gzip:   2.92 kB[22m
[2mdist/[22m[2massets/[22m[36mCrmDashboard-BFer4akZ.js                         [39m[1m[2m   12.38 kB[22m[1m[22m[2m │ gzip:   2.96 kB[22m
[2mdist/[22m[2massets/[22m[36mGoogleAdsAdmin-DlnMCeJF.js                       [39m[1m[2m   12.68 kB[22m[1m[22m[2m │ gzip:   2.43 kB[22m
[2mdist/[22m[2massets/[22m[36mPaginasList-B-3tuGDM.js                          [39m[1m[2m   12.99 kB[22m[1m[22m[2m │ gzip:   2.60 kB[22m
[2mdist/[22m[2massets/[22m[36mformat-CGtoj5si.js                               [39m[1m[2m   13.04 kB[22m[1m[22m[2m │ gzip:   3.48 kB[22m
[2mdist/[22m[2massets/[22m[36mEditCampaignPopover-gs7MW17l.js                  [39m[1m[2m   13.30 kB[22m[1m[22m[2m │ gzip:   3.24 kB[22m
[2mdist/[22m[2massets/[22m[36mReminders-BSoZ5oXO.js                            [39m[1m[2m   13.37 kB[22m[1m[22m[2m │ gzip:   2.90 kB[22m
[2mdist/[22m[2massets/[22m[36mSyncHealth-plbOq--A.js                           [39m[1m[2m   13.53 kB[22m[1m[22m[2m │ gzip:   2.43 kB[22m
[2mdist/[22m[2massets/[22m[36mEndossarEventoPage-CT3_xwtX.js                   [39m[1m[2m   13.69 kB[22m[1m[22m[2m │ gzip:   2.94 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPendencyIndexPage-C3tUyd-d.js              [39m[1m[2m   13.78 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencesList-DyOu4GDt.js                        [39m[1m[2m   13.94 kB[22m[1m[22m[2m │ gzip:   2.75 kB[22m
[2mdist/[22m[2massets/[22m[36mCategoryFormModal-Bdp_ZY5F.js                    [39m[1m[2m   14.10 kB[22m[1m[22m[2m │ gzip:   3.23 kB[22m
[2mdist/[22m[2massets/[22m[36mEndorsementEditor-Cun22c51.js                    [39m[1m[2m   14.25 kB[22m[1m[22m[2m │ gzip:   2.76 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencePreviewCount-DZHOHB8W.js                 [39m[1m[2m   14.30 kB[22m[1m[22m[2m │ gzip:   3.64 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceEditor-sYg07nXF.js                       [39m[1m[2m   14.68 kB[22m[1m[22m[2m │ gzip:   2.81 kB[22m
[2mdist/[22m[2massets/[22m[36mTrash-bLbzM7lx.js                                [39m[1m[2m   14.84 kB[22m[1m[22m[2m │ gzip:   3.13 kB[22m
[2mdist/[22m[2massets/[22m[36mNewEventoPage-SrRhwjsD.js                        [39m[1m[2m   14.95 kB[22m[1m[22m[2m │ gzip:   2.69 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPartnerExpensesPage-tv4OHPQL.js            [39m[1m[2m   14.96 kB[22m[1m[22m[2m │ gzip:   3.12 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadosList-CKDs9Nft.js                         [39m[1m[2m   15.43 kB[22m[1m[22m[2m │ gzip:   4.05 kB[22m
[2mdist/[22m[2massets/[22m[36mContactDetailsSheet-BzdFhI2T.js                  [39m[1m[2m   15.50 kB[22m[1m[22m[2m │ gzip:   2.67 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBI-9qUn7iI-.js                              [39m[1m[2m   15.53 kB[22m[1m[22m[2m │ gzip:   3.87 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantPendencies-CiL-FOdd.js                 [39m[1m[2m   15.57 kB[22m[1m[22m[2m │ gzip:   3.37 kB[22m
[2mdist/[22m[2massets/[22m[36mInvoiceGroupAudit-BvMZbLrf.js                    [39m[1m[2m   15.67 kB[22m[1m[22m[2m │ gzip:   3.19 kB[22m
[2mdist/[22m[2massets/[22m[36mRlsLegacyAudit-N84ZreFC.js                       [39m[1m[2m   15.77 kB[22m[1m[22m[2m │ gzip:   2.80 kB[22m
[2mdist/[22m[2massets/[22m[36mRaiseBudgetDialog-CLXg8wO_.js                    [39m[1m[2m   16.04 kB[22m[1m[22m[2m │ gzip:   3.48 kB[22m
[2mdist/[22m[2massets/[22m[36mEditFrenteSheet-FodLeyLa.js                      [39m[1m[2m   16.10 kB[22m[1m[22m[2m │ gzip:   3.43 kB[22m
[2mdist/[22m[2massets/[22m[36mPaginaEditor-B3YoYdrc.js                         [39m[1m[2m   16.52 kB[22m[1m[22m[2m │ gzip:   3.23 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyNew-CKxE6Bw-.js                          [39m[1m[2m   16.99 kB[22m[1m[22m[2m │ gzip:   3.99 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierTransactions-CEMtyRdP.js                 [39m[1m[2m   17.03 kB[22m[1m[22m[2m │ gzip:   3.59 kB[22m
[2mdist/[22m[2massets/[22m[36mPurchaseAudienceCard-DI2aMrAD.js                 [39m[1m[2m   17.26 kB[22m[1m[22m[2m │ gzip:   3.34 kB[22m
[2mdist/[22m[2massets/[22m[36mSetup-BhmHzISa.js                                [39m[1m[2m   17.43 kB[22m[1m[22m[2m │ gzip:   4.13 kB[22m
[2mdist/[22m[2massets/[22m[36mPessoaDetail-IVvHMy63.js                         [39m[1m[2m   17.78 kB[22m[1m[22m[2m │ gzip:   3.53 kB[22m
[2mdist/[22m[2massets/[22m[36mibantools--sXKtUqI.js                            [39m[1m[2m   18.29 kB[22m[1m[22m[2m │ gzip:   3.82 kB[22m
[2mdist/[22m[2massets/[22m[36mInvariantMonitor-BZUomXGs.js                     [39m[1m[2m   18.44 kB[22m[1m[22m[2m │ gzip:   3.35 kB[22m
[2mdist/[22m[2massets/[22m[36mClubeNewgang-dCPTgr5b.js                         [39m[1m[2m   18.69 kB[22m[1m[22m[2m │ gzip:   3.16 kB[22m
[2mdist/[22m[2massets/[22m[36mTerms-BozPiKPP.js                                [39m[1m[2m   18.88 kB[22m[1m[22m[2m │ gzip:   2.98 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREEmpresarialPage-Bw-AFoFu.js             [39m[1m[2m   18.92 kB[22m[1m[22m[2m │ gzip:   5.01 kB[22m
[2mdist/[22m[2massets/[22m[36mAbout-QOYkL3zp.js                                [39m[1m[2m   19.17 kB[22m[1m[22m[2m │ gzip:   2.88 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountCategories-BevvDSRy.js                    [39m[1m[2m   19.46 kB[22m[1m[22m[2m │ gzip:   3.75 kB[22m
[2mdist/[22m[2massets/[22m[36mNotifications-B0kpY0zw.js                        [39m[1m[2m   19.46 kB[22m[1m[22m[2m │ gzip:   2.58 kB[22m
[2mdist/[22m[2massets/[22m[36mQuotations-kQxilInT.js                           [39m[1m[2m   19.88 kB[22m[1m[22m[2m │ gzip:   3.82 kB[22m
[2mdist/[22m[2massets/[22m[36mEventImplementations-DSfVyzew.js                 [39m[1m[2m   20.02 kB[22m[1m[22m[2m │ gzip:   3.90 kB[22m
[2mdist/[22m[2massets/[22m[36mVideosList-CIm3a3v7.js                           [39m[1m[2m   20.25 kB[22m[1m[22m[2m │ gzip:   4.07 kB[22m
[2mdist/[22m[2massets/[22m[36mBlogEditor-Dw2oh2-V.js                           [39m[1m[2m   20.26 kB[22m[1m[22m[2m │ gzip:   3.85 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPartnerSettlementPage-DVhDxW6m.js          [39m[1m[2m   20.62 kB[22m[1m[22m[2m │ gzip:   3.90 kB[22m
[2mdist/[22m[2massets/[22m[36mPressList-CxbEapYZ.js                            [39m[1m[2m   21.47 kB[22m[1m[22m[2m │ gzip:   4.32 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDocumentPendencies-hO1KWRuV.js             [39m[1m[2m   21.79 kB[22m[1m[22m[2m │ gzip:   3.74 kB[22m
[2mdist/[22m[2massets/[22m[36mDuelView-D-k3jRJS.js                             [39m[1m[2m   21.93 kB[22m[1m[22m[2m │ gzip:   4.80 kB[22m
[2mdist/[22m[2massets/[22m[36mPortalSettings-BBlO_AiZ.js                       [39m[1m[2m   22.19 kB[22m[1m[22m[2m │ gzip:   4.13 kB[22m
[2mdist/[22m[2massets/[22m[36mparse-B9BIfq30.js                                [39m[1m[2m   22.36 kB[22m[1m[22m[2m │ gzip:   4.64 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteDetail-DwaEVJx6.js                         [39m[1m[2m   22.42 kB[22m[1m[22m[2m │ gzip:   4.53 kB[22m
[2mdist/[22m[2massets/[22m[36mEventosList-O_NRgHYO.js                          [39m[1m[2m   22.97 kB[22m[1m[22m[2m │ gzip:   3.79 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimEquipa-B317UMQD.js                        [39m[1m[2m   23.24 kB[22m[1m[22m[2m │ gzip:   4.97 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyNewDesign-BBuAYF4F.js                    [39m[1m[2m   23.58 kB[22m[1m[22m[2m │ gzip:   4.96 kB[22m
[2mdist/[22m[2massets/[22m[36mCreativeNew-DjcF-N_s.js                          [39m[1m[2m   24.31 kB[22m[1m[22m[2m │ gzip:   5.42 kB[22m
[2mdist/[22m[2massets/[22m[36mCampoView-Bzv3bRUB.js                            [39m[1m[2m   24.43 kB[22m[1m[22m[2m │ gzip:   5.28 kB[22m
[2mdist/[22m[2massets/[22m[36mReportCashFlowPage-Cwq696p8.js                   [39m[1m[2m   24.66 kB[22m[1m[22m[2m │ gzip:   4.50 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyPrint-wwsvzhYn.js                        [39m[1m[2m   24.94 kB[22m[1m[22m[2m │ gzip:   3.72 kB[22m
[2mdist/[22m[2massets/[22m[36mReportIvaAuditPage-LAbrrraB.js                   [39m[1m[2m   25.04 kB[22m[1m[22m[2m │ gzip:   4.81 kB[22m
[2mdist/[22m[2massets/[22m[36mCustomerMatchUpload-DKHzDJgK.js                  [39m[1m[2m   25.31 kB[22m[1m[22m[2m │ gzip:   4.15 kB[22m
[2mdist/[22m[2massets/[22m[36mpurify.es-8E279hYE.js                            [39m[1m[2m   25.61 kB[22m[1m[22m[2m │ gzip:   9.67 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyPlanCard-C0ZsCd5l.js                     [39m[1m[2m   25.70 kB[22m[1m[22m[2m │ gzip:   4.19 kB[22m
[2mdist/[22m[2massets/[22m[36mEventTrackersCard-C3hxJSav.js                    [39m[1m[2m   25.88 kB[22m[1m[22m[2m │ gzip:   4.40 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDailySalesPage-JurX4xN5.js                 [39m[1m[2m   26.20 kB[22m[1m[22m[2m │ gzip:   5.41 kB[22m
[2mdist/[22m[2massets/[22m[36mCardSessions-XclUdmp2.js                         [39m[1m[2m   26.49 kB[22m[1m[22m[2m │ gzip:   5.39 kB[22m
[2mdist/[22m[2massets/[22m[36mReconciliacaoBpTx-CHYcuBYJ.js                    [39m[1m[2m   27.23 kB[22m[1m[22m[2m │ gzip:   5.27 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapasList-BN3EohFN.js                           [39m[1m[2m   27.40 kB[22m[1m[22m[2m │ gzip:   6.96 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountingExport-DwzlozVR.js               [39m[1m[2m   28.02 kB[22m[1m[22m[2m │ gzip:   5.05 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaignFromScratch-CcN5Isz4.js                  [39m[1m[2m   28.24 kB[22m[1m[22m[2m │ gzip:   5.25 kB[22m
[2mdist/[22m[2massets/[22m[36mPixels-WyZz0b44.js                               [39m[1m[2m   28.78 kB[22m[1m[22m[2m │ gzip:   4.43 kB[22m
[2mdist/[22m[2massets/[22m[36mRecurringTransactions-BcYjZqzi.js                [39m[1m[2m   28.99 kB[22m[1m[22m[2m │ gzip:   5.03 kB[22m
[2mdist/[22m[2massets/[22m[36mContactosList-DrVrlFJi.js                        [39m[1m[2m   29.47 kB[22m[1m[22m[2m │ gzip:   5.78 kB[22m
[2mdist/[22m[2massets/[22m[36mUserManagement-XwGzMLRA.js                       [39m[1m[2m   30.33 kB[22m[1m[22m[2m │ gzip:   6.24 kB[22m
[2mdist/[22m[2massets/[22m[36mConnections-BcTBChij.js                          [39m[1m[2m   30.44 kB[22m[1m[22m[2m │ gzip:   6.42 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-revenue-basis-B0oHPTL3.js                  [39m[1m[2m   30.57 kB[22m[1m[22m[2m │ gzip:  10.47 kB[22m
[2mdist/[22m[2massets/[22m[36mFormalidadeAudit-CzZ4DDhI.js                     [39m[1m[2m   30.81 kB[22m[1m[22m[2m │ gzip:   5.55 kB[22m
[2mdist/[22m[2massets/[22m[36mLeadsList-B-mX8izy.js                            [39m[1m[2m   31.26 kB[22m[1m[22m[2m │ gzip:   5.02 kB[22m
[2mdist/[22m[2massets/[22m[36mDataEntryDialog-BmoLIOi_.js                      [39m[1m[2m   31.31 kB[22m[1m[22m[2m │ gzip:   6.24 kB[22m
[2mdist/[22m[2massets/[22m[36mReportArtistCache-BBfBwG6Z.js                    [39m[1m[2m   32.32 kB[22m[1m[22m[2m │ gzip:   8.50 kB[22m
[2mdist/[22m[2massets/[22m[36mInsights-C9gHr4eN.js                             [39m[1m[2m   32.39 kB[22m[1m[22m[2m │ gzip:   4.81 kB[22m
[2mdist/[22m[2massets/[22m[36mBolSync-CiQfVyYO.js                              [39m[1m[2m   32.63 kB[22m[1m[22m[2m │ gzip:   5.30 kB[22m
[2mdist/[22m[2massets/[22m[36mMetaCapiMonitor-BMQPiZhM.js                      [39m[1m[2m   32.68 kB[22m[1m[22m[2m │ gzip:   4.32 kB[22m
[2mdist/[22m[2massets/[22m[36mCartaoEquipa-CJzr0lHH.js                         [39m[1m[2m   32.79 kB[22m[1m[22m[2m │ gzip:   7.47 kB[22m
[2mdist/[22m[2massets/[22m[36mBatchPaymentModal-BAKLeNaL.js                    [39m[1m[2m   33.14 kB[22m[1m[22m[2m │ gzip:   8.38 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaSuppliersPanel-2q_EvG6m.js                  [39m[1m[2m   33.17 kB[22m[1m[22m[2m │ gzip:   4.50 kB[22m
[2mdist/[22m[2massets/[22m[36mIvaManagement-CSUpiunL.js                        [39m[1m[2m   33.91 kB[22m[1m[22m[2m │ gzip:   5.30 kB[22m
[2mdist/[22m[2massets/[22m[36mPrivacy-5wGgLbGu.js                              [39m[1m[2m   33.97 kB[22m[1m[22m[2m │ gzip:   4.94 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBIDetail-By3NgOJL.js                        [39m[1m[2m   34.46 kB[22m[1m[22m[2m │ gzip:   8.15 kB[22m
[2mdist/[22m[2massets/[22m[36mcalendar-B6DFXAGm.js                             [39m[1m[2m   35.01 kB[22m[1m[22m[2m │ gzip:  11.08 kB[22m
[2mdist/[22m[2massets/[22m[36mReportForecastPayablesPage-CQpweRen.js           [39m[1m[2m   35.60 kB[22m[1m[22m[2m │ gzip:   5.74 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketlineSync-DwB_OCi9.js                       [39m[1m[2m   35.67 kB[22m[1m[22m[2m │ gzip:   5.86 kB[22m
[2mdist/[22m[2massets/[22m[36mFunnelTest-BPWzQEVm.js                           [39m[1m[2m   36.39 kB[22m[1m[22m[2m │ gzip:   7.53 kB[22m
[2mdist/[22m[2massets/[22m[36mReportContasPagarPage-BPDVGlFj.js                [39m[1m[2m   37.30 kB[22m[1m[22m[2m │ gzip:   6.77 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactionDocumentsModal-BjQIq97o.js            [39m[1m[2m   37.37 kB[22m[1m[22m[2m │ gzip:   7.90 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREBrasilPage-CWBwj5bw.js                  [39m[1m[2m   37.63 kB[22m[1m[22m[2m │ gzip:   7.39 kB[22m
[2mdist/[22m[2massets/[22m[36mAudit-fsAT3m_e.js                                [39m[1m[2m   38.42 kB[22m[1m[22m[2m │ gzip:   6.62 kB[22m
[2mdist/[22m[2massets/[22m[36mDashboard-Cah6_2xn.js                            [39m[1m[2m   38.67 kB[22m[1m[22m[2m │ gzip:   7.62 kB[22m
[2mdist/[22m[2massets/[22m[36mBPPlanilha-FYnUW0bX.js                           [39m[1m[2m   39.46 kB[22m[1m[22m[2m │ gzip:  11.59 kB[22m
[2mdist/[22m[2massets/[22m[36mHelpCenter-Cx5p_mG0.js                           [39m[1m[2m   39.73 kB[22m[1m[22m[2m │ gzip:  12.09 kB[22m
[2mdist/[22m[2massets/[22m[36mCompanies-CXh39TfD.js                            [39m[1m[2m   40.64 kB[22m[1m[22m[2m │ gzip:   6.10 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteManage-DrmILsoE.js                         [39m[1m[2m   42.12 kB[22m[1m[22m[2m │ gzip:   6.95 kB[22m
[2mdist/[22m[2massets/[22m[36mmarked.esm-DiRRsLPS.js                           [39m[1m[2m   42.33 kB[22m[1m[22m[2m │ gzip:  12.79 kB[22m
[2mdist/[22m[2massets/[22m[36mMetaAudiencesList-8Ub_jyg0.js                    [39m[1m[2m   42.35 kB[22m[1m[22m[2m │ gzip:   6.49 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREPage-ClzlQMK2.js                        [39m[1m[2m   43.66 kB[22m[1m[22m[2m │ gzip:   8.62 kB[22m
[2mdist/[22m[2massets/[22m[36mReportMovementReconciliationPage-DvXxafXz.js     [39m[1m[2m   43.94 kB[22m[1m[22m[2m │ gzip:   7.86 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOfficeSettlementsOverview-BefMbX_N.js      [39m[1m[2m   44.47 kB[22m[1m[22m[2m │ gzip:   7.06 kB[22m
[2mdist/[22m[2massets/[22m[36mFeverSync-DHtht9aZ.js                            [39m[1m[2m   45.41 kB[22m[1m[22m[2m │ gzip:   8.38 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarim-Cgn4Wryl.js                              [39m[1m[2m   45.57 kB[22m[1m[22m[2m │ gzip:   7.36 kB[22m
[2mdist/[22m[2massets/[22m[36msortable.esm-CvbFPBOB.js                         [39m[1m[2m   45.88 kB[22m[1m[22m[2m │ gzip:  15.28 kB[22m
[2mdist/[22m[2massets/[22m[36mSecurityDashboard-BAtfC4XL.js                    [39m[1m[2m   46.25 kB[22m[1m[22m[2m │ gzip:   6.87 kB[22m
[2mdist/[22m[2massets/[22m[36mEquipaView-C05G0f-Q.js                           [39m[1m[2m   47.24 kB[22m[1m[22m[2m │ gzip:   8.13 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBPTransactionsPage-BR2r-TZS.js             [39m[1m[2m   47.25 kB[22m[1m[22m[2m │ gzip:   8.89 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantStandaloneInvoicesTab--9MAursA.js      [39m[1m[2m   50.33 kB[22m[1m[22m[2m │ gzip:  11.02 kB[22m
[2mdist/[22m[2massets/[22m[36mDatabaseBackups-DuimzWXg.js                      [39m[1m[2m   50.67 kB[22m[1m[22m[2m │ gzip:   8.60 kB[22m
[2mdist/[22m[2massets/[22m[36mZonasList-k1AaB2_v.js                            [39m[1m[2m   50.70 kB[22m[1m[22m[2m │ gzip:  10.04 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaDetail-DNMQs9c7.js                          [39m[1m[2m   50.74 kB[22m[1m[22m[2m │ gzip:   9.13 kB[22m
[2mdist/[22m[2massets/[22m[36mEventSimulatorDemo-CYhB8cHN.js                   [39m[1m[2m   50.84 kB[22m[1m[22m[2m │ gzip:   6.33 kB[22m
[2mdist/[22m[2massets/[22m[36mStandaloneInvoiceScanner-C_kf5Njp.js             [39m[1m[2m   51.64 kB[22m[1m[22m[2m │ gzip:  12.49 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPLPage-DfwpV7tf.js                         [39m[1m[2m   52.50 kB[22m[1m[22m[2m │ gzip:  10.35 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyRedesign-A5cSskv3.js                     [39m[1m[2m   52.60 kB[22m[1m[22m[2m │ gzip:   8.06 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBankStatementPage-WIhOpA83.js              [39m[1m[2m   52.93 kB[22m[1m[22m[2m │ gzip:  10.23 kB[22m
[2mdist/[22m[2massets/[22m[36mCreativeView-C-dBw7sB.js                         [39m[1m[2m   53.18 kB[22m[1m[22m[2m │ gzip:   8.04 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceGoogleAds-BPsbbfD_.js                    [39m[1m[2m   56.02 kB[22m[1m[22m[2m │ gzip:  10.02 kB[22m
[2mdist/[22m[2massets/[22m[36mReimbursements-D4KRKTfZ.js                       [39m[1m[2m   59.85 kB[22m[1m[22m[2m │ gzip:  11.28 kB[22m
[2mdist/[22m[2massets/[22m[36mRegistroFeed-BTnHpMEh.js                         [39m[1m[2m   65.39 kB[22m[1m[22m[2m │ gzip:  10.93 kB[22m
[2mdist/[22m[2massets/[22m[36mAdsInvoices-Cv6hX5U8.js                          [39m[1m[2m   67.05 kB[22m[1m[22m[2m │ gzip:  11.70 kB[22m
[2mdist/[22m[2massets/[22m[36mEvents-BUD9JWCz.js                               [39m[1m[2m   67.68 kB[22m[1m[22m[2m │ gzip:  11.97 kB[22m
[2mdist/[22m[2massets/[22m[36mReportTicketOfficeAuditPage-BF3WB_Tm.js          [39m[1m[2m   68.92 kB[22m[1m[22m[2m │ gzip:  11.52 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimItemAttachmentButton-BBgqej2I.js          [39m[1m[2m   69.22 kB[22m[1m[22m[2m │ gzip:  15.79 kB[22m
[2mdist/[22m[2massets/[22m[36mManualSync-BGdNVsJ6.js                           [39m[1m[2m   69.29 kB[22m[1m[22m[2m │ gzip:  22.05 kB[22m
[2mdist/[22m[2massets/[22m[36mEventCalendar-DRBO5yov.js                        [39m[1m[2m   69.55 kB[22m[1m[22m[2m │ gzip:  11.73 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBIEvent-jYM_wJ5h.js                         [39m[1m[2m   69.88 kB[22m[1m[22m[2m │ gzip:  12.41 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOfficeSettlementModal-B2t1_lmK.js          [39m[1m[2m   75.51 kB[22m[1m[22m[2m │ gzip:  13.45 kB[22m
[2mdist/[22m[2massets/[22m[36mSuppliers-BDlQE0hY.js                            [39m[1m[2m   78.22 kB[22m[1m[22m[2m │ gzip:  12.20 kB[22m
[2mdist/[22m[2massets/[22m[36minstallment-guard-CZkoEpeb.js                    [39m[1m[2m   82.82 kB[22m[1m[22m[2m │ gzip:  15.16 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantHome-BwE_foIJ.js                       [39m[1m[2m   84.56 kB[22m[1m[22m[2m │ gzip:  13.10 kB[22m
[2mdist/[22m[2massets/[22m[36mEventHub-DljPXyf1.js                             [39m[1m[2m   84.92 kB[22m[1m[22m[2m │ gzip:  13.86 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierFormModal-Dw4LuHMJ.js                    [39m[1m[2m   85.46 kB[22m[1m[22m[2m │ gzip:  18.66 kB[22m
[2mdist/[22m[2massets/[22m[36mCoalaSync-ClO8bjud.js                            [39m[1m[2m   87.33 kB[22m[1m[22m[2m │ gzip:  15.07 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencePrint-CtZoVWJn.js                        [39m[1m[2m   87.42 kB[22m[1m[22m[2m │ gzip:  11.00 kB[22m
[2mdist/[22m[2massets/[22m[36mAuditoriaContas-D1uduZC8.js                      [39m[1m[2m   91.98 kB[22m[1m[22m[2m │ gzip:  16.83 kB[22m
[2mdist/[22m[2massets/[22m[36mjszip.min-CnBbpjIO.js                            [39m[1m[2m   97.24 kB[22m[1m[22m[2m │ gzip:  30.05 kB[22m
[2mdist/[22m[2massets/[22m[36mFinancialAccounts-C1aOUhO1.js                    [39m[1m[2m  116.63 kB[22m[1m[22m[2m │ gzip:  18.14 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyView-DbmtNi7k.js                         [39m[1m[2m  122.01 kB[22m[1m[22m[2m │ gzip:  18.96 kB[22m
[2mdist/[22m[2massets/[22m[36mEventMarketingEditor-DWies1hX.js                 [39m[1m[2m  124.85 kB[22m[1m[22m[2m │ gzip:  18.21 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimSessionDetail-DL3MDHJu.js                 [39m[1m[2m  132.24 kB[22m[1m[22m[2m │ gzip:  23.47 kB[22m
[2mdist/[22m[2massets/[22m[36mBankReconciliation-l8dK1dty.js                   [39m[1m[2m  134.51 kB[22m[1m[22m[2m │ gzip:  26.75 kB[22m
[2mdist/[22m[2massets/[22m[36mCardSessionDetail-Br90ArfK.js                    [39m[1m[2m  147.32 kB[22m[1m[22m[2m │ gzip:  27.44 kB[22m
[2mdist/[22m[2massets/[22m[36mindex.es-DmsDyuHC.js                             [39m[1m[2m  150.74 kB[22m[1m[22m[2m │ gzip:  51.38 kB[22m
[2mdist/[22m[2massets/[22m[36mNewgangSite-CdCtcQnp.js                          [39m[1m[2m  151.22 kB[22m[1m[22m[2m │ gzip:  26.68 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPaymentListsPage-B1SNBP1A.js               [39m[1m[2m  199.69 kB[22m[1m[22m[2m │ gzip:  39.42 kB[22m
[2mdist/[22m[2massets/[22m[36mticket-office-settlement-form-8sci8OPs.js        [39m[1m[2m  199.94 kB[22m[1m[22m[2m │ gzip:  40.68 kB[22m
[2mdist/[22m[2massets/[22m[36mhtml2canvas.esm-CBrSDip1.js                      [39m[1m[2m  201.42 kB[22m[1m[22m[2m │ gzip:  47.70 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-supabase-3MT7AzyV.js                      [39m[1m[2m  209.56 kB[22m[1m[22m[2m │ gzip:  54.23 kB[22m
[2mdist/[22m[2massets/[22m[36mEventImplementationDetail-iEIChNJz.js            [39m[1m[2m  224.11 kB[22m[1m[22m[2m │ gzip:  36.29 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaigns-BjNJkr-s.js                            [39m[1m[2m  242.60 kB[22m[1m[22m[2m │ gzip:  42.67 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactions-BoN5E69k.js                         [39m[1m[2m  260.45 kB[22m[1m[22m[2m │ gzip:  46.59 kB[22m
[2mdist/[22m[2massets/[22m[36mEventSimulator-DRfs43pc.js                       [39m[1m[2m  285.61 kB[22m[1m[22m[2m │ gzip:  46.21 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOffices-Cdj6Lt_X.js                        [39m[1m[2m  316.46 kB[22m[1m[22m[2m │ gzip:  53.21 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactionEditModal-D0R-sYgN.js                 [39m[1m[2m  344.80 kB[22m[1m[22m[2m │ gzip:  59.56 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-pdf-Cg0OIXZi.js                           [39m[1m[2m  421.80 kB[22m[1m[22m[2m │ gzip: 137.18 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaignView-BHQHae1P.js                         [39m[1m[2m  436.20 kB[22m[1m[22m[2m │ gzip:  72.74 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-react-KQt1rZym.js                         [39m[1m[2m  438.02 kB[22m[1m[22m[2m │ gzip: 134.70 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-charts-CvYs9c1O.js                        [39m[1m[2m  448.41 kB[22m[1m[22m[2m │ gzip: 119.60 kB[22m
[2mdist/[22m[2massets/[22m[36mpdf-first-page-to-jpeg-M5CLsCvW.js               [39m[1m[2m  458.53 kB[22m[1m[22m[2m │ gzip: 135.85 kB[22m
[2mdist/[22m[2massets/[22m[36mEventForecast-DqqtPsS8.js                        [39m[1m[33m  744.08 kB[39m[22m[2m │ gzip: 128.71 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-ui-DC4k8uTt.js                            [39m[1m[33m1,068.27 kB[39m[22m[2m │ gzip: 220.41 kB[22m
[2mdist/[22m[2massets/[22m[36mEventDetail-gtTgfVDI.js                          [39m[1m[33m1,075.35 kB[39m[22m[2m │ gzip: 184.51 kB[22m
[2mdist/[22m[2massets/[22m[36mindex-BdPnv21N.js                                [39m[1m[33m1,198.73 kB[39m[22m[2m │ gzip: 265.26 kB[22m
[2mdist/[22m[2massets/[22m[36mheic2any-BcfgmVBS.js                             [39m[1m[33m1,352.85 kB[39m[22m[2m │ gzip: 341.38 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-xlsx-CIt_8dee.js                          [39m[1m[33m1,369.76 kB[39m[22m[2m │ gzip: 412.26 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-handsontable-CE0eIcQY.js                  [39m[1m[33m1,918.23 kB[39m[22m[2m │ gzip: 457.52 kB[22m
[2mdist/[22m[2massets/[22m[36mheic-to-lXPrQE7P.js                              [39m[1m[33m2,995.46 kB[39m[22m[2m │ gzip: 736.99 kB[22m
[32m✓ built in 53.87s[39m

PWA v1.3.0
mode      generateSW
precache  343 entries (24187.05 KiB)
files generated
  dist/sw.js
  dist/workbox-52dea471.js
Browserslist: browsers data (caniuse-lite) is 7 months old. Please run:
  npx update-browserslist-db@latest
  Why you should do it regularly: https://github.com/browserslist/update-db#readme
[1m[33m[plugin:vite:reporter][39m[22m [33m[plugin vite:reporter] 
(!) /tmp/issue333-head-9ggwlvqk/tree/src/lib/storage.ts is dynamically imported by /tmp/issue333-head-9ggwlvqk/tree/src/contexts/AuthContext.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/contexts/AuthContext.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/hooks/useCompany.ts but also statically imported by /tmp/issue333-head-9ggwlvqk/tree/src/components/BPNotesAttachmentsModal.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/CacheExtrasPanel.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/EntityDocumentsSection.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/EventABAttachmentsSection.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/EventClosingCosts.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/EventForecast.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/PartnerExtrasPanel.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/PaymentListReceipts.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/SupplierCreditsPanel.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/TicketOfficeSettlementModal.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/TransactionDocumentsModal.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/TransactionFormModal.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/bank/BankLineDocumentsDialog.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/camarim/CamarimItemAttachmentButton.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/camarim/CamarimItemModal.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/cards/NewCardExpenseModal.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/supplier-credits/NewSupplierCreditModal.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/components/supplier-credits/SupplierCreditsTab.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/pages/BankReconciliation.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/pages/EventImplementations.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/pages/PartnerEventDetail.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/pages/StandaloneInvoiceScanner.tsx, /tmp/issue333-head-9ggwlvqk/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx, dynamic import will not move module into another chunk.
[39m
[33m
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m

EXIT: 0

```
## /tmp/issue333-head-9ggwlvqk/deno.log

```text
COMMAND: /bin/deno check --no-remote --config deno-isolated.json supabase/functions/data-entry/handler.ts supabase/functions/standalone-attempt-333/index.ts supabase/functions/ingest-standalone-invoice/index.ts
[0m[32mCheck[0m supabase/functions/data-entry/handler.ts
[0m[32mCheck[0m supabase/functions/standalone-attempt-333/index.ts
[0m[32mCheck[0m supabase/functions/ingest-standalone-invoice/index.ts

EXIT: 0

```
## /tmp/issue333-head-9ggwlvqk/entry-chromium.log

```text
COMMAND: node /tmp/issue333-head-9ggwlvqk/tree/node_modules/vitest/vitest.mjs run --config docs/testes/issue333/vitest.entry.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-9ggwlvqk/tree[39m

 [32m✓[39m docs/testes/issue333/integrated/attempt-entry.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 1149[2mms[22m[39m
   [33m[2m✓[22m[39m Chromium cross-origin fetch performs actual OPTIONS then POST using candidate entry headers [33m 1074[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m7 passed[39m[22m[90m (7)[39m
[2m   Start at [22m 00:05:31
[2m   Duration [22m 2.00s[2m (transform 95ms, setup 0ms, collect 61ms, tests 1.15s, environment 0ms, prepare 400ms)[22m


EXIT: 0

```
## /tmp/issue333-head-9ggwlvqk/general.log

```text
COMMAND: node /tmp/issue333-head-9ggwlvqk/tree/node_modules/vitest/vitest.mjs run --config vitest.offline.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-9ggwlvqk/tree[39m

 [32m✓[39m src/lib/__tests__/postgrest-embeds.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 223[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-row-limit.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 230[2mms[22m[39m
 [32m✓[39m src/test/campaign-design-optional-roas.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 252[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/document-detect.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 1322[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 12°, centrado com erro < 3% [33m 409[2mms[22m[39m
 [32m✓[39m src/components/standalone/__tests__/StandaloneReservedExecution.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 217[2mms[22m[39m
 [32m✓[39m src/test/forecast-attachment-counts.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 393[2mms[22m[39m
   [33m[2m✓[22m[39m anexos do BP — uma leitura por evento (#269)[2m > [22m361 linhas → 1 pedido a event_forecast_attachments [33m 390[2mms[22m[39m
 [32m✓[39m src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx [2m([22m[2m9 tests[22m[2m)[22m[33m 640[2mms[22m[39m
 [32m✓[39m src/test/mobile-modal-dismiss.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 324[2mms[22m[39m
 [32m✓[39m src/pages/__tests__/ResetPassword.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 241[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/storage-multi-tenant.test.ts [2m([22m[2m14 tests[22m[2m)[22m[33m 1093[2mms[22m[39m
   [33m[2m✓[22m[39m multi-tenant storage helpers[2m > [22museSetActiveCompany limpa a cache do storage[2m > [22mdepois da troca, withCompanyPath prefixa com a empresa nova [33m 1081[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/overlay-layer.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 543[2mms[22m[39m
   [33m[2m✓[22m[39m pilha de camadas — aninhamentos reais[2m > [22m#260 classificação acima da Nova Transação recebe foco e confirma escolha [33m 390[2mms[22m[39m
 [32m✓[39m src/components/__tests__/EventABTab.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[33m 436[2mms[22m[39m
 [32m✓[39m src/test/club-config-integration.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[33m 811[2mms[22m[39m
   [33m[2m✓[22m[39m #327 integration without network[2m > [22mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa [33m 393[2mms[22m[39m
 [32m✓[39m src/test/event-financial-card-render-loop.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 1114[2mms[22m[39m
   [33m[2m✓[22m[39m EventFinancialCard — sem ciclo de redesenho (#269)[2m > [22mchama onEbitdaParcelsChange uma única vez com queries vazias [33m 1111[2mms[22m[39m
 [32m✓[39m src/components/data-entry/__tests__/DataEntryDialog.test.tsx [2m([22m[2m13 tests[22m[2m)[22m[33m 3017[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução não validada: prévia visível, botão desativado mesmo após confirmação [33m 473[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mretoma nunca declara sucesso por cache; repõe campos, lê check, sem commit [33m 340[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-handler.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 180[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/no-direct-transaction-document-remove.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 132[2mms[22m[39m
 [32m✓[39m src/test/newgang-wallet-google.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 228[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-guards-f2b.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 138[2mms[22m[39m
 [32m✓[39m src/test/edge-fn-guard.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 92[2mms[22m[39m
 [32m✓[39m src/components/__tests__/LinkBpLineDialog-layer.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 206[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-statement-documents.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[32m 167[2mms[22m[39m
 [32m✓[39m src/test/require-feature.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 210[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-percentage.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 91[2mms[22m[39m
 [32m✓[39m src/test/similar-suppliers-notice.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 76[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-properties.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 108[2mms[22m[39m
 [32m✓[39m src/test/consent-contract-322.test.ts [2m([22m[2m38 tests[22m[2m)[22m[32m 116[2mms[22m[39m
 [32m✓[39m src/test/approve-lock-and-core.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-view.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 80[2mms[22m[39m
 [32m✓[39m src/test/newgang-content.test.tsx [2m([22m[2m2 tests[22m[2m)[22m[32m 120[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-pdf.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 106[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-statement-doc.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 161[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-card-date.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 83[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-scope.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 191[2mms[22m[39m
 [32m✓[39m src/components/__tests__/StatCard.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [32m✓[39m src/components/__tests__/EventStatusBadge.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 73[2mms[22m[39m
 [32m✓[39m src/test/camarim-session-pdf-sanitize.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 118[2mms[22m[39m
 [32m✓[39m src/test/event-financials-invalidation.test.tsx [2m([22m[2m8 tests[22m[2m)[22m[32m 97[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/google-click-match.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 85[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-full-suite.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-report.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m src/test/newgang-welcome-once.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 51[2mms[22m[39m
 [32m✓[39m src/test/standalone-compat-prepared.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 61[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-capacity.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/components/TicketOfficePositionCards.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[32m 110[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-formula.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 72[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-attempt-routing.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/test/song-link-ssr.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m src/lib/cost-center-map.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/statement-grouping.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/validations.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-large-tables-mirror.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 72[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-disbursement.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-capabilities.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ebitda.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 83[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/help-manual-parser.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 75[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-settlement-engine.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 120[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-partner-mirror.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-version-multi-diff.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/supplier-credits.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-read-layer.test.ts [2m([22m[2m28 tests[22m[2m | [22m[33m7 skipped[39m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/test/supplier-similarity.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/data-entry-contract.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-sync.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m src/test/newgang-missions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-turns.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-line-review.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m src/test/transaction-duplicate-check.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-photos.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tour-cache-sync.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/test/bol-m2-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/newgang-strict-audience-delivery.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-participants.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/newgang-wallet-levels.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/refund-grouping.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-calc.test.ts [2m([22m[2m35 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-cash-preview.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/multi-day-ticketing.test.ts [2m([22m[2m25 tests[22m[2m | [22m[33m4 skipped[39m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/utils.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-boost.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/split-adjustment.test.ts [2m([22m[2m37 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m src/lib/sepa/bank-execution.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-settlement-calc.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/test/contactos-list-paging.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/overhead-proration.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-seal.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/iva.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/test/bol-daily-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-undo.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-elasticity.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ads-tour-split.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-videos.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/test/capi-diag-no-secrets.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-per-company.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-tx-matching.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-nature.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/components/__tests__/bp-installments.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-perimeter.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/club-config-source.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/test/derp248-tiktok-event-trackers.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/test/capi-p1-guard.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-bp-rules.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-calc.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-revenue-single-rule.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-settlement-internal-report.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/test/newgang-crews.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis-tour.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/creative-media.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal-bundle.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/test/silent-writes.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-gating.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/simulator-prior-curve.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/income-tax-out-of-event-result.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/fecho-preconditions.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/ticketline-import-format-transition.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/test/newgang-history.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/test/crm-audience-live-count.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-revenue-basis.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-tab-total.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-revenue.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-reconciliation.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/report-event-cost.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/test/payment-method-domain.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/real-cache-deductions.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/transitory-transactions.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/crm-ingest-no-network.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-capacities.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/test/operation-key-domain.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-rebill-vat.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-ab-scale.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-rounding.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-integrate.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-doc-text.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-edit-diff.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/test/partner-statement-cards.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-capability-proposal.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/master-adopted-expense-proration.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-category.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-extras-union-148.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-on-sale.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/check-deploy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/payment-settlement.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/crm/creativeReelsCheck.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/pl-category-matching.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/newgang-profile-country.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/memory-index.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/payment-list-revalidate.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/components/__tests__/PasswordStrengthIndicator.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/dre-nature-divergence.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-effective-open.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/accountant-account-filter.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-invoices.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/test/format-integer-conversions.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-line-required.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/account-balance-settling.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-guards-proof.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-position.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-extras-kind.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/session-copy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-eligible.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m src/test/transaction-edit-modal-operation-key.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/coala-centro-custo-norm.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-planilha-version.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-realized.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/audit.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 4[2mms[22m[39m
[90mstdout[2m | src/lib/__tests__/card-session-theoretical.test.ts[2m > [22m[2m#275 saldo teórico da sessão = fecho[2m > [22m[2msem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[22m[39m[#275] teórico = 636.68 esperado = 636.68

 [32m✓[39m src/lib/__tests__/card-session-theoretical.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/example.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [2m[90m↓[39m[22m src/test/partner-statement-edge.test.ts [2m([22m[2m1 test[22m[2m | [22m[33m1 skipped[39m[2m)[22m

[2m Test Files [22m [1m[32m170 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (171)[39m
[2m      Tests [22m [1m[32m1373 passed[39m[22m[2m | [22m[33m1 skipped[39m[2m | [22m[90m11 todo[39m[90m (1385)[39m
[2m   Start at [22m 00:05:34
[2m   Duration [22m 92.10s[2m (transform 14.57s, setup 171.12s, collect 142.12s, tests 16.18s, environment 770.35s, prepare 132.86s)[22m

[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mEsc não fecha o modal sob outra janela
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mDialog separa cabeçalho e corpo e mantém o X fora do scroll
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/pages/__tests__/ResetPassword.test.tsx[2m > [22m[2mResetPassword — token_hash flow[2m > [22m[2m(a) não chama verifyOtp ao montar; só ao clicar Continuar
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

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

[90mstderr[2m | src/test/club-config-integration.test.tsx[2m > [22m[2m#327 integration without network[2m > [22m[2mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/components/__tests__/EventABTab.test.tsx[2m > [22m[2mEventABTab — UI smoke tests[2m > [22m[2mrenderiza sem crashar e mostra labels/inputs das zonas
[22m[39mWarning: Input contains an input of type undefined with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://reactjs.org/link/controlled-components
    at input
    at /tmp/issue333-head-9ggwlvqk/tree/src/components/ui/input.tsx:8:6
    at div
    at div
    at /tmp/issue333-head-9ggwlvqk/tree/src/components/ui/card.tsx:38:6
    at div
    at /tmp/issue333-head-9ggwlvqk/tree/src/components/ui/card.tsx:7:50
    at div
    at EventABTab (/tmp/issue333-head-9ggwlvqk/tree/src/components/EventABTab.tsx:151:23)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
    at Router (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1207:17)
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/lib/__tests__/permissions-guards-f2b.test.tsx[2m > [22m[2m#311 F2b — guardas por permissão[2m > [22m[2mmanager com excepção module.crm entra em /crm e vê o cartão CRM activo
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/test/require-feature.test.tsx[2m > [22m[2mvisibilidade por company_features[2m > [22m[2mrota bloqueada sem a chave
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mconsent: timeout da RPC → 503 bloqueado
[22m[39m[portal-track] consent rpc threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mbind falha (throw): lead entra sem ids Meta
[22m[39m[portal-track] consent bind threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2minsert falha → 500 (sem falso sucesso)
[22m[39m[portal-track] insert lead_capture [33m500[39m

[90mstderr[2m | src/lib/__tests__/cache-scope.test.tsx[2m > [22m[2mecrã do subevento usa a configuração do Master[2m > [22m[2mmostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

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


EXIT: 0

```
## /tmp/issue333-head-9ggwlvqk/head-integration.log

```text
COMMAND: node /tmp/issue333-head-9ggwlvqk/tree/node_modules/vitest/vitest.mjs run --config docs/testes/issue333/vitest.head.config.ts --reporter=default --reporter=json --outputFile=/tmp/issue333-head-9ggwlvqk/head-results.json

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-9ggwlvqk/tree[39m

 [32m✓[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m23 tests[22m[2m)[22m[33m 5314[2mms[22m[39m
   [33m[2m✓[22m[39m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter [33m 483[2mms[22m[39m
   [33m[2m✓[22m[39m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud [33m 1374[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m23 passed[39m[22m[90m (23)[39m
[2m   Start at [22m 00:05:13
[2m   Duration [22m 7.40s[2m (transform 518ms, setup 59ms, collect 954ms, tests 5.31s, environment 465ms, prepare 323ms)[22m

JSON report written to /tmp/issue333-head-9ggwlvqk/head-results.json
[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mreal DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mactual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mactual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[22m[39mWarning: An update to AccountantStandaloneInvoicesTab inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-9ggwlvqk/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)

[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mactual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[22m[39mWarning: An update to Select inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at Select (file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:42:5)
    at div
    at div
    at div
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-9ggwlvqk/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
Warning: An update to SelectItemText inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:901:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:39:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:800:7
    at /tmp/issue333-head-9ggwlvqk/tree/src/components/ui/select.tsx:158:56
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:711:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:256:58
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/dist/index.mjs:11:22
    at SelectPortal
    at /tmp/issue333-head-9ggwlvqk/tree/src/components/ui/select.tsx:92:59
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at CollectionProvider (file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:17:13)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-popper/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Popper (file:///dev-server/node_modules/@radix-ui/react-popper/dist/index.mjs:30:11)
    at Select (file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:42:5)
    at div
    at div
    at div
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-9ggwlvqk/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
Warning: An update to SelectItemText inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:901:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:39:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:800:7
    at /tmp/issue333-head-9ggwlvqk/tree/src/components/ui/select.tsx:158:56
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:711:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:256:58
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/dist/index.mjs:11:22
    at SelectPortal
    at /tmp/issue333-head-9ggwlvqk/tree/src/components/ui/select.tsx:92:59
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at CollectionProvider (file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:17:13)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-popper/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Popper (file:///dev-server/node_modules/@radix-ui/react-popper/dist/index.mjs:30:11)
    at Select (file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:42:5)
    at div
    at div
    at div
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-9ggwlvqk/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
Warning: An update to Select inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at Select (file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:42:5)
    at div
    at div
    at div
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-9ggwlvqk/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
Warning: An update to SelectItemText inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:901:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:39:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:800:7
    at /tmp/issue333-head-9ggwlvqk/tree/src/components/ui/select.tsx:158:56
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:711:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:256:58
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/dist/index.mjs:11:22
    at SelectPortal
    at /tmp/issue333-head-9ggwlvqk/tree/src/components/ui/select.tsx:92:59
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at CollectionProvider (file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:17:13)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-popper/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Popper (file:///dev-server/node_modules/@radix-ui/react-popper/dist/index.mjs:30:11)
    at Select (file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:42:5)
    at div
    at div
    at div
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-9ggwlvqk/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
Warning: An update to SelectItemText inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:901:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:39:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:800:7
    at /tmp/issue333-head-9ggwlvqk/tree/src/components/ui/select.tsx:158:56
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:711:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:256:58
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/dist/index.mjs:11:22
    at SelectPortal
    at /tmp/issue333-head-9ggwlvqk/tree/src/components/ui/select.tsx:92:59
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at CollectionProvider (file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:17:13)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-popper/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Popper (file:///dev-server/node_modules/@radix-ui/react-popper/dist/index.mjs:30:11)
    at Select (file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:42:5)
    at div
    at div
    at div
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-9ggwlvqk/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)


EXIT: 0

```
## /tmp/issue333-head-9ggwlvqk/pg-attempts.log

```text
COMMAND: node /tmp/issue333-head-9ggwlvqk/tree/node_modules/vitest/vitest.mjs run --config head.pg.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-9ggwlvqk/tree[39m

 [32m✓[39m docs/testes/issue333/pg/attempts-pg.test.ts [2m([22m[2m31 tests[22m[2m)[22m[33m 2436[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m31 passed[39m[22m[90m (31)[39m
[2m   Start at [22m 00:05:28
[2m   Duration [22m 2.94s[2m (transform 72ms, setup 0ms, collect 88ms, tests 2.44s, environment 0ms, prepare 232ms)[22m


EXIT: 0

```
## /tmp/issue333-head-9ggwlvqk/tsgo.log

```text
COMMAND: /node_modules/.bin/tsgo -p tsconfig.app.json --noEmit

EXIT: 0

```
## /tmp/issue333-head-9ggwlvqk/ui-client.log

```text
COMMAND: node /tmp/issue333-head-9ggwlvqk/tree/node_modules/vitest/vitest.mjs run src/components/data-entry/__tests__/DataEntryDialog.test.tsx src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx src/lib/__tests__/standalone-attempt-routing.test.ts src/lib/__tests__/standalone-capabilities.test.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-9ggwlvqk/tree[39m

 [32m✓[39m src/lib/__tests__/standalone-attempt-routing.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-capabilities.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx [2m([22m[2m9 tests[22m[2m)[22m[33m 488[2mms[22m[39m
 [32m✓[39m src/components/data-entry/__tests__/DataEntryDialog.test.tsx [2m([22m[2m13 tests[22m[2m)[22m[33m 2606[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22meditar depois da prévia exige nova prévia/hash antes de executar [33m 305[2mms[22m[39m

[2m Test Files [22m [1m[32m4 passed[39m[22m[90m (4)[39m
[2m      Tests [22m [1m[32m44 passed[39m[22m[90m (44)[39m
[2m   Start at [22m 00:05:21
[2m   Duration [22m 6.55s[2m (transform 738ms, setup 1.16s, collect 2.22s, tests 3.14s, environment 6.98s, prepare 1.83s)[22m

[90mstderr[2m | src/components/data-entry/__tests__/DataEntryDialog.test.tsx[2m > [22m[2m#333 DataEntryDialog[2m > [22m[2mendpoint ausente: mostra indisponível e não oferece ações
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.


EXIT: 0

```
## /tmp/issue333-head-_bgj3d4v/head-integration.log

```text
COMMAND: node /tmp/issue333-head-_bgj3d4v/tree/node_modules/vitest/vitest.mjs run --config docs/testes/issue333/vitest.head.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-_bgj3d4v/tree[39m

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m6 tests[22m[2m | [22m[33m6 skipped[39m[2m)[22m[32m 14[2mms[22m[39m
   [2m[90m↓[39m[22m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit
   [2m[90m↓[39m[22m no authorization/stale preview/foreign owner and tenant cannot create an invoice
   [2m[90m↓[39m[22m lost commit response and failed read-only check preserve candidate; recovery reads one effect
   [2m[90m↓[39m[22m two SQL connections at real row lock: one effect; gate closing while waiting denies commit
   [2m[90m↓[39m[22m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review
   [2m[90m↓[39m[22m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [33m6 skipped[39m[90m (6)[39m
[2m   Start at [22m 23:42:46
[2m   Duration [22m 2.10s[2m (transform 327ms, setup 124ms, collect 808ms, tests 14ms, environment 606ms, prepare 325ms)[22m


[31m⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Suites 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m [ docs/testes/issue333/head/flows.test.tsx ][22m
[31m[1mError[22m: Local multipart fixture missing[39m
[36m [2m❯[22m docs/testes/issue333/head/flows.test.tsx:[2m80:56[22m[39m


[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


EXIT: 1

```
## /tmp/issue333-head-flk6dhpf/head-integration.log

```text
COMMAND: node /tmp/issue333-head-flk6dhpf/tree/node_modules/vitest/vitest.mjs run --config docs/testes/issue333/vitest.head.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-flk6dhpf/tree[39m

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m18 tests[22m[2m | [22m[31m2 failed[39m[2m)[22m[33m 4896[2mms[22m[39m
   [32m✓[39m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit[32m 125[2mms[22m[39m
   [32m✓[39m no authorization/stale preview/foreign owner and tenant cannot create an invoice[32m 52[2mms[22m[39m
   [32m✓[39m lost commit response and failed read-only check preserve candidate; recovery reads one effect[32m 58[2mms[22m[39m
   [32m✓[39m two SQL connections at real row lock: one effect; gate closing while waiting denies commit[32m 241[2mms[22m[39m
   [32m✓[39m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review[32m 93[2mms[22m[39m
   [33m[2m✓[22m[39m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter [33m 455[2mms[22m[39m
   [32m✓[39m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice[32m 163[2mms[22m[39m
   [32m✓[39m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again[32m 34[2mms[22m[39m
   [32m✓[39m lost response after reserve preserves bytes and destination; recovery is read-only[32m 10[2mms[22m[39m
   [32m✓[39m lost response after upload preserves bytes and destination; recovery is read-only[32m 11[2mms[22m[39m
   [32m✓[39m lost response after receipt preserves bytes and destination; recovery is read-only[32m 12[2mms[22m[39m
   [32m✓[39m lost response after commit preserves bytes and destination; recovery is read-only[32m 17[2mms[22m[39m
   [32m✓[39m lost response after check preserves bytes and destination; recovery is read-only[32m 21[2mms[22m[39m
   [32m✓[39m real SQL rollback after mutation before audit leaves zero effect and persistent reservation[32m 14[2mms[22m[39m
   [32m✓[39m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice[32m 28[2mms[22m[39m
[31m   [31m×[31m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced[39m[32m 21[2mms[22m[39m
[31m     → expected 'FT01/23' to be 'ft01/23' // Object.is equality[39m
   [32m✓[39m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects[32m 39[2mms[22m[39m
[31m   [31m×[31m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud[39m[33m 1564[2mms[22m[39m
[31m     → expected [ 'POST' ] to deeply equal [ 'OPTIONS', 'POST' ][39m

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m2 failed[39m[22m[2m | [22m[1m[32m16 passed[39m[22m[90m (18)[39m
[2m   Start at [22m 23:46:38
[2m   Duration [22m 7.16s[2m (transform 545ms, setup 98ms, collect 1.10s, tests 4.90s, environment 510ms, prepare 311ms)[22m

[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mreal DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.


[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 2 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m > [22mSQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced
[31m[1mAssertionError[22m: expected 'FT01/23' to be 'ft01/23' // Object.is equality[39m

Expected: [32m"[7mft[27m01/23"[39m
Received: [31m"[7mFT[27m01/23"[39m

[36m [2m❯[22m docs/testes/issue333/head/flows.test.tsx:[2m241:199[22m[39m


[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯[22m[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m > [22mChromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud
[31m[1mAssertionError[22m: expected [ 'POST' ] to deeply equal [ 'OPTIONS', 'POST' ][39m

[32m- Expected[39m
[31m+ Received[39m

[2m  [[22m
[32m-   "OPTIONS",[39m
[2m    "POST",[22m
[2m  ][22m

[36m [2m❯[22m docs/testes/issue333/head/flows.test.tsx:[2m263:324[22m[39m


[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯[22m[39m


EXIT: 1

```
## /tmp/issue333-head-k6zgv6r8/head-integration.log

```text
COMMAND: node /tmp/issue333-head-k6zgv6r8/tree/node_modules/vitest/vitest.mjs run --config docs/testes/issue333/vitest.head.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-k6zgv6r8/tree[39m

[90mstdout[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mnew intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review
[22m[39mattempt diagnostic {"status":"pendente","attempt":{"id":"e7856a19-e593-48e6-bae4-6300d46d14c6","hash":"3f54939308ef8f01486b71699af853250dc0ab275cf091093032b4b75dbd7e2f","path":"11111111-1111-4111-8111-111111111111/attempt333/e7856a19-e593-48e6-bae4-6300d46d14c6/f5a2c99030c36b668c72dcd5fc3c3023cdd6f0a4ea9dc863c2bb59ceed6881c8.pdf","state":"authorized","result":null,"current":null,"document":{"mime":"application/pdf","sha256":"f5a2c99030c36b668c72dcd5fc3c3023cdd6f0a4ea9dc863c2bb59ceed6881c8","size_bytes":272},"record_ok":false,"intent_seq":1,"review_reason":null,"destination_id":"9a0e8341-9551-4c16-8cd1-7e20bb9307e1","prior_attempt_id":null}}

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m6 tests[22m[2m | [22m[31m2 failed[39m[2m)[22m[33m 2278[2mms[22m[39m
[31m   [31m×[31m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit[39m[32m 114[2mms[22m[39m
[31m     → expected Uint8Array[ 37, 80, 68, 70, 45, …(224) ] to deeply equal Uint8Array[ 37, 80, 68, 70, 45, …(224) ][39m
   [32m✓[39m no authorization/stale preview/foreign owner and tenant cannot create an invoice[32m 51[2mms[22m[39m
   [32m✓[39m lost commit response and failed read-only check preserve candidate; recovery reads one effect[32m 57[2mms[22m[39m
   [32m✓[39m two SQL connections at real row lock: one effect; gate closing while waiting denies commit[32m 226[2mms[22m[39m
[31m   [31m×[31m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review[39m[32m 11[2mms[22m[39m
[31m     → expected 'pendente' to be 'conferido' // Object.is equality[39m
   [33m[2m✓[22m[39m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter [33m 368[2mms[22m[39m

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m2 failed[39m[22m[2m | [22m[1m[32m4 passed[39m[22m[90m (6)[39m
[2m   Start at [22m 23:43:20
[2m   Duration [22m 3.71s[2m (transform 224ms, setup 70ms, collect 574ms, tests 2.28s, environment 375ms, prepare 228ms)[22m

[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mreal DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.


[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 2 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m > [22mreal handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit
[31m[1mAssertionError[22m: expected Uint8Array[ 37, 80, 68, 70, 45, …(224) ] to deeply equal Uint8Array[ 37, 80, 68, 70, 45, …(224) ][39m

[2mCompared values have no visual difference.[22m

[36m [2m❯[22m docs/testes/issue333/head/flows.test.tsx:[2m94:143[22m[39m


[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯[22m[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m > [22mnew intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review
[31m[1mAssertionError[22m: expected 'pendente' to be 'conferido' // Object.is equality[39m

Expected: [32m"conferido"[39m
Received: [31m"pendente"[39m

[36m [2m❯[22m docs/testes/issue333/head/flows.test.tsx:[2m124:208[22m[39m


[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯[22m[39m


EXIT: 1

```
## /tmp/issue333-head-ni5m1k4u/head-integration.log

```text
COMMAND: node /tmp/issue333-head-ni5m1k4u/tree/node_modules/vitest/vitest.mjs run --config docs/testes/issue333/vitest.head.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-ni5m1k4u/tree[39m

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m6 tests[22m[2m | [22m[31m5 failed[39m[2m)[22m[33m 2497[2mms[22m[39m
[31m   [31m×[31m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit[39m[32m 98[2mms[22m[39m
[31m     → expected 400 to be 200 // Object.is equality[39m
[31m   [31m×[31m no authorization/stale preview/foreign owner and tenant cannot create an invoice[39m[32m 19[2mms[22m[39m
[31m     → expected 400 to be 200 // Object.is equality[39m
[31m   [31m×[31m lost commit response and failed read-only check preserve candidate; recovery reads one effect[39m[32m 19[2mms[22m[39m
[31m     → expected 400 to be 200 // Object.is equality[39m
   [32m✓[39m two SQL connections at real row lock: one effect; gate closing while waiting denies commit[32m 277[2mms[22m[39m
[31m   [31m×[31m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review[39m[32m 23[2mms[22m[39m
[31m     → expected 'pendente' to be 'conferido' // Object.is equality[39m
[31m   [31m×[31m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter[39m[32m 1[2mms[22m[39m
[31m     → React is not defined[39m

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m5 failed[39m[22m[2m | [22m[1m[32m1 passed[39m[22m[90m (6)[39m
[2m   Start at [22m 23:42:04
[2m   Duration [22m 4.37s[2m (transform 332ms, setup 109ms, collect 751ms, tests 2.50s, environment 538ms, prepare 233ms)[22m


[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 5 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m > [22mreal handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit
[31m[1mAssertionError[22m: expected 400 to be 200 // Object.is equality[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- 200[39m
[31m+ 400[39m

[36m [2m❯[22m prepare docs/testes/issue333/head/flows.test.tsx:[2m67:160[22m[39m
    [90m 65| [39m  [35mconst[39m s[33m=[39m[35mawait[39m ([35mawait[39m [34mcall[39m({action[33m:[39m[32m"session"[39m}))[33m.[39m[34mjson[39m()[33m;[39m
    [90m 66| [39m  const form=new FormData();form.set("session_id",s.session.id);form.s…
    [90m 67| [39m  const upload=await handler(new Request("http://local.fixture",{metho…
    [90m   | [39m                                                                                                                                                               [31m^[39m
    [90m 68| [39m  const doc=await upload.json(), f=fields();const r=await call({action…
    [90m 69| [39m  [35mreturn[39m {s[33m,[39mdoc[33m,[39mf[33m,[39mp[33m:[39m[35mawait[39m r[33m.[39m[34mjson[39m()}[33m;[39m
[90m [2m❯[22m docs/testes/issue333/head/flows.test.tsx:[2m88:11[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯[22m[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m > [22mno authorization/stale preview/foreign owner and tenant cannot create an invoice
[31m[1mAssertionError[22m: expected 400 to be 200 // Object.is equality[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- 200[39m
[31m+ 400[39m

[36m [2m❯[22m prepare docs/testes/issue333/head/flows.test.tsx:[2m67:160[22m[39m
    [90m 65| [39m  [35mconst[39m s[33m=[39m[35mawait[39m ([35mawait[39m [34mcall[39m({action[33m:[39m[32m"session"[39m}))[33m.[39m[34mjson[39m()[33m;[39m
    [90m 66| [39m  const form=new FormData();form.set("session_id",s.session.id);form.s…
    [90m 67| [39m  const upload=await handler(new Request("http://local.fixture",{metho…
    [90m   | [39m                                                                                                                                                               [31m^[39m
    [90m 68| [39m  const doc=await upload.json(), f=fields();const r=await call({action…
    [90m 69| [39m  [35mreturn[39m {s[33m,[39mdoc[33m,[39mf[33m,[39mp[33m:[39m[35mawait[39m r[33m.[39m[34mjson[39m()}[33m;[39m
[90m [2m❯[22m docs/testes/issue333/head/flows.test.tsx:[2m97:11[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯[22m[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m > [22mlost commit response and failed read-only check preserve candidate; recovery reads one effect
[31m[1mAssertionError[22m: expected 400 to be 200 // Object.is equality[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- 200[39m
[31m+ 400[39m

[36m [2m❯[22m prepare docs/testes/issue333/head/flows.test.tsx:[2m67:160[22m[39m
    [90m 65| [39m  [35mconst[39m s[33m=[39m[35mawait[39m ([35mawait[39m [34mcall[39m({action[33m:[39m[32m"session"[39m}))[33m.[39m[34mjson[39m()[33m;[39m
    [90m 66| [39m  const form=new FormData();form.set("session_id",s.session.id);form.s…
    [90m 67| [39m  const upload=await handler(new Request("http://local.fixture",{metho…
    [90m   | [39m                                                                                                                                                               [31m^[39m
    [90m 68| [39m  const doc=await upload.json(), f=fields();const r=await call({action…
    [90m 69| [39m  [35mreturn[39m {s[33m,[39mdoc[33m,[39mf[33m,[39mp[33m:[39m[35mawait[39m r[33m.[39m[34mjson[39m()}[33m;[39m
[90m [2m❯[22m docs/testes/issue333/head/flows.test.tsx:[2m104:11[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯[22m[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m > [22mnew intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review
[31m[1mAssertionError[22m: expected 'pendente' to be 'conferido' // Object.is equality[39m

Expected: [32m"conferido"[39m
Received: [31m"pendente"[39m

[36m [2m❯[22m docs/testes/issue333/head/flows.test.tsx:[2m120:114[22m[39m
    [90m118| [39m})[33m;[39m
    [90m119| [39mit("new intention is executable with verified original bytes; differen…
    [90m120| [39m  const a=await attempt(c1,"prepare",null,envelope());expect((await ex…
    [90m   | [39m                                                                                                                 [31m^[39m
    [90m121| [39m  const b=await attempt(c1,"prepare",null,envelope());await executeAtt…
    [90m122| [39m  const n=await attempt(c1,"confirm_new_intent",a.id,null,a.hash);expe…

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯[22m[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m > [22mreal DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
[31m[1mReferenceError[22m: React is not defined[39m
[36m [2m❯[22m docs/testes/issue333/head/flows.test.tsx:[2m131:31[22m[39m
    [90m129| [39m})[33m;[39m
    [90m130| [39mit("real DataEntryDialog + default client + handler + SQL + disk bytes…
    [90m131| [39m  localStorage.clear();render(<MemoryRouter><DataEntryDialog open onOp…
    [90m   | [39m                              [31m^[39m
    [90m132| [39m  const button=await screen.findByRole("button",{name:"Novo lote"});aw…
    [90m133| [39m  const input=await screen.findByLabelText("Escolher documento");fireE…

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯[22m[39m


EXIT: 1

```
## /tmp/issue333-head-ofpzipjv/head-integration.log

```text
COMMAND: node /tmp/issue333-head-ofpzipjv/tree/node_modules/vitest/vitest.mjs run --config docs/testes/issue333/vitest.head.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-ofpzipjv/tree[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [2mno tests[22m
[2m   Start at [22m 23:45:27
[2m   Duration [22m 1.64s[2m (transform 278ms, setup 66ms, collect 0ms, tests 0ms, environment 425ms, prepare 237ms)[22m

[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx
[22m[39mWarning: Please use the `legacy` build in Node.js environments.


[31m⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Suites 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m [ docs/testes/issue333/head/flows.test.tsx ][22m
[31m[1mReferenceError[22m: DOMMatrix is not defined[39m
[90m [2m❯[22m ../../../dev-server/node_modules/pdfjs-dist/build/webpack:/pdf.js/src/display/canvas.js:[2m65:22[22m[39m
[36m [2m❯[22m src/lib/pdf-first-page-to-jpeg.ts:[2m1:1[22m[39m
    [90m  1| [39m// Renders the first page of a PDF File to a JPEG File suitable for OC…
    [90m   | [39m[31m^[39m
    [90m  2| [39m// Uses pdfjs-dist with the bundled worker. Returns null if rendering …
    [90m  3| [39m[35mimport[39m [33m*[39m [35mas[39m pdfjsLib [35mfrom[39m [32m"pdfjs-dist"[39m[33m;[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


EXIT: 1

```
## /tmp/issue333-head-v8aqa5l3/head-integration.log

```text
COMMAND: node /tmp/issue333-head-v8aqa5l3/tree/node_modules/vitest/vitest.mjs run --config docs/testes/issue333/vitest.head.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-v8aqa5l3/tree[39m

[90mstdout[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mreal ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination
[22m[39mingest diagnostic {"code":"result_unknown","error":"Resultado por confirmar. Não repitas; confere a fatura existente.","reused":false,"attempt_coverage":"legacy_untracked"}

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m19 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 4350[2mms[22m[39m
   [32m✓[39m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit[32m 166[2mms[22m[39m
   [32m✓[39m no authorization/stale preview/foreign owner and tenant cannot create an invoice[32m 61[2mms[22m[39m
   [32m✓[39m lost commit response and failed read-only check preserve candidate; recovery reads one effect[32m 80[2mms[22m[39m
   [32m✓[39m two SQL connections at real row lock: one effect; gate closing while waiting denies commit[32m 253[2mms[22m[39m
   [32m✓[39m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review[32m 102[2mms[22m[39m
   [33m[2m✓[22m[39m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter [33m 513[2mms[22m[39m
   [32m✓[39m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice[32m 159[2mms[22m[39m
   [32m✓[39m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again[32m 33[2mms[22m[39m
   [32m✓[39m lost response after reserve preserves bytes and destination; recovery is read-only[32m 11[2mms[22m[39m
   [32m✓[39m lost response after upload preserves bytes and destination; recovery is read-only[32m 9[2mms[22m[39m
   [32m✓[39m lost response after receipt preserves bytes and destination; recovery is read-only[32m 12[2mms[22m[39m
   [32m✓[39m lost response after commit preserves bytes and destination; recovery is read-only[32m 14[2mms[22m[39m
   [32m✓[39m lost response after check preserves bytes and destination; recovery is read-only[32m 17[2mms[22m[39m
   [32m✓[39m real SQL rollback after mutation before audit leaves zero effect and persistent reservation[32m 15[2mms[22m[39m
   [32m✓[39m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice[32m 23[2mms[22m[39m
   [32m✓[39m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced[32m 23[2mms[22m[39m
   [32m✓[39m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects[32m 39[2mms[22m[39m
   [33m[2m✓[22m[39m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud [33m 961[2mms[22m[39m
[31m   [31m×[31m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination[39m[32m 43[2mms[22m[39m
[31m     → expected 503 to be 200 // Object.is equality[39m

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m18 passed[39m[22m[90m (19)[39m
[2m   Start at [22m 23:47:48
[2m   Duration [22m 6.51s[2m (transform 493ms, setup 79ms, collect 950ms, tests 4.35s, environment 550ms, prepare 332ms)[22m

[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mreal DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.


[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m > [22mreal ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination
[31m[1mAssertionError[22m: expected 503 to be 200 // Object.is equality[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- 200[39m
[31m+ 503[39m

[36m [2m❯[22m docs/testes/issue333/head/flows.test.tsx:[2m293:151[22m[39m


[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


EXIT: 1

```
## /tmp/issue333-head-vrxssmdj/head-integration.log

```text
COMMAND: node /tmp/issue333-head-vrxssmdj/tree/node_modules/vitest/vitest.mjs run --config docs/testes/issue333/vitest.head.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-vrxssmdj/tree[39m

[90mstdout[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mreal ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination
[22m[39mingest diagnostic {"code":"result_unknown","error":"Resultado por confirmar. Não repitas; confere a fatura existente.","reused":false,"attempt_coverage":"legacy_untracked"}

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m19 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 4507[2mms[22m[39m
   [32m✓[39m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit[32m 164[2mms[22m[39m
   [32m✓[39m no authorization/stale preview/foreign owner and tenant cannot create an invoice[32m 57[2mms[22m[39m
   [32m✓[39m lost commit response and failed read-only check preserve candidate; recovery reads one effect[32m 61[2mms[22m[39m
   [32m✓[39m two SQL connections at real row lock: one effect; gate closing while waiting denies commit[32m 230[2mms[22m[39m
   [32m✓[39m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review[32m 77[2mms[22m[39m
   [33m[2m✓[22m[39m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter [33m 490[2mms[22m[39m
   [32m✓[39m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice[32m 186[2mms[22m[39m
   [32m✓[39m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again[32m 40[2mms[22m[39m
   [32m✓[39m lost response after reserve preserves bytes and destination; recovery is read-only[32m 14[2mms[22m[39m
   [32m✓[39m lost response after upload preserves bytes and destination; recovery is read-only[32m 10[2mms[22m[39m
   [32m✓[39m lost response after receipt preserves bytes and destination; recovery is read-only[32m 10[2mms[22m[39m
   [32m✓[39m lost response after commit preserves bytes and destination; recovery is read-only[32m 16[2mms[22m[39m
   [32m✓[39m lost response after check preserves bytes and destination; recovery is read-only[32m 18[2mms[22m[39m
   [32m✓[39m real SQL rollback after mutation before audit leaves zero effect and persistent reservation[32m 15[2mms[22m[39m
   [32m✓[39m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice[32m 26[2mms[22m[39m
   [32m✓[39m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced[32m 35[2mms[22m[39m
   [32m✓[39m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects[32m 65[2mms[22m[39m
   [33m[2m✓[22m[39m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud [33m 1374[2mms[22m[39m
[31m   [31m×[31m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination[39m[32m 43[2mms[22m[39m
[31m     → expected 503 to be 200 // Object.is equality[39m

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m18 passed[39m[22m[90m (19)[39m
[2m   Start at [22m 23:48:02
[2m   Duration [22m 6.31s[2m (transform 445ms, setup 67ms, collect 868ms, tests 4.51s, environment 408ms, prepare 232ms)[22m

[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mreal DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.


[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m > [22mreal ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination
[31m[1mAssertionError[22m: expected 503 to be 200 // Object.is equality[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- 200[39m
[31m+ 503[39m

[36m [2m❯[22m docs/testes/issue333/head/flows.test.tsx:[2m293:151[22m[39m


[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


EXIT: 1

```
