# Tarefa87 — outputs locais integrais

Sem Cloud, segredos ou chamadas modelo real. Timestamps Vitest usam relógio local do sandbox, não a hora da autorização controller.

## bunx vitest run src/test/data-entry-control87.test.ts src/test/data-entry-analysis85.test.ts src/test/data-entry-provider86.test.ts src/test/data-entry-analysis-transport85.test.ts (exit0)
```text

 RUN  v3.2.7 /dev-server

 ✓ src/test/data-entry-control87.test.ts (21 tests) 230ms
 ✓ src/test/data-entry-provider86.test.ts (9 tests) 251ms
 ✓ src/test/data-entry-analysis85.test.ts (26 tests) 31ms
 ✓ src/test/data-entry-analysis-transport85.test.ts (4 tests) 88ms

 Test Files  4 passed (4)
      Tests  60 passed (60)
   Start at  11:22:37
   Duration  3.33s (transform 337ms, setup 887ms, collect 1.13s, tests 600ms, environment 2.44s, prepare 3.22s)


```

## ISSUE333_LOCAL_PROOF=1 bunx vitest run --config docs/testes/issue333/provider87/vitest.config.ts (exit0)
```text

 RUN  v3.2.7 /dev-server

 ✓ docs/testes/issue333/provider87/control-pg.test.ts (20 tests) 3423ms

 Test Files  1 passed (1)
      Tests  20 passed (20)
   Start at  11:25:05
   Duration  4.22s (transform 178ms, setup 0ms, collect 237ms, tests 3.42s, environment 0ms, prepare 210ms)


```

## python3 docs/testes/issue333/provider87/run-deno-local.py (exit0)
```text
COMMAND: deno check --no-config --no-lock --node-modules-dir=manual --no-remote supabase/functions/_shared/issue333-ai/control.ts supabase/functions/_shared/issue333-ai/provider.ts supabase/functions/data-entry/analysis-service.ts supabase/functions/data-entry/analysis-stream.ts supabase/functions/data-entry/index.ts
Check supabase/functions/_shared/issue333-ai/control.ts
Check supabase/functions/_shared/issue333-ai/provider.ts
Check supabase/functions/data-entry/analysis-service.ts
Check supabase/functions/data-entry/analysis-stream.ts
Check supabase/functions/data-entry/index.ts

EXIT: 0
COMMAND: deno test --no-config --no-lock --node-modules-dir=manual --no-remote --cached-only --allow-sys=hostname --allow-env=OPENAI_BASE_URL docs/testes/issue333/provider87/runtime.test.ts docs/testes/issue333/analysis86/runtime.test.ts
Check docs/testes/issue333/provider87/runtime.test.ts
Check docs/testes/issue333/analysis86/runtime.test.ts
running 1 test from ./docs/testes/issue333/provider87/runtime.test.ts
87 real SDK + durable adapter contract: 403 persisted, no second POST, no egress ... ok (48ms)
running 1 test from ./docs/testes/issue333/analysis86/runtime.test.ts
86 real Deno SDK Responses → validation → final-only SSE, zero egress ... ok (57ms)

ok | 2 passed | 0 failed (367ms)


EXIT: 0
COMMAND: deno bundle --no-config --no-lock --node-modules-dir=manual --no-remote --platform deno supabase/functions/data-entry/index.ts -o /tmp/issue333-provider87-deno-fs72kp88/entry.bundle.js
⚠️  deno bundle is experimental and subject to changes
Bundled 191 modules in 335ms
  ../tmp/issue333-provider87-deno-fs72kp88/entry.bundle.js 2.12MB


EXIT: 0
Evidence: /tmp/issue333-provider87-deno-fs72kp88

```

## bunx vitest run (exit1)
```text

 RUN  v3.2.7 /dev-server

 ✓ src/lib/__tests__/split-adjustment.test.ts (37 tests) 15ms
 ✓ src/lib/__tests__/supplier-credits.test.ts (34 tests) 13ms
 ✓ src/lib/__tests__/ticket-office-settlement-calc.test.ts (22 tests) 36ms
 ✓ src/lib/__tests__/multi-day-ticketing.test.ts (25 tests | 4 skipped) 26ms
 ✓ src/lib/__tests__/event-ab-full-suite.test.ts (27 tests) 37ms
 ✓ src/lib/__tests__/tickets-v2-properties.test.ts (19 tests) 75ms
 ✓ src/lib/__tests__/statement-grouping.test.ts (16 tests) 35ms
 ✓ src/lib/__tests__/event-simulator-calc.test.ts (35 tests) 18ms
stderr | src/test/consent-contract-322.test.ts > portal-track handler > consent: timeout da RPC → 503 bloqueado
[portal-track] consent rpc threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > bind falha (throw): lead entra sem ids Meta
[portal-track] consent bind threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > insert falha → 500 (sem falso sucesso)
[portal-track] insert lead_capture [33m500[39m

 ✓ src/test/consent-contract-322.test.ts (38 tests) 80ms
 ✓ src/lib/__tests__/event-settlement-engine.test.ts (27 tests) 57ms
 ✓ src/test/data-entry-analysis85.test.ts (26 tests) 94ms
stderr | src/test/club-config-integration.test.tsx > #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/club-config-integration.test.tsx (7 tests) 852ms
   ✓ #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa  396ms
 ✓ src/lib/__tests__/forecast-boost.test.ts (12 tests) 14ms
 ✓ src/lib/__tests__/partner-settlement-internal-report.test.ts (12 tests) 12ms
 ✓ src/lib/__tests__/tickets-v2-read-layer.test.ts (28 tests | 7 skipped) 28ms
 ✓ src/lib/__tests__/bp-version-multi-diff.test.ts (10 tests) 30ms
 ✓ src/lib/__tests__/cache-report.test.ts (13 tests) 94ms
 ✓ src/test/newgang-wallet-google.test.ts (12 tests) 298ms
 ✓ src/lib/__tests__/partner-statement-doc.test.ts (29 tests) 121ms
 ✓ src/lib/__tests__/iva.test.ts (22 tests) 18ms
 ✓ src/lib/__tests__/event-ab-calc.test.ts (12 tests) 11ms
 ✓ src/lib/__tests__/event-revenue-basis.test.ts (12 tests) 15ms
 ✓ src/lib/__tests__/storage-multi-tenant.test.ts (14 tests) 2324ms
   ✓ multi-tenant storage helpers > useSetActiveCompany limpa a cache do storage > depois da troca, withCompanyPath prefixa com a empresa nova  2277ms
 ✓ src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx (9 tests) 678ms
stdout | src/test/issue333-controller-message69.test.ts > finite controller-message69 receiver (local doubles, no Cloud) > parses exact supplied public constant without coercing PostgreSQL numeric
CONSTANT69 {"id":"proof69-constant-0001","queryFingerprint":"aa568e292cc8823072fef97e1af4e459ff11008c3cb557c3599fb3ca13cf7467","envelopeSha256":"0115b2d3c4c42206ff1c1e7d17f508458b334beed430a3014255e016923f32a1","bytes":705,"strict":false,"rows":1}

 ✓ src/test/issue333-controller-message69.test.ts (15 tests) 84ms
 ✓ src/test/ticketline-import-format-transition.test.ts (2 tests) 20ms
 ✓ src/test/issue333-future-runner.test.ts (14 tests) 26ms
 ✓ src/test/bol-m2-parser.test.ts (9 tests) 47ms
 ✓ src/lib/__tests__/postgrest-embeds.test.ts (2 tests) 815ms
   ✓ embeds do PostgREST em pares com FK duplicada > [Issue #288] nenhum embed ambíguo sem a FK nomeada  809ms
 ✓ src/test/newgang-portal.test.ts (10 tests) 46ms
 ✓ src/test/bol-daily-parser.test.ts (9 tests) 13ms
 ✓ src/lib/__tests__/postgrest-row-limit.test.ts (2 tests) 720ms
   ✓ barreira dos 1.000 registos do PostgREST > [Issue #289] nenhuma leitura de tabela grande sem paginação  715ms
 ✓ src/test/event-financials-invalidation.test.tsx (8 tests) 57ms
 ✓ src/lib/__tests__/bp-tx-matching.test.ts (12 tests) 15ms
 ✓ src/test/ticket-office-statement-documents.test.tsx (6 tests) 215ms
 ✓ src/lib/__tests__/overhead-proration.test.ts (11 tests) 16ms
 ✓ src/lib/__tests__/combo-gating.test.ts (19 tests) 11ms
 ✓ src/test/derp248-tiktok-event-trackers.test.ts (11 tests) 27ms
 ✓ src/lib/__tests__/standalone-attempt-routing.test.ts (13 tests) 32ms
 ✓ src/lib/__tests__/event-cost-basis-tour.test.ts (13 tests) 11ms
 ✓ src/lib/__tests__/help-manual-parser.test.ts (10 tests) 31ms
 ✓ src/lib/__tests__/partner-disbursement.test.ts (11 tests) 15ms
 ↓ src/test/issue333-worker60.test.ts (4 tests | 4 skipped)
stderr | src/components/data-entry/__tests__/DataEntryDialog.test.tsx > #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/edge-fn-guard.test.ts (4 tests) 329ms
   ✓ service_role_pelo_payload > nenhuma edge function aceita service role pelo claim sem isServiceRoleRequest  311ms
 ✓ src/test/issue333-controller-message70.test.ts (6 tests | 1 skipped) 43ms
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

 ✓ src/test/newgang-portal-bundle.test.ts (5 tests) 45ms
 ✓ src/components/__tests__/EventABTab.test.tsx (4 tests) 815ms
   ✓ EventABTab — UI smoke tests > renderiza sem crashar e mostra labels/inputs das zonas  462ms
 ✓ src/components/data-entry/__tests__/DataEntryDialog.test.tsx (13 tests) 4919ms
   ✓ #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações  367ms
   ✓ #333 DataEntryDialog > execução não validada: prévia visível, botão desativado mesmo após confirmação  527ms
   ✓ #333 DataEntryDialog > execução validada: exige confirmação explícita e mostra a conferência com a observação  439ms
   ✓ #333 DataEntryDialog > editar depois da prévia exige nova prévia/hash antes de executar  461ms
   ✓ #333 DataEntryDialog > retoma nunca declara sucesso por cache; repõe campos, lê check, sem commit  527ms
   ✓ #333 DataEntryDialog > execução tardia após close não mostra sucesso e retoma só confere  674ms
   ✓ #333 DataEntryDialog > execução tardia após company não mostra sucesso e retoma só confere  440ms
   ✓ #333 DataEntryDialog > resposta tardia de upload após contexto alterado é descartada  506ms
   ✓ #333 DataEntryDialog > resposta tardia de preview após contexto alterado é descartada  320ms
   ✓ #333 DataEntryDialog > utilizador diferente não recebe retoma; contexto revalidado antes de execução  342ms
 ✓ src/lib/sepa/bank-execution.test.ts (7 tests) 10ms
 ✓ src/lib/__tests__/ebitda.test.ts (8 tests) 9ms
 ✓ src/lib/__tests__/creative-media.test.ts (19 tests) 10ms
 ✓ src/lib/__tests__/combo-capacity.test.ts (9 tests) 42ms
 ✓ src/test/partner-statement-cards.test.ts (3 tests) 9ms
 ✓ src/lib/__tests__/settlement-participants.test.ts (10 tests) 19ms
 ❯ src/test/issue333-proof60.test.ts (6 tests | 1 failed) 4513ms
   ✓ relay accepts only exact id + query fingerprint + complete expected schema 213ms
   ✓ relay rejects response with swapped id, wrong fingerprint, missing field or revoked shape  838ms
   ✓ relay never turns an absent field into PASS and times out without any response  414ms
   ✓ browser worker persists browser.json atomically even when a final guard fails 5ms
   ✓ browser worker asserts pair statuses captured before read-only check 5ms
   × relay rejects stale (out-of-order) and duplicate responses 3031ms
     → expected [Function] to throw error including 'fingerprint mismatch' but got 'Official SELECT bridge response deadl…'
 ✓ src/components/__tests__/bp-installments.test.ts (20 tests) 39ms
 ✓ src/test/campaign-design-optional-roas.test.ts (15 tests) 239ms
 ✓ src/test/newgang-welcome-once.test.ts (7 tests) 36ms
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

 ✓ src/lib/__tests__/transitory-transactions.test.ts (7 tests) 11ms
 ✓ src/lib/__tests__/real-cache-deductions.test.ts (8 tests) 9ms
 ✓ src/lib/__tests__/overlay-layer.test.tsx (6 tests) 549ms
   ✓ pilha de camadas — aninhamentos reais > #260 classificação acima da Nova Transação recebe foco e confirma escolha  320ms
 ✓ src/lib/__tests__/data-entry-contract.test.ts (8 tests) 27ms
 ✓ src/lib/__tests__/bp-line-review.test.ts (12 tests) 10ms
 ✓ src/test/newgang-edition-videos.test.ts (6 tests) 26ms
 ✓ src/lib/__tests__/google-click-match.test.ts (17 tests) 38ms
stderr | src/lib/__tests__/permissions-guards-f2b.test.tsx > #311 F2b — guardas por permissão > manager com excepção module.crm entra em /crm e vê o cartão CRM activo
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/permissions-guards-f2b.test.tsx (5 tests) 161ms
 ✓ src/lib/__tests__/settlement-seal.test.ts (6 tests) 11ms
 ✓ src/lib/__tests__/event-simulator-ab-scale.test.ts (8 tests) 7ms
 ✓ src/lib/__tests__/bp-formula.test.ts (8 tests) 43ms
 ✓ src/test/newgang-history.test.ts (6 tests) 10ms
 ✓ src/lib/__tests__/camarim-bp-rules.test.ts (6 tests) 26ms
 ✓ src/test/transaction-duplicate-check.test.ts (6 tests) 23ms
 ✓ src/lib/__tests__/income-tax-out-of-event-result.test.ts (5 tests) 19ms
 ✓ src/test/payment-method-domain.test.ts (8 tests) 12ms
 ✓ src/lib/__tests__/settlement-revenue.test.ts (6 tests) 12ms
 ✓ src/lib/__tests__/cache-tab-total.test.ts (4 tests) 11ms
 ✓ src/test/coala-meta-audience-handler.test.ts (3 tests) 357ms
 ✓ src/lib/__tests__/ticket-revenue-single-rule.test.ts (6 tests) 16ms
 ✓ src/lib/__tests__/zone-price-elasticity.test.ts (7 tests) 7ms
 ✓ src/test/coala-meta-audience-sync.test.ts (5 tests) 33ms
 ✓ src/test/data-entry-pilot8.test.ts (4 tests) 42ms
 ✓ src/lib/__tests__/document-detect.test.ts (5 tests) 1904ms
   ✓ detectDocumentQuad > deteta A4 rodado 12°, centrado com erro < 3%  482ms
   ✓ detectDocumentQuad > deteta A4 rodado -18°, à esquerda com erro < 3%  375ms
   ✓ detectDocumentQuad > deteta A4 rodado 20°, canto sup. dir. com erro < 3%  356ms
   ✓ detectDocumentQuad > deteta A4 rodado 6°, grande com erro < 3%  409ms
 ✓ src/test/newgang-missions.test.ts (5 tests) 17ms
 ✓ src/test/approve-lock-and-core.test.ts (6 tests) 63ms
 ✓ src/lib/__tests__/validations.test.ts (17 tests) 34ms
stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Esc não fecha o modal sob outra janela
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Dialog separa cabeçalho e corpo e mantém o X fora do scroll
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 ✓ src/test/mobile-modal-dismiss.test.tsx (6 tests) 506ms
 ✓ src/lib/__tests__/tour-cache-sync.test.ts (8 tests) 11ms
 ✓ src/lib/__tests__/standalone-capabilities.test.ts (9 tests) 29ms
 ✓ src/lib/__tests__/club-config-source.test.ts (12 tests) 12ms
 ✓ src/lib/__tests__/report-event-cost.test.ts (7 tests) 9ms
stderr | src/pages/__tests__/ResetPassword.test.tsx > ResetPassword — token_hash flow > (a) não chama verifyOtp ao montar; só ao clicar Continuar
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/pages/__tests__/ResetPassword.test.tsx (3 tests) 396ms
 ✓ src/components/standalone/__tests__/StandaloneReservedExecution.test.tsx (9 tests) 368ms
 ✓ src/test/newgang-edition-photos.test.ts (5 tests) 19ms
 ✓ src/test/capi-p1-guard.test.ts (22 tests) 12ms
 ✓ src/lib/__tests__/permissions-per-company.test.ts (5 tests) 12ms
 ✓ src/test/crm-ingest-no-network.test.ts (12 tests) 16ms
 ✓ src/lib/__tests__/ticket-office-effective-open.test.ts (4 tests) 14ms
 ✓ src/test/newgang-wallet-levels.test.ts (14 tests) 17ms
 ✓ src/lib/__tests__/refund-grouping.test.ts (5 tests) 15ms
 ✓ src/lib/__tests__/settlement-doc-text.test.ts (5 tests) 5ms
 ✓ src/components/data-entry/__tests__/DocumentAnalysisPanel.test.tsx (5 tests) 648ms
 ✓ src/lib/__tests__/no-direct-transaction-document-remove.test.ts (3 tests) 821ms
   ✓ sem remoção directa em transaction-documents no frontend > nenhuma chamada directa a .remove nos 10 buckets contabilísticos  814ms
 ✓ src/lib/__tests__/cache-percentage.test.tsx (4 tests) 127ms
 ✓ src/lib/__tests__/event-partner-mirror.test.ts (5 tests) 40ms
 ✓ src/test/ticket-office-settlement-pdf.test.ts (1 test) 107ms
 ✓ src/lib/__tests__/event-ab-rounding.test.ts (4 tests) 9ms
 ✓ src/test/data-entry-analysis-transport85.test.ts (4 tests) 141ms
 ✓ src/test/portal-track-diag.test.ts (18 tests) 87ms
 ✓ src/lib/__tests__/ticket-office-reconciliation.test.ts (7 tests) 10ms
 ✓ src/test/song-link-ssr.test.ts (24 tests) 39ms
 ✓ src/lib/__tests__/payment-settlement.test.ts (8 tests) 19ms
 ✓ src/test/newgang-strict-audience-delivery.test.ts (4 tests) 22ms
 ✓ src/test/issue333-private-cloud57.test.ts (3 tests) 243ms
 ✓ src/lib/__tests__/standalone-snapshot.test.ts (4 tests) 7ms
 ✓ src/test/issue333-baseline58.test.ts (4 tests) 847ms
   ✓ relay unwraps official row arrays, refuses mismatched IDs, and has a finite timeout  811ms
 ✓ src/test/camarim-session-pdf-sanitize.test.ts (1 test) 73ms
stderr | src/lib/__tests__/cache-scope.test.tsx > ecrã do subevento usa a configuração do Master > mostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/cost-center-map.test.ts (6 tests) 29ms
 ✓ src/lib/__tests__/master-adopted-expense-proration.test.ts (3 tests) 12ms
 ✓ src/lib/__tests__/cache-scope.test.tsx (4 tests) 258ms
 ✓ src/lib/__tests__/camarim-cash-preview.test.ts (5 tests) 12ms
 ✓ src/lib/__tests__/ads-tour-split.test.ts (4 tests) 16ms
 ✓ src/lib/__tests__/partner-extras-union-148.test.ts (6 tests) 9ms
 ✓ src/lib/__tests__/camarim-integrate.test.ts (4 tests) 7ms
 ✓ src/test/ticket-office-settlement-eligible.test.ts (5 tests) 7ms
 ✓ src/test/issue333-preparation73.test.ts (6 tests) 17ms
 ✓ src/lib/crm/creativeReelsCheck.test.ts (5 tests) 6ms
 ✓ src/lib/__tests__/standalone-hash-check-pending.test.ts (3 tests) 22ms
stdout | src/lib/__tests__/card-session-theoretical.test.ts > #275 saldo teórico da sessão = fecho > sem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[#275] teórico = 636.68 esperado = 636.68

 ✓ src/lib/__tests__/card-session-theoretical.test.ts (1 test) 8ms
 ✓ src/test/newgang-crews.test.ts (3 tests) 14ms
 ✓ src/lib/__tests__/forecast-undo.test.ts (2 tests) 22ms
 ✓ src/lib/__tests__/simulator-prior-curve.test.ts (4 tests) 16ms
 ✓ src/lib/__tests__/event-nature.test.ts (4 tests) 10ms
 ✓ src/test/capi-diag-no-secrets.test.ts (6 tests) 9ms
 ✓ src/test/silent-writes.test.ts (6 tests) 18ms
 ✓ src/lib/__tests__/permissions.test.ts (5 tests) 7ms
 ✓ src/test/operation-key-domain.test.ts (4 tests) 10ms
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
 ✓ src/test/ticket-office-settlement-view.test.tsx (3 tests) 82ms
 ✓ src/test/event-financial-card-render-loop.test.tsx (1 test) 1105ms
   ✓ EventFinancialCard — sem ciclo de redesenho (#269) > chama onEbitdaParcelsChange uma única vez com queries vazias  1103ms
 ✓ src/test/similar-suppliers-notice.test.tsx (4 tests) 100ms
 ↓ src/test/partner-statement-edge.test.ts (1 test | 1 skipped)
 ✓ src/lib/__tests__/permissions-guards-proof.test.ts (1 test) 7ms
 ✓ src/lib/__tests__/pl-category-matching.test.ts (5 tests) 7ms
 ✓ src/test/memory-index.test.ts (3 tests) 7ms
stderr | src/test/require-feature.test.tsx > visibilidade por company_features > rota bloqueada sem a chave
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/require-feature.test.tsx (4 tests) 195ms
 ✓ src/lib/__tests__/ticket-office-position.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/account-balance-settling.test.ts (2 tests) 6ms
 ✓ src/test/ticket-office-settlement-card-date.test.tsx (1 test) 93ms
 ✓ src/lib/__tests__/event-cost-basis.test.ts (5 tests) 7ms
 ✓ src/lib/__tests__/session-copy.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/bp-line-required.test.ts (6 tests) 9ms
 ✓ src/lib/__tests__/dre-nature-divergence.test.ts (2 tests) 59ms
 ✓ src/lib/__tests__/partner-extras-kind.test.ts (3 tests) 45ms
 ✓ src/lib/__tests__/partner-rebill-vat.test.ts (4 tests) 6ms
 ✓ src/test/supplier-similarity.test.ts (11 tests) 17ms
 ✓ src/lib/__tests__/settlement-perimeter.test.ts (6 tests) 13ms
 ✓ src/lib/__tests__/utils.test.ts (8 tests) 22ms
 ✓ src/lib/__tests__/zone-capacities.test.ts (2 tests) 7ms
 ✓ src/test/forecast-attachment-counts.test.tsx (1 test) 453ms
   ✓ anexos do BP — uma leitura por evento (#269) > 361 linhas → 1 pedido a event_forecast_attachments  450ms
 ✓ src/lib/__tests__/fecho-preconditions.test.ts (4 tests) 8ms
 ✓ src/test/transaction-edit-modal-operation-key.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/ticket-category.test.ts (4 tests) 6ms
 ✓ src/test/contactos-list-paging.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/postgrest-large-tables-mirror.test.ts (1 test) 113ms
 ✓ src/lib/__tests__/standalone-capability-proposal.test.ts (3 tests) 10ms
 ✓ src/lib/__tests__/standalone-invoices.test.ts (4 tests) 14ms
 ✓ src/test/crm-audience-live-count.test.ts (3 tests) 14ms
 ✓ src/test/newgang-profile-country.test.ts (2 tests) 18ms
 ✓ src/lib/__tests__/event-realized.test.ts (6 tests) 30ms
 ✓ src/lib/__tests__/zone-price-turns.test.ts (3 tests) 27ms
 ✓ src/components/__tests__/PasswordStrengthIndicator.test.ts (7 tests) 11ms
 ✓ src/test/check-deploy.test.ts (3 tests) 10ms
 ✓ src/components/__tests__/StatCard.test.tsx (4 tests) 126ms
 ✓ src/components/__tests__/LinkBpLineDialog-layer.test.tsx (1 test) 328ms
   ✓ #249 Vincular ao BP above Editar Transação > mounts above the existing transaction overlay and receives focus  321ms
 ✓ src/test/coala-centro-custo-norm.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/accountant-account-filter.test.ts (5 tests) 8ms
 ✓ src/lib/__tests__/forecast-edit-diff.test.ts (3 tests) 16ms
 ✓ src/test/newgang-content.test.tsx (2 tests) 159ms
 ✓ src/lib/__tests__/bp-planilha-version.test.ts (2 tests) 24ms
 ✓ src/test/payment-list-revalidate.test.ts (2 tests) 14ms
 ✓ src/lib/__tests__/zone-on-sale.test.ts (3 tests) 4ms
 ✓ src/test/issue333-controller-checkpoint71.test.ts (18 tests) 1088ms
 ✓ src/lib/__tests__/audit.test.ts (4 tests) 5ms
 ✓ src/components/__tests__/EventStatusBadge.test.tsx (5 tests) 83ms
 ✓ src/test/data-entry-control87.test.ts (18 tests) 275ms
 ✓ src/test/data-entry-provider86.test.ts (9 tests) 544ms
 ✓ src/test/issue333-existing75.test.ts (22 tests) 154ms
 ✓ src/test/example.test.ts (1 test) 12ms
 ✓ src/test/capi-v2-auth.test.ts (6 tests) 114ms
 ✓ src/test/format-integer-conversions.test.ts (3 tests) 7ms
 ✓ src/test/standalone-compat-prepared.test.ts (26 tests) 45ms
 ✓ src/test/capi-v2.test.ts (29 tests) 4751ms
 ✓ src/test/newgang-crm-whatsapp.test.ts (26 tests) 5056ms
 ✓ src/test/issue333-checkpoint66.test.ts (18 tests) 4862ms
   ✓ official transport captures complete actual PostgreSQL JSON result, validates nested config without copying  4255ms
 ✓ src/test/newgang-crm-profile-fields.test.ts (9 tests) 3693ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/test/issue333-proof60.test.ts > relay rejects stale (out-of-order) and duplicate responses
AssertionError: expected [Function] to throw error including 'fingerprint mismatch' but got 'Official SELECT bridge response deadl…'

Expected: [32m"fingerprint mismatch"[39m
Received: [31m"Official SELECT bridge response deadline; no account fallback"[39m

 ❯ src/test/issue333-proof60.test.ts:69:2
     67|  // but a response addressed to 0001 with 0002's fingerprint must fail
     68|  await respond(dir,'0001',{id:'0001',fingerprint:fp(q2),data:[{n:1}]});
     69|  await expect(p1).rejects.toThrow('fingerprint mismatch');
       |  ^
     70|  // duplicate id on the second request's file is rejected by identity …
     71|  await respond(dir,'0002',{id:'0001',fingerprint:fp(q2),data:[{n:2}]});

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 192 passed | 2 skipped (195)
      Tests  1 failed | 1648 passed | 6 skipped | 11 todo (1666)
   Start at  11:18:52
   Duration  118.20s (transform 15.53s, setup 189.90s, collect 241.55s, tests 50.86s, environment 898.22s, prepare 156.56s)


```

## bunx vitest run (exit1)
```text

 RUN  v3.2.7 /dev-server

 ✓ src/test/issue333-existing75.test.ts (22 tests) 177ms
 ✓ src/test/capi-v2-auth.test.ts (6 tests) 58ms
 ✓ src/test/issue333-controller-checkpoint71.test.ts (18 tests) 1063ms
   ✓ executor + receiver + finite fake controller: ban, no repeated effects  308ms
 ✓ src/test/data-entry-provider86.test.ts (9 tests) 388ms
 ✓ src/test/data-entry-control87.test.ts (21 tests) 350ms
 ✓ src/test/newgang-crm-profile-fields.test.ts (9 tests) 5061ms
 ✓ src/test/capi-v2.test.ts (29 tests) 5390ms
 ❯ src/test/issue333-checkpoint66.test.ts (18 tests | 1 failed) 5803ms
   ✓ durable pre-activation checkpoint survives >60s and >5min: no pending SELECT/timer/login 67ms
   ✓ expired permissions after controller activation forbid login and report scoped revoke pending 43ms
   ✓ a second execute invocation cannot produce a second simulated invoice 32ms
   ✓ dynamic login failure persists stage and independent cleanup, no retries 15ms
   ✓ dynamic worker failure persists stage and independent cleanup, no retries 21ms
   ✓ dynamic logout failure persists stage and independent cleanup, no retries 23ms
   ✓ dynamic ban failure persists stage and independent cleanup, no retries 28ms
   ✓ dynamic sessions failure persists stage and independent cleanup, no retries 28ms
   ✓ revocation missing never performs authenticated check; returns pending actions without polling 34ms
   ✓ read-check writes fail certification even with HTTP OK 33ms
   ✓ atomic invocation lock prevents overlapping execution 6ms
   ✓ crashed executing checkpoint only permits cleanup, never a second worker/login 22ms
   ✓ logout failure retains only private token for explicit cleanup, then removes secrets 46ms
   × official transport captures complete actual PostgreSQL JSON result, validates nested config without copying 5330ms
     → Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
   ✓ rejects fingerprint official envelope without converting absent data to PASS 31ms
   ✓ rejects schema official envelope without converting absent data to PASS 4ms
   ✓ rejects late official envelope without converting absent data to PASS 16ms
   ✓ rejects identity official envelope without converting absent data to PASS 6ms
 ✓ src/test/issue333-proof60.test.ts (6 tests) 1887ms
   ✓ relay rejects response with swapped id, wrong fingerprint, missing field or revoked shape  828ms
   ✓ relay never turns an absent field into PASS and times out without any response  413ms
   ✓ relay rejects stale (out-of-order) and duplicate responses  405ms
 ✓ src/test/newgang-crm-whatsapp.test.ts (26 tests) 6110ms
 ✓ src/lib/__tests__/storage-multi-tenant.test.ts (14 tests) 1724ms
   ✓ multi-tenant storage helpers > useSetActiveCompany limpa a cache do storage > depois da troca, withCompanyPath prefixa com a empresa nova  1712ms
 ✓ src/lib/__tests__/document-detect.test.ts (5 tests) 2534ms
   ✓ detectDocumentQuad > deteta A4 rodado 12°, centrado com erro < 3%  749ms
   ✓ detectDocumentQuad > deteta A4 rodado -18°, à esquerda com erro < 3%  582ms
   ✓ detectDocumentQuad > deteta A4 rodado 20°, canto sup. dir. com erro < 3%  479ms
   ✓ detectDocumentQuad > deteta A4 rodado 6°, grande com erro < 3%  415ms
 ✓ src/lib/__tests__/no-direct-transaction-document-remove.test.ts (3 tests) 474ms
   ✓ sem remoção directa em transaction-documents no frontend > nenhuma chamada directa a .remove nos 10 buckets contabilísticos  468ms
 ✓ src/test/issue333-baseline58.test.ts (4 tests) 847ms
   ✓ relay unwraps official row arrays, refuses mismatched IDs, and has a finite timeout  815ms
stderr | src/test/club-config-integration.test.tsx > #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/postgrest-embeds.test.ts (2 tests) 875ms
   ✓ embeds do PostgREST em pares com FK duplicada > [Issue #288] nenhum embed ambíguo sem a FK nomeada  870ms
 ✓ src/test/club-config-integration.test.tsx (7 tests) 974ms
   ✓ #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa  423ms
 ✓ src/test/event-financial-card-render-loop.test.tsx (1 test) 1118ms
   ✓ EventFinancialCard — sem ciclo de redesenho (#269) > chama onEbitdaParcelsChange uma única vez com queries vazias  1116ms
 ✓ src/lib/__tests__/postgrest-row-limit.test.ts (2 tests) 1137ms
   ✓ barreira dos 1.000 registos do PostgREST > [Issue #289] nenhuma leitura de tabela grande sem paginação  1130ms
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

 ✓ src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx (9 tests) 699ms
 ✓ src/components/__tests__/EventABTab.test.tsx (4 tests) 542ms
   ✓ EventABTab — UI smoke tests > renderiza sem crashar e mostra labels/inputs das zonas  356ms
 ✓ src/test/forecast-attachment-counts.test.tsx (1 test) 408ms
   ✓ anexos do BP — uma leitura por evento (#269) > 361 linhas → 1 pedido a event_forecast_attachments  407ms
stderr | src/pages/__tests__/ResetPassword.test.tsx > ResetPassword — token_hash flow > (a) não chama verifyOtp ao montar; só ao clicar Continuar
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/pages/__tests__/ResetPassword.test.tsx (3 tests) 229ms
stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Esc não fecha o modal sob outra janela
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Dialog separa cabeçalho e corpo e mantém o X fora do scroll
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 ✓ src/test/mobile-modal-dismiss.test.tsx (6 tests) 350ms
 ✓ src/components/standalone/__tests__/StandaloneReservedExecution.test.tsx (9 tests) 384ms
 ✓ src/test/edge-fn-guard.test.ts (4 tests) 191ms
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

 ✓ src/lib/__tests__/overlay-layer.test.tsx (6 tests) 468ms
   ✓ pilha de camadas — aninhamentos reais > #260 classificação acima da Nova Transação recebe foco e confirma escolha  312ms
 ✓ src/test/newgang-wallet-google.test.ts (12 tests) 210ms
 ✓ src/test/coala-meta-audience-handler.test.ts (3 tests) 206ms
 ✓ src/test/issue333-private-cloud57.test.ts (3 tests) 224ms
 ✓ src/components/__tests__/LinkBpLineDialog-layer.test.tsx (1 test) 164ms
 ✓ src/test/campaign-design-optional-roas.test.ts (15 tests) 258ms
 ✓ src/lib/__tests__/postgrest-large-tables-mirror.test.ts (1 test) 106ms
stderr | src/lib/__tests__/permissions-guards-f2b.test.tsx > #311 F2b — guardas por permissão > manager com excepção module.crm entra em /crm e vê o cartão CRM activo
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/permissions-guards-f2b.test.tsx (5 tests) 174ms
 ✓ src/lib/__tests__/cache-percentage.test.tsx (4 tests) 107ms
stderr | src/test/require-feature.test.tsx > visibilidade por company_features > rota bloqueada sem a chave
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/require-feature.test.tsx (4 tests) 180ms
stderr | src/components/data-entry/__tests__/DataEntryDialog.test.tsx > #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/ticket-office-statement-documents.test.tsx (6 tests) 197ms
 ✓ src/test/ticket-office-settlement-pdf.test.ts (1 test) 68ms
 ✓ src/components/__tests__/StatCard.test.tsx (4 tests) 84ms
 ✓ src/test/newgang-content.test.tsx (2 tests) 100ms
 ✓ src/lib/__tests__/cache-report.test.ts (13 tests) 52ms
 ✓ src/components/data-entry/__tests__/DataEntryDialog.test.tsx (13 tests) 3513ms
   ✓ #333 DataEntryDialog > execução não validada: prévia visível, botão desativado mesmo após confirmação  441ms
   ✓ #333 DataEntryDialog > execução validada: exige confirmação explícita e mostra a conferência com a observação  349ms
   ✓ #333 DataEntryDialog > editar depois da prévia exige nova prévia/hash antes de executar  370ms
   ✓ #333 DataEntryDialog > retoma nunca declara sucesso por cache; repõe campos, lê check, sem commit  360ms
   ✓ #333 DataEntryDialog > execução tardia após close não mostra sucesso e retoma só confere  350ms
   ✓ #333 DataEntryDialog > resposta tardia de upload após contexto alterado é descartada  348ms
 ✓ src/lib/__tests__/partner-statement-doc.test.ts (29 tests) 101ms
 ✓ src/test/similar-suppliers-notice.test.tsx (4 tests) 91ms
stderr | src/lib/__tests__/cache-scope.test.tsx > ecrã do subevento usa a configuração do Master > mostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/cache-scope.test.tsx (4 tests) 212ms
 ✓ src/test/portal-track-diag.test.ts (18 tests) 44ms
stdout | src/test/issue333-controller-message69.test.ts > finite controller-message69 receiver (local doubles, no Cloud) > parses exact supplied public constant without coercing PostgreSQL numeric
CONSTANT69 {"id":"proof69-constant-0001","queryFingerprint":"aa568e292cc8823072fef97e1af4e459ff11008c3cb557c3599fb3ca13cf7467","envelopeSha256":"0115b2d3c4c42206ff1c1e7d17f508458b334beed430a3014255e016923f32a1","bytes":705,"strict":false,"rows":1}

 ✓ src/test/issue333-controller-message69.test.ts (15 tests) 69ms
 ✓ src/components/data-entry/__tests__/DocumentAnalysisPanel.test.tsx (5 tests) 477ms
 ✓ src/test/data-entry-analysis-transport85.test.ts (4 tests) 105ms
stderr | src/test/consent-contract-322.test.ts > portal-track handler > consent: timeout da RPC → 503 bloqueado
[portal-track] consent rpc threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > bind falha (throw): lead entra sem ids Meta
[portal-track] consent bind threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > insert falha → 500 (sem falso sucesso)
[portal-track] insert lead_capture [33m500[39m

 ✓ src/test/consent-contract-322.test.ts (38 tests) 61ms
 ✓ src/components/__tests__/EventStatusBadge.test.tsx (5 tests) 98ms
 ✓ src/lib/__tests__/tickets-v2-properties.test.ts (19 tests) 111ms
 ✓ src/test/approve-lock-and-core.test.ts (6 tests) 56ms
 ✓ src/lib/__tests__/dre-nature-divergence.test.ts (2 tests) 22ms
 ✓ src/test/camarim-session-pdf-sanitize.test.ts (1 test) 57ms
 ✓ src/test/ticket-office-settlement-view.test.tsx (3 tests) 103ms
 ✓ src/lib/__tests__/event-settlement-engine.test.ts (27 tests) 35ms
 ✓ src/test/bol-m2-parser.test.ts (9 tests) 15ms
 ✓ src/test/newgang-portal.test.ts (10 tests) 48ms
 ✓ src/test/standalone-compat-prepared.test.ts (26 tests) 35ms
 ✓ src/lib/__tests__/partner-extras-kind.test.ts (3 tests) 11ms
 ✓ src/test/event-financials-invalidation.test.tsx (8 tests) 57ms
 ✓ src/test/newgang-portal-bundle.test.ts (5 tests) 11ms
 ✓ src/test/issue333-controller-message70.test.ts (6 tests | 1 skipped) 31ms
 ✓ src/lib/__tests__/bp-formula.test.ts (8 tests) 36ms
 ✓ src/test/ticket-office-settlement-card-date.test.tsx (1 test) 99ms
 ✓ src/test/data-entry-pilot8.test.ts (4 tests) 36ms
 ✓ src/lib/__tests__/combo-capacity.test.ts (9 tests) 36ms
 ✓ src/lib/__tests__/event-partner-mirror.test.ts (5 tests) 22ms
 ✓ src/lib/__tests__/google-click-match.test.ts (17 tests) 48ms
 ✓ src/test/song-link-ssr.test.ts (24 tests) 32ms
 ✓ src/lib/__tests__/event-ab-full-suite.test.ts (27 tests) 21ms
 ✓ src/lib/__tests__/ticket-office-settlement-calc.test.ts (22 tests) 12ms
 ✓ src/test/newgang-welcome-once.test.ts (7 tests) 38ms
 ✓ src/lib/__tests__/statement-grouping.test.ts (16 tests) 27ms
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

 ✓ src/components/TicketOfficePositionCards.test.tsx (7 tests) 41ms
 ✓ src/lib/__tests__/validations.test.ts (17 tests) 22ms
 ✓ src/test/coala-meta-audience-sync.test.ts (5 tests) 19ms
 ✓ src/lib/__tests__/standalone-attempt-routing.test.ts (13 tests) 24ms
 ✓ src/test/data-entry-analysis85.test.ts (26 tests) 64ms
 ✓ src/lib/__tests__/help-manual-parser.test.ts (10 tests) 25ms
 ✓ src/lib/__tests__/event-realized.test.ts (6 tests) 9ms
 ✓ src/lib/__tests__/bp-version-multi-diff.test.ts (10 tests) 35ms
 ✓ src/lib/__tests__/standalone-capabilities.test.ts (9 tests) 32ms
 ✓ src/lib/cost-center-map.test.ts (6 tests) 21ms
 ✓ src/lib/__tests__/tickets-v2-read-layer.test.ts (28 tests | 7 skipped) 20ms
 ✓ src/lib/__tests__/data-entry-contract.test.ts (8 tests) 25ms
 ✓ src/lib/__tests__/zone-price-turns.test.ts (3 tests) 48ms
 ✓ src/lib/__tests__/camarim-bp-rules.test.ts (6 tests) 183ms
 ✓ src/test/issue333-future-runner.test.ts (14 tests) 55ms
 ✓ src/test/newgang-edition-videos.test.ts (6 tests) 16ms
 ✓ src/lib/__tests__/multi-day-ticketing.test.ts (25 tests | 4 skipped) 20ms
 ✓ src/lib/__tests__/bp-planilha-version.test.ts (2 tests) 5ms
 ✓ src/test/derp248-tiktok-event-trackers.test.ts (11 tests) 18ms
 ✓ src/test/transaction-duplicate-check.test.ts (6 tests) 22ms
 ✓ src/lib/__tests__/utils.test.ts (8 tests) 27ms
 ✓ src/lib/__tests__/standalone-hash-check-pending.test.ts (3 tests) 24ms
 ✓ src/test/newgang-strict-audience-delivery.test.ts (4 tests) 16ms
 ✓ src/lib/__tests__/forecast-undo.test.ts (2 tests) 12ms
 ✓ src/lib/__tests__/payment-settlement.test.ts (8 tests) 7ms
 ✓ src/test/ticketline-import-format-transition.test.ts (2 tests) 13ms
 ✓ src/lib/__tests__/income-tax-out-of-event-result.test.ts (5 tests) 14ms
 ✓ src/test/newgang-edition-photos.test.ts (5 tests) 19ms
 ✓ src/lib/__tests__/settlement-participants.test.ts (10 tests) 17ms
 ✓ src/lib/__tests__/event-simulator-calc.test.ts (35 tests) 31ms
 ✓ src/lib/__tests__/iva.test.ts (22 tests) 13ms
 ✓ src/test/newgang-profile-country.test.ts (2 tests) 8ms
 ✓ src/test/silent-writes.test.ts (6 tests) 10ms
 ✓ src/test/newgang-wallet-levels.test.ts (14 tests) 13ms
 ✓ src/test/newgang-missions.test.ts (5 tests) 17ms
 ✓ src/test/supplier-similarity.test.ts (11 tests) 9ms
 ✓ src/test/issue333-preparation73.test.ts (6 tests) 14ms
 ✓ src/lib/__tests__/ticket-revenue-single-rule.test.ts (6 tests) 12ms
 ✓ src/lib/__tests__/simulator-prior-curve.test.ts (4 tests) 13ms
 ✓ src/test/crm-ingest-no-network.test.ts (12 tests) 7ms
 ✓ src/lib/__tests__/forecast-edit-diff.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/overhead-proration.test.ts (11 tests) 19ms
 ✓ src/lib/__tests__/ads-tour-split.test.ts (4 tests) 9ms
 ✓ src/lib/__tests__/bp-tx-matching.test.ts (12 tests) 15ms
 ✓ src/lib/__tests__/refund-grouping.test.ts (5 tests) 32ms
 ✓ src/lib/__tests__/event-revenue-basis.test.ts (12 tests) 15ms
 ✓ src/lib/__tests__/partner-disbursement.test.ts (11 tests) 13ms
 ✓ src/lib/__tests__/split-adjustment.test.ts (37 tests) 13ms
 ✓ src/test/payment-list-revalidate.test.ts (2 tests) 14ms
 ✓ src/components/__tests__/bp-installments.test.ts (20 tests) 24ms
 ✓ src/lib/__tests__/standalone-invoices.test.ts (4 tests) 6ms
 ✓ src/test/newgang-crews.test.ts (3 tests) 9ms
 ✓ src/lib/__tests__/forecast-boost.test.ts (12 tests) 14ms
 ✓ src/test/crm-audience-live-count.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/ticket-office-effective-open.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/settlement-perimeter.test.ts (6 tests) 10ms
 ✓ src/lib/__tests__/supplier-credits.test.ts (34 tests) 15ms
 ✓ src/test/bol-daily-parser.test.ts (9 tests) 14ms
 ✓ src/lib/__tests__/permissions-per-company.test.ts (5 tests) 19ms
 ✓ src/lib/__tests__/partner-settlement-internal-report.test.ts (12 tests) 12ms
 ✓ src/lib/__tests__/camarim-cash-preview.test.ts (5 tests) 11ms
 ✓ src/lib/__tests__/club-config-source.test.ts (12 tests) 12ms
 ✓ src/test/capi-p1-guard.test.ts (22 tests) 20ms
 ✓ src/lib/__tests__/settlement-revenue.test.ts (6 tests) 10ms
 ✓ src/test/example.test.ts (1 test) 4ms
 ✓ src/lib/__tests__/master-adopted-expense-proration.test.ts (3 tests) 7ms
 ✓ src/test/payment-method-domain.test.ts (8 tests) 12ms
 ✓ src/lib/__tests__/settlement-seal.test.ts (6 tests) 11ms
 ✓ src/lib/__tests__/tour-cache-sync.test.ts (8 tests) 10ms
 ✓ src/lib/__tests__/event-ab-calc.test.ts (12 tests) 13ms
 ✓ src/lib/__tests__/combo-gating.test.ts (19 tests) 9ms
 ✓ src/components/__tests__/PasswordStrengthIndicator.test.ts (7 tests) 10ms
 ✓ src/lib/__tests__/cache-tab-total.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/event-cost-basis-tour.test.ts (13 tests) 10ms
 ✓ src/lib/__tests__/transitory-transactions.test.ts (7 tests) 12ms
 ✓ src/lib/__tests__/event-nature.test.ts (4 tests) 40ms
 ✓ src/test/check-deploy.test.ts (3 tests) 23ms
 ✓ src/lib/__tests__/bp-line-review.test.ts (12 tests) 13ms
 ✓ src/test/newgang-history.test.ts (6 tests) 9ms
 ✓ src/lib/__tests__/standalone-capability-proposal.test.ts (3 tests) 9ms
 ✓ src/lib/__tests__/creative-media.test.ts (19 tests) 19ms
 ✓ src/lib/sepa/bank-execution.test.ts (7 tests) 23ms
 ✓ src/test/operation-key-domain.test.ts (4 tests) 10ms
 ✓ src/lib/__tests__/ticket-office-reconciliation.test.ts (7 tests) 19ms
 ✓ src/lib/__tests__/ebitda.test.ts (8 tests) 10ms
 ✓ src/lib/__tests__/event-ab-rounding.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/bp-line-required.test.ts (6 tests) 16ms
 ✓ src/test/capi-diag-no-secrets.test.ts (6 tests) 11ms
 ✓ src/lib/__tests__/report-event-cost.test.ts (7 tests) 12ms
 ✓ src/lib/__tests__/partner-extras-union-148.test.ts (6 tests) 7ms
 ✓ src/lib/__tests__/real-cache-deductions.test.ts (8 tests) 9ms
 ✓ src/test/partner-statement-cards.test.ts (3 tests) 14ms
stdout | src/lib/__tests__/card-session-theoretical.test.ts > #275 saldo teórico da sessão = fecho > sem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[#275] teórico = 636.68 esperado = 636.68

 ✓ src/lib/__tests__/card-session-theoretical.test.ts (1 test) 8ms
 ✓ src/lib/__tests__/accountant-account-filter.test.ts (5 tests) 5ms
 ✓ src/lib/__tests__/fecho-preconditions.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/permissions.test.ts (5 tests) 8ms
 ✓ src/lib/__tests__/standalone-snapshot.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/event-simulator-ab-scale.test.ts (8 tests) 7ms
 ✓ src/lib/__tests__/permissions-guards-proof.test.ts (1 test) 5ms
 ✓ src/lib/__tests__/zone-capacities.test.ts (2 tests) 6ms
 ✓ src/lib/__tests__/camarim-integrate.test.ts (4 tests) 8ms
 ✓ src/lib/__tests__/pl-category-matching.test.ts (5 tests) 6ms
 ✓ src/test/format-integer-conversions.test.ts (3 tests) 4ms
 ✓ src/lib/__tests__/event-cost-basis.test.ts (5 tests) 6ms
 ✓ src/test/ticket-office-settlement-eligible.test.ts (5 tests) 13ms
 ✓ src/test/contactos-list-paging.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/zone-price-elasticity.test.ts (7 tests) 8ms
 ✓ src/lib/__tests__/ticket-category.test.ts (4 tests) 5ms
 ✓ src/lib/__tests__/account-balance-settling.test.ts (2 tests) 6ms
 ✓ src/test/memory-index.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/session-copy.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/ticket-office-position.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/partner-rebill-vat.test.ts (4 tests) 8ms
 ✓ src/lib/crm/creativeReelsCheck.test.ts (5 tests) 8ms
 ✓ src/test/transaction-edit-modal-operation-key.test.ts (3 tests) 9ms
 ✓ src/test/coala-centro-custo-norm.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/audit.test.ts (4 tests) 5ms
 ✓ src/lib/__tests__/settlement-doc-text.test.ts (5 tests) 6ms
 ✓ src/lib/__tests__/zone-on-sale.test.ts (3 tests) 4ms
 ↓ src/test/partner-statement-edge.test.ts (1 test | 1 skipped)
 ↓ src/test/issue333-worker60.test.ts (4 tests | 4 skipped)

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/test/issue333-checkpoint66.test.ts > official transport captures complete actual PostgreSQL JSON result, validates nested config without copying
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/test/issue333-checkpoint66.test.ts:49:1


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 192 passed | 2 skipped (195)
      Tests  1 failed | 1651 passed | 6 skipped | 11 todo (1669)
   Start at  11:22:50
   Duration  103.54s (transform 12.32s, setup 172.38s, collect 193.00s, tests 49.00s, environment 809.80s, prepare 144.33s)


```

## bunx vitest run src/test/issue333-checkpoint66.test.ts src/test/issue333-proof60.test.ts (exit1)
```text

 RUN  v3.2.7 /dev-server

 ✓ src/test/issue333-checkpoint66.test.ts (18 tests) 3736ms
   ✓ official transport captures complete actual PostgreSQL JSON result, validates nested config without copying  3494ms
 ❯ src/test/issue333-proof60.test.ts (6 tests | 1 failed) 4486ms
   ✓ relay accepts only exact id + query fingerprint + complete expected schema 216ms
   ✓ relay rejects response with swapped id, wrong fingerprint, missing field or revoked shape  820ms
   ✓ relay never turns an absent field into PASS and times out without any response  408ms
   ✓ browser worker persists browser.json atomically even when a final guard fails 7ms
   ✓ browser worker asserts pair statuses captured before read-only check 2ms
   × relay rejects stale (out-of-order) and duplicate responses 3030ms
     → expected [Function] to throw error including 'fingerprint mismatch' but got 'Official SELECT bridge response deadl…'

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/test/issue333-proof60.test.ts > relay rejects stale (out-of-order) and duplicate responses
AssertionError: expected [Function] to throw error including 'fingerprint mismatch' but got 'Official SELECT bridge response deadl…'

Expected: [32m"fingerprint mismatch"[39m
Received: [31m"Official SELECT bridge response deadline; no account fallback"[39m

 ❯ src/test/issue333-proof60.test.ts:69:2
     67|  // but a response addressed to 0001 with 0002's fingerprint must fail
     68|  await respond(dir,'0001',{id:'0001',fingerprint:fp(q2),data:[{n:1}]});
     69|  await expect(p1).rejects.toThrow('fingerprint mismatch');
       |  ^
     70|  // duplicate id on the second request's file is rejected by identity …
     71|  await respond(dir,'0002',{id:'0001',fingerprint:fp(q2),data:[{n:2}]});

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 23 passed (24)
   Start at  11:25:10
   Duration  7.09s (transform 243ms, setup 303ms, collect 268ms, tests 8.22s, environment 793ms, prepare 1.49s)


```

## bunx vitest run --maxWorkers=2 (exit0)
```text

 RUN  v3.2.7 /dev-server

 ✓ src/test/issue333-proof60.test.ts (6 tests) 1847ms
   ✓ relay rejects response with swapped id, wrong fingerprint, missing field or revoked shape  816ms
   ✓ relay never turns an absent field into PASS and times out without any response  407ms
   ✓ relay rejects stale (out-of-order) and duplicate responses  406ms
stderr | src/components/data-entry/__tests__/DataEntryDialog.test.tsx > #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/document-detect.test.ts (5 tests) 1702ms
   ✓ detectDocumentQuad > deteta A4 rodado 12°, centrado com erro < 3%  487ms
   ✓ detectDocumentQuad > deteta A4 rodado -18°, à esquerda com erro < 3%  331ms
   ✓ detectDocumentQuad > deteta A4 rodado 20°, canto sup. dir. com erro < 3%  319ms
   ✓ detectDocumentQuad > deteta A4 rodado 6°, grande com erro < 3%  346ms
 ✓ src/components/data-entry/__tests__/DataEntryDialog.test.tsx (13 tests) 3983ms
   ✓ #333 DataEntryDialog > execução não validada: prévia visível, botão desativado mesmo após confirmação  458ms
   ✓ #333 DataEntryDialog > execução validada: exige confirmação explícita e mostra a conferência com a observação  337ms
   ✓ #333 DataEntryDialog > editar depois da prévia exige nova prévia/hash antes de executar  355ms
   ✓ #333 DataEntryDialog > retoma nunca declara sucesso por cache; repõe campos, lê check, sem commit  390ms
   ✓ #333 DataEntryDialog > execução tardia após close não mostra sucesso e retoma só confere  457ms
   ✓ #333 DataEntryDialog > execução tardia após company não mostra sucesso e retoma só confere  384ms
   ✓ #333 DataEntryDialog > resposta tardia de upload após contexto alterado é descartada  352ms
   ✓ #333 DataEntryDialog > resposta tardia de preview após contexto alterado é descartada  310ms
   ✓ #333 DataEntryDialog > utilizador diferente não recebe retoma; contexto revalidado antes de execução  441ms
 ✓ src/lib/__tests__/storage-multi-tenant.test.ts (14 tests) 359ms
   ✓ multi-tenant storage helpers > useSetActiveCompany limpa a cache do storage > depois da troca, withCompanyPath prefixa com a empresa nova  334ms
 ✓ src/lib/__tests__/postgrest-row-limit.test.ts (2 tests) 158ms
 ✓ src/test/event-financial-card-render-loop.test.tsx (1 test) 1108ms
   ✓ EventFinancialCard — sem ciclo de redesenho (#269) > chama onEbitdaParcelsChange uma única vez com queries vazias  1104ms
stderr | src/test/club-config-integration.test.tsx > #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/club-config-integration.test.tsx (7 tests) 802ms
   ✓ #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa  382ms
 ✓ src/lib/__tests__/postgrest-embeds.test.ts (2 tests) 145ms
 ✓ src/test/issue333-baseline58.test.ts (4 tests) 841ms
   ✓ relay unwraps official row arrays, refuses mismatched IDs, and has a finite timeout  811ms
 ✓ src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx (9 tests) 599ms
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

 ✓ src/components/__tests__/EventABTab.test.tsx (4 tests) 435ms
 ✓ src/lib/__tests__/no-direct-transaction-document-remove.test.ts (3 tests) 98ms
 ✓ src/components/data-entry/__tests__/DocumentAnalysisPanel.test.tsx (5 tests) 432ms
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

 ✓ src/lib/__tests__/overlay-layer.test.tsx (6 tests) 396ms
 ✓ src/test/forecast-attachment-counts.test.tsx (1 test) 403ms
   ✓ anexos do BP — uma leitura por evento (#269) > 361 linhas → 1 pedido a event_forecast_attachments  401ms
 ✓ src/components/standalone/__tests__/StandaloneReservedExecution.test.tsx (9 tests) 261ms
stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Esc não fecha o modal sob outra janela
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Dialog separa cabeçalho e corpo e mantém o X fora do scroll
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 ✓ src/test/mobile-modal-dismiss.test.tsx (6 tests) 285ms
stderr | src/pages/__tests__/ResetPassword.test.tsx > ResetPassword — token_hash flow > (a) não chama verifyOtp ao montar; só ao clicar Continuar
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/pages/__tests__/ResetPassword.test.tsx (3 tests) 205ms
 ✓ src/test/campaign-design-optional-roas.test.ts (15 tests) 218ms
 ✓ src/test/issue333-private-cloud57.test.ts (3 tests) 223ms
 ✓ src/test/newgang-wallet-google.test.ts (12 tests) 129ms
stderr | src/lib/__tests__/cache-scope.test.tsx > ecrã do subevento usa a configuração do Master > mostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/cache-scope.test.tsx (4 tests) 194ms
 ✓ src/test/coala-meta-audience-handler.test.ts (3 tests) 177ms
 ✓ src/test/ticket-office-statement-documents.test.tsx (6 tests) 157ms
 ✓ src/test/edge-fn-guard.test.ts (4 tests) 53ms
 ✓ src/lib/__tests__/camarim-bp-rules.test.ts (6 tests) 13ms
stderr | src/test/require-feature.test.tsx > visibilidade por company_features > rota bloqueada sem a chave
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/require-feature.test.tsx (4 tests) 126ms
stderr | src/lib/__tests__/permissions-guards-f2b.test.tsx > #311 F2b — guardas por permissão > manager com excepção module.crm entra em /crm e vê o cartão CRM activo
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/permissions-guards-f2b.test.tsx (5 tests) 208ms
 ✓ src/lib/__tests__/tickets-v2-properties.test.ts (19 tests) 56ms
 ✓ src/components/__tests__/LinkBpLineDialog-layer.test.tsx (1 test) 143ms
 ✓ src/lib/__tests__/postgrest-large-tables-mirror.test.ts (1 test) 11ms
 ✓ src/lib/__tests__/cache-percentage.test.tsx (4 tests) 70ms
 ✓ src/test/data-entry-analysis-transport85.test.ts (4 tests) 98ms
 ✓ src/test/ticket-office-settlement-view.test.tsx (3 tests) 69ms
 ✓ src/lib/__tests__/partner-statement-doc.test.ts (29 tests) 70ms
 ✓ src/test/newgang-content.test.tsx (2 tests) 66ms
 ✓ src/components/__tests__/EventStatusBadge.test.tsx (5 tests) 52ms
 ✓ src/test/ticket-office-settlement-card-date.test.tsx (1 test) 91ms
 ✓ src/test/similar-suppliers-notice.test.tsx (4 tests) 67ms
 ✓ src/components/__tests__/StatCard.test.tsx (4 tests) 70ms
stdout | src/test/issue333-controller-message69.test.ts > finite controller-message69 receiver (local doubles, no Cloud) > parses exact supplied public constant without coercing PostgreSQL numeric
CONSTANT69 {"id":"proof69-constant-0001","queryFingerprint":"aa568e292cc8823072fef97e1af4e459ff11008c3cb557c3599fb3ca13cf7467","envelopeSha256":"0115b2d3c4c42206ff1c1e7d17f508458b334beed430a3014255e016923f32a1","bytes":705,"strict":false,"rows":1}

 ✓ src/test/issue333-controller-message69.test.ts (15 tests) 43ms
 ✓ src/test/ticket-office-settlement-pdf.test.ts (1 test) 50ms
 ✓ src/test/data-entry-analysis85.test.ts (26 tests) 39ms
stderr | src/test/consent-contract-322.test.ts > portal-track handler > consent: timeout da RPC → 503 bloqueado
[portal-track] consent rpc threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > bind falha (throw): lead entra sem ids Meta
[portal-track] consent bind threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > insert falha → 500 (sem falso sucesso)
[portal-track] insert lead_capture [33m500[39m

 ✓ src/test/consent-contract-322.test.ts (38 tests) 45ms
 ✓ src/test/camarim-session-pdf-sanitize.test.ts (1 test) 36ms
 ✓ src/test/event-financials-invalidation.test.tsx (8 tests) 54ms
 ✓ src/test/approve-lock-and-core.test.ts (6 tests) 48ms
 ✓ src/test/issue333-future-runner.test.ts (14 tests) 13ms
 ✓ src/lib/__tests__/cache-report.test.ts (13 tests) 28ms
 ✓ src/lib/__tests__/google-click-match.test.ts (17 tests) 30ms
 ✓ src/lib/__tests__/zone-price-turns.test.ts (3 tests) 19ms
 ✓ src/test/newgang-portal.test.ts (10 tests) 20ms
 ✓ src/test/portal-track-diag.test.ts (18 tests) 36ms
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
 ✓ src/lib/__tests__/event-nature.test.ts (4 tests) 5ms
 ✓ src/test/newgang-welcome-once.test.ts (7 tests) 26ms
 ✓ src/lib/__tests__/combo-capacity.test.ts (9 tests) 26ms
 ✓ src/test/data-entry-pilot8.test.ts (4 tests) 21ms
 ✓ src/lib/__tests__/bp-formula.test.ts (8 tests) 22ms
 ✓ src/lib/__tests__/event-settlement-engine.test.ts (27 tests) 31ms
 ✓ src/test/standalone-compat-prepared.test.ts (26 tests) 31ms
 ✓ src/lib/__tests__/bp-version-multi-diff.test.ts (10 tests) 26ms
 ✓ src/test/song-link-ssr.test.ts (24 tests) 28ms
 ✓ src/lib/__tests__/refund-grouping.test.ts (5 tests) 8ms
 ✓ src/lib/__tests__/standalone-capabilities.test.ts (9 tests) 19ms
 ✓ src/lib/__tests__/event-simulator-calc.test.ts (35 tests) 13ms
 ✓ src/test/issue333-controller-message70.test.ts (6 tests | 1 skipped) 16ms
 ✓ src/lib/__tests__/statement-grouping.test.ts (16 tests) 27ms
 ✓ src/lib/__tests__/utils.test.ts (8 tests) 11ms
 ✓ src/lib/__tests__/help-manual-parser.test.ts (10 tests) 21ms
 ✓ src/lib/__tests__/data-entry-contract.test.ts (8 tests) 14ms
 ✓ src/lib/__tests__/standalone-attempt-routing.test.ts (13 tests) 16ms
 ✓ src/lib/__tests__/standalone-hash-check-pending.test.ts (3 tests) 18ms
 ✓ src/test/check-deploy.test.ts (3 tests) 9ms
 ✓ src/lib/sepa/bank-execution.test.ts (7 tests) 12ms
 ✓ src/components/__tests__/bp-installments.test.ts (20 tests) 16ms
 ✓ src/lib/__tests__/event-partner-mirror.test.ts (5 tests) 14ms
 ✓ src/test/transaction-duplicate-check.test.ts (6 tests) 23ms
 ✓ src/lib/__tests__/dre-nature-divergence.test.ts (2 tests) 7ms
 ✓ src/lib/__tests__/validations.test.ts (17 tests) 16ms
 ✓ src/lib/__tests__/event-ab-full-suite.test.ts (27 tests) 18ms
 ✓ src/lib/cost-center-map.test.ts (6 tests) 28ms
 ✓ src/lib/__tests__/tickets-v2-read-layer.test.ts (28 tests | 7 skipped) 22ms
 ✓ src/test/capi-p1-guard.test.ts (22 tests) 10ms
 ✓ src/lib/__tests__/multi-day-ticketing.test.ts (25 tests | 4 skipped) 14ms
 ✓ src/lib/__tests__/overhead-proration.test.ts (11 tests) 9ms
 ✓ src/test/coala-meta-audience-sync.test.ts (5 tests) 17ms
 ✓ src/lib/__tests__/ticket-office-reconciliation.test.ts (7 tests) 7ms
 ✓ src/test/newgang-edition-photos.test.ts (5 tests) 12ms
 ✓ src/lib/__tests__/permissions-per-company.test.ts (5 tests) 10ms
 ✓ src/lib/__tests__/creative-media.test.ts (19 tests) 11ms
 ✓ src/test/newgang-missions.test.ts (5 tests) 12ms
 ✓ src/test/derp248-tiktok-event-trackers.test.ts (11 tests) 10ms
 ✓ src/lib/__tests__/settlement-participants.test.ts (10 tests) 13ms
 ✓ src/lib/__tests__/bp-line-required.test.ts (6 tests) 7ms
 ✓ src/test/newgang-strict-audience-delivery.test.ts (4 tests) 15ms
 ✓ src/test/newgang-edition-videos.test.ts (6 tests) 12ms
 ✓ src/lib/__tests__/supplier-credits.test.ts (34 tests) 13ms
 ✓ src/lib/__tests__/event-revenue-basis.test.ts (12 tests) 10ms
 ✓ src/lib/__tests__/bp-tx-matching.test.ts (12 tests) 16ms
 ✓ src/test/bol-m2-parser.test.ts (9 tests) 15ms
 ✓ src/lib/__tests__/income-tax-out-of-event-result.test.ts (5 tests) 10ms
 ✓ src/lib/__tests__/forecast-boost.test.ts (12 tests) 18ms
 ✓ src/test/bol-daily-parser.test.ts (9 tests) 13ms
 ✓ src/test/issue333-preparation73.test.ts (6 tests) 20ms
 ✓ src/test/payment-list-revalidate.test.ts (2 tests) 5ms
 ✓ src/test/partner-statement-cards.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/split-adjustment.test.ts (37 tests) 14ms
 ✓ src/lib/__tests__/bp-line-review.test.ts (12 tests) 11ms
 ✓ src/lib/__tests__/event-ab-calc.test.ts (12 tests) 8ms
 ✓ src/test/ticket-office-settlement-eligible.test.ts (5 tests) 5ms
 ✓ src/lib/__tests__/partner-disbursement.test.ts (11 tests) 16ms
 ✓ src/test/ticketline-import-format-transition.test.ts (2 tests) 8ms
 ✓ src/test/newgang-wallet-levels.test.ts (14 tests) 11ms
 ✓ src/lib/__tests__/iva.test.ts (22 tests) 9ms
 ✓ src/lib/__tests__/simulator-prior-curve.test.ts (4 tests) 12ms
 ✓ src/lib/__tests__/forecast-undo.test.ts (2 tests) 16ms
 ✓ src/lib/__tests__/club-config-source.test.ts (12 tests) 11ms
 ✓ src/test/payment-method-domain.test.ts (8 tests) 10ms
 ✓ src/lib/__tests__/partner-settlement-internal-report.test.ts (12 tests) 12ms
 ✓ src/lib/__tests__/ticket-revenue-single-rule.test.ts (6 tests) 6ms
 ✓ src/lib/__tests__/transitory-transactions.test.ts (7 tests) 11ms
 ✓ src/lib/__tests__/report-event-cost.test.ts (7 tests) 8ms
 ✓ src/lib/__tests__/ticket-office-settlement-calc.test.ts (22 tests) 16ms
 ✓ src/test/capi-diag-no-secrets.test.ts (6 tests) 6ms
 ✓ src/lib/__tests__/partner-extras-kind.test.ts (3 tests) 4ms
 ✓ src/lib/__tests__/camarim-cash-preview.test.ts (5 tests) 8ms
 ✓ src/lib/__tests__/settlement-seal.test.ts (6 tests) 10ms
 ✓ src/test/newgang-portal-bundle.test.ts (5 tests) 13ms
 ✓ src/lib/__tests__/tour-cache-sync.test.ts (8 tests) 8ms
 ✓ src/lib/__tests__/ebitda.test.ts (8 tests) 10ms
 ✓ src/test/operation-key-domain.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/event-cost-basis-tour.test.ts (13 tests) 13ms
 ✓ src/components/__tests__/PasswordStrengthIndicator.test.ts (7 tests) 9ms
 ✓ src/lib/__tests__/settlement-perimeter.test.ts (6 tests) 7ms
 ✓ src/lib/__tests__/settlement-revenue.test.ts (6 tests) 15ms
 ✓ src/test/silent-writes.test.ts (6 tests) 8ms
 ✓ src/test/newgang-history.test.ts (6 tests) 9ms
 ✓ src/lib/__tests__/standalone-capability-proposal.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/ads-tour-split.test.ts (4 tests) 6ms
 ✓ src/test/supplier-similarity.test.ts (11 tests) 6ms
 ✓ src/lib/__tests__/event-realized.test.ts (6 tests) 6ms
 ✓ src/test/transaction-edit-modal-operation-key.test.ts (3 tests) 4ms
 ✓ src/test/newgang-crews.test.ts (3 tests) 12ms
 ✓ src/lib/__tests__/real-cache-deductions.test.ts (8 tests) 8ms
 ✓ src/lib/__tests__/combo-gating.test.ts (19 tests) 10ms
 ✓ src/test/contactos-list-paging.test.ts (3 tests) 6ms
 ✓ src/lib/crm/creativeReelsCheck.test.ts (5 tests) 4ms
 ✓ src/lib/__tests__/camarim-integrate.test.ts (4 tests) 6ms
stdout | src/lib/__tests__/card-session-theoretical.test.ts > #275 saldo teórico da sessão = fecho > sem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[#275] teórico = 636.68 esperado = 636.68

 ✓ src/lib/__tests__/card-session-theoretical.test.ts (1 test) 5ms
 ✓ src/lib/__tests__/zone-price-elasticity.test.ts (7 tests) 11ms
 ✓ src/lib/__tests__/permissions.test.ts (5 tests) 8ms
 ✓ src/test/newgang-profile-country.test.ts (2 tests) 4ms
 ✓ src/lib/__tests__/partner-rebill-vat.test.ts (4 tests) 4ms
 ✓ src/lib/__tests__/event-simulator-ab-scale.test.ts (8 tests) 6ms
 ✓ src/lib/__tests__/master-adopted-expense-proration.test.ts (3 tests) 10ms
 ✓ src/lib/__tests__/cache-tab-total.test.ts (4 tests) 8ms
 ✓ src/lib/__tests__/partner-extras-union-148.test.ts (6 tests) 6ms
 ✓ src/lib/__tests__/payment-settlement.test.ts (8 tests) 7ms
 ✓ src/test/crm-ingest-no-network.test.ts (12 tests) 10ms
 ✓ src/lib/__tests__/standalone-snapshot.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/event-cost-basis.test.ts (5 tests) 6ms
 ✓ src/lib/__tests__/pl-category-matching.test.ts (5 tests) 11ms
 ✓ src/lib/__tests__/fecho-preconditions.test.ts (4 tests) 9ms
 ✓ src/lib/__tests__/forecast-edit-diff.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/ticket-office-effective-open.test.ts (4 tests) 4ms
 ✓ src/lib/__tests__/zone-capacities.test.ts (2 tests) 4ms
 ✓ src/lib/__tests__/account-balance-settling.test.ts (2 tests) 8ms
 ✓ src/lib/__tests__/settlement-doc-text.test.ts (5 tests) 4ms
 ✓ src/test/crm-audience-live-count.test.ts (3 tests) 4ms
 ✓ src/lib/__tests__/standalone-invoices.test.ts (4 tests) 4ms
 ✓ src/lib/__tests__/event-ab-rounding.test.ts (4 tests) 5ms
 ✓ src/lib/__tests__/ticket-office-position.test.ts (3 tests) 4ms
 ✓ src/test/memory-index.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/bp-planilha-version.test.ts (2 tests) 4ms
 ✓ src/lib/__tests__/permissions-guards-proof.test.ts (1 test) 6ms
 ✓ src/lib/__tests__/session-copy.test.ts (3 tests) 4ms
 ✓ src/lib/__tests__/accountant-account-filter.test.ts (5 tests) 6ms
 ✓ src/test/coala-centro-custo-norm.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/ticket-category.test.ts (4 tests) 9ms
 ✓ src/lib/__tests__/audit.test.ts (4 tests) 5ms
 ✓ src/test/example.test.ts (1 test) 8ms
 ✓ src/test/format-integer-conversions.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/zone-on-sale.test.ts (3 tests) 4ms
 ↓ src/test/issue333-worker60.test.ts (4 tests | 4 skipped)
 ↓ src/test/partner-statement-edge.test.ts (1 test | 1 skipped)
 ✓ src/test/newgang-crm-whatsapp.test.ts (26 tests) 3543ms
 ✓ src/test/capi-v2.test.ts (29 tests) 3435ms
 ✓ src/test/newgang-crm-profile-fields.test.ts (9 tests) 3186ms
 ✓ src/test/issue333-checkpoint66.test.ts (18 tests) 3373ms
   ✓ official transport captures complete actual PostgreSQL JSON result, validates nested config without copying  3132ms
 ✓ src/test/issue333-controller-checkpoint71.test.ts (18 tests) 654ms
 ✓ src/test/data-entry-provider86.test.ts (9 tests) 301ms
 ✓ src/test/data-entry-control87.test.ts (21 tests) 251ms
 ✓ src/test/issue333-existing75.test.ts (22 tests) 112ms
 ✓ src/test/capi-v2-auth.test.ts (6 tests) 44ms

 Test Files  193 passed | 2 skipped (195)
      Tests  1652 passed | 6 skipped | 11 todo (1669)
   Start at  11:25:18
   Duration  172.42s (transform 7.44s, setup 24.64s, collect 39.22s, tests 33.25s, environment 158.12s, prepare 25.46s)


```
