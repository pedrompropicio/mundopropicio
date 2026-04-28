---
name: Camarim IVA snap on integration
description: Edge fn close-camarim-session faz snap de iva_rate para taxa PT mais próxima e regrava amount como base líquida
type: feature
---
# Snap de IVA no fecho de sessão de camarim

## Problema
Recibos de camarim agregam várias linhas com taxas PT diferentes (mercearia 6%/13%/23%). O cálculo `iva/base × 100` dá rácios intermédios (17%, 20%, 22%) que:
1. Violam o constraint `transactions_iva_rate_check` (só aceita {0,6,13,23}).
2. Não correspondem a nenhuma taxa fiscal real.

## Solução (escolha A)
Em `supabase/functions/close-camarim-session/index.ts`:
1. **Snap de `iva_rate`** para `{0,6,13,23}` mais próximo do rácio real.
2. **Recalcular `amount` como BASE LÍQUIDA**: `amount = totalAmount / (1 + snappedRate/100)` — respeita a Core rule do projeto ("DB amount é Net value").
3. **`paid_amount = totalAmount`** (bruto, pagamento real ao fornecedor).
4. **Specification regista o desvio** quando `|ivaRecalculado - ivaReal| > 1 cêntimo`: *"IVA real do recibo: X€ · IVA recalculado a Y%: Z€ · desvio W€ (taxas mistas)"* para auditoria fiscal.

## Consumidores que ficam consistentes
- DRE (`export-dre.ts`): `iva = amount × rate / 100` produz IVA muito próximo do real.
- Relatório IVA: taxa snap representa a taxa dominante do recibo.
- BP vs Real / Análise de Resultados: `amount` líquido casa com forecasts.

## Trade-off aceite
Para recibos com taxas mistas, o IVA reportado pode divergir do real em **até ~€1**. A `specification` documenta o desvio para o contabilista poder explicar.
