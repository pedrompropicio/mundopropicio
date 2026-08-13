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
- `/cartoes/:id` — KPIs (Disponível no cartão / Entregue / Aprovado / Pendente / Saldo teórico) + breakdown por evento + 3 abas (Despesas / Fila de aprovação / Recargas) + botões de transição/fecho.
- **Editar saldo de abertura** (2026-08-07): lápis no KPI "Entregue", visível só com `canManage && status='open'` (mesmo gate das edições de despesa). Mini-dialog pede novo valor + motivo obrigatório; grava `opening_balance` com `.eq('status','open')` como guarda e appenda em `notes` a linha `[YYYY-MM-DD] Saldo de abertura corrigido de X para Y por <email>: <motivo>`. Invalida via `invalidateCardSessionQueries` → KPI e saldo teórico recalculam sem F5. Sessão fechada/in_review não mostra a ação. Motivo: `opening_balance` é fotografia da abertura e desalinha quando o saldo do cartão é ajustado DEPOIS no módulo Contas (caso real: sessão 77d592f0 abriu 883,14 vs 808,14 correto).
- Hint do KPI "Saldo teórico da sessão": "Saldo de abertura + recargas − gasto aprovado − pendente. O saldo de abertura é editável enquanto a sessão está aberta."

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

## Scan do documento (OCR) na criação de despesa

Ambos os pontos de criação têm scan opcional (mesmo padrão do camarim):
- **Membro da equipa** (`CardTeamItemModal`): "Tirar foto" / "Escolher ficheiro"; documento
  fica em `card-documents` e o payload da IA em `card_session_items.ocr_raw_payload`.
- **Admin, na sessão** (`NewCardExpenseModal`): mesma zona de destaque no topo; cria a
  transação directamente e anexa o documento via `transaction-documents` +
  `transaction_documents` (a transação não tem coluna de OCR, o payload só pré-preenche).

Infra reutilizada: edge fn `extract-camarim-receipt`, `prepareFileForInvoiceOcr`,
`normalizeImageFile` (HEIC→JPEG) e `IvaRateSelect`/`useEventIvaCountry`.
Semântica mantida: campo do formulário = **Total c/IVA** (talão); BD grava
`amount` = base s/IVA (`cardBaseFromTotal`) + `iva_rate`, `paid_amount` = total bruto.
Preencher à mão sem scan continua possível.

## Layout dos valores + refresh (2026-08-07)

- `CardAmountFields` (src/components/cards/) é o bloco único de valores nos 3
  formulários (NewCardExpenseModal, CardTeamItemModal, ApproveCardItemModal):
  ordem **Valor s/IVA → Taxa IVA → Total c/IVA**, os dois campos de valor
  editáveis com ligação bidirecional (base↔total via taxa). OCR preenche o
  Total do talão; a base deriva. Gravação inalterada (amount=base,
  paid_amount=total).
- `invalidateCardSessionQueries(qc, sessionId)` em `card-session-helpers.ts`
  invalida TODAS as chaves do módulo (card-session, -loads, -expenses, -items,
  -expense-doc-counts, card-sessions, prepaid-cards-*, financial-accounts,
  transactions). Usar em qualquer escrita do módulo — nunca invalidar chaves à mão.

## Editar / excluir despesas (2026-08-07)

- **Gate de estado**: acções só existem com `card_sessions.status = 'open'`
  (`canEditExpenses = canManage && status === 'open'`). `in_review` e `closed`
  ficam só leitura, como antes. Permissão = a mesma de criar despesa
  (admin/manager/`card_manage`).
- **Editar**: `NewCardExpenseModal` é parametrizado por `expense?: CardExpenseRow`
  — mesmo formulário (scan incluído, o documento novo é ADICIONADO, não substitui).
  Grava na transação existente: `description`, `amount` (base), `iva_rate`,
  `paid_amount` (total c/IVA), `date`/`payment_date`, `category_id`, `event_id`,
  `supplier_id`. Auditoria: 1 linha por campo alterado em `transaction_audit_log`.
- **Excluir**: dialog de confirmação com descrição + total. Ordem:
  1. bloqueia se existir `payment_list_items` (FK NO ACTION);
  2. remove ficheiros do bucket `transaction-documents` (linhas caem por CASCADE);
  3. `transaction_audit_log` tem FK **CASCADE** → o registo da exclusão vai para
     `system_audit_log` (`entity_type='card_session_expense'`, `action='delete'`,
     snapshot em `old_data`) ANTES do delete;
  4. apaga a transação;
  5. item da equipa que a originou (`card_session_items.transaction_id`, FK SET NULL)
     **volta a `submitted`** com nota em `rejection_reason` — decisão: nunca deixar
     item "aprovado" sem transação; assim a financeira pode reprocessar.
- Refresh via `invalidateCardSessionQueries` (saldo/KPIs/lista imediatos).

## Saldo disponível vs saldo da sessão (2026-08-07)

Dois conceitos distintos, ambos visíveis nos KPIs de `/cartoes/:id`:
- **Disponível no cartão** — saldo REAL da conta (`financial_accounts.initial_balance`
  + Σ `paid_amount` dos movimentos da conta, income soma / expense subtrai, +
  ajustes não-monetários de `fetchAccountCashAdjustments`). Fórmula idêntica ao
  `computeBalance` do módulo Contas; implementada em
  `src/lib/card-account-balance.ts` (`fetchCardAccountBalance`). É aqui que se
  reflete o "ajuste de saldo" feito em Contas (que persiste em `initial_balance`).
- **Saldo teórico da sessão** — entregue (opening + cargas) − aprovado − pendente.
  Continua a servir o fecho da sessão; não é o dinheiro disponível.

Refresh: `saveMutation` de `FinancialAccounts` chama `invalidateCardSessionQueries`,
e o helper invalida também `["card-account-balance"]`,
`["financial-accounts-tx-summary"]` e `["financial-accounts-cash-adjustments"]` —
ajustar a conta reflete na sessão aberta sem F5.

## Fecho — categoria do ajuste e salvaguarda (2026-08-13)

- Seletor "Categoria do ajuste" lista TODAS as L3 activas coerentes com o tipo do ajuste (`diff > 0` → income, `diff < 0` → expense), pesquisável e agrupado por N2. Antes listava todas as L3 misturadas com o tipo no rótulo.
- Pré-selecção automática de categoria natural de acertos (nome com "ajuste"/"acerto"/"diversos"); senão fica vazio.
- Aviso destacado + checkbox obrigatória quando `|diff| > 50%` do gasto aprovado (caso real: saldo de abertura digitado em vez do saldo actual → receita falsa). Botão "Fechar sessão" fica bloqueado até confirmar.
