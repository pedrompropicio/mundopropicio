# Fase Tickets V2 — Migração ao vivo

Migração do módulo de bilheteria para o modelo de "tipos como container primário"
(opção C com variantes auto-referenciais e cap agregado pai).

## Estado actual

| Batch | Ficheiro | Estado |
|-------|----------|--------|
| 1 | `01-DDL-and-populate.sql` | ✓ Executado |
| 2.1 | `02-triggers-log-only.sql` | ✓ Executado, modo `log_only` |
| 2.5 (A) | `02-suite-tests-sql.sql` | ✓ Executado — 33 testes verdes |
| 2.2 | `03-triggers-active.sql` | 📦 Pronto, NÃO executado |
| 2.2 | `04-activate-coala.sql` | 📦 Pronto, NÃO executado |
| 2.2 | `05-activate-mp.sql` | 📦 Pronto, NÃO executado |

A componente TS (Fase 2.5 B+C, Fase 2.3) está commitada no repo:
- `src/lib/__tests__/tickets-v2-fixtures.ts` (commit a3aa05e)
- `src/lib/__tests__/tickets-v2-properties.test.ts` (commit a3aa05e)
- `src/lib/__tests__/tickets-v2-read-layer.test.ts` (commit c5628b5)
- `src/lib/tickets-v2-read.ts` (commit c5628b5)

Total de testes activos: **73** (33 SQL + 40 TS) + 7 it.todo.

## Dados em produção (snapshot 2026-05-09)

- **Coala Festival Portugal** (`7d831e59-6e82-427b-95a0-64904aae5dd2`)
  - 16 tipos raiz + 2 variantes Revolut
  - sync_mode = `log_only`, feature_tickets_v2 = false
  - Coala 2026: Tenda VIP cap 519/dia, Relvado cap NULL (sem limite)

- **Mundo Propício** (`7c858982-6ccd-47ca-bd65-e0dd3eebf01c`)
  - 264 tipos
  - sync_mode = `log_only`, feature_tickets_v2 = false
  - 30 duplicatas pendentes de limpeza pré-Fase 4

Total: 282 tipos, 324 lots ligados, 156.425 unidades de quantidade
(reconciliação cruzada legacy↔novo via teste invariant I3).

## Sequência de execução pendente

```
[24-48h observação log-only]
       ↓
03-triggers-active.sql
   → handler suporta active mode
   → comportamento da app inalterado (todos em log_only)
       ↓
04-activate-coala.sql
   → Coala passa a active
   → MP continua log_only
       ↓
[≥24h observação Coala]
       ↓
05-activate-mp.sql
   → Mundo Propício passa a active
   → sistema todo em active
       ↓
[≥7 dias estabilização]
       ↓
[Fase 2.6 — migrar consumers TS para usar wrapper isolado]
       ↓
[Fase 4 — single-write, depois Fase 5 — drop legacy]
```

## Como dar luz verde

- "Pode correr o 03-triggers-active.sql" → executo via tool, valido inline.
- "Pode correr o 04-activate-coala.sql" → idem (após observação).
- "Pode correr o 05-activate-mp.sql" → idem (após Coala estável).

## Comandos de monitorização

```sql
-- Health check da suite SQL
SELECT * FROM public.vw_tickets_v2_test_health;

-- Resumo da actividade do trigger nos últimos 7 dias
SELECT * FROM public.vw_tickets_v2_sync_summary_7d;

-- Warnings emitidos
SELECT * FROM public.vw_tickets_v2_sync_warnings;

-- Tipos que seriam criados em active mode (heurística)
SELECT * FROM public.vw_tickets_v2_sync_would_create;

-- Correr toda a suite de testes
SELECT * FROM public.tickets_v2_run_all_tests();
```

## Decisões arquitecturais

Ver `.lovable/memory/features/tickets-v2-migration.md`.

## Plano detalhado por fase

Ver `.lovable/plan-tickets-v2.md`.
