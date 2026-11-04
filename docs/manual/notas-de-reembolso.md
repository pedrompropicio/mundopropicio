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

2. No módulo Notas de Reembolso, crie uma nova nota indicando o funcionário e notas adicionais.

3. Adicione as despesas de reembolso à nota. Cada item deve ter obrigatoriamente um documento contábil (fatura, recibo) anexado.

4. Aprove a nota (operação em lote que aprova todas as despesas vinculadas).

5. Ao pagar, o sistema gera automaticamente uma transação bancária vinculada à nota, garantindo rastreabilidade bidirecional.

6. A nota pode ser exportada em PDF com o detalhamento de todos os itens.

## Regras e restrições

```ajuda
id: reembolsos.regras
tooltip: "• A aprovação requer que todos os itens tenham um documento contábil (is_accounting: true) anexado."
ecras: [reembolsos.detalhe]
perfis: []
fontes: [src/components/ReimbursementNoteDetail.tsx]
termos: [aprovação, documento contábil]
```

- A aprovação requer que todos os itens tenham um documento contábil (`is_accounting: true`) anexado.

- A aprovação propaga o estado 'Aprovado' para todas as transações vinculadas.

- A liquidação gera automaticamente uma transação bancária na conta selecionada.

- Os estados disponíveis são: Rascunho, Aprovada e Paga.
