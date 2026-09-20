---
name: Retenção do import_audit das runs Ticketline
description: import_audit completo 7 dias, depois resumo compacto via cron ticketline-sync-runs-retention (#204)
type: feature
---

`ticketline_sync_runs.import_audit` guarda o payload cru do relatório (warnings,
section1Daily, section2DailyTotals, reportRows…) e era o peso todo da tabela.

Política (#204, 20/09/2026): completo 7 dias; depois
`public.ticketline_sync_runs_compact_audit(_days integer default 7)` substitui-o por um
resumo — escalares mantidos, arrays → `{"_array_count": n}`, objectos > 2 kB →
`{"_keys": n}`, mais `warnings_sample` (5) e `errors_sample` (10). Idempotente por
`import_audit->>'compacted_at'`. SECURITY DEFINER, só `service_role`, sem EXCEPTION mudo.
Cron `ticketline-sync-runs-retention` às 03:20 UTC.

Primeira execução: 5.837 runs compactadas, 65.292.781 → 12.936.529 bytes.
A tabela CONTINUA em `backup_excluded_tables` (reason actualizado com esta política).
