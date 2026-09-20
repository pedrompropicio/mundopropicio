---
name: Reconciliação de bilheteira (analítica, âmbitos e "outros movimentos")
description: Issues #128/#129/#155 — decomposição analítica por evento, âmbito declarado em cada ecrã e tile "Outros movimentos"; a fórmula D-ERP15 não muda
type: feature
---

# Reconciliação de bilheteira (#128, #129, #155 — 20/09/2026)

Lógica pura em `src/lib/ticket-office-reconciliation.ts` (com testes):

- `ticketOfficeLineKind(line)` — `kind` quando existe, senão `type`. As linhas do
  relatório mantêm `type` intacto porque a **exportação** agrupa por `type`
  (`sale`/`income`/`expense` + transferências à parte). `kind` é o eixo novo e
  separa `advance` de `transfer`.
- `decomposeTicketOfficeAnalytical(lines)` → grupos por evento com
  `balance = vendas + receitas − despesas − transferências − adiantamentos`,
  bloco `noEvent` e `total = Σ balances`.
- `ticketOfficeOtherMovements(retido, tiles)` = `retido − (vendas − despesas − transferências − adiantamentos)`.

**#128** — a analítica de `ReportTicketOfficeAudit` já não empurra adiantamentos
para `transfer` nem filtra vendas por evento atribuído; fecha por evento com a
mesma decomposição da sintética e mostra no fim a prova
`Σ eventos + sem evento` vs `saldo previsto` vs `diferença`.

**#129** — a fórmula é uma só; o universo de vendas de cada consumidor é que
difere. Cada ecrã declara o seu âmbito num HelpTooltip junto ao total:
Auditoria = todas as zonas de todos os eventos; `/bilheteiras` = só eventos
atribuídos a alguma bilheteira; painel de liquidez = só eventos daquela
bilheteira. Lista igual no cabeçalho de `src/lib/ticket-office-balance.ts`.

**#155** — `TicketOfficeBalancePanel` ganha o 5.º tile "Outros movimentos" (só
quando ≠ 0), que é o resto entre os quatro tiles e o retido (receitas lançadas
como transação + movimentos sem evento). Legenda passa a
"Vendas − despesas − transferências − adiantamentos ± outros movimentos = retido".

**Não mudou:** `computeTicketOfficeBalance` / `_ticket_office_balance_raw`
(D-ERP15), a vista sintética e a exportação. Qualquer soma de vendas continua a
começar em `get_ticket_office_sales`.
