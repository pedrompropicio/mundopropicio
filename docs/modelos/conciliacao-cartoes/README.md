# Conciliação de cartões pré-pagos

**Para que serve.** Pôr o saldo de cada cartão pré-pago no sistema igual ao saldo no banco, e dizer o que explica a diferença, movimento a movimento.
**Quando se usa / quando não.** Antes de fechar uma sessão de cartão, quando chega o extrato do cartão, e quando o saldo do cartão no ERP deixa de parecer plausível. Não se usa para a conciliação da conta bancária principal (é `conciliacao-bancaria`).
**Chat dono.** 4 · Financeiro e Tesouraria
**Fontes.** `financial_accounts` (`type = 'prepaid_card'`), `card_sessions`, `card_session_items`, `card_session_loads`, `transactions`, `bank_statement_lines` — ver `queries.sql`
**Saída.** md; língua pt-PT

## Secções, por ordem

1. **Âncora** — a data em que cartão e sistema tinham o mesmo saldo, e qual era. Sem âncora não há conciliação, há adivinhação.
2. **Desde a âncora** — tabela de duas colunas, banco contra sistema, débitos e créditos com a contagem de movimentos.
3. **A diferença, decomposta** — quanto é gasto a mais e quanto é crédito em falta; a soma tem de dar a diferença.
4. **Os achados**, um por um e numerados: o que o banco tem, o que o sistema tem, e qual dos dois está certo.
5. **Correções executadas** — o que se mudou, com o id da transação e a referência à auditoria.
6. **Resultado** — uma linha: sistema = banco, ou a diferença que fica e porquê.
7. **Armadilhas descobertas** — o que mordeu nesta passagem e vai morder na próxima.

## Regras de forma

- A conciliação fecha ao cêntimo ou declara em quanto não fecha. "Aproximadamente" não é resultado.
- Cada achado diz **qual dos dois lados está certo**, não só que divergem.
- Movimentos por lançar que dependem do portador (talões por submeter) entram como linha própria do cálculo, não como desculpa no fim.
- Toda a correção deixa rasto: `transaction_audit_log` ou `system_audit_log`, citados no relatório.
- Acertos de conciliação nascem com `exclude_from_result` — não são despesa nem receita do evento.

## O que fica de fora

- O fecho da sessão de cartão em si (saldo teórico, ajuste, integração). Isto é a conciliação contra o banco; o fecho é outro ato.
- Reclassificar rubricas. Se a rubrica está errada, abre-se Issue.

## Decisões que o condicionam

- **Saldo de abertura dinâmico**: `card_sessions.opening_balance` é só o override manual; `NULL` significa calculado na leitura. Transações retroativas refletem-se sozinhas.
- **Disponível no cartão** (saldo real da conta) e **saldo teórico da sessão** (abertura + cargas − aprovado − pendente) são conceitos distintos e não se confundem.
- A perna de entrada de uma carga **só nasce quando a saída passa a `paid`**; "Marcar como Pago" numa lista de pagamento é visual e não dispara o trigger. Invariante `carga_sem_credito` vigia.
- `transactions.payment_method` aceita só `transfer`, `service_payment`, `direct_debit`, `state_payment`, `compensation`, e é NOT NULL apesar de o CHECK permitir NULL.

## Armadilha que custou uma passagem inteira

Baixar o `paid_amount` de uma transação consolidada esbarra na trava `guard_paid_amount_vs_payments`: é preciso reduzir primeiro a linha de `transaction_payments` — e ao fazê-lo um trigger **despromove a transação de `paid` para `approved` e limpa `payment_date`**. Repor estado e data a seguir, sempre. Detetou-se pelo saldo da conta a saltar sozinho.

## Histórico

- 2026-10-23 — criado a partir de `claude/conciliacao-cartoes-0663-8363-2026-10-07.md`.
