# Architecture rules

- Ticket-office position cards use the canonical balance RPC for retained funds and the existing sales RPC plus canonical per-event balance helper for unapportioned events; this prevents confusing gross sales with receivable balances or truncating sales reads.
- Statement summaries aggregate existing signed lines by type without changing financial records; the display must not create settlement movements.
- Smart-link events use a service-role-only atomic claim RPC before external delivery; the partial unique index prevents concurrent browser/SSR duplicates without removing historical records.
- Authenticated smart-link SSR treats unusable visitor IP as absent, never falls back to infrastructure IP or a shared no-IP rate quota; arrivals must survive missing metadata without inventing attribution.
- Growth summaries delegate omitted comparison periods to the private legacy implementation to preserve the complete prior JSON contract.
- Investment source projections reuse the canonical report's spend/classification CTEs without modifying that report; any future canonical change must regenerate and regression-test the projection to prevent drift.
- Campaign projections join by platform, account and external campaign ID, never by name, because campaign names are not unique.
- Manual modals separate their header from the scrolling body and use shared viewport/safe-area styles; this keeps dismissal accessible without changing the overlay stack.
- Arrival city/region comes from the local DB-IP ranges table (loaded monthly in resumable Range+inflate parts) before any paid IP API; edge CPU limits forbid one-shot decompression and visitor IPs must never be stored.
- Camarim cash cards, integration previews and session PDFs share the pure session cash helper; this keeps amounts and reimbursement labels consistent without changing financial records.
- Calculated cards refresh through the central event-financials invalidation helper plus debounced Realtime subscriptions; panel-local invalidation misses the keys the cards actually read.
- Brand-exclusive menus and routes are gated by company_features keys (RequireFeature + sidebar filter), never by company name; keeps one codebase for every tenant.
- Google Wallet artwork is resolved by the shared object builder; class-logo updates use a separate PATCH-only helper with UNDER_REVIEW. LoyaltyObject ignores hexBackgroundColor, so never claim per-object colors are applied or duplicate the established class without authorization.
- The artist-cache report builds its numbers only through src/lib/cache-report.ts on top of the Cachê-tab core (useRealCacheCalculation + computeCacheTabAmount); a second formula would make the report and the tab disagree.
