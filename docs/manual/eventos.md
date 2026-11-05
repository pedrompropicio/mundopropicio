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
tooltip: "Para eventos do tipo 'Múltiplos Dias', o assistente permite configurar cidades (eventos Split), datas extra e múltiplas sessões."
ecras: [eventos]
perfis: []
fontes: [src/pages/Events.tsx]
termos: [wizard, cidades, sessões]
```

Para eventos do tipo 'Múltiplos Dias', o assistente permite configurar cidades (eventos Split), datas extra e múltiplas sessões. Ao finalizar o wizard, o Master é criado primeiro e os eventos Split são criados em operações sucessivas; uma falha pode deixar a estrutura parcialmente criada.

## Despesas Pagas por Sócio ('Pago por Sócio')

```ajuda
id: eventos.pago-por-socio
tooltip: "Para registar uma despesa paga por um sócio/parceiro, associe-a ao sócio no modal de pagamento ou no painel 'Despesas Pagas por Sócios' do evento."
ecras: [eventos]
perfis: []
fontes: [src/components/TransactionFormModal.tsx, src/components/PartnerPaidExpensesPanel.tsx]
termos: [Pago por Sócio, despesas]
```

Para registar uma despesa paga por um sócio/parceiro, associe-a ao sócio no modal de pagamento ou no painel 'Despesas Pagas por Sócios' do evento.

Na liquidação por sócio:

- A liquidação por sócio fica sem conta financeira da empresa
- Selecione o sócio que pagou
- O vínculo pode ficar aprovado ou pendente de aprovação; quando aprovado, a transação é marcada como paga
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
