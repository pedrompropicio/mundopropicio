
## Reformulação da coluna Real — Análise de Resultados

### Decisões consolidadas
- **P1 (cenário 80%)**: Opção C — substituir por **"Real Pessimista"** = vendas atuais × fator
- **P2 (despesas reais)**: Opção C — **Real onde existe + BP onde não existe** (substituição linha-a-linha por categoria)
- **P3 (Master)**: Sim — manter divisão igualitária do Master ÷ nº sub-eventos

### Nova estrutura de colunas

| Coluna | Receita | Despesas |
|---|---|---|
| **Planeado 100%** | Bilheteira BP (lotes×preço) + outras receitas BP | BP completo + rateio Master + custos fecho BP |
| **Real Atual** | Bilheteira **vendida** + outras receitas BP | **Real onde existe + BP onde não** (por categoria) + rateio Master idem + fecho real |
| **Real Pessimista** | Bilheteira vendida × fator (default 0,80) + outras receitas BP | Igual ao Real Atual |

### Lógica de substituição linha-a-linha (P2 — Opção C)

Para cada categoria do BP do evento (e do Master prorrateado):
```
despesa_real_categoria = transacoes_reais[categoria].sum() > 0 
    ? transacoes_reais[categoria].sum() 
    : bp[categoria].amount
```

Isto significa:
- Categoria com transação executada → usa o **valor real** (mesmo que > BP)
- Categoria sem transação → assume **BP** (custo previsto ainda por executar)
- Transação real **sem linha BP correspondente** → soma como custo extra (fora do BP)

### Implementação técnica em `ResultsAnalysis.tsx`

1. **Novo helper `mergeBpAndReal(eventId)`** — agrupa BP e transações por `category_id`, retorna `Map<categoryId, amount>` aplicando regra C
2. **Substituir** `txnMap[event.id]?.expense` por `mergedExpenseMap[event.id]` na coluna Real
3. **Renomear** coluna "Real" para "Real Atual" e adicionar coluna "Real Pessimista"
4. **Substituir** coluna "Planeado 80%" por "Real Pessimista" (fator 0,80 só sobre bilheteira vendida)
5. **Master proration**: aplicar mesma lógica `mergeBpAndReal(masterId)` antes de dividir por nº sub-eventos
6. **Custos fecho**: já são reais (mantém)
7. **Atualizar `mem://features/results-analysis-rules`** com nova lógica

### Estrutura visual final
```text
| Categoria         | Planeado 100% | Real Atual | Real Pessimista |
|-------------------|---------------|------------|-----------------|
| Receita Bilheteira| BP            | Vendido    | Vendido × 0,80  |
| Outras Receitas   | BP            | BP         | BP              |
| Despesas          | BP            | Real||BP   | Real||BP        |
| Custos Fecho      | BP            | Real       | Real            |
| RESULTADO         | calc          | calc       | calc            |
```

### Pontos de atenção
- Transações **sem categoria** ou com categoria fora do BP → contam como despesa extra (não substituem nada)
- Fator 0,80 será **constante** (sem UI para ajustar nesta iteração) — pode evoluir depois
- Coluna Real Atual ≈ Planeado 100% quando vendas a 100% e sem desvios; **deliberado**
