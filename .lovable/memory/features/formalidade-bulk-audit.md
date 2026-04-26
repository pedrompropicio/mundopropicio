---
name: Auditoria de Formalidade em massa
description: Página admin /admin/formalidade que analisa todos os BPs ativos e sugere estados de formalidade com base nas transações reais — alta confiança (auto) vs revisão manual.
type: feature
---

## Objetivo
Após implantação inicial da feature de Versões/Formalidade em produção, foi criada uma ferramenta para fazer "catch-up" de toda a base existente — analisar TODAS as linhas dos BPs ativos e sugerir o estado de formalidade correto baseado nas transações reais já registadas.

## Localização
- Rota: `/admin/formalidade`
- Card no Painel Admin (`AdminPanel`) com ícone `Sparkles`
- Acesso restrito a admin/manager (validado nas RPCs)

## Backend
Três funções (migrations `20260426165039` + `20260426170700`):

1. **`analyze_formalidade_bulk(_event_ids uuid[] DEFAULT NULL)`** — devolve sugestões para todas as linhas da Versão Ativa (`version_id IS NULL`) de despesa. Aplica regras de inferência em duas fontes:
   - **Match direto** via `event_forecasts.transaction_id` → confiança `high` (TX paga = pago_total/pago_parcial; TX aprovada = fechado).
   - **Match por categoria** (mesmo `event_id` + mesma `category_id`) quando não existe vínculo direto → confiança `high` quando o total pago bate o BP ±5%, `low` caso contrário.
   - Sem nenhum match → mantém estado atual e não aparece na lista.
   Filtra apenas linhas onde a sugestão difere do estado atual.
   ⚠️ **BUG histórico (corrigido 2026-04-26)**: a CTE `direct_tx` originalmente fazia LEFT JOIN para todas as linhas (mesmo sem `transaction_id`), produzindo `paid_total=0` em vez de NULL. O `COALESCE(dt.paid_total, ct.paid_total)` então pegava o 0 e ignorava o match por categoria. Corrigido para INNER JOIN com `WHERE af.transaction_id IS NOT NULL` na `direct_tx` (e mantido o filtro existente na `category_tx`), garantindo que cada linha aparece em apenas uma das CTEs.

2. **`apply_formalidade_suggestions(_forecast_ids uuid[], _new_state)`** — aplica um único estado a múltiplos IDs (não usado pela UI, mas útil para scripts).

3. **`apply_formalidade_suggestions_map(_payload jsonb)`** — recebe array `[{forecast_id, new_state}]` e aplica cada linha com o seu próprio estado. Usado pela UI para aplicar selecionadas.

Todas atualizam `formalidade_changed_at` e `formalidade_changed_by`, disparando o trigger `trg_log_formalidade_change` que regista no log.

## UI (`src/pages/FormalidadeAudit.tsx`)
- **Filtro por evento (multi-select)** no topo via Popover — vazio = analisa todos
- A análise NÃO corre automaticamente: utilizador clica **Analisar** (`enabled: analysisRequested`)
- 3 cards de resumo: alta confiança / revisão manual / eventos afetados
- Card único com tabs **Alta confiança** + **Revisão manual** e botão único **Aplicar selecionadas (N)**
- Linhas agrupadas por evento em accordion (colapsável), com checkbox no header do grupo (tri-state) e contador `selecionadas/total`
- Alta confiança vem **pré-selecionada por defeito** (mantém UX "1-clique" mas permite desmarcar antes de aplicar); revisão manual fica desmarcada
- Cada linha mostra chip "atual → sugerido", razão legível e valor BP
- Após aplicar, mostra alerta "Última execução: N linha(s) atualizada(s)" e invalida `event_forecasts` e `formalidade-audit-bulk`

## Fora do scope
- Heurísticas adicionais por categoria/fornecedor (rejeitadas — manter regras atuais)
- Análise IA via Lovable AI (rejeitada — manter regras determinísticas)
