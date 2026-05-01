---
name: RLS legacy audit job
description: Auditoria automática diária (02:30 UTC) que conta policies em `public` com padrão antigo `auth.uid() IS NOT NULL` e regista snapshot histórico
type: feature
---

## Componentes

- **Tabela** `public.rls_legacy_audit_reports` (RLS: SELECT só admin/platform_admin; INSERT só via SECURITY DEFINER)
  - colunas: `ran_at`, `environment`, `legacy_count`, `total_policies`, `status` ('green'|'red'), `details` jsonb (lista de policies offending), `triggered_by` ('cron'|'manual'|'manual_seed'), `triggered_by_user`
- **RPC** `public.run_rls_legacy_audit(_triggered_by, _triggered_by_user)` SECURITY DEFINER
  - faz `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND (qual ILIKE '%auth.uid() IS NOT NULL%' OR with_check ILIKE '%auth.uid() IS NOT NULL%')`
  - grava snapshot e retorna a row inserida
- **RPC wrapper** `public.run_rls_legacy_audit_cron()` chamada pelo edge fn (sem args)
- **Edge fn** `run-rls-legacy-audit`
  - sem token → assume `triggered_by='cron'`
  - com JWT user → valida role admin/platform_admin (403 caso contrário) e grava `triggered_by='manual'`
- **Cron** `rls-legacy-audit-daily` (jobid 12) `30 2 * * *` UTC, via pg_net + apikey anon
- **Página** `/admin/auditoria-rls` (`src/pages/admin/RlsLegacyAudit.tsx`)
  - card "Estado atual" com badge VERDE/VERMELHO + botão "Executar agora"
  - collapsible com tabela detalhada das policies offending
  - histórico das últimas 60 execuções
- **AdminPanel** tem novo card "Auditoria RLS Legacy" (icon ShieldCheck)

## Critério de detecção

Um match em `qual ILIKE '%auth.uid() IS NOT NULL%'` OU `with_check ILIKE '%auth.uid() IS NOT NULL%'`. Não é necessária a forma exata; basta a substring (case-insensitive). Se quiseres restringir a "qual = X" escreve regex; manteve-se ILIKE para apanhar variações (`(auth.uid() IS NOT NULL)`, `auth.uid() IS NOT NULL AND ...`).

## Estado em Live (2026-04-30)

Devolveu 0 a 30/04 após o fix `multi-tenant-leaky-policies-fix`. Em Test ainda há 56 policies legacy (snapshot inicial em 2026-05-01). Test ainda não foi sincronizado com o fix de Live; isso é tarefa separada quando convier.

## Ligação ao roadmap

Este job **alimenta o gatilho 2 da quarentena Fase 8** (`Auditoria RLS legacy = 0 linhas em Live`). Antes de declarar gatilho verde, consultar `/admin/auditoria-rls` em Live e confirmar que os últimos relatórios mostram `legacy_count=0`.

## Notas operacionais

- Cron usa `apikey=anon` (padrão dos cronjobs nesta plataforma).
- Verificação de role acontece no edge fn quando há JWT real, não no cron.
- Apagar histórico antigo: não está implementado retention policy; se crescer, adicionar cron mensal `DELETE FROM rls_legacy_audit_reports WHERE ran_at < now() - interval '180 days'`.
