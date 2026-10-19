# Tarefa89 — outputs locais integrais

## Script de reprodução local anterior à correção

```typescript
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {OfficialSelectBridge} from '/dev-server/docs/testes/issue333/pilot8/private-cloud57.ts';
const dir=await mkdtemp('/tmp/issue333-repro89-');
const originalNow=Date.now, originalTimer=globalThis.setTimeout;
let clock=0;
Date.now=()=>clock;
globalThis.setTimeout=((resolve:()=>void,ms:number)=>{
 if(ms!==200) throw Error('unexpected poll');
 void writeFile(`${dir}/0001.response.json`,JSON.stringify({id:'0001',fingerprint:'0'.repeat(64),data:[{n:1}]})).then(()=>{clock=3001;resolve();});
 return 0;
}) as typeof setTimeout;
try {
 await new OfficialSelectBridge(dir,3000).select('SELECT 1 AS n',['n']);
 throw Error('unexpected acceptance');
} catch(error) {
 console.log('Old transport, validly delivered mismatched response after scheduler stall:',(error as Error).message);
 console.log('Expected fingerprint mismatch; reproduced deadline instead. Reproduction exit=1');
 process.exitCode=1;
} finally {Date.now=originalNow;globalThis.setTimeout=originalTimer;await rm(dir,{recursive:true,force:true});}
```

## Reprodução antiga (exit1 esperado)

Comando: `bun /tmp/issue333-tarefa89/reproduce.ts`

```text
Old transport, validly delivered mismatched response after scheduler stall: Official SELECT bridge response deadline; no account fallback
Expected fingerprint mismatch; reproduced deadline instead. Reproduction exit=1
```

## Pertinentes (exit0)

Comando: `bunx vitest run src/test/issue333-proof60.test.ts src/test/issue333-private-cloud57.test.ts src/test/issue333-baseline58.test.ts src/test/issue333-future-runner.test.ts`

```text

 RUN  v3.2.7 /dev-server

 ✓ src/test/issue333-future-runner.test.ts (14 tests) 20ms
 ✓ src/test/issue333-private-cloud57.test.ts (3 tests) 228ms
 ✓ src/test/issue333-proof60.test.ts (7 tests) 448ms
   ✓ relay never turns an absent field into PASS and times out without any response  407ms
 ✓ src/test/issue333-baseline58.test.ts (4 tests) 840ms
   ✓ relay unwraps official row arrays, refuses mismatched IDs, and has a finite timeout  812ms

 Test Files  4 passed (4)
      Tests  28 passed (28)
   Start at  11:52:05
   Duration  5.58s (transform 259ms, setup 817ms, collect 443ms, tests 1.54s, environment 6.24s, prepare 4.35s)

```

## Suite default UMA execução (exit0)

Comando: `bunx vitest run`

```text

 RUN  v3.2.7 /dev-server

 ✓ src/lib/__tests__/split-adjustment.test.ts (37 tests) 25ms
 ✓ src/lib/__tests__/supplier-credits.test.ts (34 tests) 11ms
 ✓ src/lib/__tests__/event-simulator-calc.test.ts (35 tests) 16ms
 ✓ src/lib/__tests__/statement-grouping.test.ts (16 tests) 28ms
 ✓ src/lib/__tests__/multi-day-ticketing.test.ts (25 tests | 4 skipped) 18ms
 ✓ src/lib/__tests__/event-ab-full-suite.test.ts (27 tests) 20ms
 ✓ src/lib/__tests__/ticket-office-settlement-calc.test.ts (22 tests) 29ms
 ✓ src/lib/__tests__/tickets-v2-properties.test.ts (19 tests) 94ms
stderr | src/test/consent-contract-322.test.ts > portal-track handler > consent: timeout da RPC → 503 bloqueado
[portal-track] consent rpc threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > bind falha (throw): lead entra sem ids Meta
[portal-track] consent bind threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > insert falha → 500 (sem falso sucesso)
[portal-track] insert lead_capture [33m500[39m

 ✓ src/test/consent-contract-322.test.ts (38 tests) 70ms
 ✓ src/lib/__tests__/event-settlement-engine.test.ts (27 tests) 31ms
 ✓ src/test/data-entry-analysis85.test.ts (26 tests) 76ms
stderr | src/test/club-config-integration.test.tsx > #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/club-config-integration.test.tsx (7 tests) 933ms
   ✓ #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa  415ms
 ✓ src/lib/__tests__/tickets-v2-read-layer.test.ts (28 tests | 7 skipped) 36ms
 ✓ src/lib/__tests__/forecast-boost.test.ts (12 tests) 22ms
 ✓ src/lib/__tests__/partner-settlement-internal-report.test.ts (12 tests) 11ms
 ✓ src/test/newgang-wallet-google.test.ts (12 tests) 201ms
 ✓ src/lib/__tests__/cache-report.test.ts (13 tests) 57ms
 ✓ src/lib/__tests__/bp-version-multi-diff.test.ts (10 tests) 32ms
 ✓ src/test/issue333-proof60.test.ts (7 tests) 459ms
   ✓ relay never turns an absent field into PASS and times out without any response  410ms
 ✓ src/lib/__tests__/partner-statement-doc.test.ts (29 tests) 104ms
 ✓ src/lib/__tests__/event-revenue-basis.test.ts (12 tests) 9ms
 ✓ src/lib/__tests__/iva.test.ts (22 tests) 15ms
 ✓ src/lib/__tests__/storage-multi-tenant.test.ts (14 tests) 1469ms
   ✓ multi-tenant storage helpers > useSetActiveCompany limpa a cache do storage > depois da troca, withCompanyPath prefixa com a empresa nova  1455ms
 ✓ src/lib/__tests__/event-ab-calc.test.ts (12 tests) 9ms
stdout | src/test/issue333-controller-message69.test.ts > finite controller-message69 receiver (local doubles, no Cloud) > parses exact supplied public constant without coercing PostgreSQL numeric
CONSTANT69 {"id":"proof69-constant-0001","queryFingerprint":"aa568e292cc8823072fef97e1af4e459ff11008c3cb557c3599fb3ca13cf7467","envelopeSha256":"0115b2d3c4c42206ff1c1e7d17f508458b334beed430a3014255e016923f32a1","bytes":705,"strict":false,"rows":1}

 ✓ src/test/issue333-controller-message69.test.ts (15 tests) 62ms
 ✓ src/test/ticketline-import-format-transition.test.ts (2 tests) 10ms
 ✓ src/test/issue333-future-runner.test.ts (14 tests) 20ms
 ✓ src/test/bol-m2-parser.test.ts (9 tests) 11ms
 ✓ src/lib/__tests__/postgrest-embeds.test.ts (2 tests) 566ms
   ✓ embeds do PostgREST em pares com FK duplicada > [Issue #288] nenhum embed ambíguo sem a FK nomeada  560ms
 ✓ src/lib/__tests__/postgrest-row-limit.test.ts (2 tests) 540ms
   ✓ barreira dos 1.000 registos do PostgREST > [Issue #289] nenhuma leitura de tabela grande sem paginação  534ms
 ✓ src/test/event-financials-invalidation.test.tsx (8 tests) 51ms
 ✓ src/test/bol-daily-parser.test.ts (9 tests) 11ms
 ✓ src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx (9 tests) 616ms
 ✓ src/test/newgang-portal.test.ts (10 tests) 32ms
 ✓ src/lib/__tests__/bp-tx-matching.test.ts (12 tests) 13ms
 ✓ src/test/ticket-office-statement-documents.test.tsx (6 tests) 224ms
 ✓ src/test/derp248-tiktok-event-trackers.test.ts (11 tests) 28ms
 ✓ src/lib/__tests__/overhead-proration.test.ts (11 tests) 11ms
 ✓ src/lib/__tests__/combo-gating.test.ts (19 tests) 8ms
 ✓ src/lib/__tests__/standalone-attempt-routing.test.ts (13 tests) 31ms
 ✓ src/lib/__tests__/event-cost-basis-tour.test.ts (13 tests) 11ms
 ✓ src/lib/__tests__/help-manual-parser.test.ts (10 tests) 23ms
 ✓ src/lib/__tests__/partner-disbursement.test.ts (11 tests) 11ms
 ↓ src/test/issue333-worker60.test.ts (4 tests | 4 skipped)
stderr | src/components/data-entry/__tests__/DataEntryDialog.test.tsx > #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/issue333-controller-message70.test.ts (6 tests | 1 skipped) 27ms
 ✓ src/test/edge-fn-guard.test.ts (4 tests) 271ms
 ✓ src/test/newgang-portal-bundle.test.ts (5 tests) 13ms
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

 ✓ src/components/__tests__/EventABTab.test.tsx (4 tests) 657ms
   ✓ EventABTab — UI smoke tests > renderiza sem crashar e mostra labels/inputs das zonas  326ms
 ✓ src/lib/__tests__/ebitda.test.ts (8 tests) 17ms
 ✓ src/lib/sepa/bank-execution.test.ts (7 tests) 24ms
 ✓ src/lib/__tests__/creative-media.test.ts (19 tests) 18ms
 ✓ src/lib/__tests__/combo-capacity.test.ts (9 tests) 40ms
 ✓ src/components/data-entry/__tests__/DataEntryDialog.test.tsx (13 tests) 4148ms
   ✓ #333 DataEntryDialog > execução não validada: prévia visível, botão desativado mesmo após confirmação  501ms
   ✓ #333 DataEntryDialog > execução validada: exige confirmação explícita e mostra a conferência com a observação  362ms
   ✓ #333 DataEntryDialog > editar depois da prévia exige nova prévia/hash antes de executar  345ms
   ✓ #333 DataEntryDialog > retoma nunca declara sucesso por cache; repõe campos, lê check, sem commit  387ms
   ✓ #333 DataEntryDialog > execução tardia após close não mostra sucesso e retoma só confere  367ms
   ✓ #333 DataEntryDialog > execução tardia após company não mostra sucesso e retoma só confere  417ms
   ✓ #333 DataEntryDialog > resposta tardia de upload após contexto alterado é descartada  533ms
   ✓ #333 DataEntryDialog > resposta tardia de preview após contexto alterado é descartada  368ms
   ✓ #333 DataEntryDialog > utilizador diferente não recebe retoma; contexto revalidado antes de execução  407ms
 ✓ src/test/partner-statement-cards.test.ts (3 tests) 8ms
 ✓ src/test/newgang-welcome-once.test.ts (7 tests) 36ms
 ✓ src/lib/__tests__/settlement-participants.test.ts (10 tests) 16ms
 ✓ src/components/__tests__/bp-installments.test.ts (20 tests) 20ms
 ✓ src/test/campaign-design-optional-roas.test.ts (15 tests) 312ms
 ✓ src/lib/__tests__/transitory-transactions.test.ts (7 tests) 8ms
 ✓ src/lib/__tests__/real-cache-deductions.test.ts (8 tests) 19ms
 ✓ src/test/newgang-edition-videos.test.ts (6 tests) 24ms
 ✓ src/lib/__tests__/data-entry-contract.test.ts (8 tests) 24ms
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

 ✓ src/lib/__tests__/overlay-layer.test.tsx (6 tests) 518ms
   ✓ pilha de camadas — aninhamentos reais > #260 classificação acima da Nova Transação recebe foco e confirma escolha  318ms
 ✓ src/lib/__tests__/bp-line-review.test.ts (12 tests) 16ms
stderr | src/lib/__tests__/permissions-guards-f2b.test.tsx > #311 F2b — guardas por permissão > manager com excepção module.crm entra em /crm e vê o cartão CRM activo
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/google-click-match.test.ts (17 tests) 45ms
 ✓ src/lib/__tests__/permissions-guards-f2b.test.tsx (5 tests) 161ms
 ✓ src/lib/__tests__/settlement-seal.test.ts (6 tests) 11ms
 ✓ src/lib/__tests__/event-simulator-ab-scale.test.ts (8 tests) 10ms
 ✓ src/test/newgang-history.test.ts (6 tests) 10ms
 ✓ src/lib/__tests__/bp-formula.test.ts (8 tests) 34ms
 ✓ src/lib/__tests__/camarim-bp-rules.test.ts (6 tests) 16ms
 ✓ src/test/transaction-duplicate-check.test.ts (6 tests) 19ms
 ✓ src/lib/__tests__/income-tax-out-of-event-result.test.ts (5 tests) 9ms
 ✓ src/lib/__tests__/cache-tab-total.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/settlement-revenue.test.ts (6 tests) 10ms
 ✓ src/test/payment-method-domain.test.ts (8 tests) 9ms
 ✓ src/lib/__tests__/ticket-revenue-single-rule.test.ts (6 tests) 12ms
 ✓ src/test/coala-meta-audience-handler.test.ts (3 tests) 183ms
 ✓ src/lib/__tests__/zone-price-elasticity.test.ts (7 tests) 8ms
 ✓ src/test/coala-meta-audience-sync.test.ts (5 tests) 23ms
 ✓ src/lib/__tests__/document-detect.test.ts (5 tests) 1442ms
   ✓ detectDocumentQuad > deteta A4 rodado 12°, centrado com erro < 3%  386ms
   ✓ detectDocumentQuad > deteta A4 rodado 20°, canto sup. dir. com erro < 3%  308ms
 ✓ src/test/newgang-missions.test.ts (5 tests) 13ms
 ✓ src/test/data-entry-pilot8.test.ts (4 tests) 35ms
 ✓ src/test/approve-lock-and-core.test.ts (6 tests) 49ms
 ✓ src/lib/__tests__/validations.test.ts (17 tests) 14ms
 ✓ src/lib/__tests__/tour-cache-sync.test.ts (8 tests) 9ms
 ✓ src/lib/__tests__/standalone-capabilities.test.ts (9 tests) 26ms
stderr | src/pages/__tests__/ResetPassword.test.tsx > ResetPassword — token_hash flow > (a) não chama verifyOtp ao montar; só ao clicar Continuar
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Esc não fecha o modal sob outra janela
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 ✓ src/lib/__tests__/club-config-source.test.ts (12 tests) 12ms
stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Dialog separa cabeçalho e corpo e mantém o X fora do scroll
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 ✓ src/pages/__tests__/ResetPassword.test.tsx (3 tests) 261ms
 ✓ src/test/mobile-modal-dismiss.test.tsx (6 tests) 329ms
 ✓ src/lib/__tests__/report-event-cost.test.ts (7 tests) 9ms
 ✓ src/test/newgang-edition-photos.test.ts (5 tests) 18ms
 ✓ src/components/standalone/__tests__/StandaloneReservedExecution.test.tsx (9 tests) 301ms
 ✓ src/test/capi-p1-guard.test.ts (22 tests) 11ms
 ✓ src/lib/__tests__/permissions-per-company.test.ts (5 tests) 19ms
 ✓ src/test/crm-ingest-no-network.test.ts (12 tests) 11ms
 ✓ src/lib/__tests__/ticket-office-effective-open.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/refund-grouping.test.ts (5 tests) 9ms
 ✓ src/test/newgang-wallet-levels.test.ts (14 tests) 13ms
 ✓ src/lib/__tests__/settlement-doc-text.test.ts (5 tests) 5ms
 ✓ src/test/ticket-office-settlement-pdf.test.ts (1 test) 59ms
 ✓ src/lib/__tests__/no-direct-transaction-document-remove.test.ts (3 tests) 424ms
   ✓ sem remoção directa em transaction-documents no frontend > nenhuma chamada directa a .remove nos 10 buckets contabilísticos  421ms
 ✓ src/components/data-entry/__tests__/DocumentAnalysisPanel.test.tsx (5 tests) 447ms
 ✓ src/lib/__tests__/cache-percentage.test.tsx (4 tests) 93ms
 ✓ src/lib/__tests__/event-ab-rounding.test.ts (4 tests) 5ms
 ✓ src/lib/__tests__/event-partner-mirror.test.ts (5 tests) 17ms
 ✓ src/test/data-entry-analysis-transport85.test.ts (4 tests) 111ms
 ✓ src/test/portal-track-diag.test.ts (18 tests) 39ms
 ✓ src/test/song-link-ssr.test.ts (24 tests) 65ms
 ✓ src/lib/__tests__/ticket-office-reconciliation.test.ts (7 tests) 9ms
 ✓ src/lib/__tests__/payment-settlement.test.ts (8 tests) 9ms
 ✓ src/test/newgang-strict-audience-delivery.test.ts (4 tests) 18ms
 ✓ src/test/issue333-private-cloud57.test.ts (3 tests) 229ms
stderr | src/lib/__tests__/cache-scope.test.tsx > ecrã do subevento usa a configuração do Master > mostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/issue333-baseline58.test.ts (4 tests) 843ms
   ✓ relay unwraps official row arrays, refuses mismatched IDs, and has a finite timeout  813ms
 ✓ src/lib/__tests__/cache-scope.test.tsx (4 tests) 187ms
 ✓ src/lib/__tests__/standalone-snapshot.test.ts (4 tests) 6ms
 ✓ src/test/camarim-session-pdf-sanitize.test.ts (1 test) 45ms
 ✓ src/lib/cost-center-map.test.ts (6 tests) 25ms
 ✓ src/lib/__tests__/master-adopted-expense-proration.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/camarim-cash-preview.test.ts (5 tests) 14ms
 ✓ src/lib/__tests__/ads-tour-split.test.ts (4 tests) 8ms
 ✓ src/lib/__tests__/camarim-integrate.test.ts (4 tests) 8ms
 ✓ src/test/ticket-office-settlement-eligible.test.ts (5 tests) 5ms
 ✓ src/lib/__tests__/partner-extras-union-148.test.ts (6 tests) 5ms
 ✓ src/test/issue333-preparation73.test.ts (6 tests) 20ms
 ✓ src/lib/__tests__/standalone-hash-check-pending.test.ts (3 tests) 24ms
 ✓ src/lib/crm/creativeReelsCheck.test.ts (5 tests) 6ms
 ✓ src/test/newgang-crews.test.ts (3 tests) 7ms
stdout | src/lib/__tests__/card-session-theoretical.test.ts > #275 saldo teórico da sessão = fecho > sem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[#275] teórico = 636.68 esperado = 636.68

 ✓ src/lib/__tests__/card-session-theoretical.test.ts (1 test) 6ms
 ✓ src/lib/__tests__/simulator-prior-curve.test.ts (4 tests) 10ms
 ✓ src/lib/__tests__/event-nature.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/forecast-undo.test.ts (2 tests) 11ms
 ✓ src/test/silent-writes.test.ts (6 tests) 10ms
 ✓ src/test/capi-diag-no-secrets.test.ts (6 tests) 8ms
 ✓ src/lib/__tests__/permissions.test.ts (5 tests) 8ms
 ✓ src/test/ticket-office-settlement-view.test.tsx (3 tests) 79ms
stderr | src/test/require-feature.test.tsx > visibilidade por company_features > rota bloqueada sem a chave
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/event-financial-card-render-loop.test.tsx (1 test) 1117ms
   ✓ EventFinancialCard — sem ciclo de redesenho (#269) > chama onEbitdaParcelsChange uma única vez com queries vazias  1115ms
 ✓ src/test/require-feature.test.tsx (4 tests) 143ms
 ✓ src/test/operation-key-domain.test.ts (4 tests) 6ms
 ↓ src/test/partner-statement-edge.test.ts (1 test | 1 skipped)
 ✓ src/lib/__tests__/pl-category-matching.test.ts (5 tests) 7ms
 ✓ src/test/similar-suppliers-notice.test.tsx (4 tests) 84ms
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

 ✓ src/components/TicketOfficePositionCards.test.tsx (7 tests) 37ms
 ✓ src/test/memory-index.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/permissions-guards-proof.test.ts (1 test) 5ms
 ✓ src/lib/__tests__/ticket-office-position.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/event-cost-basis.test.ts (5 tests) 7ms
 ✓ src/lib/__tests__/account-balance-settling.test.ts (2 tests) 6ms
 ✓ src/test/ticket-office-settlement-card-date.test.tsx (1 test) 107ms
 ✓ src/lib/__tests__/session-copy.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/dre-nature-divergence.test.ts (2 tests) 6ms
 ✓ src/lib/__tests__/settlement-perimeter.test.ts (6 tests) 10ms
 ✓ src/lib/__tests__/bp-line-required.test.ts (6 tests) 8ms
 ✓ src/lib/__tests__/partner-extras-kind.test.ts (3 tests) 7ms
 ✓ src/lib/__tests__/utils.test.ts (8 tests) 16ms
 ✓ src/lib/__tests__/partner-rebill-vat.test.ts (4 tests) 5ms
 ✓ src/lib/__tests__/zone-capacities.test.ts (2 tests) 6ms
 ✓ src/test/supplier-similarity.test.ts (11 tests) 8ms
 ✓ src/lib/__tests__/fecho-preconditions.test.ts (4 tests) 8ms
 ✓ src/test/forecast-attachment-counts.test.tsx (1 test) 431ms
   ✓ anexos do BP — uma leitura por evento (#269) > 361 linhas → 1 pedido a event_forecast_attachments  429ms
 ✓ src/test/transaction-edit-modal-operation-key.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/ticket-category.test.ts (4 tests) 7ms
 ✓ src/test/contactos-list-paging.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/postgrest-large-tables-mirror.test.ts (1 test) 67ms
 ✓ src/lib/__tests__/standalone-capability-proposal.test.ts (3 tests) 10ms
 ✓ src/lib/__tests__/standalone-invoices.test.ts (4 tests) 15ms
 ✓ src/test/newgang-profile-country.test.ts (2 tests) 9ms
 ✓ src/test/crm-audience-live-count.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/event-realized.test.ts (6 tests) 6ms
 ✓ src/lib/__tests__/zone-price-turns.test.ts (3 tests) 20ms
 ✓ src/components/__tests__/PasswordStrengthIndicator.test.ts (7 tests) 7ms
 ✓ src/components/__tests__/LinkBpLineDialog-layer.test.tsx (1 test) 183ms
 ✓ src/components/__tests__/StatCard.test.tsx (4 tests) 89ms
 ✓ src/test/coala-centro-custo-norm.test.ts (2 tests) 6ms
 ✓ src/test/check-deploy.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/forecast-edit-diff.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/accountant-account-filter.test.ts (5 tests) 5ms
 ✓ src/test/newgang-content.test.tsx (2 tests) 96ms
 ✓ src/lib/__tests__/bp-planilha-version.test.ts (2 tests) 5ms
 ✓ src/test/payment-list-revalidate.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/zone-on-sale.test.ts (3 tests) 36ms
 ✓ src/lib/__tests__/audit.test.ts (4 tests) 5ms
 ✓ src/test/data-entry-control87.test.ts (21 tests) 299ms
 ✓ src/test/issue333-controller-checkpoint71.test.ts (18 tests) 1004ms
 ✓ src/components/__tests__/EventStatusBadge.test.tsx (5 tests) 145ms
 ✓ src/test/example.test.ts (1 test) 5ms
 ✓ src/test/issue333-existing75.test.ts (22 tests) 166ms
 ✓ src/test/capi-v2-auth.test.ts (6 tests) 83ms
 ✓ src/test/standalone-compat-prepared.test.ts (26 tests) 93ms
 ✓ src/test/format-integer-conversions.test.ts (3 tests) 7ms
 ✓ src/test/data-entry-provider86.test.ts (9 tests) 358ms
 ✓ src/test/capi-v2.test.ts (29 tests) 4161ms
 ✓ src/test/newgang-crm-whatsapp.test.ts (26 tests) 4278ms
 ✓ src/test/issue333-checkpoint66.test.ts (18 tests) 4215ms
   ✓ official transport captures complete actual PostgreSQL JSON result, validates nested config without copying  3927ms
 ✓ src/test/newgang-crm-profile-fields.test.ts (9 tests) 3793ms

 Test Files  193 passed | 2 skipped (195)
      Tests  1653 passed | 6 skipped | 11 todo (1670)
   Start at  11:52:20
   Duration  82.69s (transform 12.68s, setup 125.69s, collect 174.78s, tests 39.55s, environment 622.36s, prepare 106.99s)

```

