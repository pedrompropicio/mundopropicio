# Architecture rules

- Ticket-office position cards use the canonical balance RPC for retained funds and the existing sales RPC plus canonical per-event balance helper for unapportioned events; this prevents confusing gross sales with receivable balances or truncating sales reads.
- Statement summaries aggregate existing signed lines by type without changing financial records; the display must not create settlement movements.
- Smart-link events use a service-role-only atomic claim RPC before external delivery; the partial unique index prevents concurrent browser/SSR duplicates without removing historical records.
- Authenticated smart-link SSR treats unusable visitor IP as absent, never falls back to infrastructure IP or a shared no-IP rate quota; arrivals must survive missing metadata without inventing attribution.
- Growth summaries delegate omitted comparison periods to the private legacy implementation to preserve the complete prior JSON contract.
- Investment source projections reuse the canonical report's spend/classification CTEs without modifying that report; any future canonical change must regenerate and regression-test the projection to prevent drift.
- Campaign projections join by platform, account and external campaign ID, never by name, because campaign names are not unique.