# ESTADO — Financeiro & Tesouraria

Atualizado: 07/10/2026. Números verificados em Live hoje; cartões pré-pagos conciliados contra o extrato Santander de 07/10/2026.

## Em que pé está

### Cartão 0663

- Sistema **600,89 € = banco 600,89 €**.
- Sessão `cac2f5a0-4e28-487a-b0f7-53ad69a6a9d7` fechada e integrada (46 itens). **Sem sessão aberta:** quem voltar a usar o cartão tem de abrir sessão nova.
- A integração falhou parcialmente por causa do UNIQUE em `card_session_items.transaction_id` (#279). Constraint removido e substituído por índice não-único; os 46 itens foram ligados às transações já criadas, sem criar transações novas. A reparação ficou em `closing_summary.repair`, preservando os erros originais.

Correções feitas:

- Data da despesa "Material de Escritório MP", de **113,32 €**, corrigida de 22/09 para **21/08**: duas cobranças Amazon, **105,22 + 8,10 €**.
- Entrada de **72,14 € a 25/09**: devolução parcial da Amazon, confirmada pelo Pedro. Custo real do material: **41,18 €**.
- Item duplicado de **22,19 €** (BP Tamariz 25/08, sem talão, duplicado do de 27/08) rejeitado e retirado da transação consolidada. A transação baixou de **864,66 para 842,47 €** (base **684,94 €**), de **24 para 23 despesas**.
- Acerto de conciliação de **0,05 €**.
- Ao reduzir o pagamento da transação consolidada, o trigger despromoveu-a silenciosamente para `approved` e limpou `payment_date` (#280). Status e data de pagamento foram repostos; o saldo final voltou a **600,89 €**.

### Cartão 8363

- Reconcilia a zero, sem nenhum lançamento a mais.
- Saldo contabilístico **1.714,60 € − 14 itens aprovados por integrar (476,34 €) = 1.238,26 €** de saldo real estimado, contra **262,35 €** no banco.
- A diferença são **975,91 €**, de **28 movimentos de 28/09 a 06/10**, relativos à viagem do Raphael Ghanem a Braga e regresso a Lisboa, ainda não submetidos.
- **A sessão do 8363 não deve fechar antes de entrarem estes movimentos.**

### BP do Ivete — rubrica 2.6.08

- Linha `8cc8a32b`: orçado **2.680,98 €**, realizado líquido **2.662,99 €**.
- O orçado subiu automaticamente na integração para acomodar os **22,19 €** que afinal não existiram. A decisão sobre baixar o orçado está pendente com o Pedro.

## Issues desta frente

- **#273 e #274:** abertas.
- **#275 e #276:** resolvidas e publicadas.
- **#277 (`dd8165d`) e #278 (`9aaf0b4`):** resolvidas e **POR PUBLICAR**.
- **#279:** constraint UNIQUE; aberta hoje.
- **#280:** despromoção silenciosa para `approved`; aberta hoje.

## A trabalhar agora

- Publicar `dd8165d` e `9aaf0b4`.
- Submeter as **975,91 €** da viagem do Ghanem no 8363.
- Decidir o orçado da linha do Ivete.

## Factos que não se reinvestigam

- No modelo D17, N itens partilham a mesma transação consolidada por evento × rubrica × taxa de IVA; `card_session_items.transaction_id` não é único.
- Uma integração com `error_count > 0` exige conferir itens `approved` sem `transaction_id` antes de reintegrar.
- Ao reduzir uma transação consolidada, reduzir primeiro a linha de pagamento, depois `amount` e `paid_amount`, repor `status` e `payment_date`, e conferir o saldo da conta no fim.
- `transactions.payment_method` é NOT NULL e só aceita `transfer`, `service_payment`, `direct_debit`, `state_payment`, `compensation`; não existe "card".

## Onde ler mais

- `.lovable/memory/features/card-sessions.md` — modelo D17, KPIs históricos, integração falhada e reparação, alteração de transações consolidadas.
- `docs/DECISIONS.md` — D-ERP183: substituição do UNIQUE por índice não-único.
