# Architecture rules

- Ticket-office position cards use the canonical balance RPC for retained funds and the existing sales RPC plus canonical per-event balance helper for unapportioned events; this prevents confusing gross sales with receivable balances or truncating sales reads.
- Statement summaries aggregate existing signed lines by type without changing financial records; the display must not create settlement movements.