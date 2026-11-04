---
capitulo: transacoes
titulo: Transações
modulo: erp
atualizado: 2026-11-04
perfis: []
rotas: []
fontes: [src/pages/Transactions.tsx, src/components/TransactionFormModal.tsx, src/components/TransactionEditModal.tsx, src/pages/Reimbursements.tsx, src/components/PartnerPaidExpensesPanel.tsx, src/components/TransactionPaymentModal.tsx, src/components/TransferFormModal.tsx, src/components/TransactionDocumentsModal.tsx, src/components/TransactionAuditModal.tsx, src/components/PaymentListsTab.tsx]
---

## Criar uma transação

```ajuda
id: transacoes.criar
tooltip: "Registe e acompanhe todas as transações financeiras. Filtre por tipo, estado, evento ou período. Cada transação pode ter documentos anexados."
ecras: [transacoes]
perfis: []
fontes: [src/pages/Transactions.tsx, src/components/TransactionFormModal.tsx]
termos: [transação, IBAN]
```

Clique em 'Nova Transação'. Escolha o tipo (Receita ou Despesa), associe a um evento (se aplicável), selecione fornecedor e categoria do Plano de Contas. Defina o valor, data e vencimento. Pode anexar documentos (faturas, contratos).

Antes de confirmar uma despesa, o sistema apresenta um painel de verificação com os dados bancários do fornecedor (NIF, IBAN, SWIFT/BIC) para garantir que a conta de destino está correta.

## Ciclo de vida da transação

```ajuda
id: transacoes.ciclo-de-vida
tooltip: "Aguardando → transação registada, pendente de aprovação."
ecras: [transacoes]
perfis: []
fontes: [src/pages/Transactions.tsx, src/components/TransactionEditModal.tsx]
termos: [Aguardando, Aprovada, Paga]
```

Aguardando → transação registada, pendente de aprovação. Pode ser editada e eliminada livremente.

Aprovada (A Pagar) → validada por um gestor/admin. Eliminação e alteração de valores financeiros restritas a administradores. Exceção: transações vinculadas ao BP permitem edição de montante e IVA por qualquer utilizador autenticado até à liquidação.

Paga (Liquidada) → pagamento registado. Bloqueio de eliminação. A permissão de aprovação permite ajustes administrativos nos campos, sujeitos às restrições específicas da transação. Sem permissão de aprovação, podem ser alterados 'Especificação', 'Fornecedor', 'Nº Fatura' e 'Método de Pagamento', entre outros campos permitidos; os valores e o evento ficam bloqueados, e os gestores podem alterar a categoria.

Auto-aprovação: transações para eventos 'Ativos' são automaticamente aprovadas se a categoria e tipo constarem nas previsões do BP do evento.

## Aprovação em lote (Bulk Approval)

```ajuda
id: transacoes.aprovacao-em-lote
tooltip: "Administradores e Gestores podem aprovar múltiplas transações simultaneamente na página de transações."
ecras: [transacoes]
perfis: []
fontes: [src/pages/Transactions.tsx]
termos: [Aprovação em lote, split]
```

Administradores e Gestores podem aprovar múltiplas transações simultaneamente na página de transações. Selecione as transações desejadas e clique em 'Aprovar Selecionadas'. O sistema filtra automaticamente apenas as que estão em estado 'Aguardando' ou 'Atrasada', ignorando as já aprovadas ou pagas. A aprovação em lote propaga-se para transações split (rateios) vinculadas.

## Reembolsos a funcionários

```ajuda
id: transacoes.reembolsos
tooltip: "Quando um funcionário paga uma despesa do próprio bolso, active o toggle '💰 Marcar como Reembolso' no formulário."
ecras: [transacoes]
perfis: []
fontes: [src/components/TransactionFormModal.tsx, src/pages/Reimbursements.tsx]
termos: [Reembolsos, funcionários]
```

Quando um funcionário paga uma despesa do próprio bolso, active o toggle '💰 Marcar como Reembolso' no formulário. O campo de conta bancária desaparece (a empresa não desembolsou) e surge o campo 'Reembolsar a' para indicar o funcionário.

As transações de reembolso podem ser agrupadas em Notas de Reembolso (módulo dedicado) para processamento em lote. Veja a secção ['Notas de Reembolso'](/ajuda?artigo=notas-de-reembolso#reembolsos.o-que-sao) para mais detalhes.

## Despesas pagas por sócio

```ajuda
id: transacoes.pago-por-socio
tooltip: "O registo de um valor pago por sócio faz-se no modal de pagamento ou no painel 'Despesas Pagas por Sócios' do evento."
ecras: [transacoes]
perfis: []
fontes: [src/components/TransactionFormModal.tsx, src/components/PartnerPaidExpensesPanel.tsx]
termos: [pago por sócio, encontro de contas]
```

O registo de um valor pago por sócio faz-se no modal de pagamento ou no painel 'Despesas Pagas por Sócios' do evento. O vínculo pode ser aprovado ou ficar pendente de aprovação; quando aprovado, a despesa fica paga e vinculada ao sócio para efeitos de encontro de contas. Veja a secção de Eventos → ['Despesas Pagas por Sócio'](/ajuda?artigo=eventos#eventos.pago-por-socio) para mais detalhes.

## Pagamentos parciais

```ajuda
id: transacoes.pagamentos-parciais
tooltip: "O sistema permite liquidações parciais."
ecras: [transacoes]
perfis: []
fontes: [src/components/TransactionPaymentModal.tsx]
termos: [Pagamentos parciais, Valor Pago]
```

O sistema permite liquidações parciais. Ao registar pagamento, informe o valor efetivamente pago. O campo 'Valor Pago' é atualizado progressivamente até atingir o valor total da transação. O campo de data de pagamento suporta seleção via calendário e digitação manual (dd/mm/aaaa).

## Transferências entre contas

```ajuda
id: transacoes.transferencias
tooltip: "Use 'Transferência entre Contas' para mover saldo."
ecras: [transacoes]
perfis: []
fontes: [src/components/TransferFormModal.tsx]
termos: [Transferência, contas]
```

Use 'Transferência entre Contas' para mover saldo. O sistema cria automaticamente duas transações: uma saída na conta de origem e uma entrada na conta de destino, mantendo o histórico completo.

## Documentos anexados e classificação contábil

```ajuda
id: transacoes.documentos
tooltip: "Cada transação pode ter múltiplos documentos (faturas, recibos, contratos)."
ecras: [transacoes]
perfis: []
fontes: [src/components/TransactionDocumentsModal.tsx]
termos: [Documentos, contábil]
```

Cada transação pode ter múltiplos documentos (faturas, recibos, contratos). Clique no ícone de documentos na linha da transação para ver, adicionar ou remover ficheiros. A eliminação de documentos usa atualizações otimistas para feedback imediato.

Documentos contábeis — Ao fazer upload, marque a checkbox 'Documento contábil' para documentos fiscais (faturas, notas fiscais, recibos, notas de crédito/débito, comprovativos de pagamento bancário). Use o ícone de informação (ℹ️) junto da checkbox para ver exemplos.

NÃO marcar como contábil: propostas, contratos, riders técnicos, e-mails ou screenshots internos.

Esta classificação é essencial para a exportação contábil e para o relatório de pendências documentais.

## Auditoria de transações

```ajuda
id: transacoes.auditoria
tooltip: "Todas as alterações em transações são registadas no log de auditoria (transaction_audit_log), incluindo o valor antigo, o novo valor, o campo alterado e o autor da modificação."
ecras: [transacoes]
perfis: []
fontes: [src/components/TransactionAuditModal.tsx]
termos: [Auditoria, transaction_audit_log]
```

Todas as alterações em transações são registadas no log de auditoria (`transaction_audit_log`), incluindo o valor antigo, o novo valor, o campo alterado e o autor da modificação. O histórico é visível na interface clicando no ícone de auditoria na linha da transação.

## Listas de Pagamento (nas transações)

```ajuda
id: transacoes.listas-pagamento
tooltip: "Dentro do módulo de transações, pode criar Listas de Pagamento diretamente."
ecras: [transacoes]
perfis: []
fontes: [src/pages/Transactions.tsx, src/components/PaymentListsTab.tsx]
termos: [Listas de Pagamento, aprovação]
```

Dentro do módulo de transações, pode criar Listas de Pagamento diretamente. Selecione transações aprovadas e agrupe-as numa lista para processamento em lote. As listas passam por um fluxo de aprovação (Rascunho → Submetida → Aprovada) antes de serem executadas.
