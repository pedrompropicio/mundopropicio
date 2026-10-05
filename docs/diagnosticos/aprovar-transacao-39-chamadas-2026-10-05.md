# Diagnóstico — 39 chamadas a approve-transaction num clique (05/10/2026)

Transação 96257706-d8e8-4897-8581-66f3aa6c12df (ClepMedia 2325, 5.000 €, forecast efb1b85c). Só diagnóstico: não alterei código nem dados.

## (a) Invocações e erros
- Os logs da edge function e de Postgres das 15:29–15:31 UTC já tinham expirado: os logs disponíveis começam às 15:49:45. Não há status HTTP nem mensagens de erro recuperáveis. Fica por provar.
- Prova indirecta (transaction_audit_log): 39 linhas "pending→approved" de Juliana Martins.
  - 38 entre 15:29:57.490 e 15:29:59.854 (rajada de ~2,4 s, várias no mesmo milissegundo, ou seja, pedidos em paralelo).
  - 1 isolada às 15:30:07.354, cerca de 7,5 s depois.
- Todas leram o estado `pending`. A 39.ª leu `pending` às ~15:30:07, logo nenhum dos 38 UPDATEs anteriores tinha sido gravado (commit) até lá.
- Estado actual: approved, updated_at 15:30:07.590 (é a 39.ª).
- Nenhum trigger de UPDATE rejeita esta linha:
  - enforce_transaction_approval_permission deixa passar quando auth.uid() é NULL (service_role) e a transação tem forecast_id.
  - validate_paid_amount: paid_amount = 0.
  - Os restantes não se aplicam (sem custo partilhado, sem carga de cartão, sem held_by).
- Hipótese mais provável (não provada): os 38 UPDATEs concorrentes na mesma linha ficaram em fila no lock da linha e foram cancelados pelo `lock_timeout=8s` / `statement_timeout=8s` do papel authenticator (PostgREST). 15:29:59 + 8 s ≈ 15:30:07, que bate com o momento em que a 39.ª passou. Se assim foi, cada um devolveu HTTP 500 com `{"error":"canceling statement due to lock timeout"}` (ou "statement timeout"). O que segurou o lock inicial não é apurável sem os logs.

## (b) Causa das chamadas repetidas
- Não há retry automático:
  - O QueryClient (src/App.tsx) não define retry de mutações; o padrão do TanStack para mutações é 0.
  - `supabase.functions.invoke` não repete pedidos em 5xx.
- A causa é a re-entrada em `handleBulkApprove` (src/pages/Transactions.tsx):
  - A guarda `if (approveMutation.isPending || bulkApproveMutation.isPending) return;` lê o estado da última renderização.
  - Antes do `mutate()` há dois `await` (`partitionByBpLineRequirement` e `excessLinesFor`). Durante esses pedidos `isPending` ainda é false.
  - O botão só fica `disabled` quando `bulkApproveMutation.isPending` passa a true, ou seja, depois desses awaits.
  - Nessa janela, cada activação (repetição automática da tecla Enter ou Espaço mantida num botão com foco, ou cliques rápidos) volta a correr o handler, e cada uma chega ao `mutate()`.
  - O ritmo de ~16 por segundo, com chamadas no mesmo milissegundo, é compatível com repetição automática de tecla ou com eventos repetidos em ecrã táctil.
- `useMutation` aceita vários `mutate()` em simultâneo: cada um executa a sua `mutationFn`.
- A 39.ª, 7,5 s depois, encaixa num segundo toque da utilizadora ao não ver resposta (por inferência).

## (c) Silêncio no ecrã
- `onError` de `bulkApproveMutation` mostra o toast "Erro ao aprovar em lote" e `readApproveError` lê o corpo da resposta; para 500 usa `parsed.error`.
- O toaster mostra só 1 toast de cada vez (`TOAST_LIMIT = 1`): com 39 respostas, cada uma substitui a anterior.
- Por inferência:
  - Os erros por tempo limite chegaram ~8 s depois, tal como o sucesso da 39.ª. Os toasts sucederam-se e o último a chegar ficou visível, ou nenhum ficou se a página mudou entretanto.
  - O `invalidateQueries` do `onSuccess` corre, mas a lista pode ter sido repintada por cima pelos `onError` concorrentes, com a selecção ainda activa.
- Sem os logs não consigo provar a ordem de chegada. Não há defeito em `readApproveError` que engula a mensagem.

## (d) Correção proposta (não implementada)
1. Trinco síncrono no handler: `const approvingRef = useRef(false)`; sair logo se já estiver activo; activar antes do primeiro await e libertar em `onSettled` (e nos `return` antecipados). O mesmo em `requestApprove`.
2. Desactivar o botão com um estado local `validating` desde o clique, e não só com `isPending`; e ignorar `e.repeat` no teclado.
3. Na edge function: gravar a auditoria DEPOIS do UPDATE (ou na mesma transacção, via RPC) e usar `UPDATE ... WHERE status IN ('pending','overdue') RETURNING id`, para só auditar as linhas que mudaram mesmo. Pedidos concorrentes deixam de criar auditoria falsa e passam a "ignorada".
4. Opcional: `mutationKey` e verificar `useIsMutating` para recusar um segundo lote igual; no toast de erro, mostrar o código HTTP.
5. Para diagnósticos futuros: exportar os logs mal haja um incidente, porque só ficam disponíveis por pouco tempo.
