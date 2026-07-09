---
name: Sessões de Cartão (Card Sessions) — Fase 1
description: Gestão de cartões pré-pagos entregues a produtores. Sessão = camada de responsabilidade + fecho por cima de financial_accounts (type=prepaid_card). Fase 1 = backend + tela de gestão; Fase 2 = vista mobile do produtor com OCR.
type: feature
---

## Modelo

Cartão continua a ser `financial_accounts` com `type='prepaid_card'`. Cada despesa do cartão é uma **transação real** na conta do cartão, com `event_id` próprio (multi-evento natural).

Camada nova (schema 2026-07-09):
- `card_sessions` — id, company_id, card_account_id, holder_profile_id?, holder_name, primary_event_id?, opening_balance (snapshot na entrega), status ∈ open|in_review|closed, opened_at/by, closed_at/by, closing_balance_confirmed?, closing_summary jsonb?, notes. Unique parcial: 1 sessão não-fechada por cartão.
- `card_session_loads` — session_id CASCADE, amount>0, load_date, source_account_id, out_transaction_id, in_transaction_id.
- `card_session_items` — fila de aprovação (submitted|approved|rejected) para submissões do produtor (Fase 2). transaction_id UNIQUE quando aprovado.
- `transactions.card_session_id` — carimbo auditável em toda despesa criada dentro da sessão.

## Recarga (par transitório)

Modal "Recarga" (ou carga inicial na abertura) chama `performCardLoad()` em `src/components/cards/cardLoadHelpers.ts` que cria PAR de transações:
- expense em `source_account_id`, `is_transitory=true`, `exclude_from_result=true`, `status='paid'`, categoria 10.3, sem event_id.
- income em `card_account_id`, mesmos flags.
- Grava ambos IDs em `card_session_loads`.

Efeito: move saldo entre contas SEM entrar no DRE/BP (padrão transitório).

## Despesa direta (manager)

`NewCardExpenseModal` cria transação real: expense, status=paid, account_id=cartão, categoria L3 obrigatória, event_id opcional (custo comum quando null), `card_session_id` carimbado.

## Fila de aprovação (submissões do produtor)

Fase 1 já tem UI para rever items em `card_session_items` com `status='submitted'` (`ApproveCardItemModal`):
- Ao aprovar: cria transação real na conta do cartão (categoria obrigatória) e grava `transaction_id` no item + status=approved.
- Ao rejeitar: exige motivo, status=rejected.

Fase 2 abrirá `/cartoes-equipa` (mobile PWA) onde o produtor submete com câmara + OCR → grava linha em `card_session_items` com status=submitted. Nesta Fase 1 os items podem ser inseridos por qualquer forma disponível e a fila já processa.

## Fecho

`CloseCardSessionModal` (só manager/admin):
- Bloqueado se houver items 'submitted'.
- Mostra: opening + Σ loads − Σ despesas aprovadas = saldo teórico.
- Campo "Saldo real conferido"; se diferença ≠ 0 opção "Criar transação de ajuste" (expense se diff<0, income se diff>0, categoria à escolha, carimbo card_session_id) OU nota justificativa.
- Grava `closing_balance_confirmed` + `closing_summary` (opening, loads, aprovadas, teórico, confirmado, diff, breakdown por evento, autor/data).
- Sem movimento bancário — remanescente fica no cartão para a próxima sessão.

Transições: open → in_review → closed. Manager/admin podem reabrir de in_review. Só admin pode reabrir de closed (padrão camarim lock).

## Permissões

- `card_manage` — abrir/editar/aprovar/fechar sessões. Default: admin + manager (seed em migration). Concedível a outros via `user_permissions`.
- `card_team` — submeter items pela vista mobile (Fase 2). Default: admin + manager.
- RLS: SELECT aberto a autenticados; writes gated por `can_manage_cards(uuid)` (SECURITY DEFINER) + após `status='closed'` só admin/platform_admin. Isolamento estrito por `row_belongs_to_current_company()` RESTRICTIVE em todas as tabelas novas.

## UI

- `/cartoes` — lista contas prepaid_card com saldo atual + sessão ativa; botão "Entregar cartão" pré-preenche opening_balance com o saldo atual.
- `/cartoes/:id` — KPIs (Entregue / Aprovado / Pendente / Saldo teórico) + breakdown por evento + 3 abas (Despesas / Fila de aprovação / Recargas) + botões de transição/fecho.
- Sidebar: ícone `CreditCard` visível com `card_manage` ou admin/manager.

## Não incluído na Fase 1

- Vista mobile `/cartoes-equipa` com OCR (Fase 2).
- Bucket de storage `card-receipts` (Fase 2 — quando o produtor anexa fotos).
- PDF dedicado de fecho (Fase 1 usa `window.print()` do detalhe fechado).
