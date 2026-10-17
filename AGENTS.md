# Architecture rules
- Read scoped AGENTS.md. Entry stays closed pending real storage/uniqueness proofs. Preserve candidates; read-only checks compare SQL+bytes and canonical context. Legacy compatibility stays in inert patches until reviewed; strong keys preserve separators, broad matches never prove reuse.

- Meta audience replacement uses a complete, paginated canonical collection and one ordered replacement session; failed batches stop before finalization, while dry runs never resolve tokens or invoke external delivery.
- Audience branches preserve legacy behavior; person ads use current proof and email-only, numeric-only delivery to avoid leakage. Inert SQL stays in supabase/manual pending authorization.

- Newgang demographic profile preparation uses a session-resolved member RPC and a separate permanent completion record; profile and canonical point credit commit atomically under site-before-member locks, so legacy capture snapshots and consent ledgers remain untouched. Optional demographic reads must fail independently of core portal responses, but session rejection never falls back to member data.

- Club CRM editors share the active-config query and fail-closed write policy; versioned points and level identities cannot be overwritten through legacy editors, while ranking delegates protected levels to the canonical RPC.

- Ticket-office position cards use the canonical balance RPC for retained funds and the existing sales RPC plus canonical per-event balance helper for unapportioned events; this prevents confusing gross sales with receivable balances or truncating sales reads.
- Statement summaries aggregate existing signed lines by type without changing financial records; the display must not create settlement movements.
- Smart-link events use a service-role-only atomic claim RPC before external delivery; the partial unique index prevents concurrent browser/SSR duplicates without removing historical records.
- Authenticated smart-link SSR treats unusable visitor IP as absent, never falls back to infrastructure IP or a shared no-IP rate quota; arrivals must survive missing metadata without inventing attribution.
- Growth summaries delegate omitted comparison periods to the private legacy implementation to preserve the complete prior JSON contract.
- Investment source projections reuse the canonical report's spend/classification CTEs without modifying that report; any future canonical change must regenerate and regression-test the projection to prevent drift.
- Campaign projections join by platform, account and external campaign ID, never by name, because campaign names are not unique.
- Manual modals separate their header from the scrolling body and use shared viewport/safe-area styles; this keeps dismissal accessible without changing the overlay stack.
- Arrival geo uses local DB-IP before paid APIs; monthly Range+inflate parts avoid edge CPU limits. Never store visitor IPs.
- Camarim cash cards, integration previews and session PDFs share the pure session cash helper; this keeps amounts and reimbursement labels consistent without changing financial records.
- Calculated cards refresh through the central event-financials invalidation helper plus debounced Realtime subscriptions; panel-local invalidation misses the keys the cards actually read.
- Brand-exclusive menus and routes are gated by company_features keys (RequireFeature + sidebar filter), never by company name; keeps one codebase for every tenant.
- Google Wallet artwork is resolved by the shared object builder; class-logo updates use a separate PATCH-only helper with UNDER_REVIEW. LoyaltyObject ignores hexBackgroundColor, so never claim per-object colors are applied or duplicate the established class without authorization.
- The artist-cache report builds its numbers only through src/lib/cache-report.ts on top of the Cachê-tab core (useRealCacheCalculation + computeCacheTabAmount); a second formula would make the report and the tab disagree.
- Coala test invites follow base counts and the normal path in a separate campaign, preserving buyer statistics. EXPLAIN legacy PostgreSQL calls: trailing defaults can make overloads ambiguous.
- Coala confirmation-page state reads use estado_convite and the canonical coala_list_members view, never confirmar_lista; separating read-only state from confirmation prevents page loads from writing consent or joining the list.
- Marketing-consent proof lives only in the service-role ledger, ordered by server revision (never client clocks), with client-generated subject tokens scoped by Origin-derived company+portal and per-decision receipts on every interaction; capture triggers revalidate under a per-subject lock and strip Meta identifiers otherwise, so stale retries, legacy or direct inserts can never become CAPI-eligible.
- Person advertising consent links session-resolved Club members to the existing marketing ledger through immutable references, with separate purpose subjects and an independent email history; unsubscribe commits revocation, suppression and token claim together to avoid partial withdrawal.
