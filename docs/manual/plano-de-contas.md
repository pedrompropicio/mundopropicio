---
capitulo: plano-de-contas
titulo: Plano de Contas
modulo: erp
atualizado: 2026-11-04
perfis: []
rotas: [/plano-contas]
fontes: [src/pages/AccountCategories.tsx, src/components/CategoryFormModal.tsx, src/components/TransactionFormModal.tsx, src/components/ReportDRE.tsx, src/components/EventForecast.tsx, src/lib/category-hierarchy.ts]
---

## Estrutura hierárquica

```ajuda
id: plano-contas.estrutura
tooltip: "O Plano de Contas organiza receitas e despesas em categorias hierárquicas (com códigos). É a base para relatórios DRE e BP."
ecras: [plano-contas]
perfis: []
fontes: [src/pages/AccountCategories.tsx, src/components/CategoryFormModal.tsx]
termos: [Plano de Contas, códigos]
```

O Plano de Contas organiza receitas e despesas em categorias com códigos numéricos (ex: 1 → Produção, 1.1 → Som e Luz). A ordenação é sempre pelo código. Categorias podem ser Receita ou Despesa.

## Vínculo a eventos

```ajuda
id: plano-contas.eventos
tooltip: "A obrigatoriedade de associar um evento é definida na categoria raiz e herdada pelas subcategorias."
ecras: [transacoes]
perfis: []
fontes: [src/components/TransactionFormModal.tsx, src/components/CategoryFormModal.tsx]
termos: [eventos, grupo 10]
```

A obrigatoriedade de associar um evento é definida na categoria raiz e herdada pelas subcategorias. O código do grupo, incluindo o Grupo 10 (Administrativo/Financeiro), não determina por si só essa exigência; a opção 'Evento obrigatório' é configurada no nível 1.

## Impacto nos relatórios

```ajuda
id: plano-contas.relatorios
tooltip: "O DRE e o BP agrupam valores pela hierarquia do Plano de Contas."
ecras: [relatorio-dre, business-plan]
perfis: []
fontes: [src/components/ReportDRE.tsx, src/components/EventForecast.tsx, src/lib/category-hierarchy.ts]
termos: [DRE, BP, relatórios]
```

O DRE e o BP agrupam valores pela hierarquia do Plano de Contas. Uma categorização correta é essencial para relatórios precisos.
