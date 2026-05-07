---
name: Forecast boost calibrator
description: Calibrar forecast_final_accel do Simulador a partir de vendas datadas de evento de referência
type: feature
---

# Forecast boost calibrator

Botão "Calibrar a partir de evento…" na Configuração do Simulador (bloco "Forecast — Reta final").

## RPC
`public.calibrate_forecast_boost(p_event_id uuid, p_window_days int)` (SECURITY INVOKER, GRANT to authenticated).

Calcula:
- `final_velocity` = `SUM(qty)` nos últimos N dias antes do evento ÷ N
- `base_velocity` = `SUM(qty)` nos dias anteriores ÷ dias úteis
- `observed_boost` = `final_velocity / base_velocity` (NULL se base = 0)

Lê `ticket_sales` ↔ `event_ticket_lots` ↔ `event_ticket_zones` ↔ `events`.

## UI
`src/components/simulator/ForecastBoostCalibrator.tsx`:
- Lista candidatos com ≥14 dias distintos de venda (exclui evento atual).
- **Multi-seleção** (checkboxes): corre a RPC para cada evento em paralelo.
- Com vários eventos calcula **média ponderada por `total_qty`** (fallback média simples se peso=0).
- Mostra cards individuais por evento + card agregado com boost final.
- "Aplicar valor" preenche `forecast_final_accel` e `forecast_final_window_days` em `event_simulator_config`.

## Quando funciona
- Evento de referência tem `ticket_sales.sale_date` populado.
- Janela de venda > N dias (senão boost pouco fiável → mostra warning).
- Coala 2026 só consegue calibrar quando a edição 2025 (ou outra ref) for importada com vendas datadas.
