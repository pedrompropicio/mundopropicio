---
name: Camarim - Resumo de integração + lock
description: Após integrar, sessão fica bloqueada e mostra resumo persistente com lista das transações geradas
type: feature
---

## Persistência do resumo
- Edge `close-camarim-session` grava em `camarim_sessions`:
  - `integration_summary jsonb` (totais base/IVA/geral, por origem, settlement, parqueados, erros, autor, data)
  - `integration_transaction_ids uuid[]` (IDs das tx consolidadas + settlement, se houver)
- Também regista em `camarim_integrations` com `integration_type='financial_close'` e `status` ∈ `done|partial|failed`.

## UI (`/camarim/:id`)
- Quando `status='integrated'` é renderizado o card `CamarimIntegrationSummary` no topo:
  - KPIs (itens, transações, total base, total geral)
  - Breakdown por origem de pagamento
  - Bloco de acerto de adiantamento
  - Avisos (parqueados restantes, erros)
  - Botão **"Ver transações geradas"** abre diálogo com lista clicável → `/transactions?highlight=<id>`
- Cards de itens deixam de ser clicáveis; botões "Adicionar conta", "Registar movimento", "Editar sessão" desabilitados.

## Lock RLS pós-integração
- `camarim_items` e `camarim_fund_moves`: ALL policy exige `s.status <> 'integrated'`.
- `camarim_sessions`: depois de integrada só admin pode mexer (manager/permissão `camarim_manage` perdem acesso).
- Service role do edge function ignora RLS, portanto a integração continua a funcionar.
- Para reabertura manual de emergência, admin tem de fazer UPDATE direto via SQL/migration.
