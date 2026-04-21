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
1. **Criação direta** (`TransactionFormModal`): toggle "🧳 Extra do Sócio" + selector de sócio (suporta split parcial)
2. **Conversão posterior** (`TransactionEditModal`): bloco "Converter em Extra do Sócio" — total OU parcial
3. **Desmembramento via Split multi-evento**: selecionar "Sócio" como destino

## Split parcial (apenas parte da fatura é extra)
Quando uma fatura tem **só uma parcela** que é extra do sócio (e o resto é despesa normal da empresa):
- **Na criação** (`TransactionFormModal`): dentro do bloco "Extra do Sócio", campo "Apenas parte da fatura é extra (€)" — sempre visível enquanto não estiver em Split multi-evento; fica desativado até o utilizador preencher o Valor (€) da fatura
- **Na edição** (`TransactionEditModal`): toggle "Apenas parte da fatura é extra do sócio" no bloco "Converter em Extra do Sócio"
- Vazio = fatura inteira é extra (principal fica `is_transitory=true`)
- Preenchido com valor `> 0 && < total`: principal fica **NORMAL** (entra DRE/BP) com valor TOTAL; cria transação **irmã transitória** com valor parcial, ambas com **mesmo `invoice_group_id`** (gerado se necessário). A irmã é a que vai a `partner_advance_expenses`. A descrição da irmã é `"<descrição> — extra sócio (parcial)"`.
- Validação: parcial deve ser `> 0` e `< amount`
- Liquidação: a fatura é paga 1× pelo total (transação principal). A irmã fica `status='paid'` desde a criação mas como `is_transitory=true` não consome saldo.

## Reversão (Extra do Sócio → despesa normal)
No `TransactionEditModal`, dentro do bloco laranja do Extra do Sócio:
- **Total** (toggle off): apaga `partner_advance_expenses` da transação e marca `is_transitory=false`. A despesa volta a entrar no DRE/BP.
- **Parcial** (toggle on, valor X€ < amount): reduz a transitória do sócio para `(amount − X)`, garante `invoice_group_id` partilhado e cria nova transação NORMAL pelo valor X com mesmo evento/fornecedor/categoria/fatura/data. Descrição: `"<descrição> — revertido do sócio"`.
- **Reversão de split parcial existente** (transação principal NORMAL com irmã transitória detetada via `invoice_group_id`): bloco dedicado oferece "Remover Extra do Sócio desta fatura" — apaga `partner_advance_expenses` da irmã e elimina a irmã. A principal mantém o total e continua no DRE/BP.

## Bloqueio
Operações de conversão/reversão exigem admin OU (manager E evento não concluído). Em eventos `status='completed'`, apenas admin pode mexer.

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
