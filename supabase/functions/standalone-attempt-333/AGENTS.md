# Standalone attempt endpoint
- Read capabilities only through the service-only canonical RPC using the existing admin client; this preserves settings/internal-gate ACLs and fails closed on unavailable data.
- Authenticate and resolve canonical company context before returning capabilities; capability reads never authorize or execute a mutation.
- Snapshot labels fail independently; resolve a payer name only after canonical user_roles membership in the checked company, preventing cross-tenant profile disclosure.