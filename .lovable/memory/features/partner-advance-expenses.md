---
name: Partner Advance Expenses (Extras do Sócio)
description: Despesas pagas pela empresa que devem ser descontadas do sócio no fecho — transitórias, vínculo obrigatório a evento, abatem do payout. Suporta split parcial (apenas X€ da fatura é extra) via transação irmã transitória.
type: feature
---

# Extras do Sócio (Partner Advance Expenses)

**Conceito**: despesas pagas pela empresa (hotel, passagens, traslados, etc.) que devem ser **descontadas do sócio** no fecho do evento. Diferente de "Pago por Sócio" (onde o sócio adianta dinheiro do bolso), aqui é a empresa que paga e depois cobra do sócio.

## Tabela
`partner_advance_expenses` (1:1 com transactions):
- `transaction_id` UNIQUE FK → transactions (CASCADE delete)
- `partner_id` FK → event_partners (NOT NULL)
- `event_id` FK → events (NOT NULL — vínculo obrigatório a evento)
- RLS: leitura por authenticated; insert/update/delete por admin/manager

## Regras essenciais
- **Sempre transitória** (`is_transitory = true`) — não compõe DRE/Fecho/BP
- **Mutuamente exclusiva** com "Pago por Sócio" (toggles não podem coexistir)
- **Vínculo obrigatório a evento** (não existe versão "avulsa")
- Eliminação da transação cascateia para `partner_advance_expenses`

## Fluxos de entrada
1. **Criação direta** (`TransactionFormModal`): toggle "🧳 Extra do Sócio" + selector de sócio do evento
2. **Conversão posterior** (`TransactionEditModal`): bloco para marcar/desmarcar despesa existente como Extra do Sócio
3. **Desmembramento parcial**: via Split existente (selecionar "Sócio" como destino) ou modal dedicado "Desmembrar para sócio"

## Split parcial (apenas parte da fatura é extra)
Quando uma fatura tem **só uma parcela** que é extra do sócio (e o resto é despesa normal da empresa):
- No `TransactionFormModal`, dentro do bloco "Extra do Sócio", aparece campo "Apenas parte da fatura é extra (€)"
- Vazio = fatura inteira é extra (comportamento original: principal fica `is_transitory=true`)
- Preenchido com valor `> 0 && < total`: principal fica **NORMAL** (entra DRE/BP) com valor TOTAL; cria transação **irmã transitória** com valor parcial, ambas com **mesmo `invoice_group_id`** (gerado se necessário). A irmã é a que vai a `partner_advance_expenses`. A descrição da irmã é `"<descrição> — extra sócio (parcial)"`.
- Disponível apenas em modo simples (sem split multi-evento)
- Validação: parcial deve ser `> 0` e `< amount`
- Liquidação: a fatura é paga 1× pelo total (transação principal). A irmã fica `status='paid'` desde a criação mas como `is_transitory=true` não consome saldo.

## Fecho do Sócio (`PartnerSettlementTab`)
Fórmula:
```
settlement = partnerShare + totalPaidByPartner − totalPartnerExtras
```
- `partnerShare`: quota-parte no resultado do evento
- `totalPaidByPartner`: somatório de partner_paid_expenses (Pago por Sócio) — **soma**
- `totalPartnerExtras`: somatório de partner_advance_expenses (Extras do Sócio) — **subtrai**

Renderização:
- Card de cada sócio mostra 4 colunas: Participação / Pagas pelo sócio (+) / Extras do sócio (−) / Saldo final
- Tabela detalhada dos extras quando existirem
- Reflectido no PDF de fecho

## Escopo Master+Subs
Mesma lógica de `partner_paid_expenses`: query `event_id IN (master_id, ...sub_ids)` quando renderizado no Master de turnê.
