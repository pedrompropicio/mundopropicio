# Exemplo — Primeiro extrato conciliado (09-10/09/2026)

> **Origem dos números.** Live, consultados a 09-10/09/2026. Decisões D-ERP28, D-ERP29, D-ERP30.
> Relatório original: `claude/conciliacao-bancaria-construcao-e-primeiro-extrato-2026-09-10.md`.
> **Anonimização:** banco, fornecedores e beneficiários por papel; valores reais.

## 1. O extrato

31/08 a 09/09. **57 linhas · 5 pré-corte · 16 conciliadas · 36 por explicar.**

## 2. A diferença

| | € |
|---|---:|
| Saldo do sistema a 09/09 | 413.319,12 |
| Saldo declarado pelo banco | 439.403,92 |
| **Diferença** | **26.084,80** |

## 3. A decomposição, que fecha ao cêntimo

| Parcela | € |
|---|---:|
| Linhas por explicar | +26.084,80 |
| Transações sem movimento no banco | 0,00 |
| Retenção identificada à parte | 207,00 |
| **Resto sem explicação** | **0,00** |

Os três lotes SEPA do período casaram e explicaram **32 despesas de uma vez**: 13.053,24 (5
despesas) · 20.738,59 (8) · 20.389,21 (19).

## 4. As 36 linhas por explicar

23 entradas (43.901,87 €) e 13 saídas (17.817,07 €). **33 não têm candidata em conta nenhuma, em
estado nenhum, ±15 dias** — não é falha do motor, a transação não existe.

- **16 liquidações de TPA, 27.241,87 €** — bar de um evento. Entram como receita única em F&B
  (bar e alimentação partilham a rubrica de receita, pelo que a dúvida entre os dois não afeta a
  contabilidade). Lança-se pelo líquido; repartição e taxas do adquirente ficam para o fecho do
  A&B. **Não se espera pelo fecho** — enquanto não estiver lançado, o saldo do banco está 27 mil
  abaixo do real, e é esse saldo que trava aprovações de pagamento.
- **14.577,50 €** de recebimentos de três clientes, em parcelas de 2.082,50 e 4.165,00.
- **Plataforma de anúncios, 1.576,29 €** em quatro débitos (500 · 500 · 500 · 76,29).
- Portagens, comissão de gestão 15,80 e imposto de selo 0,63, seguro 48,40, serviços 121,50.
- **Três transferências para o sócio**: 3.000 + 3.000 + 10.000.

## 5. O que o ecrã encontrou sozinho, no primeiro dia

**Diárias de alimentação, 6.120,00 €, marcadas pagas a 03/09.** Sem lista de pagamento, sem
ficheiro SEPA, sem movimento no extrato. Investigada: 6.120,00 + 1.890,00 (29/08) = **8.010,00**,
que é o levantamento de numerário de 28/08 identificado numa auditoria anterior. Dinheiro vivo
levantado ao balcão e pago como diárias, com as despesas lançadas no banco em datas posteriores ao
levantamento — **o mesmo dinheiro descontado duas vezes**.

Corrigido: o levantamento passou a ser um par de transferência banco → Conta Caixa a 28/08, e as
duas diárias passaram a ser pagas pela Conta Caixa. A Caixa fecha a **0,00** e o banco subiu
6.120,00.

**Padrão por limpar:** nove transações com fornecedor "pago em espécie" lançadas no banco, à volta
de 20 mil euros. Mesmo erro. Todas pré-corte — aparecem quando esse mês for conciliado.

## 6. As quatro regras que o primeiro extrato obrigou a escrever

**Linhas até à data de corte não se conciliam.** Já estão dentro do saldo implantado. Importam-se
como histórico (`pre_cutoff`). A validação compara com o saldo do extrato **ao fecho do dia do
corte**, não com a abertura do ficheiro — o extrato pode começar no próprio dia do corte, e
começou.

**Uma transação explica uma linha, e só uma.** As camadas não partilhavam o registo do que já
tinham consumido: uma transferência de −3.000,00 casou com uma transação que já estava explicada
por um lote SEPA, e escondeu uma transferência por explicar.

**Lote SEPA gerado duas vezes não é ambiguidade.** Uma lista tinha dois exports com o mesmo total,
um minuto de diferença. Empate dentro da mesma lista casa; entre listas diferentes, recusa.

**Retenção na fonte não é divergência.** O banco paga o líquido e o sistema regista o bruto: banco
20.389,21 €, sistema 20.596,21 €, retenção 207,00 €. Aparece identificada, como parcela própria.
