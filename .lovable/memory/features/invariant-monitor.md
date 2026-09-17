---
name: Verificador de Invariantes (consolidado)
description: system_invariants (18 verificações, âmbito empresa|global) + _run_invariant_checks_raw/run_invariant_checks + invariant_runs + cron diário + alerta por desvio; ecrã único /admin/invariantes
type: feature
---

Criado a 14/09/2026 depois de três incidentes silenciosos (fusão de fornecedores entre empresas, propagação de campos em grupos de fatura, embed ambíguo do PostgREST). Consolidado no mesmo dia com o verificador que já existia (`check_system_invariants`, seis verificações de negócio). O verificador CONTA, nunca repara.

REGRA DE ADMISSÃO (escrita antes de nós, mantida no cabeçalho da função): só entra o que distinga com fiabilidade uma violação de um caso legítimo do negócio; sinais heurísticos não entram como 'error' — um verificador que nunca chega a zero deixa de ser lido e destrói a confiança nos restantes.

Peças:
- `public.system_invariants` — chave, descrição PT, severidade (error|warn), **scope ('empresa'|'global')**, `reference_count`, notas, `reference_updated_by/at`. Dezoito verificações semeadas com os valores de 14/09/2026.
- `public._run_invariant_checks_raw()` SECDEF, `search_path` fixo, EXECUTE revogado a anon/authenticated — motor único das dezoito, devolve contagem, referência, conforme e **amostra jsonb (até 5 linhas infratoras)**. O SQL vive DENTRO da função. As verificações de âmbito 'empresa' são contadas em TODAS as empresas (a amostra traz `company_id`) para que contagem e referência sejam estáveis no cron.
- `public.run_invariant_checks()` — porta pública, portão admin/platform_admin (auth.uid() nulo = cron/service).
- `public.check_system_invariants()` — mantida como **camada fina** sobre o motor (assinatura antiga code/severity/title/offenders/sample/checked_at), devolve só a família 'empresa'; portão admin/manager/platform_admin.
- `public.run_invariant_checks_and_log()` — grava em `invariant_runs` (só contagens, sem amostra) e, SÓ quando há desvio, faz upsert do lembrete `system_reminders` key `invariant_drift` (cron diário → edge `send-system-reminders` → WhatsApp/Twilio). Sem desvio, fecha o lembrete.
- `public.accept_invariant_reference(name, new_reference, note)` — aceita a contagem atual como nova referência; nota obrigatória.
- `carga_sem_credito` (error, global, referência 0, 17/09/2026, issue #201) — `card_session_loads` com `in_transaction_id IS NULL` e a saída marcada como paga (`payment_list_items.manually_marked_paid`, item não removido). O trigger `card_load_on_out_paid` só cria a entrada com `status='paid'`, logo a marca visual deixaria o cartão sem crédito; a UI deixou de oferecer "Marcar como Pago" nas cargas.
- Cron `invariant-checks-daily` (`10 7 * * *`, jobid 131 em Live) a chamar `run_invariant_checks_and_log()`.
- Ecrã ÚNICO `/admin/invariantes` (`src/pages/admin/InvariantMonitor.tsx`), admin/platform_admin, com as duas famílias separadas, amostra expansível, histórico, "Correr agora", "Aceitar N como referência" e o smoke test de consultas (`check_rpc_smoke`). `/admin/invariantes-diarias` redireciona para lá. `SystemInvariants.tsx` foi removido.

Referências de 14/09/2026 (19 verificações: 13 global + 6 empresa):
- global: nove a zero; `paid_amount_acima_do_bruto` 9; `tx_paga_sem_linha_de_pagamento` 1026 (issue #91); `pares_fk_duplicada` 35 (issue #169); `grupo_fatura_veredicto_desagrupar_por_aplicar` 0 (14/09/2026 — veredicto OCR 'desagrupar' por aplicar com transações ainda agrupadas).
- empresa: `BP_DESPESA_EM_L2` 0, `VINCULO_CROSS_EVENTO` 0, `FORECAST_ID_ORFAO` 0, `TX_EVENTO_SEM_RUBRICA` 13, `VINCULO_DESSINCRONIZADO` 7, `TRIGGER_DOCUMENTADO_SEM_LIGACAO` 4 (as três últimas como dívida herdada, com nota).


Candidatas REJEITADAS por darem falsos positivos — não voltar a propor: "filha de rateio com conta" sem excluir parcelas (as parcelas têm conta legitimamente); "grupo de fatura com documentos diferentes" a comparar `file_url` (cada irmã recebe a sua cópia; quem responde é a auditoria por OCR já existente); `BP_LINHAS_DUPLICADAS` (removida em 28/08/2026: parcelamentos e mensalidades repetem-se legitimamente).

- `backup_empresa_em_falta` (error, global, referência 0, 17/09/2026) — empresas com `status='active'` (mais o global) sem linha em `public.backup_runs` com `status='ok'` e `finished_at > now() - interval '30 hours'`. Conta-se por `backup_runs`, nunca pelo storage. Vive em `_run_invariant_checks_extra()`, unida às 22 do motor por `_run_invariant_checks_all()`.
