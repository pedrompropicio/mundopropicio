---
name: Conta financeira não contábil (is_accounting)
description: Flag financial_accounts.is_accounting marca contas gerenciais cujos movimentos e documentos não entram na exportação para a contabilidade; a transação herda a marca (só informativo)
type: feature
---

# Conta não contábil — `financial_accounts.is_accounting`

Coluna `boolean NOT NULL DEFAULT true` (migration de 30/08/2026). `false` = **conta gerencial**:
movimentos e documentos dessa conta não entram nas exportações para a contabilidade.

## Porquê
Existem contas que representam recursos que **nunca transitaram pelas contas bancárias da MP
em Portugal** — ex.: `Pgto Mágicos Acerto Madrid` (`251d708e-1c8d-41e7-9311-39914a269bc3`,
company `7c858982-6ccd-47ca-bd65-e0dd3eebf01c`), pagamentos feitos no Brasil por um sócio.
São reais no ERP para gestão, mas não geram documentos para a contabilidade portuguesa.
Antes disto a exclusão era feita documento a documento (`transaction_documents.is_accounting`).

## Onde atua
- **UI de contas** (`src/pages/FinancialAccounts.tsx`): toggle "Conta contábil", ligado por
  defeito. Desligado → badge discreto **"Não contábil"** ao lado do nome na listagem.
- **UI de transação** (`src/components/TransactionEditModal.tsx`): badge **"Conta não contábil"**
  com tooltip, quando a conta da transação tem `is_accounting = false`. É **herdado e apenas
  informativo** — não existe nem deve existir campo próprio na transação.
- **Edge function `generate-accountant-zip`**: apura as contas com `is_accounting = false` da
  empresa e exclui (a) as transações dessa conta na query principal
  (`account_id.is.null,account_id.not.in.(…)` — transações sem conta continuam a entrar) e
  (b) as transações de origem dessas contas no ramo das notas de reembolso.
  O filtro `transaction_documents.is_accounting = true` mantém-se, cumulativo.

## O que a flag NÃO faz
- Não altera saldo, extrato, `computeBalance()` nem `get_event_cash_position`.
- Não tem relação com `is_transitory` nem `exclude_from_result` (resultado/DRE).
- Não tem relação com `is_hidden` (que só esconde a conta dos seletores de criação).
- Não altera o apuramento de IVA.
