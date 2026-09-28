---
name: Compensação ligada (transaction_offsets)
description: Receita e despesa do mesmo fornecedor ligadas por compensação; pagamento real num lado gera pagamento compensation sem conta no outro via trigger na base (vale para todos os caminhos); estorno propaga; invariante compensacao_pendente
type: feature
---

# Compensação ligada (28/09/2026, D-ERP146)

Origem: Ivete Clareou 2026 — a MP fatura ao operador comissão+fees (1.1.03) e transfere-lhe
as vendas LÍQUIDAS ("Repasse ZigPay — …"). Os repasses foram pagos na lista; as faturas
ficaram abertas porque nada as ligava. Mesmo padrão em bares, A&B, Ticketline, Coala.

## Regra
Uma receita e uma despesa do MESMO fornecedor/cliente podem ser ligadas. Quando uma recebe
um pagamento real, a outra fica paga por compensação na mesma data, pelo valor ligado
(`least(valor ligado, em aberto)`). A ligação é um dado; o efeito vive na base.

## Base
- `transaction_offsets` (receivable → income, payable → expense, amount > 0, note,
  created_by). Único por par. Trigger `validate_transaction_offset`: mesma empresa, tipos
  certos, mesmo `supplier_id` (não nulo), nenhuma estornada/escondida, soma ≤ bruto de cada lado.
  RLS: SELECT `has_staff_role`; escrita admin/manager/editor; RESTRICTIVE por empresa.
- `transaction_payments.offset_id` → marca os `compensation` gerados (ON DELETE RESTRICT).
- `trg_apply_transaction_offsets` (AFTER INSERT / UPDATE OF status,reversed_at / DELETE):
  pagamento real `paid` → `_apply_transaction_offset` insere `compensation`, sem conta,
  `offset_id`, idempotente. Pagamentos `compensation` não disparam nada.
  Estorno/apagamento do real → as compensações dessa ligação passam a `status='reversed'`,
  `reversal_reason='estorno do pagamento de origem'` (reversal_kind fica NULL: o CHECK só
  aceita cash_refund/supplier_credit e compensação não é nenhum deles). Só estorna quando a
  transação de origem já não tem NENHUM pagamento real vivo.
- `paid_amount`/estado derivam SEMPRE de `_derive_paid_amount(tx)` — lógica do D-ERP86
  extraída de `sync_paid_amount_from_payments` (que agora só a chama). Dentro de trigger o
  sync sai por `pg_trigger_depth() > 1`, por isso o trigger de compensação chama a mesma função.
- RPCs invoker: `transaction_offset_create(rec, pay, amount, note)` (aplica logo se um lado
  já tem pagamento real), `transaction_offset_remove(id)` (recusa se aplicada).
- Invariante `compensacao_pendente` (error, empresa, referência 0) em `_run_invariant_checks_extra`.

## Ecrã
- Modal da transação, aba Pagamento: bloco "Compensação" (`TransactionOffsetsBlock`).
- Lista de pagamento e lote: `OffsetLineNote` ("compensa … · valor"). Totais não mudam.
- Lista de transações: selo "Compensada" (`OffsetPaidBadge`).

## Backfill 28/09
Ivete: 6 ligações fatura↔repasse (valor = bruto da fatura) e os 6 `compensation` de 24/09
ligados por `offset_id`. Sem pagamentos novos; saldos bancários iguais.
Candidatos por ligar: Anitta EDA 2026 "A&B Bares — quota MP 35%" (100.498,50) e
"A&B Food — quota 30%" (29.613,50) — sem fornecedor, logo não ligáveis até o Pedro decidir.
