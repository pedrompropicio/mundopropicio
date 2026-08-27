# Associação em Participação (AEP)

## O que é

Modelação no ERP de uma Associação em Participação (DL 231/81, PT): a **Mundo Propício é o ASSOCIANTE** (faz tudo em nome próprio, contabilidade no seu nome) e outra empresa é o **ASSOCIADO** (faz APORTES de capital e, no fim, recebe a DEVOLUÇÃO do aporte + a sua parte do RESULTADO).

Os trânsitos de capital **não entram no resultado do evento**, mas **aparecem na tesouraria** e ficam vinculados ao sócio.

## Plano de Contas — ramo 10.1 · Capital

- `10.1.01 · Aporte de Sócios` (income) — o associado entrega capital
- `10.1.02 · Devolução de Aporte a Sócios` (expense) — devolve-se o capital
- `10.1.03 · Distribuição de Resultado a Sócios` (expense) — paga-se a parte do lucro

A identificação é sempre pelo **código** da rubrica, nunca por UUID (`src/lib/capital-branch.ts`):

- `isCapitalCategoryCode(code)` → testa o prefixo `"10.1."` (`CAPITAL_BRANCH_PREFIX`)
- `capitalKindFromCode(code)` → `10.1.01 → "aporte"`, `10.1.02 → "devolucao"`, `10.1.03 → "distribuicao"`
- `isCapitalCategoryId(id, categories)` → conveniência quando só se tem o UUID + a lista de rubricas

## Regra de resultado vs tesouraria

As transações de capital são marcadas `is_transitory = true` **automaticamente pela BD**:

- Função `public.force_transitory_for_capital_branch()` (SECURITY DEFINER, `search_path = public`)
- Trigger `trg_force_transitory_capital` — `BEFORE INSERT OR UPDATE OF category_id ON public.transactions`
- Só faz o lookup do `code` quando a rubrica muda (ou no INSERT); se `code LIKE '10.1.%'` força `is_transitory := true`. **Nunca** força para `false` noutras rubricas.

Efeito:

- `is_transitory = true` → **fora do resultado** (DRE / P&L / Fecho / cards) mas **dentro da tesouraria** (`computeBalance`, `get_event_cash_position` não filtram `is_transitory`).
- Diferença face a `exclude_from_result`: esse **não** é filtrado nos cards do `EventDetail`, por isso o mecanismo de capital usa `is_transitory` (é o único filtrado em todas as superfícies de resultado).

## Sócios (`event_partners`)

- O sócio é uma **entidade do cadastro `suppliers`** — sócios e fornecedores partilham cadastro.
- `event_partners` liga evento ↔ sócio, com `percentage` (quota de lucro) e `loss_percentage` (quota de prejuízo).
- Sub-eventos **herdam** os sócios do Master: `fetchEventPartnersWithInheritance()` em `src/lib/partner-capital.ts` (procura os próprios; se vazio, sobe a `events.parent_event_id`).

## Vínculo transação ↔ sócio (`partner_capital_moves`)

Tabela `public.partner_capital_moves`:

| coluna | notas |
| --- | --- |
| `company_id` | `DEFAULT current_company_id()`, trigger `set_company_id_on_insert` |
| `event_id` | FK `events` ON DELETE CASCADE |
| `partner_id` | FK `event_partners` ON DELETE CASCADE |
| `transaction_id` | FK `transactions` ON DELETE CASCADE, **UNIQUE** |
| `kind` | CHECK `('aporte','devolucao','distribuicao')` |

RLS no padrão de `partner_paid_expenses`:

- SELECT para roles privilegiados (admin, platform_admin, manager, accountant, editor, viewer)
- SELECT do próprio sócio via `user_has_event_access()` + `ep.supplier_id = user_supplier_id(auth.uid())`
- INSERT/UPDATE/DELETE só admin/manager
- RESTRICTIVE `company_isolation_partner_capital_moves` com `current_company_id()`

Importante: o **Acerto com Sócios** (`PartnerSettlementTab`) só liga transação ↔ sócio através de **tabelas-ponte** (`partner_paid_expenses`, `partner_capital_moves`, …). O `supplier_id` da transação, por si só, **não é lido** pelo acerto.

Helpers (`src/lib/partner-capital.ts`): `fetchPartnerCapitalMove`, `upsertPartnerCapitalMove` (upsert `onConflict: transaction_id`, `kind` derivado do código), `deletePartnerCapitalMove`, `partnerLabel`.

## Lançamento (modais de transação)

Quando a rubrica escolhida é do ramo `10.1.*`, `TransactionFormModal.tsx` (criação) e `TransactionEditModal.tsx` (edição) mostram o campo obrigatório **"Sócio (Associação em Participação)"**.

Ao gravar:

1. cria/atualiza `partner_capital_moves` com o `kind` derivado do código da rubrica;
2. preenche o `supplier_id` da transação com a entidade do sócio (para aparecer na coluna **"Entidade"** da lista de transações).

Regras:

- exige evento selecionado;
- exige que o evento (ou o Master) tenha sócios cadastrados — caso contrário avisa;
- movimento de capital **não pode ser rateado**: o painel "Lançamento master (rateio)" nunca aparece para `10.1.*`, mesmo em Master;
- as rubricas de capital ficam sempre disponíveis no seletor (mesmo em modo "Do BP") e estão **isentas** da justificação de "categoria fora do BP";
- se a rubrica deixar de ser de capital, o vínculo AEP é removido mas o `supplier_id` **não** é limpo automaticamente.

Se a transação for gravada e o vínculo falhar, há aviso — o painel serve de rede de segurança. **Limitação:** a criação da transação e do vínculo **não é atómica** (não existe edge function transacional).

## Painel "Capital do Sócio (AEP)"

`src/components/PartnerCapitalPanel.tsx`, na aba **Sócios** do evento (`EventDetail.tsx`):

- lista as transações do ramo `10.1.*` do evento e dos seus sub-eventos;
- permite vincular/desvincular a um sócio (só admin/manager e com evento não `completed`);
- resumo por sócio: Aportes / Devoluções / Distribuições / **Capital em dívida = Aportes − Devoluções**.

Aparece também no **Acerto com Sócios** (`PartnerSettlementTab.tsx`) com `summaryOnly` — bloco **informativo**, read-only. **Não entra** no cálculo do settlement.

## Estado atual e o que falta

Implementado:

- rubricas do ramo 10.1, trigger de transitório, sócio obrigatório no modal, vínculo automático, `supplier_id` preenchido, painel + bloco informativo no acerto, exportação contábil com colunas Categoria / Código / Transitório / Excluído do resultado (`ReportAccountingExport.tsx`).

Não implementado (decisão adiada):

- o cálculo do acerto **não** desconta automaticamente capital nem distribuições — o saldo de capital é informativo;
- a fiscalidade fica a cargo do sistema de contabilidade; o ERP só fornece os dados.

## Ficheiros relevantes

- `src/lib/capital-branch.ts`
- `src/lib/partner-capital.ts`
- `src/components/PartnerCapitalPanel.tsx`
- `src/components/TransactionFormModal.tsx`
- `src/components/TransactionEditModal.tsx`
- `src/components/PartnerSettlementTab.tsx`
- `src/components/ReportAccountingExport.tsx`
- `src/pages/EventDetail.tsx`
- Migration da tabela: `supabase/migrations/20260827161600_0e668b8b-f54e-4b2a-90e1-baea35802662.sql`
- Migration do trigger: `supabase/migrations/20260827154144_2270da9f-46ef-4b33-b24b-4fd9e1544739.sql`
  (+ `20260827154212_3fc36a80-ef91-4b3e-921f-8a3d03fe267a.sql` — REVOKE EXECUTE da função a PUBLIC/anon/authenticated)
