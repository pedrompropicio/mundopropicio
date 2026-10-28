# #392 — preflight de pesquisa geral (28/10/2026)

HEAD inicial: 43d3ce88d4ca02c4746fb04a8e2b02296b2fda96. CI quality deste SHA: completed/success (API pública GitHub). HEAD após reserva automática: 88b5cdc9b8fe681bbb138f08155ffee5a18878d7.

## Ficheiros lidos
AGENTS.md; docs/INDEX.md; docs/QUADRO.md (conteúdo integral obtido pelo comando, incluindo log integral); docs/estado/estado-financeiro-e-tesouraria.md; .lovable/memory/features/role-accountant.md (§4/13/14 e restantes); src/lib/supabase-paging.ts; src/pages/contabilidade/AccountantDocumentsTab.tsx; src/lib/accountant-account-filter.ts; src/lib/accountant-reviews.ts; src/lib/accountant-tx-docs.ts; src/lib/string-similarity.ts; src/pages/contabilidade/PeriodSelector.tsx; src/components/CompanySwitcher.tsx; supabase/functions/generate-accountant-zip/index.ts; package.json; roadmap.md. Investigação delegada: helper de contas partilhado, migrations de RLS de reviews e testes accountant-account-filter.

## Passo 0: predicado e origem
Leituras SQL Live pelo instrumento de leitura (não por psql):

```sql
SELECT count(*) FILTER (WHERE payment_date >= '2026-01-01' AND payment_date < '2027-01-01') AS paid_2026, count(*) AS paid_all_periods
FROM public.transactions
WHERE company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c' AND (status='paid' OR paid_amount>0);
-- paid_2026=1543; paid_all_periods=1544

SELECT count(*) AS eligible_2026 FROM transactions t
WHERE t.company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
AND (t.status='paid' OR t.paid_amount>0)
AND t.payment_date BETWEEN '2026-01-01' AND '2026-12-31'
AND (t.account_id IS NULL OR NOT EXISTS (
 SELECT 1 FROM financial_accounts a WHERE a.id=t.account_id
 AND a.company_id=t.company_id AND a.is_accounting=false));
-- eligible_2026=1400; sem intervalo de datas:1401
```

Universo é deliberadamente o predicado pedido (pagas/empresa/ano de payment_date), sem corte bancário: não é auditoria de conciliação nem diagnóstico de movimentos históricos.

Código atual: payment_date inclusiva, condição paid/paid_amount>0, exclusão #235, .limit(2000), sem range. PostgREST pode limitar a1000; o universo correto da aba MP é1400, não1543 (143 excluídas por #235). Se o teto1000 se aplicar, faltariam400 elegíveis, mas NÃO foi confirmado numa sessão MP.

Playwright autenticado como Pedro, sem escrita: empresa ativa Coala; mês7 linhas e ano361 linhas, HTTP200 content-range0-360/*, limit2000 presente. Nenhum corte observado nesse universo. Query MP na mesma sessão devolveu0/count0 por isolamento; não se mudou empresa (o seletor escreve no perfil). Não se apresenta400 como perda observada. Captura atual /tmp/browser/p392/before.png.

## Factos novos que impedem cumprir R1 exatamente
1. Na sessão autenticada, consulta `transactions.select('amount.sum()')` devolveu HTTP400: `Use of aggregate functions is not allowed`. Catálogo public: nenhuma função accountant ou transaction stats/summary/filter/total adequada encontrada. Contagens por count exact existem, mas a soma dos IDs visíveis não é possível por esta via; não se substituiu por soma cliente contra a regra expressa.
2. generate-accountant-zip recebe company/period/type/account/supplier/attachments, não transaction_ids nem pesquisa nem conferência. Invocá-la com filtros atuais pode exportar transações invisíveis e rejeitar um universo >500 antes de filtrar anexos. Não foi invocada (evita escrita de exportação/audit).
3. Um ZIP novo no navegador é tecnicamente possível mas não existe implementação equivalente; exigiria reproduzir exportação/index/audit/limites200MB ou decisão explícita para essa via. Não se improvisou nem alterou edge.
4. SELECT de accountant_transaction_reviews é permitido a accountant e staff com policy restritiva de empresa. Não é necessário ampliar acesso às notas.

## Gate e estado
Antes: bunx vitest run --maxWorkers=2 →311 ficheiros PASS/2skip;3035 testes PASS/6skip/11todo (275,73s). Nenhum código/teste alterado; não há comparação pós-implementação nem tsgo novo. CI inicial verde não prova uma implementação inexistente.

Só fecho documental; reserva libertada; não pronto para Publish. Sem DDL/DML/RPC/edge/crons/segredos/Publish. Aguardar decisão do Pedro.