# #333 — diagnóstico pontual do bloqueio após upload

1. Reproduzir Novo lote → upload → edição por clique, teclado e seleção com o modal React real e respostas locais fictícias, sem acesso Cloud.
2. Conferir campos desativados, foco, camadas e captura de cliques em Chromium e WebKit, se disponível. Comparar com o estado «Lote aberto» observado por Pedro.
3. Somente se houver causa comprovada, aplicar correção mínima preservando autorização e isolamento; manter uma regressão de interação e executar os testes relevantes.
4. Entregar evidência e limite da verificação. Se não reproduzir, fornecer uma única verificação simples no Safari, sem console ou novo lote.

## Limites
Sem reativação, fatura, alteração de permissões, login, DDL, deploy ou Publish. Baseline76, sessão/documento e histórico permanecem intactos. Fases1–7 concluídas,8 parcial,9–18 pendentes; #323/DECISIONS/AGENTS preservados.

## Detalhes técnicos
Usar o adaptador injetável existente e os componentes/CSS reais. Inspecionar disabled/inert/aria, pointer-events, z-index, elementFromPoint e activeElement; não atribuir ao Safari uma causa baseada somente em testes Chromium.