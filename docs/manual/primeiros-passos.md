---
capitulo: primeiros-passos
titulo: Primeiros Passos
modulo: erp
atualizado: 2026-11-04
perfis: []
rotas: [/erp]
fontes: [src/pages/Index.tsx, src/pages/UserManagement.tsx, src/contexts/AuthContext.tsx, src/components/AppSidebar.tsx, src/components/GlobalSearch.tsx]
---

## Visão geral do sistema

```ajuda
id: primeiros-passos.visao-geral
tooltip: "Visão geral do estado financeiro da empresa. Acompanhe receitas, despesas, saldo e os próximos compromissos."
ecras: [erp]
perfis: []
fontes: [src/pages/Index.tsx]
termos: [Dashboard, gestão]
```

O sistema é uma plataforma de gestão financeira e operacional para empresas de entretenimento e eventos. Permite gerir eventos, transações financeiras, fornecedores, bilheteiras e gerar relatórios detalhados. O Dashboard apresenta um resumo de indicadores-chave, facilitando o acompanhamento da saúde financeira.

## Perfis de utilizador

```ajuda
id: primeiros-passos.perfis
tooltip: "Existem 6 perfis: Admin (acesso total), Gerente (gestão operacional e financeira), Editor (registo de dados com restrições de edição), Viewer (apenas consulta), User (perfil base) e Parceiro (acesso read-only a eventos autorizados via Portal do Parceiro)."
ecras: [admin/utilizadores]
perfis: []
fontes: [src/pages/UserManagement.tsx, src/contexts/AuthContext.tsx]
termos: [perfis, Admin, permissões]
```

Existem 6 perfis: Admin (acesso total), Gerente (gestão operacional e financeira), Editor (registo de dados com restrições de edição), Viewer (apenas consulta), User (perfil base) e Parceiro (acesso read-only a eventos autorizados via Portal do Parceiro). Cada perfil tem permissões pré-definidas que podem ser personalizadas por utilizador na secção [Admin > Utilizadores](/ajuda?artigo=administracao#administracao.utilizadores).

## Navegação

```ajuda
id: primeiros-passos.navegacao
tooltip: "O menu lateral (sidebar) dá acesso a todas as secções."
ecras: [erp]
perfis: []
fontes: [src/components/AppSidebar.tsx, src/components/GlobalSearch.tsx, src/App.tsx]
termos: [sidebar, lupa]
```

O menu lateral (sidebar) dá acesso a todas as secções. No desktop, o menu mostra ícones e, em ecrãs largos, texto; no mobile, abre num painel com ícones e texto. Use a pesquisa global (lupa no cabeçalho) para encontrar rapidamente eventos, transações ou fornecedores.
