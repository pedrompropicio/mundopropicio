---
capitulo: contas-de-movimentacao
titulo: Contas de Movimentação
modulo: erp
atualizado: 2026-11-04
perfis: []
rotas: []
fontes: [src/pages/FinancialAccounts.tsx, src/hooks/useAccountBalanceCards.ts, src/components/AccountAccessModal.tsx, src/components/FinancialOperationsTab.tsx]
---

## O que são contas de movimentação

```ajuda
id: contas.o-que-sao
tooltip: "Representam onde o dinheiro está: contas bancárias, caixas, bilheteiras, cartões."
ecras: [contas]
perfis: []
fontes: [src/pages/FinancialAccounts.tsx, src/hooks/useAccountBalanceCards.ts]
termos: [saldo, contas bancárias]
```

Representam onde o dinheiro está: contas bancárias, caixas, bilheteiras, cartões. Os saldos são calculados no servidor, separando caixa (contas bancárias, caixas e cartões pré-pagos), retido em bilheteiras (com fórmula própria) e acertos em curso. Os casos 'Não controlado' e 'Sem permissão' não são apresentados como saldo zero.

## Controlo de acesso por conta

```ajuda
id: contas.acesso
tooltip: "Cada conta pode ter visibilidade restrita."
ecras: [contas.acesso]
perfis: []
fontes: [src/components/AccountAccessModal.tsx, src/pages/FinancialAccounts.tsx]
termos: [acesso, visibilidade]
```

Cada conta pode ter visibilidade restrita. Na configuração da conta, defina quais utilizadores têm acesso. Utilizadores sem permissão para consultar o saldo veem o nome da conta e 'Sem permissão' no saldo. Administradores veem sempre todas as contas.

## Operações Financeiras (Grupo 10)

```ajuda
id: contas.operacoes-financeiras
tooltip: "O módulo de Operações Financeiras, integrado na página de Contas, permite registar movimentos não operacionais (taxas bancárias, juros, parcelas de empréstimo/financiamento)."
ecras: [contas.operacoes]
perfis: []
fontes: [src/components/FinancialOperationsTab.tsx]
termos: [Grupo 10, Operações Financeiras]
```

O módulo de Operações Financeiras, integrado na página de Contas, permite registar movimentos não operacionais (taxas bancárias, juros, parcelas de empréstimo/financiamento). O formulário prioriza a seleção da conta financeira e utiliza sugestões automáticas (autocomplete) para tipos comuns. As operações são criadas com estado 'Aprovado' por padrão e suportam a criação de modelos recorrentes.
