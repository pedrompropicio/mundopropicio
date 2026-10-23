# DRE gerencial

**Para que serve.** Mostrar o resultado da empresa como a gestão o lê: receita por origem, custo de evento pelo BP, custos corporativos por grupo, e o que fica fora do resultado.
**Quando se usa / quando não.** Fecho de mês, preparação de reunião, e sempre que se quer o retrato do ano. **Não é a DRE contabilística** — essa é emitida pela contabilidade, e os dois números não têm de ser iguais.
**Chat dono.** 4 · Financeiro e Tesouraria, com a frente 7 quando toca em conta corrente de sócio
**Fontes.** `transactions`, `account_categories`, `event_forecasts`, `ticket_sales` — ver `queries.sql`
**Saída.** md; língua pt-PT

## Secções, por ordem

1. **O período e a base** — que anos, que empresa, e a frase que evita metade dos mal-entendidos: esta DRE é gerencial.
2. **Receita** — por origem. Por omissão a receita de bilheteira vem de `ticket_sales`, não de transações.
3. **Custo de evento** — por omissão vem do **BP**, não das transações.
4. **Custos corporativos** — por grupo 10.x.
5. **Resultado.**
6. **O que ficou de fora, e porquê** — transitórias, `exclude_from_result`, contas gerenciais.
7. **Linhas que caem fora de todas as secções** — o bloco de controlo. Tem de ser zero.

## Regras de forma

- **Dizer que é gerencial, no topo.** A DRE contabilística é emitida pela contabilidade.
- **Não comparar a bruto o que os ecrãs somam a líquido.** Foi assim que nasceram três números alarmantes que não existiam — um "ganho fantasma" de 140.251,62, uma divergência de 432.774,94 e uma duplicação de 440.689,55. Nenhum estava provado; todos foram retirados.
- Antes de afirmar que um grupo de rubricas é de uma natureza, **medir**. A premissa "a rubrica 10.3 é transferência interna por definição" não resistiu aos dados: tinha lá dentro 55.048,38 de custo real.
- Filtro base: `status in ('approved','paid')`, com as flags de bloqueio de resultado aplicadas e o perímetro de raiz mantido.
- Cada número com a data da consulta.

## O que fica de fora

- A DRE contabilística e qualquer afirmação fiscal.
- O acerto entre sócios — modelo `acerto-com-socios`.
- Decidir se uma conta corrente em negativo no fecho do exercício é problema: **é trabalho da contabilidade, não do sistema.**

## O defeito que este modelo tem de vigiar

Uma transação cuja **natureza não bate com a da rubrica** cai fora de todas as secções da DRE, **em silêncio**. Os custos corporativos entram por código de grupo; as receitas corporativas exigem `type = 'income'` na rubrica **e** na transação. Uma receita lançada numa rubrica de despesa cai pelas duas e desaparece.

Medido para 2026 (aprovadas/pagas, sem evento, líquido): **289.806,16** em 33 pernas de despesa de transferência a contar como custo falso, e **485.106,16** em 72 pernas de receita invisíveis. O resultado estava **subavaliado**, não inflado. O bloco 5 do `queries.sql` é o detector; o relatório traz sempre o seu resultado, mesmo quando é zero.

## Decisões que o condicionam

- A receita de bilheteira vem de `ticket_sales` e o custo de evento vem do BP — por omissão, nos dois casos.
- Vencimentos são custo e vivem em Ordenados (10.4.01), não numa rubrica de transferência.
- Movimentos entre empresas do grupo são **gerenciais, para visibilidade** — quando a facturação fecha no país de origem não há dívida de uma empresa à outra. Vivem numa conta de intercompanhias própria, não na conta corrente pessoal do sócio.
- Mover uma transação entre contas obriga a mover também a linha de `transaction_payments` — sem isso o saldo não acompanha.
- Trava de segurança ao reclassificar: o **total de custos corporativos tem de ser idêntico antes e depois**. Se mudou, mudou custo, e não era isso que estava a ser feito.

## Histórico

- 2026-10-23 — criado a partir de `claude/dre-gerencial-rubrica-10-3-e-conta-corrente-do-socio-2026-10-10.md` (Issue #304), com `claude/dre-pl-fonte-do-custo-decisao-2026-09-20.md`.
