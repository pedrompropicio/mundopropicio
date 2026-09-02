---
name: BP previsto original (baseline_amount) — D3
description: event_forecasts.baseline_amount guarda o previsto original fixo da linha de BP; nunca confundir com original_amount (multi-currency)
type: feature
---

# Previsto original da linha de BP (D3)

## ⚠️ AVISO CRÍTICO — duas colunas diferentes

| Coluna | Significado | Par |
|---|---|---|
| `event_forecasts.baseline_amount` | **D3** — previsto ORIGINAL da linha, fixo desde a criação | — |
| `event_forecasts.original_amount` | valor na **moeda de origem** (multi-currency) | `currency`, `fx_rate`, `fx_rate_source` |

`original_amount` está hoje vazio (tudo em EUR), mas passa a ser usado com as empresas BR
(Fortal, Siriguella) a operar em BRL. **Nunca reutilizar `original_amount` para a baseline
D3** — foi exactamente essa colisão que travou a primeira tentativa de implementação.

## Semântica

- `amount` = verba **corrente** (move-se; é o que o Fecho usa).
- `baseline_amount` = previsto **original** (fixo; é o que a curva de erro usa).

## Implementação

1. Coluna `baseline_amount numeric NULL` com comentário explícito sobre a distinção.
2. Trigger `set_forecast_baseline_amount_trg` (BEFORE INSERT):
   `NEW.baseline_amount := COALESCE(NEW.baseline_amount, NEW.amount)` — toda a linha nova
   nasce com baseline = valor de criação.
3. Backfill (Live, 02/09/2026):
   - (a) linhas com histórico em `forecast_audit_log` (`field_name IN ('Valor (EUR)','Valor')`,
     `old_value` com padrão numérico simples) → `old_value` mais antigo;
   - (b) restantes → `baseline_amount = amount`.
4. `promote_scenario_to_active` preserva `baseline_amount` via `_formalidade_carry` e
   `_formalidade_carry_split`, com match por `category_id + description` (mesmo mecanismo da
   formalidade). Linhas realmente novas ficam com `NULL` e o trigger resolve para `amount`.
   **Este é o ponto crítico**: sem isto, promover um cenário reescrevia a baseline.

## Números confirmados após aplicação (Live, 02/09/2026)

- `baseline_amount` preenchido: **1.429** linhas (0 nulos)
- linhas activas (`version_id IS NULL`): **1.074**
- linhas com histórico de valor no audit log: **95**
- `sum(amount - baseline_amount)` nas activas: **81.424,52 €** (todo o delta vem de linhas com histórico)
- `original_amount` preenchido: **0** (confirma que a coluna multi-currency ficou intacta)

## Regras

- Nunca alterar `baseline_amount` em edições de valor da linha — só o `amount` muda.
- Fecho e realizado usam `amount`; análises de desvio de planeamento usam `baseline_amount`.
- Sem UI nesta fase.
