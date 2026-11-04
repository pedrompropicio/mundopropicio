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
tooltip: "Portal de acesso dedicado para parceiros/sócios aos eventos autorizados. A consulta do BP e das transações depende de permissões; a edição do BP exige autorização para o evento e permissão para editar BP aprovado, fora da vista Master e da inspeção de administrador."
ecras: [parceiro.o-que-e]
perfis: []
fontes: [src/pages/PartnerPortal.tsx, src/components/PartnerLayout.tsx]
termos: [Portal do Parceiro, Parceiro]
```

Utilizadores com perfil 'Parceiro' acedem a um layout dedicado para consultar eventos autorizados; a edição do BP exige autorização para o evento e permissão para editar BP aprovado, fora da vista Master e da inspeção de administrador. O portal mostra apenas os eventos a que o parceiro foi autorizado pelo administrador.

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
tooltip: "Ao abrir um evento autorizado, o parceiro pode consultar Bilhetes; os separadores Business Plan e Transações dependem das respetivas permissões."
ecras: [parceiro.informacoes]
perfis: []
fontes: [src/pages/PartnerEventDetail.tsx]
termos: [read-only, Bilhetes, Transações]
```

Ao abrir um evento autorizado, o parceiro pode consultar Bilhetes; os separadores Business Plan e Transações dependem das respetivas permissões. A vista de administrador é read-only.

- Bilhetes — zonas, lotes, vendas
- Business Plan — receitas e despesas previstas, se tiver permissão para consultar o BP
- Transações — movimentos financeiros do evento, se tiver permissão para consultar as transações do portal

A consulta é a regra; a edição do BP pode ser autorizada para um evento específico, com permissão para editar BP aprovado, fora da vista Master e da inspeção de administrador.
