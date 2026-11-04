---
capitulo: interface
titulo: Interface
modulo: erp
atualizado: 2026-11-04
perfis: []
rotas: []
fontes: [src/contexts/ThemeContext.tsx, src/components/AppSidebar.tsx, src/components/GlobalSearch.tsx, src/components/HelpTooltip.tsx, src/components/help/HelpFloatingButton.tsx, src/hooks/useInactivityTimeout.ts]
---

## Tema claro e escuro

```ajuda
id: interface.tema
tooltip: "Alterne entre o modo claro e escuro clicando no ícone de sol/lua (☀️/🌙) no canto superior direito do cabeçalho."
ecras: [erp]
perfis: []
fontes: [src/contexts/ThemeContext.tsx, src/components/AppSidebar.tsx]
termos: [claro, escuro]
```

Alterne entre o modo claro e escuro clicando no ícone de sol/lua (☀️/🌙) no canto superior direito do cabeçalho. A preferência é guardada automaticamente no navegador.

## Pesquisa global

```ajuda
id: interface.pesquisa
tooltip: "Use o ícone de lupa no cabeçalho para pesquisar rapidamente por eventos, transações, fornecedores ou cotações em qualquer parte do sistema."
ecras: [erp]
perfis: []
fontes: [src/components/GlobalSearch.tsx]
termos: [pesquisa, lupa]
```

Use o ícone de lupa no cabeçalho para pesquisar rapidamente por eventos, transações, fornecedores ou cotações em qualquer parte do sistema.

## Ajuda contextual

```ajuda
id: interface.ajuda-contextual
tooltip: "Todas as secções, botões e campos importantes do sistema possuem ícones de ajuda (?) que explicam a funcionalidade ao passar o rato (desktop) ou ao tocar (mobile)."
ecras: [erp]
perfis: []
fontes: [src/components/HelpTooltip.tsx, src/components/help/HelpFloatingButton.tsx]
termos: [ajuda, manual]
```

Todas as secções, botões e campos importantes do sistema possuem ícones de ajuda (?) que explicam a funcionalidade ao passar o rato (desktop) ou ao tocar (mobile). O botão flutuante (📖) no canto inferior direito abre o manual na secção relevante à página atual.

## Timeout por inatividade

```ajuda
id: interface.timeout
tooltip: "Por segurança, o sistema encerra a sessão automaticamente após 30 minutos de inatividade."
ecras: [erp]
perfis: []
fontes: [src/hooks/useInactivityTimeout.ts]
termos: [30 minutos, inatividade]
```

Por segurança, o sistema encerra a sessão automaticamente após 30 minutos de inatividade. Será redirecionado para a página de login.
