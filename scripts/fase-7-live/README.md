# Fase 7 Live — Scripts Consolidados

> **Janela**: ~25 min (ideal: noite, com app em manutenção/baixo tráfego)
> **Backup**: já confirmado na noite (manual via cron). Voltar a forçar com `00-PRE-FLIGHT.txt` antes de começar.

## Ordem de execução

| # | Ficheiro | O que faz | Tempo |
|---|---|---|---|
| 0 | `00-PRE-FLIGHT.txt` | Snapshot de contagens + backup forçado + validações | 5 min |
| 1 | `01-BATCH-0-fundamentos.txt` | Cria `companies`, `company_invitations`, helpers, seed MP, promove platform_admin | 5 min |
| 2 | `02-BATCH-1-eventos-bp.txt` | `company_id` em 14 tabelas eventos/BP | 3 min |
| 3 | `03-BATCH-2-bilhetica.txt` | `company_id` em 7 tabelas bilhética | 2 min |
| 4 | `04-BATCH-3-cache-camarim.txt` | `company_id` em 13 tabelas cache+camarim | 2 min |
| 5 | `05-BATCH-4-financeiro.txt` | `company_id` em 8 tabelas financeiro core | 2 min |
| 6 | `06-BATCH-5-suporte.txt` | `company_id` em 10 tabelas suporte financeiro | 2 min |
| 7 | `07-BATCH-6-sistema-catalogos.txt` | `company_id` em 15 tabelas sistema/comunicações/catálogos | 2 min |
| 8 | `08-BATCH-7-storage.txt` | RLS RESTRICTIVE em 11 buckets + migração de paths | 3 min |
| 9 | `10-BATCH-7-extra-crons.txt` | Adiciona crons `cleanup-old-backups` + `monthly-backup-test` | 1 min |
| 10 | `09-BATCH-8-hardening.txt` | Hardening + active_company switcher + auto-fill triggers + audit + isolation test | 5 min |
| 11 | **NÃO HOJE** — `11-BATCH-9-not-null-D7.txt` | NOT NULL em ~70 tabelas (correr só D+7 se zero erros) | 2 min |

## Validações no final (Cloud → SQL Editor LIVE)

```sql
-- Multi-tenant integrity
SELECT * FROM public.audit_multi_tenant_isolation();

-- RLS isolation simulada
SELECT * FROM public.run_rls_isolation_test();

-- Recontagem (comparar com snapshot do PRE-FLIGHT — devem ser idênticas)
SELECT 'profiles' AS t, count(*) FROM public.profiles
UNION ALL SELECT 'events', count(*) FROM public.events
UNION ALL SELECT 'transactions', count(*) FROM public.transactions
UNION ALL SELECT 'event_forecasts', count(*) FROM public.event_forecasts
UNION ALL SELECT 'suppliers', count(*) FROM public.suppliers
ORDER BY t;
```

Smoke test no app `mundopropicio.lovable.app`:
1. Login `pedroneto@mundopropicio.com` → ver eventos.
2. Abrir 1 evento → ver BP, transações, fornecedores.
3. Criar transação de teste com anexo → confirmar que ficheiro vai para `<MP-LIVE-uuid>/...`.
4. Apagar transação de teste.
5. Confirmar que header mostra seletor de empresa (só visível ao platform_admin).

## Rollback

### Cenário A — erro num batch específico
- Se ainda dentro de transação no Editor: `ROLLBACK;`
- Se já commitou: `DROP POLICY/COLUMN` revertendo APENAS o batch falhado.

### Cenário B — corrupção / quebra geral
1. Pôr app em manutenção (anúncio em todos os utilizadores).
2. Restaurar via `database-restore-v2` Edge Function com o backup do PRE-FLIGHT.
3. Validar contagens antes de tirar manutenção.

### Cenário C — RLS quebrou 1 feature
- Identificar policy via logs Supabase.
- `DROP POLICY ...; CREATE POLICY ... USING (...)` corretivo.
- Não reverter o resto.

## Decisões aplicadas

| Decisão | Escolha |
|---|---|
| UUID Mundo Propício em Live | Novo (gerado dinamicamente no Batch 0) |
| Promover pedroneto a platform_admin | ✅ Sim, no Batch 0 |
| Aplicar NOT NULL hoje | ❌ Não — esperar D+7 |
| Crons `cleanup-old-backups` + `monthly-backup-test` | ✅ Sim, Batch 7-extra |
