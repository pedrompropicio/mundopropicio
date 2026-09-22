---
name: Formulário não grava com Enter
description: Formulários de gravação só gravam pelo botão; Enter num campo nunca submete (guarda em src/lib/form-enter-guard.ts)
type: constraint
---

# Um formulário com botão de gravação só grava quando esse botão é carregado

Regra fixada pelo Pedro a 22/09/2026. Enter num campo **nunca** submete um
formulário que cria ou edita registos de negócio.

**Origem:** a 21/09/2026 uma despesa ficou gravada e aprovada automaticamente
sem que quem a lançou soubesse que tinha gravado. O `TransactionFormModal` é um
`<form onSubmit={...}>` com dezenas de `<input>` de linha única e a submissão
implícita do HTML disparava com um Enter, sem clique nenhum.

## Onde vive o guarda

`src/lib/form-enter-guard.ts` → `blockImplicitSubmitOnEnter`, posto no
`onKeyDown` do `<form>`. Nunca se altera o `onSubmit`, nem os `type="submit"`,
nem a estrutura do `<form>` (o `SupplierFormModal` lê os campos com
`new FormData(e.currentTarget)` e depende do elemento e do evento intactos).

## Excepções em que o Enter passa

1. Foco num `<button>` (inclui `type="submit"` e os gatilhos de Select /
   DropdownMenu do Radix, que são botões) — teclado tem de chegar a Gravar.
2. Foco numa `<textarea>` — Enter é linha nova.
3. Enter com Ctrl, Cmd ou Alt — atalhos que o campo pode tratar.
4. Campo dentro de um elemento com `data-allow-enter` — válvula de escape para
   campos onde o Enter acrescenta linha/etiqueta/item a uma lista.
5. `<input>` do tipo botão/checkbox/radio e elementos com `role="button"`.

Comboboxes e caixas de pesquisa do `SearchableSelect`/`Command` vivem em portal
(Popover do Radix), logo o Enter não sobe até ao `<form>` e continua a escolher
a opção.

## Categorias que ficam de fora

- **Autenticação** (`pages/Auth.tsx`, `ResetPassword`, `AcceptInvitation`,
  `ChangePasswordModal`, `operacao/Onboarding`): decisão expressa do Pedro — o
  Enter é o comportamento esperado e o botão é "Entrar", não é gravação.
- **Pesquisa / filtro**: só leem, não há nada a gravar por engano.
- **Renomeação inline** (`EventDetail`, nome do sub-evento): não tem botão de
  gravação; o Enter é o único meio de confirmar. Fora da regra.
- Modais que gravam mas **não são `<form>`** (`TicketOfficeFormModal`,
  `operacao/NewFrenteDialog`, `EventCourtesiesEditor`) já são imunes; não se
  convertem em `<form>`.

## Formulários com o guarda aplicado (15)

`pages/FinancialAccounts.tsx`, `pages/Events.tsx`,
`pages/RecurringTransactions.tsx`, `pages/Quotations.tsx`,
`pages/UserManagement.tsx`, `components/CategoryFormModal.tsx`,
`components/FinancialOperationsTab.tsx`, `components/EventEditModal.tsx`,
`components/TransactionEditModal.tsx`, `components/SupplierFormModal.tsx`,
`components/TransferFormModal.tsx`, `components/TransactionFormModal.tsx`,
`components/cards/OpenCardSessionModal.tsx`,
`components/cards/NewCardExpenseModal.tsx`,
`components/cards/CardLoadModal.tsx`.

**Qualquer `<form>` novo que grave dados leva o guarda.**
