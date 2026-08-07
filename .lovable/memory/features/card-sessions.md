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

## Fase 2 — Vista mobile do produtor (2026-07-09)

- Rota `/cartao-equipa` fora do `ProtectedLayout` (mobile-first, sem sidebar) — espelho fiel do `/camarim-equipa`. Página `src/pages/CartaoEquipa.tsx`.
- **Acesso**: permissão `card_team` (ou admin/manager/`card_manage`). Gestores veem todas as sessões `open`/`in_review`; um utilizador com só `card_team` vê APENAS as sessões onde `holder_profile_id = auth.uid()`.
- **Cabeçalho ao portador**: saldo teórico do cartão (entregue + recargas − aprovadas − pendentes) + contadores "meus pendentes/aprovados" + evento principal. Não expõe mais nada do financeiro.
- **Lançamento** (FAB câmara + FAB manual, só com sessão `open` e portador atribuído): `CardTeamItemModal` chama a edge function existente `extract-camarim-receipt` (reutilização — sem função nova) via pipeline `prepareFileForInvoiceOcr`; trata 429/402 e mostra `confidence`. Pré-preenche fornecedor/data/total/IVA/descrição. Todos editáveis. **Sem seletor de categoria** — atribuída pela financeira em `ApproveCardItemModal`. Seletor de evento: default = `primary_event_id` (marcado com ★), pode escolher outro evento em `planning|confirmed|active`.
- **Escrita**: só em `card_session_items` (`status='submitted'`, `submitted_by=auth.uid`, `ocr_raw_payload`); NUNCA em `transactions`. Foto vai para bucket privado novo `card-documents`, path `{sessionId}/{itemId}/{ts}.{ext}` (padrão camarim), gravada em `document_path`.
- **Edição/eliminação do produtor**: só os SEUS items ainda `submitted`, só com sessão `open`. RLS garante (policies `card_session_items_holder_insert|update|delete`).
- **Bucket `card-documents`** (privado): 4 policies em `storage.objects` — SELECT/INSERT/UPDATE/DELETE gated por `can_manage_cards()` OU (holder da sessão do 1º segmento do path com sessão `open`).
- **Fila de aprovação em `/cartoes/:id`**: agora mostra thumbnail do talão (signed URL 1h, `CardItemThumb`) ao lado de cada item pendente; `ApproveCardItemModal` mostra a foto acima dos campos com link para abrir em nova aba.

## Semântica de IVA (2026-08-07) — talão = total c/IVA

Bug corrigido: o scan gravava o total do talão em `card_session_items.amount`, que
por convenção do sistema é BASE s/IVA.

Regra agora:
- **Formulários** (`CardTeamItemModal` do produtor e `ApproveCardItemModal` da
  financeira) pedem **"Total (€)" c/IVA**, igual ao talão — é o que o utilizador
  confere de relance e é o que saiu do cartão.
- **BD** mantém a convenção: `card_session_items.amount` = base s/IVA +
  `iva_rate`; a transação gerada na aprovação recebe `amount` = base e
  `paid_amount` = **total c/IVA**.
- Conversão em `src/lib/card-session-helpers.ts`: `cardBaseFromTotal`,
  `cardTotalFromBase`, `cardItemGross`, `inferCardRateFromReceipt`.
- **Taxa**: se o OCR devolve `iva_amount` €, infere-se `iva/(total−iva)×100` com
  **snap** ao conjunto de taxas do país da cidade do evento (`IvaRateSelect` +
  `useEventIvaCountry`; PT quando não há evento — ES respeita 0/4/10/21). Mesmo
  padrão do camarim (ver `camarim-iva-snap`).
- **Todos os totais do módulo são c/IVA**: gasto aprovado, pendente, saldo
  teórico e breakdown por evento em `/cartoes/:id` e `/cartao-equipa` usam
  `paid_amount` ou `cardItemGross()` — nunca `amount` seco.
