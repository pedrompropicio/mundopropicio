---
name: Linhas de BP com fórmula (#263)
description: pct_ticket_revenue / per_head em event_forecasts, motor bp-formula.ts, convites em event_courtesies (forecast=Previsto, real=Final), recálculo com chão #240
type: feature
---
D-ERP149. Motor único `supabase/functions/_shared/settlement/bp-formula.ts` — nunca recalcular noutro sítio.
- `formula_params`: pct → {rate, basis gross|net, zone_ids|null, min, max}; per_head → {unit_amount, include_courtesies, zone_ids|null, min, max}. O hook grava também last_text, last_recalc_at, last_calculated, floor_hit.
- Antes do evento: simulador se a linha é do evento todo; com zonas → real até hoje (assinalado). Depois: real.
- Convites: `event_courtesies` scenario 'forecast' (Previsto) / 'real' (Final); breakeven fora. Regra única `selectCourtesyRows` usada também pelo Simulador e useEventAttendance (A&B) — nunca filtrar só 'real'.
- Recálculo: `useSyncFormulaForecasts` (BP via BpFormulaPanel; capa/Fecho via FormulaSyncRunner em EventDetail). Chão #240: grava o realizado e avisa. baseline_amount intocado.
- Só em evento simples / cidade; no Master mostra aviso e não recalcula.
- Valor não se edita à mão (form inline e Planilha bloqueiam). A Planilha não tem exportação de ficheiro; grava só os campos editados, portanto não perde formula_type/params.
- Decisão 30/09/2026: só DOIS tipos (% receita de bilhetes, valor por pessoa). SPA fica manual (negociada). Sem escalões de público nem mínimo por bilhete.
- Overhead: conversão/recálculo passam por update directo (RPC recusa overhead) → sem observação no forecast_audit_log.
