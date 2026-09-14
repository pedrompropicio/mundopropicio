---
name: Verificador de Invariantes Diárias
description: system_invariants + run_invariant_checks() + invariant_runs + cron diário + alerta por desvio da referência; ecrã /admin/invariantes-diarias
type: feature
---

Criado a 14/09/2026 depois de três incidentes silenciosos (fusão de fornecedores entre empresas, propagação de campos em grupos de fatura, embed ambíguo do PostgREST). O verificador CONTA, nunca repara.

Peças:
- `public.system_invariants` — chave, descrição PT, severidade (error|warn), `reference_count`, notas, `reference_updated_by/at`. Doze verificações semeadas com os valores de 14/09/2026.
- `public.run_invariant_checks()` SECDEF, `search_path` fixo: o SQL das doze verificações vive DENTRO da função (nunca texto em coluna executado dinamicamente). Vê todas as empresas de propósito — as verificações 1–5 comparam empresas entre si. Portão: admin/platform_admin (auth.uid() nulo = cron/service).
- `public.run_invariant_checks_and_log()` — corre, grava em `public.invariant_runs` e, SÓ quando há desvio, faz upsert do lembrete `system_reminders` com key `invariant_drift` (mecanismo já existente: cron diário → edge `send-system-reminders` → WhatsApp/Twilio). Sem desvio, fecha o lembrete.
- `public.accept_invariant_reference(name, new_reference, note)` — aceita a contagem atual como nova referência; nota obrigatória, append datado nas notas, registo de quem aceitou. É isto que evita ecrã permanentemente vermelho por dívida assumida.
- Cron `invariant-checks-daily` (`10 7 * * *`) — criar no SQL Editor de Live via `scripts/cron-invariant-checks-live.txt` (crons não propagam por Publish).
- Ecrã `/admin/invariantes-diarias` (`src/pages/admin/InvariantMonitor.tsx`), admin/platform_admin. O antigo `/admin/invariantes` (check_system_invariants + smoke de RPCs) fica.

Referências de 14/09/2026: nove verificações a zero; `paid_amount_acima_do_bruto` 9; `tx_paga_sem_linha_de_pagamento` 1026 (issue #91); `pares_fk_duplicada` 35 (issue #169).

Candidatas REJEITADAS por darem falsos positivos — não voltar a propor: "filha de rateio com conta" sem excluir parcelas (as parcelas têm conta legitimamente); "grupo de fatura com documentos diferentes" a comparar `file_url` (cada irmã recebe a sua cópia; quem responde é a auditoria por OCR já existente).
