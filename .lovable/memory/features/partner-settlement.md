---
name: Partner Settlement & Paid Expenses
description: Regras de Despesas Pagas por Sócios e Fecho com Parceiros — vínculo, escopo Master+subs, status automático
type: feature
---

# Despesas Pagas por Sócios

**Conceito**: rótulo que indica que uma despesa do evento foi adiantada do bolso de um sócio. NÃO é categoria especial, NÃO consome BP, NÃO cria nova despesa — apenas marca quem desembolsou. No Fecho com Parceiros, o valor vira crédito a favor do sócio.

## Regras
- **Qualquer categoria** do plano de contas que aceite despesa em evento (não restrito a BP nem a overhead)
- **Sem limite de orçamento** — não consome saldo do BP
- A despesa **continua a contar normalmente** no DRE, no Fecho e no rateio com sócios (impacta resultado do evento)
- Único efeito diferencial: no acerto, o valor é creditado ao sócio que pagou

## Escopo do painel "Desp. Sócios" (Master)
Em turnês/multi-dia (event com `parent_event_id` null e subs):
- Lista despesas com `event_id` no Master **e em todos os sub-eventos** (`parent_event_id = master.id`)
- Cada despesa mostra a coluna "Evento" identificando a qual cidade/dia pertence
- Filtro `partner_paid_expenses.event_id IN (master_id, ...sub_ids)`

## Status automático ao vincular
Ao criar `partner_paid_expenses`:
1. Insert com `paid_date` informada pelo utilizador (default = hoje)
2. UPDATE `transactions SET status='paid', payment_date=paid_date` para a transação vinculada
3. Mensagem: "Despesa vinculada e marcada como paga"

## Filtro "Pago por Sócio" em /transacoes
- Agrupa por `supplier_id` (identidade real do sócio), não por `partner_id` (que é por evento)
- Lista distinct de sócios cadastrados em eventos com `status <> 'completed'`
- Map `transaction_id → Set<supplier_id>` via join `partner_paid_expenses → event_partners.supplier_id`

## Fecho com Parceiros
- Soma despesas pagas por sócio por sócio
- Compara com participação % nos resultados (lucro/prejuízo conforme `partner_calc_basis`)
- Diferença = a pagar/receber do sócio
