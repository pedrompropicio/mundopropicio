# Conciliação bancária

**Para que serve.** Explicar, linha a linha, a diferença entre o saldo do banco e o saldo do sistema num período, e deixar a lista do que falta lançar.
**Quando se usa / quando não.** A cada extrato novo, antes de qualquer afirmação sobre tesouraria, e sempre que uma aprovação de pagamento é travada por saldo. Não se usa para cartões pré-pagos (é `conciliacao-cartoes`) nem para a posição com bilheteiras (é `bilheteira-por-apuramento`).
**Chat dono.** 4 · Financeiro e Tesouraria
**Fontes.** `bank_statements`, `bank_statement_lines`, `bank_line_transactions`, `transactions`, `financial_accounts` — ver `queries.sql`
**Saída.** md; língua pt-PT

## Secções, por ordem

1. **O extrato** — conta, período, nº de linhas, e quantas ficaram pré-corte, conciliadas e por explicar.
2. **A diferença** — saldo do sistema, saldo declarado pelo banco, diferença.
3. **A decomposição, que tem de fechar ao cêntimo** — linhas por explicar, transações sem movimento no banco, retenções identificadas à parte, resto sem explicação (que tem de ser 0,00).
3. **As linhas por explicar**, agrupadas por natureza e com o valor de cada grupo.
4. **As transações sem movimento no banco** — o lado inverso, que nenhuma ferramenta anterior mostrava.
5. **O que se corrigiu** e o que fica por lançar.

## Regras de forma

- **A decomposição fecha ao cêntimo, com uma linha "resto sem explicação" explícita.** Se essa linha não for 0,00, escreve-se o valor — não se arredonda nem se omite.
- **Uma transação explica uma linha, e só uma.** Já aconteceu uma camada casar uma transação que outra camada já tinha consumido, e esconder uma transferência por explicar.
- **Retenção na fonte não é divergência**: o banco paga o líquido, o sistema regista o bruto. Aparece como parcela própria da decomposição, nunca como erro.
- **Linhas até à data de corte não se conciliam** — já estão dentro do saldo implantado. Importam-se como histórico (`pre_cutoff`) e ficam fora de tudo.
- A validação contra o saldo implantado compara com o saldo do extrato **ao fecho do dia do corte**, não com a abertura do ficheiro.
- Não se espera pelo fecho de um evento para lançar receita já recebida: enquanto não estiver lançada, o saldo do banco está abaixo do real — e é esse saldo que trava aprovações de pagamento.

## O que fica de fora

- Decidir a natureza de uma conta corrente de sócio — é decisão do Pedro, e a parte gerencial vive no `dre-gerencial`.
- Reclassificar rubricas. Se a rubrica está errada, abre-se Issue.
- O fecho do A&B. A conciliação lança pelo líquido; repartição e taxas do adquirente resolvem-se no fecho.

## Decisões que o condicionam

- **D-ERP29** — o lançamento a partir da linha do banco só entra depois de as camadas falharem, e sempre com confirmação humana. As camadas nunca escrevem em `transactions`, só ligam.
- **D-ERP30** — o débito do Google não é custo: cobra por limiar, não por mês nem por evento. Trata-se como entrega de dinheiro (par de transferência para a conta corrente da plataforma); lançá-lo como despesa conta o custo duas vezes.
- As camadas são três, por esta ordem: lote SEPA, valor exato com janela de 5 dias, descrição por Dice ≥ 0,8.
- **Lote SEPA gerado duas vezes não é ambiguidade**: empate dentro da mesma lista de pagamento casa; entre listas diferentes, recusa.
- Ponte N:1 (uma linha do banco para N transações): a soma dos `paid_amount` tem de bater com `abs(amount)` da linha a ±0,01. **Não existe conciliação parcial.**
- Documento no movimento do banco: `bank_line_documents` com réplica em `transaction_documents` (`file_url` com prefixo `bank://`, `partner_visible = false`). `is_accounting` e `partner_visible` são eixos independentes.
- Divergência de saldo a partir do 2.º extrato resolve-se por cascata, e a verificação é **por conta** — períodos sobrepostos deram falsos avisos.

## A classe de erro que este relatório existe para apanhar

Uma transação marcada paga **sem movimento nenhum no banco**. Foi assim que apareceram 6.120,00 € de diárias pagas em numerário levantado ao balcão: o mesmo dinheiro descontado duas vezes, uma no levantamento e outra nas despesas. Corrigiu-se com um par de transferência para a Conta Caixa, que passou a fechar a 0,00.

## Histórico

- 2026-10-23 — criado a partir de `claude/conciliacao-bancaria-construcao-e-primeiro-extrato-2026-09-10.md` (D-ERP28/29/30), com `claude/fecho-sessao-2026-09-12-iban-e-duplicados-fornecedores.md` (ponte N:1 e documentos na linha) e `claude/financeiro-sessao-16-09-conciliacao-taxas-pag-servicos.md` (cascata do aviso de saldo, taxas internacionais).
