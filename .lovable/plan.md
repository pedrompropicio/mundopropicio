# #265 — Levantamento das remoções no bucket transaction-documents (só leitura)

Nada foi alterado. "Antes" = código em vigor a 23/09 (commit b6771ee, anterior à correção de 30/09). "Hoje" = código atual.

## 1. Caminhos que removem objetos (hoje)

- Helper único: `src/lib/transaction-document-storage.ts:46` (`removeTransactionDocumentObjects`) — só remove se nenhuma linha de `transaction_documents` tiver o mesmo file_url (linhas 33-45).
- `src/pages/CardSessionDetail.tsx:382` — Excluir despesa de cartão (chama o helper).
- `src/components/BPAttachmentModal.tsx:161` — remover anexo nativo da linha BP.
- `src/components/TransactionDocumentsModal.tsx:182` — remover anexo; `:255` — limpeza de upload falhado.
- `src/components/PaymentListReceipts.tsx:197` — remover comprovativo de lista.
- Edge `supabase/functions/ads-invoice-apply/index.ts:830` — reverter fatura de Ads.
- Edge `supabase/functions/ingest-transaction-document/index.ts:394` — limpeza de insert falhado.
- Não há RPC nem cron que apague neste bucket. O único `DELETE FROM storage.objects` em SQL é de `database-backups` (`supabase/migrations/20260429035523_…sql:95`).
- Fora do código: qualquer admin ou manager pode apagar diretamente pela API de storage. A política "Transaction docs deletable by admin or manager", consultada em Live, deixa-o fazer.

## 2. Atomicidade — existia caminho "apaga ficheiro, fica a linha"?

Hoje nenhum caminho é atómico: são duas chamadas separadas, storage e base. Mas todos apagam a linha primeiro, com `.select("id")`, e o ficheiro depois. Se falharem entre as duas, fica um objeto órfão sem linha, que é o lado seguro. Isto está em CardSessionDetail.tsx:372-382, BPAttachmentModal.tsx:154-161, TransactionDocumentsModal.tsx:170-182 e PaymentListReceipts.tsx:188-197.

Antes (a 23/09) existiam três caminhos que deixavam exatamente o estado deste documento, com o ficheiro apagado e a linha mantida:
- `BPAttachmentModal.tsx:152-156` (b6771ee): removia o ficheiro primeiro, dentro de `try {} catch {}`. Só depois fazia o DELETE da linha, sem `.select`. Se a RLS filtrasse o DELETE, a linha ficava, o ficheiro já tinha ido e aparecia na mesma "Ficheiro removido".
- `CardSessionDetail.tsx:357-399` (b6771ee): removia os ficheiros da despesa na linha 365, antes do DELETE da transação na linha 399, que era feito sem `.select`. Se o DELETE fosse filtrado, ficavam a transação e a linha do documento, sem ficheiro.
- `PaymentListReceipts.tsx:180-191` (b6771ee): o DELETE das réplicas por file_url era feito sem `.select`. Se a RLS o filtrasse, as linhas ficavam, e na linha 191 o ficheiro era removido na mesma.

Nota em Live: só uma linha aponta para este ficheiro (fc36ff8f). A transação não tem evento e o caminho não é de lista de pagamento nem de fatura de Ads. O candidato que o código torna mais provável é BPAttachmentModal ou a despesa de cartão, mas não é possível prová-lo; ver o ponto 5.

## 3. Erros engolidos

- Antes: `BPAttachmentModal.tsx:153-155` (`try {} catch {}`); `TransactionDocumentsModal.tsx:191` (`.catch` que só fazia console.warn); `TransactionDocumentsModal.tsx:275` (`.catch(() => {})`).
- Hoje: o helper nunca lança e só faz `console.warn` (`transaction-document-storage.ts:53`). Os chamadores não olham para o retorno. `ingest-transaction-document/index.ts:394` usa `.catch(() => {})`. `ads-invoice-apply/index.ts:826` só avisa se a verificação de referências falhar, e nesse caso mantém os ficheiros.
- A inserção no `system_audit_log` em CardSessionDetail (b6771ee :375) não verificava o erro. É por isso que a janela não deixou rasto.

## 4. Remoção por prefixo ou pasta

- Só `ads-invoice-apply/index.ts:815-817`: lista `<empresa>/ads-invoices/<fatura>/` e apaga o que lá estiver. Antes (b6771ee :815-819) apagava tudo sem verificar referências. Hoje filtra por referências (:820-828). A pasta é só da fatura, por isso não chega a `<empresa>/<transação>/`. Não é o caso deste ficheiro.

## 5. Dá para saber quem apagou?

Não, pela app ou pela base. `storage.objects` não guarda apagamentos: a linha desaparece e o dono registado é só o de criação. Não há gatilho nem log no código. O `system_audit_log` só tem o que a UI grava. Resta o registo de acessos ao storage da plataforma, que tem retenção curta; para 23-24/09 muito provavelmente já não existe. Não o consultei.

## Proposta (desenho, não implementar)

### (a) Auditar remoções nos buckets contabilísticos
Buckets: transaction-documents, supplier-documents, closing-cost-documents, camarim-documents, card-documents, standalone-invoices, ticket-office-settlements.

- Uma edge function única, `storage-delete`, com service_role. Recebe bucket e caminho exato, sem prefixos. Valida a role e a empresa, verifica as referências e grava o registo ANTES de remover. Se o registo falhar, não remove. Só código.
- Tabela nova `public.storage_deletion_log`, com bucket, caminho, quem, quando, motivo, origem e entidade. Leitura só para admin. **DDL**, com as GRANT e a RLS de regra.
- Retirar a política de DELETE direto a `authenticated` nestes buckets. Assim nenhum clique nem chamada à API apaga sem passar pela função. **DDL, política em storage.objects, por migration.**
- Não se criam gatilhos no schema storage, por regra do projeto. O registo nasce na função.

### (b) Remoção de anexo atómica, sem partir fluxos
- Uma RPC `delete_transaction_document(doc_id, motivo)`: numa só transação da base apaga a linha (ou as N linhas do grupo), grava o registo e devolve os caminhos que já não têm referência. **DDL (função).**
- Depois, a `storage-delete` move o objeto para `_trash/<data>/…` em vez de o apagar. O apagamento real passa a ser uma limpeza agendada a 30 dias, em linha com o sistema de Lixo de 30 dias. Um erro entre a base e o storage deixa, no pior caso, um objeto recuperável, nunca uma linha sem ficheiro.
- Os sete chamadores atuais passam a usar só este par (RPC + função), trocando o helper por dentro. A ordem e as mensagens que o utilizador vê ficam iguais.
- Reforço de deteção: o invariante `documento_sem_ficheiro_no_storage` já apanhou este caso em 24 horas. Proposta: passar a alertar logo na primeira corrida não conforme. Só configuração.

## Detalhes técnicos
- Base consultada em Live só com leituras: linhas com o file_url do ficheiro (1 linha, fc36ff8f) e políticas de DELETE em storage.objects. Nada alterado.
- Histórico comparado com `git show b6771ee:<ficheiro>`.
