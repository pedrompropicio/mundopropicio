# PROCEDIMENTO — Custo partilhado com terceiros (rateio)

Aplica-se a **qualquer fatura em que parte do custo é de terceiros** — outras cidades ou promotores de uma turnê (incluindo day-offs), coprodutores, parceiros de uma operação. A MP paga o total; o resto devolve-se. Regra-mãe: **D-ERP69** — a conta corrente do circuito é a única porta entre o circuito e o resultado.

A parte fiscal resolve-se fora: no movimento financeiro emite-se ou recebe-se fatura.

## Passo 1 — Criar a conta de circuito

Uma conta por circuito, em Contas:

- `is_circuit_account = true` — é conta corrente de circuito de terceiros;
- `is_accounting = false` — não é conta contabilística;
- `skip_balance_check = false` — o saldo **é** a posição e tem de ser visível e verificável.

O saldo dessa conta é a posição líquida com o circuito: positivo, terceiros devem-nos; negativo, temos dinheiro deles por aplicar.

## Passo 2 — Lançar a fatura

A fatura entra **uma só vez, pelo total**. Grupo de fatura, lista de pagamento e ficheiro SEPA seguem intactos — o rateio nunca se resolve no fluxo de pagamento.

Dentro do total, cada linha declara de quem é o custo:

- **Parte da MP** — despesa normal: na rubrica dela, dentro do resultado, ligada à linha de BP, a consumir verba.
- **Parte de terceiros** — linha marcada com a conta de circuito (`shared_cost_account_id`). Não é custo: fica automaticamente fora do resultado, não consome verba do BP e, quando é paga, gera sozinha a contrapartida na conta corrente do circuito, em 10.12.01 "Adiantamento por Conta de Terceiros". O saldo sobe: pagámos por eles, devem-nos.

Se se souber o terceiro concreto, indica-se (`shared_cost_counterparty_id`) — serve para abrir a posição por contraparte. É opcional.

### Fatura repartida entre a MP e terceiros (desdobramento automático)

Quando a mesma fatura tem parte da MP e parte de terceiros, não se lançam duas despesas à mão: no bloco "Custo partilhado com terceiros" indica-se a **parte de terceiros** em percentagem ou valor (sobre a base sem IVA) e o sistema cria as duas pernas de uma só vez:

- parte da MP — custo normal, com linha de BP, dentro do resultado;
- parte de terceiros — adiantamento, fora do resultado, na conta de circuito.

As duas ficam no **mesmo grupo de fatura** (uma só transferência na Lista de Pagamento), herdam fornecedor, datas, IVA, descrição, método, referência e estado — incluindo lançar já pagas. Ficam **no mesmo evento**: a perna de terceiros não é custo desse evento, é a etiqueta da cidade que consumiu a fatura.

Não é possível desdobrar: com valor a zero ou pelo total inteiro (a zero é despesa normal; pelo total basta marcar a linha com a conta de circuito), em parcelas, com rateio multi-evento ou com Extra do Sócio. Em "Dividir por IVA" a repartição faz-se linha a linha e só em percentagem. Se a despesa for lançada num Master de turnê o rateio multi-evento assume o comando e o desdobramento não está disponível — lança-se na cidade.

## Passo 3 — Os três casos da quota da MP

Lança-se o que se sabe, nunca se espera pela verdade para lançar:

1. **Quota conhecida** — parte a custo da MP, resto a adiantamento por conta de terceiros.
2. **Quota estimada** — lança-se a estimativa como custo da MP, o resto a adiantamento, e ajusta-se no acerto.
3. **Quota desconhecida** — custo da MP a zero: o pagamento inteiro fica como adiantamento.

Quando a verdade chega, faz-se um lançamento por rubrica **pago pela conta corrente do circuito**, agora dentro do resultado e ligado à linha de BP. Baixa o saldo e sobe o custo no mesmo acto. É esta a única porta entre o circuito e o resultado.

## Passo 4 — A devolução do terceiro

O dinheiro entra no banco contra a conta corrente do circuito: par de transferência 10.3, como já se faz hoje. O saldo desce.

## Passo 5 — Acerto final

1. Passar às rubricas respectivas tudo o que já se sabe ser custo da MP, pago pela conta de circuito.
2. Ajustar as linhas de BP ao valor real.
3. Conferir a conta de circuito: **fica a zero**.

⚠️ **Saldo diferente de zero no fecho é erro** — falta um lançamento de custo por rubrica, falta uma devolução, ou a quota da MP nunca foi apurada. Desde 16/09/2026 o fecho do evento **bloqueia** (`event_close_blockers`, chave `circuit_accounts`, severidade hard) quando uma conta de circuito com movimentos no evento, no Master ou nas cidades tem posição ≠ 0 (tolerância 0,01 €). **Limite:** o bloqueio só encontra a conta pelas transações COM evento — um movimento do circuito sem `event_id` não é apanhado; conferir sempre o extrato da conta.

## Passo 6 — Conferir

- Painel **"Verba por usar"** no Fecho: as linhas do circuito não consomem verba, logo não aparecem lá.
- Conta de circuito a zero, ou com a diferença explicada e a receber/pagar.
- Marcar "Verbas revistas" no painel.

## Histórico

Até 15/09/2026 lançava-se a despesa **inteira** contra uma conta de acerto com `exclude_from_result` (D-ERP32, pontos 2 a 4) e o custo da MP só aparecia no acerto final. Essa convenção foi substituída: despesa e recebimento empurravam o saldo no mesmo sentido, e o custo total do circuito aparecia como custo da MP.
