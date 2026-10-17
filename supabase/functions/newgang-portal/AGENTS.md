# Newgang API architecture
- Immediate capture inserts delegate their ID to the canonical ingest collector; welcome retries reacquire the same durable reservation only after proven pre-enqueue failure, while unknown remains blocked to prevent duplicate delivery.
- WhatsApp consent lives in the same append-only #332 ledger family (club_member_whatsapp_consents, version whatsapp-v1); grants require a valid profile phone and store only sha256(phone) — a phone change invalidates the grant until re-authorization, and revoke never requires a number.
- Profile and capture city guards share the server normalizer; public cities returns only the reference list with bounded cache to prevent fragmented CRM aggregates.
