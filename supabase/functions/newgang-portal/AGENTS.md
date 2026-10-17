# Newgang API architecture
- Immediate capture inserts delegate their ID to the canonical ingest collector; welcome retries reacquire the same durable reservation only after proven pre-enqueue failure, while unknown remains blocked to prevent duplicate delivery.
- WhatsApp consent lives in the same append-only #332 ledger family; grants require a valid profile phone and store only server-keyed HMAC-SHA256 — a phone change invalidates the grant until re-authorization, and revoke never requires a number.
- Profile city guards use the country-validating normalizer; incomplete lead captures validate municipalities only for explicit PT without inferring country, while public cities exposes only the bounded reference cache. This separates profile completeness from legacy capture metadata.
