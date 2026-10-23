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
- #339 B3 (Pedro, 23/10/2026): também no Master (despesa, overhead, receita); base = soma do motor de cada cidade, previsto antes e real depois do seu evento. Zonas de todas as cidades; mínimo/máximo no total. Master concluído/selado não recalcula; chão do realizado mantém-se.
- Valor não se edita à mão (form inline e Planilha bloqueiam). A Planilha não tem exportação de ficheiro; grava só os campos editados, portanto não perde formula_type/params.
- Decisão 30/09/2026: só DOIS tipos (% receita de bilhetes, valor por pessoa). SPA fica manual (negociada). Sem escalões de público nem mínimo por bilhete.
- Overhead: desde 10/10/2026 (#246, D-ERP219) o amount grava por `set_forecast_amount_observed` (com observação "[fórmula] recálculo"). Antes era update directo e falhava em silêncio (SM Lisboa/Porto ficaram por actualizar). O hook só dá a linha por tratada se `amount` = calculado (ou floor_hit).

## #339 A1 (23/10/2026): receitas
- `pct_ticket_revenue` e `per_head` também em linhas de RECEITA; proibidas em 1.1.01 e 1.1.03, cobertas por sintéticas. Regras em `src/lib/bp-formula-line-rules.ts`.
- Chão do realizado em receita; eventos concluídos ou com fechamento selado não recalculam. Recálculo só escreve `amount` + `formula_value`/`formula_params`.
- Receita de fórmula NÃO entra na base do cachê: a base continua só em `ticket_sales`.

## #339 B3 (23/10/2026): Master e Overhead
- Despesa/overhead com fórmula no Master reparte proporcionalmente à contribuição de cada cidade; soma ao cêntimo com resto na última cidade. Sem fórmula continua ÷N, sem converter linhas existentes.
- Receita com fórmula segue revenue_split_mode; sem regra fica no Master. Cachê só ticket_sales; caixa/saldos não mudam.
- Overhead usa o mesmo “Definir fórmula…” do BP; cálculo visível e valor só de leitura, com confirmação ao fixar manualmente.
