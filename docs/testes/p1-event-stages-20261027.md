# P1 estágios dos eventos — aplicado e verificado

Pedro autorizou DDL a 27/10/2026; retoma com decisões 13:04 UTC. Só 0280 aplicada. Sem backfill, UI, edge functions, deploy, Publish, crons ou envios. Sem RPC de escrita em eventos reais. Teste Live com evento fictício em BEGIN/ROLLBACK; zero resíduos.

## Ficheiros lidos

AGENTS.md; supabase/AGENTS.md; docs/INDEX.md; docs/QUADRO.md (Em execução agora); docs/estado/estado-financeiro-e-tesouraria.md; .lovable/memory/constraints/lovable-cloud-ddl-workflow.md; .lovable/memory/features/bp-verba-por-usar.md; .lovable/memory/features/janela-administrativa.md; docs/DECISIONS.md (D-ERP288/adendas, D-ERP291 e últimas decisões); src/lib/event-realized.ts; src/pages/EventDetail.tsx; src/components/events/CloseEventGuardDialog.tsx; src/test/issue359-person-authorisations.test.ts; drizzle/migrations/meta/_journal.json; roadmap.md; docs/questoes-p1-estagios-eventos-colisao-20261027.md. Investigação delegada: 0216_cache_contracts_bp_line_and_freeze.sql, migração de seal_event_settlement, PROC-fecho-evento.md, settlement-seal.ts, SettlementSealControl.tsx, AuthContext.tsx. Memórias persistentes event-lifecycle-and-bp, event-status-automation, granular-permissions-system e date-processing-standard.

## Migração

- drizzle/migrations/0280_p1_event_stages.sql (0280 confirmado livre; journal antes terminava 0279).
- supabase/manual/0280_p1_event_stages.sql, byte-idêntica por cmp (exit 0).
- SHA256: 7a51c04980402f2f2347fd9b56bcca53ff3e72ed8cb711ed7eb8f61471f44696.
- rollback_0280_p1_event_stages_comentado.sql: comentado, não executado; preserva colunas.
- Tipos regenerados automaticamente pela ferramenta de migração.

## Predicados da checklist / origem servidor

1. Selos: event_settlements do evento/company; conta NOT is_sealed OR sealed_snapshot IS NULL. Sem fechamentos, total=0 e condição satisfeita. `{}` não é rejeitado: seal_event_settlement só exige snapshot não nulo; não inventa validação de conteúdo.
2. Cachê: event_cache_configs e event_cache_city_settlements; expressão canónica de _cache_resolve_lines `coalesce(city.is_finalized,config.is_finalized,false)`. Configuração raiz aplica a filhos diretos; simples aplica a si. Checklist inclui configuração ainda sem linha BP, para não presumir congelamento pela ausência de linha. Não recalcula valor/cachê.
3. BP: event_close_blockers → soft.bp_lines_unreviewed {count,saldo_net}, sem reimplementar cálculo. Embora soft no fecho legado, obrigatório para close_event por decisão P1.
4. Hard: soma jsonb_array_length de TODOS os valores hard de event_close_blockers, incluindo circuit_accounts, camarim_sessions e card_sessions.
5. Auditoria: system_audit_log tem entity_type/entity_id/action/changed_by/company_id/metadata, defaults id/created_at. RPCs novas registam ação, evento, ator, motivo (quando parâmetro existe) e checklist no close_event.

Nenhuma condição nao_avaliado_no_servidor: as quatro têm fonte servidor.

## Verificações Live (a)–(h)

(a) information_schema.columns: closed_at/closed_by/historical_at/historical_by existem, nullable=YES, defaults=NULL. events total60, preenchidos0 antes/depois do teste desfeito. Nenhuma linha existente alterada pela migração.
(b) Função real event_stage sobre events WHERE company_id=MP, GROUP BY estágio, dia Europe/Lisbon=2026-10-27: em_curso13 (raízes3); em_fecho42 (raízes18). Total55 eventos MP/21raízes; planeamento/fechado/historico/cancelado0. Não comparar contagem de raízes com a medição anterior6active/21completed: universos/instantes distintos. Cada evento passa pela função; critério max(date própria/filhos diretos)<dia local, ou completed; planning antes da comparação da data. Sem NULL.
(c) Anitta fdfb39fe-45f2-43f5-9ec9-7cb536360ae1: ok=false; settlements total3/unsealed_or_missing_snapshot3/okfalse; cache configured_targets0/unfrozen0/oktrue; bp_lines count133/saldo_net1122040.98/okfalse; hard count0, listas vazias/oktrue. Apenas leitura.
(d) has_function_privilege: anon=false para as10 funções; authenticated=true nas7 RPCs públicas, false nos3 helpers; service_role=true apenas nas3 leituras (event_stage/list/checklist), false nos4 writers e3helpers. Todas SECURITY DEFINER, search_path=public. Leituras STABLE. Função de listagem filtra current_company_id, escrita exige uid, company ativa igual e has_role admin/manager (manager só close); reopen exige ainda has_permission_in(...,'reopen_event',company).
(e) Funções existentes public+crm:862 antes/depois, agregado md5 de signature:md5(pg_get_functiondef) ordenado por signature =0354273d78ed23de76ca6ae57cc6b5e4 antes/depois; total872 depois (+10). Nenhuma definição existente alterada, CHECK status intacto.
(f) UPDATE direto closed_at em evento fictício recusado com event_stage_direct_write_forbidden; capturado insufficient_privilege e texto verificado; transação desfeita.
(g) Mesmo evento fictício: status completed + carimbos preparados sob contexto interno de teste → UPDATE status active limpa closed_at E closed_by; assertion SQL; ROLLBACK. Sem close_event/reopen_event_closure em evento real. Residue do UUID fff00000-0000-0000-0000-000000000280=0.
(h) Query real company MP status<>completed AND event_stage(id)='fechado':0. Teste g confirma saída do estágio fechado; teste local cobre condição de completed. O corpo exige explicitamente closed_at NOT NULL AND status='completed'.

As primeiras invocações via read_query recusaram EXECUTE (role restrita de inspeção). Sem alterar grants para contornar: consultas das funções reais feitas via run_sql privilegiado, somente SELECT para b/c/h; BEGIN/DO/ROLLBACK apenas para f/g. Sem efeitos persistentes.

## Ordem dos triggers BEFORE UPDATE de status

enforce_event_close_blockers → trg_enforce_event_reopen_permission → trg_validate_event_admin_absorption → update_events_updated_at → z_stage_fields_guard → zz_stage_legacy_reopen. Guard verifica campos enviados antes de cleanup; cleanup autorizado interno limpa NEW sem nova escrita. Os triggers atuais não foram alterados. Snapshot de BP AFTER status conserva comportamento atual.

## MD5 novos

_event_stage_access a3d564297b364e091a449c8b5f6a4eb5
_event_stage_guard cf2e3aeed4a760fe76f23dce82a7d26d
_event_stage_legacy_reopen 5f955125e94a4c57216e1f6654e30677
close_event dfeec88c431b948d742a8f5830633c90
event_close_checklist f10d2d38266f437964709737e0a1c3a4
event_stage_list b96629cd252573637a84c58222e5b0bb
event_stage 7716efa4ec222a351a7763e0d5441806
mark_event_historical 7c28ebfe489882cc3cca81e83d1bb491
reopen_event_closure 2218d90b4b46e7acb74a2146a8115639
unmark_event_historical 69c4cfb86f1268ced0484f5344d6d189

## Testes e limites

PGlite credential-free13/13; P1+Coala41/41; suite completa2849PASS/6skip/11todo (291passed/2skipped files), 342s. Sem typecheck/build manual: harness automático. Não foi verificado UI, sessão real, fluxo de escrita autenticado em Live, concorrência multiwriter nem CI remoto. Testes locais usam schema mínimo; não substituem catálogo Live/ACL.

Contexto de guarda segue padrão flag de sessão solicitado, limitado por evento/transação e restaurado ao sair da RPC. Não é alegada proteção contra um executor SQL privilegiado que possa forjar GUC. Checklist usa locks de evento/selos/configurações; não é alegada serialização integral de todos os writers de BP/circuitos.

## Questões/decisões em aberto

P1 sem decisão bloqueadora. P2 backfill fica com Pedro, bloco próprio e Corro?. UI futura/CI remoto e prova autenticada real fora do recorte. Nenhuma publicação necessária para DDL.
