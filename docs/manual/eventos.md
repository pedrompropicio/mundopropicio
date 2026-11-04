---
capitulo: eventos
titulo: Eventos
modulo: erp
atualizado: 2026-11-04
perfis: []
rotas: []
fontes: [src/pages/Events.tsx, src/components/EventEditModal.tsx, src/components/TransactionFormModal.tsx, src/components/PartnerPaidExpensesPanel.tsx, src/components/EventTicketing.tsx]
---

## Criar um evento

```ajuda
id: eventos.criar
tooltip: "Lista de todos os eventos. Aqui pode criar, editar e acompanhar o estado de cada evento, desde o planeamento até ao fecho."
ecras: [eventos]
perfis: []
fontes: [src/pages/Events.tsx]
termos: [Criar, evento]
```

Clique em 'Novo Evento' na listagem. Preencha o nome, data, local e tipo (Simples, Festival ou Múltiplos Dias/Turnê). Eventos iniciam no estado 'Planeamento'. Após preencher e aprovar o Business Plan (BP), o evento pode avançar para 'Confirmado' e depois 'Ativo'.

## Estados do evento

```ajuda
id: eventos.estados
tooltip: "Planeamento → estado inicial, permite editar tudo livremente."
ecras: [eventos]
perfis: []
fontes: [src/components/EventEditModal.tsx, src/pages/Events.tsx]
termos: [lockdown, Split]
```

Planeamento → estado inicial, permite editar tudo livremente.

Confirmado → o BP foi aprovado e o evento está agendado.

Ativo → o evento está em curso ou próximo de acontecer.

Concluído → evento finalizado. Impõe um bloqueio total (lockdown): não é possível alterar ou incluir bilhetes, transações, despesas, cachê, sociedade ou custos extras. A reabertura de um evento concluído é uma operação exclusiva de Administradores.

Propagação em Turnês: a reabertura ou conclusão de um evento Master (Tour) propaga o estado automaticamente para todos os eventos Split, enquanto alterações num evento Split permanecem isoladas.

## Tipos de evento

```ajuda
id: eventos.tipos
tooltip: "Simples: evento com uma única data."
ecras: [eventos]
perfis: []
fontes: [src/pages/Events.tsx]
termos: [Simples, Festival, Turnê]
```

Simples: evento com uma única data.

Festival: evento com múltiplas atrações na mesma data/local.

Múltiplos Dias (Turnê): mesmo evento repetido em diferentes datas/cidades. Permite gerir cada data individualmente mantendo a estrutura do evento Master. O período exibido na listagem é calculado considerando o intervalo total de todas as datas (principal e extras) de todos os eventos Split.

## Wizard de criação (Turnês)

```ajuda
id: eventos.wizard
tooltip: "Para eventos do tipo 'Múltiplos Dias', o sistema oferece um assistente avançado que permite configurar a hierarquia completa de cidades (eventos Split), datas extra e múltiplas sessões num único fluxo atómico."
ecras: [eventos]
perfis: []
fontes: [src/pages/Events.tsx]
termos: [wizard, cidades, sessões]
```

Para eventos do tipo 'Múltiplos Dias', o sistema oferece um assistente avançado que permite configurar a hierarquia completa de cidades (eventos Split), datas extra e múltiplas sessões num único fluxo atómico. Ao finalizar o wizard, toda a estrutura é criada de uma só vez.

## Despesas Pagas por Sócio ('Pago por Sócio')

```ajuda
id: eventos.pago-por-socio
tooltip: "Quando um sócio/parceiro paga uma despesa diretamente do seu bolso (sem usar contas da empresa), utilize o toggle '🤝 Pago por Sócio' no formulário de transação."
ecras: [eventos]
perfis: []
fontes: [src/components/TransactionFormModal.tsx, src/components/PartnerPaidExpensesPanel.tsx]
termos: [Pago por Sócio, despesas]
```

Quando um sócio/parceiro paga uma despesa diretamente do seu bolso (sem usar contas da empresa), utilize o toggle '🤝 Pago por Sócio' no formulário de transação. O toggle aparece automaticamente quando o evento selecionado tem sócios.

Ao ativar:

- O campo 'Conta Destino' desaparece (não há movimentação em contas da empresa)
- Aparece o seletor 'Sócio que pagou' para indicar qual parceiro pagou
- A despesa é criada normalmente e segue o ciclo de aprovação padrão (Aguardando → Aprovada → Paga)
- A despesa pode ser editada e eliminada segundo as mesmas regras de qualquer transação
- Na listagem de transações, a despesa mostra um badge '🤝 Sócio' com tooltip indicando o nome do parceiro
- A despesa aparece no separador 'Desp. Sócios' do evento, agrupada por sócio
- No 'Fecho Parceiros', o total de despesas pagas pelo sócio é integrado no encontro de contas final

O módulo 'Desp. Sócios' também permite vincular manualmente despesas existentes a um sócio, ou desvincular associações.

## Bilheteira do evento

```ajuda
id: eventos.bilheteira
tooltip: "Configure zonas (ex: Pista, Camarote) e lotes de bilhetes com preços e capacidades."
ecras: [eventos]
perfis: []
fontes: [src/components/EventTicketing.tsx]
termos: [Bilheteira, zonas, lotes]
```

Configure zonas (ex: Pista, Camarote) e lotes de bilhetes com preços e capacidades. O sistema calcula automaticamente a receita bruta, IVA e receita líquida. Associe bilheteiras (pontos de venda) para acompanhar vendas por canal.
