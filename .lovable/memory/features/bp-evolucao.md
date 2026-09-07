---
name: Evolução do previsto de despesa do BP (D4)
description: RPC event_bp_evolution reconstrói retroactivamente o previsto de despesa por L3 dia a dia; sub-separador "Evolução" no BP, só leitura
type: feature
---

# Evolução do BP (D4) — construído 2026-09-07

## RPC `public.event_bp_evolution(_event_id uuid, _from date, _to date)`

- `STABLE SECURITY DEFINER`, `search_path = public`, EXECUTE só a `authenticated`.
- Guarda: `is_platform_admin(auth.uid()) OR has_permission_in(auth.uid(),'view_bp', company_do_evento) OR user_has_event_access(auth.uid(), _event_id)`.
- **Reconstrução retroactiva**: parte do estado actual (Σ `amount` das linhas activas `version_id IS NULL`, `type='expense'` — o mesmo "previsto" que o BP soma, sem filtro de status) e desfaz `system_audit_log` (`entity_type='event_forecasts'`) **sempre desde `current_date`**, mesmo quando `_to` é anterior. Só emite os dias em [`v_from`, `v_to`].
- `v_to = LEAST(COALESCE(_to, current_date), current_date)`; `v_from = GREATEST(COALESCE(_from, v_to-89), '2026-06-17')`.
- Desfazer: `update` retira o lado novo e devolve o lado antigo (trata mudança de `category_id` como saída de uma L3 e entrada noutra); `create` subtrai `new_data.amount`; `delete` devolve `old_data.amount`. Só lados com `type='expense'` e `version_id` nulo (sandbox de cenários fica de fora).
- **Limite honesto**: o audit arranca a **2026-06-17 18:33 UTC**. Não há série antes disso; o ponto de origem é Σ `baseline_amount` (D3), devolvido em `origin`.
- Marcos: `kind='version'` (`bp_versions` em `active`/`superseded`, total de despesa do `snapshot_payload`) e `kind='annotated_change'` (`forecast_audit_log` com observação). **Não existe hoje forma de distinguir uma elevação de verba (D2) de uma edição manual com observação** — `raise_forecast_budget` não escreve marca própria; por isso não há `kind='budget_raise'`.
- Devolve `{ series, origin, markers, audit_from, from, to }`. Agregação a L2/L1 é feita no cliente pelos códigos.
- Zero escrita. Fronteiras de dia em UTC (fim-de-dia). Rubricas a zero não saem na série do dia.

## UI

- `src/components/bp/BPEvolution.tsx`, sub-separador **Evolução** em `EventForecast.tsx` (ao lado de Previsões / Previsão vs Real).
- Área empilhada com toggle L1/L2/L3, período 30/90 dias ou desde a origem, linha tracejada no previsto original, marcadores das versões congeladas, tabela "Maiores movimentos do período" (top 20) reutilizando `get_event_bp_changes`.
- Só leitura, gated por `view_bp`. Sem PDF.

## Números de referência (2026-09-07)

- Ivete Clareou 2026: último ponto da série = 707.684,40 € = previsto actual; origem (Σ baseline) = 716.852,25 €; 0 versões congeladas.
- Anitta - EDA 2026: último ponto = 1.667.709,64 € = previsto actual; origem = 1.476.705,02 €; Versão 1 (17/06 18:25) snapshot 1.429.244,39 € vs série do dia 1.419.595,39 € — diferença de 9.649,00 € por alterações no mesmo dia depois do congelamento (audit arranca 18:33 do mesmo dia).
