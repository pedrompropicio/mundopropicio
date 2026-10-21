# Architecture rules

- Issue #335 inert SQL uses a private NOLOGIN executor via a trigger dispatch; deploy tests run as non-superuser postgres with hosted defaults, because superuser fixtures conceal ACL/owner failures. Keep candidates manual-only until technical acceptance and separate application approval.