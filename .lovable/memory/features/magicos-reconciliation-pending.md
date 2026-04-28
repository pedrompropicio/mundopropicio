---
name: Mágicos H&K reconciliation pending
description: Reconciliação pendente entre sistema e ficheiro Excel do sócio na turnê "Mágicos Henry & Klaus" (Lisboa+Porto). Bug receita bilheteira c/IVA já corrigido (28/Abr/2026).
type: feature
---

## Bug corrigido (28/Abr/2026)

**Receita de bilheteira no DRE Brasil (cards)** estava a tratar `unit_price` como **net (s/IVA)**, mostrando €345.635,28 em vez do correto €326.071,02. O PDF/export já estava certo. Corrigido em `src/components/ReportDREBrasil.tsx` → `buildDREBrasil`: agora extrai IVA do `lot.iva_rate` (default 6% para bilhetes PT), igual ao `buildDREForExport`.

**Regra canónica**: na tabela `ticket_sales`, `unit_price` = preço de capa **c/IVA**. Para receita líquida usar `unit_price / (1 + iva_rate/100)`.

## Estado de reconciliação a confirmar

Após a correção, cards e PDF devem agora mostrar **Resultado ≈ €5.994,51** (Mágicos H&K consolidado, Vista Sócio ON). Comparar novamente com ficheiro do sócio (€3.244,49) — diferença residual ≈ €2.750 a investigar:

1. Despesas Master ausentes no ficheiro (~€3.763,80: campanha JCDecaux + produção)
2. Linhas "descontar da bilheteira" no ficheiro tratadas como dedução vs no sistema como despesa bruta
3. Itens "EM NEGOCIAÇÃO" ainda não registados no sistema

## Hipóteses adicionais ainda em aberto

- Bug `iva_rate` em overheads no `ReportDREBrasil.tsx` (select de `event_forecasts` sem `iva_rate` → fallback 23%) — verificar se afeta esta turnê.

## Artefactos
- `/mnt/documents/comparativo-magicos-sistema-vs-ficheiro_v2.xlsx`
