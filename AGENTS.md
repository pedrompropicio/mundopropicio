# Architecture rules
- Accountant ZIP exact-ID selection is validated in its function-local pure helper against caller company and non-accounting accounts; absent IDs retain period selection, so search exports cannot widen silently.
- Partner statement revenue summaries are grouped in the shared document builder; exporters only render groups and retain original detail lines, keeping team and partner documents consistent.
- #333 assistant replay uses bounded client context, the hash-bound original request and only the selected revalidated email metadata (with its server-numbered attachments); each email is read once per turn and repeated refusals terminate, so the model cannot loop; release budget headroom only on validated completion/usage; post-selection results always route to the existing review panel.
- Read nested AGENTS.md (data-entry/ too). Entry closed pending storage/uniqueness; retain artifacts. Inert tests credential-free. Strong keys retain separators; broad matches prove no reuse. #333 SQL inert/ACL guarded; no SELECT/timers across turns. Controller-message: request, exact bytes/hash/schema; local sizes aren't delivery proof.

- Meta audience replacement uses complete paginated canonical data and one ordered replacement session; failed batches stop before finalization; dry runs never resolve tokens or deliver externally.
- Audience branches preserve legacy behavior; person ads use current proof and email-only, numeric-only delivery to avoid leakage. Inert SQL stays in supabase/manual pending authorization.

- Newgang profiles use a session-resolved member RPC and permanent completion record; profile and canonical credit commit atomically under site-before-member locks, preserving capture snapshots and consent ledgers. Optional demographic failures cannot break core responses; rejected sessions never fall back to member data.

- Club CRM editors share the active-config query and fail-closed write policy; versioned points and level identities cannot be overwritten through legacy editors, while ranking delegates protected levels to the canonical RPC.

- Ticket-office cards use canonical retained-balance RPC and sales RPC + per-event balance for unapportioned events; avoid gross/receivable confusion or truncated reads.
- Statements sum signed types without financial writes; guards lock OLD/NEW parents in UUID order before status checks to serialize confirmation.
- Smart-link delivery claims atomically via service-role RPC; a partial unique index prevents browser/SSR duplicates, retaining history.
- Authenticated smart-link SSR treats unusable visitor IP as absent, never falls back to infrastructure IP or a shared no-IP rate quota; arrivals must survive missing metadata without inventing attribution.
- Growth summaries use legacy comparisons; campaign joins use platform/account/external ID, never names.
- Smart-link test markers inherit arrivals, suppress before slots/tokens, log allowlisted Meta receipts.
- Investment projections reuse canonical spend/classification CTEs unchanged; canonical changes must regenerate and regression-test them; avoids drift.
- Manual modals: header apart from scrolling body, shared viewport/safe-area styles, so dismissal stays reachable.
- Arrival geo uses local DB-IP before paid APIs; monthly Range+inflate parts avoid edge CPU limits. Never store visitor IPs.
- Camarim cash cards, previews and session PDFs share the pure session cash helper, keeping amounts/labels consistent.
- Calculated cards refresh through the central event-financials invalidation helper plus debounced Realtime subscriptions; panel-local invalidation misses card keys.
- Brand menus/routes use company_features (RequireFeature + sidebar), never company names, preserving one tenant codebase.
- Google Wallet artwork is resolved by the shared object builder; class-logo updates use a separate PATCH-only helper with UNDER_REVIEW. LoyaltyObject ignores hexBackgroundColor, so never claim per-object colors are applied or duplicate the established class without authorization.
- Artist-cache reports use only src/lib/cache-report.ts over the Cachê-tab core (useRealCacheCalculation + computeCacheTabAmount); no second formula, to prevent disagreement.
- Coala test invites follow base counts and the normal path in a separate campaign, preserving buyer statistics. EXPLAIN legacy PostgreSQL calls: trailing defaults can make overloads ambiguous.
- Coala confirmation-page state reads use estado_convite and the canonical coala_list_members view, never confirmar_lista; separating read-only state from confirmation prevents page loads from writing consent or joining the list.
- Marketing proof stays in the service-role ledger, ordered by server revision, never client clocks. Client subject tokens use Origin-derived company+portal scope and per-decision receipts; capture triggers revalidate under subject locks, stripping Meta identifiers without proof. Stale retries, legacy and direct inserts never become CAPI-eligible.
- Person advertising consent links session-resolved Club members to the existing marketing ledger through immutable references, with separate purpose subjects and an independent email history; unsubscribe commits revocation, suppression and token claim together to avoid partial withdrawal.
- Edge functions share only via `_shared/`. Scanner/entry share extraction, never writers; entry retains guards.
- S4A playlist capture uses a side-effect-free shared parser for current 1/28-day windows; daily comparisons retain unknown coverage and canonical artist access, never infer missing historical seeds or treat top-100 playlists as all stream sources.
- Ticketline daily capture uses the side-effect-free shared mapping/core before one UPSERT; strong codes retain order/separators and omitted unidentified nonconsumers preserve their mirror, preventing partial writes and inferred false zeros.

- CRM WhatsApp uses crm_whatsapp_eligible/invoker views. Ledger/member-phone triggers share a contact-locked projection; matching-fingerprint phones only fill empty contacts, avoiding leaks/overwrites.
- Coala person-consent candidates read their ledger directly in eligibility; token-locked writes fill only empty contact phones and never project the contact consent boolean, keeping the Club guards and existing send paths unchanged.
- The capture consent summary is a SELECT-only security-invoker view over lead_capture; preserve underlying RLS and distinguish historical reconstruction from contemporaneous records without changing ingestion.

- Cache payments only via cache_* RPCs (mother/city children); optional line choices use local `cache.line_choices`, server-checked.
- Partner payment contracts use five named RPCs with private shared validators; replacement delegates to cancel/create and cancellation clears reciprocal links before deleting generated payables, avoiding drift and FK failures. Prepared SQL remains manual-only until separate approval.
- Partner freeze snapshots project the participant and its containing settlement node through the shared partner-contracts adapter; render frozen origin only from that snapshot and reconcile displayed cents explicitly, avoiding a second engine or historical drift.
- Event stages use server RPCs and the existing close-blockers/cache-freeze sources; the stamp guard runs before legacy-reopen cleanup so caller writes stay blocked without breaking existing status transitions.
- Issue #335 stays manual-only: guards require a private backend/transaction context created by the command trigger, never role/GUC alone; delegate parent locks without broad UPDATE, and verify existing-object candidate rollbacks against the full catalog before separate installation approval. Owner-created DDL triggers belong to the trusted computing base; a separate manual read-only trigger-name allowlist detects additions, never claims prevention or body-replacement detection.
- Issue #335 role probes must set session identity for NOLOGIN roles, not merely SET ROLE from a superuser session; otherwise role-assumption tests measure the bootstrap administrator rather than the actor.
- Issue #335 column probes require a separate faithful local catalog without the candidates; missing controls and non-mutating or invalid values fail acceptance instead of becoming skips, because target labels alone do not prove legacy parity.
- Separate artist hourly collector; service writer fences stale request_id. Read nested AGENTS.md, including supabase/ and function directories.
<!-- LOVABLE:BEGIN -->
- Arrival comparison uses UTC hourly raw counts, not unique visitors. Nonwaiting artist/hour trigger locks preserve capture; bounded rebuilds acknowledge only pending IDs captured before their source snapshot, retaining late commits for repair.
<!-- LOVABLE:END -->


## Padrão obrigatório de datas — toda a plataforma

Decisão do Pedro, 23/10/2026, aplicável a qualquer Issue e frente: todos os novos campos de data, incluindo filtros, formulários e modais, usam o componente partilhado `DatePicker` de `src/components/ui/date-picker.tsx`, com apresentação `dd/MM/aaaa` e o calendário visual da plataforma. Não implementar `input type="date"` nem um calendário próprio/nativo do navegador.

- Quando a data puder ser omitida, disponibilizar limpeza explícita (`clearable`) que apague também o valor canónico, sem o repor ao perder o foco ou renderizar novamente.
- Datas obrigatórias vazias mantêm a validação correspondente. Não preencher com a data de hoje sem requisito explícito.
- Na implementação e revisão de qualquer Issue, conferir todos os campos de data criados ou alterados contra este padrão, incluindo filtros secundários.
- Esta regra não autoriza uma migração global dos campos existentes; corrigir os campos no âmbito autorizado da demanda.
- Smart-link A/B variants are computed server-side in song-link-event (pure ab-variant.ts) and returned/stored only; never sent in Meta/TikTok payloads, so the test cannot alter attribution.
- Club member erasure goes only through service-role `club_member_erase` (dry_run default, tombstone row, hash-only suppression, PII-free log); it anonymizes only the member company's own lead tables (never other tenants or fiscal ticket-buyer records); a fresh signup consent clears only the erasure hash suppression; senders must check both plain and `sha256:` suppression.
- Financial-position base is one server-aggregated read RPC (get_financial_position_base) reusing event_stage, _account_true_balance_raw and ticket_office_balances; it never computes result/partner shares (P5 shared settlement engine), so there is no SQL replica of the engine.
- Financial-position UI parses the RPC through one strict pure schema and scopes its query by active company, user, permission state and year; it only formats returned aggregates, preventing silent defaults or a second financial engine.
- Financial-position P5 (edge `financial-position`) gates through the base RPC with the caller JWT, takes events from its eventos_por_estagio, runs the engine only via statement-service computeStatementEngine/buildPartnerStatement and assembles in a pure shared module; stage totals and projection partner lines stay separate in the versioned fail-closed contract, and a failed event marks output incomplete instead of summing partials.
- Future coverage reads its own all-years base RPC with the caller JWT under its independent deadline; the settlement engine and main aggregates retain the requested-year base, preventing future events in later years from disappearing or widening the engine workload.
- Ticket-office retained composition (statement position + open events + residual) lives only in decomposeTicketOfficeRetained; the office panel and the financial-position screen both call it, so the two views cannot drift.
- P5c planning gross forecast lives only in `_shared/ticketing/planning-forecast.ts`, imported by the edge and scenario modal; legacy coverage JSON remains exact without active forecasts, preventing formula drift or default-mode financial changes.
- Financial-position concurrent loaders use named `loadPositionReads` slots with fixture assembly regression coverage; positional loader swaps must not recur.

- Partner-only revenue exclusion is partitioned by the shared settlement revenue engine, preserving real-bucket presence and the event anchor; all allocation consumers must use that partition to avoid BP refill and residual drift.
