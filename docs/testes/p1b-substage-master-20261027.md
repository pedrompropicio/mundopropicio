# P1b — estágio do sub-evento acompanha o master (D-ERP319)

Autorização Pedro 27/10/2026 («Pode avançar»). Só DDL 0281; sem DML, UI, deploy, Publish.

Ficheiros: drizzle/migrations/0281_p1b_substage_follows_master.sql = supabase/manual/0281_p1b_substage_follows_master.sql (cmp idêntico; sha256 382f0e874b60606deaf68019fbf83770caeb8468a1eb8796b329784e0b5acab1); rollback comentado supabase/manual/rollback_0281_p1b_substage_follows_master_comentado.sql (corpos 0280).

Predicados:
- event_stage: acesso verificado no evento pedido; sobe parent_event_id até à raiz (limite 16, erro event_hierarchy_cycle); estágio calculado só na raiz. Carimbos/status do sub-evento ignorados. Profundidade Live = 1 (0 sub-eventos cujo pai tem pai).
- close/reopen/mark/unmark: sub-evento → 'event_stage_act_on_master: <id do master>'.
- event_close_checklist: event_close_blockers do evento + sub-eventos diretos (mesma empresa); hard fundidos por chave com elementos distintos (circuit_accounts já é família); soft bp_lines_unreviewed count e saldo_net somados. Antes, só circuit_accounts agregava filhos. Selos (event_settlements) continuam só do próprio evento (0 settlements em sub-eventos em Live); cache já cobria filhos.

Verificações Live:
(a) sub-eventos com estágio ≠ master: 0 (34 sub-eventos, 60 eventos).
(b) distribuição antes=depois: historico23/fechado7/em_fecho15/em_curso15; evento a evento idêntico.
(c) close/mark/reopen/unmark em sub-evento 7d1dccec… (admin MP simulado, transação desfeita): todos 'event_stage_act_on_master: e8c7594d-…'.
(d) Anitta: checklist igual (ok false; selos 3/3 por fazer; cache 0; BP 133 / 1122040.98; hard 0).
(e) has_function_privilege: anon false em todas as 10; authenticated true nas 7 públicas, false nos 3 helpers; service_role só leituras.
(f) md5 das restantes 866 funções public+crm agregado 1670bd38bff30c94b14e6e1611ba39a3 antes=depois. event_close_blockers cc1c4c3f…, event_stage_list b96629cd…, _event_stage_access/guard/legacy_reopen iguais.
   Alteradas: event_stage 7716efa4→06a3316b; event_close_checklist f10d2d38→c9f8e6db; close_event dfeec88c→982ab855; reopen_event_closure 2218d90b→4b320509; mark_event_historical 7c28ebfe→830826fa; unmark_event_historical 69c4cfb8→0de7f339.
(g) sub-evento fictício fff…0281 sob master fechado e8c7594d: estágio fechado; ROLLBACK; resíduos 0.

Carimbos em sub-eventos (intactos, ignorados): 16 sub-eventos (4 closed_at, 12 historical_at). Limpeza = DML do Pedro.

Testes: PGlite src/test/event-stages-p1b.test.ts 5/5 + P1 13/13.
