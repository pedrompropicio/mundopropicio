# #333 — outputs integrais do leitor seguro

Sem segredos, PII, baselines financeiros ou IDs de infraestrutura.

## Arranque initdb

```text
The files belonging to this database system will be owned by user "lovable".
This user must also own the server process.

The database cluster will be initialized with locale "C".
The default database encoding has accordingly been set to "SQL_ASCII".
The default text search configuration will be set to "english".

Data page checksums are disabled.

fixing permissions on existing directory /tmp/issue333-capability/pg ... ok
creating subdirectories ... ok
selecting dynamic shared memory implementation ... posix
selecting default "max_connections" ... 100
selecting default "shared_buffers" ... 128MB
selecting default time zone ... UTC
creating configuration files ... ok
running bootstrap script ... ok
performing post-bootstrap initialization ... ok
syncing data to disk ... ok

Success. You can now start the database server using:

    pg_ctl -D /tmp/issue333-capability/pg -l logfile start


```

## PostgreSQL exato

```text
CREATE ROLE
CREATE ROLE
CREATE ROLE
CREATE TABLE
REVOKE
ALTER TABLE
CREATE FUNCTION
REVOKE
SELECT 1
SELECT 1
d2689cd635972292a93fd5abb4017f4ddd979760ccb0b7a56c6898580ab1c422  supabase/manual/20261017_issue333_capabilities.PROPOSTA.sql
CREATE FUNCTION
REVOKE
GRANT
DO
INSERT 0 2
DO
UPDATE 1
DO
UPDATE 2
DO
UPDATE 2
BEGIN
SET
 service_read_only 
-------------------
 t
(1 row)

DO
COMMIT
DO
SET
ERROR:  42501: permission denied for function standalone_attempt_capability_333
LOCATION:  aclcheck_error, aclchk.c:2845
Expected refusal for anon
SET
ERROR:  42501: permission denied for function standalone_attempt_capability_333
LOCATION:  aclcheck_error, aclchk.c:2845
Expected refusal for authenticated
PASS: no-row/false/mixed/reset/STABLE/search_path/SECDEF/PUBLIC/effective roles/read-only/original metadata unchanged

```

## Focados

```text

 RUN  v3.2.7 /dev-server

 ✓ src/lib/__tests__/standalone-capability-proposal.test.ts (3 tests) 9ms
 ✓ src/lib/__tests__/standalone-attempt-routing.test.ts (13 tests) 19ms
 ✓ src/lib/__tests__/standalone-capabilities.test.ts (9 tests) 21ms
 ✓ src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx (9 tests) 541ms

 Test Files  4 passed (4)
      Tests  34 passed (34)
   Start at  22:51:49
   Duration  4.66s (transform 460ms, setup 963ms, collect 962ms, tests 589ms, environment 6.23s, prepare 3.72s)


```

## Suite final completa

```text

 RUN  v3.2.7 /dev-server

 ✓ src/lib/__tests__/no-direct-transaction-document-remove.test.ts (3 tests) 980ms
   ✓ sem remoção directa em transaction-documents no frontend > nenhuma chamada directa a .remove nos 10 buckets contabilísticos  959ms
 ✓ src/lib/__tests__/postgrest-row-limit.test.ts (2 tests) 1056ms
   ✓ barreira dos 1.000 registos do PostgREST > [Issue #289] nenhuma leitura de tabela grande sem paginação  1017ms
 ✓ src/test/newgang-wallet-google.test.ts (12 tests) 321ms
 ✓ src/lib/__tests__/postgrest-embeds.test.ts (2 tests) 983ms
   ✓ embeds do PostgREST em pares com FK duplicada > [Issue #288] nenhum embed ambíguo sem a FK nomeada  977ms
 ✓ src/lib/__tests__/document-detect.test.ts (5 tests) 1848ms
   ✓ detectDocumentQuad > deteta A4 rodado 12°, centrado com erro < 3%  718ms
   ✓ detectDocumentQuad > deteta A4 rodado -18°, à esquerda com erro < 3%  356ms
 ✓ src/lib/__tests__/storage-multi-tenant.test.ts (14 tests) 1794ms
   ✓ multi-tenant storage helpers > useSetActiveCompany limpa a cache do storage > depois da troca, withCompanyPath prefixa com a empresa nova  1744ms
 ✓ src/test/forecast-attachment-counts.test.tsx (1 test) 651ms
   ✓ anexos do BP — uma leitura por evento (#269) > 361 linhas → 1 pedido a event_forecast_attachments  649ms
 ✓ src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx (9 tests) 1380ms
   ✓ #333 intent interactions without egress > corrupt uncertainty marker also fails closed  481ms
   ✓ #333 intent interactions without egress > company event invalidates confirmation before context props refresh  306ms
stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Esc não fecha o modal sob outra janela
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

stderr | src/test/mobile-modal-dismiss.test.tsx > Fecho de modais no telemóvel > Dialog separa cabeçalho e corpo e mantém o X fora do scroll
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 ✓ src/test/mobile-modal-dismiss.test.tsx (6 tests) 448ms
stderr | src/components/data-entry/__tests__/DataEntryDialog.test.tsx > #333 DataEntryDialog > endpoint ausente: mostra indisponível e não oferece ações
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

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

 ✓ src/lib/__tests__/overlay-layer.test.tsx (6 tests) 1396ms
   ✓ pilha de camadas — aninhamentos reais > #260 classificação acima da Nova Transação recebe foco e confirma escolha  824ms
 ✓ src/components/__tests__/EventABTab.test.tsx (4 tests) 1088ms
   ✓ EventABTab — UI smoke tests > renderiza sem crashar e mostra labels/inputs das zonas  515ms
   ✓ EventABTab — UI smoke tests > tem botão para adicionar uma nova zona  342ms
 ✓ src/test/club-config-integration.test.tsx (7 tests) 1840ms
   ✓ #327 integration without network > draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa  634ms
   ✓ #327 integration without network > refetch bloqueia e troca de site não reutiliza configuração  319ms
 ✓ src/test/event-financial-card-render-loop.test.tsx (1 test) 1221ms
   ✓ EventFinancialCard — sem ciclo de redesenho (#269) > chama onEbitdaParcelsChange uma única vez com queries vazias  1212ms
 ✓ src/components/data-entry/__tests__/DataEntryDialog.test.tsx (13 tests) 5509ms
   ✓ #333 DataEntryDialog > execução não validada: prévia visível, botão desativado mesmo após confirmação  488ms
   ✓ #333 DataEntryDialog > execução validada: exige confirmação explícita e mostra a conferência com a observação  476ms
   ✓ #333 DataEntryDialog > editar depois da prévia exige nova prévia/hash antes de executar  748ms
   ✓ #333 DataEntryDialog > retoma nunca declara sucesso por cache; repõe campos, lê check, sem commit  1101ms
   ✓ #333 DataEntryDialog > execução tardia após close não mostra sucesso e retoma só confere  534ms
   ✓ #333 DataEntryDialog > execução tardia após company não mostra sucesso e retoma só confere  365ms
   ✓ #333 DataEntryDialog > resposta tardia de upload após contexto alterado é descartada  517ms
   ✓ #333 DataEntryDialog > resposta tardia de preview após contexto alterado é descartada  336ms
   ✓ #333 DataEntryDialog > utilizador diferente não recebe retoma; contexto revalidado antes de execução  394ms
 ✓ src/test/edge-fn-guard.test.ts (4 tests) 329ms
   ✓ service_role_pelo_payload > nenhuma edge function aceita service role pelo claim sem isServiceRoleRequest  304ms
 ✓ src/test/campaign-design-optional-roas.test.ts (15 tests) 629ms
 ✓ src/test/coala-meta-audience-handler.test.ts (3 tests) 438ms
stderr | src/pages/__tests__/ResetPassword.test.tsx > ResetPassword — token_hash flow > (a) não chama verifyOtp ao montar; só ao clicar Continuar
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/pages/__tests__/ResetPassword.test.tsx (3 tests) 311ms
stderr | src/lib/__tests__/permissions-guards-f2b.test.tsx > #311 F2b — guardas por permissão > manager com excepção module.crm entra em /crm e vê o cartão CRM activo
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/permissions-guards-f2b.test.tsx (5 tests) 171ms
 ✓ src/components/__tests__/LinkBpLineDialog-layer.test.tsx (1 test) 308ms
 ✓ src/lib/__tests__/postgrest-large-tables-mirror.test.ts (1 test) 177ms
stderr | src/test/require-feature.test.tsx > visibilidade por company_features > rota bloqueada sem a chave
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/test/require-feature.test.tsx (4 tests) 269ms
stderr | src/lib/__tests__/cache-scope.test.tsx > ecrã do subevento usa a configuração do Master > mostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/lib/__tests__/cache-scope.test.tsx (4 tests) 235ms
 ✓ src/test/ticket-office-statement-documents.test.tsx (6 tests) 215ms
 ✓ src/test/ticket-office-settlement-view.test.tsx (3 tests) 109ms
 ✓ src/components/__tests__/StatCard.test.tsx (4 tests) 87ms
 ✓ src/lib/__tests__/cache-percentage.test.tsx (4 tests) 115ms
 ✓ src/components/__tests__/EventStatusBadge.test.tsx (5 tests) 62ms
 ✓ src/test/similar-suppliers-notice.test.tsx (4 tests) 81ms
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

 ✓ src/components/TicketOfficePositionCards.test.tsx (7 tests) 32ms
 ✓ src/lib/__tests__/tickets-v2-properties.test.ts (19 tests) 58ms
 ✓ src/test/standalone-compat-prepared.test.ts (26 tests) 35ms
 ✓ src/test/newgang-content.test.tsx (2 tests) 99ms
stderr | src/test/consent-contract-322.test.ts > portal-track handler > consent: timeout da RPC → 503 bloqueado
[portal-track] consent rpc threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > bind falha (throw): lead entra sem ids Meta
[portal-track] consent bind threw Error: timeout

stderr | src/test/consent-contract-322.test.ts > portal-track handler > insert falha → 500 (sem falso sucesso)
[portal-track] insert lead_capture [33m500[39m

 ✓ src/test/consent-contract-322.test.ts (38 tests) 73ms
 ✓ src/test/ticket-office-settlement-pdf.test.ts (1 test) 54ms
 ✓ src/test/approve-lock-and-core.test.ts (6 tests) 47ms
 ✓ src/test/ticket-office-settlement-card-date.test.tsx (1 test) 86ms
 ✓ src/test/camarim-session-pdf-sanitize.test.ts (1 test) 79ms
 ✓ src/lib/__tests__/partner-statement-doc.test.ts (29 tests) 186ms
 ✓ src/lib/__tests__/cache-report.test.ts (13 tests) 74ms
 ✓ src/test/newgang-portal.test.ts (10 tests) 51ms
 ✓ src/lib/__tests__/ticket-category.test.ts (4 tests) 14ms
 ✓ src/lib/__tests__/zone-price-turns.test.ts (3 tests) 91ms
 ✓ src/lib/__tests__/tickets-v2-read-layer.test.ts (28 tests | 7 skipped) 35ms
 ✓ src/test/event-financials-invalidation.test.tsx (8 tests) 94ms
 ✓ src/test/newgang-welcome-once.test.ts (7 tests) 33ms
 ✓ src/test/newgang-crews.test.ts (3 tests) 7ms
 ✓ src/lib/cost-center-map.test.ts (6 tests) 52ms
 ✓ src/lib/__tests__/bp-formula.test.ts (8 tests) 49ms
 ✓ src/lib/__tests__/google-click-match.test.ts (17 tests) 47ms
 ✓ src/test/newgang-strict-audience-delivery.test.ts (4 tests) 14ms
 ✓ src/test/song-link-ssr.test.ts (24 tests) 53ms
 ✓ src/lib/__tests__/combo-capacity.test.ts (9 tests) 30ms
 ✓ src/test/supplier-similarity.test.ts (11 tests) 11ms
 ✓ src/lib/__tests__/data-entry-contract.test.ts (8 tests) 36ms
 ✓ src/components/__tests__/PasswordStrengthIndicator.test.ts (7 tests) 10ms
 ✓ src/test/contactos-list-paging.test.ts (3 tests) 12ms
 ✓ src/lib/__tests__/standalone-capabilities.test.ts (9 tests) 43ms
 ✓ src/lib/__tests__/ads-tour-split.test.ts (4 tests) 10ms
 ✓ src/lib/__tests__/bp-version-multi-diff.test.ts (10 tests) 21ms
 ✓ src/lib/__tests__/help-manual-parser.test.ts (10 tests) 35ms
 ✓ src/test/capi-diag-no-secrets.test.ts (6 tests) 10ms
 ✓ src/lib/__tests__/event-settlement-engine.test.ts (27 tests) 240ms
 ✓ src/lib/__tests__/combo-gating.test.ts (19 tests) 7ms
 ✓ src/test/newgang-missions.test.ts (5 tests) 27ms
 ✓ src/lib/__tests__/statement-grouping.test.ts (16 tests) 30ms
 ✓ src/test/transaction-edit-modal-operation-key.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/standalone-attempt-routing.test.ts (13 tests) 20ms
 ✓ src/test/coala-meta-audience-sync.test.ts (5 tests) 19ms
 ✓ src/lib/__tests__/ticket-office-settlement-calc.test.ts (22 tests) 10ms
 ✓ src/lib/__tests__/event-ab-full-suite.test.ts (27 tests) 15ms
 ✓ src/lib/__tests__/bp-tx-matching.test.ts (12 tests) 12ms
 ✓ src/lib/__tests__/utils.test.ts (8 tests) 15ms
 ✓ src/lib/__tests__/multi-day-ticketing.test.ts (25 tests | 4 skipped) 14ms
 ✓ src/lib/__tests__/event-simulator-calc.test.ts (35 tests) 13ms
 ✓ src/lib/__tests__/split-adjustment.test.ts (37 tests) 15ms
 ✓ src/lib/__tests__/event-partner-mirror.test.ts (5 tests) 21ms
 ✓ src/test/transaction-duplicate-check.test.ts (6 tests) 17ms
 ✓ src/test/derp248-tiktok-event-trackers.test.ts (11 tests) 16ms
 ✓ src/lib/__tests__/camarim-cash-preview.test.ts (5 tests) 14ms
 ✓ src/test/bol-m2-parser.test.ts (9 tests) 11ms
 ✓ src/lib/__tests__/standalone-capability-proposal.test.ts (3 tests) 8ms
 ✓ src/lib/__tests__/permissions.test.ts (5 tests) 30ms
 ✓ src/lib/__tests__/ticket-office-reconciliation.test.ts (7 tests) 19ms
 ✓ src/test/newgang-edition-videos.test.ts (6 tests) 34ms
 ✓ src/test/ticketline-import-format-transition.test.ts (2 tests) 38ms
 ✓ src/test/newgang-edition-photos.test.ts (5 tests) 17ms
 ✓ src/lib/__tests__/forecast-boost.test.ts (12 tests) 16ms
 ✓ src/lib/__tests__/iva.test.ts (22 tests) 15ms
 ✓ src/lib/__tests__/real-cache-deductions.test.ts (8 tests) 9ms
 ✓ src/lib/__tests__/validations.test.ts (17 tests) 27ms
 ✓ src/lib/__tests__/permissions-per-company.test.ts (5 tests) 10ms
 ✓ src/lib/__tests__/bp-line-review.test.ts (12 tests) 10ms
 ✓ src/test/ticket-office-settlement-eligible.test.ts (5 tests) 3ms
 ✓ src/test/bol-daily-parser.test.ts (9 tests) 14ms
 ✓ src/lib/__tests__/overhead-proration.test.ts (11 tests) 12ms
 ✓ src/lib/__tests__/settlement-participants.test.ts (10 tests) 15ms
 ✓ src/test/newgang-portal-bundle.test.ts (5 tests) 11ms
 ✓ src/lib/__tests__/ebitda.test.ts (8 tests) 9ms
 ✓ src/test/capi-p1-guard.test.ts (22 tests) 12ms
 ✓ src/test/crm-ingest-no-network.test.ts (12 tests) 5ms
 ✓ src/lib/__tests__/partner-extras-union-148.test.ts (6 tests) 6ms
 ✓ src/lib/__tests__/event-revenue-basis.test.ts (12 tests) 9ms
 ✓ src/test/newgang-wallet-levels.test.ts (14 tests) 8ms
 ✓ src/lib/sepa/bank-execution.test.ts (7 tests) 10ms
 ✓ src/test/newgang-history.test.ts (6 tests) 9ms
 ✓ src/lib/__tests__/creative-media.test.ts (19 tests) 8ms
 ✓ src/lib/__tests__/club-config-source.test.ts (12 tests) 11ms
 ✓ src/lib/__tests__/camarim-bp-rules.test.ts (6 tests) 17ms
 ✓ src/lib/__tests__/payment-settlement.test.ts (8 tests) 9ms
 ✓ src/lib/__tests__/forecast-undo.test.ts (2 tests) 18ms
 ✓ src/lib/__tests__/settlement-seal.test.ts (6 tests) 55ms
 ✓ src/test/payment-method-domain.test.ts (8 tests) 16ms
 ✓ src/test/payment-list-revalidate.test.ts (2 tests) 25ms
 ✓ src/lib/__tests__/refund-grouping.test.ts (5 tests) 15ms
 ✓ src/lib/__tests__/income-tax-out-of-event-result.test.ts (5 tests) 8ms
 ✓ src/lib/__tests__/partner-settlement-internal-report.test.ts (12 tests) 11ms
 ✓ src/lib/__tests__/event-nature.test.ts (4 tests) 11ms
 ✓ src/lib/__tests__/permissions-guards-proof.test.ts (1 test) 5ms
 ✓ src/lib/__tests__/tour-cache-sync.test.ts (8 tests) 15ms
 ✓ src/test/silent-writes.test.ts (6 tests) 7ms
 ✓ src/lib/__tests__/partner-disbursement.test.ts (11 tests) 11ms
stdout | src/lib/__tests__/card-session-theoretical.test.ts > #275 saldo teórico da sessão = fecho > sem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[#275] teórico = 636.68 esperado = 636.68

 ✓ src/lib/__tests__/card-session-theoretical.test.ts (1 test) 15ms
 ✓ src/lib/__tests__/camarim-integrate.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/event-cost-basis-tour.test.ts (13 tests) 14ms
 ✓ src/lib/__tests__/report-event-cost.test.ts (7 tests) 13ms
 ✓ src/lib/__tests__/event-ab-calc.test.ts (12 tests) 9ms
 ✓ src/test/operation-key-domain.test.ts (4 tests) 6ms
 ✓ src/test/memory-index.test.ts (3 tests) 5ms
 ✓ src/test/check-deploy.test.ts (3 tests) 6ms
 ✓ src/test/crm-audience-live-count.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/settlement-revenue.test.ts (6 tests) 14ms
 ✓ src/lib/__tests__/supplier-credits.test.ts (34 tests) 12ms
 ✓ src/lib/__tests__/ticket-revenue-single-rule.test.ts (6 tests) 8ms
 ✓ src/lib/__tests__/partner-extras-kind.test.ts (3 tests) 5ms
 ✓ src/components/__tests__/bp-installments.test.ts (20 tests) 23ms
 ✓ src/lib/__tests__/transitory-transactions.test.ts (7 tests) 12ms
 ✓ src/lib/__tests__/simulator-prior-curve.test.ts (4 tests) 11ms
 ✓ src/lib/__tests__/event-realized.test.ts (6 tests) 6ms
 ✓ src/lib/__tests__/zone-price-elasticity.test.ts (7 tests) 12ms
 ✓ src/lib/__tests__/settlement-perimeter.test.ts (6 tests) 6ms
 ✓ src/lib/crm/creativeReelsCheck.test.ts (5 tests) 9ms
 ✓ src/lib/__tests__/fecho-preconditions.test.ts (4 tests) 6ms
 ✓ src/lib/__tests__/ticket-office-position.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/forecast-edit-diff.test.ts (3 tests) 11ms
 ✓ src/lib/__tests__/bp-line-required.test.ts (6 tests) 7ms
 ✓ src/lib/__tests__/pl-category-matching.test.ts (5 tests) 8ms
 ✓ src/lib/__tests__/event-cost-basis.test.ts (5 tests) 7ms
 ✓ src/lib/__tests__/master-adopted-expense-proration.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/event-simulator-ab-scale.test.ts (8 tests) 6ms
 ✓ src/lib/__tests__/cache-tab-total.test.ts (4 tests) 9ms
 ✓ src/lib/__tests__/ticket-office-effective-open.test.ts (4 tests) 5ms
 ✓ src/lib/__tests__/bp-planilha-version.test.ts (2 tests) 8ms
 ✓ src/test/partner-statement-cards.test.ts (3 tests) 6ms
 ✓ src/lib/__tests__/standalone-invoices.test.ts (4 tests) 3ms
 ✓ src/lib/__tests__/settlement-doc-text.test.ts (5 tests) 6ms
 ✓ src/lib/__tests__/event-ab-rounding.test.ts (4 tests) 5ms
 ✓ src/test/newgang-profile-country.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/account-balance-settling.test.ts (2 tests) 4ms
 ✓ src/lib/__tests__/dre-nature-divergence.test.ts (2 tests) 4ms
 ✓ src/lib/__tests__/session-copy.test.ts (3 tests) 5ms
 ✓ src/lib/__tests__/audit.test.ts (4 tests) 5ms
 ✓ src/test/coala-centro-custo-norm.test.ts (2 tests) 4ms
 ✓ src/lib/__tests__/accountant-account-filter.test.ts (5 tests) 5ms
 ✓ src/lib/__tests__/zone-capacities.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/partner-rebill-vat.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/zone-on-sale.test.ts (3 tests) 5ms
 ✓ src/test/example.test.ts (1 test) 2ms
 ↓ src/test/partner-statement-edge.test.ts (1 test | 1 skipped)
 ✓ src/test/format-integer-conversions.test.ts (3 tests) 4ms

 Test Files  169 passed | 1 skipped (170)
      Tests  1368 passed | 1 skipped | 11 todo (1380)
   Start at  22:55:52
   Duration  116.55s (transform 16.75s, setup 189.60s, collect 201.41s, tests 27.10s, environment 960.33s, prepare 167.98s)


```

## HTTP Live sem dados sensíveis

```text
{
  "service_rpc": {
    "status": 200,
    "body": {
      "scanner_create": false,
      "accountant_edit": false
    }
  },
  "anon_rpc": {
    "status": 401,
    "code": "42501"
  },
  "endpoint_no_session": {
    "status": 401
  },
  "endpoint_anon": {
    "status": 401
  },
  "options": {
    "status": 200,
    "allow_headers": "authorization, x-client-info, apikey, content-type, x-attempt-user, x-attempt-company",
    "allow_methods": "POST, OPTIONS"
  }
}
```
