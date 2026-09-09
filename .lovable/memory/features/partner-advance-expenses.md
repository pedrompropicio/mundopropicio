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

## Split parcial (apenas parte da fatura é extra) — A FATURA REPARTE-SE, NÃO SE DUPLICA
Quando uma fatura tem **só uma parcela** que é extra do sócio (e o resto é despesa normal da empresa):
- **Na criação** (`TransactionFormModal`): dentro do bloco "Extra do Sócio", campo "Apenas parte da fatura é extra (€, s/IVA)"; fica desativado até o utilizador preencher o Valor (€) da fatura, e mostra pré-visualização da repartição (principal e irmã, s/IVA e c/IVA)
- **Na edição** (`TransactionEditModal`): toggle "Apenas parte da fatura é extra do sócio" no bloco "Converter em Extra do Sócio"
- Vazio = fatura inteira é extra (principal fica `is_transitory=true`)
- Preenchido com valor `> 0 && < total`: **a fatura reparte-se** — `principal.amount = total − X` (NORMAL, entra DRE/BP) e `irmã.amount = X` (transitória, é a que vai a `partner_advance_expenses`), ambas com o **mesmo `invoice_group_id`** (gerado se necessário) e a **mesma `iva_rate`**. A descrição da irmã é `"<descrição> — extra sócio (parcial)"`.
- **Invariante (D-ERP24)**: a soma dos `amount` das transações do grupo é igual ao total da fatura. É essa invariante que impede a dupla contagem — antes a principal ficava pelo total e os mesmos euros contavam ao mesmo tempo no custo do evento e no débito ao sócio.
- **Status e `paid_amount`**: a irmã **herda o `status` da principal**. Se a principal estava paga por inteiro, cada uma fica com o **seu próprio bruto** em `paid_amount`; se estava por pagar, ambas ficam a zero.
- **Recusas**: a conversão é recusada quando a principal tem linhas em `transaction_payments` (o razão de pagamentos passaria a somar mais do que o bruto dela — é preciso acertar os pagamentos primeiro) ou quando está paga só em parte (`0 < paid_amount < bruto`), por não haver forma não-arbitrária de repartir o que já foi pago.
- **Na criação, extra parcial não se combina com "Pagar em parcelas"**.
- Validação: parcial deve ser `> 0` e `< amount`


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

## Duas naturezas de extra, uma fonte única
Existem **duas** naturezas legítimas de "Extra do Sócio", ambas a abater no acerto e **nenhuma custo do evento**:
- `partner_advance_expenses` — a empresa pagou uma despesa que é custo do sócio; ligada 1:1 a uma transação real (transitória).
- `event_partner_extras` — o sócio deve algo **sem desembolso da empresa**; registo manual, sem transação, sem conta e sem IVA (é assim de propósito — é um valor, não uma fatura).

As duas são lidas pela **fonte única `src/lib/partner-extras.ts`** (`fetchPartnerExtras`, `partnerExtraValue`, `sumPartnerExtras`), consumida pelo painel da aba Sócios, pelo Fecho do Evento e pelo Encontro de Contas. Antes cada ecrã lia só metade e o saldo do mesmo sócio divergia entre os dois ecrãs de fecho.
