# Architecture rules
- Read nested AGENTS.md (data-entry/ too). Entry closed pending storage/uniqueness; retain artifacts. Inert tests credential-free. Strong keys retain separators; broad matches prove no reuse. #333 SQL inert/ACL guarded; no SELECT/timers across turns. Controller-message: request, exact bytes/hash/schema; local sizes aren't delivery proof.

- Meta audience replacement uses complete paginated canonical data and one ordered replacement session; failed batches stop before finalization; dry runs never resolve tokens or deliver externally.
- Audience branches preserve legacy behavior; person ads use current proof and email-only, numeric-only delivery to avoid leakage. Inert SQL stays in supabase/manual pending authorization.

- Newgang profiles use a session-resolved member RPC and permanent completion record; profile and canonical credit commit atomically under site-before-member locks, preserving capture snapshots and consent ledgers. Optional demographic failures cannot break core responses; rejected sessions never fall back to member data.

- Club CRM editors share the active-config query and fail-closed write policy; versioned points and level identities cannot be overwritten through legacy editors, while ranking delegates protected levels to the canonical RPC.

- Ticket-office cards use canonical balance RPC for retained funds, existing sales RPC plus canonical per-event balance helper for unapportioned events; avoid gross-sales/receivable confusion and truncated reads.
- Statements aggregate signed lines by type without changing financial records or creating settlement movements.
- Smart-link events use a service-role-only atomic claim RPC before external delivery; the partial unique index prevents concurrent browser/SSR duplicates without removing historical records.
- Authenticated smart-link SSR treats unusable visitor IP as absent, never falls back to infrastructure IP or a shared no-IP rate quota; arrivals must survive missing metadata without inventing attribution.
- Growth summaries delegate omitted comparisons to private legacy logic, preserving JSON.
- Investment source projections reuse the canonical report's spend/classification CTEs without modifying that report; any future canonical change must regenerate and regression-test the projection to prevent drift.
- Campaign joins: platform/account/external ID, never names.
- Manual modals separate their header from the scrolling body and use shared viewport/safe-area styles; this keeps dismissal accessible without changing the overlay stack.
- Arrival geo uses local DB-IP before paid APIs; monthly Range+inflate parts avoid edge CPU limits. Never store visitor IPs.
- Camarim cash cards, integration previews and session PDFs share the pure session cash helper; this keeps amounts and reimbursement labels consistent without changing financial records.
- Calculated cards refresh through the central event-financials invalidation helper plus debounced Realtime subscriptions; panel-local invalidation misses the keys the cards actually read.
- Brand-exclusive menus and routes are gated by company_features keys (RequireFeature + sidebar filter), never by company name; keeps one codebase for every tenant.
- Google Wallet artwork is resolved by the shared object builder; class-logo updates use a separate PATCH-only helper with UNDER_REVIEW. LoyaltyObject ignores hexBackgroundColor, so never claim per-object colors are applied or duplicate the established class without authorization.
- Artist-cache reports use only src/lib/cache-report.ts over the Cachê-tab core (useRealCacheCalculation + computeCacheTabAmount); no second formula, to prevent disagreement.
- Coala test invites follow base counts and the normal path in a separate campaign, preserving buyer statistics. EXPLAIN legacy PostgreSQL calls: trailing defaults can make overloads ambiguous.
- Coala confirmation-page state reads use estado_convite and the canonical coala_list_members view, never confirmar_lista; separating read-only state from confirmation prevents page loads from writing consent or joining the list.
- Marketing proof stays in the service-role ledger, ordered by server revision, never client clocks. Client subject tokens use Origin-derived company+portal scope and per-decision receipts; capture triggers revalidate under subject locks, stripping Meta identifiers without proof. Stale retries, legacy and direct inserts never become CAPI-eligible.
- Person advertising consent links session-resolved Club members to the existing marketing ledger through immutable references, with separate purpose subjects and an independent email history; unsubscribe commits revocation, suppression and token claim together to avoid partial withdrawal.
- Edge functions share only via `_shared/`; no cross-function imports. Scanner/entry share extraction, never writers; entry retains guards.


- CRM WhatsApp uses crm_whatsapp_eligible/invoker views. Ledger/member-phone triggers share a contact-locked projection; matching-fingerprint phones only fill empty contacts, preventing revocation leaks and overwrites.

- Entry Gmail compares live Google users/me/profile with confirmed current Auth email before storage and every read; encrypted envelopes bind the verified email and user/company, so changed identities and legacy keys fail closed.
