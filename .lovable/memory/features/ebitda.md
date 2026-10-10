---
name: Vista EBITDA (D-ERP151)
description: Classe ebitda_class por conta de lançamento, helper único ebitda.ts, EBITDA só no DRE; IRC fora do resultado do evento; nunca base de sócios
type: feature
---
- `account_categories.ebitda_class`: NULL=operacional | financeiro | imposto_rendimento | amortizacao.
- Iniciais (todas as empresas, por código): 10.5.03 imposto_rendimento; 10.6.02/03/04/05 financeiro. 10.6.01, 10.5.05, 2.7.05 operacionais. Coala não tem 10.6.04/05 (não se criam). Sem conta de amortizações.
- Classe lê-se na conta onde a linha está lançada; NÃO herda da L2.
- EBITDA = resultado + gastos das classes − rendimentos das classes. Helper `supabase/functions/_shared/settlement/ebitda.ts` (reexport `src/lib/ebitda.ts`): `costParcelsOnBasis` (card, sobre computeEventCostOnBasis), `signedParcelsFromLines` (DRE/receitas), `computeEbitda` (ponte). Ordem da ponte: Resultado → + Imposto sobre o rendimento → = Resultado antes de impostos (subtotal, só quando IRC ≠ 0) → + Resultado financeiro → + Amortizações → EBITDA; linhas a zero escondidas; o valor do EBITDA não depende da ordem. Testes `src/lib/__tests__/ebitda.test.ts`.
- Ecrãs: SÓ o DRE (toggle junto de Vista Sócio; ponte após RESULTADO LÍQUIDO; card EBITDA global). O toggle Resultado/EBITDA saiu do EventDetail (adenda 10/10/2026). Plano de Contas: campo "Classe para EBITDA" (mesmas permissões de edição).
- Vista de análise: sócios, MUNDO PROPÍCIO (x%), cachê e Fecho sempre sobre o resultado. Nunca repartir sobre EBITDA.
- IRC fora do resultado do evento (adenda D-ERP151, 10/10/2026): `isIncomeTaxLine`/`withoutIncomeTax` em `_shared/settlement/fecho-filters.ts` — regra única, aplicada em computeEventCostOnBasis e no motor do fecho; as leituras trazem `account_categories(ebitda_class)`. Financeiro e amortizações ficam dentro. O DRE não usa esta regra (mostra o IRC abaixo do resultado).
