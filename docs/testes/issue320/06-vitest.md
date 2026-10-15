# Issue #320 — prova vitest (2026-10-15, base a27eb09b2f8eaa42a078bcecd3cd96387f56b832)

Comando: `bunx vitest run`  
Exit code: 0  
Ambiente: bun 1.3.3, vitest 3.2.7, node v22.22.0. Sem rede para a Meta (fetch bloqueado nos testes CAPI).

```text
Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

 ✓ src/components/TicketOfficePositionCards.test.tsx (7 tests) 34ms
 ✓ src/test/memory-index.test.ts (3 tests) 12ms
 ✓ src/components/__tests__/bp-installments.test.ts (20 tests) 36ms
 ✓ src/test/contactos-list-paging.test.ts (3 tests) 9ms
 ✓ src/test/crm-audience-live-count.test.ts (3 tests) 6ms
 ✓ src/test/capi-p1-guard.test.ts (22 tests) 15ms
 ✓ src/test/bol-m2-parser.test.ts (9 tests) 44ms
 ✓ src/test/coala-centro-custo-norm.test.ts (2 tests) 11ms
 ✓ src/test/derp248-tiktok-event-trackers.test.ts (11 tests) 37ms
 ✓ src/lib/__tests__/standalone-invoices.test.ts (4 tests) 13ms
 ✓ src/lib/__tests__/settlement-doc-text.test.ts (5 tests) 8ms
 ✓ src/lib/__tests__/event-simulator-calc.test.ts (35 tests) 20ms
 ✓ src/lib/__tests__/settlement-seal.test.ts (6 tests) 10ms
 ✓ src/lib/__tests__/partner-rebill-vat.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/event-ab-rounding.test.ts (4 tests) 15ms
 ✓ src/lib/__tests__/forecast-edit-diff.test.ts (3 tests) 22ms
 ✓ src/test/newgang-edition-videos.test.ts (6 tests) 30ms
 ✓ src/lib/__tests__/event-cost-basis-tour.test.ts (13 tests) 23ms
 ✓ src/lib/__tests__/permissions.test.ts (5 tests) 12ms
 ✓ src/lib/__tests__/accountant-account-filter.test.ts (5 tests) 9ms
 ✓ src/lib/__tests__/bp-planilha-version.test.ts (2 tests) 10ms
 ✓ src/test/check-deploy.test.ts (3 tests) 7ms
 ✓ src/test/payment-list-revalidate.test.ts (2 tests) 18ms
 ✓ src/test/silent-writes.test.ts (6 tests) 15ms
 ✓ src/lib/__tests__/event-cost-basis.test.ts (5 tests) 7ms
 ✓ src/lib/__tests__/supplier-credits.test.ts (34 tests) 12ms
 ✓ src/lib/__tests__/bp-line-review.test.ts (12 tests) 20ms
 ✓ src/lib/__tests__/ticket-office-reconciliation.test.ts (7 tests) 12ms
 ✓ src/test/example.test.ts (1 test) 7ms
 ✓ src/lib/__tests__/refund-grouping.test.ts (5 tests) 14ms
 ✓ src/lib/__tests__/permissions-per-company.test.ts (5 tests) 14ms
 ✓ src/lib/__tests__/simulator-prior-curve.test.ts (4 tests) 16ms
 ✓ src/test/supplier-similarity.test.ts (11 tests) 9ms
 ✓ src/lib/__tests__/settlement-perimeter.test.ts (6 tests) 9ms
 ✓ src/lib/__tests__/account-balance-settling.test.ts (2 tests) 12ms
 ✓ src/lib/__tests__/zone-on-sale.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/event-realized.test.ts (6 tests) 6ms
 ✓ src/components/__tests__/PasswordStrengthIndicator.test.ts (7 tests) 13ms
 ✓ src/lib/__tests__/partner-extras-kind.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/bp-line-required.test.ts (6 tests) 6ms
 ✓ src/lib/crm/creativeReelsCheck.test.ts (5 tests) 27ms
 ✓ src/lib/__tests__/pl-category-matching.test.ts (5 tests) 7ms
 ✓ src/test/operation-key-domain.test.ts (4 tests) 13ms
 ✓ src/lib/__tests__/permissions-guards-proof.test.ts (1 test) 16ms
 ✓ src/lib/__tests__/ticket-category.test.ts (4 tests) 44ms
stdout | src/lib/__tests__/card-session-theoretical.test.ts > #275 saldo teórico da sessão = fecho > sem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[#275] teórico = 636.68 esperado = 636.68

 ✓ src/lib/__tests__/card-session-theoretical.test.ts (1 test) 5ms
 ↓ src/test/partner-statement-edge.test.ts (1 test | 1 skipped)
 ✓ src/test/format-integer-conversions.test.ts (3 tests) 4ms

 Test Files  151 passed | 1 skipped (152)
      Tests  1177 passed | 1 skipped | 11 todo (1189)
   Start at  23:31:48
   Duration  105.40s (transform 15.20s, setup 175.20s, collect 167.30s, tests 14.52s, environment 860.30s, prepare 140.60s)

```
