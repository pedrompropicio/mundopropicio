---
name: Multi-tenant test suite
description: Bateria de testes (Vitest + Deno + SQL + E2E manual) que valida multi-empresa antes da Fase 7 Live
type: feature
---

# Bateria de testes multi-empresa (Fase 6 → Fase 7)

Estrutura em 4 níveis. Correr toda a bateria antes de despoletar a migração Live.

## Nível 1 — Vitest unitário
- `src/lib/__tests__/storage-multi-tenant.test.ts` — 11 testes a `withCompanyPath` + `uploadToCompanyBucket`: idempotência do prefixo, buckets globais ignorados, leading slash, cobertura dos 11 buckets isolados. **Como correr**: `bunx vitest run src/lib/__tests__/storage-multi-tenant.test.ts`. ✅ 11/11 passam.

## Nível 1 — Deno tests (edge functions)
- `supabase/functions/tests/multi-tenant-edge.test.ts` — valida que `create-company` + `invite-company-admin` rejeitam unauthenticated/invalid-token; que `accept-invitation` rejeita missing token, missing password, fake token. **Como correr**: tool `supabase--test_edge_functions` com `pattern: "create-company"` (etc).

## Nível 2 — SQL RLS isolation suite
- `scripts/multi-tenant-rls-isolation-test.txt` — script para correr no SQL Editor do Supabase Dashboard (Test). Cria 2 fake users (admin MP + admin Demo 2), simula login de cada via `SET LOCAL ROLE authenticated` + `SET LOCAL "request.jwt.claims"`. Valida:
  - **Bloco 2/3**: cada user só vê dados da sua empresa (14 tabelas críticas).
  - **Bloco 4**: INSERT cross-tenant é bloqueado OU sobrescrito pelo trigger.
  - **Bloco 5**: UPDATE/DELETE cross-tenant retorna 0 rows.
  - **Bloco 6**: Storage RLS bloqueia escrita em pasta de outra empresa, permite na própria.
  - **Bloco 7**: varredura cega das 65+ tabelas com company_id — para cada uma, conta quantas linhas com company_id ≠ Demo 2 ficam visíveis ao user Demo 2; deve ser sempre 0. Resumo final WARNING ou NOTICE.
- Cleanup automático no fim. Idempotente (pode correr-se várias vezes).
- ⚠️ **NOTA**: `psql` no sandbox Lovable tem `BYPASSRLS=true` e não pode `SET ROLE authenticated` — este script SÓ funciona corretamente no SQL Editor do Supabase Dashboard.

## Nível 3 — E2E manual (UI, ~30min)
- `.lovable/specs/multi-tenant-e2e-checklist.md` — roteiro PT-PT exaustivo. 7 secções: pre-flight, baseline MP, criar admin Demo 2, aceitar convite, validação cross-tenant Demo 2, re-validação MP, edge functions críticas, cleanup. Inclui critérios de bloqueio para Fase 7.

## Nível 4 — Plano Fase 7 (Live)
- `.lovable/plan-fase-7-live.md` — plano operacional completo: pre-flight D-1, 9 batches de migração (fundamentos, 6 batches de ALTER+seed+RLS por domínio, storage, hardening, NOT NULL), validação pós-migração, plano de rollback (3 cenários), monitorização D+1 a D+7, decisões pendentes a confirmar.

## Como executar a bateria toda

1. `bunx vitest run src/lib/__tests__/storage-multi-tenant.test.ts` — Vitest (1min)
2. Tool `supabase--test_edge_functions` com `functions: ["create-company","invite-company-admin","accept-invitation"]` — Deno (3min)
3. Copy/paste de `scripts/multi-tenant-rls-isolation-test.txt` no SQL Editor (ambiente Test) — SQL (2min)
4. Roteiro `.lovable/specs/multi-tenant-e2e-checklist.md` — manual (30min)
5. Se tudo verde: avançar para Fase 7 seguindo `.lovable/plan-fase-7-live.md`.
