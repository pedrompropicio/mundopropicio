# Auditoria — `payment_reference`, saldos no servidor, e saldos no Dashboard

Relatório de leitura. Não propõe implementação. Tudo com ficheiro e linha; onde não foi
verificado está escrito "não verificado".

Documentos lidos: `docs/INDEX.md`; `docs/DECISIONS.md` D-ERP15 (linha 130), D-ERP27
(linha 671), D-ERP36 (linha 851). O relatório de 11/09 que estava em `.lovable/plan.md`
já não existe no ficheiro (foi substituído por planos posteriores); o seu conteúdo
sobrevive na D-ERP36, secção "Fica por fazer (Passo 3 do relatório de 11/09)", e é essa
lista que se confirma abaixo.

---

## PARTE A — agrupamento por `payment_reference`

### 1. Há campo no ecrã? Sim, mas com outro propósito

O campo existe em três formulários, sempre **condicionado ao método de pagamento** e
nunca apresentado como chave de agrupamento:

- Criação: `src/components/TransactionFormModal.tsx` — rótulo "Referência"
  (linha 3911, placeholder "Referência MB") e "Referência de Pagamento" (linha 3922,
  placeholder "Referência AT / SS"), acompanhado de "Entidade" (linha 3904).
- Edição: `src/components/TransactionEditModal.tsx` — "Referência" (linha 2144) e
  "Referência de Pagamento" (linha 2155). No log de alterações o rótulo é
  "Referência Pagamento" (linha 467).
- Pagamento: `src/components/TransactionPaymentModal.tsx` — "Referência *" (linha 955) e
  "Referência de Pagamento *" (linha 966), obrigatórias em `service_payment` e
  `state_payment` (linhas 285-286).

**Trava importante:** os três caminhos gravam `payment_reference` **apenas** quando o
método não é `transfer` — `TransactionFormModal.tsx:1310`, `1352`, `1495`, `1645`;
`TransactionEditModal.tsx:500`; `TransactionPaymentModal.tsx:385`, `451`, `584`, `598`.
Em `transfer` (1.387 das transações) o campo é **forçado a NULL**, e ao trocar de método
para `transfer` é limpo (`TransactionFormModal.tsx:950`,
`TransactionEditModal.tsx:2117`). O `TransactionPaymentModal` também o anula em
`compensation`. Conclusão: **as chaves de agrupamento tipo `ACERTO-…` não podem ser
escritas nem preservadas pelo ecrã numa transferência** — a interface apagá-las-ia.

### 2. É possível consultar por ela? Quase não

- Pesquisa global de Transações: **sim**, `payment_reference` entra no "haystack"
  pesquisável — `src/pages/Transactions.tsx:692`. Escrever `ACERTO-FOOD-IVETE-2026` na
  caixa de pesquisa filtra as linhas.
- Filtro dedicado: **não existe**. `src/components/TransactionFiltersPanel.tsx` não
  menciona `payment_reference` (grep sem resultados).
- Coluna na listagem: **não existe** (nenhuma referência ao campo fora dos ficheiros
  listados neste relatório).
- Detalhe da transação: só como campo de formulário editável (ponto 1), e mesmo esse
  escondido quando o método é `transfer`. Ou seja: nas transações do grupo pagas por
  transferência **nem aparece**.
- Relatórios/exportações: aparece na Lista de Pagamento — `src/lib/export-payment-list.ts`
  (linhas 174, 241, 380, 463) e `src/components/PaymentListsTab.tsx` (1804, 1836, 2140,
  2269), sempre rotulado "Referência" e no sentido de referência MB/AT. **Não há**
  relatório que agrupe ou some por `payment_reference`.
- Consumo programático como chave: existe um único caso —
  `src/hooks/useEventABRealized.ts` filtra por `ilike('payment_reference', 'ACERTO%BAR%')`
  (linhas 85, 101) e agrupa por valores distintos (linha 144). É o precedente que prova
  que a coluna já é usada como chave, mas apenas para A&B.

**Resposta directa ao ponto 4:** não existe forma de consultar um grupo por
`payment_reference` no ecrã, tirando escrever a string na pesquisa livre de
`/transacoes`. Não há filtro, não há coluna, não há relatório, não há total de grupo.
A verificação embutida do grupo `ACERTO-FOOD-IVETE-2026` (saldo ter de dar 7.530,40 €)
não é calculável em nenhum ecrã.

### 3. Quem escreve a coluna hoje

- Ecrã, nos três modais acima, e só fora de `transfer`.
- Edge function `update-transaction` — o campo está nas allowlists de campos
  editáveis (`supabase/functions/update-transaction/index.ts:136`, 244, 295, 371).
- **Automático, confirmado:** `supabase/functions/close-camarim-session/index.ts:170`
  gera `CAMARIM-<8 primeiros do id da sessão em maiúsculas>` e grava-o nas transações do
  fecho (linhas 642, 825, 907). O irmão `close-card-session/index.ts:140` faz o mesmo com
  o prefixo `CARTAO-`. É a origem de `CAMARIM-9D81140A`.
- Migrações de renegociação copiam o valor para a transação nova
  (`20260831184500_renegotiate_block_split_parent.sql:154`,`164` e homólogas).
- Os grupos `ACERTO-*`, `APOIO-*` e `REVSHARE-*` não têm gerador em código — não foi
  encontrado nenhum caminho que os escreva, logo entraram por SQL.

### Opções e risco (Parte A)

- **(a) Não fazer nada.** Risco: a convenção existe na cabeça e na documentação, não no
  produto; qualquer edição de uma transação do grupo pode apagar a chave em silêncio
  (regra do `transfer`).
- **(b) Só leitura:** coluna/filtro e total por grupo, sem tocar na escrita. Risco baixo;
  não resolve a perda da chave na edição.
- **(c) Separar conceitos:** referência MB/AT (o que o campo é) da chave de operação (o
  que se lhe está a pedir). Risco: mexer em coluna com 1.400+ linhas e em quatro
  caminhos de escrita; ganho é a chave passar a ser um objecto de primeira classe.

---

## PARTE B — Passo 3 dos saldos

### 5. A lista continua válida. Nada mudou nestes ficheiros a 11-12/09

- Página de Contas — `src/pages/FinancialAccounts.tsx:339` (`computeAccountBalance`) e
  `248` (`computeTicketOfficeBalance`): soma no cliente.
- Extrato — `src/components/ReportBankStatement.tsx:72` (comentário) e `62`
  (`canSeeBalance = isAdmin || balance_visible_to_all`): soma no cliente, permissão
  avaliada no cliente.
- Cartões — `src/pages/CardSessions.tsx:63`, `src/lib/card-account-balance.ts:37`,
  `src/lib/card-session-balance.ts`, `src/pages/CardSessionDetail.tsx`,
  `src/pages/CartaoEquipa.tsx`: soma no cliente.
- Bilheteiras — `src/pages/TicketOffices.tsx:140` e
  `src/components/TicketOfficeBalancePanel.tsx:121`, mais o relatório de auditoria
  `src/components/ReportTicketOfficeAudit.tsx:241`: soma no cliente.

Único ficheiro novo relevante que apareceu: `src/lib/supabase-paging.ts`
(`fetchAllPaged`), já usado no Dashboard — não altera a lista, mas remove o risco do
limite de 1.000 linhas nas somas do cliente.

### 6. O que é preciso, e o que pode partir

- **Página de Contas.** Os três cartões da D-ERP27 são três conceitos: caixa (contas
  `bank`/`cash`/`prepaid_card` com controlo), retido em bilheteiras
  (`computeTicketOfficeBalance`) e acertos em curso (contas `other`). Só o **primeiro**
  tem equivalente no servidor. Migrar o cartão de caixa e a coluna Saldo Atual das contas
  não-bilheteira para `account_true_balances_asof(ids, NULL)` é directo. O que pode
  partir: `canSeeBalance` do cliente (`FinancialAccounts.tsx:343`) é `isAdmin ||
  balance_visible_to_all` e ignora `view_balances`; o servidor é mais restritivo, logo
  contas hoje visíveis podem passar a `NULL` — é preciso decidir o que se mostra em vez
  do número (a D-ERP36 já fixou a regra: nunca zero, sempre ausência assumida). Segundo
  risco: o `skip_balance_check` devolve sempre `NULL` no servidor, e a página hoje já
  nomeia essas contas em texto — tem de continuar a distinguir "não controlado" de "sem
  permissão".
- **Extrato.** Já usa a fórmula canónica com data de corte; precisa da variante *asof*
  para o saldo de abertura/fecho do período. Pode partir a coerência com a Conciliação se
  as datas de referência não forem as mesmas.
- **Cartões.** Saldo da CONTA do cartão (`card-account-balance.ts`) migra para a função
  do servidor. Saldo da SESSÃO (`card-session-balance.ts`) é outro conceito — quanto
  resta de uma dotação — e **não** converge; não há função no servidor e não faz sentido
  criá-la a partir da fórmula das contas.
- **Bilheteiras.** A fórmula é diferente por desenho (D-ERP15) e não deve convergir. Já
  tem uma peça no servidor: `get_ticket_office_sales(p_account_id)`
  (`supabase/migrations/20260910023941_….sql:1`, `GRANT` a `authenticated` na linha 17),
  que resolve o lado das vendas. Falta o resto da fórmula.

### 7. Falta função no servidor?

Sim. Existe `account_true_balance`, `_account_true_balance_raw`,
`account_true_balances_asof`, `_account_true_balance_asof_raw`
(`src/integrations/supabase/types.ts:13676-13723`) e `get_ticket_office_sales`. **Não
existe** função de saldo de bilheteira: a fórmula completa (vendas + transações +
adiantamentos + eventos atribuídos) vive só em `src/lib/ticket-office-balance.ts:85`.
Para a levar ao servidor seria preciso uma função que recebesse as contas de bilheteira,
juntasse `event_ticket_office_assignments`, `event_ticket_zones`, `ticket_sales`,
`transactions` e `event_ticket_office_advances`, e aplicasse o mesmo portão de permissão
de `account_true_balances_asof` (valor ou `NULL`). Também não existe função para o saldo
de sessão de cartão. **Não verificado:** se `get_ticket_office_sales` tem portão interno
de permissão além da RLS.

---

## PARTE C — cartões de saldo no Dashboard

### 8. O que o Dashboard mostra hoje

`src/pages/Index.tsx` (854 linhas, componente `Dashboard`, rotas `/` e `/erp` em
`src/App.tsx:475-476`). **Não mostra saldo de conta nenhum** — não importa
`computeAccountBalance` nem chama qualquer RPC de saldo (grep sem resultados no
ficheiro). O dinheiro que mostra é receita/despesa/resultado **por evento**, agregado no
cliente a partir de `transactions` (linhas 101, 154, 185, 205, 209) e apresentado nos
cartões e na tabela de eventos (linhas 753, 761, 828), mais vendas de bilhetes de
`ticket_sales` (linha 266). Tudo somado no cliente, com `fetchAllPaged` para fugir ao
limite de 1.000 linhas (linha ~255).

### 9. O que se pode reaproveitar da página de Contas

A lógica dos três cartões da D-ERP27 **está presa ao componente**: `computeBalance` e
`canSeeBalance` são funções internas de `src/pages/FinancialAccounts.tsx` (linhas 336 e
343), e o cálculo das bilheteiras é um `useMemo` local (linha 240) alimentado por cinco
queries também locais (linhas 165-232). Partilhável hoje só existe: `computeAccountBalance`
(`src/lib/account-balance.ts:131`), `buildAccountCutoffs`, `fetchAccountCashAdjustments`,
`computeTicketOfficeBalance` (`src/lib/ticket-office-balance.ts:85`) e os wrappers de RPC
em `src/lib/account-balance-rpc.ts:46`,`59`. Ou seja: os *ingredientes* são partilháveis,
a *composição dos três cartões* não é — pô-los no Dashboard hoje significa duplicar
~200 linhas de queries e agregação, com o risco clássico de as duas cópias divergirem.

### 10. Permissões

- A rota `/` não tem guarda de permissão em `src/App.tsx:475` — é a página de entrada de
  qualquer utilizador autenticado.
- O componente lê apenas `isAdmin` e `isManager` (`src/pages/Index.tsx:234`); **não**
  consulta `view_balances`. A permissão existe (`src/contexts/AuthContext.tsx:68`,
  "Ver Saldos") e é o que hoje abre o menu Contas (`src/components/AppSidebar.tsx:106`).
- Consequência a ter em conta: se o Dashboard passar a mostrar saldos, o portão tem de
  ser o do servidor (`NULL` = não mostrar), não `isAdmin`, e a ausência tem de ser
  explícita. Zero é o pior resultado possível numa página de entrada — é a armadilha que
  a D-ERP36 já nomeou para a Projeção de Tesouraria.

### Opções e risco (Parte C)

- **(a) Cartões só de caixa**, via `account_true_balances_asof`. Risco baixo, permissão
  já resolvida no servidor; não cobre bilheteiras.
- **(b) Caixa + retido em bilheteiras com a fórmula do cliente.** Cobre o pedido, mas
  duplica a agregação da página de Contas e leva o buraco de permissões consigo
  (a fórmula das bilheteiras não tem portão nenhum).
- **(c) Extrair primeiro** a composição dos três cartões para um hook partilhado e só
  depois consumi-la no Dashboard. Mais trabalho antes de haver resultado visível; é a
  única que não cria uma segunda verdade.
- **(d) Função de saldo de bilheteira no servidor** e o Dashboard a consumi-la. Fecha o
  problema de permissões de vez, mas é a opção mais pesada e obriga a portar para SQL
  uma fórmula que hoje só existe em TypeScript, com risco de divergência durante a
  transição.
