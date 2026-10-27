# P3 — UI dos estágios dos eventos (R1)

«Sim» Pedro 27/10/2026. Só código e testes; sem DDL/DML/edge functions/deploy/Publish. Nenhuma RPC de escrita executada.

## Ficheiros lidos
AGENTS.md; docs/QUADRO.md (Em execução agora); .lovable/memory/features/event-stages.md; docs/testes/p1-event-stages-20261027.md; docs/testes/p1b-substage-master-20261027.md; src/pages/Events.tsx; src/pages/EventDetail.tsx; src/components/EventStatusBadge.tsx; src/contexts/AuthContext.tsx (isAdmin/isManager/hasPermission); src/integrations/supabase/types.ts.

Colisão: nenhuma. Aba «Fecho» (FechoUnifiedTab) é o fecho financeiro legado, não estágios; não alterada.

## Entregue
- src/lib/event-stage.ts — tipos, etiquetas pt-PT, badges, parseChecklist (falha fechada), mapStageError, stageActions, legacyReopenBlock, filterEventsByStage.
- src/hooks/useEventStages.ts — event_stage_list, event_stage, event_close_checklist, ação close/reopen/mark/unmark com invalidação.
- src/components/events/EventStageBadge.tsx, EventStagePanel.tsx.
- Events.tsx: badge, filtro, «Mostrar históricos». EventDetail.tsx: badge, painel, aviso no «Reabrir Evento» legado.

## Predicados de visibilidade (servidor decide sempre)
Sub-evento: sem ações, mostra estágio do master. Fechar: admin/manager e estágio em_fecho; ativo só com checklist ok. Reabrir fecho: admin, fechado, motivo obrigatório. Marcar histórico: admin, não histórico/cancelado. Remover histórico: admin, histórico.

## Verificação Live (leitura)
Assinaturas pg_proc iguais ao contrato; colunas closed_at/closed_by/historical_at/historical_by/parent_event_id existem (nullable). Preview (admin MP): lista com badges e filtro; históricos ocultos por defeito e visíveis com o controlo. Anitta fdfb39fe: Em fecho; selos 0/3 por fazer; cachê sem configuração (ok); BP 133 linhas, saldo 1.122.040,98 €; bloqueios 0; «Fechar evento» desativado.

## Testes
src/test/event-stage-ui-p3.test.ts 13/13. Suite: 292 ficheiros passaram; única falha era memory-index (event-stages.md fora do índice, pré-existente), corrigida regenerando o índice → 3/3. tsgo 0. CI remoto por confirmar.
