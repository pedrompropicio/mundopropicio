---
name: Chart of accounts — só L3 é selecionável
description: Regra absoluta: hierarquia do plano de contas é L1 > L2 > L3 e apenas folhas L3 são selecionáveis em qualquer seletor (BP, transações, auditoria, etc.). Nunca expandir para L4+ sem decisão de produto explícita.
type: constraint
---
- Plano de contas: **L1 > L2 > L3**. Só **L3** aparece em seletores.
- Se aparecerem códigos L4 (ex.: `10.7.01.02`) é resíduo a corrigir no plano, **não** sinal para mudar a UI.
- Antes de qualquer alteração que toque seletor de categorias / `buildFlatCategoryList` / similares: validar com o utilizador.
- A auditoria de contas (`AuditoriaContas.tsx`, `audit-categories` edge fn) e o seletor inline do BP **nunca** devem expandir além de L3.

