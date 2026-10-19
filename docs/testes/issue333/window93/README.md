# #333 tarefa93 — janela de análise restrita (sanitizado)

Estado: PRONTO, janela NÃO aberta. Nenhuma chamada ao provedor feita.

- data-entry implantado com ANALYSIS_ENABLED/ANALYSIS_PROVIDER_REVIEWED=true; continua fechado na prática porque o controlo está rev1 closed e a pilot8 não tem linhas. Sem auth → 401.
- Botão "Analisar documento" envia o pedido autorizado (texto fixo, < 2000 bytes).
- Abertura (controller, como postgres, com o Pedro no modal): uma linha pilot8 `preparation` de 600 s para a identidade ERP existente/empresa MP + `responsible_333('reopen', 1, NULL, <hash da decisão>)`. `assistant_create` nunca.
- Fecho (sempre): `responsible_333('close', rev atual, claim atual)`, pilot8 desligada/expirada (linha mantida como trilha), constantes de volta a false + deploy de data-entry. Se ficar incerto: não fazer confer/reopen.
- Hash da decisão: sha256("issue333-tarefa93-window-v1:<sha do PDF>") = c016043a…3db48.
- Identidade e conteúdo do documento não ficam no repositório.
