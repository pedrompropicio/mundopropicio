---
capitulo: portal-do-parceiro
titulo: Portal do Parceiro
modulo: erp
atualizado: 2026-11-04
perfis: []
rotas: [/parceiro]
fontes: [src/pages/PartnerPortal.tsx, src/components/PartnerLayout.tsx, src/pages/PartnerEventDetail.tsx]
---

## O que é o Portal do Parceiro

```ajuda
id: parceiro.o-que-e
tooltip: "Portal de acesso dedicado para parceiros/sócios. Mostra apenas os eventos autorizados pelo administrador, com dados somente leitura (bilhetes, BP e transações)."
ecras: [parceiro.o-que-e]
perfis: []
fontes: [src/pages/PartnerPortal.tsx, src/components/PartnerLayout.tsx]
termos: [Portal do Parceiro, Parceiro]
```

Utilizadores com perfil 'Parceiro' acedem a um layout simplificado e dedicado, sem acesso ao sistema principal. O portal mostra apenas os eventos a que o parceiro foi autorizado pelo administrador.

## Acesso a eventos

```ajuda
id: parceiro.acesso
tooltip: "O administrador controla quais eventos cada parceiro pode ver através da tabela de acessos (partner_event_access)."
ecras: [parceiro.acesso]
perfis: []
fontes: [src/pages/PartnerPortal.tsx, src/pages/PartnerEventDetail.tsx]
termos: [partner_event_access, Master, Split]
```

O administrador controla quais eventos cada parceiro pode ver através da tabela de acessos (`partner_event_access`). Os acessos podem ser ativados ou desativados a qualquer momento.

Para eventos multi-cidade (Turnês), pode-se autorizar o evento Master (acesso a tudo) ou apenas eventos Split específicos.

## Informações disponíveis

```ajuda
id: parceiro.informacoes
tooltip: "Ao clicar num evento autorizado, o parceiro tem acesso read-only a 3 abas:"
ecras: [parceiro.informacoes]
perfis: []
fontes: [src/pages/PartnerEventDetail.tsx]
termos: [read-only, Bilhetes, Transações]
```

Ao clicar num evento autorizado, o parceiro tem acesso read-only a 3 abas:

- Bilhetes — zonas, lotes, vendas
- Business Plan — receitas e despesas previstas
- Transações — movimentos financeiros do evento

Todos os dados são somente leitura — nenhum botão de criar, editar ou eliminar.
