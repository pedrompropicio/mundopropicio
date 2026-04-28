---
name: Mágicos H&K reconciliation pending
description: Reconciliação pendente entre sistema (€4.103,42) e ficheiro Excel do sócio (€3.244,49) na turnê "Mágicos Henry & Klaus" (Lisboa+Porto). Diferença ≈ €858,93 a investigar quando o utilizador pedir para retomar.
type: feature
---

## Estado atual (parado a pedido do utilizador — vamos resolver bug primeiro)

Resultado geral da turnê Mágicos H&K:
- **Sistema** (DRE Brasil + Fecho com Sócios, com overheads): **€4.103,42**
- **Ficheiro Excel do sócio** (aba "Previsão Fecho"): **€3.244,49**
- **Diferença**: ≈ **€858,93**

Receitas líquidas batem exatamente nos dois lados: **€326.070,99**.

## Hipóteses já levantadas (a confirmar quando retomarmos)

1. **Bug IVA 23% em overheads no `ReportDREBrasil.tsx`**: o select de `event_forecasts` não trazia `iva_rate`, fallback para 23% inflaciona overheads em ~€1.904,22. Corrigir adicionando `iva_rate` ao select e usar `calcTotalWithIva`.
2. **Despesas Master ausentes no ficheiro**: ~€3.763,80 (campanha JCDecaux + produção) existem no sistema mas não aparecem distribuídas nas abas Lisboa/Porto do Excel.
3. **"Descontar da bilheteira"**: várias linhas no ficheiro (BOL/Ticketline, Renda, Segurança) marcadas como dedução de receita; no sistema entram como despesas brutas — possível dupla contagem.
4. **Itens "EM NEGOCIAÇÃO" no ficheiro** ainda não aprovados/registados no sistema.

## Artefactos gerados
- `/mnt/documents/comparativo-magicos-sistema-vs-ficheiro_v2.xlsx` (último comparativo linha-a-linha).

## Próximos passos sugeridos (quando voltarmos)
- A) Corrigir `iva_rate` no select de overheads em `ReportDREBrasil.tsx`.
- B) Listar via SQL despesas "descontar da bilheteira" para simular sem duplicados.
- C) Confirmar com utilizador se itens Master devem ratear nas cidades no ficheiro.
