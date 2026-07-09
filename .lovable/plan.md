## Sessões de Cartão — FASE 1 (backend + gestão)

Feature de gestão de cartões pré-pagos entregues a produtores, seguindo o padrão do módulo Camarim. Cartões continuam como `financial_accounts` (`type='prepaid_card'`); sessão é camada de responsabilidade + fecho.

### 1. Migration única (`supabase/migrations/<ts>_card_sessions.sql`)

Tabelas novas (todas com `company_id`, RLS por `row_belongs_to_current_company()` + gate `card_manage` para writes, `service_role` GRANT, `updated_at` trigger):

- **card_sessions** — `card_account_id`, `holder_profile_id?`, `holder_name`, `primary_event_id?`, `opening_balance`, `status ∈ open|in_review|closed`, `opened_at/by`, `closed_at/by`, `closing_balance_confirmed?`, `closing_summary jsonb?`, `notes`. Unique parcial: uma sessão não-fechada por cartão.
- **card_session_loads** — `session_id CASCADE`, `amount>0`, `load_date`, `source_account_id`, `out_transaction_id?`, `in_transaction_id?`, `created_by/at`. Guarda o par transitório.
- **card_session_items** — espelho de `camarim_items`: `session_id`, `submitted_by`, `item_date`, `supplier_name`, `description`, `amount`, `iva_rate`, `event_id?`, `document_path?`, `ocr_raw_payload?`, `status ∈ submitted|approved|rejected`, `rejection_reason?`, `transaction_id UNIQUE?`, `reviewed_by/at`.
- **transactions**: adicionar `card_session_id uuid NULL FK card_sessions` (carimbo).
- **user_permissions enum**: `card_manage`, `card_team` (default admin+manager); grant a editor via seed opcional (não obrigatório).
- **RLS pós-close**: `card_sessions/loads/items` — updates só admin quando `status='closed'` (padrão camarim lock).

### 2. Recarga (par transitório)

Ao abrir modal Recarga (ou carga inicial na abertura):
- INSERT transação **expense** transitória (`is_transitory=true`, `status='paid'`, `paid_amount=amount`, `account_id=source_account_id`, sem `event_id`, descrição `Recarga cartão — {nome cartão}`).
- INSERT transação **income** transitória equivalente com `account_id=card_account_id`, descrição `Carga de {conta origem}`.
- INSERT `card_session_loads` com os dois IDs.

### 3. Frontend

Adicionar entrada sidebar "Cartões" (ícone CreditCard, gate `card_manage`), rotas:

- **/cartoes** (`src/pages/CardSessions.tsx`) — lista contas `prepaid_card` com saldo atual, sessão ativa (portador, evento, status) + botão "Entregar cartão" (`OpenCardSessionModal`).
- **/cartoes/:id** (`src/pages/CardSessionDetail.tsx`) — KPIs (Entregue / Aprovado / Pendente / Saldo teórico) + breakdown por evento. Abas:
  - **Despesas** — transações com `card_session_id=id` + botão "Nova despesa" (`NewCardExpenseModal`: cria transação real expense/paid direta na conta do cartão, categoria + evento à escolha, carimba `card_session_id`).
  - **Fila de aprovação** — `card_session_items` submitted, editar + atribuir categoria → Aprovar cria transação real e grava `transaction_id`; Rejeitar exige motivo.
  - **Recargas** — histórico + botão Recarga (`CardLoadModal`).
- Transições: open → in_review → closed + botão "Reabrir" (manager/admin).

### 4. Fecho (`CloseCardSessionModal`, manager/admin)

- Bloqueado se existir item `submitted`.
- Mostra: abertura + Σ recargas − Σ despesas aprovadas = saldo teórico.
- Campo "Saldo real conferido"; se diferença ≠ 0 → opção "Criar transação de ajuste" (expense/income no cartão, categoria à escolha) OU nota justificativa.
- Grava `closing_balance_confirmed` + `closing_summary` (totais, cargas, despesas por evento, diferença, autor, data) e `status='closed'`.
- Botão "Exportar PDF" (jspdf, padrão dos fechos existentes).
- Sem movimento bancário — remanescente fica no cartão.

### 5. Componentes novos

```
src/pages/CardSessions.tsx
src/pages/CardSessionDetail.tsx
src/components/cards/OpenCardSessionModal.tsx
src/components/cards/CardLoadModal.tsx
src/components/cards/NewCardExpenseModal.tsx
src/components/cards/ApproveCardItemModal.tsx
src/components/cards/CloseCardSessionModal.tsx
src/lib/card-session-helpers.ts
```

### 6. Fora de âmbito (Fase 2)

- Vista mobile do produtor (`/cartoes-equipa`), OCR e submissão de items pelo produtor.
- Nesta fase os `card_session_items` só existem no schema + fila de aprovação (permite testar aprovação inserindo manualmente ou já ficam prontos para Fase 2).

### 7. Memória

Criar `.lovable/memory/features/card-sessions.md` (schema, fluxo aprovação, recarga par transitório, fecho, permissões).

### Pressupostos que assumo salvo indicação em contrário

- Permissões `card_manage` e `card_team` entram no enum `app_permission` existente (não são coluna nova em `user_permissions`).
- Storage bucket para docs dos items fica para Fase 2 (produtor submete). Fase 1 não precisa.
- Categoria da despesa direta usa o `AccountCategorySelector` já existente (L3 only).
- "Nova despesa" pode ter `event_id` NULL (custo comum do cartão).
