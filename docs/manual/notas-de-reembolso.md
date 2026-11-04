---
capitulo: notas-de-reembolso
titulo: Notas de Reembolso
modulo: erp
atualizado: 2026-11-04
perfis: []
rotas: [/reembolsos]
fontes: [src/pages/Reimbursements.tsx, src/components/ReimbursementNoteFormModal.tsx, src/components/ReimbursementNoteDetail.tsx, src/components/TransactionFormModal.tsx]
---

## O que são Notas de Reembolso

```ajuda
id: reembolsos.o-que-sao
tooltip: "Notas de Reembolso permitem agrupar despesas pagas do bolso de um funcionário e processá-las num único pagamento. Crie a nota, adicione despesas marcadas como 'Reembolso', aprove (todas devem ter fatura contábil) e pague. O sistema gera automaticamente a transação de pagamento."
ecras: [reembolsos]
perfis: []
fontes: [src/pages/Reimbursements.tsx, src/components/ReimbursementNoteFormModal.tsx]
termos: [Reembolso, funcionário, R-001/2026]
```

As Notas de Reembolso permitem agrupar despesas pagas do bolso de um funcionário e processá-las num único pagamento. O sistema gera automaticamente um código sequencial (ex: R-001/2026) para cada nota.

## Fluxo completo

```ajuda
id: reembolsos.fluxo
tooltip: "1. Crie despesas marcadas como 'Reembolso' no formulário de transações (toggle '💰 Marcar como Reembolso'), indicando o nome do funcionário."
ecras: [reembolsos.detalhe]
perfis: []
fontes: [src/components/TransactionFormModal.tsx, src/components/ReimbursementNoteFormModal.tsx, src/components/ReimbursementNoteDetail.tsx]
termos: [despesas, pagar]
```

1. Crie despesas marcadas como 'Reembolso' no formulário de transações (toggle '💰 Marcar como Reembolso'), indicando o nome do funcionário.

2. Antes de guardar a despesa, selecione ou crie uma Nota de Reembolso no formulário de transações; a vinculação à nota é automática, sem conta financeira associada.

3. Cada item deve ter obrigatoriamente um documento contábil (fatura, recibo) anexado.

4. Aprove a nota (operação em lote que aprova apenas as despesas vinculadas em estado pendente).

5. Use 'Gerar Transação para Pagamento' para criar uma transação aprovada, sem conta financeira e excluída do resultado; a nota passa a 'Aguarda Pagamento'. Liquide a transação no fluxo normal de pagamentos, escolhendo então a conta bancária; a nota e os itens passam automaticamente a pagos.

6. A nota pode ser exportada em PDF com o detalhamento de todos os itens.

## Regras e restrições

```ajuda
id: reembolsos.regras
tooltip: "• A aprovação requer que todos os itens tenham um documento contábil (is_accounting: true) anexado."
ecras: [reembolsos.detalhe]
perfis: []
fontes: [src/components/ReimbursementNoteDetail.tsx, src/pages/Reimbursements.tsx]
termos: [aprovação, documento contábil]
```

- A aprovação requer que todos os itens tenham um documento contábil (`is_accounting: true`) anexado.

- A aprovação propaga o estado 'Aprovado' apenas para as transações vinculadas em estado pendente.

- A geração do pagamento cria uma transação aprovada, sem conta financeira e excluída do resultado, e coloca a nota em 'Aguarda Pagamento'; a liquidação faz-se no fluxo normal de pagamentos e marca a nota e os itens como pagos.

- Os estados disponíveis são: Rascunho, Aprovada, Aguarda Pagamento e Paga.
